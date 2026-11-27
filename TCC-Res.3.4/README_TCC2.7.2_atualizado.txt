TCC - versão com cadastro de pratos, dias da semana e fotos

1. Extraia a pasta TCC-Res.
2. Abra TCC-Res/TCC.api no VS Code.
3. Edite appsettings.json e substitua COLOQUE_SUA_SENHA pela senha local do MySQL (não compartilhe essa senha).
4. Confirme que o MySQL está ativo e que o banco recadb já existe. NÃO apague nem recrie o banco.
5. No terminal, dentro de TCC.api, execute: dotnet run
6. Acesse http://localhost:5117 (ou o endereço informado pelo terminal).

A tela AddPrato_admin.html permite cadastrar o prato, escolher o dia, informar ingredientes e modo de preparo e selecionar uma imagem do computador/celular. A imagem é enviada para wwwroot/uploads/pratos e o endereço é associado ao prato.
A coluna foto_url é adicionada automaticamente à tabela Pratos, sem apagar os dados existentes.
O cardápio inicial passa a carregar cinco cartões separados e o carrossel público usa a foto cadastrada para cada dia quando houver.

Importante:
- O projeto usa .NET 10 (TargetFramework net10.0).
- Esta alteração foi verificada quanto à sintaxe JavaScript, mas não foi possível executar build/integração neste ambiente.
- As rotas administrativas existentes ainda não possuem autorização robusta no servidor. Não publique o sistema na internet antes de implementar autenticação/autorização por perfil e validar os uploads.
