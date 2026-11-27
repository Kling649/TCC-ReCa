using Microsoft.EntityFrameworkCore;
using TCC.api.Data;
using TCC.api.Models;
using System.Security.Cryptography;
using System.Text;
using System.Collections.Concurrent;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection não configurada.");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseMySQL(connectionString));

var app = builder.Build();
app.UseCors("frontend");
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapGet("/", () => Results.Redirect("/index.html"));

using (var escopo = app.Services.CreateScope())
{
    var dbInit = escopo.ServiceProvider.GetRequiredService<AppDbContext>();
    await dbInit.Database.ExecuteSqlRawAsync(@"CREATE TABLE IF NOT EXISTS PresencasRegistradas (
    id_presenca INT AUTO_INCREMENT PRIMARY KEY,
    dia VARCHAR(20) NOT NULL UNIQUE,
    quantidade INT NOT NULL
)");
    await dbInit.Database.ExecuteSqlRawAsync(@"CREATE TABLE IF NOT EXISTS PresencasMarcadas (
    id_marcacao INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    dia VARCHAR(20) NOT NULL,
    data_marcacao DATE NOT NULL,
    UNIQUE KEY unica_marcacao (user_id, dia, data_marcacao),
    FOREIGN KEY (user_id) REFERENCES Users(id_user)
)");
    await dbInit.Database.ExecuteSqlRawAsync(@"CREATE TABLE IF NOT EXISTS FormulariosRestricao (
    id_formulario INT AUTO_INCREMENT PRIMARY KEY,
    id_user INT NULL,
    nome VARCHAR(100) NOT NULL,
    matricula VARCHAR(30) NOT NULL,
    possui_restricao BOOLEAN NOT NULL,
    tipo_restricao VARCHAR(50) NULL,
    descricao TEXT NULL,
    data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_user) REFERENCES Users(id_user) ON DELETE SET NULL
)");
    await dbInit.Database.ExecuteSqlRawAsync(@"CREATE TABLE IF NOT EXISTS AvisosVisualizados (
    id_aviso INT NOT NULL,
    id_user INT NOT NULL,
    data_visualizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_aviso, id_user),
    CONSTRAINT fk_aviso_visualizado_aviso FOREIGN KEY (id_aviso) REFERENCES Avisos(id_aviso) ON DELETE CASCADE,
    CONSTRAINT fk_aviso_visualizado_user FOREIGN KEY (id_user) REFERENCES Users(id_user) ON DELETE CASCADE
)");
    // Garante em bancos antigos as colunas que o EF espera (sintaxe MariaDB).
    string[] ajustesColunas =
    {
        "ALTER TABLE Users ADD COLUMN IF NOT EXISTS tipo_usuario VARCHAR(30) NOT NULL DEFAULT 'aluno'",
        "ALTER TABLE Users ADD COLUMN IF NOT EXISTS matricula VARCHAR(30) NULL",
        "ALTER TABLE Comentarios ADD COLUMN IF NOT EXISTS dia_refeicao VARCHAR(30) NULL",
        "ALTER TABLE Comentarios ADD COLUMN IF NOT EXISTS avaliacao INT NULL",
        "ALTER TABLE Pratos ADD COLUMN IF NOT EXISTS descricao TEXT",
        "ALTER TABLE Pratos ADD COLUMN IF NOT EXISTS ingredientes TEXT",
        "ALTER TABLE Pratos ADD COLUMN IF NOT EXISTS modo_preparo TEXT",
        "ALTER TABLE Pratos ADD COLUMN IF NOT EXISTS tempo_preparo INT NULL",
        "ALTER TABLE CardapioSemanal ADD COLUMN IF NOT EXISTS sobremesa VARCHAR(150) NULL"
    };
    foreach (var ajuste in ajustesColunas)
    {
        try { await dbInit.Database.ExecuteSqlRawAsync(ajuste); }
        catch (Exception ex) { Console.WriteLine("Ajuste de schema ignorado: " + ajuste + " - " + ex.Message); }
    }

    // Adiciona a coluna de foto de forma compatível com MySQL e sem recriar tabelas.
    var conexao = dbInit.Database.GetDbConnection();
    var abriuConexao = conexao.State != System.Data.ConnectionState.Open;
    if (abriuConexao) await conexao.OpenAsync();
    try
    {
        await using var comando = conexao.CreateCommand();
        comando.CommandText = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Pratos' AND COLUMN_NAME = 'foto_url'";
        var existeFotoUrl = Convert.ToInt32(await comando.ExecuteScalarAsync()) > 0;
        if (!existeFotoUrl)
            await dbInit.Database.ExecuteSqlRawAsync("ALTER TABLE Pratos ADD COLUMN foto_url VARCHAR(500) NULL");
    }
    finally
    {
        if (abriuConexao) await conexao.CloseAsync();
    }
}

app.MapGet("/api/teste", () => Results.Ok(new { mensagem = "API do TCC funcionando!" }));

var Sessoes = new ConcurrentDictionary<string, (int IdUsuario, DateTime Expira)>();

app.MapPost("/api/nutricionistas", async (CadastroNutricionistaRequest request, AppDbContext db, IConfiguration config) =>
{
    if (string.IsNullOrWhiteSpace(request.Nome) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Senha))
        return Results.BadRequest(new { mensagem = "Nome, e-mail e senha são obrigatórios." });

    var codigoCorreto = config["TCC_CODIGO_NUTRICIONISTA"] ?? Environment.GetEnvironmentVariable("TCC_CODIGO_NUTRICIONISTA");
    if (string.IsNullOrWhiteSpace(codigoCorreto))
        return Results.Problem("O código de cadastro da nutricionista ainda não foi configurado no servidor.", statusCode: 503);
    if (string.IsNullOrWhiteSpace(request.CodigoAutorizacao) ||
        !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(request.CodigoAutorizacao), Encoding.UTF8.GetBytes(codigoCorreto)))
        return Results.BadRequest(new { mensagem = "Código de autorização inválido." });

    var email = request.Email.Trim().ToLowerInvariant();
    if (await db.Usuarios.AnyAsync(x => x.Email == email))
        return Results.Conflict(new { mensagem = "Este e-mail já está cadastrado." });

    var usuario = new Usuario
    {
        Nome = request.Nome.Trim(),
        Email = email,
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

    var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24));
    Sessoes[token] = (usuario.Id, DateTime.Now.AddHours(8));

    return Results.Ok(new
    {
        token,
        usuario = new { usuario.Id, usuario.Nome, usuario.Email, usuario.Matricula, usuario.TipoUsuario }
    });
});

app.MapPost("/api/logout", (LogoutRequest request) =>
{
    Sessoes.TryRemove(request.Token, out _);
    return Results.Ok(new { mensagem = "Sessão encerrada." });
});

app.MapGet("/api/sessao", (HttpContext http) =>
{
    var auth = http.Request.Headers.Authorization.ToString();
    if (!auth.StartsWith("Bearer ")) return Results.Unauthorized();
    var token = auth["Bearer ".Length..];
    if (!Sessoes.TryGetValue(token, out var sessao) || sessao.Expira < DateTime.Now)
    {
        Sessoes.TryRemove(token, out _);
        return Results.Unauthorized();
    }
    return Results.Ok(new { valida = true, expiraEm = sessao.Expira });
});

app.MapGet("/api/cardapio/semana", async (AppDbContext db) =>
{
    var dias = new[] { "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira" };
    var rows = await db.Cardapio.Join(db.Pratos, c => c.IdPrato, p => p.Id,
        (c, p) => new { c.Id, c.Dia, c.Sobremesa, Prato = new { p.Id, p.Nome, p.Descricao, p.Ingredientes, p.ModoPreparo, p.TempoPreparo, p.FotoUrl } })
        .OrderBy(x => x.Id).ToListAsync();
    var result = dias.Select(dia =>
    {
        var doDia = rows.Where(x => string.Equals(x.Dia, dia, StringComparison.OrdinalIgnoreCase)).ToList();
        return new { nome = dia, sobremesa = doDia.Select(x => x.Sobremesa).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x)),
            pratos = doDia.Select(x => x.Prato).ToList() };
    }).ToList();
    return Results.Ok(result);
});

app.MapPost("/api/upload/prato", async (HttpRequest request, IWebHostEnvironment env) =>
{
    if (!request.HasFormContentType) return Results.BadRequest(new { mensagem = "Envie uma imagem no formulário." });
    var form = await request.ReadFormAsync();
    var arquivo = form.Files.GetFile("arquivo");
    if (arquivo is null || arquivo.Length == 0) return Results.BadRequest(new { mensagem = "Selecione uma foto." });
    if (arquivo.Length > 5 * 1024 * 1024) return Results.BadRequest(new { mensagem = "A imagem deve ter no máximo 5 MB." });
    var extensao = Path.GetExtension(arquivo.FileName).ToLowerInvariant();
    var permitidas = new[] { ".jpg", ".jpeg", ".png", ".webp" };
    if (!permitidas.Contains(extensao)) return Results.BadRequest(new { mensagem = "Formato inválido. Use JPG, PNG ou WEBP." });
    var pasta = Path.Combine(env.WebRootPath ?? "wwwroot", "uploads", "pratos");
    Directory.CreateDirectory(pasta);
    var nome = $"{Guid.NewGuid():N}{extensao}";
    var caminho = Path.Combine(pasta, nome);
    await using (var stream = File.Create(caminho)) await arquivo.CopyToAsync(stream);
    return Results.Ok(new { fotoUrl = $"/uploads/pratos/{nome}" });
});

app.MapGet("/api/pratos", async (AppDbContext db) => Results.Ok(await db.Pratos.OrderBy(x => x.Nome).ToListAsync()));

app.MapPost("/api/pratos", async (PratoRequest request, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Nome)) return Results.BadRequest(new { mensagem = "O nome do prato é obrigatório." });
    var prato = new Prato { Nome = request.Nome.Trim(), Descricao = request.Descricao, Ingredientes = request.Ingredientes, ModoPreparo = request.ModoPreparo, TempoPreparo = request.TempoPreparo, FotoUrl = request.FotoUrl, DataCadastro = DateTime.Now };
    try
    {
        db.Pratos.Add(prato);
        await db.SaveChangesAsync();
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { mensagem = "Erro ao salvar o prato: " + (ex.InnerException?.Message ?? ex.Message) });
    }
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
    prato.FotoUrl = request.FotoUrl;
    try
    {
        await db.SaveChangesAsync();
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { mensagem = "Erro ao salvar o prato: " + (ex.InnerException?.Message ?? ex.Message) });
    }
    return Results.Ok(prato);
});

app.MapDelete("/api/pratos/{id:int}", async (int id, AppDbContext db) =>
{
    var prato = await db.Pratos.FindAsync(id);
    if (prato is null) return Results.NotFound();
    db.Pratos.Remove(prato);
    try
    {
        await db.SaveChangesAsync();
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { mensagem = "Erro ao excluir o prato: " + (ex.InnerException?.Message ?? ex.Message) });
    }
    return Results.NoContent();
});

app.MapPost("/api/cardapio", async (CardapioRequest request, AppDbContext db) =>
{
    if (!await db.Pratos.AnyAsync(p => p.Id == request.IdPrato)) return Results.BadRequest(new { mensagem = "Prato não encontrado." });
    var item = new CardapioSemanal { Dia = request.Dia, IdPrato = request.IdPrato, Sobremesa = request.Sobremesa };
    db.Cardapio.Add(item);
    try
    {
        await db.SaveChangesAsync();
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { mensagem = "Erro ao salvar o cardápio: " + (ex.InnerException?.Message ?? ex.Message) });
    }
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

// Retorna os avisos ativos e o estado de leitura do aluno autenticado.
app.MapGet("/api/avisos/usuario/{idUser:int}", async (int idUser, HttpContext http, AppDbContext db) =>
{
    var auth = http.Request.Headers.Authorization.ToString();
    if (!auth.StartsWith("Bearer ")) return Results.Unauthorized();
    var token = auth["Bearer ".Length..];
    if (!Sessoes.TryGetValue(token, out var sessao) || sessao.Expira < DateTime.Now || sessao.IdUsuario != idUser)
        return Results.Unauthorized();

    var agora = DateTime.Now;
    var avisos = await db.Avisos.Where(x => x.Ativo && (x.DataExpiracao == null || x.DataExpiracao > agora))
        .OrderByDescending(x => x.DataCriacao).ToListAsync();
    var idsLidos = await db.AvisosVisualizados.Where(x => x.IdUser == idUser)
        .Select(x => x.IdAviso).ToListAsync();
    return Results.Ok(avisos.Select(a => new
    {
        a.Id, a.Texto, a.DataCriacao, a.DataExpiracao,
        visualizado = idsLidos.Contains(a.Id)
    }));
});

app.MapGet("/api/avisos/nao-lidos/{idUser:int}", async (int idUser, HttpContext http, AppDbContext db) =>
{
    var auth = http.Request.Headers.Authorization.ToString();
    if (!auth.StartsWith("Bearer ")) return Results.Unauthorized();
    var token = auth["Bearer ".Length..];
    if (!Sessoes.TryGetValue(token, out var sessao) || sessao.Expira < DateTime.Now || sessao.IdUsuario != idUser)
        return Results.Unauthorized();

    var agora = DateTime.Now;
    var ativos = await db.Avisos.Where(x => x.Ativo && (x.DataExpiracao == null || x.DataExpiracao > agora))
        .Select(x => x.Id).ToListAsync();
    var lidos = await db.AvisosVisualizados.Where(x => x.IdUser == idUser && ativos.Contains(x.IdAviso))
        .Select(x => x.IdAviso).ToListAsync();
    return Results.Ok(new { quantidade = ativos.Except(lidos).Count() });
});

app.MapPost("/api/avisos/{id:int}/visualizar", async (int id, AvisoVisualizacaoRequest request, HttpContext http, AppDbContext db) =>
{
    var auth = http.Request.Headers.Authorization.ToString();
    if (!auth.StartsWith("Bearer ")) return Results.Unauthorized();
    var token = auth["Bearer ".Length..];
    if (!Sessoes.TryGetValue(token, out var sessao) || sessao.Expira < DateTime.Now || sessao.IdUsuario != request.IdUser)
        return Results.Unauthorized();
    if (!await db.Avisos.AnyAsync(x => x.Id == id && x.Ativo))
        return Results.NotFound(new { mensagem = "Aviso não encontrado." });
    if (!await db.AvisosVisualizados.AnyAsync(x => x.IdAviso == id && x.IdUser == request.IdUser))
    {
        db.AvisosVisualizados.Add(new AvisoVisualizado
        {
            IdAviso = id, IdUser = request.IdUser, DataVisualizacao = DateTime.Now
        });
        await db.SaveChangesAsync();
    }
    return Results.Ok(new { mensagem = "Aviso marcado como visualizado." });
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


var diasPresenca = new[] { "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira" };

app.MapGet("/api/presencas/semana", async (AppDbContext db) =>
{
    var registradas = await db.PresencasRegistradas.ToListAsync();
    var marcadas = await db.PresencasMarcadas
        .GroupBy(x => x.Dia)
        .Select(g => new { Dia = g.Key, Quantidade = g.Count() })
        .ToListAsync();

    var dados = diasPresenca.Select(dia =>
    {
        var reg = registradas.FirstOrDefault(x => x.Dia == dia)?.Quantidade ?? 0;
        var marc = marcadas.FirstOrDefault(x => x.Dia == dia)?.Quantidade ?? 0;
        return new { dia, registradas = reg, marcadas = marc, diferenca = reg - marc };
    }).ToList();

    return Results.Ok(new
    {
        dias = dados,
        medias = new
        {
            registradas = Math.Round(dados.Average(x => x.registradas), 2),
            marcadas = Math.Round(dados.Average(x => x.marcadas), 2),
            diferenca = Math.Round(dados.Average(x => x.diferenca), 2)
        }
    });
});

app.MapPost("/api/presencas/registradas", async (PresencaRegistradaRequest request, AppDbContext db) =>
{
    if (!diasPresenca.Contains(request.Dia)) return Results.BadRequest(new { mensagem = "Dia da semana inválido." });
    if (request.Quantidade < 0) return Results.BadRequest(new { mensagem = "A quantidade não pode ser negativa." });

    var registro = await db.PresencasRegistradas.FirstOrDefaultAsync(x => x.Dia == request.Dia);
    if (registro is null)
    {
        registro = new PresencaRegistrada { Dia = request.Dia, Quantidade = request.Quantidade };
        db.PresencasRegistradas.Add(registro);
    }
    else registro.Quantidade = request.Quantidade;

    await db.SaveChangesAsync();
    return Results.Ok(registro);
});

app.MapGet("/api/presencas/minhas/{idUser:int}", async (int idUser, AppDbContext db) =>
{
    var dias = await db.PresencasMarcadas.Where(x => x.IdUser == idUser).Select(x => x.Dia).ToListAsync();
    return Results.Ok(dias);
});

app.MapPost("/api/presencas/marcar", async (PresencaMarcadaRequest request, AppDbContext db) =>
{
    var dia = diasPresenca.FirstOrDefault(d => string.Equals(d, request.Dia?.Trim(), StringComparison.OrdinalIgnoreCase));
    if (dia is null) return Results.BadRequest(new { mensagem = "Dia da semana inválido." });
    if (!await db.Usuarios.AnyAsync(x => x.Id == request.IdUser)) return Results.BadRequest(new { mensagem = "Usuário não encontrado." });

    if (!await db.PresencasMarcadas.AnyAsync(x => x.IdUser == request.IdUser && x.Dia == dia))
    {
        db.PresencasMarcadas.Add(new PresencaMarcada { IdUser = request.IdUser, Dia = dia, DataMarcacao = DateTime.Now });
        await db.SaveChangesAsync();
    }
    return Results.Ok(new { mensagem = "Presença marcada." });
});

app.MapDelete("/api/presencas/marcar/{idUser:int}/{dia}", async (int idUser, string dia, AppDbContext db) =>
{
    var diaCanonico = diasPresenca.FirstOrDefault(d => string.Equals(d, dia?.Trim(), StringComparison.OrdinalIgnoreCase));
    if (diaCanonico is null) return Results.BadRequest(new { mensagem = "Dia da semana inválido." });

    var registro = await db.PresencasMarcadas.FirstOrDefaultAsync(x => x.IdUser == idUser && x.Dia == diaCanonico);
    if (registro is null) return Results.NotFound();
    db.PresencasMarcadas.Remove(registro);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.MapGet("/api/comentarios/admin", async (AppDbContext db) =>
{
    var result = await db.Comentarios
        .OrderByDescending(x => x.DataComentario)
        .Join(db.Usuarios, c => c.IdUser, u => (int?)u.Id, (c, u) => new
        {
            c.Id, c.DiaRefeicao, c.Avaliacao, c.Texto, c.DataComentario,
            nome = u.Nome, matricula = u.Matricula
        }).ToListAsync();
    return Results.Ok(result);
});

app.MapPost("/api/formularios/restricao", async (FormularioRestricaoRequest request, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Nome) || string.IsNullOrWhiteSpace(request.Matricula))
        return Results.BadRequest(new { mensagem = "Nome e matrícula são obrigatórios." });
    if (request.PossuiRestricao && string.IsNullOrWhiteSpace(request.TipoRestricao))
        return Results.BadRequest(new { mensagem = "Informe o tipo de restrição." });

    var formulario = new FormularioRestricao
    {
        IdUser = request.IdUser,
        Nome = request.Nome.Trim(),
        Matricula = request.Matricula.Trim(),
        PossuiRestricao = request.PossuiRestricao,
        TipoRestricao = request.PossuiRestricao ? request.TipoRestricao?.Trim() : null,
        Descricao = request.PossuiRestricao ? request.Descricao?.Trim() : null,
        DataEnvio = DateTime.Now
    };
    db.FormulariosRestricao.Add(formulario);
    await db.SaveChangesAsync();
    return Results.Created($"/api/formularios/restricao/{formulario.Id}", formulario);
});

app.MapGet("/api/formularios/restricao/admin", async (AppDbContext db) =>
{
    var result = await db.FormulariosRestricao.OrderByDescending(x => x.DataEnvio).ToListAsync();
    return Results.Ok(result);
});

app.Run();

static string HashPassword(string password)
{
    var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
    return Convert.ToHexString(bytes).ToLowerInvariant();
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