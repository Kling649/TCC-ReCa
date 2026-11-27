# TCC 1.9 — implementação

A implementação integra o frontend HTML/CSS/JS com uma API ASP.NET Core em C# e MySQL.

## Stack
- Visual Studio Code
- C# / ASP.NET Core Web API (.NET 10)
- Entity Framework Core
- MySQL (`MySql.EntityFrameworkCore` 10.0.9)
- HTML/CSS/JavaScript

## 1. Banco de dados
1. Execute o arquivo `recadb.sql` original no MySQL.
2. Depois execute `recadb_implementacao.sql`.

O segundo script adiciona os campos necessários para tipo de usuário, matrícula, avaliação/dia dos comentários e cria `CardapioSemanal` e `Avisos`.

## 2. Senha do MySQL
Abra `TCC.api/appsettings.json` e altere:

`password=COLOQUE_SUA_SENHA`

para a senha real do usuário `root` (ou ajuste usuário/porta conforme seu MySQL).

Alternativa sem editar arquivo: defina a variável de ambiente `MYSQL_PASSWORD` antes de rodar a API. O código lê essa variável e sobrescreve a senha do `appsettings.json`.

## 3. Rodar a API
No terminal:

```powershell
cd "C:\Users\ALEXANDRE\Desktop\TCC 1.9\TCC.api"
dotnet restore
dotnet run
```

A API usa `http://localhost:5117`.

## 4. Abrir o site
Depois que a API estiver rodando, abra:

`http://localhost:5117/index.html`

Assim o frontend e a API ficam no mesmo servidor.

## Endpoints principais
- `GET /api/teste`
- `GET /api/health` (diagnóstico: mostra se o banco responde)
- `POST /api/nutricionistas`
- `POST /api/alunos`
- `POST /api/login`
- `GET /api/cardapio/semana`
- `POST /api/cardapio`
- `GET /api/pratos`
- `POST /api/pratos`
- `GET /api/comentarios`
- `POST /api/comentarios`
- `GET /api/restricoes`
- `POST /api/restricoes`
- `POST /api/interesses`
- `GET /api/avisos`
- `POST /api/avisos`
- `DELETE /api/avisos/{id}`

## Diagnóstico do erro HTTP 500

Se algum endpoint retornar 500, siga esta ordem:

1. `GET http://localhost:5117/api/teste` — se não responder, a API não está rodando.
2. `GET http://localhost:5117/api/health` — mostra se o banco responde e retorna a causa: senha errada, banco inexistente, estrutura desatualizada ou serviço fora do ar.
3. Leia o console do `dotnet run`: em Development, o stack trace completo aparece lá.

Causas mais comuns:

- Senha do MySQL não configurada no `appsettings.json` (placeholder `COLOQUE_SUA_SENHA`).
- `recadb_implementacao.sql` não executado (faltam `tipo_usuario`, `matricula`, `dia_refeicao`, `avaliacao` e as tabelas `CardapioSemanal` e `Avisos`).
- Serviço do MariaDB/MySQL parado ou fora de `localhost:3306`.

## Observação de segurança
As senhas são armazenadas como hash SHA-256 nesta versão escolar. Para produção, o ideal é usar um mecanismo dedicado de password hashing com salt e políticas de segurança mais completas.