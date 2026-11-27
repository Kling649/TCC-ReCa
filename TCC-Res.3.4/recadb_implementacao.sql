USE recadb;



ALTER TABLE Users ADD COLUMN tipo_usuario VARCHAR(30) NOT NULL DEFAULT 'aluno';
ALTER TABLE Users ADD COLUMN matricula VARCHAR(30) NULL;

ALTER TABLE Comentarios ADD COLUMN dia_refeicao VARCHAR(30) NULL;
ALTER TABLE Comentarios ADD COLUMN avaliacao INT NULL;
ALTER TABLE Comentarios MODIFY id_user INT NULL;
ALTER TABLE Comentarios MODIFY id_prato INT NULL;

CREATE TABLE IF NOT EXISTS CardapioSemanal (
    id_cardapio INT AUTO_INCREMENT PRIMARY KEY,
    dia VARCHAR(30) NOT NULL,
    id_prato INT NOT NULL,
    sobremesa VARCHAR(150) NULL,
    FOREIGN KEY (id_prato) REFERENCES Pratos(id_prato)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS Avisos (
    id_aviso INT AUTO_INCREMENT PRIMARY KEY,
    texto TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_expiracao DATETIME NULL,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Guarda, por aluno, quais avisos já foram visualizados.
CREATE TABLE IF NOT EXISTS AvisosVisualizados (
    id_aviso INT NOT NULL,
    id_user INT NOT NULL,
    data_visualizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_aviso, id_user),
    FOREIGN KEY (id_aviso) REFERENCES Avisos(id_aviso) ON DELETE CASCADE,
    FOREIGN KEY (id_user) REFERENCES Users(id_user) ON DELETE CASCADE
);

INSERT IGNORE INTO RestricoesAlimentares (nome, descricao) VALUES
('Lactose', 'Restrição a alimentos com lactose.'),
('Glúten', 'Restrição a alimentos com glúten.'),
('Carne', 'Restrição a carnes.');

-- Pratos iniciais para o cardápio.
INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo)
SELECT 'Arroz com Feijão', 'Arroz e feijão tradicionais', 'Arroz, feijão, temperos', 'Preparar normalmente.'
WHERE NOT EXISTS (SELECT 1 FROM Pratos WHERE nome='Arroz com Feijão');

INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo)
SELECT 'Bife à Milanesa', 'Bife empanado', 'Carne bovina, farinha, ovos, temperos', 'Empanar e fritar/assar.'
WHERE NOT EXISTS (SELECT 1 FROM Pratos WHERE nome='Bife à Milanesa');

INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo)
SELECT 'Batata Frita', 'Batata frita', 'Batata, óleo, sal', 'Fritar até dourar.'
WHERE NOT EXISTS (SELECT 1 FROM Pratos WHERE nome='Batata Frita');

INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo)
SELECT 'Salada de Alface', 'Salada simples', 'Alface, tomate, temperos', 'Higienizar e montar.'
WHERE NOT EXISTS (SELECT 1 FROM Pratos WHERE nome='Salada de Alface');

INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo)
SELECT 'Carne de Panela', 'Carne cozida', 'Carne bovina, legumes, temperos', 'Cozinhar até ficar macia.'
WHERE NOT EXISTS (SELECT 1 FROM Pratos WHERE nome='Carne de Panela');

INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo)
SELECT 'Farofa', 'Farofa temperada', 'Farinha de mandioca, temperos', 'Refogar e misturar.'
WHERE NOT EXISTS (SELECT 1 FROM Pratos WHERE nome='Farofa');

INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo)
SELECT 'Lasanha', 'Lasanha tradicional', 'Massa, molho, queijo', 'Montar camadas e assar.'
WHERE NOT EXISTS (SELECT 1 FROM Pratos WHERE nome='Lasanha');

INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo)
SELECT 'Purê', 'Purê de batata', 'Batata, leite, manteiga', 'Cozinhar, amassar e misturar.'
WHERE NOT EXISTS (SELECT 1 FROM Pratos WHERE nome='Purê');

INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo)
SELECT 'Lasanha Vegana', 'Lasanha sem ingredientes animais', 'Massa, legumes, molho', 'Montar e assar.'
WHERE NOT EXISTS (SELECT 1 FROM Pratos WHERE nome='Lasanha Vegana');

INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo)
SELECT 'Estrogonofe', 'Estrogonofe tradicional', 'Carne, creme, molho', 'Preparar o molho e cozinhar a carne.'
WHERE NOT EXISTS (SELECT 1 FROM Pratos WHERE nome='Estrogonofe');

INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo)
SELECT 'Lentilha', 'Lentilha cozida', 'Lentilha, temperos', 'Cozinhar até amaciar.'
WHERE NOT EXISTS (SELECT 1 FROM Pratos WHERE nome='Lentilha');

INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo)
SELECT 'Carne de Soja', 'Proteína vegetal', 'Proteína de soja, temperos', 'Hidratar e refogar.'
WHERE NOT EXISTS (SELECT 1 FROM Pratos WHERE nome='Carne de Soja');

-- Cardápio inicial: usa os pratos existentes e cria uma semana demonstrativa.
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Segunda-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Arroz com Feijão' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Segunda-feira' AND c.id_prato=p.id_prato);
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Segunda-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Bife à Milanesa' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Segunda-feira' AND c.id_prato=p.id_prato);
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Segunda-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Batata Frita' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Segunda-feira' AND c.id_prato=p.id_prato);
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Segunda-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Salada de Alface' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Segunda-feira' AND c.id_prato=p.id_prato);

INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Terça-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Arroz com Feijão' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Terça-feira' AND c.id_prato=p.id_prato);
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Terça-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Carne de Panela' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Terça-feira' AND c.id_prato=p.id_prato);
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Terça-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Farofa' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Terça-feira' AND c.id_prato=p.id_prato);

INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Quarta-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Arroz com Feijão' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Quarta-feira' AND c.id_prato=p.id_prato);
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Quarta-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Lasanha' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Quarta-feira' AND c.id_prato=p.id_prato);
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Quarta-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Purê' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Quarta-feira' AND c.id_prato=p.id_prato);
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Quarta-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Lasanha Vegana' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Quarta-feira' AND c.id_prato=p.id_prato);

INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Quinta-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Arroz' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Quinta-feira' AND c.id_prato=p.id_prato);
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Quinta-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Estrogonofe' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Quinta-feira' AND c.id_prato=p.id_prato);
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Quinta-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Lentilha' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Quinta-feira' AND c.id_prato=p.id_prato);

INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Sexta-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Arroz com Feijão' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Sexta-feira' AND c.id_prato=p.id_prato);
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
SELECT 'Sexta-feira', p.id_prato, 'Fruta da época' FROM Pratos p WHERE p.nome='Carne de Soja' AND NOT EXISTS (SELECT 1 FROM CardapioSemanal c WHERE c.dia='Sexta-feira' AND c.id_prato=p.id_prato);

INSERT INTO Avisos (texto, ativo) SELECT 'Bem-vindo ao cardápio da semana!', TRUE WHERE NOT EXISTS (SELECT 1 FROM Avisos WHERE texto='Bem-vindo ao cardápio da semana!');
