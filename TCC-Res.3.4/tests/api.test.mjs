// Testes da API do TCC-Res 3.4. Rodam o próprio Worker (src/index.js) sobre um
// SQLite com as mesmas migrações do D1. Execute com:  npm test

import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { criarD1Local, aplicarMigrations } from './d1-local.mjs';
import * as T from '../src/lib/tempo.js';

const CODIGO = 'CODIGO-TESTE-123';
const DIAS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];

function criarAmbiente(extra = {}) {
  const DB = criarD1Local(':memory:');
  aplicarMigrations(DB);
  return {
    DB,
    ASSETS: { fetch: async () => new Response('conteudo-estatico', { status: 200 }) },
    TCC_CODIGO_NUTRICIONISTA: CODIGO,
    ...extra,
  };
}

async function chamar(env, metodo, caminho, { corpo, token, form } = {}) {
  const headers = {};
  let body;
  if (corpo !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(corpo);
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  if (form) body = form;
  const resposta = await worker.fetch(new Request(`http://localhost${caminho}`, { method: metodo, headers, body }), env);
  const texto = await resposta.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = texto;
  }
  return { status: resposta.status, json, headers: resposta.headers };
}

async function criarAluno(env, nome = 'Ana Aluna', email = 'ana@aluno.com', matricula = '2026001') {
  const r = await chamar(env, 'POST', '/api/alunos', { corpo: { nome, email, senha: 'segredo1', matricula } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const login = await chamar(env, 'POST', '/api/login', { corpo: { email, senha: 'segredo1' } });
  return { id: r.json.id, token: login.json.token, email };
}

async function criarNutricionista(env, email = 'nutri@ifrj.com') {
  const r = await chamar(env, 'POST', '/api/nutricionistas', {
    corpo: { nome: 'Nutri Teste', email, senha: 'segredo1', codigoAutorizacao: CODIGO },
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const login = await chamar(env, 'POST', '/api/login', { corpo: { email, senha: 'segredo1' } });
  return { id: r.json.id, token: login.json.token };
}

const hoje = T.dataHojeBR();
const indiceHoje = T.indiceDiaDe(hoje);
const semanaAtual = T.semanaAtual();

// ---------------------------------------------------------------------
describe('Sistema e erros', () => {
  let env;
  before(() => { env = criarAmbiente(); });

  test('teste e health respondem', async () => {
    const t = await chamar(env, 'GET', '/api/teste');
    assert.equal(t.status, 200);
    assert.match(t.json.mensagem, /funcionando/);
    const h = await chamar(env, 'GET', '/api/health');
    assert.deepEqual(h.json, { status: 'ok', banco: 'conectado' });
  });

  test('rota inexistente = 404 e método errado = 405', async () => {
    assert.equal((await chamar(env, 'GET', '/api/nao-existe')).status, 404);
    assert.equal((await chamar(env, 'PATCH', '/api/teste')).status, 405);
  });

  test('JSON malformado é recusado com 400', async () => {
    const resposta = await worker.fetch(new Request('http://localhost/api/alunos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nao-e-json',
    }), env);
    assert.equal(resposta.status, 400);
  });

  test('caminhos fora da API são entregues pelos arquivos estáticos', async () => {
    const r = await worker.fetch(new Request('http://localhost/index.html'), env);
    assert.equal(await r.text(), 'conteudo-estatico');
  });
});

// ---------------------------------------------------------------------
describe('Cadastro, login e sessão', () => {
  let env;
  beforeEach(() => { env = criarAmbiente(); });

  test('aluno é cadastrado com matrícula e senha protegida', async () => {
    const r = await chamar(env, 'POST', '/api/alunos', {
      corpo: { nome: 'Bruno', email: 'Bruno@Aluno.com ', senha: 'abc123', matricula: '99' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.email, 'bruno@aluno.com');
    assert.equal(r.json.tipoUsuario, 'aluno');
    const linha = env.DB.prepare('SELECT senha FROM Users WHERE id_user = ?').bind(r.json.id).first();
    assert.ok(linha.senha.startsWith('pbkdf2$'), 'senha deve estar em PBKDF2');
    assert.ok(!linha.senha.includes('abc123'));
  });

  test('validações do cadastro retornam mensagens claras', async () => {
    const semMatricula = await chamar(env, 'POST', '/api/alunos', { corpo: { nome: 'Ana', email: 'a@a.com', senha: 'segredo1' } });
    assert.equal(semMatricula.status, 400);
    assert.match(semMatricula.json.mensagem, /Matrícula/);
    const emailRuim = await chamar(env, 'POST', '/api/alunos', { corpo: { nome: 'Ana', email: 'nao-email', senha: 'segredo1', matricula: '1' } });
    assert.equal(emailRuim.status, 400);
    const senhaCurta = await chamar(env, 'POST', '/api/alunos', { corpo: { nome: 'Ana', email: 'a@a.com', senha: '123', matricula: '1' } });
    assert.match(senhaCurta.json.mensagem, /6 caracteres/);
  });

  test('e-mail duplicado retorna 409', async () => {
    await criarAluno(env);
    const r = await chamar(env, 'POST', '/api/alunos', { corpo: { nome: 'Outra', email: 'ana@aluno.com', senha: 'segredo1', matricula: '9' } });
    assert.equal(r.status, 409);
  });

  test('cadastro de nutricionista exige o código secreto', async () => {
    const corpo = { nome: 'Nutri', email: 'n@ifrj.com', senha: 'segredo1' };
    assert.equal((await chamar(env, 'POST', '/api/nutricionistas', { corpo: { ...corpo, codigoAutorizacao: 'errado' } })).status, 403);
    assert.equal((await chamar(env, 'POST', '/api/nutricionistas', { corpo: { ...corpo, codigoAutorizacao: CODIGO } })).status, 201);
  });

  test('sem código configurado no servidor, o cadastro de nutricionista fica indisponível (503)', async () => {
    const semCodigo = criarAmbiente({ TCC_CODIGO_NUTRICIONISTA: undefined });
    const r = await chamar(semCodigo, 'POST', '/api/nutricionistas', { corpo: { nome: 'N', email: 'n@n.com', senha: 'segredo1', codigoAutorizacao: 'x' } });
    assert.equal(r.status, 503);
  });

  test('login: senha errada = 401; senha certa = token e perfil', async () => {
    await criarAluno(env);
    assert.equal((await chamar(env, 'POST', '/api/login', { corpo: { email: 'ana@aluno.com', senha: 'errada' } })).status, 401);
    const ok = await chamar(env, 'POST', '/api/login', { corpo: { email: 'ana@aluno.com', senha: 'segredo1' } });
    assert.equal(ok.status, 200);
    assert.ok(ok.json.token.length > 30);
    assert.equal(ok.json.usuario.tipoUsuario, 'aluno');
  });

  test('senha no formato antigo (SHA-256 do TCC 3.3) entra e é regravada no formato novo', async () => {
    const { sha256Hex } = await import('../src/lib/seguranca.js');
    const antigo = await sha256Hex('antiga123');
    env.DB.prepare("INSERT INTO Users (nome, email, senha, tipo_usuario, matricula, data_cadastro) VALUES ('Velho', 'velho@a.com', ?, 'aluno', '5', '2026')")
      .bind(antigo).run();
    const r = await chamar(env, 'POST', '/api/login', { corpo: { email: 'velho@a.com', senha: 'antiga123' } });
    assert.equal(r.status, 200);
    const depois = env.DB.prepare("SELECT senha FROM Users WHERE email = 'velho@a.com'").first();
    assert.ok(depois.senha.startsWith('pbkdf2$'));
  });

  test('sessão válida em /api/sessao; após logout o token deixa de valer', async () => {
    const aluno = await criarAluno(env);
    assert.equal((await chamar(env, 'GET', '/api/sessao', { token: aluno.token })).status, 200);
    await chamar(env, 'POST', '/api/logout', { token: aluno.token });
    assert.equal((await chamar(env, 'GET', '/api/sessao', { token: aluno.token })).status, 401);
  });

  test('sessão expirada não é aceita', async () => {
    const aluno = await criarAluno(env);
    env.DB.prepare('UPDATE Sessoes SET expira_em = ?').bind('2000-01-01T00:00:00-03:00').run();
    assert.equal((await chamar(env, 'GET', '/api/sessao', { token: aluno.token })).status, 401);
  });
});

// ---------------------------------------------------------------------
describe('Autorização por perfil (segurança)', () => {
  let env;
  let aluno;
  let nutri;
  before(async () => {
    env = criarAmbiente();
    aluno = await criarAluno(env);
    nutri = await criarNutricionista(env);
  });

  test('rotas administrativas exigem login (401) e perfil certo (403 para aluno)', async () => {
    assert.equal((await chamar(env, 'GET', '/api/presencas/resumo')).status, 401);
    assert.equal((await chamar(env, 'GET', '/api/presencas/resumo', { token: aluno.token })).status, 403);
    assert.equal((await chamar(env, 'GET', '/api/presencas/resumo', { token: nutri.token })).status, 200);
    assert.equal((await chamar(env, 'GET', '/api/comentarios/admin', { token: aluno.token })).status, 403);
    assert.equal((await chamar(env, 'POST', '/api/avisos', { token: aluno.token, corpo: { texto: 'Aviso falso' } })).status, 403);
  });

  test('nutricionista não agenda presença como aluno', async () => {
    const r = await chamar(env, 'POST', '/api/presencas/marcar', { token: nutri.token, corpo: { dia: 'Segunda-feira' } });
    assert.equal(r.status, 403);
  });
});

// ---------------------------------------------------------------------
describe('Cardápio e pratos', () => {
  let env;
  let nutri;
  let aluno;
  before(async () => {
    env = criarAmbiente();
    await chamar(env, 'GET', '/api/teste');
    // A migração 0002 já cria o cardápio de demonstração.
    nutri = await criarNutricionista(env);
    aluno = await criarAluno(env);
  });

  test('cardápio público traz cinco dias com pratos, sobremesa e flag de encerrado', async () => {
    const r = await chamar(env, 'GET', '/api/cardapio/semana');
    assert.equal(r.status, 200);
    assert.equal(r.json.dias.length, 5);
    assert.deepEqual(r.json.dias.map((d) => d.nome), DIAS);
    assert.equal(r.json.semana, semanaAtual);
    const seg = r.json.dias[0];
    assert.equal(seg.pratos.length, 4);
    assert.equal(seg.sobremesa, 'Fruta da época');
    assert.ok(seg.pratos[0].nome && 'modoPreparo' in seg.pratos[0]);
    r.json.dias.forEach((d, i) => {
      const esperado = i < indiceHoje || indiceHoje > 4;
      assert.equal(d.encerrado, esperado, `encerrado de ${d.nome}`);
    });
  });

  test('nutricionista substitui o cardápio de um dia em uma única operação', async () => {
    const pratos = env.DB.prepare("SELECT id_prato FROM Pratos WHERE nome IN ('Lasanha','Purê')").all().results.map((p) => p.id_prato);
    const dias = DIAS.map((dia) => ({ dia, pratos: dia === 'Quarta-feira' ? pratos : [], sobremesa: dia === 'Quarta-feira' ? 'Pudim' : null }));
    const r = await chamar(env, 'PUT', '/api/cardapio/semana', { token: nutri.token, corpo: { dias } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const depois = await chamar(env, 'GET', '/api/cardapio/semana');
    const quarta = depois.json.dias.find((d) => d.nome === 'Quarta-feira');
    assert.equal(quarta.pratos.length, 2);
    assert.equal(quarta.sobremesa, 'Pudim');
    assert.equal(depois.json.dias.find((d) => d.nome === 'Segunda-feira').pratos.length, 0);
  });

  test('cardápio rejeita dia inválido, prato inexistente e pratos repetidos', async () => {
    const dia = (nome, pratos) => ({ dia: nome, pratos, sobremesa: null });
    assert.equal((await chamar(env, 'PUT', '/api/cardapio/semana', { token: nutri.token, corpo: { dias: [dia('Domingo', [])] } })).status, 400);
    assert.equal((await chamar(env, 'PUT', '/api/cardapio/semana', { token: nutri.token, corpo: { dias: [dia('Segunda-feira', [99999])] } })).status, 400);
    const repetido = await chamar(env, 'PUT', '/api/cardapio/semana', { token: nutri.token, corpo: { dias: [dia('Segunda-feira', [1, 1])] } });
    assert.equal(repetido.status, 200, 'ids repetidos são unificados, não duplicados');
  });

  test('dia aceita variação sem acento e capitalização', async () => {
    const r = await chamar(env, 'PUT', '/api/cardapio/semana', { token: nutri.token, corpo: { dias: [{ dia: 'terca-feira', pratos: [], sobremesa: null }] } });
    assert.equal(r.status, 200);
  });

  test('pratos: criar, validar URL da foto, editar, excluir', async () => {
    const criado = await chamar(env, 'POST', '/api/pratos', { token: nutri.token, corpo: { nome: 'Strogonoff de frango', ingredientes: 'frango, creme', modoPreparo: 'Cozinhar' } });
    assert.equal(criado.status, 201);
    const id = criado.json.id;

    const xss = await chamar(env, 'POST', '/api/pratos', { token: nutri.token, corpo: { nome: 'Prato teste', fotoUrl: 'javascript:alert(1)' } });
    assert.equal(xss.status, 400, 'URL com javascript: deve ser recusada');

    const https = await chamar(env, 'POST', '/api/pratos', { token: nutri.token, corpo: { nome: 'Feijoada', fotoUrl: 'https://exemplo.com/f.jpg' } });
    assert.equal(https.status, 201);

    const editado = await chamar(env, 'PUT', `/api/pratos/${id}`, { token: nutri.token, corpo: { nome: 'Strogonoff', ingredientes: 'frango', modoPreparo: 'Cozinhar bem', tempoPreparo: 30 } });
    assert.equal(editado.status, 200);
    assert.equal(editado.json.nome, 'Strogonoff');
    assert.equal(editado.json.tempoPreparo, 30);

    assert.equal((await chamar(env, 'DELETE', `/api/pratos/${id}`, { token: nutri.token })).status, 204);
    assert.equal((await chamar(env, 'DELETE', `/api/pratos/${id}`, { token: nutri.token })).status, 404);
    assert.equal((await chamar(env, 'PUT', `/api/pratos/${id}`, { token: nutri.token, corpo: { nome: 'Y' } })).status, 404);
  });

  test('adicionar prato a um dia mantém os outros pratos do dia', async () => {
    const antes = (await chamar(env, 'GET', '/api/cardapio/semana')).json.dias.find((d) => d.nome === 'Sexta-feira').pratos.length;
    const prato = await chamar(env, 'POST', '/api/pratos', { token: nutri.token, corpo: { nome: 'Pudim de teste' } });
    const r = await chamar(env, 'POST', '/api/cardapio', { token: nutri.token, corpo: { dia: 'sexta-feira', idPrato: prato.json.id, sobremesa: 'Mousse' } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const depois = (await chamar(env, 'GET', '/api/cardapio/semana')).json.dias.find((d) => d.nome === 'Sexta-feira');
    assert.equal(depois.pratos.length, antes + 1);
    assert.equal(depois.sobremesa, 'Mousse');
    const repetido = await chamar(env, 'POST', '/api/cardapio', { token: nutri.token, corpo: { dia: 'Sexta-feira', idPrato: prato.json.id } });
    assert.equal(repetido.status, 201);
    assert.equal((await chamar(env, 'GET', '/api/cardapio/semana')).json.dias.find((d) => d.nome === 'Sexta-feira').pratos.length, antes + 1, 'não duplica');
    assert.equal((await chamar(env, 'POST', '/api/cardapio', { token: nutri.token, corpo: { dia: 'Sexta-feira', idPrato: 99999 } })).status, 400);
  });

  test('upload de foto sem R2 configurado responde 503 com orientação', async () => {
    const form = new FormData();
    form.append('arquivo', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'x.jpg');
    const r = await chamar(env, 'POST', '/api/upload/prato', { token: nutri.token, form });
    assert.equal(r.status, 503);
    assert.match(r.json.mensagem, /Link da foto/);
  });

  test('upload com R2 aceita só imagens reais (confere os bytes, não o nome)', async () => {
    const guardados = new Map();
    const fotos = {
      put: async (chave, bytes, opcoes) => guardados.set(chave, { bytes, opcoes }),
      get: async (chave) => (guardados.has(chave) ? { body: guardados.get(chave).bytes, httpMetadata: { contentType: guardados.get(chave).opcoes.httpMetadata.contentType } } : null),
    };
    const comR2 = { ...env, FOTOS: fotos };
    const falso = new FormData();
    falso.append('arquivo', new Blob([new TextEncoder().encode('<script>alert(1)</script>')], { type: 'image/png' }), 'x.png');
    assert.equal((await chamar(comR2, 'POST', '/api/upload/prato', { token: nutri.token, form: falso })).status, 400);

    const png = new FormData();
    png.append('arquivo', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])], { type: 'image/png' }), 'p.png');
    const r = await chamar(comR2, 'POST', '/api/upload/prato', { token: nutri.token, form: png });
    assert.equal(r.status, 201);
    assert.match(r.json.fotoUrl, /^\/uploads\/pratos\/[a-f0-9]{32}\.png$/);
    const servido = await worker.fetch(new Request(`http://localhost${r.json.fotoUrl}`), comR2);
    assert.equal(servido.headers.get('Content-Type'), 'image/png');
  });

  test('foto que não existe no R2 cai no arquivo estático (fotos antigas)', async () => {
    const r = await worker.fetch(new Request('http://localhost/uploads/pratos/c29cf25a57fd4e808fbfa151f144b85c.png'), env);
    assert.equal(await r.text(), 'conteudo-estatico');
  });
});

// ---------------------------------------------------------------------
describe('Comentários: recentes, paginação, filtro por dia e resumo', () => {
  let env;
  before(async () => {
    env = criarAmbiente();
    const aluno = await criarAluno(env);
    for (let i = 0; i < 7; i += 1) {
      const dia = DIAS[i % 5];
      const r = await chamar(env, 'POST', '/api/comentarios', {
        token: i % 2 === 0 ? aluno.token : undefined,
        corpo: { diaRefeicao: dia, avaliacao: (i % 5) + 1, texto: `Comentário número ${i + 1}` },
      });
      assert.equal(r.status, 201, JSON.stringify(r.json));
    }
  });

  test('validações: dia, avaliação e texto', async () => {
    assert.equal((await chamar(env, 'POST', '/api/comentarios', { corpo: { diaRefeicao: 'Domingo', avaliacao: 3, texto: 'bom' } })).status, 400);
    assert.equal((await chamar(env, 'POST', '/api/comentarios', { corpo: { diaRefeicao: 'Segunda-feira', avaliacao: 0, texto: 'bom' } })).status, 400);
    assert.equal((await chamar(env, 'POST', '/api/comentarios', { corpo: { diaRefeicao: 'Segunda-feira', avaliacao: 4, texto: 'a' } })).status, 400);
  });

  test('público vê 3 recentes por padrão, com "temMais" para o botão Ver mais', async () => {
    const r = await chamar(env, 'GET', '/api/comentarios');
    assert.equal(r.json.itens.length, 3);
    assert.equal(r.json.total, 7);
    assert.equal(r.json.temMais, true);
    assert.equal(r.json.itens[0].texto, 'Comentário número 7', 'o mais recente vem primeiro');
    assert.ok(!('nome' in r.json.itens[0]), 'público não expõe nome de quem comentou');
  });

  test('paginação chega até o fim sem repetir comentários', async () => {
    const vistos = new Set();
    let pagina = 1;
    let temMais = true;
    while (temMais) {
      const r = await chamar(env, 'GET', `/api/comentarios?pagina=${pagina}&tamanho=3`);
      r.json.itens.forEach((c) => vistos.add(c.id));
      temMais = r.json.temMais;
      pagina += 1;
    }
    assert.equal(vistos.size, 7);
  });

  test('filtro por dia da semana', async () => {
    const r = await chamar(env, 'GET', '/api/comentarios?dia=Segunda-feira&tamanho=50');
    assert.ok(r.json.itens.length > 0);
    assert.ok(r.json.itens.every((c) => c.diaRefeicao === 'Segunda-feira'));
    assert.equal((await chamar(env, 'GET', '/api/comentarios?dia=Sabado')).status, 400);
    assert.equal((await chamar(env, 'GET', '/api/comentarios?dia=todos&tamanho=50')).json.total, 7);
  });

  test('resumo traz total, média geral e média por dia', async () => {
    const r = await chamar(env, 'GET', '/api/comentarios/resumo');
    assert.equal(r.json.total, 7);
    assert.equal(r.json.porDia.length, 5);
    assert.equal(typeof r.json.media, 'number');
  });

  test('nutricionista vê o nome de quem comentou (e "null" quando anônimo)', async () => {
    const nutri = await criarNutricionista(env);
    const r = await chamar(env, 'GET', '/api/comentarios/admin?tamanho=50', { token: nutri.token });
    assert.equal(r.json.total, 7);
    assert.ok(r.json.itens.some((c) => c.nome === 'Ana Aluna'));
    assert.ok(r.json.itens.some((c) => c.nome === null));
  });
});

// ---------------------------------------------------------------------
describe('Restrições alimentares: catálogo e formulário padronizado', () => {
  let env;
  let nutri;
  before(async () => {
    env = criarAmbiente();
    nutri = await criarNutricionista(env);
  });

  const ids = () => env.DB.prepare("SELECT id_restricao, nome FROM RestricoesAlimentares ORDER BY nome").all().results;

  test('catálogo público lista as restrições padronizadas com categoria', async () => {
    const r = await chamar(env, 'GET', '/api/restricoes');
    assert.ok(r.json.length >= 9);
    assert.ok(r.json.every((x) => x.categoria));
    assert.ok(r.json.some((x) => x.nome === 'Glúten' && x.categoria === 'Intolerância'));
  });

  test('formulário: resposta "não" dispensa lista; "sim" exige ao menos uma restrição ou descrição', async () => {
    assert.equal((await chamar(env, 'POST', '/api/formularios/restricao', { corpo: { nome: 'João Silva', matricula: '1', possuiRestricao: false } })).status, 201);
    const vazio = await chamar(env, 'POST', '/api/formularios/restricao', { corpo: { nome: 'João Silva', matricula: '2', possuiRestricao: true, restricoes: [] } });
    assert.equal(vazio.status, 400);
    assert.match(vazio.json.mensagem, /pelo menos uma/);
  });

  test('restrição com id inexistente é recusada', async () => {
    const r = await chamar(env, 'POST', '/api/formularios/restricao', { corpo: { nome: 'Maria Souza', matricula: '3', possuiRestricao: true, restricoes: [999] } });
    assert.equal(r.status, 400);
  });

  test('vínculos com o catálogo são gravados e o resumo de tipo é legível', async () => {
    const gluten = ids().find((x) => x.nome === 'Glúten').id_restricao;
    const lactose = ids().find((x) => x.nome === 'Lactose').id_restricao;
    const r = await chamar(env, 'POST', '/api/formularios/restricao', {
      corpo: { nome: 'Maria Souza', matricula: '3', possuiRestricao: true, restricoes: [gluten, lactose], descricao: 'Sintomas leves' },
    });
    assert.equal(r.status, 201);
    const linha = env.DB.prepare('SELECT tipo_restricao, descricao FROM FormulariosRestricao WHERE id_formulario = ?').bind(r.json.id).first();
    assert.equal(linha.tipo_restricao, 'Glúten, Lactose');
    assert.equal(linha.descricao, 'Sintomas leves');
  });

  test('um aluno tem um registro ativo: o último envio substitui na listagem, com contador de envios', async () => {
    await chamar(env, 'POST', '/api/formularios/restricao', { corpo: { nome: 'Maria Souza', matricula: '3', possuiRestricao: false } });
    const r = await chamar(env, 'GET', '/api/formularios/restricao/admin', { token: nutri.token });
    const maria = r.json.itens.filter((i) => i.matricula === '3');
    assert.equal(maria.length, 1, 'apenas um item por matrícula');
    assert.equal(maria[0].possuiRestricao, false);
    assert.equal(maria[0].envios, 2);
  });

  test('filtro por restrição e resumo global por categoria/quantidade', async () => {
    await chamar(env, 'POST', '/api/formularios/restricao', { corpo: { nome: 'Pedro Lima', matricula: '4', possuiRestricao: true, restricoes: [ids().find((x) => x.nome === 'Glúten').id_restricao] } });
    const gluten = ids().find((x) => x.nome === 'Glúten').id_restricao;
    const filtrado = await chamar(env, 'GET', `/api/formularios/restricao/admin?restricao=${gluten}`, { token: nutri.token });
    assert.equal(filtrado.json.total, 1);
    assert.equal(filtrado.json.itens[0].matricula, '4');
    const resumo = (await chamar(env, 'GET', '/api/formularios/restricao/admin', { token: nutri.token })).json.resumo;
    assert.equal(resumo.comRestricao, 1);
    assert.equal(resumo.semRestricao, 2, 'matrículas 1 e 3 (última resposta: sem restrição)');
    assert.equal(resumo.porRestricao.find((x) => x.nome === 'Glúten').quantidade, 1);
  });

  test('aluno logado: o perfil de restrições acompanha a resposta mais recente', async () => {
    const aluno = await criarAluno(env, 'Carla Dias', 'carla@aluno.com', '5');
    const lactose = ids().find((x) => x.nome === 'Lactose').id_restricao;
    await chamar(env, 'POST', '/api/formularios/restricao', { token: aluno.token, corpo: { nome: 'Carla Dias', matricula: '5', possuiRestricao: true, restricoes: [lactose] } });
    let vinculos = env.DB.prepare('SELECT COUNT(*) AS n FROM UserRestricoes WHERE id_user = ?').bind(aluno.id).first().n;
    assert.equal(vinculos, 1);
    await chamar(env, 'POST', '/api/formularios/restricao', { token: aluno.token, corpo: { nome: 'Carla Dias', matricula: '5', possuiRestricao: false } });
    vinculos = env.DB.prepare('SELECT COUNT(*) AS n FROM UserRestricoes WHERE id_user = ?').bind(aluno.id).first().n;
    assert.equal(vinculos, 0);
  });

  test('nutricionista cadastra nova restrição; nome repetido é recusado', async () => {
    const novo = await chamar(env, 'POST', '/api/restricoes', { token: nutri.token, corpo: { nome: 'Milho', categoria: 'alergia' } });
    assert.equal(novo.status, 201);
    assert.equal(novo.json.categoria, 'Alergia');
    assert.equal((await chamar(env, 'POST', '/api/restricoes', { token: nutri.token, corpo: { nome: 'MILHO' } })).status, 409);
  });
});

// ---------------------------------------------------------------------
describe('Avisos: tipos, expiração, leitura por aluno', () => {
  let env;
  let nutri;
  let aluno;
  before(async () => {
    env = criarAmbiente();
    nutri = await criarNutricionista(env);
    aluno = await criarAluno(env);
  });

  test('aviso exige tipo válido e expiração conhecida', async () => {
    assert.equal((await chamar(env, 'POST', '/api/avisos', { token: nutri.token, corpo: { texto: 'Oi tudo', tipo: 'Qualquer' } })).status, 400);
    assert.equal((await chamar(env, 'POST', '/api/avisos', { token: nutri.token, corpo: { texto: 'Oi tudo', expiracao: 'mes' } })).status, 400);
  });

  test('publica avisos com tipo e expiração; o público vê os ativos', async () => {
    const urgente = await chamar(env, 'POST', '/api/avisos', { token: nutri.token, corpo: { texto: 'Falta de água amanhã', tipo: 'Urgente', expiracao: '1' } });
    assert.equal(urgente.status, 201);
    assert.equal(urgente.json.tipo, 'Urgente');
    assert.ok(urgente.json.dataExpiracao);
    await chamar(env, 'POST', '/api/avisos', { token: nutri.token, corpo: { texto: 'Aviso de fim de semana', tipo: 'Importante', expiracao: 'fim-semana' } });
    const publico = await chamar(env, 'GET', '/api/avisos');
    assert.ok(publico.json.length >= 2);
    const fds = publico.json.find((a) => a.texto.startsWith('Aviso de fim'));
    assert.match(fds.dataExpiracao, /T23:59:59-03:00$/);
  });

  test('aviso expirado some do público, mas continua na área administrativa', async () => {
    const r = await chamar(env, 'POST', '/api/avisos', { token: nutri.token, corpo: { texto: 'Antigo expirado', expiracao: 'nunca' } });
    env.DB.prepare('UPDATE Avisos SET data_expiracao = ? WHERE id_aviso = ?').bind('2000-01-01T00:00:00-03:00', r.json.id).run();
    const publico = await chamar(env, 'GET', '/api/avisos');
    assert.ok(!publico.json.some((a) => a.texto === 'Antigo expirado'));
    const admin = await chamar(env, 'GET', '/api/avisos/admin', { token: nutri.token });
    assert.equal(admin.json.find((a) => a.texto === 'Antigo expirado').expirado, true);
  });

  test('aluno vê contador de não lidos; marca um aviso e depois todos', async () => {
    const antes = await chamar(env, 'GET', '/api/avisos/meus', { token: aluno.token });
    const total = antes.json.avisos.length;
    assert.equal(antes.json.naoLidos, total);
    const primeiro = antes.json.avisos[0].id;
    assert.equal((await chamar(env, 'POST', `/api/avisos/${primeiro}/visualizar`, { token: aluno.token })).status, 200);
    const meio = await chamar(env, 'GET', '/api/avisos/meus', { token: aluno.token });
    assert.equal(meio.json.naoLidos, total - 1);
    await chamar(env, 'POST', '/api/avisos/visualizar-todos', { token: aluno.token });
    const fim = await chamar(env, 'GET', '/api/avisos/meus', { token: aluno.token });
    assert.equal(fim.json.naoLidos, 0);
  });

  test('marcar como lido um aviso inexistente retorna 404', async () => {
    assert.equal((await chamar(env, 'POST', '/api/avisos/9999/visualizar', { token: aluno.token })).status, 404);
  });

  test('encerrar aviso remove do público (exclusão lógica)', async () => {
    const lista = await chamar(env, 'GET', '/api/avisos');
    const id = lista.json[0].id;
    assert.equal((await chamar(env, 'DELETE', `/api/avisos/${id}`, { token: nutri.token })).status, 204);
    assert.ok(!(await chamar(env, 'GET', '/api/avisos')).json.some((a) => a.id === id));
    assert.equal((await chamar(env, 'DELETE', `/api/avisos/${id}`, { token: nutri.token })).status, 404);
  });
});

// ---------------------------------------------------------------------
describe('Interesse em pratos (mantido do 3.3)', () => {
  test('aluno registra interesse; prato inexistente é recusado; repetir não duplica', async () => {
    const env = criarAmbiente();
    const aluno = await criarAluno(env, 'Ivo Interesse', 'ivo@aluno.com', '77');
    const id = env.DB.prepare('SELECT id_prato FROM Pratos LIMIT 1').first().id_prato;
    assert.equal((await chamar(env, 'POST', '/api/interesses', { token: aluno.token, corpo: { idPrato: id } })).status, 200);
    assert.equal((await chamar(env, 'POST', '/api/interesses', { token: aluno.token, corpo: { idPrato: id } })).status, 200);
    const total = env.DB.prepare('SELECT COUNT(*) AS n FROM InteressePratos WHERE id_user = ?').bind(aluno.id).first().n;
    assert.equal(total, 1);
    assert.equal((await chamar(env, 'POST', '/api/interesses', { token: aluno.token, corpo: { idPrato: 99999 } })).status, 400);
    assert.equal((await chamar(env, 'POST', '/api/interesses', { corpo: { idPrato: id } })).status, 401);
  });
});

describe('Contagem de presenças: declarados, efetivados, excedente e faltas', () => {
  let env;
  let nutri;
  let alunos;
  before(async () => {
    env = criarAmbiente();
    nutri = await criarNutricionista(env);
    alunos = [];
    for (let i = 0; i < 4; i += 1) {
      alunos.push(await criarAluno(env, `Aluno ${i}`, `aluno${i}@a.com`, `M${i}`));
    }
  });

  test('aluno agenda um dia da semana atual; dia já passado é recusado', async () => {
    if (indiceHoje > 4) {
      const r = await chamar(env, 'POST', '/api/presencas/marcar', { token: alunos[0].token, corpo: { dia: 'Segunda-feira' } });
      assert.equal(r.status, 409);
      return;
    }
    const passado = indiceHoje > 0 ? DIAS[0] : null;
    if (passado) {
      const r = await chamar(env, 'POST', '/api/presencas/marcar', { token: alunos[0].token, corpo: { dia: passado } });
      assert.equal(r.status, 409);
      assert.match(r.json.mensagem, /já passou/);
    }
    const futuro = DIAS[indiceHoje];
    const r = await chamar(env, 'POST', '/api/presencas/marcar', { token: alunos[0].token, corpo: { dia: futuro } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const de = await chamar(env, 'GET', '/api/presencas/minhas', { token: alunos[0].token });
    assert.ok(de.json.dias.includes(futuro));
    assert.equal((await chamar(env, 'DELETE', `/api/presencas/marcar/${encodeURIComponent(futuro)}`, { token: alunos[0].token })).status, 204);
    assert.ok(!(await chamar(env, 'GET', '/api/presencas/minhas', { token: alunos[0].token })).json.dias.includes(futuro));
  });

  test('cálculo: excedente quando chegam mais do que o declarado; faltas quando chegam menos', async () => {
    // Usa a semana atual com declarados inseridos diretamente (independe do dia da semana).
    const dia = 'Quinta-feira';
    for (const aluno of alunos) {
      env.DB.prepare('INSERT OR IGNORE INTO PresencasMarcadas (user_id, dia, semana, data_marcacao) VALUES (?, ?, ?, ?)')
        .bind(aluno.id, dia, semanaAtual, '2026').run();
    }
    // 4 declarados; 6 efetivados -> excedente 2, faltas 0
    let r = await chamar(env, 'POST', '/api/presencas/registradas', { token: nutri.token, corpo: { semana: semanaAtual, dia, quantidade: 6 } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    let resumo = await chamar(env, 'GET', `/api/presencas/resumo?semana=${semanaAtual}`, { token: nutri.token });
    let linha = resumo.json.dias.find((d) => d.dia === dia);
    assert.equal(linha.declarados, 4);
    assert.equal(linha.efetivados, 6);
    assert.equal(linha.excedente, 2);
    assert.equal(linha.faltas, 0);

    // 4 declarados; 1 efetivado -> faltas 3, excedente 0
    await chamar(env, 'POST', '/api/presencas/registradas', { token: nutri.token, corpo: { semana: semanaAtual, dia, quantidade: 1 } });
    resumo = await chamar(env, 'GET', `/api/presencas/resumo?semana=${semanaAtual}`, { token: nutri.token });
    linha = resumo.json.dias.find((d) => d.dia === dia);
    assert.equal(linha.excedente, 0);
    assert.equal(linha.faltas, 3);
    assert.equal(resumo.json.totais.faltas, 3);
    assert.equal(resumo.json.diasRegistrados, 1);
  });

  test('dia ainda não registrado aparece como pendente (sem excedente/faltas)', async () => {
    const resumo = await chamar(env, 'GET', `/api/presencas/resumo?semana=${semanaAtual}`, { token: nutri.token });
    const segunda = resumo.json.dias.find((d) => d.dia === 'Segunda-feira');
    assert.equal(segunda.registrado, false);
    assert.equal(segunda.efetivados, null);
    assert.equal(segunda.excedente, null);
    assert.equal(segunda.faltas, null);
  });

  test('registro de contagem valida quantidade e semana', async () => {
    const base = { semana: semanaAtual, dia: 'Sexta-feira' };
    assert.equal((await chamar(env, 'POST', '/api/presencas/registradas', { token: nutri.token, corpo: { ...base, quantidade: -1 } })).status, 400);
    assert.equal((await chamar(env, 'POST', '/api/presencas/registradas', { token: nutri.token, corpo: { ...base, quantidade: 2.5 } })).status, 400);
    assert.equal((await chamar(env, 'POST', '/api/presencas/registradas', { token: nutri.token, corpo: { ...base, quantidade: 999999 } })).status, 400);
    assert.equal((await chamar(env, 'POST', '/api/presencas/registradas', { token: nutri.token, corpo: { semana: '2026-11-25', dia: 'Sexta-feira', quantidade: 3 } })).status, 400, 'quarta não é segunda');
    assert.equal((await chamar(env, 'GET', '/api/presencas/resumo?semana=2026-11-25', { token: nutri.token })).status, 400);
  });

  test('declarados não acumulam entre semanas (bug corrigido do 3.3)', async () => {
    const semanaPassada = T.somarDias(semanaAtual, -7);
    const aluno = alunos[0];
    env.DB.prepare('INSERT OR IGNORE INTO PresencasMarcadas (user_id, dia, semana, data_marcacao) VALUES (?, ?, ?, ?)')
      .bind(aluno.id, 'Segunda-feira', semanaPassada, '2026').run();
    const atual = await chamar(env, 'GET', `/api/presencas/resumo?semana=${semanaAtual}`, { token: nutri.token });
    const passada = await chamar(env, 'GET', `/api/presencas/resumo?semana=${semanaPassada}`, { token: nutri.token });
    assert.equal(passada.json.dias.find((d) => d.dia === 'Segunda-feira').declarados, 1);
    assert.equal(atual.json.dias.find((d) => d.dia === 'Segunda-feira').declarados, 0);
    assert.equal(passada.json.semanaAnterior, T.somarDias(semanaPassada, -7));
  });

  test('painel da nutricionista reúne os indicadores', async () => {
    const r = await chamar(env, 'GET', '/api/admin/painel', { token: nutri.token });
    assert.equal(r.status, 200);
    assert.equal(r.json.semana, semanaAtual);
    assert.equal(r.json.declaradosSemana, 4);
    assert.equal(r.json.efetivadosSemana, 1);
    assert.equal(typeof r.json.avisosAtivos, 'number');
  });
});

// ---------------------------------------------------------------------
describe('Utilitários de data (fuso de Brasília e semanas)', () => {
  test('semana começa na segunda e dias de fim de semana pertencem à semana anterior', () => {
    assert.equal(T.semanaDe('2026-11-26'), '2026-11-23'); // quinta
    assert.equal(T.semanaDe('2026-11-23'), '2026-11-23'); // segunda
    assert.equal(T.semanaDe('2026-11-29'), '2026-11-23'); // domingo
    assert.equal(T.somarDias('2026-11-30', 1), '2026-12-01');
  });

  test('validação de semana aceita só segundas-feiras reais', () => {
    assert.equal(T.ehSegundaValida('2026-11-23'), true);
    assert.equal(T.ehSegundaValida('2026-11-24'), false);
    assert.equal(T.ehSegundaValida('2026-02-30'), false);
    assert.equal(T.ehSegundaValida('23/11/2026'), false);
  });

  test('fim da semana é a sexta seguinte às 23:59 de Brasília', () => {
    assert.equal(T.fimDaSemanaBR(new Date('2026-11-26T15:00:00Z')), '2026-11-27T23:59:59-03:00');
    assert.equal(T.fimDaSemanaBR(new Date('2026-11-28T15:00:00Z')), '2026-12-04T23:59:59-03:00');
  });

  test('timestamp usa o fuso de Brasília (UTC-3)', () => {
    assert.equal(T.timestampBR(new Date('2026-11-26T02:30:00Z')), '2026-11-25T23:30:00-03:00');
  });

  test('rótulo da semana', () => {
    assert.equal(T.rotuloSemana('2026-11-23'), '23/11 a 27/11/2026');
  });
});

// ---------------------------------------------------------------------
describe('Arquivos SQL: schema.sql e seed.sql devem ser idênticos às migrações', () => {
  test('schema.sql == migrations/0001_schema.sql e seed.sql == migrations/0002_seed.sql', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
    assert.equal(readFileSync(join(raiz, 'schema.sql'), 'utf8'), readFileSync(join(raiz, 'migrations', '0001_schema.sql'), 'utf8'));
    assert.equal(readFileSync(join(raiz, 'seed.sql'), 'utf8'), readFileSync(join(raiz, 'migrations', '0002_seed.sql'), 'utf8'));
  });
});
