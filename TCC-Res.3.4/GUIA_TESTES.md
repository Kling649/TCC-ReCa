# Guia de edição e testes — TCC.api

Instruções para editar e testar a API no VSCode (Windows), com as ferramentas já instaladas.

## Inicialização

1. Clonar o repositório: `git clone https://github.com/Kling649/TCC-Res.git` (privado, exige login) e abrir a pasta `TCC 2.0/TCC 1.9 - IMPLEMENTADO/TCC.api` no VSCode.

2. Preparar o banco (uma vez só, nesta ordem): rodar o `recadb.sql` original no MySQL e depois o `recadb_implementacao.sql`. O segundo cria as colunas `tipo_usuario`, `matricula`, `dia_refeicao`, `avaliacao` e as tabelas `CardapioSemanal` e `Avisos` que a API exige.

3. Configurar a senha: no `appsettings.json`, trocar `password=COLOQUE_SUA_SENHA` pela senha real do root. Alternativa sem editar arquivo: definir a variável de ambiente `MYSQL_PASSWORD` antes de rodar.

4. Rodar a API no terminal do VSCode:

```powershell
dotnet restore
dotnet run
```

O F5 também funciona com a extensão C# instalada. A API sobe em `http://localhost:5117`.

5. Abrir o site em `http://localhost:5117/index.html` (o frontend é servido pela própria API, não use live server).

6. Diagnóstico rápido no navegador:
- `http://localhost:5117/api/teste` — responde se a API está no ar (não toca no banco).
- `http://localhost:5117/api/health` — responde se o banco está conectado e, se não estiver, diz o motivo.

## Significado dos erros possíveis

- `dotnet` não é reconhecido / falha de compilação: o .NET SDK 10 não está instalado. Instalar do site da Microsoft.
- "Não foi possível conectar ao MariaDB" (500): o serviço do MySQL/MariaDB está parado ou fora de `localhost:3306`. Iniciar o serviço.
- "Falha de autenticação no banco de dados" (500): usuário ou senha errados no `appsettings.json` (ou `MYSQL_PASSWORD`).
- "O banco recadb não existe" (500): o `recadb.sql` não foi executado.
- "A estrutura do banco está desatualizada" (500): falta rodar o `recadb_implementacao.sql` — o banco não tem as tabelas/colunas novas.
- "Erro interno do servidor" (500): erro fora dos casos acima. Ler o console do `dotnet run`, que mostra o stack trace completo em Development.
- 400: campos obrigatórios ausentes ou inválidos no JSON enviado.
- 401: login com e-mail ou senha errados.
- 409: e-mail já cadastrado no sistema.
- 404: prato, comentário ou aviso com o id informado não existe.
- Porta 5117 em uso: já existe outra instância da API rodando. Fechar o processo anterior.

## Onde editar o quê

- Endpoints da API (cadastro, login, cardápio, pratos, comentários, restrições, avisos): `TCC.api/Program.cs`.
- Estrutura das entidades e dos JSONs de requisição: `TCC.api/Models/Entities.cs`.
- Mapeamento entre classes e tabelas/colunas do banco: `TCC.api/Data/AppDbContext.cs`.
- Páginas do site: pasta `TCC.api/wwwroot` (HTML, script.js, style.css).
- Mensagens de erro do banco: função `TraduzirErroBanco` no final do `Program.cs`.

Depois de qualquer edição: `Ctrl+C` na API rodando e `dotnet run` novamente.
