-- =====================================================================
-- TCC-Res 3.4 — esquema do banco (SQLite / Cloudflare D1)
--
-- Adaptado do MySQL do TCC 3.3. Os nomes de tabelas e colunas foram
-- mantidos. As alterações estão em MUDANCAS_3.4.md, identificadas com
-- o comentário "NOVO" ou "ALTERADO".
-- =====================================================================

-- Usuários: alunos e nutricionista(s).
CREATE TABLE IF NOT EXISTS Users (
  id_user        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT    NOT NULL,
  email          TEXT    NOT NULL UNIQUE,
  senha          TEXT    NOT NULL,                       -- ALTERADO: PBKDF2 com sal (hashes legados SHA-256 ainda aceitos)
  tipo_usuario   TEXT    NOT NULL DEFAULT 'aluno'
                 CHECK (tipo_usuario IN ('aluno', 'nutricionista')),   -- NOVO CHECK
  matricula      TEXT    NULL,
  data_cadastro  TEXT    NOT NULL                        -- ALTERADO: texto ISO com fuso de Brasília
);

-- Pratos cadastrados (o cardápio usa esta lista).
CREATE TABLE IF NOT EXISTS Pratos (
  id_prato       INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT    NOT NULL,
  descricao      TEXT    NULL,
  ingredientes   TEXT    NULL,
  modo_preparo   TEXT    NULL,
  tempo_preparo  INTEGER NULL,
  foto_url       TEXT    NULL,                            -- NOVO na 3.3 (mantido)
  data_cadastro  TEXT    NOT NULL
);

-- Catálogo padronizado de restrições alimentares.
CREATE TABLE IF NOT EXISTS RestricoesAlimentares (
  id_restricao   INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT    NOT NULL UNIQUE,
  descricao      TEXT    NULL,
  categoria      TEXT    NOT NULL DEFAULT 'Outra'         -- NOVO
                 CHECK (categoria IN ('Alergia', 'Intolerância', 'Preferência', 'Médica', 'Outra')),
  ativo          INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))  -- NOVO (desativar sem apagar)
);

-- Restrições vinculadas ao perfil do aluno (última resposta do formulário).
CREATE TABLE IF NOT EXISTS UserRestricoes (
  id_user        INTEGER NOT NULL REFERENCES Users(id_user) ON DELETE CASCADE ON UPDATE CASCADE,
  id_restricao   INTEGER NOT NULL REFERENCES RestricoesAlimentares(id_restricao) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (id_user, id_restricao)
);

-- Interesse em pratos (tabela mantida do 3.3; a contagem usa PresencasMarcadas).
CREATE TABLE IF NOT EXISTS InteressePratos (
  id_user        INTEGER NOT NULL REFERENCES Users(id_user) ON DELETE CASCADE ON UPDATE CASCADE,
  id_prato       INTEGER NOT NULL REFERENCES Pratos(id_prato) ON DELETE CASCADE ON UPDATE CASCADE,
  data_interesse TEXT    NOT NULL,
  PRIMARY KEY (id_user, id_prato)
);

-- Comentários dos clientes.
CREATE TABLE IF NOT EXISTS Comentarios (
  id_comentario   INTEGER PRIMARY KEY AUTOINCREMENT,
  id_user         INTEGER NULL REFERENCES Users(id_user) ON DELETE SET NULL,   -- ALTERADO: comentário anônimo se o usuário for apagado
  id_prato        INTEGER NULL REFERENCES Pratos(id_prato) ON DELETE SET NULL,
  comentario      TEXT    NOT NULL CHECK (length(comentario) BETWEEN 1 AND 1000),
  dia_refeicao    TEXT    NOT NULL                       -- ALTERADO: obrigatório e padronizado
                  CHECK (dia_refeicao IN ('Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira')),
  avaliacao       INTEGER NOT NULL CHECK (avaliacao BETWEEN 1 AND 5),       -- ALTERADO: obrigatório
  data_comentario TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comentarios_data ON Comentarios (data_comentario);
CREATE INDEX IF NOT EXISTS idx_comentarios_dia  ON Comentarios (dia_refeicao);

-- Cardápio da semana: um registro por prato e por dia.
CREATE TABLE IF NOT EXISTS CardapioSemanal (
  id_cardapio    INTEGER PRIMARY KEY AUTOINCREMENT,
  dia            TEXT    NOT NULL
                 CHECK (dia IN ('Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira')),
  id_prato       INTEGER NOT NULL REFERENCES Pratos(id_prato) ON DELETE CASCADE ON UPDATE CASCADE,
  sobremesa      TEXT    NULL,
  UNIQUE (dia, id_prato)                                -- NOVO: impede o mesmo prato duas vezes no dia
);

-- Avisos publicados pela nutricionista.
CREATE TABLE IF NOT EXISTS Avisos (
  id_aviso       INTEGER PRIMARY KEY AUTOINCREMENT,
  texto          TEXT    NOT NULL,
  tipo           TEXT    NOT NULL DEFAULT 'Informativo'  -- NOVO: Informativo / Importante / Urgente
                 CHECK (tipo IN ('Informativo', 'Importante', 'Urgente')),
  ativo          INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  data_expiracao TEXT    NULL,
  data_criacao   TEXT    NOT NULL
);

-- Quais avisos cada aluno já leu.
CREATE TABLE IF NOT EXISTS AvisosVisualizados (
  id_aviso          INTEGER NOT NULL REFERENCES Avisos(id_aviso) ON DELETE CASCADE,
  id_user           INTEGER NOT NULL REFERENCES Users(id_user) ON DELETE CASCADE,
  data_visualizacao TEXT    NOT NULL,
  PRIMARY KEY (id_aviso, id_user)
);

-- Efetivados: quantas pessoas realmente compareceram em cada dia.
CREATE TABLE IF NOT EXISTS PresencasRegistradas (
  id_presenca    INTEGER PRIMARY KEY AUTOINCREMENT,
  semana         TEXT    NOT NULL,                      -- NOVO: segunda-feira da semana (AAAA-MM-DD)
  dia            TEXT    NOT NULL
                 CHECK (dia IN ('Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira')),
  quantidade     INTEGER NOT NULL CHECK (quantidade >= 0),
  UNIQUE (semana, dia)                                  -- ALTERADO: antes era UNIQUE(dia), o que misturava semanas
);

-- Declarados: alunos que agendaram presença em cada dia.
CREATE TABLE IF NOT EXISTS PresencasMarcadas (
  id_marcacao    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES Users(id_user) ON DELETE CASCADE,
  dia            TEXT    NOT NULL
                 CHECK (dia IN ('Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira')),
  semana         TEXT    NOT NULL,                      -- NOVO: evita somar agendamentos de semanas diferentes
  data_marcacao  TEXT    NOT NULL,
  UNIQUE (user_id, dia, semana)                         -- ALTERADO: antes era (user_id, dia, data_marcacao)
);
CREATE INDEX IF NOT EXISTS idx_marcacoes_semana ON PresencasMarcadas (semana, dia);

-- Formulário de restrição alimentar. Cada envio gera um registro.
CREATE TABLE IF NOT EXISTS FormulariosRestricao (
  id_formulario    INTEGER PRIMARY KEY AUTOINCREMENT,
  id_user          INTEGER NULL REFERENCES Users(id_user) ON DELETE SET NULL,
  nome             TEXT    NOT NULL,
  matricula        TEXT    NOT NULL,
  possui_restricao INTEGER NOT NULL CHECK (possui_restricao IN (0, 1)),   -- ALTERADO: boolean como 0/1
  tipo_restricao   TEXT    NULL,                        -- ALTERADO: resumo com os nomes do catálogo (ex.: "Glúten, Lactose")
  descricao        TEXT    NULL,
  data_envio       TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_formularios_matricula ON FormulariosRestricao (matricula);

-- NOVO: ligação normalizada entre o formulário e o catálogo de restrições.
CREATE TABLE IF NOT EXISTS FormularioRestricoes (
  id_formulario  INTEGER NOT NULL REFERENCES FormulariosRestricao(id_formulario) ON DELETE CASCADE,
  id_restricao   INTEGER NOT NULL REFERENCES RestricoesAlimentares(id_restricao) ON DELETE CASCADE,
  PRIMARY KEY (id_formulario, id_restricao)
);

-- NOVO: sessões de login gravadas no banco (antes ficavam só na memória da API).
CREATE TABLE IF NOT EXISTS Sessoes (
  token      TEXT    PRIMARY KEY,
  id_user    INTEGER NOT NULL REFERENCES Users(id_user) ON DELETE CASCADE,
  expira_em  TEXT    NOT NULL
);
