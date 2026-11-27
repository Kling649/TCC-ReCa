/* Lista de pratos: editar e excluir. */
(function () {
  'use strict';
  const { api, esc, aviso, pronto } = window.Comum;
  const el = (id) => document.getElementById(id);

  function cartao(p) {
    const foto = p.fotoUrl
      ? `<img src="${esc(p.fotoUrl)}" alt="Foto de ${esc(p.nome)}" loading="lazy">`
      : '<div style="height:170px;background:#efe7d8;display:grid;place-items:center;color:var(--texto-medio)">Sem foto</div>';
    return `
      <article class="cartao-prato">
        ${foto}
        <div class="cartao-prato-corpo">
          <h3>${esc(p.nome)}</h3>
          ${p.descricao ? `<p>${esc(p.descricao)}</p>` : '<p class="pendente">Sem descrição</p>'}
          ${p.tempoPreparo ? `<p class="nota">⏱ ${esc(p.tempoPreparo)} min de preparo</p>` : ''}
        </div>
        <div class="cartao-prato-rodape">
          <a class="btn btn-secundario btn-pequeno" href="/admin/prato.html?id=${p.id}">Editar</a>
          <button type="button" class="btn btn-perigo btn-pequeno" data-excluir="${p.id}" data-nome="${esc(p.nome)}">Excluir</button>
        </div>
      </article>`;
  }

  async function carregar() {
    const pratos = await api('/pratos');
    el('contagem').textContent = `${pratos.length} prato(s) cadastrado(s)`;
    el('lista').innerHTML = pratos.length
      ? pratos.map(cartao).join('')
      : '<p class="vazio" style="grid-column:1/-1">Nenhum prato cadastrado. Clique em “+ Novo prato”.</p>';
  }

  async function excluir(botao) {
    const nome = botao.dataset.nome;
    if (!confirm(`Excluir o prato “${nome}”? Ele também sai dos cardápios em que estiver.`)) return;
    botao.disabled = true;
    try {
      await api(`/pratos/${botao.dataset.excluir}`, { method: 'DELETE' });
      aviso(`Prato “${nome}” excluído.`);
      await carregar();
    } catch (erro) {
      aviso(erro.message, 'erro');
      botao.disabled = false;
    }
  }

  pronto.then(() => {
    el('lista').addEventListener('click', (e) => {
      const botao = e.target.closest('[data-excluir]');
      if (botao) excluir(botao);
    });
    carregar().catch((erro) => {
      el('lista').innerHTML = `<div class="mensagem erro" style="grid-column:1/-1">${esc(erro.message)}</div>`;
    });
  }, () => {});
})();
