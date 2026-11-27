namespace TCC.api.Models;

public class Usuario
{
    public int Id { get; set; }
    public string Nome { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Senha { get; set; } = string.Empty;
    public string TipoUsuario { get; set; } = "aluno";
    public string? Matricula { get; set; }
    public DateTime DataCadastro { get; set; }
}

public class Prato
{
    public int Id { get; set; }
    public string Nome { get; set; } = string.Empty;
    public string? Descricao { get; set; }
    public string? Ingredientes { get; set; }
    public string? ModoPreparo { get; set; }
    public int? TempoPreparo { get; set; }
    public DateTime DataCadastro { get; set; }
}

public class RestricaoAlimentar
{
    public int Id { get; set; }
    public string Nome { get; set; } = string.Empty;
    public string? Descricao { get; set; }
}

public class Comentario
{
    public int Id { get; set; }
    public int? IdUser { get; set; }
    public int? IdPrato { get; set; }
    public string Texto { get; set; } = string.Empty;
    public string? DiaRefeicao { get; set; }
    public int? Avaliacao { get; set; }
    public DateTime DataComentario { get; set; }
}

public class CardapioSemanal
{
    public int Id { get; set; }
    public string Dia { get; set; } = string.Empty;
    public int IdPrato { get; set; }
    public string? Sobremesa { get; set; }
}

public class Aviso
{
    public int Id { get; set; }
    public string Texto { get; set; } = string.Empty;
    public bool Ativo { get; set; } = true;
    public DateTime? DataExpiracao { get; set; }
    public DateTime DataCriacao { get; set; }
}

public class InteressePrato
{
    public int IdUser { get; set; }
    public int IdPrato { get; set; }
    public DateTime DataInteresse { get; set; }
}

public class UserRestricao
{
    public int IdUser { get; set; }
    public int IdRestricao { get; set; }
}

public record CadastroRequest(string Nome, string Email, string Senha, string? Matricula);
public record LoginRequest(string Email, string Senha);
public record ComentarioRequest(int? IdPrato, string DiaRefeicao, int Avaliacao, string Texto, int? IdUser);
public record RestricaoRequest(string Nome, string? Descricao, int? IdUser);
public record PratoRequest(string Nome, string? Descricao, string? Ingredientes, string? ModoPreparo, int? TempoPreparo);
public record InteresseRequest(int IdUser, int IdPrato);
public record CardapioRequest(string Dia, int IdPrato, string? Sobremesa);
public record AvisoRequest(string Texto, int? DiasExpiracao);
