/* Cadastro e edição de prato, com foto (arquivo ou link) e inclusão opcional no cardápio. */
(function () {
  'use strict';
  const { api, esc, aviso, pronto, DIAS } = window.Comum;
  const el = (id) => document.getElementById(id);
  const TAMANHO_MAX = 5 * 1024 * 1024;
  const params = new URLSearchParams(location.search);
  const idEdicao = params.get('id');
  let fotoAtual = null;

  function mostrarErro(campo, mensagem) {
    const caixa = document.querySelector(`[data-erro-para="${campo}"]`);
    if (caixa) { caixa.textContent = mensagem; caixa.hidden = !mensagem; }
    caixa?.closest('.campo')?.classList.toggle('com-erro', Boolean(mensagem));
  }

  function validar() {
    ['nome', 'ingredientes', 'modo', 'tempo', 'foto'].forEach((c) => mostrarErro(c, ''));
    let valido = true;
    if (el('nome').value.trim().length < 2) { mostrarErro('nome', 'Informe o nome do prato (mínimo 2 caracteres).'); valido = false; }
    if (!el('ingredientes').value.trim()) { mostrarErro('ingredientes', 'Liste os ingredientes.'); valido = false; }
    if (!el('modo').value.trim()) { mostrarErro('modo', 'Descreva o modo de preparo.'); valido = false; }
    const tempo = el('tempo').value;
    if (tempo !== '' && (!Number.isInteger(Number(tempo)) || Number(tempo) < 0 || Number(tempo) > 1440)) {
      mostrarErro('tempo', 'Use um número inteiro entre 0 e 1440.'); valido = false;
    }
    const arquivo = el('foto').files[0];
    if (arquivo && !['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type)) {
      mostrarErro('foto', 'Escolha uma imagem JPG, PNG ou WEBP.'); valido = false;
    }
    if (arquivo && arquivo.size > TAMANHO_MAX) {
      mostrarErro('foto', 'A imagem deve ter no máximo 5 MB.'); valido = false;
    }
    const link = el('link-foto').value.trim();
    if (link && !/^https:\/\//i.test(link)) { mostrarErro('foto', 'O link deve começar com https://'); valido = false; }
    return valido;
  }

  /** Envia a foto escolhida, se houver. Retorna o caminho/URL final ou null. */
  async function enviarFoto() {
    const arquivo = el('foto').files[0];
    if (!arquivo) return null;
    const dados = new FormData();
    dados.append('arquivo', arquivo);
    const r = await api('/upload/prato', { body: dados });
    return r.fotoUrl;
  }

  function montarCorpo(fotoUrl) {
    const tempo = el('tempo').value;
    return {
      nome: el('nome').value.trim(),
      descricao: el('descricao').value.trim() || null,
      ingredientes: el('ingredientes').value.trim(),
      modoPreparo: el('modo').value.trim(),
      tempoPreparo: tempo === '' ? null : Number(tempo),
      fotoUrl,
    };
  }

  async function salvar(evento) {
    evento.preventDefault();
    el('msg-erro').hidden = true;
    if (!validar()) {
      document.querySelector('.campo.com-erro input, .campo.com-erro textarea')?.focus();
      return;
    }
    const botao = el('btn-salvar');
    botao.disabled = true;
    botao.textContent = 'Salvando…';
    try {
      // Ordem de preferência: foto nova enviada > link digitado > foto que já existia.
      let fotoUrl = await enviarFoto();
      if (!fotoUrl) fotoUrl = el('link-foto').value.trim() || fotoAtual || null;
      const corpo = montarCorpo(fotoUrl);

      let prato;
      if (idEdicao) {
        prato = await api(`/pratos/${idEdicao}`, { method: 'PUT', body: corpo });
      } else {
        prato = await api('/pratos', { body: corpo });
      }

      const dia = el('dia-cardapio').value;
      if (dia && !idEdicao) {
        await api('/cardapio', { body: { dia, idPrato: prato.id } });
      }
      aviso(idEdicao ? 'Prato atualizado com sucesso! ✓' : 'Prato cadastrado com sucesso! ✓');
      setTimeout(() => { location.href = '/admin/pratos.html'; }, 700);
    } catch (erro) {
      el('msg-erro').textContent = erro.message;
      el('msg-erro').hidden = false;
      aviso(erro.message, 'erro');
      botao.disabled = false;
      botao.textContent = 'Salvar prato';
    }
  }

  function mostrarPrevia() {
    const arquivo = el('foto').files[0];
    const previa = el('previa');
    if (!arquivo) { previa.hidden = true; previa.removeAttribute('src'); return; }
    previa.src = URL.createObjectURL(arquivo);
    previa.hidden = false;
  }

  async function carregarEdicao() {
    const prato = (await api('/pratos')).find((p) => String(p.id) === String(idEdicao));
    if (!prato) throw new Error('Prato não encontrado.');
    el('titulo-pagina').textContent = 'Editar prato';
    el('nome').value = prato.nome;
    el('descricao').value = prato.descricao || '';
    el('ingredientes').value = prato.ingredientes || '';
    el('modo').value = prato.modoPreparo || '';
    el('tempo').value = prato.tempoPreparo ?? '';
    fotoAtual = prato.fotoUrl || null;
    if (prato.fotoUrl && /^https:/i.test(prato.fotoUrl)) el('link-foto').value = prato.fotoUrl;
    if (prato.fotoUrl) {
      const previa = el('previa');
      previa.src = prato.fotoUrl;
      previa.hidden = false;
    }
    el('campo-dia').hidden = true; // o cardápio é editado na tela própria
    el('btn-salvar').textContent = 'Salvar alterações';
  }

  async function carregarDias() {
    const select = el('dia-cardapio');
    select.insertAdjacentHTML('beforeend', DIAS.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join(''));
  }

  pronto.then(async () => {
    el('form-prato').addEventListener('submit', salvar);
    el('foto').addEventListener('change', mostrarPrevia);
    carregarDias();
    if (idEdicao) {
      try { await carregarEdicao(); } catch (erro) { aviso(erro.message, 'erro'); }
    }
  }, () => {});
})();
