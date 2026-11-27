/* Formulário de restrição alimentar: catálogo padronizado, validação e envio. */
(function () {
  'use strict';
  const { api, esc, aviso, pronto } = window.Comum;
  const el = (id) => document.getElementById(id);

  const ORDEM_CATEGORIAS = ['Alergia', 'Intolerância', 'Preferência', 'Médica', 'Outra'];
  let possuiRestricao = null;
  let usuario = null;

  function mostrarErro(campo, mensagem) {
    const caixa = document.querySelector(`[data-erro-para="${campo}"]`);
    if (caixa) { caixa.textContent = mensagem; caixa.hidden = !mensagem; }
    caixa?.closest('.campo')?.classList.toggle('com-erro', Boolean(mensagem));
  }

  function limparErros() {
    ['nome', 'matricula', 'possui', 'restricoes', 'descricao'].forEach((c) => mostrarErro(c, ''));
  }

  function marcarPossui(valor) {
    possuiRestricao = valor;
    document.querySelectorAll('[data-possui]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.possui === (valor ? 'sim' : 'nao')));
    });
    el('bloco-restricoes').hidden = !valor;
    mostrarErro('possui', '');
  }

  function montarOpcoes(restricoes) {
    const grupos = ORDEM_CATEGORIAS.map((categoria) => {
      const itens = restricoes.filter((r) => r.categoria === categoria);
      if (!itens.length) return '';
      return `
        <div class="grupo-restricoes">
          <h3>${esc(categoria)}</h3>
          ${itens.map((r) => `
            <label class="opcao-restricao">
              <input type="checkbox" name="restricao" value="${r.id}">
              <span>${esc(r.nome)}${r.descricao ? `<small>${esc(r.descricao)}</small>` : ''}</span>
            </label>`).join('')}
        </div>`;
    }).join('');
    el('opcoes-restricoes').innerHTML = grupos || '<p class="vazio">Nenhuma opção cadastrada.</p>';
  }

  async function carregarOpcoes() {
    try {
      montarOpcoes(await api('/restricoes'));
    } catch (erro) {
      el('opcoes-restricoes').innerHTML = `<div class="mensagem erro">${esc(erro.message)}</div>`;
    }
  }

  function selecionadas() {
    return [...document.querySelectorAll('input[name="restricao"]:checked')].map((c) => Number(c.value));
  }

  function validar() {
    limparErros();
    let valido = true;
    if (el('nome').value.trim().length < 3) { mostrarErro('nome', 'Informe seu nome completo.'); valido = false; }
    if (!el('matricula').value.trim()) { mostrarErro('matricula', 'Informe sua matrícula.'); valido = false; }
    if (possuiRestricao === null) { mostrarErro('possui', 'Responda se você possui restrição.'); valido = false; }
    if (possuiRestricao === true) {
      const descricao = el('descricao').value.trim();
      if (selecionadas().length === 0 && descricao.length === 0) {
        mostrarErro('restricoes', 'Marque pelo menos uma opção ou descreva sua restrição abaixo.');
        mostrarErro('descricao', 'Descreva sua restrição se não marcou nenhuma opção.');
        valido = false;
      }
    }
    return valido;
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (!validar()) {
      document.querySelector('.campo.com-erro')?.querySelector('input, button, textarea')?.focus();
      return;
    }
    const botao = el('btn-enviar');
    botao.disabled = true;
    botao.textContent = 'Enviando…';
    try {
      await api('/formularios/restricao', {
        body: {
          nome: el('nome').value.trim(),
          matricula: el('matricula').value.trim(),
          possuiRestricao: possuiRestricao === true,
          restricoes: possuiRestricao ? selecionadas() : [],
          descricao: possuiRestricao ? el('descricao').value.trim() : null,
        },
      });
      aviso('Formulário enviado com sucesso! ✓');
      el('form-restricao').reset();
      marcarPossui(null);
      el('bloco-restricoes').hidden = true;
      document.querySelectorAll('input[name="restricao"]').forEach((c) => { c.checked = false; });
      el('contador-descricao').textContent = '0 / 500 caracteres';
      preencherComUsuario();
    } catch (erro) {
      aviso(erro.message, 'erro');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Enviar formulário';
    }
  }

  function preencherComUsuario() {
    if (!usuario || usuario.tipoUsuario !== 'aluno') return;
    el('nome').value = usuario.nome || '';
    el('matricula').value = usuario.matricula || '';
  }

  function iniciar(user) {
    usuario = user;
    preencherComUsuario();
    carregarOpcoes();
    document.querySelectorAll('[data-possui]').forEach((b) => {
      b.addEventListener('click', () => marcarPossui(b.dataset.possui === 'sim'));
    });
    el('descricao').addEventListener('input', () => {
      el('contador-descricao').textContent = `${el('descricao').value.length} / 500 caracteres`;
    });
    el('form-restricao').addEventListener('submit', enviar);
  }

  pronto.then(iniciar, () => {});
})();
