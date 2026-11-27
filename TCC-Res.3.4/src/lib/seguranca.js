// Senhas, tokens e comparações seguras.
//
// Senhas novas: PBKDF2-SHA256 com sal aleatório de 16 bytes.
//   Formato gravado: pbkdf2$<iterações>$<sal base64>$<hash base64>
// Senhas antigas (TCC 3.3, SHA-256 hexadecimal sem sal): ainda são aceitas no
// login e são regravadas no formato novo logo após o login bem-sucedido.

// O WebCrypto do Cloudflare Workers aceita no máximo 100.000 iterações no PBKDF2.
const ITERACOES = 100000;

const codificador = new TextEncoder();

function paraHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function paraBase64(bytes) {
  let texto = '';
  for (const b of bytes) texto += String.fromCharCode(b);
  return btoa(texto);
}

function deBase64(texto) {
  const binario = atob(texto);
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

/** Compara dois arrays de bytes sem vazar informação pelo tempo de execução. */
export function iguaisEmTempoConstante(a, b) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}

/** Hash SHA-256 hexadecimal (formato antigo do TCC 3.3). Usado só para verificar senhas legadas. */
export async function sha256Hex(texto) {
  return paraHex(await crypto.subtle.digest('SHA-256', codificador.encode(texto)));
}

/** Gera o hash de uma senha nova no formato PBKDF2 com sal. */
export async function gerarHashSenha(senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const chave = await crypto.subtle.importKey('raw', codificador.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal, iterations: ITERACOES, hash: 'SHA-256' },
    chave,
    256,
  );
  return `pbkdf2$${ITERACOES}$${paraBase64(sal)}$${paraBase64(new Uint8Array(bits))}`;
}

/** Confere a senha digitada com o hash guardado (novo ou legado). */
export async function verificarSenha(senha, armazenado) {
  if (typeof senha !== 'string' || typeof armazenado !== 'string') return false;

  if (armazenado.startsWith('pbkdf2$')) {
    const partes = armazenado.split('$');
    if (partes.length !== 4) return false;
    const iteracoes = Number(partes[1]);
    if (!Number.isInteger(iteracoes) || iteracoes < 1 || iteracoes > ITERACOES) return false;
    const sal = deBase64(partes[2]);
    const esperado = deBase64(partes[3]);
    const chave = await crypto.subtle.importKey('raw', codificador.encode(senha), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256' },
      chave,
      esperado.length * 8,
    );
    return iguaisEmTempoConstante(new Uint8Array(bits), esperado);
  }

  // Formato legado: SHA-256 hexadecimal de 64 caracteres.
  if (/^[0-9a-f]{64}$/i.test(armazenado)) {
    return iguaisEmTempoConstante(
      codificador.encode(await sha256Hex(senha)),
      codificador.encode(armazenado.toLowerCase()),
    );
  }
  return false;
}

/** Compara dois textos (ex.: código da nutricionista) sem vazar o tamanho nem o conteúdo. */
export async function textosIguais(a, b) {
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', codificador.encode(String(a))),
    crypto.subtle.digest('SHA-256', codificador.encode(String(b))),
  ]);
  return iguaisEmTempoConstante(new Uint8Array(x), new Uint8Array(y));
}

/** Token de sessão aleatório de 256 bits, em base64 seguro para URL. */
export function gerarToken() {
  return paraBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
