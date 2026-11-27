// Servidor local para testar o site sem a conta Cloudflare.
// Serve public/ (como o Assets do Cloudflare) e a API (o mesmo Worker de src/index.js),
// usando um SQLite local em .dados-local/recadb.sqlite.
//
// Uso:  npm run dev:local   e depois abra  http://localhost:8787

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/index.js';
import { criarD1Local, aplicarMigrations } from './d1-local.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(RAIZ, 'public');
const PORTA = Number(process.env.PORT || 8787);

function lerVariaveisLocais() {
  const caminho = join(RAIZ, '.dev.vars');
  const variaveis = {};
  if (!existsSync(caminho)) return variaveis;
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(linha);
    if (m && !linha.trim().startsWith('#')) variaveis[m[1]] = m[2];
  }
  return variaveis;
}

const DB = criarD1Local(join(RAIZ, '.dados-local', 'recadb.sqlite'));
const migracoes = aplicarMigrations(DB);
const variaveis = lerVariaveisLocais();
const env = {
  DB,
  TCC_CODIGO_NUTRICIONISTA: process.env.TCC_CODIGO_NUTRICIONISTA || variaveis.TCC_CODIGO_NUTRICIONISTA || 'CODIGO-LOCAL',
};

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** Entrega um arquivo de public/ como o serviço de Assets faria. */
function arquivoEstatico(caminhoUrl) {
  let relativo = normalize(decodeURIComponent(caminhoUrl)).replace(/^([/\\])+/, '');
  let arquivo = join(PUBLIC, relativo);
  if (!arquivo.startsWith(PUBLIC)) return null;
  if (existsSync(arquivo) && statSync(arquivo).isDirectory()) arquivo = join(arquivo, 'index.html');
  if (!existsSync(arquivo) || !statSync(arquivo).isFile()) return null;
  return { corpo: readFileSync(arquivo), tipo: TIPOS[extname(arquivo).toLowerCase()] || 'application/octet-stream' };
}

async function lerCorpo(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const pedacos = [];
  for await (const pedaco of req) pedacos.push(pedaco);
  return Buffer.concat(pedacos);
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  const ehApi = url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads/');

  if (ehApi) {
    const cabecalhos = new Headers();
    for (const [chave, valor] of Object.entries(req.headers)) {
      if (Array.isArray(valor)) valor.forEach((v) => cabecalhos.append(chave, v));
      else if (valor !== undefined) cabecalhos.set(chave, valor);
    }
    const corpo = await lerCorpo(req);
    const envComAssets = {
      ...env,
      ASSETS: {
        fetch: async (pedido) => {
          const caminho = new URL(pedido.url).pathname;
          const achado = arquivoEstatico(caminho);
          if (!achado) return new Response('Não encontrado', { status: 404 });
          return new Response(achado.corpo, { headers: { 'Content-Type': achado.tipo } });
        },
      },
    };
    const pedido = new Request(url, { method: req.method, headers: cabecalhos, body: corpo });
    const resposta = await worker.fetch(pedido, envComAssets);
    res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
    res.end(Buffer.from(await resposta.arrayBuffer()));
    return;
  }

  // Pasta sem barra final (ex.: /admin) -> redireciona para /admin/ como o Cloudflare faz.
  const caminhoFisico = join(PUBLIC, decodeURIComponent(url.pathname));
  if (existsSync(caminhoFisico) && statSync(caminhoFisico).isDirectory() && !url.pathname.endsWith('/')) {
    res.writeHead(307, { Location: `${url.pathname}/${url.search}` });
    res.end();
    return;
  }

  const achado = arquivoEstatico(url.pathname);
  if (!achado) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Página não encontrada');
    return;
  }
  res.writeHead(200, { 'Content-Type': achado.tipo, 'Cache-Control': 'no-cache' });
  res.end(achado.corpo);
});

servidor.listen(PORTA, () => {
  console.log(`TCC-Res 3.4 (desenvolvimento local) em http://localhost:${PORTA}`);
  console.log(`Banco local: .dados-local/recadb.sqlite (migrações aplicadas agora: ${migracoes.length ? migracoes.join(', ') : 'nenhuma'})`);
  if (env.TCC_CODIGO_NUTRICIONISTA === 'CODIGO-LOCAL') {
    console.log('Aviso: usando o código de nutricionista de teste "CODIGO-LOCAL". Crie .dev.vars para mudar.');
  }
});
