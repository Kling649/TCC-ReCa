/* Comentários recebidos: resumo, média por dia, filtro por dia e carregamento por página. */
(function () {
  'use strict';
  const { api, esc, aviso, estrelas, formatarDataHora, pronto, DIAS_SIGLA } = window.Comum;
  const el = (id) => document.getElementById(id);
  const TAMANHO = 15;

  let filtro = 'todos';
  let pagina = 1;
  let temMais = false;

  const media = (n) => (n === null || n === undefined ? '—' : String(n).replace('.', ','));

  function renderResumo(resumo) {
    el('resumo-geral').innerHTML = `
      <div class="indicador"><span class="valor">${resumo.total}</span><span class="legenda">Comentários</span></div>
      <div class="indicador"><span class="valor">${media(resumo.media)} ★</span><span class="legenda">Média geral</span></div>`;
    el('resumo-dias').innerHTML = resumo.porDia.map((d, i) => `
      <div class="indicador">
        <span class="legenda">${esc(DIAS_SIGLA[i])}</span>
        <span class="valor">${media(d.media)}${d.media !== null ? ' ★' : ''}</span>
        <span class="detalhe">${d.quantidade} comentário(s)</span>
      </div>`).join('');
    el('filtro').innerHTML = [['todos', 'Todos', resumo.total], ...resumo.porDia.map((d, i) => [d.dia, DIAS_SIGLA[i], d.quantidade])]
      .map(([valor, rotulo, qtd]) => `
        <button type="button" class="chip" data-filtro="${esc(valor)}" aria-pressed="${valor === filtro}">
          ${esc(rotulo)}<span class="contagem">${qtd}</span></button>`).join('');
  }

  function htmlCartao(c) {
    const autor = c.nome
      ? `${esc(c.nome)}${c.matricula ? ` · matrícula ${esc(c.matricula)}` : ''}`
      : 'Anônimo (sem login)';
    return `
      <article class="comentario">
        <div class="comentario-topo">
          <span class="comentario-dia">📅 ${esc(c.diaRefeicao)}</span>
          ${estrelas(c.avaliacao)}
        </div>
        <p class="comentario-texto">${esc(c.texto)}</p>
        <div class="comentario-topo">
          <span class="comentario-autor">${autor}</span>
          <span class="comentario-data">${esc(formatarDataHora(c.dataComentario))}</span>
        </div>
      </article>`;
  }

  async function carregarLista({ acrescentar }) {
    const parametros = new URLSearchParams({ pagina: String(pagina), tamanho: String(TAMANHO) });
    if (filtro !== 'todos') parametros.set('dia', filtro);
    const dados = await api(`/comentarios/admin?${parametros}`);
    temMais = dados.temMais;
    renderResumo(dados.resumo);
    const html = dados.itens.map(htmlCartao).join('');
    if (acrescentar) el('lista').insertAdjacentHTML('beforeend', html);
    else el('lista').innerHTML = html;
    el('vazio').hidden = dados.total > 0;
    el('btn-mais').hidden = !temMais;
    el('contagem').textContent = dados.total
      ? `Mostrando ${el('lista').children.length} de ${dados.total}`
      : '';
  }

  function trocarFiltro(e) {
    const botao = e.target.closest('[data-filtro]');
    if (!botao) return;
    filtro = botao.dataset.filtro;
    pagina = 1;
    el('lista').innerHTML = '<p class="carregando-texto">Carregando…</p>';
    carregarLista({ acrescentar: false }).catch((erro) => aviso(erro.message, 'erro'));
  }

  pronto.then(() => {
    el('filtro').addEventListener('click', trocarFiltro);
    el('btn-mais').addEventListener('click', () => {
      if (!temMais) return;
      pagina += 1;
      carregarLista({ acrescentar: true }).catch((erro) => aviso(erro.message, 'erro'));
    });
    carregarLista({ acrescentar: false }).catch((erro) => {
      el('lista').innerHTML = `<div class="mensagem erro">${esc(erro.message)}</div>`;
    });
  }, () => {});
})();
