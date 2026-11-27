/* Avisos da nutricionista: publicar (com tipo e expiração) e encerrar avisos. */
(function () {
  'use strict';
  const { api, esc, aviso, formatarDataHora, pronto } = window.Comum;
  const el = (id) => document.getElementById(id);
  let tipo = 'Informativo';

  function marcarTipo(valor) {
    tipo = valor;
    document.querySelectorAll('[data-tipo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tipo === valor)));
  }

  function htmlAviso(a) {
    const classe = (a.tipo || 'Informativo').toLowerCase();
    const status = a.expirado
      ? '<span class="etiqueta expirado">Expirado</span>'
      : '<span class="etiqueta ativo">Visível para os alunos</span>';
    const validade = a.dataExpiracao
      ? `Válido até ${esc(formatarDataHora(a.dataExpiracao))}` : 'Não expira';
    return `
      <article class="aviso tipo-${esc(classe)}">
        <div class="aviso-topo">
          <div class="acoes-linha"><span class="etiqueta tipo-${esc(classe)}">${esc(a.tipo)}</span>${status}</div>
          <small>${esc(formatarDataHora(a.dataCriacao))}</small>
        </div>
        <p class="aviso-texto">${esc(a.texto)}</p>
        <div class="aviso-rodape">
          <span>${validade}</span>
          <button type="button" class="btn btn-perigo btn-pequeno" data-encerrar="${a.id}">Encerrar aviso</button>
        </div>
      </article>`;
  }

  async function carregarLista() {
    const avisos = await api('/avisos/admin');
    el('lista').innerHTML = avisos.length
      ? avisos.map(htmlAviso).join('')
      : '<p class="vazio">Nenhum aviso publicado.</p>';
  }

  async function publicar(evento) {
    evento.preventDefault();
    const caixa = document.querySelector('[data-erro-para="texto"]');
    const texto = el('texto').value.trim();
    caixa.hidden = true;
    el('campo-texto').classList.remove('com-erro');
    if (texto.length < 3) {
      caixa.textContent = 'Escreva pelo menos 3 caracteres.';
      caixa.hidden = false;
      el('campo-texto').classList.add('com-erro');
      el('texto').focus();
      return;
    }
    const botao = el('btn-publicar');
    botao.disabled = true;
    try {
      await api('/avisos', { body: { texto, tipo, expiracao: el('expiracao').value } });
      el('form-aviso').reset();
      el('contador').textContent = '0 / 500 caracteres';
      marcarTipo('Informativo');
      aviso('Aviso publicado! ✓');
      await carregarLista();
    } catch (erro) {
      aviso(erro.message, 'erro');
    } finally {
      botao.disabled = false;
    }
  }

  async function encerrar(botao) {
    if (!confirm('Encerrar este aviso? Ele deixará de aparecer para os alunos.')) return;
    botao.disabled = true;
    try {
      await api(`/avisos/${botao.dataset.encerrar}`, { method: 'DELETE' });
      aviso('Aviso encerrado.');
      await carregarLista();
    } catch (erro) {
      aviso(erro.message, 'erro');
      botao.disabled = false;
    }
  }

  pronto.then(() => {
    document.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => marcarTipo(b.dataset.tipo)));
    el('texto').addEventListener('input', () => { el('contador').textContent = `${el('texto').value.length} / 500 caracteres`; });
    el('form-aviso').addEventListener('submit', publicar);
    el('lista').addEventListener('click', (e) => {
      const botao = e.target.closest('[data-encerrar]');
      if (botao) encerrar(botao);
    });
    carregarLista().catch((erro) => {
      el('lista').innerHTML = `<div class="mensagem erro">${esc(erro.message)}</div>`;
    });
  }, () => {});
})();
