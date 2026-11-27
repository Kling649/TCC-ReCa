// Utilitários de resposta HTTP e de erro para a API.

/** Erro esperado da API. Vira uma resposta JSON com o status indicado. */
export class HttpErro extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.name = 'HttpErro';
    this.status = status;
  }
}

/** Resposta JSON padrão. Com corpo null, responde sem conteúdo (ex.: 204). */
export function jsonResp(corpo, status = 200, cabecalhos = {}) {
  if (corpo === null || corpo === undefined) {
    return new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...cabecalhos } });
  }
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cabecalhos,
    },
  });
}

/** Lê o corpo JSON. Lança HttpErro 400 se estiver malformado ou não for um objeto. */
export async function lerJson(request) {
  let dados;
  try {
    dados = await request.json();
  } catch {
    throw new HttpErro(400, 'Os dados enviados não estão no formato esperado.');
  }
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new HttpErro(400, 'Os dados enviados não estão no formato esperado.');
  }
  return dados;
}
