/* Editor do cardápio: escolher pratos por dia com toques, sobremesa por dia e salvar a semana inteira. */
(function () {
  'use strict';
  const { api, esc, aviso, pronto, DIAS } = window.Comum;
  const el = (id) => document.getElementById(id);

  let pratos = [];
  let estadoSalvo = '';
  let estadoAtual = {};

  function snapshot() {
    return JSON.stringify(DIAS.map((dia) => ({
      dia,
      pratos: [...(estadoAtual[dia]?.pratos || [])].sort((a, b) => a - b),
      sobremesa: (estadoAtual[dia]?.sobremesa || '').trim(),
    })));
  }

  function alterado() {
    return snapshot() !== estadoSalvo;
  }

  function atualizarEstado() {
    el('estado-alteracoes').hidden = !alterado();
  }

  function renderEditor() {
    el('editor').innerHTML = DIAS.map((dia) => {
      const sel = estadoAtual[dia] || { pratos: [], sobremesa: '' };
      const botoes = pratos.map((p) => {
        const marcado = sel.pratos.includes(p.id);
        return `<button type="button" class="prato-opcao" data-dia="${esc(dia)}" data-id="${p.id}"
                  aria-pressed="${marcado}">${esc(p.nome)}</button>`;
      }).join('') || '<p class="vazio">Nenhum prato cadastrado ainda. Use “Cadastrar prato”.</p>';
      return `
        <section class="dia-editor" aria-labelledby="t-${esc(dia)}">
          <header class="dia-editor-topo">
            <span id="t-${esc(dia)}">${esc(dia)}</span>
            <small data-contagem="${esc(dia)}">${sel.pratos.length} prato(s)</small>
          </header>
          <div class="dia-editor-corpo">
            <div class="pratos-escolha">${botoes}</div>
            <div class="campo">
              <label for="sobremesa-${esc(dia)}">Sobremesa</label>
              <input id="sobremesa-${esc(dia)}" data-sobremesa="${esc(dia)}" maxlength="150"
                     value="${esc(sel.sobremesa)}" placeholder="Ex.: Fruta da época">
            </div>
            <div class="acoes-linha">
              <button type="button" class="btn btn-contorno btn-pequeno" data-limpar="${esc(dia)}">Limpar o dia</button>
            </div>
          </div>
        </section>`;
    }).join('');
  }

  function atualizarContagens() {
    DIAS.forEach((dia) => {
      const total = estadoAtual[dia]?.pratos.length || 0;
      const rotulo = document.querySelector(`[data-contagem="${dia}"]`);
      if (rotulo) rotulo.textContent = `${total} prato(s)`;
    });
  }

  function alternarPrato(evento) {
    const botao = evento.target.closest('.prato-opcao');
    if (!botao) return;
    const dia = botao.dataset.dia;
    const id = Number(botao.dataset.id);
    const sel = estadoAtual[dia] || (estadoAtual[dia] = { pratos: [], sobremesa: '' });
    const marcado = sel.pratos.includes(id);
    sel.pratos = marcado ? sel.pratos.filter((x) => x !== id) : [...sel.pratos, id];
    botao.setAttribute('aria-pressed', String(!marcado));
    atualizarContagens();
    atualizarEstado();
  }

  function limparDia(evento) {
    const botao = evento.target.closest('[data-limpar]');
    if (!botao) return;
    const dia = botao.dataset.limpar;
    estadoAtual[dia] = { pratos: [], sobremesa: estadoAtual[dia]?.sobremesa || '' };
    renderEditor();
    atualizarEstado();
  }

  function digitarSobremesa(evento) {
    const campo = evento.target.closest('[data-sobremesa]');
    if (!campo) return;
    const dia = campo.dataset.sobremesa;
    const sel = estadoAtual[dia] || (estadoAtual[dia] = { pratos: [], sobremesa: '' });
    sel.sobremesa = campo.value;
    atualizarEstado();
  }

  async function salvar() {
    const totalPratos = DIAS.reduce((s, d) => s + (estadoAtual[d]?.pratos.length || 0), 0);
    if (totalPratos === 0 && !confirm('Nenhum prato selecionado. Isso vai deixar o cardápio da semana vazio. Continuar?')) {
      return;
    }
    const botao = el('btn-salvar');
    botao.disabled = true;
    botao.textContent = 'Salvando…';
    const corpo = {
      dias: DIAS.map((dia) => ({
        dia,
        pratos: estadoAtual[dia]?.pratos || [],
        sobremesa: (estadoAtual[dia]?.sobremesa || '').trim() || null,
      })),
    };
    try {
      await api('/cardapio/semana', { method: 'PUT', body: corpo });
      estadoSalvo = snapshot();
      atualizarEstado();
      aviso('Cardápio salvo com sucesso! ✓');
    } catch (erro) {
      aviso(erro.message, 'erro');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Salvar cardápio da semana';
    }
  }

  async function descartar() {
    if (alterado() && !confirm('Descartar as alterações não salvas?')) return;
    await carregar();
  }

  async function carregar() {
    const [listaPratos, semana] = await Promise.all([api('/pratos'), api('/cardapio/semana')]);
    pratos = listaPratos;
    el('rotulo-semana').textContent = `Semana de ${semana.rotulo}`;
    estadoAtual = {};
    semana.dias.forEach((dia) => {
      estadoAtual[dia.nome] = { pratos: dia.pratos.map((p) => p.id), sobremesa: dia.sobremesa || '' };
    });
    estadoSalvo = snapshot();
    renderEditor();
    atualizarEstado();
  }

  function iniciar() {
    el('editor').addEventListener('click', (e) => {
      alternarPrato(e);
      limparDia(e);
    });
    el('editor').addEventListener('input', digitarSobremesa);
    el('btn-salvar').addEventListener('click', salvar);
    el('btn-descartar').addEventListener('click', descartar);
    window.addEventListener('beforeunload', (e) => {
      if (alterado()) { e.preventDefault(); e.returnValue = ''; }
    });
    carregar().catch((erro) => {
      el('editor').innerHTML = `<div class="mensagem erro">${esc(erro.message)}</div>`;
    });
  }

  pronto.then(iniciar, () => {});
})();
