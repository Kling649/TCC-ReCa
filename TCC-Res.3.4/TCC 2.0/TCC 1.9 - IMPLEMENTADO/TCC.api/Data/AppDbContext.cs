using Microsoft.EntityFrameworkCore;
using TCC.api.Models;

namespace TCC.api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<Prato> Pratos => Set<Prato>();
    public DbSet<RestricaoAlimentar> Restricoes => Set<RestricaoAlimentar>();
    public DbSet<Comentario> Comentarios => Set<Comentario>();
    public DbSet<CardapioSemanal> Cardapio => Set<CardapioSemanal>();
    public DbSet<Aviso> Avisos => Set<Aviso>();
    public DbSet<InteressePrato> Interesses => Set<InteressePrato>();
    public DbSet<UserRestricao> UserRestricoes => Set<UserRestricao>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Usuario>().ToTable("Users").HasKey(x => x.Id);
        modelBuilder.Entity<Usuario>().Property(x => x.Id).HasColumnName("id_user");
        modelBuilder.Entity<Usuario>().Property(x => x.Nome).HasColumnName("nome");
        modelBuilder.Entity<Usuario>().Property(x => x.Email).HasColumnName("email");
        modelBuilder.Entity<Usuario>().Property(x => x.Senha).HasColumnName("senha");
        modelBuilder.Entity<Usuario>().Property(x => x.TipoUsuario).HasColumnName("tipo_usuario");
        modelBuilder.Entity<Usuario>().Property(x => x.Matricula).HasColumnName("matricula");
        modelBuilder.Entity<Usuario>().Property(x => x.DataCadastro).HasColumnName("data_cadastro");

        modelBuilder.Entity<Prato>().ToTable("Pratos").HasKey(x => x.Id);
        modelBuilder.Entity<Prato>().Property(x => x.Id).HasColumnName("id_prato");
        modelBuilder.Entity<Prato>().Property(x => x.Nome).HasColumnName("nome");
        modelBuilder.Entity<Prato>().Property(x => x.Descricao).HasColumnName("descricao");
        modelBuilder.Entity<Prato>().Property(x => x.Ingredientes).HasColumnName("ingredientes");
        modelBuilder.Entity<Prato>().Property(x => x.ModoPreparo).HasColumnName("modo_preparo");
        modelBuilder.Entity<Prato>().Property(x => x.TempoPreparo).HasColumnName("tempo_preparo");
        modelBuilder.Entity<Prato>().Property(x => x.DataCadastro).HasColumnName("data_cadastro");

        modelBuilder.Entity<RestricaoAlimentar>().ToTable("RestricoesAlimentares").HasKey(x => x.Id);
        modelBuilder.Entity<RestricaoAlimentar>().Property(x => x.Id).HasColumnName("id_restricao");
        modelBuilder.Entity<RestricaoAlimentar>().Property(x => x.Nome).HasColumnName("nome");
        modelBuilder.Entity<RestricaoAlimentar>().Property(x => x.Descricao).HasColumnName("descricao");

        modelBuilder.Entity<Comentario>().ToTable("Comentarios").HasKey(x => x.Id);
        modelBuilder.Entity<Comentario>().Property(x => x.Id).HasColumnName("id_comentario");
        modelBuilder.Entity<Comentario>().Property(x => x.IdUser).HasColumnName("id_user");
        modelBuilder.Entity<Comentario>().Property(x => x.IdPrato).HasColumnName("id_prato");
        modelBuilder.Entity<Comentario>().Property(x => x.Texto).HasColumnName("comentario");
        modelBuilder.Entity<Comentario>().Property(x => x.DiaRefeicao).HasColumnName("dia_refeicao");
        modelBuilder.Entity<Comentario>().Property(x => x.Avaliacao).HasColumnName("avaliacao");
        modelBuilder.Entity<Comentario>().Property(x => x.DataComentario).HasColumnName("data_comentario");

        modelBuilder.Entity<CardapioSemanal>().ToTable("CardapioSemanal").HasKey(x => x.Id);
        modelBuilder.Entity<CardapioSemanal>().Property(x => x.Id).HasColumnName("id_cardapio");
        modelBuilder.Entity<CardapioSemanal>().Property(x => x.Dia).HasColumnName("dia");
        modelBuilder.Entity<CardapioSemanal>().Property(x => x.IdPrato).HasColumnName("id_prato");
        modelBuilder.Entity<CardapioSemanal>().Property(x => x.Sobremesa).HasColumnName("sobremesa");

        modelBuilder.Entity<Aviso>().ToTable("Avisos").HasKey(x => x.Id);
        modelBuilder.Entity<Aviso>().Property(x => x.Id).HasColumnName("id_aviso");
        modelBuilder.Entity<Aviso>().Property(x => x.Texto).HasColumnName("texto");
        modelBuilder.Entity<Aviso>().Property(x => x.Ativo).HasColumnName("ativo");
        modelBuilder.Entity<Aviso>().Property(x => x.DataExpiracao).HasColumnName("data_expiracao");
        modelBuilder.Entity<Aviso>().Property(x => x.DataCriacao).HasColumnName("data_criacao");

        modelBuilder.Entity<InteressePrato>().ToTable("InteressePratos").HasKey(x => new { x.IdUser, x.IdPrato });
        modelBuilder.Entity<InteressePrato>().Property(x => x.IdUser).HasColumnName("id_user");
        modelBuilder.Entity<InteressePrato>().Property(x => x.IdPrato).HasColumnName("id_prato");
        modelBuilder.Entity<InteressePrato>().Property(x => x.DataInteresse).HasColumnName("data_interesse");

        modelBuilder.Entity<UserRestricao>().ToTable("UserRestricoes").HasKey(x => new { x.IdUser, x.IdRestricao });
        modelBuilder.Entity<UserRestricao>().Property(x => x.IdUser).HasColumnName("id_user");
        modelBuilder.Entity<UserRestricao>().Property(x => x.IdRestricao).HasColumnName("id_restricao");
    }
}
