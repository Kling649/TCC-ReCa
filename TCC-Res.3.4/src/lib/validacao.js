// Validações padronizadas. Cada função lança HttpErro(400) com mensagem em
// português quando o valor não atende. Todas as entradas da API passam aqui.

import { HttpErro } from './http.js';

/** Dias de atendimento (segunda a sexta). Forma canônica usada no banco. */
export const DIAS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
export const CATEGORIAS_RESTRICAO = ['Alergia', 'Intolerância', 'Preferência', 'Médica', 'Outra'];
export const TIPOS_AVISO = ['Informativo', 'Importante', 'Urgente'];
export const OPCOES_EXPIRACAO = ['nunca', '1', '3', '7', 'fim-semana'];

/** Normaliza para comparação: sem acento, minúsculo e sem espaços nas pontas. */
const chave = (valor) =>
  String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const MAPA_DIAS = new Map(DIAS.map((d) => [chave(d), d]));

/** Aceita "terca-feira", "Terça-feira" ou "TERÇA-FEIRA" e devolve "Terça-feira". Null se inválido. */
export function diaCanonico(valor) {
  return MAPA_DIAS.get(chave(valor)) ?? null;
}

export function tipoCanonico(valor) {
  return TIPOS_AVISO.find((t) => chave(t) === chave(valor)) ?? null;
}

export function categoriaCanonica(valor) {
  return CATEGORIAS_RESTRICAO.find((c) => chave(c) === chave(valor)) ?? null;
}

/** Texto obrigatório com limites de tamanho (após remover espaços das pontas). */
export function texto(valor, { min = 1, max = 255, campo = 'Campo' } = {}) {
  const limpo = typeof valor === 'string' ? valor.trim() : '';
  if (limpo.length < min) {
    throw new HttpErro(400, min > 1 ? `${campo}: informe pelo menos ${min} caracteres.` : `${campo} é obrigatório.`);
  }
  if (limpo.length > max) {
    throw new HttpErro(400, `${campo}: use no máximo ${max} caracteres.`);
  }
  return limpo;
}

/** Texto opcional: vazio vira null. */
export function textoOpcional(valor, { max = 500, campo = 'Texto' } = {}) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw new HttpErro(400, `${campo} inválido.`);
  const limpo = valor.trim();
  if (!limpo) return null;
  if (limpo.length > max) throw new HttpErro(400, `${campo}: use no máximo ${max} caracteres.`);
  return limpo;
}

export function email(valor) {
  const endereco = texto(valor, { min: 5, max: 150, campo: 'E-mail' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(endereco)) {
    throw new HttpErro(400, 'Informe um e-mail válido.');
  }
  return endereco;
}

export function senha(valor) {
  if (typeof valor !== 'string' || valor.length < 6) {
    throw new HttpErro(400, 'A senha deve ter pelo menos 6 caracteres.');
  }
  if (valor.length > 200) throw new HttpErro(400, 'A senha é longa demais.');
  return valor;
}

/** Inteiro dentro de um intervalo. Aceita texto numérico ("12"). */
export function inteiro(valor, { min, max, padrao, campo = 'Valor' }) {
  if (valor === undefined || valor === null || valor === '') {
    if (padrao !== undefined) return padrao;
    throw new HttpErro(400, `${campo} é obrigatório.`);
  }
  const numero = typeof valor === 'number' ? valor : Number(String(valor).trim());
  if (!Number.isInteger(numero)) throw new HttpErro(400, `${campo} deve ser um número inteiro.`);
  if (numero < min || numero > max) {
    throw new HttpErro(400, `${campo} deve estar entre ${min} e ${max}.`);
  }
  return numero;
}

/** Lista de ids inteiros positivos, sem repetição. */
export function listaIds(valor, { max, permitirVazia = false, campo = 'Lista' }) {
  if (valor === undefined || valor === null) valor = [];
  if (!Array.isArray(valor)) throw new HttpErro(400, `${campo} inválida.`);
  const ids = [...new Set(valor.map((v) => Number(v)))];
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new HttpErro(400, `${campo} contém um identificador inválido.`);
  }
  if (ids.length > max) throw new HttpErro(400, `${campo}: no máximo ${max} itens.`);
  if (!permitirVazia && ids.length === 0) throw new HttpErro(400, `${campo}: selecione ao menos um item.`);
  return ids;
}

/** Link da foto: aceita arquivo enviado pelo sistema (/uploads/...) ou endereço https. */
export function urlFoto(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const limpo = String(valor).trim();
  if (limpo.length > 500) throw new HttpErro(400, 'O link da foto é longo demais.');
  if (/^\/uploads\/pratos\/[\w.-]+$/.test(limpo)) return limpo;
  if (/^https:\/\/[^\s]+$/i.test(limpo)) return limpo;
  throw new HttpErro(400, 'O link da foto deve começar com https:// ou ser uma foto enviada pelo sistema.');
}
