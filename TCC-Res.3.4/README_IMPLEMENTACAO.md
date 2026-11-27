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

## Observação de segurança
As senhas são armazenadas como hash SHA-256 nesta versão escolar. Para produção, o ideal é usar um mecanismo dedicado de password hashing com salt e políticas de segurança mais completas.
