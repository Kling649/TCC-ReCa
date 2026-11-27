# Registro de modificações — commit f8980e3

Commit: "Corrige erro 500: middleware de exceções, /api/health e senha via MYSQL_PASSWORD"
Estatísticas: 79 linhas adicionadas, 2 removidas, em 2 arquivos. Nenhum arquivo foi criado, movido ou apagado.

## TCC.api/Program.cs (+61/-1)

Cinco mudanças:

1. `using System.Data.Common;` adicionado no topo, necessário para capturar `DbException`.

2. Após a leitura da connection string, novo bloco que lê a variável de ambiente `MYSQL_PASSWORD` e sobrescreve a senha do `appsettings.json` (via regex em `password=...`). Permite configurar a senha sem editar arquivo e sem correr risco de commitar a senha real.

3. Após `UseStaticFiles`, middleware global de tratamento de exceções (`app.Use`): `DbException` vira resposta JSON com os campos `mensagem` e `dica` (traduzidos pela função `TraduzirErroBanco`); qualquer outra exceção vira resposta JSON genérica. Ambas são registradas no console da API. Antes, toda exceção virava HTTP 500 sem corpo nenhum, o que escondia a causa.

4. Novo endpoint `GET /api/health`: testa a conexão com o banco (`CanConnectAsync`) e retorna `ok`, `inacessível` ou a causa traduzida do erro. Serve para diagnosticar o ambiente em segundos pelo navegador.

5. Nova função estática `TraduzirErroBanco` no final do arquivo, que traduz os erros do MySQL em mensagens com instrução: `access denied`/`authentication` → conferir senha; `unknown database` → executar recadb.sql; `unknown column`/`doesn't exist` → executar recadb_implementacao.sql; `unable to connect`/`connection refused`/`timeout` → verificar serviço do MariaDB; demais casos → consultar console.

Nenhum endpoint existente foi alterado: nutricionistas, alunos, login, cardápio/semana, pratos (GET/POST/PUT/DELETE), comentários, restrições, interesses e avisos continuam idênticos, assim como `HashPassword` e `DiaOrdem`.

## README_IMPLEMENTACAO.md (+18/-1)

Três adições:

1. Na seção "2. Senha do MySQL", parágrafo sobre a alternativa da variável de ambiente `MYSQL_PASSWORD`.
2. `GET /api/health` na lista de endpoints.
3. Nova seção "Diagnóstico do erro HTTP 500" antes da "Observação de segurança", com a ordem de investigação (teste → health → console) e as três causas comuns.

## Arquivos não alterados

AppDbContext.cs, Entities.cs, appsettings.json, launchSettings.json, TCC.api.csproj, TCC.api.http, recadb_implementacao.sql, todos os HTML, o script.js, o style.css e as imagens permanecem exatamente como estavam no commit inicial (169e83a).

## Como validar as mudanças

1. `dotnet run` dentro de `TCC.api`.
2. Abrir `http://localhost:5117/api/health` — deve retornar `{"status":"ok","banco":"conectado"}` com o banco no ar.
3. Parar o MySQL e recarregar o `/api/health` — deve retornar a mensagem traduzida indicando o serviço fora do ar, em vez de 500 sem explicação.
