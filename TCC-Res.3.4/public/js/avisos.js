/* Página de avisos: lista por tipo, marcar como lido (aluno) e contador no menu. */
(function () {
  'use strict';
  const { api, esc, aviso, formatarDataHora, pronto } = window.Comum;
  const el = (id) => document.getElementById(id);

  let usuario = null;
  let itens = [];

  function htmlAviso(a, podeMarcar) {
    const naoLido = podeMarcar && !a.visualizado;
    const tipo = (a.tipo || 'Informativo').toLowerCase();
    const etiquetaTipo = `<span class="etiqueta tipo-${esc(tipo)}">${esc(a.tipo || 'Informativo')}</span>`;
    const etiquetaNovo = naoLido ? '<span class="etiqueta novo">Novo</span>' : '';
    const etiquetaLido = podeMarcar && a.visualizado ? '<span class="etiqueta lido">Lido</span>' : '';
    const expira = a.dataExpiracao
      ? `<span>Válido até ${esc(formatarDataHora(a.dataExpiracao))}</span>` : '<span></span>';
    const botao = naoLido
      ? `<button type="button" class="btn btn-pequeno btn-marcar" data-id="${a.id}">Marcar como lido</button>` : '';
    return `
      <article class="aviso tipo-${esc(tipo)} ${naoLido ? 'nao-lido' : ''}">
        <div class="aviso-topo">
          <div class="acoes-linha">${etiquetaTipo}${etiquetaNovo}${etiquetaLido}</div>
          <small>${esc(formatarDataHora(a.dataCriacao))}</small>
        </div>
        <p class="aviso-texto">${esc(a.texto)}</p>
        <div class="aviso-rodape">${expira}${botao}</div>
      </article>`;
  }

  function atualizarBarra() {
    const naoLidos = itens.filter((a) => !a.visualizado).length;
    const barra = el('barra-avisos');
    if (!usuario || usuario.tipoUsuario !== 'aluno') {
      barra.hidden = true;
      return;
    }
    barra.hidden = false;
    el('resumo-avisos').textContent = naoLidos
      ? `Você tem ${naoLidos} aviso(s) não lido(s).`
      : 'Você está em dia com os avisos. ✓';
    el('btn-marcar-todos').hidden = naoLidos === 0;
    window.Comum.atualizarBadge?.(naoLidos);
  }

  function renderizar() {
    const podeMarcar = Boolean(usuario && usuario.tipoUsuario === 'aluno');
    const lista = el('lista-avisos');
    if (!itens.length) {
      lista.innerHTML = '<p class="vazio">Nenhum aviso publicado no momento.</p>';
      return;
    }
    lista.innerHTML = itens.map((a) => htmlAviso(a, podeMarcar)).join('');
    atualizarBarra();
    if (!podeMarcar) {
      lista.insertAdjacentHTML('beforebegin',
        '<p class="nota" style="text-align:center;margin-bottom:14px">Entre com sua conta de aluno para saber quais avisos você ainda não leu.</p>');
    }
  }

  async function carregar() {
    try {
      if (usuario && usuario.tipoUsuario === 'aluno') {
        const r = await api('/avisos/meus');
        itens = r.avisos;
      } else {
        itens = await api('/avisos');
      }
      renderizar();
    } catch (erro) {
      el('lista-avisos').innerHTML = `<div class="mensagem erro">${esc(erro.message)}</div>`;
    }
  }

  async function marcarUm(id, botao) {
    botao.disabled = true;
    try {
      await api(`/avisos/${id}/visualizar`, { method: 'POST' });
      itens = itens.map((a) => (a.id === Number(id) ? { ...a, visualizado: true } : a));
      renderizar();
    } catch (erro) {
      aviso(erro.message, 'erro');
      botao.disabled = false;
    }
  }

  async function marcarTodos() {
    const botao = el('btn-marcar-todos');
    botao.disabled = true;
    try {
      await api('/avisos/visualizar-todos', { method: 'POST' });
      itens = itens.map((a) => ({ ...a, visualizado: true }));
      aviso('Todos os avisos foram marcados como lidos. ✓');
      renderizar();
    } catch (erro) {
      aviso(erro.message, 'erro');
      botao.disabled = false;
    }
  }

  pronto.then((user) => {
    usuario = user;
    el('lista-avisos').addEventListener('click', (e) => {
      const botao = e.target.closest('.btn-marcar');
      if (botao) marcarUm(botao.dataset.id, botao);
    });
    el('btn-marcar-todos').addEventListener('click', marcarTodos);
    carregar();
  }, () => {});
})();
