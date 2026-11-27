// =====================================================================
// TCC-Res 3.4 — API do Restaurante IFRJ Campus Pinheiral
// Executa no Cloudflare Workers e usa o banco D1 (SQLite).
//
// Os endereços da API são os mesmos do TCC 3.3, com as mudanças listadas
// em MUDANCAS_3.4.md. Todas as respostas são JSON com campos em camelCase.
// =====================================================================

import { HttpErro, jsonResp, lerJson } from './lib/http.js';
import { gerarHashSenha, verificarSenha, gerarToken, textosIguais } from './lib/seguranca.js';
import * as V from './lib/validacao.js';
import * as T from './lib/tempo.js';

const { DIAS } = V;
const HORAS_DE_SESSAO = 8;
const TAMANHO_MAXIMO_FOTO = 5 * 1024 * 1024;

// ---------------------------------------------------------------------
// Acesso ao banco (D1)
// ---------------------------------------------------------------------
const um = (db, sql, ...p) => db.prepare(sql).bind(...p).first();
const todos = async (db, sql, ...p) => (await db.prepare(sql).bind(...p).all()).results ?? [];
const executar = (db, sql, ...p) => db.prepare(sql).bind(...p).run();
const preparar = (db, sql, ...p) => db.prepare(sql).bind(...p);

// ---------------------------------------------------------------------
// Conversão do formato do banco para o formato da API (camelCase)
// ---------------------------------------------------------------------
const usuarioDto = (u) => ({
  id: u.id_user,
  nome: u.nome,
  email: u.email,
  matricula: u.matricula ?? null,
  tipoUsuario: u.tipo_usuario,
});

const pratoDto = (p) => ({
  id: p.id_prato,
  nome: p.nome,
  descricao: p.descricao ?? null,
  ingredientes: p.ingredientes ?? null,
  modoPreparo: p.modo_preparo ?? null,
  tempoPreparo: p.tempo_preparo ?? null,
  fotoUrl: p.foto_url ?? null,
});

const avisoDto = (a) => ({
  id: a.id_aviso,
  texto: a.texto,
  tipo: a.tipo,
  dataCriacao: a.data_criacao,
  dataExpiracao: a.data_expiracao ?? null,
});

const comentarioDto = (c) => ({
  id: c.id_comentario,
  diaRefeicao: c.dia_refeicao,
  avaliacao: c.avaliacao,
  texto: c.comentario,
  dataComentario: c.data_comentario,
});

const arredondar = (n, casas = 1) => (n === null || n === undefined ? null : Math.round(n * 10 ** casas) / 10 ** casas);

// ---------------------------------------------------------------------
// Sessão e autorização
// ---------------------------------------------------------------------
async function sessaoDoRequest(request, db) {
  const cabecalho = request.headers.get('Authorization') || '';
  if (!cabecalho.startsWith('Bearer ')) return null;
  const token = cabecalho.slice(7).trim();
  if (!token || token.length > 200) return null;

  const linha = await um(
    db,
    `SELECT s.expira_em, u.id_user, u.nome, u.email, u.matricula, u.tipo_usuario
       FROM Sessoes s JOIN Users u ON u.id_user = s.id_user
      WHERE s.token = ?`,
    token,
  );
  if (!linha) return null;
  if (linha.expira_em <= T.timestampBR()) {
    await executar(db, 'DELETE FROM Sessoes WHERE token = ?', token);
    return null;
  }
  return { ...usuarioDto(linha), token, expiraEm: linha.expira_em };
}

/**
 * Verifica o acesso exigido pela rota.
 *  - publico:        qualquer pessoa (ignora sessão)
 *  - opcional:       usa a sessão se existir, mas não exige
 *  - logado:         exige qualquer sessão válida
 *  - aluno:          exige sessão de aluno
 *  - nutricionista:  exige sessão de nutricionista
 */
async function autenticar(request, db, acesso) {
  if (acesso === 'publico') return null;
  const usuario = await sessaoDoRequest(request, db);
  if (acesso === 'opcional') return usuario;
  if (!usuario) throw new HttpErro(401, 'Faça login para continuar.');
  if (acesso === 'aluno' && usuario.tipoUsuario !== 'aluno') {
    throw new HttpErro(403, 'Esta ação é exclusiva para alunos.');
  }
  if (acesso === 'nutricionista' && usuario.tipoUsuario !== 'nutricionista') {
    throw new HttpErro(403, 'Acesso restrito à nutricionista.');
  }
  return usuario;
}

// ---------------------------------------------------------------------
// Utilidades de consulta
// ---------------------------------------------------------------------
function paginacao(url, { padrao = 10, maximo = 50 } = {}) {
  const pagina = V.inteiro(url.searchParams.get('pagina') ?? undefined, { min: 1, max: 100000, padrao: 1, campo: 'Página' });
  const tamanho = V.inteiro(url.searchParams.get('tamanho') ?? undefined, { min: 1, max: maximo, padrao: padrao, campo: 'Tamanho da página' });
  return { pagina, tamanho, offset: (pagina - 1) * tamanho };
}

/** Lê ?dia=... ; "todos" ou ausência significa sem filtro. */
function filtroDia(url) {
  const bruto = url.searchParams.get('dia');
  if (!bruto || bruto === 'todos') return null;
  const dia = V.diaCanonico(bruto);
  if (!dia) throw new HttpErro(400, 'Dia da semana inválido.');
  return dia;
}

/** Resumo de comentários: total, média geral e média por dia. */
async function resumoComentarios(db) {
  const geral = await um(db, 'SELECT COUNT(*) AS quantidade, AVG(avaliacao) AS media FROM Comentarios');
  const porDia = await todos(
    db,
    'SELECT dia_refeicao AS dia, COUNT(*) AS quantidade, AVG(avaliacao) AS media FROM Comentarios GROUP BY dia_refeicao',
  );
  const mapa = new Map(porDia.map((r) => [r.dia, r]));
  return {
    total: geral?.quantidade ?? 0,
    media: arredondar(geral?.media),
    porDia: DIAS.map((dia) => ({
      dia,
      quantidade: mapa.get(dia)?.quantidade ?? 0,
      media: arredondar(mapa.get(dia)?.media),
    })),
  };
}

/** CTE com o último formulário de cada matrícula (um aluno = um registro ativo). */
const CTE_ULTIMOS_FORMULARIOS = `WITH ultimos AS (
  SELECT MAX(id_formulario) AS id FROM FormulariosRestricao GROUP BY matricula
)`;

/**
 * Resumo da contagem de presenças de uma semana.
 *  - declarados: alunos que agendaram (PresencasMarcadas)
 *  - efetivados: quantos realmente compareceram (PresencasRegistradas)
 *  - excedente:  efetivados acima dos declarados
 *  - faltas:     declarados que não compareceram
 * Excedente e faltas só são calculados depois que o dia é registrado.
 */
async function resumoPresencas(db, semana) {
  const declaradosPorDia = await todos(
    db,
    'SELECT dia, COUNT(*) AS n FROM PresencasMarcadas WHERE semana = ? GROUP BY dia',
    semana,
  );
  const efetivadosPorDia = await todos(
    db,
    'SELECT dia, quantidade FROM PresencasRegistradas WHERE semana = ?',
    semana,
  );
  const mapaDeclarados = new Map(declaradosPorDia.map((r) => [r.dia, r.n]));
  const mapaEfetivados = new Map(efetivadosPorDia.map((r) => [r.dia, r.quantidade]));

  const dias = DIAS.map((dia, indice) => {
    const declarados = mapaDeclarados.get(dia) ?? 0;
    const registrado = mapaEfetivados.has(dia);
    const efetivados = registrado ? mapaEfetivados.get(dia) : null;
    return {
      dia,
      data: T.somarDias(semana, indice),
      encerrado: T.diaEncerrado(semana, indice),
      declarados,
      registrado,
      efetivados,
      excedente: registrado ? Math.max(0, efetivados - declarados) : null,
      faltas: registrado ? Math.max(0, declarados - efetivados) : null,
    };
  });

  const registrados = dias.filter((d) => d.registrado);
  const soma = (lista, campo) => lista.reduce((total, item) => total + (item[campo] ?? 0), 0);
  const media = (lista, campo) => (lista.length ? arredondar(soma(lista, campo) / lista.length) : null);

  return {
    semana,
    rotulo: T.rotuloSemana(semana),
    semanaAnterior: T.somarDias(semana, -7),
    proximaSemana: T.somarDias(semana, 7),
    semanaAtual: T.semanaAtual(),
    dias,
    diasRegistrados: registrados.length,
    totais: {
      declarados: soma(dias, 'declarados'),
      efetivados: soma(registrados, 'efetivados'),
      excedente: soma(registrados, 'excedente'),
      faltas: soma(registrados, 'faltas'),
    },
    medias: {
      declarados: media(dias, 'declarados'),
      efetivados: media(registrados, 'efetivados'),
      excedente: media(registrados, 'excedente'),
      faltas: media(registrados, 'faltas'),
    },
  };
}

// ---------------------------------------------------------------------
// Imagens de pratos (R2 opcional)
// ---------------------------------------------------------------------
/** Identifica o tipo real do arquivo pelos primeiros bytes (não confia no nome nem no MIME enviado). */
function detectarImagem(bytes) {
  const comeca = (assinatura, deslocamento = 0) =>
    assinatura.every((b, i) => bytes[deslocamento + i] === b);
  if (comeca([0xff, 0xd8, 0xff])) return { ext: 'jpg', mime: 'image/jpeg' };
  if (comeca([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: 'png', mime: 'image/png' };
  if (comeca([0x52, 0x49, 0x46, 0x46]) && comeca([0x57, 0x45, 0x42, 0x50], 8)) return { ext: 'webp', mime: 'image/webp' };
  return null;
}

async function servirUpload(request, env, caminho) {
  const arquivo = caminho.slice('/uploads/'.length);
  if (request.method === 'GET' && env.FOTOS && /^pratos\/[\w.-]+\.(jpe?g|png|webp)$/i.test(arquivo)) {
    const objeto = await env.FOTOS.get(arquivo);
    if (objeto) {
      return new Response(objeto.body, {
        headers: {
          'Content-Type': objeto.httpMetadata?.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
  }
  // Fotos antigas (pasta public/uploads) e arquivos estáticos.
  return env.ASSETS.fetch(request);
}

// ---------------------------------------------------------------------
// Roteador
// ---------------------------------------------------------------------
const ROTAS = [];

function rota(metodo, caminho, acesso, handler) {
  const nomes = [];
  const padrao = new RegExp(
    '^' + caminho.replace(/:(\w+)/g, (_, nome) => {
      nomes.push(nome);
      return '([^/]+)';
    }) + '/?$',
  );
  ROTAS.push({ metodo, padrao, nomes, acesso, handler });
}

function parametroSeguro(valor) {
  try {
    return decodeURIComponent(valor);
  } catch {
    throw new HttpErro(400, 'Endereço inválido.');
  }
}

async function tratarApi(request, env, url) {
  const caminho = url.pathname.replace(/\/+$/, '') || '/';
  let caminhoExiste = false;

  for (const r of ROTAS) {
    const m = r.padrao.exec(caminho);
    if (!m) continue;
    caminhoExiste = true;
    if (r.metodo !== request.method) continue;

    const params = {};
    r.nomes.forEach((nome, i) => {
      params[nome] = parametroSeguro(m[i + 1]);
    });
    const usuario = await autenticar(request, env.DB, r.acesso);
    return r.handler({ request, env, db: env.DB, url, params, usuario });
  }

  if (caminhoExiste) throw new HttpErro(405, 'Método não permitido para este endereço.');
  throw new HttpErro(404, 'Endereço não encontrado.');
}

function respostaDeErro(erro) {
  if (erro instanceof HttpErro) return jsonResp({ mensagem: erro.message }, erro.status);
  if (String(erro?.message ?? '').includes('UNIQUE constraint failed')) {
    return jsonResp({ mensagem: 'Já existe um registro com estes dados.' }, 409);
  }
  console.error('Erro não tratado:', erro);
  return jsonResp({ mensagem: 'Erro interno do servidor. Tente novamente em instantes.' }, 500);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/uploads/')) return await servirUpload(request, env, url.pathname);
      if (!url.pathname.startsWith('/api')) return env.ASSETS.fetch(request);
      return await tratarApi(request, env, url);
    } catch (erro) {
      return respostaDeErro(erro);
    }
  },
};

// =====================================================================
// SISTEMA
// =====================================================================

rota('GET', '/api/teste', 'publico', () => jsonResp({ mensagem: 'API do TCC funcionando!' }));

rota('GET', '/api/health', 'publico', async ({ db }) => {
  try {
    await um(db, 'SELECT 1 AS ok');
    return jsonResp({ status: 'ok', banco: 'conectado' });
  } catch {
    return jsonResp({ status: 'erro', banco: 'inacessível' }, 503);
  }
});

// =====================================================================
// CONTAS E SESSÕES
// =====================================================================

rota('POST', '/api/alunos', 'publico', async ({ request, db }) => {
  const dados = await lerJson(request);
  const nome = V.texto(dados.nome, { min: 2, max: 100, campo: 'Nome' });
  const email = V.email(dados.email);
  const senha = V.senha(dados.senha);
  const matricula = V.texto(dados.matricula, { min: 1, max: 30, campo: 'Matrícula' });

  if (await um(db, 'SELECT 1 AS ok FROM Users WHERE email = ?', email)) {
    throw new HttpErro(409, 'Este e-mail já está cadastrado.');
  }
  const res = await executar(
    db,
    'INSERT INTO Users (nome, email, senha, tipo_usuario, matricula, data_cadastro) VALUES (?, ?, ?, ?, ?, ?)',
    nome, email, await gerarHashSenha(senha), 'aluno', matricula, T.timestampBR(),
  );
  return jsonResp(
    usuarioDto({ id_user: res.meta.last_row_id, nome, email, matricula, tipo_usuario: 'aluno' }),
    201,
  );
});

rota('POST', '/api/nutricionistas', 'publico', async ({ request, env, db }) => {
  const codigoCorreto = env.TCC_CODIGO_NUTRICIONISTA;
  if (!codigoCorreto) {
    throw new HttpErro(503, 'O código de cadastro da nutricionista ainda não foi configurado no servidor.');
  }
  const dados = await lerJson(request);
  const nome = V.texto(dados.nome, { min: 2, max: 100, campo: 'Nome' });
  const email = V.email(dados.email);
  const senha = V.senha(dados.senha);
  const codigo = typeof dados.codigoAutorizacao === 'string' ? dados.codigoAutorizacao.trim() : '';

  if (!codigo || !(await textosIguais(codigo, codigoCorreto))) {
    throw new HttpErro(403, 'Código de autorização inválido.');
  }
  if (await um(db, 'SELECT 1 AS ok FROM Users WHERE email = ?', email)) {
    throw new HttpErro(409, 'Este e-mail já está cadastrado.');
  }
  const res = await executar(
    db,
    'INSERT INTO Users (nome, email, senha, tipo_usuario, matricula, data_cadastro) VALUES (?, ?, ?, ?, ?, ?)',
    nome, email, await gerarHashSenha(senha), 'nutricionista', null, T.timestampBR(),
  );
  return jsonResp(
    usuarioDto({ id_user: res.meta.last_row_id, nome, email, matricula: null, tipo_usuario: 'nutricionista' }),
    201,
  );
});

rota('POST', '/api/login', 'publico', async ({ request, db }) => {
  const dados = await lerJson(request);
  const email = typeof dados.email === 'string' ? dados.email.trim().toLowerCase() : '';
  const senhaDigitada = typeof dados.senha === 'string' ? dados.senha : '';

  const linha = email ? await um(db, 'SELECT * FROM Users WHERE email = ?', email) : null;
  if (!linha || !(await verificarSenha(senhaDigitada, linha.senha))) {
    throw new HttpErro(401, 'E-mail ou senha inválidos.');
  }

  // Senha antiga (SHA-256 sem sal): regrava no formato novo, sem exigir nada do usuário.
  if (!linha.senha.startsWith('pbkdf2$')) {
    await executar(db, 'UPDATE Users SET senha = ? WHERE id_user = ?', await gerarHashSenha(senhaDigitada), linha.id_user);
  }

  const agora = T.timestampBR();
  const expiraEm = T.timestampBR(new Date(Date.now() + HORAS_DE_SESSAO * 60 * 60 * 1000));
  await executar(db, 'DELETE FROM Sessoes WHERE expira_em <= ?', agora);
  const token = gerarToken();
  await executar(db, 'INSERT INTO Sessoes (token, id_user, expira_em) VALUES (?, ?, ?)', token, linha.id_user, expiraEm);

  return jsonResp({ token, expiraEm, usuario: usuarioDto(linha) });
});

rota('POST', '/api/logout', 'publico', async ({ request, db }) => {
  const cabecalho = request.headers.get('Authorization') || '';
  if (cabecalho.startsWith('Bearer ')) {
    await executar(db, 'DELETE FROM Sessoes WHERE token = ?', cabecalho.slice(7).trim());
  }
  return jsonResp({ mensagem: 'Sessão encerrada.' });
});

rota('GET', '/api/sessao', 'logado', ({ usuario }) =>
  jsonResp({ valida: true, expiraEm: usuario.expiraEm, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, matricula: usuario.matricula, tipoUsuario: usuario.tipoUsuario } }),
);

// =====================================================================
// CARDÁPIO
// =====================================================================

rota('GET', '/api/cardapio/semana', 'publico', async ({ db }) => {
  const semana = T.semanaAtual();
  const linhas = await todos(
    db,
    `SELECT c.dia, c.sobremesa, p.id_prato, p.nome, p.descricao, p.ingredientes,
            p.modo_preparo, p.tempo_preparo, p.foto_url
       FROM CardapioSemanal c
       JOIN Pratos p ON p.id_prato = c.id_prato
      ORDER BY c.id_cardapio`,
  );
  const dias = DIAS.map((nome, indice) => {
    const doDia = linhas.filter((l) => l.dia === nome);
    return {
      nome,
      data: T.somarDias(semana, indice),
      encerrado: T.diaEncerrado(semana, indice),
      sobremesa: doDia.map((l) => l.sobremesa).find((s) => s && s.trim()) ?? null,
      pratos: doDia.map((l) => pratoDto({
        id_prato: l.id_prato, nome: l.nome, descricao: l.descricao, ingredientes: l.ingredientes,
        modo_preparo: l.modo_preparo, tempo_preparo: l.tempo_preparo, foto_url: l.foto_url,
      })),
    };
  });
  return jsonResp({ semana, rotulo: T.rotuloSemana(semana), dias });
});

rota('PUT', '/api/cardapio/semana', 'nutricionista', async ({ request, db }) => {
  const dados = await lerJson(request);
  if (!Array.isArray(dados.dias)) throw new HttpErro(400, 'Envie a lista de dias do cardápio.');

  const idsExistentes = new Set((await todos(db, 'SELECT id_prato FROM Pratos')).map((p) => p.id_prato));
  const planos = [];
  for (const item of dados.dias) {
    const dia = V.diaCanonico(item?.dia);
    if (!dia) throw new HttpErro(400, 'Dia da semana inválido no cardápio.');
    const ids = V.listaIds(item.pratos, { max: 15, permitirVazia: true, campo: `Pratos de ${dia}` });
    if (ids.some((id) => !idsExistentes.has(id))) throw new HttpErro(400, `Um prato de ${dia} não existe mais. Atualize a página.`);
    const sobremesa = V.textoOpcional(item.sobremesa, { max: 150, campo: `Sobremesa de ${dia}` });
    planos.push({ dia, ids, sobremesa });
  }

  // Cada dia é substituído inteiro, em uma única transação (D1 batch).
  const comandos = [];
  for (const plano of planos) {
    comandos.push(preparar(db, 'DELETE FROM CardapioSemanal WHERE dia = ?', plano.dia));
    for (const id of plano.ids) {
      comandos.push(preparar(db, 'INSERT INTO CardapioSemanal (dia, id_prato, sobremesa) VALUES (?, ?, ?)', plano.dia, id, plano.sobremesa));
    }
  }
  if (comandos.length) await db.batch(comandos);

  return jsonResp({ mensagem: 'Cardápio atualizado com sucesso!', dias: planos.length });
});

/** Adiciona um prato a um dia (fluxo "Cadastrar prato no cardápio"). Não remove os outros pratos do dia. */
rota('POST', '/api/cardapio', 'nutricionista', async ({ request, db }) => {
  const dados = await lerJson(request);
  const dia = V.diaCanonico(dados.dia);
  if (!dia) throw new HttpErro(400, 'Selecione um dia da semana válido.');
  const idPrato = V.inteiro(dados.idPrato, { min: 1, max: 2147483647, campo: 'Prato' });
  if (!(await um(db, 'SELECT 1 AS ok FROM Pratos WHERE id_prato = ?', idPrato))) {
    throw new HttpErro(400, 'Prato não encontrado.');
  }
  const sobremesa = V.textoOpcional(dados.sobremesa, { max: 150, campo: 'Sobremesa' });
  const comandos = [
    preparar(db, 'INSERT OR IGNORE INTO CardapioSemanal (dia, id_prato, sobremesa) VALUES (?, ?, ?)', dia, idPrato, sobremesa),
  ];
  if (sobremesa) {
    comandos.push(preparar(db, 'UPDATE CardapioSemanal SET sobremesa = ? WHERE dia = ?', sobremesa, dia));
  }
  await db.batch(comandos);
  return jsonResp({ mensagem: `Prato adicionado a ${dia}.`, dia, idPrato }, 201);
});

rota('DELETE', '/api/cardapio/semana', 'nutricionista', async ({ db }) => {
  await executar(db, 'DELETE FROM CardapioSemanal');
  return jsonResp(null, 204);
});

// =====================================================================
// PRATOS
// =====================================================================

rota('GET', '/api/pratos', 'publico', async ({ db }) => {
  const linhas = await todos(db, 'SELECT * FROM Pratos ORDER BY nome');
  return jsonResp(linhas.map(pratoDto));
});

function dadosDoPrato(dados) {
  return {
    nome: V.texto(dados.nome, { min: 2, max: 150, campo: 'Nome do prato' }),
    descricao: V.textoOpcional(dados.descricao, { max: 500, campo: 'Descrição' }),
    ingredientes: V.textoOpcional(dados.ingredientes, { max: 1500, campo: 'Ingredientes' }),
    modoPreparo: V.textoOpcional(dados.modoPreparo, { max: 3000, campo: 'Modo de preparo' }),
    tempoPreparo: dados.tempoPreparo === undefined || dados.tempoPreparo === null || dados.tempoPreparo === ''
      ? null
      : V.inteiro(dados.tempoPreparo, { min: 0, max: 1440, campo: 'Tempo de preparo' }),
    fotoUrl: V.urlFoto(dados.fotoUrl),
  };
}

rota('POST', '/api/pratos', 'nutricionista', async ({ request, db }) => {
  const p = dadosDoPrato(await lerJson(request));
  const res = await executar(
    db,
    `INSERT INTO Pratos (nome, descricao, ingredientes, modo_preparo, tempo_preparo, foto_url, data_cadastro)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    p.nome, p.descricao, p.ingredientes, p.modoPreparo, p.tempoPreparo, p.fotoUrl, T.timestampBR(),
  );
  const criado = await um(db, 'SELECT * FROM Pratos WHERE id_prato = ?', res.meta.last_row_id);
  return jsonResp(pratoDto(criado), 201);
});

rota('PUT', '/api/pratos/:id', 'nutricionista', async ({ request, db, params }) => {
  const id = V.inteiro(params.id, { min: 1, max: 2147483647, campo: 'Identificador do prato' });
  if (!(await um(db, 'SELECT 1 AS ok FROM Pratos WHERE id_prato = ?', id))) {
    throw new HttpErro(404, 'Prato não encontrado.');
  }
  const p = dadosDoPrato(await lerJson(request));
  await executar(
    db,
    `UPDATE Pratos SET nome = ?, descricao = ?, ingredientes = ?, modo_preparo = ?, tempo_preparo = ?, foto_url = ?
      WHERE id_prato = ?`,
    p.nome, p.descricao, p.ingredientes, p.modoPreparo, p.tempoPreparo, p.fotoUrl, id,
  );
  return jsonResp(pratoDto(await um(db, 'SELECT * FROM Pratos WHERE id_prato = ?', id)));
});

rota('DELETE', '/api/pratos/:id', 'nutricionista', async ({ db, params }) => {
  const id = V.inteiro(params.id, { min: 1, max: 2147483647, campo: 'Identificador do prato' });
  const res = await executar(db, 'DELETE FROM Pratos WHERE id_prato = ?', id);
  if (!res.meta.changes) throw new HttpErro(404, 'Prato não encontrado.');
  return jsonResp(null, 204);
});

rota('POST', '/api/upload/prato', 'nutricionista', async ({ request, env }) => {
  if (!env.FOTOS) {
    throw new HttpErro(503, 'O envio de fotos não está configurado no servidor. Use o campo "Link da foto" (https://...).');
  }
  const formulario = await request.formData().catch(() => null);
  const arquivo = formulario?.get('arquivo');
  if (!arquivo || typeof arquivo === 'string' || arquivo.size === 0) {
    throw new HttpErro(400, 'Selecione uma foto.');
  }
  if (arquivo.size > TAMANHO_MAXIMO_FOTO) throw new HttpErro(400, 'A imagem deve ter no máximo 5 MB.');

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = detectarImagem(bytes);
  if (!tipo) throw new HttpErro(400, 'Formato inválido. Use JPG, PNG ou WEBP.');

  const nome = `${crypto.randomUUID().replace(/-/g, '')}.${tipo.ext}`;
  await env.FOTOS.put(`pratos/${nome}`, bytes, { httpMetadata: { contentType: tipo.mime } });
  return jsonResp({ fotoUrl: `/uploads/pratos/${nome}` }, 201);
});

// =====================================================================
// COMENTÁRIOS
// =====================================================================

rota('GET', '/api/comentarios', 'publico', async ({ url, db }) => {
  const dia = filtroDia(url);
  const { pagina, tamanho, offset } = paginacao(url, { padrao: 3, maximo: 50 });
  const where = dia ? 'WHERE dia_refeicao = ?' : '';
  const parametros = dia ? [dia] : [];

  const total = (await um(db, `SELECT COUNT(*) AS n FROM Comentarios ${where}`, ...parametros))?.n ?? 0;
  const linhas = await todos(
    db,
    `SELECT id_comentario, dia_refeicao, avaliacao, comentario, data_comentario
       FROM Comentarios ${where}
      ORDER BY data_comentario DESC, id_comentario DESC
      LIMIT ? OFFSET ?`,
    ...parametros, tamanho, offset,
  );
  return jsonResp({
    itens: linhas.map(comentarioDto),
    total,
    pagina,
    tamanho,
    temMais: pagina * tamanho < total,
  });
});

rota('GET', '/api/comentarios/resumo', 'publico', async ({ db }) => jsonResp(await resumoComentarios(db)));

rota('POST', '/api/comentarios', 'opcional', async ({ request, db, usuario }) => {
  const dados = await lerJson(request);
  const dia = V.diaCanonico(dados.diaRefeicao);
  if (!dia) throw new HttpErro(400, 'Selecione o dia da refeição.');
  const avaliacao = V.inteiro(dados.avaliacao, { min: 1, max: 5, campo: 'Avaliação' });
  const texto = V.texto(dados.texto, { min: 3, max: 1000, campo: 'Comentário' });

  let idPrato = null;
  if (dados.idPrato !== undefined && dados.idPrato !== null && dados.idPrato !== '') {
    idPrato = V.inteiro(dados.idPrato, { min: 1, max: 2147483647, campo: 'Prato' });
    if (!(await um(db, 'SELECT 1 AS ok FROM Pratos WHERE id_prato = ?', idPrato))) {
      throw new HttpErro(400, 'O prato informado não existe.');
    }
  }

  const res = await executar(
    db,
    `INSERT INTO Comentarios (id_user, id_prato, comentario, dia_refeicao, avaliacao, data_comentario)
     VALUES (?, ?, ?, ?, ?, ?)`,
    usuario?.id ?? null, idPrato, texto, dia, avaliacao, T.timestampBR(),
  );
  return jsonResp({ id: res.meta.last_row_id, mensagem: 'Comentário enviado com sucesso!' }, 201);
});

rota('GET', '/api/comentarios/admin', 'nutricionista', async ({ url, db }) => {
  const dia = filtroDia(url);
  const { pagina, tamanho, offset } = paginacao(url, { padrao: 20, maximo: 100 });
  const where = dia ? 'WHERE c.dia_refeicao = ?' : '';
  const parametros = dia ? [dia] : [];

  const total = (await um(db, `SELECT COUNT(*) AS n FROM Comentarios c ${where}`, ...parametros))?.n ?? 0;
  const linhas = await todos(
    db,
    `SELECT c.id_comentario, c.dia_refeicao, c.avaliacao, c.comentario, c.data_comentario,
            u.nome, u.matricula
       FROM Comentarios c
       LEFT JOIN Users u ON u.id_user = c.id_user
       ${where}
      ORDER BY c.data_comentario DESC, c.id_comentario DESC
      LIMIT ? OFFSET ?`,
    ...parametros, tamanho, offset,
  );
  return jsonResp({
    itens: linhas.map((c) => ({
      ...comentarioDto(c),
      nome: c.nome ?? null,
      matricula: c.matricula ?? null,
    })),
    total,
    pagina,
    tamanho,
    temMais: pagina * tamanho < total,
    resumo: await resumoComentarios(db),
  });
});

// =====================================================================
// RESTRIÇÕES ALIMENTARES
// =====================================================================

rota('GET', '/api/restricoes', 'publico', async ({ db }) => {
  const linhas = await todos(
    db,
    'SELECT id_restricao, nome, descricao, categoria FROM RestricoesAlimentares WHERE ativo = 1 ORDER BY categoria, nome',
  );
  return jsonResp(linhas.map((r) => ({
    id: r.id_restricao,
    nome: r.nome,
    descricao: r.descricao ?? null,
    categoria: r.categoria,
  })));
});

rota('POST', '/api/restricoes', 'nutricionista', async ({ request, db }) => {
  const dados = await lerJson(request);
  const nome = V.texto(dados.nome, { min: 2, max: 60, campo: 'Nome da restrição' });
  const categoria = dados.categoria ? V.categoriaCanonica(dados.categoria) : 'Outra';
  if (!categoria) throw new HttpErro(400, 'Categoria inválida.');
  const descricao = V.textoOpcional(dados.descricao, { max: 255, campo: 'Descrição' });

  if (await um(db, 'SELECT 1 AS ok FROM RestricoesAlimentares WHERE lower(nome) = lower(?)', nome)) {
    throw new HttpErro(409, 'Esta restrição já está cadastrada.');
  }
  const res = await executar(
    db,
    'INSERT INTO RestricoesAlimentares (nome, descricao, categoria, ativo) VALUES (?, ?, ?, 1)',
    nome, descricao, categoria,
  );
  return jsonResp({ id: res.meta.last_row_id, nome, descricao, categoria }, 201);
});

rota('POST', '/api/formularios/restricao', 'opcional', async ({ request, db, usuario }) => {
  const dados = await lerJson(request);
  const nome = V.texto(dados.nome, { min: 3, max: 100, campo: 'Nome completo' });
  const matricula = V.texto(dados.matricula, { min: 1, max: 30, campo: 'Matrícula' });
  const possuiRestricao = dados.possuiRestricao === true;

  let ids = [];
  let descricao = null;
  let resumoNomes = null;

  if (possuiRestricao) {
    ids = V.listaIds(dados.restricoes ?? [], { max: 20, permitirVazia: true, campo: 'Restrições' });
    descricao = V.textoOpcional(dados.descricao, { max: 500, campo: 'Descrição' });
    if (!ids.length && !descricao) {
      throw new HttpErro(400, 'Selecione pelo menos uma restrição ou descreva a sua.');
    }
    if (ids.length) {
      const marcas = ids.map(() => '?').join(', ');
      const encontradas = await todos(
        db,
        `SELECT id_restricao, nome FROM RestricoesAlimentares WHERE ativo = 1 AND id_restricao IN (${marcas})`,
        ...ids,
      );
      if (encontradas.length !== ids.length) {
        throw new HttpErro(400, 'Uma das restrições selecionadas não está mais disponível. Atualize a página.');
      }
      resumoNomes = encontradas.map((r) => r.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ');
    }
  }

  const res = await executar(
    db,
    `INSERT INTO FormulariosRestricao (id_user, nome, matricula, possui_restricao, tipo_restricao, descricao, data_envio)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    usuario?.id ?? null, nome, matricula, possuiRestricao ? 1 : 0, resumoNomes, descricao, T.timestampBR(),
  );
  const idFormulario = res.meta.last_row_id;

  if (ids.length) {
    await db.batch(ids.map((id) =>
      preparar(db, 'INSERT INTO FormularioRestricoes (id_formulario, id_restricao) VALUES (?, ?)', idFormulario, id)));
  }

  // Para alunos logados, o perfil de restrições acompanha a resposta mais recente.
  if (usuario?.tipoUsuario === 'aluno') {
    const comandos = [preparar(db, 'DELETE FROM UserRestricoes WHERE id_user = ?', usuario.id)];
    for (const id of possuiRestricao ? ids : []) {
      comandos.push(preparar(db, 'INSERT INTO UserRestricoes (id_user, id_restricao) VALUES (?, ?)', usuario.id, id));
    }
    await db.batch(comandos);
  }

  return jsonResp({ id: idFormulario, mensagem: 'Formulário enviado com sucesso!' }, 201);
});

rota('GET', '/api/formularios/restricao/admin', 'nutricionista', async ({ url, db }) => {
  const restricaoId = url.searchParams.get('restricao');
  const idFiltro = restricaoId && restricaoId !== 'todas'
    ? V.inteiro(restricaoId, { min: 1, max: 2147483647, campo: 'Restrição' })
    : null;
  const { pagina, tamanho, offset } = paginacao(url, { padrao: 20, maximo: 100 });

  const filtro = idFiltro
    ? 'AND EXISTS (SELECT 1 FROM FormularioRestricoes fr WHERE fr.id_formulario = f.id_formulario AND fr.id_restricao = ?)'
    : '';
  const parametrosFiltro = idFiltro ? [idFiltro] : [];

  const total = (await um(
    db,
    `${CTE_ULTIMOS_FORMULARIOS}
     SELECT COUNT(*) AS n FROM FormulariosRestricao f JOIN ultimos u ON u.id = f.id_formulario
     WHERE 1 = 1 ${filtro}`,
    ...parametrosFiltro,
  ))?.n ?? 0;

  const linhas = await todos(
    db,
    `${CTE_ULTIMOS_FORMULARIOS}
     SELECT f.id_formulario, f.nome, f.matricula, f.possui_restricao, f.tipo_restricao, f.descricao, f.data_envio,
            (SELECT COUNT(*) FROM FormulariosRestricao x WHERE x.matricula = f.matricula) AS envios
       FROM FormulariosRestricao f JOIN ultimos u ON u.id = f.id_formulario
      WHERE 1 = 1 ${filtro}
      ORDER BY f.data_envio DESC, f.id_formulario DESC
      LIMIT ? OFFSET ?`,
    ...parametrosFiltro, tamanho, offset,
  );

  // Restrições de cada formulário listado (uma consulta só).
  const ids = linhas.map((l) => l.id_formulario);
  const vinculos = ids.length
    ? await todos(
      db,
      `SELECT fr.id_formulario, r.id_restricao, r.nome, r.categoria
         FROM FormularioRestricoes fr JOIN RestricoesAlimentares r ON r.id_restricao = fr.id_restricao
        WHERE fr.id_formulario IN (${ids.map(() => '?').join(', ')})`,
      ...ids,
    )
    : [];
  const porFormulario = new Map();
  for (const v of vinculos) {
    if (!porFormulario.has(v.id_formulario)) porFormulario.set(v.id_formulario, []);
    porFormulario.get(v.id_formulario).push({ id: v.id_restricao, nome: v.nome, categoria: v.categoria });
  }

  // Resumo: quantos alunos (último formulário) têm cada restrição.
  const resumo = await todos(
    db,
    `${CTE_ULTIMOS_FORMULARIOS}
     SELECT r.id_restricao AS id, r.nome, r.categoria, COUNT(fr.id_formulario) AS quantidade
       FROM RestricoesAlimentares r
       LEFT JOIN FormularioRestricoes fr
              ON fr.id_restricao = r.id_restricao
             AND fr.id_formulario IN (SELECT id FROM ultimos)
      WHERE r.ativo = 1
      GROUP BY r.id_restricao, r.nome, r.categoria
      ORDER BY quantidade DESC, r.nome`,
  );
  // Totais globais (não dependem do filtro da listagem).
  const contarPorSituacao = async (possui) => (await um(
    db,
    `${CTE_ULTIMOS_FORMULARIOS}
     SELECT COUNT(*) AS n FROM FormulariosRestricao f JOIN ultimos u ON u.id = f.id_formulario
     WHERE f.possui_restricao = ?`,
    possui,
  ))?.n ?? 0;
  const comRestricao = await contarPorSituacao(1);
  const semRestricao = await contarPorSituacao(0);

  return jsonResp({
    itens: linhas.map((f) => ({
      id: f.id_formulario,
      nome: f.nome,
      matricula: f.matricula,
      possuiRestricao: f.possui_restricao === 1,
      restricoes: porFormulario.get(f.id_formulario) ?? [],
      descricao: f.descricao ?? null,
      dataEnvio: f.data_envio,
      envios: f.envios,
    })),
    total,
    pagina,
    tamanho,
    temMais: pagina * tamanho < total,
    resumo: {
      comRestricao,
      semRestricao,
      porRestricao: resumo.map((r) => ({ id: r.id, nome: r.nome, categoria: r.categoria, quantidade: r.quantidade })),
    },
  });
});

// =====================================================================
// AVISOS
// =====================================================================

rota('GET', '/api/avisos', 'publico', async ({ db }) => {
  const agora = T.timestampBR();
  const linhas = await todos(
    db,
    `SELECT * FROM Avisos
      WHERE ativo = 1 AND (data_expiracao IS NULL OR data_expiracao > ?)
      ORDER BY data_criacao DESC`,
    agora,
  );
  return jsonResp(linhas.map(avisoDto));
});

rota('GET', '/api/avisos/meus', 'logado', async ({ db, usuario }) => {
  const agora = T.timestampBR();
  const linhas = await todos(
    db,
    `SELECT a.*, (v.id_aviso IS NOT NULL) AS lido
       FROM Avisos a
       LEFT JOIN AvisosVisualizados v ON v.id_aviso = a.id_aviso AND v.id_user = ?
      WHERE a.ativo = 1 AND (a.data_expiracao IS NULL OR a.data_expiracao > ?)
      ORDER BY a.data_criacao DESC`,
    usuario.id, agora,
  );
  const avisos = linhas.map((a) => ({ ...avisoDto(a), visualizado: a.lido === 1 }));
  return jsonResp({ avisos, naoLidos: avisos.filter((a) => !a.visualizado).length });
});

rota('POST', '/api/avisos/visualizar-todos', 'aluno', async ({ db, usuario }) => {
  const agora = T.timestampBR();
  const ativos = await todos(
    db,
    'SELECT id_aviso FROM Avisos WHERE ativo = 1 AND (data_expiracao IS NULL OR data_expiracao > ?)',
    agora,
  );
  if (ativos.length) {
    await db.batch(ativos.map((a) => preparar(
      db,
      'INSERT OR IGNORE INTO AvisosVisualizados (id_aviso, id_user, data_visualizacao) VALUES (?, ?, ?)',
      a.id_aviso, usuario.id, agora,
    )));
  }
  return jsonResp({ mensagem: 'Todos os avisos foram marcados como lidos.', marcados: ativos.length });
});

rota('POST', '/api/avisos/:id/visualizar', 'aluno', async ({ db, usuario, params }) => {
  const id = V.inteiro(params.id, { min: 1, max: 2147483647, campo: 'Aviso' });
  const agora = T.timestampBR();
  const ativo = await um(
    db,
    'SELECT 1 AS ok FROM Avisos WHERE id_aviso = ? AND ativo = 1 AND (data_expiracao IS NULL OR data_expiracao > ?)',
    id, agora,
  );
  if (!ativo) throw new HttpErro(404, 'Aviso não encontrado.');
  await executar(
    db,
    'INSERT OR IGNORE INTO AvisosVisualizados (id_aviso, id_user, data_visualizacao) VALUES (?, ?, ?)',
    id, usuario.id, agora,
  );
  return jsonResp({ mensagem: 'Aviso marcado como lido.' });
});

rota('GET', '/api/avisos/admin', 'nutricionista', async ({ db }) => {
  const agora = T.timestampBR();
  const linhas = await todos(db, 'SELECT * FROM Avisos WHERE ativo = 1 ORDER BY data_criacao DESC LIMIT 200');
  return jsonResp(linhas.map((a) => ({
    ...avisoDto(a),
    expirado: a.data_expiracao !== null && a.data_expiracao <= agora,
  })));
});

rota('POST', '/api/avisos', 'nutricionista', async ({ request, db }) => {
  const dados = await lerJson(request);
  const texto = V.texto(dados.texto, { min: 3, max: 500, campo: 'Aviso' });
  const tipo = dados.tipo === undefined || dados.tipo === null || dados.tipo === ''
    ? 'Informativo'
    : V.tipoCanonico(dados.tipo);
  if (!tipo) throw new HttpErro(400, 'Tipo de aviso inválido.');
  const expiracao = dados.expiracao === undefined || dados.expiracao === null || dados.expiracao === ''
    ? 'nunca'
    : String(dados.expiracao);
  if (!V.OPCOES_EXPIRACAO.includes(expiracao)) throw new HttpErro(400, 'Opção de expiração inválida.');

  const agora = new Date();
  const res = await executar(
    db,
    'INSERT INTO Avisos (texto, tipo, ativo, data_expiracao, data_criacao) VALUES (?, ?, 1, ?, ?)',
    texto, tipo, T.expiracaoDoAviso(expiracao, agora), T.timestampBR(agora),
  );
  const criado = await um(db, 'SELECT * FROM Avisos WHERE id_aviso = ?', res.meta.last_row_id);
  return jsonResp(avisoDto(criado), 201);
});

rota('DELETE', '/api/avisos/:id', 'nutricionista', async ({ db, params }) => {
  const id = V.inteiro(params.id, { min: 1, max: 2147483647, campo: 'Aviso' });
  const res = await executar(db, 'UPDATE Avisos SET ativo = 0 WHERE id_aviso = ? AND ativo = 1', id);
  if (!res.meta.changes) throw new HttpErro(404, 'Aviso não encontrado.');
  return jsonResp(null, 204);
});

// =====================================================================
// INTERESSE EM PRATOS (mantido do TCC 3.3)
// =====================================================================

rota('POST', '/api/interesses', 'aluno', async ({ request, db, usuario }) => {
  const dados = await lerJson(request);
  const idPrato = V.inteiro(dados.idPrato, { min: 1, max: 2147483647, campo: 'Prato' });
  if (!(await um(db, 'SELECT 1 AS ok FROM Pratos WHERE id_prato = ?', idPrato))) {
    throw new HttpErro(400, 'Prato não encontrado.');
  }
  await executar(
    db,
    'INSERT OR IGNORE INTO InteressePratos (id_user, id_prato, data_interesse) VALUES (?, ?, ?)',
    usuario.id, idPrato, T.timestampBR(),
  );
  return jsonResp({ mensagem: 'Interesse registrado.' });
});

// =====================================================================
// PRESENÇAS (DECLARADOS = agendados pelos alunos; EFETIVADOS = contagem real)
// =====================================================================

/** Confere se o aluno pode agendar ou cancelar o dia na semana atual. */
function validarDiaParaAgendamento(dia) {
  const semana = T.semanaAtual();
  const indice = DIAS.indexOf(dia);
  if (T.diaEncerrado(semana, indice)) {
    const hoje = T.indiceDiaDe(T.dataHojeBR());
    throw new HttpErro(
      409,
      hoje >= 5
        ? 'Os agendamentos desta semana foram encerrados. Os próximos abrem na segunda-feira.'
        : 'Este dia já passou e não pode mais ser agendado.',
    );
  }
  return semana;
}

rota('GET', '/api/presencas/minhas', 'aluno', async ({ db, usuario }) => {
  const semana = T.semanaAtual();
  const linhas = await todos(
    db,
    'SELECT dia FROM PresencasMarcadas WHERE user_id = ? AND semana = ?',
    usuario.id, semana,
  );
  return jsonResp({ semana, dias: linhas.map((l) => l.dia) });
});

rota('POST', '/api/presencas/marcar', 'aluno', async ({ request, db, usuario }) => {
  const dados = await lerJson(request);
  const dia = V.diaCanonico(dados.dia);
  if (!dia) throw new HttpErro(400, 'Dia da semana inválido.');
  const semana = validarDiaParaAgendamento(dia);

  await executar(
    db,
    'INSERT OR IGNORE INTO PresencasMarcadas (user_id, dia, semana, data_marcacao) VALUES (?, ?, ?, ?)',
    usuario.id, dia, semana, T.timestampBR(),
  );
  return jsonResp({ mensagem: 'Presença agendada!', dia, semana }, 201);
});

rota('DELETE', '/api/presencas/marcar/:dia', 'aluno', async ({ db, usuario, params }) => {
  const dia = V.diaCanonico(params.dia);
  if (!dia) throw new HttpErro(400, 'Dia da semana inválido.');
  const semana = validarDiaParaAgendamento(dia);
  await executar(
    db,
    'DELETE FROM PresencasMarcadas WHERE user_id = ? AND dia = ? AND semana = ?',
    usuario.id, dia, semana,
  );
  return jsonResp(null, 204);
});

rota('GET', '/api/presencas/resumo', 'nutricionista', async ({ url, db }) => {
  const bruto = url.searchParams.get('semana');
  const semana = bruto ? bruto : T.semanaAtual();
  if (!T.ehSegundaValida(semana)) throw new HttpErro(400, 'Informe uma segunda-feira válida (AAAA-MM-DD).');
  return jsonResp(await resumoPresencas(db, semana));
});

rota('POST', '/api/presencas/registradas', 'nutricionista', async ({ request, db }) => {
  const dados = await lerJson(request);
  const semana = typeof dados.semana === 'string' && dados.semana ? dados.semana : T.semanaAtual();
  if (!T.ehSegundaValida(semana)) throw new HttpErro(400, 'Semana inválida. Use uma segunda-feira (AAAA-MM-DD).');
  const dia = V.diaCanonico(dados.dia);
  if (!dia) throw new HttpErro(400, 'Dia da semana inválido.');
  const quantidade = V.inteiro(dados.quantidade, { min: 0, max: 5000, campo: 'Quantidade' });

  await executar(
    db,
    `INSERT INTO PresencasRegistradas (semana, dia, quantidade) VALUES (?, ?, ?)
     ON CONFLICT (semana, dia) DO UPDATE SET quantidade = excluded.quantidade`,
    semana, dia, quantidade,
  );
  return jsonResp({ semana, dia, quantidade, mensagem: 'Contagem salva!' });
});

// =====================================================================
// PAINEL DA NUTRICIONISTA (indicadores)
// =====================================================================

rota('GET', '/api/admin/painel', 'nutricionista', async ({ db }) => {
  const semana = T.semanaAtual();
  const agora = T.timestampBR();
  const declarados = (await um(db, 'SELECT COUNT(*) AS n FROM PresencasMarcadas WHERE semana = ?', semana))?.n ?? 0;
  const efetivados = await um(
    db,
    'SELECT COUNT(*) AS dias, COALESCE(SUM(quantidade), 0) AS total FROM PresencasRegistradas WHERE semana = ?',
    semana,
  );
  const comentarios = await resumoComentarios(db);
  const comRestricao = (await um(
    db,
    `${CTE_ULTIMOS_FORMULARIOS}
     SELECT COUNT(*) AS n FROM FormulariosRestricao f JOIN ultimos u ON u.id = f.id_formulario
     WHERE f.possui_restricao = 1`,
  ))?.n ?? 0;
  const avisosAtivos = (await um(
    db,
    'SELECT COUNT(*) AS n FROM Avisos WHERE ativo = 1 AND (data_expiracao IS NULL OR data_expiracao > ?)',
    agora,
  ))?.n ?? 0;

  return jsonResp({
    semana,
    rotulo: T.rotuloSemana(semana),
    declaradosSemana: declarados,
    efetivadosSemana: efetivados?.total ?? 0,
    diasRegistradosSemana: efetivados?.dias ?? 0,
    comentarios: { total: comentarios.total, media: comentarios.media },
    formulariosComRestricao: comRestricao,
    avisosAtivos,
  });
});
