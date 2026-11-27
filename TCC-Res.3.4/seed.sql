-- =====================================================================
-- TCC-Res 3.4 — dados iniciais
-- Executado uma única vez pelo D1 (controle de migrações).
-- =====================================================================

-- Catálogo padronizado de restrições (substitui o texto livre do 3.3).
INSERT INTO RestricoesAlimentares (nome, descricao, categoria) VALUES
  ('Glúten',         'Doença celíaca ou sensibilidade ao glúten.',              'Intolerância'),
  ('Lactose',        'Intolerância à lactose ou restrição a laticínios.',        'Intolerância'),
  ('Ovo',            'Alergia ou restrição a ovos.',                             'Alergia'),
  ('Amendoim',       'Alergia a amendoim.',                                      'Alergia'),
  ('Frutos do mar',  'Alergia a crustáceos, moluscos ou peixes.',                'Alergia'),
  ('Soja',           'Alergia ou restrição à soja.',                             'Alergia'),
  ('Vegetariano',    'Não consome carne.',                                       'Preferência'),
  ('Vegano',         'Não consome nenhum produto de origem animal.',             'Preferência'),
  ('Condição médica','Ex.: diabetes, hipertensão, doença renal. Descreva abaixo.', 'Médica');

-- Pratos iniciais (mesmos nomes do recadb_implementacao.sql original).
INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo, data_cadastro) VALUES
  ('Arroz com Feijão', 'Arroz e feijão tradicionais', 'Arroz, feijão, temperos', 'Preparar normalmente.', strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours')),
  ('Arroz',            'Arroz branco soltinho',       'Arroz, sal, óleo',       'Cozinhar até secar.',   strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours')),
  ('Bife à Milanesa',  'Bife empanado',               'Carne bovina, farinha, ovos, temperos', 'Empanar e fritar/assar.', strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours')),
  ('Batata Frita',     'Batata frita',                'Batata, óleo, sal',      'Fritar até dourar.',    strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours')),
  ('Salada de Alface', 'Salada simples',              'Alface, tomate, temperos', 'Higienizar e montar.', strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours')),
  ('Carne de Panela',  'Carne cozida',                'Carne bovina, legumes, temperos', 'Cozinhar até ficar macia.', strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours')),
  ('Farofa',           'Farofa temperada',            'Farinha de mandioca, temperos', 'Refogar e misturar.', strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours')),
  ('Lasanha',          'Lasanha tradicional',         'Massa, molho, queijo',   'Montar camadas e assar.', strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours')),
  ('Purê',             'Purê de batata',              'Batata, leite, manteiga', 'Cozinhar, amassar e misturar.', strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours')),
  ('Lasanha Vegana',   'Lasanha sem ingredientes animais', 'Massa, legumes, molho', 'Montar e assar.', strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours')),
  ('Estrogonofe',      'Estrogonofe tradicional',     'Carne, creme, molho',    'Preparar o molho e cozinhar a carne.', strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours')),
  ('Lentilha',         'Lentilha cozida',             'Lentilha, temperos',     'Cozinhar até amaciar.', strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours')),
  ('Carne de Soja',    'Proteína vegetal',            'Proteína de soja, temperos', 'Hidratar e refogar.', strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours'));

-- Cardápio de demonstração (mesma distribuição do recadb_implementacao.sql original).
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
  SELECT 'Segunda-feira', id_prato, 'Fruta da época' FROM Pratos WHERE nome IN ('Arroz com Feijão', 'Bife à Milanesa', 'Batata Frita', 'Salada de Alface');
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
  SELECT 'Terça-feira', id_prato, 'Fruta da época' FROM Pratos WHERE nome IN ('Arroz com Feijão', 'Carne de Panela', 'Farofa');
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
  SELECT 'Quarta-feira', id_prato, 'Fruta da época' FROM Pratos WHERE nome IN ('Arroz com Feijão', 'Lasanha', 'Purê', 'Lasanha Vegana');
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
  SELECT 'Quinta-feira', id_prato, 'Fruta da época' FROM Pratos WHERE nome IN ('Arroz', 'Estrogonofe', 'Lentilha');
INSERT INTO CardapioSemanal (dia, id_prato, sobremesa)
  SELECT 'Sexta-feira', id_prato, 'Fruta da época' FROM Pratos WHERE nome IN ('Arroz com Feijão', 'Carne de Soja');

-- Aviso de boas-vindas.
INSERT INTO Avisos (texto, tipo, ativo, data_criacao)
  VALUES ('Bem-vindo ao cardápio da semana! Agende sua presença nos dias em que for almoçar.', 'Informativo', 1, strftime('%Y-%m-%dT%H:%M:%S-03:00', 'now', '-3 hours'));
