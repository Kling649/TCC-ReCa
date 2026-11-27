// Datas e horas no fuso de Brasília (UTC-3, sem horário de verão desde 2019).
//
// Convenções usadas no sistema:
//  - data      : texto "AAAA-MM-DD"            (ex.: "2026-11-23")
//  - timestamp : texto "AAAA-MM-DDTHH:MM:SS-03:00" (sempre com o fuso, ordenável como texto)
//  - semana    : data da segunda-feira da semana (ex.: "2026-11-23")

const FUSO_BRASILIA_MS = -3 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');

/** Relógio de parede de Brasília, guardado em um Date cujos getUTC* são a hora local. */
function relogioBrasilia(data = new Date()) {
  return new Date(data.getTime() + FUSO_BRASILIA_MS);
}

/** Data de hoje em Brasília, no formato AAAA-MM-DD. */
export function dataHojeBR(data = new Date()) {
  const b = relogioBrasilia(data);
  return `${b.getUTCFullYear()}-${pad(b.getUTCMonth() + 1)}-${pad(b.getUTCDate())}`;
}

/** Timestamp atual (ou de `data`) em Brasília, com o fuso explícito. */
export function timestampBR(data = new Date()) {
  const b = relogioBrasilia(data);
  return `${dataHojeBR(data)}T${pad(b.getUTCHours())}:${pad(b.getUTCMinutes())}:${pad(b.getUTCSeconds())}-03:00`;
}

/** Converte "AAAA-MM-DD" em Date (meia-noite UTC), sem efeito de fuso. */
export function dataParaDate(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

export function dateParaIso(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Soma `dias` a uma data em texto. Aceita valores negativos. */
export function somarDias(iso, dias) {
  const d = dataParaDate(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return dateParaIso(d);
}

/** Índice do dia na semana, com segunda = 0 ... domingo = 6. */
export function indiceDiaDe(iso) {
  return (dataParaDate(iso).getUTCDay() + 6) % 7;
}

/** Segunda-feira da semana que contém a data informada. */
export function semanaDe(iso) {
  return somarDias(iso, -indiceDiaDe(iso));
}

/** Segunda-feira da semana atual (Brasília). */
export function semanaAtual() {
  return semanaDe(dataHojeBR());
}

/** Um texto é uma semana válida se for uma data AAAA-MM-DD que cai numa segunda-feira. */
export function ehSegundaValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = dataParaDate(texto);
  if (Number.isNaN(d.getTime()) || dateParaIso(d) !== texto) return false;
  return indiceDiaDe(texto) === 0;
}

/**
 * Um dia da semana já passou (é anterior a hoje, em Brasília).
 * Como semanas de fim de semana pertencem à semana anterior, no sábado e no
 * domingo todos os dias úteis da semana corrente ficam encerrados.
 */
export function diaEncerrado(semana, indice) {
  return somarDias(semana, indice) < dataHojeBR();
}

/** Carimbo do fim da sexta-feira seguinte (ou de hoje, se for sexta), às 23:59:59. */
export function fimDaSemanaBR(data = new Date()) {
  const hoje = dataHojeBR(data);
  const dowHoje = dataParaDate(hoje).getUTCDay(); // 0 = domingo ... 5 = sexta
  const faltam = (5 - dowHoje + 7) % 7;
  return `${somarDias(hoje, faltam)}T23:59:59-03:00`;
}

/** Carimbo de expiração conforme a opção escolhida no aviso. Retorna null para "nunca". */
export function expiracaoDoAviso(opcao, agora = new Date()) {
  if (opcao === 'nunca') return null;
  if (opcao === 'fim-semana') return fimDaSemanaBR(agora);
  const dias = Number(opcao);
  return timestampBR(new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000));
}

/** Monta a semana da data informada para exibição no formato "dd/mm a dd/mm/aaaa". */
export function rotuloSemana(semana) {
  const inicio = dataParaDate(semana);
  const fim = dataParaDate(somarDias(semana, 4));
  const d = (x) => `${pad(x.getUTCDate())}/${pad(x.getUTCMonth() + 1)}`;
  return `${d(inicio)} a ${d(fim)}/${fim.getUTCFullYear()}`;
}
