using Microsoft.EntityFrameworkCore;
using TCC.api.Data;
using TCC.api.Models;
using System.Security.Cryptography;
using System.Text;
using System.Data.Common;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection não configurada.");


// Permite definir a senha do MySQL por variável de ambiente (MYSQL_PASSWORD),
// sem precisar editar o appsettings.json em cada máquina do grupo.
var senhaEnv = Environment.GetEnvironmentVariable("MYSQL_PASSWORD");
if (!string.IsNullOrEmpty(senhaEnv))
    connectionString = System.Text.RegularExpressions.Regex.Replace(connectionString, "password=[^;]*", "password=" + senhaEnv);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseMySQL(connectionString));

var app = builder.Build();
app.UseCors("frontend");
app.UseDefaultFiles();
app.UseStaticFiles();

// Middleware global de tratamento de erros: evita HTTP 500 genérico.
// Traduz erros comuns do MySQL em mensagens claras; o frontend exibe o campo "mensagem".
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (DbException ex)
    {
        var (mensagem, dica) = TraduzirErroBanco(ex);
        app.Logger.LogError(ex, "Erro de banco em {Path}", context.Request.Path);
        await Results.Json(new { mensagem, dica }, statusCode: 500).ExecuteAsync(context);
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Erro inesperado em {Path}", context.Request.Path);
        await Results.Json(new { mensagem = "Erro interno do servidor.", dica = "Consulte o console da API para detalhes." }, statusCode: 500).ExecuteAsync(context);
    }
});

app.MapGet("/api/teste", () => Results.Ok(new { mensagem = "API do TCC funcionando!" }));

// Diagnóstico rápido: mostra se a API está no ar e se o banco responde.
app.MapGet("/api/health", async (AppDbContext db) =>
{
    try
    {
        var conectado = await db.Database.CanConnectAsync();
        return conectado
            ? Results.Ok(new { status = "ok", banco = "conectado" })
            : Results.Json(new { status = "erro", banco = "inacessível" }, statusCode: 500);
    }
    catch (DbException ex)
    {
        var (mensagem, dica) = TraduzirErroBanco(ex);
        return Results.Json(new { status = "erro", mensagem, dica }, statusCode: 500);
    }
});

app.MapPost("/api/nutricionistas", async (CadastroRequest request, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Nome) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Senha))
        return Results.BadRequest(new { mensagem = "Nome, e-mail e senha são obrigatórios." });

    if (await db.Usuarios.AnyAsync(x => x.Email == request.Email))
        return Results.Conflict(new { mensagem = "Este e-mail já está cadastrado." });

    var usuario = new Usuario
    {
        Nome = request.Nome.Trim(),
        Email = request.Email.Trim().ToLowerInvariant(),
        Senha = HashPassword(request.Senha),
        TipoUsuario = "nutricionista",
        Matricula = null,
        DataCadastro = DateTime.Now
    };

    db.Usuarios.Add(usuario);
    await db.SaveChangesAsync();

    return Results.Created($"/api/usuarios/{usuario.Id}", new { usuario.Id, usuario.Nome, usuario.Email, usuario.TipoUsuario });
});

app.MapPost("/api/alunos", async (CadastroRequest request, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Nome) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Senha) || string.IsNullOrWhiteSpace(request.Matricula))
        return Results.BadRequest(new { mensagem = "Nome, matrícula, e-mail e senha são obrigatórios." });

    if (await db.Usuarios.AnyAsync(x => x.Email == request.Email))
        return Results.Conflict(new { mensagem = "Este e-mail já está cadastrado." });

    var usuario = new Usuario
    {
        Nome = request.Nome.Trim(),
        Email = request.Email.Trim().ToLowerInvariant(),
        Senha = HashPassword(request.Senha),
        TipoUsuario = "aluno",
        Matricula = request.Matricula.Trim(),
        DataCadastro = DateTime.Now
    };

    db.Usuarios.Add(usuario);
    await db.SaveChangesAsync();

    return Results.Created($"/api/usuarios/{usuario.Id}", new { usuario.Id, usuario.Nome, usuario.Email, usuario.Matricula, usuario.TipoUsuario });
});

app.MapPost("/api/login", async (LoginRequest request, AppDbContext db) =>
{
    var email = request.Email.Trim().ToLowerInvariant();
    var usuario = await db.Usuarios.FirstOrDefaultAsync(x => x.Email == email);

    if (usuario is null || usuario.Senha != HashPassword(request.Senha))
        return Results.Unauthorized();

    return Results.Ok(new
    {
        token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)),
        usuario = new { usuario.Id, usuario.Nome, usuario.Email, usuario.Matricula, usuario.TipoUsuario }
    });
});

app.MapGet("/api/cardapio/semana", async (AppDbContext db) =>
{
    var rows = await db.Cardapio.Join(db.Pratos, c => c.IdPrato, p => p.Id, (c, p) => new { c.Dia, c.Sobremesa, Prato = new { p.Id, p.Nome, p.Descricao, p.Ingredientes, p.ModoPreparo } }).ToListAsync();
    var result = rows.GroupBy(x => x.Dia).OrderBy(x => DiaOrdem(x.Key)).Select(g => new { nome = g.Key, sobremesa = g.First().Sobremesa, pratos = g.Select(x => x.Prato).ToList() });
    return Results.Ok(result);
});

app.MapGet("/api/pratos", async (AppDbContext db) => Results.Ok(await db.Pratos.OrderBy(x => x.Nome).ToListAsync()));

app.MapPost("/api/pratos", async (PratoRequest request, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Nome)) return Results.BadRequest(new { mensagem = "O nome do prato é obrigatório." });
    var prato = new Prato { Nome = request.Nome.Trim(), Descricao = request.Descricao, Ingredientes = request.Ingredientes, ModoPreparo = request.ModoPreparo, TempoPreparo = request.TempoPreparo, DataCadastro = DateTime.Now };
    db.Pratos.Add(prato);
    await db.SaveChangesAsync();
    return Results.Created($"/api/pratos/{prato.Id}", prato);
});

app.MapPut("/api/pratos/{id:int}", async (int id, PratoRequest request, AppDbContext db) =>
{
    var prato = await db.Pratos.FindAsync(id);
    if (prato is null) return Results.NotFound();
    prato.Nome = request.Nome.Trim();
    prato.Descricao = request.Descricao;
    prato.Ingredientes = request.Ingredientes;
    prato.ModoPreparo = request.ModoPreparo;
    prato.TempoPreparo = request.TempoPreparo;
    await db.SaveChangesAsync();
    return Results.Ok(prato);
});

app.MapDelete("/api/pratos/{id:int}", async (int id, AppDbContext db) =>
{
    var prato = await db.Pratos.FindAsync(id);
    if (prato is null) return Results.NotFound();
    db.Pratos.Remove(prato);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.MapPost("/api/cardapio", async (CardapioRequest request, AppDbContext db) =>
{
    if (!await db.Pratos.AnyAsync(p => p.Id == request.IdPrato)) return Results.BadRequest(new { mensagem = "Prato não encontrado." });
    var item = new CardapioSemanal { Dia = request.Dia, IdPrato = request.IdPrato, Sobremesa = request.Sobremesa };
    db.Cardapio.Add(item);
    await db.SaveChangesAsync();
    return Results.Created($"/api/cardapio/{item.Id}", item);
});

app.MapDelete("/api/cardapio/semana", async (AppDbContext db) =>
{
    var items = await db.Cardapio.ToListAsync();
    db.Cardapio.RemoveRange(items);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.MapDelete("/api/cardapio/{id:int}", async (int id, AppDbContext db) =>
{
    var item = await db.Cardapio.FindAsync(id);
    if (item is null) return Results.NotFound();
    db.Cardapio.Remove(item);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.MapGet("/api/comentarios", async (AppDbContext db) =>
{
    var result = await db.Comentarios.OrderByDescending(x => x.DataComentario).Select(x => new { x.Id, x.IdUser, x.IdPrato, x.DiaRefeicao, x.Avaliacao, x.Texto, x.DataComentario }).ToListAsync();
    return Results.Ok(result);
});

app.MapPost("/api/comentarios", async (ComentarioRequest request, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Texto) || string.IsNullOrWhiteSpace(request.DiaRefeicao) || request.Avaliacao is < 1 or > 5)
        return Results.BadRequest(new { mensagem = "Dia, avaliação e comentário são obrigatórios." });

    var comentario = new Comentario { IdUser = request.IdUser, IdPrato = request.IdPrato, DiaRefeicao = request.DiaRefeicao, Avaliacao = request.Avaliacao, Texto = request.Texto.Trim(), DataComentario = DateTime.Now };
    db.Comentarios.Add(comentario);
    await db.SaveChangesAsync();
    return Results.Created($"/api/comentarios/{comentario.Id}", comentario);
});

app.MapGet("/api/restricoes", async (AppDbContext db) => Results.Ok(await db.Restricoes.OrderBy(x => x.Nome).ToListAsync()));

app.MapPost("/api/restricoes", async (RestricaoRequest request, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Nome)) return Results.BadRequest(new { mensagem = "Informe o tipo de restrição." });
    var restricao = await db.Restricoes.FirstOrDefaultAsync(x => x.Nome == request.Nome);
    if (restricao is null)
    {
        restricao = new RestricaoAlimentar { Nome = request.Nome.Trim(), Descricao = request.Descricao };
        db.Restricoes.Add(restricao);
        await db.SaveChangesAsync();
    }
    if (request.IdUser.HasValue && !await db.UserRestricoes.AnyAsync(x => x.IdUser == request.IdUser && x.IdRestricao == restricao.Id))
    {
        db.UserRestricoes.Add(new UserRestricao { IdUser = request.IdUser.Value, IdRestricao = restricao.Id });
        await db.SaveChangesAsync();
    }
    return Results.Ok(restricao);
});

app.MapPost("/api/interesses", async (InteresseRequest request, AppDbContext db) =>
{
    if (!await db.Interesses.AnyAsync(x => x.IdUser == request.IdUser && x.IdPrato == request.IdPrato))
    {
        db.Interesses.Add(new InteressePrato { IdUser = request.IdUser, IdPrato = request.IdPrato, DataInteresse = DateTime.Now });
        await db.SaveChangesAsync();
    }
    return Results.Ok(new { mensagem = "Interesse registrado." });
});

app.MapGet("/api/avisos", async (AppDbContext db) =>
{
    var agora = DateTime.Now;
    var result = await db.Avisos.Where(x => x.Ativo && (x.DataExpiracao == null || x.DataExpiracao > agora)).OrderByDescending(x => x.DataCriacao).ToListAsync();
    return Results.Ok(result);
});

app.MapPost("/api/avisos", async (AvisoRequest request, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Texto)) return Results.BadRequest(new { mensagem = "O aviso não pode estar vazio." });
    var aviso = new Aviso { Texto = request.Texto.Trim(), Ativo = true, DataCriacao = DateTime.Now, DataExpiracao = request.DiasExpiracao.HasValue ? DateTime.Now.AddDays(request.DiasExpiracao.Value) : null };
    db.Avisos.Add(aviso);
    await db.SaveChangesAsync();
    return Results.Created($"/api/avisos/{aviso.Id}", aviso);
});

app.MapDelete("/api/avisos/{id:int}", async (int id, AppDbContext db) =>
{
    var aviso = await db.Avisos.FindAsync(id);
    if (aviso is null) return Results.NotFound();
    aviso.Ativo = false;
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.Run();

static string HashPassword(string password)
{
    var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
    return Convert.ToHexString(bytes).ToLowerInvariant();
}

static (string mensagem, string dica) TraduzirErroBanco(DbException ex)
{
    var msg = ex.Message.ToLowerInvariant();
    if (msg.Contains("access denied") || msg.Contains("authentication"))
        return ("Falha de autenticação no banco de dados.", "Verifique a senha em TCC.api/appsettings.json (password=COLOQUE_SUA_SENHA) ou defina a variável de ambiente MYSQL_PASSWORD.");
    if (msg.Contains("unknown database"))
        return ("O banco recadb não existe no MariaDB.", "Execute o recadb.sql e depois o recadb_implementacao.sql.");
    if (msg.Contains("unknown column") || msg.Contains("doesn't exist"))
        return ("A estrutura do banco está desatualizada.", "Execute o recadb_implementacao.sql depois do recadb.sql.");
    if (msg.Contains("unable to connect") || msg.Contains("connection refused") || msg.Contains("timed out") || msg.Contains("timeout"))
        return ("Não foi possível conectar ao MariaDB.", "Verifique se o serviço do MySQL/MariaDB está rodando em localhost:3306.");
    return ("Erro de banco de dados.", "Consulte o console da API para detalhes técnicos.");
}

static int DiaOrdem(string dia) => dia.ToLowerInvariant() switch
{
    "segunda-feira" => 1,
    "terça-feira" => 2,
    "quarta-feira" => 3,
    "quinta-feira" => 4,
    "sexta-feira" => 5,
    _ => 99
};