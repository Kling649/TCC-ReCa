/* Painel da nutricionista: indicadores, contagens pendentes e cardápio da semana. */
(function () {
  'use strict';
  const { api, esc, aviso, pronto } = window.Comum;
  const el = (id) => document.getElementById(id);
  const formatarNumeroMedia = (n) => (n === null || n === undefined ? '—' : String(n).replace('.', ','));

  function indicador(valor, legenda, detalhe) {
    return `<div class="indicador">
      <span class="valor">${esc(valor)}</span>
      <span class="legenda">${esc(legenda)}</span>
      ${detalhe ? `<span class="detalhe">${esc(detalhe)}</span>` : ''}
    </div>`;
  }

  async function carregarIndicadores() {
    const p = await api('/admin/painel');
    el('rotulo-semana').textContent = `Semana de ${p.rotulo}`;
    el('indicadores').innerHTML = [
      indicador(p.declaradosSemana, 'Declarados', 'alunos que agendaram'),
      indicador(p.efetivadosSemana, 'Efetivados', `${p.diasRegistradosSemana} dia(s) registrado(s)`),
      indicador(p.comentarios.total, 'Comentários', `média ${formatarNumeroMedia(p.comentarios.media)} ★`),
      indicador(p.formulariosComRestricao, 'Com restrição', 'último formulário de cada aluno'),
      indicador(p.avisosAtivos, 'Avisos ativos', ''),
    ].join('');
  }

  async function carregarPendencias() {
    const r = await api('/presencas/resumo');
    const pendentes = r.dias.filter((d) => d.encerrado && !d.registrado).map((d) => d.dia.split('-')[0]);
    const registrados = r.diasRegistrados;
    let html;
    if (pendentes.length) {
      html = `<p><strong>Faltam registrar:</strong> ${esc(pendentes.join(', '))}.</p>
        <p class="nota">Já registrados nesta semana: ${registrados} de 5 dia(s).</p>
        <div class="acoes-linha" style="margin-top:12px"><a class="btn" href="/admin/contagem.html">Registrar agora</a></div>`;
    } else if (registrados === 0) {
      html = `<p>Nenhum dia encerrado ainda. Os dias aparecem aqui depois que passam.</p>
        <div class="acoes-linha" style="margin-top:12px"><a class="btn btn-secundario" href="/admin/contagem.html">Abrir contagem</a></div>`;
    } else {
      html = `<p>✓ Todos os dias encerrados desta semana já foram registrados.</p>
        <div class="acoes-linha" style="margin-top:12px"><a class="btn btn-secundario" href="/admin/presencas.html">Ver resumo da semana</a></div>`;
    }
    el('pendencias').innerHTML = html;
  }

  async function carregarCardapio() {
    const dados = await api('/cardapio/semana');
    el('cardapio-resumo').innerHTML = dados.dias.map((dia) => `
      <article class="card-dia ${dia.encerrado ? 'encerrado' : ''}">
        <header class="card-dia-topo"><span>${esc(dia.nome)}</span><small>${esc(dia.data.slice(8))}/${esc(dia.data.slice(5, 7))}</small></header>
        <div class="card-dia-corpo">
          ${dia.pratos.length
            ? dia.pratos.map((p) => `<span class="prato-nome">• ${esc(p.nome)}</span>`).join('')
            : '<p class="vazio" style="padding:8px 0">Sem pratos cadastrados.</p>'}
        </div>
        <div class="sobremesa-pilula">Sobremesa: ${esc(dia.sobremesa || 'não informada')}</div>
      </article>`).join('');
  }

  async function iniciar() {
    const tarefas = [carregarIndicadores(), carregarPendencias(), carregarCardapio()];
    const resultados = await Promise.allSettled(tarefas);
    resultados.forEach((r) => {
      if (r.status === 'rejected') aviso(r.reason.message, 'erro');
    });
  }

  pronto.then(iniciar, () => {});
})();
