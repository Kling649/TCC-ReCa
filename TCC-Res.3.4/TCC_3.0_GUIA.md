# Atualizações TCC 3.0

## O que foi alterado
- O botão/ação do aluno agora usa o texto **Agendar**.
- Na tela administrativa de presenças, a linha anteriormente chamada **Marcadas** passa a aparecer como **Agendadas**.
- A área de avisos abaixo do cardápio foi removida da página inicial.
- Foi criada a página pública `avisos.html` e a página administrativa `avisos_admin.html`.
- O sistema registra quais avisos cada aluno visualizou e mostra um contador de avisos não lidos no menu.
- A página pública de comentários mostra três comentários por vez e permite carregar mais.
- O cadastro de nutricionista exige um código de autorização validado pela API.
- Foram adicionados ajustes de navegação e layout para telas pequenas.

## Configuração obrigatória do código de nutricionista

O código secreto não fica gravado no HTML nem no JavaScript. Ele é lido pela API a partir da variável de ambiente `TCC_CODIGO_NUTRICIONISTA`.

No PowerShell do VS Code, antes de iniciar o projeto, defina um código escolhido pela equipe:

```powershell
$env:TCC_CODIGO_NUTRICIONISTA = "ESCOLHA_UM_CODIGO_PRIVADO"
dotnet run
```

Troque `ESCOLHA_UM_CODIGO_PRIVADO` por um código forte e mantenha-o somente com a equipe responsável. A variável vale para aquele terminal; se abrir outro terminal, será necessário defini-la novamente.

Se a variável não estiver configurada, o cadastro de nutricionista será recusado. O cadastro de alunos continua funcionando normalmente.

## Banco de dados e preservação dos registros

Na inicialização, a API cria automaticamente a tabela `AvisosVisualizados`, caso ela ainda não exista. Essa tabela guarda a relação entre aluno e aviso visualizado. Ela não apaga nem recria as tabelas existentes e não exige apagar os dados do banco.

A definição da tabela também foi acrescentada ao arquivo `recadb_implementacao.sql` para documentação. **Não é necessário executar novamente o script SQL inteiro**; a API cria a tabela nova ao iniciar.

## Como executar

1. Abra a pasta `TCC.api` no VS Code.
2. Confira se o `appsettings.json` contém a senha local correta do MySQL. A cópia distribuída do projeto usa um texto de exemplo no lugar da senha real.
3. No terminal PowerShell, defina `TCC_CODIGO_NUTRICIONISTA` conforme acima.
4. Execute `dotnet run`.
5. Acesse o endereço local informado pelo terminal.

## Observações importantes para os testes

- Teste o cadastro de aluno e confirme que continua funcionando.
- Teste o cadastro de nutricionista com código incorreto e correto.
- Entre com uma conta de aluno, publique um aviso pela área administrativa e confirme se o contador aparece.
- Abra a página de avisos, marque um aviso como lido e confira se a contagem diminui.
- Teste os comentários com quatro ou mais registros para verificar o botão **Ver mais**.
- Confira a página inicial e a página de avisos em uma tela de celular.

O projeto já possuía rotas administrativas sem autenticação geral. O código de autorização implementado protege especificamente a criação de novas contas de nutricionista; ele não substitui uma etapa futura de proteção completa de todas as páginas e rotas administrativas.

## Limitação de validação desta entrega

O JavaScript foi verificado quanto à sintaxe. Não foi possível executar `dotnet build` neste ambiente porque o SDK do .NET não está instalado aqui. Portanto, a compilação e os testes integrados finais precisam ser feitos no notebook da equipe antes de substituir a versão de trabalho.
