-- Execute UMA vez no banco recadb. Não apaga nem altera os dados existentes.
USE recadb;

CREATE TABLE IF NOT EXISTS PresencasRegistradas (
    id_presenca INT AUTO_INCREMENT PRIMARY KEY,
    dia VARCHAR(20) NOT NULL UNIQUE,
    quantidade INT NOT NULL
);

CREATE TABLE IF NOT EXISTS PresencasMarcadas (
    id_marcacao INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    dia VARCHAR(20) NOT NULL,
    data_marcacao DATE NOT NULL,
    UNIQUE KEY unica_marcacao (user_id, dia, data_marcacao),
    FOREIGN KEY (user_id) REFERENCES Users(id_user)
);

CREATE TABLE IF NOT EXISTS FormulariosRestricao (
    id_formulario INT AUTO_INCREMENT PRIMARY KEY,
    id_user INT NULL,
    nome VARCHAR(100) NOT NULL,
    matricula VARCHAR(30) NOT NULL,
    possui_restricao BOOLEAN NOT NULL,
    tipo_restricao VARCHAR(50) NULL,
    descricao TEXT NULL,
    data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_user) REFERENCES Users(id_user) ON DELETE SET NULL
);
