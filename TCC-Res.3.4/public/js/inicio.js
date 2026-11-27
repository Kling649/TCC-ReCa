/* Página do cardápio: carrossel, cards de cada dia e agendamento de presença. */
(function () {
  'use strict';
  const { api, esc, aviso, pronto } = window.Comum;

  const FOTOS_PADRAO = ['/img/car1.png', '/img/car2.png', '/img/car3.png', '/img/car4.png', '/img/car5.png'];
  const PASSO_AUTOMATICO_MS = 6000;

  let dias = [];
  let rotulo = '';
  let logado = false;
  let agendados = new Set();
  let indiceSlide = 0;
  let temporizador = null;
  let pausado = false;

  // ---------- Carrossel ----------
  function montarCarrossel() {
    const trilho = document.getElementById('trilho');
    trilho.innerHTML = dias.map((dia, i) => {
      const foto = (dia.pratos.find((p) => p.fotoUrl) || {}).fotoUrl || FOTOS_PADRAO[i];
      return `
        <div class="carrossel-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} de ${dias.length}">
          <img src="${esc(foto)}" alt="Almoço de ${esc(dia.nome)}" ${i === 0 ? '' : 'loading="lazy"'}>
          <span class="carrossel-rotulo">${esc(dia.nome)}</span>
        </div>`;
    }).join('');

    document.getElementById('pontos').innerHTML = dias.map((dia, i) =>
      `<button type="button" class="carrossel-ponto" data-indice="${i}" aria-label="Ir para ${esc(dia.nome)}"></button>`).join('');

    // Começa no primeiro dia que ainda não passou.
    const primeiroAberto = dias.findIndex((d) => !d.encerrado);
    irPara(primeiroAberto >= 0 ? primeiroAberto : 0, false);
  }

  function irPara(indice, animar = true) {
    const total = dias.length;
    if (!total) return;
    indiceSlide = ((indice % total) + total) % total;
    const trilho = document.getElementById('trilho');
    trilho.style.transition = animar ? '' : 'none';
    trilho.style.transform = `translateX(-${indiceSlide * 100}%)`;
    document.querySelectorAll('.carrossel-ponto').forEach((p, i) => {
      p.setAttribute('aria-current', String(i === indiceSlide));
    });
  }

  function iniciarAutomatico() {
    const carrossel = document.getElementById('carrossel');
    clearInterval(temporizador);
    temporizador = setInterval(() => { if (!pausado) irPara(indiceSlide + 1); }, PASSO_AUTOMATICO_MS);

    carrossel.addEventListener('mouseenter', () => { pausado = true; });
    carrossel.addEventListener('mouseleave', () => { pausado = false; });
    carrossel.addEventListener('focusin', () => { pausado = true; });
    carrossel.addEventListener('focusout', () => { pausado = false; });

    document.getElementById('seta-anterior').addEventListener('click', () => irPara(indiceSlide - 1));
    document.getElementById('seta-proxima').addEventListener('click', () => irPara(indiceSlide + 1));
    document.getElementById('pontos').addEventListener('click', (e) => {
      const ponto = e.target.closest('.carrossel-ponto');
      if (ponto) irPara(Number(ponto.dataset.indice));
    });

    // Deslizar com o dedo (celular) ou com o mouse.
    let inicioX = null;
    carrossel.addEventListener('pointerdown', (e) => { inicioX = e.clientX; });
    carrossel.addEventListener('pointerup', (e) => {
      if (inicioX === null) return;
      const dx = e.clientX - inicioX;
      inicioX = null;
      if (Math.abs(dx) > 40) irPara(indiceSlide + (dx < 0 ? 1 : -1));
    });
    carrossel.addEventListener('pointercancel', () => { inicioX = null; });
  }

  // ---------- Cards dos dias ----------
  function htmlPrato(prato) {
    const ingredientes = prato.ingredientes
      ? `<p><strong>Ingredientes:</strong> ${esc(prato.ingredientes)}</p>` : '';
    const modo = prato.modoPreparo
      ? `<p><strong>Modo de preparo:</strong> ${esc(prato.modoPreparo)}</p>` : '';
    const detalhes = ingredientes || modo
      ? `<details><summary>Ver ingredientes e preparo</summary>${ingredientes}${modo}</details>` : '';
    const foto = prato.fotoUrl
      ? `<img class="prato-foto" src="${esc(prato.fotoUrl)}" alt="Foto de ${esc(prato.nome)}" loading="lazy">` : '';
    return `
      <div class="prato">
        ${foto}
        <span class="prato-nome">${esc(prato.nome)}</span>
        ${prato.descricao ? `<span class="prato-desc">${esc(prato.descricao)}</span>` : ''}
        ${detalhes}
      </div>`;
  }

  function htmlAgendamento(dia) {
    if (!logado) {
      if (dia.encerrado) return '<span class="texto-status">Encerrado</span>';
      return '<a class="btn btn-pequeno" href="/login.html?proximo=/">Entrar para agendar</a>';
    }
    const marcado = agendados.has(dia.nome);
    const desabilitado = dia.encerrado ? 'disabled' : '';
    const status = dia.encerrado
      ? 'Dia encerrado'
      : (marcado ? 'Presença confirmada' : 'Não agendado');
    return `
      <label class="interruptor">
        <input type="checkbox" class="agendar" data-dia="${esc(dia.nome)}" ${marcado ? 'checked' : ''} ${desabilitado}
               aria-label="Agendar presença em ${esc(dia.nome)}">
        <span class="trilho" aria-hidden="true"></span>
        <span class="rotulo-interruptor">Agendar</span>
      </label>
      <span class="texto-status" data-status>${status}</span>`;
  }

  function renderGrade() {
    const grade = document.getElementById('grade');
    grade.innerHTML = dias.map((dia) => {
      const pratos = dia.pratos.length
        ? dia.pratos.map(htmlPrato).join('')
        : '<p class="vazio">Cardápio ainda não cadastrado para este dia.</p>';
      const data = formatarDataDia(dia.data);
      return `
        <article class="card-dia ${dia.encerrado ? 'encerrado' : ''}" data-card="${esc(dia.nome)}">
          <header class="card-dia-topo">
            <span>${esc(dia.nome)}</span><small>${esc(data)}</small>
          </header>
          <div class="card-dia-corpo">${pratos}</div>
          <div class="sobremesa-pilula">Sobremesa: ${esc(dia.sobremesa || 'não informada')}</div>
          <div class="card-dia-agendar">${htmlAgendamento(dia)}</div>
        </article>`;
    }).join('');
  }

  function formatarDataDia(iso) {
    const [, mes, dia] = String(iso).split('-');
    return dia && mes ? `${dia}/${mes}` : '';
  }

  // ---------- Agendamento ----------
  async function alternarAgendamento(evento) {
    const caixa = evento.target.closest('input.agendar');
    if (!caixa) return;
    const dia = caixa.dataset.dia;
    const card = caixa.closest('.card-dia');
    const status = card.querySelector('[data-status]');
    const marcarAgora = caixa.checked;
    caixa.disabled = true;
    try {
      if (marcarAgora) {
        await api('/presencas/marcar', { body: { dia } });
        agendados.add(dia);
        aviso('Presença agendada! ✓');
      } else {
        await api(`/presencas/marcar/${encodeURIComponent(dia)}`, { method: 'DELETE' });
        agendados.delete(dia);
        aviso('Agendamento cancelado.');
      }
      if (status) status.textContent = marcarAgora ? 'Presença confirmada' : 'Não agendado';
    } catch (erro) {
      caixa.checked = !marcarAgora;
      aviso(erro.message, 'erro');
      if (erro.status === 401) setTimeout(() => { location.href = '/login.html?proximo=/'; }, 1500);
    } finally {
      caixa.disabled = false;
    }
  }

  async function carregarAgendados() {
    if (!logado) return;
    try {
      const r = await api('/presencas/minhas');
      agendados = new Set(r.dias);
    } catch {
      agendados = new Set();
    }
  }

  async function carregar() {
    try {
      const dados = await api('/cardapio/semana');
      dias = dados.dias;
      rotulo = dados.rotulo;
      document.getElementById('rotulo-semana').textContent = `Semana de ${rotulo}`;
      await carregarAgendados();
      montarCarrossel();
      renderGrade();
      iniciarAutomatico();
    } catch (erro) {
      document.getElementById('grade').innerHTML =
        `<div class="mensagem erro" style="grid-column:1/-1">Não foi possível carregar o cardápio. ${esc(erro.message)}</div>`;
    }
  }

  pronto.then((usuario) => {
    logado = Boolean(usuario) && usuario.tipoUsuario === 'aluno';
    document.getElementById('grade').addEventListener('change', alternarAgendamento);
    carregar();
  }, () => {});
})();
