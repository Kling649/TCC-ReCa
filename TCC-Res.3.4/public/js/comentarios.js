/* Página de comentários: formulário, últimos comentários e janela com todos (filtro por dia). */
(function () {
  'use strict';
  const { api, esc, aviso, estrelas, formatarDataHora, DIAS, DIAS_SIGLA, pronto } = window.Comum;

  const TAMANHO_RECENTES = 3;
  const TAMANHO_JANELA = 10;

  const el = (id) => document.getElementById(id);
  let notaEscolhida = 0;
  let resumoAtual = null;
  let filtroAtual = 'todos';
  let paginaJanela = 1;
  let temMaisJanela = false;

  // ---------- Formulário ----------
  function preencherDias() {
    el('dia').insertAdjacentHTML('beforeend', DIAS.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join(''));
  }

  function mostrarErro(campo, mensagem) {
    const caixa = document.querySelector(`[data-erro-para="${campo}"]`);
    const bloco = caixa?.closest('.campo');
    if (caixa) { caixa.textContent = mensagem; caixa.hidden = !mensagem; }
    if (bloco) bloco.classList.toggle('com-erro', Boolean(mensagem));
  }

  function limparErros() {
    ['dia', 'avaliacao', 'texto'].forEach((c) => mostrarErro(c, ''));
  }

  function escolherNota(nota) {
    notaEscolhida = nota;
    document.querySelectorAll('#estrelas-escolha .chip').forEach((b) => {
      const marcado = Number(b.dataset.nota) === nota;
      b.setAttribute('aria-checked', String(marcado));
      b.setAttribute('aria-pressed', String(marcado));
    });
    mostrarErro('avaliacao', '');
  }

  function validarFormulario() {
    limparErros();
    let valido = true;
    if (!el('dia').value) { mostrarErro('dia', 'Escolha o dia da refeição.'); valido = false; }
    if (!notaEscolhida) { mostrarErro('avaliacao', 'Escolha uma avaliação de 1 a 5 estrelas.'); valido = false; }
    const texto = el('texto').value.trim();
    if (texto.length < 3) { mostrarErro('texto', 'Escreva pelo menos 3 caracteres.'); valido = false; }
    return valido;
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (!validarFormulario()) {
      document.querySelector('.campo.com-erro')?.querySelector('select, button, textarea')?.focus();
      return;
    }
    const botao = el('btn-enviar');
    botao.disabled = true;
    botao.textContent = 'Enviando…';
    try {
      await api('/comentarios', {
        body: {
          diaRefeicao: el('dia').value,
          avaliacao: notaEscolhida,
          texto: el('texto').value.trim(),
        },
      });
      el('form-comentario').reset();
      escolherNota(0);
      el('contador-texto').textContent = '0 / 1000 caracteres';
      aviso('Comentário enviado com sucesso! Obrigado. ✓');
      await carregarRecentes();
    } catch (erro) {
      aviso(erro.message, 'erro');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Enviar comentário';
    }
  }

  // ---------- Listas ----------
  function htmlComentario(c) {
    return `
      <article class="comentario">
        <div class="comentario-topo">
          <span class="comentario-dia">📅 ${esc(c.diaRefeicao)}</span>
          ${estrelas(c.avaliacao)}
        </div>
        <p class="comentario-texto">${esc(c.texto)}</p>
        <span class="comentario-data">${esc(formatarDataHora(c.dataComentario))}</span>
      </article>`;
  }

  function atualizarResumo() {
    if (!resumoAtual) return;
    const media = resumoAtual.media === null ? '—' : resumoAtual.media.toFixed(1).replace('.', ',');
    el('resumo').innerHTML = `
      <span>Média geral: <strong>${esc(media)}</strong> ★</span>
      <span>Total: <strong>${resumoAtual.total}</strong></span>`;
  }

  async function carregarRecentes() {
    try {
      const [lista, resumo] = await Promise.all([
        api(`/comentarios?tamanho=${TAMANHO_RECENTES}`),
        api('/comentarios/resumo'),
      ]);
      resumoAtual = resumo;
      atualizarResumo();
      el('lista-recentes').innerHTML = lista.itens.map(htmlComentario).join('');
      el('sem-comentarios').hidden = lista.total > 0;
      el('btn-ver-mais').hidden = lista.total <= TAMANHO_RECENTES;
      el('btn-ver-mais').textContent = `Ver mais comentários (${lista.total})`;
    } catch (erro) {
      el('lista-recentes').innerHTML = `<div class="mensagem erro">${esc(erro.message)}</div>`;
    }
  }

  // ---------- Janela com todos os comentários ----------
  function montarFiltro() {
    const contagem = new Map((resumoAtual?.porDia || []).map((d) => [d.dia, d.quantidade]));
    const total = resumoAtual?.total ?? 0;
    const botoes = [['todos', 'Todos', total], ...DIAS.map((d, i) => [d, DIAS_SIGLA[i], contagem.get(d) ?? 0])];
    el('filtro-dias').innerHTML = botoes.map(([valor, rotulo, qtd]) => `
      <button type="button" class="chip" data-filtro="${esc(valor)}" aria-pressed="${valor === filtroAtual}">
        ${esc(rotulo)}<span class="contagem">${qtd}</span>
      </button>`).join('');
  }

  async function carregarJanela({ acrescentar }) {
    const parametros = new URLSearchParams({ pagina: String(paginaJanela), tamanho: String(TAMANHO_JANELA) });
    if (filtroAtual !== 'todos') parametros.set('dia', filtroAtual);
    const botaoMais = el('btn-carregar-mais');
    botaoMais.disabled = true;
    try {
      const dados = await api(`/comentarios?${parametros}`);
      const html = dados.itens.map(htmlComentario).join('');
      if (acrescentar) el('lista-todos').insertAdjacentHTML('beforeend', html);
      else el('lista-todos').innerHTML = html;
      temMaisJanela = dados.temMais;
      botaoMais.hidden = !temMaisJanela;
      el('janela-vazia').hidden = dados.total > 0;
      el('contagem-janela').textContent = dados.total
        ? `Mostrando ${el('lista-todos').children.length} de ${dados.total} comentário(s)`
        : '';
    } catch (erro) {
      aviso(erro.message, 'erro');
    } finally {
      botaoMais.disabled = false;
    }
  }

  async function abrirJanela() {
    filtroAtual = 'todos';
    paginaJanela = 1;
    el('lista-todos').innerHTML = '<p class="carregando-texto">Carregando…</p>';
    try { resumoAtual = await api('/comentarios/resumo'); } catch { /* usa o último resumo */ }
    montarFiltro();
    el('janela-comentarios').showModal();
    await carregarJanela({ acrescentar: false });
  }

  function mudarFiltro(evento) {
    const botao = evento.target.closest('[data-filtro]');
    if (!botao) return;
    filtroAtual = botao.dataset.filtro;
    paginaJanela = 1;
    montarFiltro();
    el('lista-todos').innerHTML = '<p class="carregando-texto">Carregando…</p>';
    carregarJanela({ acrescentar: false });
  }

  function carregarMais() {
    if (!temMaisJanela) return;
    paginaJanela += 1;
    carregarJanela({ acrescentar: true });
  }

  // ---------- Início ----------
  function iniciar() {
    preencherDias();
    document.querySelectorAll('#estrelas-escolha .chip').forEach((b) => {
      b.addEventListener('click', () => escolherNota(Number(b.dataset.nota)));
    });
    el('texto').addEventListener('input', () => {
      const n = el('texto').value.length;
      el('contador-texto').textContent = `${n} / 1000 caracteres`;
    });
    el('form-comentario').addEventListener('submit', enviar);
    el('btn-ver-mais').addEventListener('click', abrirJanela);
    el('btn-fechar-janela').addEventListener('click', () => el('janela-comentarios').close());
    el('filtro-dias').addEventListener('click', mudarFiltro);
    el('btn-carregar-mais').addEventListener('click', carregarMais);
    carregarRecentes();
  }

  pronto.then(iniciar, () => {});
})();
