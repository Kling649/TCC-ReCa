/* Resumo semanal de presenças: tabela responsiva com declarados, efetivados, excedente e faltas. */
(function () {
  'use strict';
  const { api, esc, aviso, pronto } = window.Comum;
  const el = (id) => document.getElementById(id);
  let resumo = null;

  const num = (n) => (n === null || n === undefined ? '<span class="pendente">—</span>' : String(n));
  const media = (n) => (n === null || n === undefined ? '—' : String(n).replace('.', ','));

  function render() {
    el('rotulo-semana').textContent = `Semana de ${resumo.rotulo}`;
    el('corpo').innerHTML = resumo.dias.map((d) => {
      let situacao;
      if (d.registrado) {
        situacao = d.faltas > 0
          ? '<span class="etiqueta" style="background:var(--vermelho-claro);color:var(--vermelho)">Com faltas</span>'
          : d.excedente > 0
            ? '<span class="etiqueta" style="background:var(--azul-claro);color:var(--azul)">Com excedente</span>'
            : '<span class="etiqueta ativo">Conferido</span>';
      } else {
        situacao = d.encerrado
          ? '<span class="etiqueta" style="background:#fff3cd;color:#8a6d00">Falta registrar</span>'
          : '<span class="etiqueta">Aguardando</span>';
      }
      return `
        <tr>
          <td data-rotulo="Dia">${esc(d.dia)} <small class="nota">${esc(d.data.slice(8))}/${esc(d.data.slice(5, 7))}</small></td>
          <td data-rotulo="Declarados">${num(d.declarados)}</td>
          <td data-rotulo="Efetivados" class="${d.registrado ? 'num-efetivado' : ''}">${num(d.efetivados)}</td>
          <td data-rotulo="Excedente" class="${d.excedente > 0 ? 'num-excedente' : ''}">${num(d.excedente)}</td>
          <td data-rotulo="Faltas" class="${d.faltas > 0 ? 'num-faltas' : ''}">${num(d.faltas)}</td>
          <td data-rotulo="Situação">${situacao}</td>
        </tr>`;
    }).join('');

    const t = resumo.totais;
    const m = resumo.medias;
    el('rodape').innerHTML = `
      <tr>
        <td data-rotulo="Total">Total da semana</td>
        <td data-rotulo="Declarados">${t.declarados}</td>
        <td data-rotulo="Efetivados">${t.efetivados}</td>
        <td data-rotulo="Excedente">${t.excedente}</td>
        <td data-rotulo="Faltas">${t.faltas}</td>
        <td data-rotulo="Situação">${resumo.diasRegistrados} de 5 registrado(s)</td>
      </tr>
      <tr>
        <td data-rotulo="Média">Média por dia</td>
        <td data-rotulo="Declarados">${media(m.declarados)}</td>
        <td data-rotulo="Efetivados">${media(m.efetivados)}</td>
        <td data-rotulo="Excedente">${media(m.excedente)}</td>
        <td data-rotulo="Faltas">${media(m.faltas)}</td>
        <td data-rotulo="Situação">${resumo.diasRegistrados ? `sobre ${resumo.diasRegistrados} dia(s)` : 'sem dias registrados'}</td>
      </tr>`;
  }

  async function carregar(semana) {
    const consulta = semana ? `?semana=${encodeURIComponent(semana)}` : '';
    resumo = await api(`/presencas/resumo${consulta}`);
    render();
  }

  async function trocar(sentido) {
    await carregar(sentido > 0 ? resumo.proximaSemana : resumo.semanaAnterior);
  }

  pronto.then(() => {
    el('semana-anterior').addEventListener('click', () => trocar(-1));
    el('semana-proxima').addEventListener('click', () => trocar(1));
    carregar().catch((erro) => {
      el('corpo').innerHTML = `<tr><td colspan="6"><div class="mensagem erro">${esc(erro.message)}</div></td></tr>`;
      aviso(erro.message, 'erro');
    });
  }, () => {});
})();
