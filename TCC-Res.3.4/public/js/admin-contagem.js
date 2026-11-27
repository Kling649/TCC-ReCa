/* Contagem de presenças: escolher semana e dia, ajustar os efetivados com botões grandes e salvar. */
(function () {
  'use strict';
  const { api, esc, aviso, pronto, DIAS_SIGLA } = window.Comum;
  const el = (id) => document.getElementById(id);

  const MAXIMO = 5000;
  const LIMITE_DIFERENCA_ABSOLUTA = 10;
  const LIMITE_DIFERENCA_RELATIVA = 0.3;

  let semana = null;
  let resumo = null;
  let diaIndice = 0;
  let valorSalvo = null;
  let salvando = false;

  const hojeIso = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

  function dia() { return resumo.dias[diaIndice]; }

  function dataCurta(iso) {
    const [, mes, d] = iso.split('-');
    return `${d}/${mes}`;
  }

  function alterado() {
    if (!resumo || salvando) return false;
    const atual = el('efetivados').value.trim();
    const original = valorSalvo === null ? '' : String(valorSalvo);
    return atual !== original;
  }

  function diaPadrao() {
    const pendente = resumo.dias.findIndex((d) => d.encerrado && !d.registrado);
    if (pendente >= 0) return pendente;
    const hoje = resumo.dias.findIndex((d) => d.data === hojeIso());
    return hoje >= 0 ? hoje : 0;
  }

  function renderDias() {
    el('rotulo-semana').innerHTML = `Semana de ${esc(resumo.rotulo)}`;
    el('dias').innerHTML = resumo.dias.map((d, i) => {
      const estado = d.registrado ? '✓ Feito' : (d.encerrado ? 'Falta' : 'Aberto');
      return `
        <button type="button" class="dia-botao ${d.registrado ? 'registrado' : ''}" data-indice="${i}"
                aria-pressed="${i === diaIndice}" aria-label="${esc(d.dia)} ${dataCurta(d.data)}, ${estado}">
          <span class="sigla">${esc(DIAS_SIGLA[i])}</span>
          <span class="data">${dataCurta(d.data)}</span>
          <span class="estado">${estado}</span>
        </button>`;
    }).join('');
  }

  function lerValor() {
    const bruto = el('efetivados').value.trim();
    if (bruto === '') return { erro: 'Informe a quantidade. Use 0 se ninguém compareceu.' };
    if (!/^\d+$/.test(bruto)) return { erro: 'Use apenas números inteiros, sem vírgula.' };
    const n = Number(bruto);
    if (n > MAXIMO) return { erro: `O valor máximo é ${MAXIMO}.` };
    return { valor: n };
  }

  function atualizarPrevia() {
    const d = dia();
    const bruto = el('efetivados').value.trim();
    const previa = el('previa');
    // Campo vazio: só uma dica neutra (o erro aparece apenas ao tentar salvar).
    if (bruto === '') {
      el('erro-contagem').textContent = '';
      previa.className = 'previa';
      previa.style.fontWeight = '500';
      previa.textContent = 'Digite a quantidade ou use + e −. Use 0 se ninguém compareceu.';
      return;
    }
    previa.style.fontWeight = '';
    const leitura = lerValor();
    el('erro-contagem').textContent = leitura.erro || '';
    if (leitura.erro) {
      previa.className = 'previa';
      previa.textContent = '';
      return;
    }
    const diferenca = leitura.valor - d.declarados;
    if (diferenca > 0) {
      previa.className = 'previa excedente';
      previa.textContent = `Excedente: ${diferenca} a mais que o declarado`;
    } else if (diferenca < 0) {
      previa.className = 'previa faltas';
      previa.textContent = `Faltas: ${-diferenca} declarado(s) não vieram`;
    } else {
      previa.className = 'previa exato';
      previa.textContent = 'Tudo certo: nem excedente, nem faltas';
    }
  }

  function renderResumoDia() {
    const d = dia();
    const mini = (n, t) => `<div class="mini"><div class="n">${n}</div><div class="t">${t}</div></div>`;
    el('resumo-dia').innerHTML = d.registrado
      ? mini(d.declarados, 'Declarados') + mini(d.efetivados, 'Efetivados')
        + mini(d.excedente, 'Excedente') + mini(d.faltas, 'Faltas')
      : mini(d.declarados, 'Declarados') + mini('—', 'Ainda não registrado') ;
  }

  function renderPainel() {
    const d = dia();
    el('painel').hidden = false;
    el('titulo-dia').textContent = `${d.dia}, ${dataCurta(d.data)}`;
    el('declarados').textContent = d.declarados;
    valorSalvo = d.registrado ? d.efetivados : null;
    el('efetivados').value = d.registrado ? d.efetivados : '';
    atualizarPrevia();
    renderResumoDia();
  }

  function renderTudo() {
    renderDias();
    renderPainel();
  }

  /** Carrega uma semana (ou a semana atual, se não informada). */
  async function carregarSemana(nova) {
    const consulta = nova ? `?semana=${encodeURIComponent(nova)}` : '';
    const dados = await api(`/presencas/resumo${consulta}`);
    semana = dados.semana;
    resumo = dados;
    diaIndice = diaPadrao();
    renderTudo();
  }

  async function recarregar() {
    const dados = await api(`/presencas/resumo?semana=${encodeURIComponent(semana)}`);
    resumo = dados;
    renderTudo();
  }

  function confirmarDescarte() {
    return !alterado() || confirm('Você tem uma contagem não salva. Deseja trocar mesmo assim?');
  }

  function escolherDia(indice) {
    if (indice === diaIndice) return;
    if (!confirmarDescarte()) return;
    diaIndice = indice;
    renderTudo();
  }

  async function trocarSemana(deslocamento) {
    if (!confirmarDescarte()) return;
    const destino = deslocamento > 0 ? resumo.proximaSemana : resumo.semanaAnterior;
    await carregarSemana(destino);
  }

  function ajustar(delta) {
    const atual = Number(el('efetivados').value) || 0;
    const novo = Math.min(MAXIMO, Math.max(0, atual + delta));
    el('efetivados').value = String(novo);
    atualizarPrevia();
  }

  async function salvar({ irParaProximo = false } = {}) {
    if (salvando) return;
    const leitura = lerValor();
    if (leitura.erro) {
      el('erro-contagem').textContent = leitura.erro;
      el('efetivados').focus();
      return;
    }
    const d = dia();
    const diferenca = Math.abs(leitura.valor - d.declarados);
    const limite = Math.max(LIMITE_DIFERENCA_ABSOLUTA, d.declarados * LIMITE_DIFERENCA_RELATIVA);
    if (d.declarados > 0 && diferenca >= limite) {
      const ok = confirm(
        `Atenção: ${d.declarados} declarado(s) e ${leitura.valor} efetivado(s). ` +
        'A diferença é grande. Confirma este número?',
      );
      if (!ok) return;
    }

    salvando = true;
    const botoes = [el('salvar'), el('salvar-proximo'), el('menos'), el('mais')];
    botoes.forEach((b) => { b.disabled = true; });
    try {
      await api('/presencas/registradas', {
        body: { semana, dia: d.dia, quantidade: leitura.valor },
      });
      aviso(`Contagem de ${d.dia} salva! ✓`);
      salvando = false;
      const proximo = diaIndice + 1 < resumo.dias.length ? diaIndice + 1 : diaIndice;
      await recarregar();
      if (irParaProximo) diaIndice = proximo;
      renderTudo();
    } catch (erro) {
      aviso(erro.message, 'erro');
      el('erro-contagem').textContent = erro.message;
    } finally {
      salvando = false;
      botoes.forEach((b) => { b.disabled = false; });
    }
  }

  function iniciar() {
    el('dias').addEventListener('click', (e) => {
      const botao = e.target.closest('[data-indice]');
      if (botao) escolherDia(Number(botao.dataset.indice));
    });
    el('semana-anterior').addEventListener('click', () => trocarSemana(-1));
    el('semana-proxima').addEventListener('click', () => trocarSemana(1));
    el('menos').addEventListener('click', () => ajustar(-1));
    el('mais').addEventListener('click', () => ajustar(1));
    document.querySelectorAll('[data-somar]').forEach((b) => {
      b.addEventListener('click', () => ajustar(Number(b.dataset.somar)));
    });
    el('igualar').addEventListener('click', () => {
      el('efetivados').value = String(dia().declarados);
      atualizarPrevia();
    });
    el('zerar').addEventListener('click', () => { el('efetivados').value = '0'; atualizarPrevia(); });
    el('efetivados').addEventListener('input', atualizarPrevia);
    el('efetivados').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); salvar(); } });
    el('salvar').addEventListener('click', () => salvar());
    el('salvar-proximo').addEventListener('click', () => salvar({ irParaProximo: true }));
    window.addEventListener('beforeunload', (e) => {
      if (alterado()) { e.preventDefault(); e.returnValue = ''; }
    });

    carregarSemana(null).catch((erro) => {
      el('rotulo-semana').textContent = 'Não foi possível carregar';
      aviso(erro.message, 'erro');
    });
  }

  pronto.then(iniciar, () => {});
})();
