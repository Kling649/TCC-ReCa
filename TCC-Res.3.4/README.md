# TCC-Res 3.4 — Restaurante IFRJ Campus Pinheiral

Sistema do cardápio, comentários, avisos, restrições alimentares e contagem de presenças do restaurante.

- **Hospedagem:** Cloudflare Workers (site e API no mesmo endereço)
- **Banco:** Cloudflare D1 (SQLite)
- **Fotos dos pratos:** Cloudflare R2 (opcional; sem ele, use um link `https://` da foto)

Para o que mudou em relação ao 3.3, veja [MUDANCAS_3.4.md](MUDANCAS_3.4.md).

---

## 1. Estrutura do projeto

```
TCC-Res.3.4/
├── wrangler.jsonc          configuração do Cloudflare (banco, site, fotos)
├── package.json            scripts (dev, deploy, testes)
├── schema.sql              esquema do banco (fonte legível)
├── seed.sql                dados iniciais (fonte legível)
├── migrations/             cópias usadas pelo D1 (idênticas aos dois arquivos acima)
│   ├── 0001_schema.sql
│   └── 0002_seed.sql
├── src/                    API (roda no Cloudflare Workers)
│   ├── index.js            rotas e regras de negócio
│   └── lib/                datas (fuso de Brasília), senhas, validações, respostas
├── public/                 site (HTML, CSS, JS, imagens) — servido pelo Cloudflare
│   ├── index.html … sair.html          páginas públicas
│   ├── admin/                          área da nutricionista
│   ├── css/estilo.css
│   └── js/                             scripts de cada página + comum.js
└── tests/                  testes automatizados e servidor local
```

---

## 2. Pré-requisitos

- **Node.js 22 ou superior** (https://nodejs.org)
- Uma conta gratuita na **Cloudflare** (https://dash.cloudflare.com)
- No Windows, use o PowerShell ou o terminal do VS Code.

---

## 3. Instalação

Dentro da pasta do projeto:

```bash
npm install
```

---

## 4. Rodar no seu computador (sem conta Cloudflare)

Crie o arquivo de variáveis locais, copiando o modelo:

```bash
copy .dev.vars.example .dev.vars        (Windows)
cp .dev.vars.example .dev.vars          (Linux/macOS)
```

Abra `.dev.vars` e troque `TROQUE-ESTE-CODIGO-PRIVADO` por um código da equipe. Esse é o código que a nutricionista informa no cadastro.

Depois, rode:

```bash
npm run dev:local
```

Abra **http://localhost:8787** no navegador. O banco fica em `.dados-local/recadb.sqlite`. Para começar do zero, apague essa pasta.

> Esse modo usa o mesmo código da API e um SQLite local. Serve para testar o sistema antes de publicar.

Alternativa com o simulador oficial do Cloudflare (precisa das etapas da seção 5):

```bash
npm run dev          # http://localhost:8787 usando o D1 do Cloudflare
```

---

## 5. Publicar no Cloudflare (passo a passo)

Faça estes passos **uma vez**, na pasta do projeto.

### 5.1. Entrar na conta

```bash
npx wrangler login
```

Abre o navegador para autorizar o Wrangler.

### 5.2. Criar o banco D1

```bash
npx wrangler d1 create recadb
```

O comando mostra um bloco com `database_id`. **Copie esse código** e cole no `wrangler.jsonc`, no lugar de `SUBSTITUA-PELO-ID-DO-D1`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "recadb",
    "database_id": "cole-aqui-o-id-que-apareceu",
    "migrations_dir": "migrations"
  }
]
```

### 5.3. Criar as tabelas e os dados iniciais

```bash
npm run db:migrar:remoto
```

Isso aplica `migrations/0001_schema.sql` e `migrations/0002_seed.sql`. Se rodar de novo, o Cloudflare não repete o que já foi aplicado.

### 5.4. Definir o código da nutricionista (segredo)

```bash
npx wrangler secret put TCC_CODIGO_NUTRICIONISTA
```

Digite o código quando o Wrangler pedir. Ele fica guardado no Cloudflare e **não** aparece no código.

### 5.5. Publicar

```bash
npm run deploy
```

Ao final aparece o endereço do site, algo como `https://tcc-restaurante-ifrj.SEU-USUARIO.workers.dev`.

### 5.6. Fotos dos pratos (opcional)

Sem este passo, a nutricionista pode usar um **link `https://` da foto** no cadastro do prato, e tudo continua funcionando.

Para permitir o envio de arquivos:

```bash
npx wrangler r2 bucket create recadb-fotos
```

Depois, no `wrangler.jsonc`, remova as barras `//` da linha `r2_buckets` (e acerte a vírgula do bloco de cima, se necessário). Então rode `npm run deploy` de novo.

---

## 6. Primeiro acesso

1. Abra o site e clique em **Entrar → Cadastre-se**.
2. Crie a conta da **nutricionista**: escolha *Nutricionista* e informe o código da seção 5.4.
3. Crie as contas dos **alunos** normalmente (perfil *Aluno*, com matrícula).
4. A nutricionista entra e é levada ao **Painel**.

---

## 7. Como o sistema funciona

| Área | Quem usa | O que faz |
|---|---|---|
| Cardápio | todos | Mostra os pratos de cada dia. O aluno logado agenda presença pelo botão **Agendar**. |
| Comentários | todos | Os 3 mais recentes; **Ver mais** abre todos, com filtro por dia da semana. |
| Restrição alimentar | todos | Formulário com opções padronizadas (alergia, intolerância, preferência, condição médica). |
| Avisos | todos | Avisos com tipo (Informativo, Importante, Urgente). O aluno marca como lidos. |
| Painel | nutricionista | Indicadores da semana e contagens pendentes. |
| Editar cardápio | nutricionista | Toque nos pratos de cada dia e salve a semana. |
| Contagem | nutricionista | Escolhe o dia e informa quantas pessoas almoçaram (botões grandes). |
| Presenças | nutricionista | Tabela da semana: **Declarados**, **Efetivados**, **Excedente** e **Faltas**. |

**Regras da contagem:**
- **Declarados:** alunos que agendaram aquele dia.
- **Efetivados:** quantas pessoas almoçaram de fato.
- **Excedente:** efetivados acima dos declarados.
- **Faltas:** declarados que não vieram.

A semana vai de **segunda a sexta**. Os agendamentos valem para a semana atual e são encerrados depois de cada dia. Aos sábados e domingos, os agendamentos da semana ficam encerrados até a segunda-feira seguinte.

---

## 8. Testes

```bash
npm test
```

Roda 57 testes da API sobre um banco SQLite real: cadastro e login, perfis de acesso, cardápio, pratos, comentários, restrições, avisos, contagem de presenças e utilitários de data.

---

## 9. Endereços da API

Todos começam com `/api`. Rotas marcadas com 🔒 exigem login (cabeçalho `Authorization: Bearer <token>`).

| Método | Endereço | Acesso | Descrição |
|---|---|---|---|
| GET | `/teste`, `/health` | público | Verifica se a API e o banco respondem |
| POST | `/alunos` | público | Cadastro de aluno |
| POST | `/nutricionistas` | público (código) | Cadastro de nutricionista |
| POST | `/login` | público | Entrada; devolve o token |
| POST | `/logout` | público | Encerra a sessão |
| GET | `/sessao` | 🔒 | Dados da sessão atual |
| GET | `/cardapio/semana` | público | Cardápio da semana |
| PUT | `/cardapio/semana` | nutricionista | Salva os pratos e sobremesas dos dias |
| DELETE | `/cardapio/semana` | nutricionista | Esvazia o cardápio |
| POST | `/cardapio` | nutricionista | Inclui um prato em um dia |
| GET / POST | `/pratos` | público / nutricionista | Lista e cadastra pratos |
| PUT / DELETE | `/pratos/:id` | nutricionista | Edita e exclui prato |
| POST | `/upload/prato` | nutricionista | Envia foto (exige R2) |
| GET | `/comentarios` | público | Comentários (`?pagina=&tamanho=&dia=`) |
| GET | `/comentarios/resumo` | público | Total e médias |
| POST | `/comentarios` | público | Envia comentário |
| GET | `/comentarios/admin` | nutricionista | Comentários com autor e resumo |
| GET | `/restricoes` | público | Catálogo de restrições |
| POST | `/restricoes` | nutricionista | Cadastra nova restrição |
| POST | `/formularios/restricao` | público | Envia o formulário de restrição |
| GET | `/formularios/restricao/admin` | nutricionista | Alunos, filtro e resumo |
| GET | `/avisos` | público | Avisos ativos |
| GET | `/avisos/meus` | 🔒 | Avisos com status de leitura |
| POST | `/avisos/:id/visualizar` | aluno | Marca um aviso como lido |
| POST | `/avisos/visualizar-todos` | aluno | Marca todos como lidos |
| GET | `/avisos/admin` | nutricionista | Avisos publicados |
| POST | `/avisos` | nutricionista | Publica aviso |
| DELETE | `/avisos/:id` | nutricionista | Encerra aviso |
| GET | `/presencas/minhas` | aluno | Dias agendados pelo aluno na semana |
| POST | `/presencas/marcar` | aluno | Agenda um dia |
| DELETE | `/presencas/marcar/:dia` | aluno | Cancela o agendamento |
| GET | `/presencas/resumo?semana=` | nutricionista | Declarados, efetivados, excedente e faltas |
| POST | `/presencas/registradas` | nutricionista | Registra os efetivados de um dia |
| POST | `/interesses` | aluno | Registra interesse em um prato |
| GET | `/admin/painel` | nutricionista | Indicadores da semana |

---

## 10. Cuidados de segurança

- **Não publique o código do nutricionista.** Ele fica só no segredo do Cloudflare e no `.dev.vars` local, que **não** vai para o repositório (está no `.gitignore`).
- Todas as rotas administrativas exigem login de nutricionista. O aluno recebe `403`.
- Senhas são guardadas com PBKDF2 e sal. Senhas antigas (SHA-256 do 3.3) continuam funcionando e são atualizadas no próximo login.
- Os textos digitados são escapados antes de aparecer na tela.
- Links de foto só aceitam `https://` ou arquivos enviados pelo próprio sistema.

**Limitações conhecidas:** não há limite de tentativas no login e não há recuperação de senha. Para uso real com dados sensíveis, avalie essas duas melhorias.

---

## 11. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `npm run deploy` falha com "database_id" | não trocou o `SUBSTITUA-PELO-ID-DO-D1` | seção 5.2 |
| Cadastro de nutricionista responde 503 | segredo `TCC_CODIGO_NUTRICIONISTA` não definido | seção 5.4 |
| Cadastro de nutricionista responde 403 | código digitado diferente do segredo | confira o código |
| Upload de foto responde 503 | R2 não configurado | use o link `https://` ou siga a seção 5.6 |
| Tabelas não existem | migrações não aplicadas | seção 5.3 |
| "Sem conexão com o servidor" | sem internet ou `npm run dev:local` parado | verifique o terminal |
| Contas do sistema antigo (3.3) não aparecem | o banco D1 é novo e começa vazio | recrie as contas pelo cadastro (a migração de dados do MySQL não é automática) |
