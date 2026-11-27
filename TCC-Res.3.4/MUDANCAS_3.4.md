# TCC-Res 3.4 — registro de mudanças

Este documento lista o que mudou em relação ao **TCC-Res 3.3** (e ao projeto **RECA**, que tem o mesmo site), como as mudanças foram feitas, o que foi testado e o que ainda não foi verificado.

---

## 1. Resumo

| Área | 3.3 (e RECA) | 3.4 |
|---|---|---|
| Plataforma | ASP.NET (C#) + MySQL, rodando em um computador | Cloudflare Workers (JavaScript) + D1 (SQLite) |
| Frontend | HTML com Bootstrap e 2 folhas de estilo sobrepostas | HTML, 1 folha de estilo e scripts organizados por página |
| Páginas | 20 arquivos, navegação diferente em cada uma | 18 páginas, com um único menu gerado pelo mesmo código |
| Segurança | rotas administrativas abertas; HTML sem escape; senha no `appsettings.json` | perfis de acesso; escape em todo texto; senhas com PBKDF2 e sal; sem senha no código |
| Contagem | "Agendadas / Registradas / Diferença" acumulava todas as semanas | Declarados / Efetivados / Excedente / Faltas, por semana, com botões grandes |
| Testes | nenhum automatizado | 57 testes da API + testes de navegador (fluxos e varredura) |

---

## 2. Preparativos e como as melhorias foram feitas

### 2.1. Análise dos dois zips

1. Extraí os dois arquivos e comparei a estrutura. O `TCC-Res_3_3.zip` tem três versões dentro (a raiz, a `wwwroot` que é servida e uma pasta `TCC 2.0 / 1.9` antiga). O `RECA.zip` tem a mesma estrutura.
2. Comparei as pastas `wwwroot` por soma de verificação (MD5): **são idênticas** nos dois zips. O frontend servido é o mesmo.
3. Comparei o backend (`Program.cs`, `Entities.cs`, `AppDbContext.cs`): os modelos são idênticos. A única diferença de regra está no `POST /api/cardapio` do RECA, que **substitui o prato do dia** a cada cadastro. Não adotei essa regra porque o editor de cardápio do próprio frontend trabalha com vários pratos por dia (ver seção 6).
4. Li a documentação (`TCC_3.0_GUIA.md`, `MODIFICACOES.md`, `README_IMPLEMENTACAO.md`, `GUIA_TESTES.md`) e conferi se cada item existia no código. Os documentos citam `/api/health`, `MYSQL_PASSWORD` e `TraduzirErroBanco`, mas **essas partes não estão no código** entregue.
5. Capturei o sistema atual em desktop e celular para comparar depois. No celular, o menu era cortado e o carrossel ocupava quase toda a tela.

### 2.2. Decisão de plataforma

O **ASP.NET não roda no Cloudflare Workers**, que executa JavaScript (ou WebAssembly). Por isso a API foi reescrita em JavaScript, mantendo os nomes de tabelas, colunas e endpoints. Não foi possível compilar o C# neste ambiente, então ele não foi reaproveitado.

### 2.3. Validação do banco antes do código

Antes de escrever a API, executei as migrações no SQLite e testei as restrições (`CHECK`, `UNIQUE`, chave estrangeira com exclusão em cascata). Só depois usei o esquema no código. O D1 usa SQLite, então o comportamento é o mesmo.

### 2.4. Verificação com o código real

- **Testes da API (`npm test`):** rodam o próprio Worker (`src/index.js`) sobre um SQLite real, com um adaptador que imita a API do D1 (`tests/d1-local.mjs`).
- **Servidor local (`npm run dev:local`):** serve o site e a API juntos, como o Cloudflare faz.
- **Navegador (Chromium + Playwright):** abri todas as páginas em desktop (1366 px) e celular (390 px). Depois executei os fluxos completos de aluno e nutricionista, e revisei capturas de tela.

### 2.5. Problemas encontrados durante a construção e corrigidos

Foram encontrados por revisão de código, testes ou navegador:

| # | Problema | Como foi corrigido |
|---|---|---|
| 1 | Endpoint de formulários administrativos tinha uma expressão antiga e incorreta no resumo | Substituída por contagem global, independente do filtro |
| 2 | `POST /api/cardapio` (adicionar prato a um dia) não tinha sido portado | Restaurado, com teste |
| 3 | `POST /api/interesses` não tinha sido portado | Restaurado, com teste |
| 4 | A tela de contagem enviava `semana=null` na primeira carga | A primeira carga usa a semana atual do servidor |
| 5 | Na edição de prato, salvar sem escolher nova foto **apagava a foto atual** | A foto existente é mantida quando nada novo é informado |
| 6 | Na contagem, a mensagem "Informe a quantidade" aparecia em vermelho ao abrir a tela | Mostra uma dica neutra; o erro aparece só ao tentar salvar |
| 7 | Etiquetas de estado dos dias quebravam no meio da palavra ("Pende / nte") | Rótulos curtos: Feito, Falta, Aberto |
| 8 | Contagem com **506 px de largura** em tela de 390 px (rolagem horizontal) | Grade com `minmax(0, 1fr)` |
| 9 | Tabela de presenças no celular: rodapé estreito e cabeçalho aparecendo | Regras de bloco ajustadas para `tfoot`; cabeçalho oculto |
| 10 | Filtro de dias na janela de comentários cortado à direita | Os chips quebram de linha |
| 11 | Testes de navegador com verificações fracas (`or True`) | Substituídas por verificações estritas (valores gravados no servidor) |
| 12 | Testes dependentes do dia da semana e do estado do banco | Usam o dia realmente agendado e partem de banco limpo |

---

## 3. Banco de dados

O banco foi adaptado de MySQL para SQLite (D1). **Nomes de tabelas e colunas foram mantidos**. As alterações estão marcadas com "NOVO" ou "ALTERADO" em `migrations/0001_schema.sql`.

| Tabela | Alteração |
|---|---|
| `Users` | `tipo_usuario` com `CHECK` (aluno ou nutricionista). Datas em texto com fuso de Brasília. |
| `Pratos` | Sem mudança de estrutura. |
| `RestricoesAlimentares` | **NOVA COLUNA** `categoria` (Alergia, Intolerância, Preferência, Médica, Outra) e `ativo` (desativar sem apagar). Catálogo com 9 itens padronizados. |
| `UserRestricoes` | Mantida. Passa a refletir a resposta mais recente do formulário do aluno logado. |
| `InteressePratos` | Mantida, com endpoint `POST /api/interesses`. |
| `Comentarios` | `dia_refeicao` e `avaliacao` **obrigatórios**, com `CHECK` (5 dias válidos; nota de 1 a 5). Texto limitado a 1000 caracteres. `id_user` vira `NULL` se o usuário for apagado (comentário anônimo, em vez de apagar o comentário). |
| `CardapioSemanal` | **NOVO** `UNIQUE (dia, id_prato)`: o mesmo prato não se repete no dia. |
| `Avisos` | **NOVA COLUNA** `tipo` (Informativo, Importante, Urgente). |
| `AvisosVisualizados` | Mantida. |
| `PresencasRegistradas` | **NOVA COLUNA** `semana`. A chave única passa de `(dia)` para `(semana, dia)`. Sem isso, os efetivados de uma semana sobrescreviam os de outra. |
| `PresencasMarcadas` | **NOVA COLUNA** `semana`. A chave única passa de `(user_id, dia, data_marcacao)` para `(user_id, dia, semana)`. Antes, os declarados de todas as semanas eram somados. |
| `FormulariosRestricao` | `possui_restricao` como 0/1. `tipo_restricao` passa a guardar um resumo legível com os nomes do catálogo. |
| `FormularioRestricoes` | **NOVA TABELA** (ligação entre formulário e catálogo). |
| `Sessoes` | **NOVA TABELA**. Antes, as sessões ficavam só na memória da API e se perdiam ao reiniciar. |

**Dados iniciais (`0002_seed.sql`):** catálogo de restrições, os 12 pratos do projeto original mais o "Arroz" (que o cardápio de demonstração usava, mas nunca tinha sido cadastrado), o cardápio de demonstração e um aviso de boas-vindas.

**Dados do MySQL não são migrados automaticamente.** O D1 começa vazio.

---

## 4. Contagem de presenças (regra nova)

| Termo | Significado | Cálculo |
|---|---|---|
| **Declarados** | alunos que agendaram aquele dia na semana | contagem de `PresencasMarcadas` na semana |
| **Efetivados** | pessoas que almoçaram de fato | valor informado pela nutricionista |
| **Excedente** | efetivados acima dos declarados | `max(0, efetivados − declarados)` |
| **Faltas** | declarados que não vieram | `max(0, declarados − efetivados)` |

- Excedente e faltas só aparecem **depois que o dia é registrado**. Antes disso, aparece "—".
- As médias consideram apenas os dias registrados. Os declarados consideram os 5 dias.
- O agendamento vale para a **semana atual** (segunda a sexta, fuso de Brasília). Um dia que já passou não pode mais ser agendado.
- Aos sábados e domingos, os agendamentos da semana ficam encerrados até a segunda-feira.
- A nutricionista pode ver semanas anteriores pelas setas.

**Tela da contagem:** escolhe o dia pelos botões, vê os declarados em destaque e ajusta os efetivados com botões de 84 px (+ e −), digitação direta, atalhos (+5, +10, igual aos declarados, zerar) e prévia imediata de excedente ou faltas. Pede confirmação quando há declarados e a diferença é de pelo menos 10 pessoas **e** de 30% ou mais dos declarados. Tem "Salvar e ir para o próximo dia" e aviso se houver alteração não salva.

---

## 5. Mudanças por funcionalidade

### 5.1. Comentários
- Mostram os **3 mais recentes** com média geral e total.
- Quando há mais, aparece **"Ver mais comentários (N)"**, que abre uma janela com **todos**, filtro por dia da semana (com contador em cada dia) e **"Carregar mais"** em blocos de 10.
- Formulário com botões de estrela (1 a 5), contador de caracteres e validação visível.
- Na área da nutricionista: resumo geral, **média por dia**, filtro por dia, nome e matrícula de quem comentou (ou "Anônimo"), e carregamento por página.

### 5.2. Avisos
- Tipo de aviso (Informativo, Importante, Urgente), com cores diferentes.
- Expiração por opção: não expira, 1, 3 ou 7 dias, ou até sexta-feira. Avisos expirados saem da lista pública e continuam na área administrativa como "Expirado".
- Aluno vê etiqueta **Novo**, marca um aviso como lido ou **todos de uma vez**, e o contador do menu é atualizado na hora.
- Nutricionista publica e encerra avisos (encerrar é exclusão lógica: o registro continua no banco).

### 5.3. Restrições alimentares
- Catálogo padronizado (9 itens em 4 categorias). Nutricionista pode cadastrar novos tipos, que aparecem no formulário na categoria escolhida.
- Formulário com botões Sim/Não, opções agrupadas por categoria e campo de detalhes. Não deixa enviar sem marcar uma opção ou descrever a restrição.
- **Um registro ativo por aluno**: a resposta mais recente aparece na lista, com o número de envios.
- Área da nutricionista: totais (com e sem restrição), **alunos por restrição** (clicar filtra) e lista com etiquetas.

### 5.4. Cardápio
- **Editor novo:** em vez da lista de seleção múltipla (difícil no celular), cada prato é um botão que se marca com um toque. Sobremesa por dia. Barra fixa com "Salvar cardápio da semana". Aviso de alterações não salvas.
- Salvar troca **os dias inteiros** em uma única operação (transação), sem deixar o cardápio pela metade.
- O aluno vê o cardápio com carrossel de fotos (deslize no celular, pausa ao passar o mouse), cards por dia e ingredientes/preparo recolhíveis.

### 5.5. Pratos
- Lista com editar e excluir. Cadastro e edição no mesmo formulário.
- Foto por **arquivo** (quando o R2 estiver configurado) ou por **link https://**.
- Opção de incluir o prato em um dia do cardápio ao cadastrar.

### 5.6. Painel da nutricionista (novo)
- Cinco indicadores: declarados, efetivados, comentários (com média), restrições e avisos ativos.
- **Pendências:** lista os dias já encerrados que ainda não foram contados.
- Cardápio da semana resumido e atalhos para as ações mais usadas.

### 5.7. Navegação e visual
- Um único menu, gerado pelo mesmo código em todas as páginas. No celular, vira um botão **Menu** que abre a lista em coluna.
- Mesma paleta do 3.3 (laranja `#F47920`, bege, Poppins, cantos de 14 px).
- Campos com fonte de 16 px (o iPhone não amplia a tela ao tocar).
- Botões com pelo menos 44 px de área de toque.
- Tabelas viram blocos no celular.
- Página de login/cadastro com o mesmo estilo; cadastro de nutricionista exige o código.

---

## 6. Decisões tomadas (podem ser revistas)

1. **Vários pratos por dia.** O RECA substitui o prato do dia a cada cadastro; mantive a lista, porque o carrossel, os cards e o editor do próprio sistema trabalham com vários pratos. Se a equipe preferir **um prato principal por dia**, a mudança fica em `POST /api/cardapio` e no editor.
2. **Semana de segunda a sexta** para a contagem, com agendamentos encerrados no fim de cada dia.
3. **Fotos:** sem R2, o admin usa link `https://`. Não guardei imagens no banco.
4. **Excluir usuário** deixa o comentário anônimo, em vez de apagá-lo.
5. **Restrições:** o formulário anônimo continua permitido (como no 3.3). Um aluno logado tem o perfil de restrições atualizado a cada envio.

---

## 7. Mudanças na API

| Endereço (3.3) | Situação no 3.4 |
|---|---|
| `GET /api/teste` | mantido |
| `POST /api/nutricionistas` | mantido; código inválido responde **403** (antes, 400) |
| `POST /api/alunos` | mantido |
| `POST /api/login` | mantido; também devolve `expiraEm` |
| `POST /api/logout` | mantido; o token agora vai no cabeçalho `Authorization` |
| `GET /api/sessao` | mantido; devolve o usuário; exige o token |
| `GET /api/cardapio/semana` | **resposta mudou**: `{semana, rotulo, dias}`, com `encerrado` e `data` em cada dia |
| `PUT /api/cardapio/semana` | **novo**: salva os dias de uma vez |
| `DELETE /api/cardapio/semana` | mantido |
| `POST /api/cardapio` | restaurado (adiciona um prato a um dia) |
| `DELETE /api/cardapio/{id}` | **removido** (o `PUT` da semana cobre o caso) |
| `GET /api/pratos`, `POST`, `PUT /{id}`, `DELETE /{id}` | mantidos |
| `POST /api/upload/prato` | mantido; sem R2 responde **503** com orientação |
| `GET /api/comentarios` | **resposta mudou**: paginada `{itens, total, pagina, tamanho, temMais}`; não expõe mais `idUser` |
| `GET /api/comentarios/resumo` | **novo** |
| `POST /api/comentarios` | mantido; agora exige dia e nota válidos |
| `GET /api/comentarios/admin` | **resposta mudou**: paginada, com nome, matrícula e resumo |
| `GET /api/restricoes` | **resposta mudou**: objetos com `categoria` |
| `POST /api/restricoes` | mantido, mas só para a nutricionista; cria apenas o tipo de restrição (não vincula a aluno) |
| `POST /api/formularios/restricao` | **corpo mudou**: `restricoes` (ids do catálogo) e `descricao`; sem `tipoRestricao` |
| `GET /api/formularios/restricao/admin` | **resposta mudou**: paginada, um por aluno, com resumo |
| `GET /api/avisos` | mantido; campos em camelCase e com `tipo` |
| `GET /api/avisos/usuario/{id}` e `GET /api/avisos/nao-lidos/{id}` | **substituídos** por `GET /api/avisos/meus` (lista + `naoLidos`) |
| `POST /api/avisos/{id}/visualizar` | mantido |
| `POST /api/avisos/visualizar-todos` | **novo** |
| `GET /api/avisos/admin` | **novo** |
| `POST /api/avisos` | **corpo mudou**: `tipo` e `expiracao` (antes `diasExpiracao`) |
| `DELETE /api/avisos/{id}` | mantido |
| `GET /api/presencas/semana` | **substituído** por `GET /api/presencas/resumo?semana=` |
| `POST /api/presencas/registradas` | mantido; aceita `semana` (padrão: a atual) |
| `GET /api/presencas/minhas/{idUser}` | **substituído** por `GET /api/presencas/minhas` (usa a sessão) |
| `POST /api/presencas/marcar` | mantido; o aluno é identificado pela sessão, não pelo corpo |
| `DELETE /api/presencas/marcar/{idUser}/{dia}` | **substituído** por `DELETE /api/presencas/marcar/{dia}` |
| `POST /api/interesses` | restaurado |
| `GET /api/health` | **novo** (verifica o banco) |
| `GET /api/admin/painel` | **novo** (indicadores) |

**Autorização:** todas as rotas administrativas exigem sessão de nutricionista (403 para aluno, 401 sem login). No 3.3, elas eram abertas a qualquer pessoa.

---

## 8. Mudanças nas páginas

| Página do 3.3 | Página no 3.4 |
|---|---|
| `index.html` | `index.html` (carrossel próprio, sem Bootstrap) |
| `comentarios.html` | `comentarios.html` |
| `formularios.html` | `formularios.html` |
| `avisos.html` | `avisos.html` |
| `contato.html` | `contato.html` (dados de exemplo a trocar) |
| `login.html` | `login.html` |
| `CadastroDeConta.html` | `cadastro.html` |
| `sair.html` | `sair.html` |
| `index_admin.html` | `admin/index.html` (painel) |
| `EditarCardapio_admin.html` | `admin/cardapio.html` |
| `Pratos_admin.html` | `admin/pratos.html` |
| `AddPrato_admin.html` | `admin/prato.html` (cadastro e edição) |
| `registro_admin.html` (inserir presenças) | `admin/contagem.html` |
| `Presenca_admin.html` | `admin/presencas.html` |
| `comentarios_admin.html` | `admin/comentarios.html` |
| `formularios_admin.html` | `admin/formularios.html` |
| `Aviso_admin.html` + `avisos_admin.html` | `admin/avisos.html` (um só) |
| `contato_admin.html` | `admin/contato.html` |

Arquivos duplicados da raiz do projeto antigo (cópias desatualizadas) não foram trazidos.

---

## 9. Segurança

- **Autorização por perfil** no servidor (não só na tela).
- **Escape de HTML** em todo texto que vem do banco. No 3.3, avisos, nomes e formulários eram inseridos sem escape.
- **Links de foto** só aceitam `https://` ou arquivos do próprio sistema. No 3.3, qualquer texto era aceito.
- **Fotos** são conferidas pelos bytes do arquivo (JPG, PNG, WEBP), não só pelo nome.
- **Senhas:** PBKDF2-SHA256 com sal (100 mil iterações, o máximo do Cloudflare). Hashes antigos SHA-256 (sem sal) continuam aceitos e são atualizados no próximo login.
- **Comparação do código de nutricionista** em tempo constante.
- **Sessões** gravadas no banco, com validade de 8 horas. Expiram e podem ser encerradas no logout.
- **Segredo:** o código da nutricionista fica no Cloudflare (`wrangler secret`) ou no `.dev.vars` local, fora do repositório.
- **Senha do MySQL:** o 3.3 gravava a senha real no `appsettings.json`. Recomendo **trocar essa senha**, porque ela já foi para o zip e para o repositório. Esta versão não usa esse arquivo.

---

## 10. Testes realizados

| Tipo | O que cobre | Resultado |
|---|---|---|
| Testes da API (`npm test`) | 56 testes: cadastro, login, perfis, cardápio, pratos, comentários, restrições, avisos, contagem (incluindo excedente e faltas), interesses, datas | **56 de 56 passaram** |
| Varredura de páginas | 18 páginas em desktop e celular: erros de JavaScript e rolagem horizontal | **34 de 34** sem problemas (última rodada) |
| Fluxos de aluno e nutricionista | 47 verificações: agendar, comentar, filtrar, formulário, avisos, editar cardápio, cadastrar prato, contagem com confirmação, publicar aviso, proteção da área administrativa | **47 de 47** no desktop e **47 de 47** no celular, com zero erros de JavaScript |
| Migrações | esquema, restrições, unicidade, cascata | verificados no SQLite 3.45 |

Os testes de navegador estão em `tests/navegador/` (`fluxos.py` e `varredura.py`) e podem ser repetidos com `python tests/navegador/fluxos.py desktop`.

---

## 11. O que NÃO foi verificado (limites)

Este ambiente não tem acesso à internet, então alguns pontos não foram testados no Cloudflare de verdade:

1. **Publicação no Cloudflare** (`wrangler deploy`), a configuração `wrangler.jsonc` e as migrações no D1 remoto. Foram testadas com SQLite local, que é o mesmo mecanismo, mas não com o serviço.
2. **Assets do Cloudflare** (`run_worker_first`): o servidor local simula esse comportamento.
3. **Upload de fotos no R2:** testado com um R2 simulado.
4. **Tempo de CPU do login** no plano gratuito do Workers. O PBKDF2 com 100 mil iterações pode ser pesado nesse plano. Se o login falhar com erro de CPU, a saída é o plano pago ou reduzir as iterações.
5. **Acessibilidade:** não passei por uma auditoria completa com leitor de tela.
6. **Dados de contato** na página "Contato" são de exemplo.
7. **Sem limite de tentativas no login** e **sem recuperação de senha**.
8. **Migração dos dados antigos do MySQL** não foi feita. Se for preciso, é um script à parte.

---

## 12. Como testar a diferença visualmente

- Desktop: a navegação é uma barra única; a contagem e as presenças usam tabelas e cards lado a lado.
- Celular: o menu fica em **Menu**; a contagem usa botões grandes; as tabelas viram blocos com rótulos.

Passo a passo de instalação e publicação: ver `README.md`.
