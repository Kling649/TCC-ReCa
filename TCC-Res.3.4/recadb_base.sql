CREATE DATABASE IF NOT EXISTS recadb;

USE recadb;

CREATE TABLE IF NOT EXISTS Users (
    id_user INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Pratos (
    id_prato INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,
    ingredientes TEXT,
    modo_preparo TEXT,
    tempo_preparo INT,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS RestricoesAlimentares (
    id_restricao INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    descricao VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS UserRestricoes (
    id_user INT NOT NULL,
    id_restricao INT NOT NULL,
    PRIMARY KEY (id_user, id_restricao),
    FOREIGN KEY (id_user)
        REFERENCES Users(id_user)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    FOREIGN KEY (id_restricao)
        REFERENCES RestricoesAlimentares(id_restricao)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS InteressePratos (
    id_user INT NOT NULL,
    id_prato INT NOT NULL,
    data_interesse TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_user, id_prato),
    FOREIGN KEY (id_user)
        REFERENCES Users(id_user)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    FOREIGN KEY (id_prato)
        REFERENCES Pratos(id_prato)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS Comentarios (
    id_comentario INT AUTO_INCREMENT PRIMARY KEY,
    id_user INT NOT NULL,
    id_prato INT NOT NULL,
    comentario TEXT NOT NULL,
    data_comentario TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_user)
        REFERENCES Users(id_user)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    FOREIGN KEY (id_prato)
        REFERENCES Pratos(id_prato)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);
