const API = '/api';
let comentariosPublicos = [];
let comentariosVisiveis = 3;

function usuarioAtual() {
  try { return JSON.parse(localStorage.getItem('restaurante_usuario') || 'null'); }
  catch { return null; }
}

function salvarUsuario(usuario) { localStorage.setItem('restaurante_usuario', JSON.stringify(usuario)); }
function limparUsuario() { localStorage.removeItem('restaurante_usuario'); }

async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = localStorage.getItem('restaurante_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${url}`, { ...options, headers });
  if (!response.ok) {
    let msg = `Erro HTTP ${response.status}`;
    try { msg = (await response.json()).mensagem || msg; } catch {}
    throw new Error(msg);
  }
  if (response.status === 204) return null;
  return response.json();
}

function mostrarToast(mensagem) {
  let toast = document.getElementById('toast-global');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-global';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = mensagem;
  toast.classList.add('visivel');
  setTimeout(() => toast.classList.remove('visivel'), 3000);
}

function destacarNavAtivo() {
  const pagina = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(link => {
    if (link.getAttribute('href') === pagina) link.classList.add('active');
  });
}

function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function carregarCardapio() {
  const grid = document.getElementById('cardapio-grid');
  if (!grid) return;
  try {
    const dias = await api('/cardapio/semana');
    grid.innerHTML = dias.map(dia => `
      <article class="card-dia">
        <div class="dia-header">${escaparHtml(dia.nome)}</div>
        <ul class="pratos-lista">
          ${(dia.pratos || []).map(p => `
            <li data-prato-id="${p.id}">
              <strong>${escaparHtml(p.nome)}</strong>
              ${p.descricao ? `<p>${escaparHtml(p.descricao)}</p>` : ''}
              ${p.ingredientes ? `<p><strong>Ingredientes:</strong> ${escaparHtml(p.ingredientes)}</p>` : ''}
              ${p.modoPreparo ? `<details><summary>Modo de preparo</summary><p>${escaparHtml(p.modoPreparo)}</p></details>` : ''}
              ${p.FotoUrl || p.fotoUrl ? `<img class="foto-prato-card" src="${escaparHtml(p.FotoUrl || p.fotoUrl)}" alt="Foto de ${escaparHtml(p.nome)}">` : ''}
            </li>`).join('') || '<li>Nenhum prato cadastrado.</li>'}
        </ul>
        <div class="sobremesa">Sobremesa: ${escaparHtml(dia.sobremesa || 'Não informada')}</div>
        ${!location.pathname.endsWith('_admin.html') ? `<div class="check"><label>Agendar:</label><input aria-label="Agendar presença para ${escaparHtml(dia.nome)}" class="interesse-prato" type="checkbox" data-dia="${escaparHtml(dia.nome)}"></div>` : ''}
      </article>`).join('');
    // Atualiza as cinco imagens do carrossel público com a primeira foto cadastrada em cada dia.
    const slides = document.querySelectorAll('#meuCarousel .carousel-item');
    slides.forEach((slide, i) => {
      const dia = dias[i];
      const foto = dia?.pratos?.find(p => p.FotoUrl || p.fotoUrl);
      if (foto) {
        const img = slide.querySelector('img');
        if (img) { img.src = foto.FotoUrl || foto.fotoUrl; img.alt = `Cardápio de ${dia.nome}`; }
      }
    });
    await configurarInteressesPresenca();
  } catch (e) {
    console.error(e);
    mostrarToast('Não foi possível carregar o cardápio.');
  }
}

async function carregarAvisos() {
  const lista = document.querySelector('.avisos-grid');
  if (!lista) return;
  try {
    const avisos = await api('/avisos');
    lista.innerHTML = avisos.map(a => `<article class="aviso-card"><p>${a.texto}</p></article>`).join('') || '<article class="aviso-card"><p>Nenhum aviso no momento.</p></article>';
  } catch (e) { console.error(e); }
}

function renderizarComentariosPublicos() {
  const lista = document.getElementById('listaComentarios');
  const vazio = document.getElementById('semComentarios');
  const botao = document.getElementById('btnVerMaisComentarios');
  if (!lista) return;

  const exibidos = comentariosPublicos.slice(0, comentariosVisiveis);
  lista.innerHTML = exibidos.map(c => `
    <div class="comentario-card">
      <div class="comentario-card-topo">
        <span class="comentario-card-dia">📅 ${escaparHtml(c.diaRefeicao || 'Dia não informado')}</span>
        <span class="comentario-card-estrelas">${'★'.repeat(c.avaliacao || 0)}${'☆'.repeat(5 - (c.avaliacao || 0))}</span>
        <span class="comentario-card-data">${new Date(c.dataComentario).toLocaleString('pt-BR')}</span>
      </div>
      <p class="comentario-card-texto"></p>
    </div>`).join('');
  [...lista.querySelectorAll('.comentario-card-texto')].forEach((el, i) => el.textContent = exibidos[i].texto);
  if (vazio) vazio.style.display = comentariosPublicos.length ? 'none' : 'block';
  if (botao) {
    botao.style.display = comentariosVisiveis < comentariosPublicos.length ? 'inline-flex' : 'none';
    botao.textContent = 'Ver mais';
  }
}

async function carregarComentarios() {
  const lista = document.getElementById('listaComentarios');
  if (!lista) return;
  try {
    comentariosPublicos = await api('/comentarios');
    renderizarComentariosPublicos();
  } catch (e) { console.error(e); }
}

async function configurarComentario() {
  const form = document.getElementById('formComentario');
  if (!form) return;
  await carregarComentarios();
  const btnVerMais = document.getElementById('btnVerMaisComentarios');
  if (btnVerMais) btnVerMais.addEventListener('click', () => {
    comentariosVisiveis += 3;
    renderizarComentariosPublicos();
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const usuario = usuarioAtual();
    try {
      await api('/comentarios', { method: 'POST', body: JSON.stringify({
        idPrato: null,
        diaRefeicao: document.getElementById('diaRefeicao').value,
        avaliacao: Number(document.getElementById('avaliacao').value),
        texto: document.getElementById('textoComentario').value.trim(),
        idUser: usuario?.id || null
      })});
      form.reset();
      await carregarComentarios();
      mostrarToast('Comentário enviado com sucesso! ✓');
    } catch (err) { mostrarToast(err.message); }
  });
}

function configurarRestricao() {
  const select = document.getElementById('restricao');
  const extras = document.getElementById('camposRestricao');
  const form = document.getElementById('formRestricao');
  if (!select || !form) return;
  select.addEventListener('change', () => { if (extras) extras.style.display = select.value === 'sim' ? 'flex' : 'none'; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const usuario = usuarioAtual();
    try {
      const possuiRestricao = select.value === 'sim';
      await api('/formularios/restricao', { method: 'POST', body: JSON.stringify({
        nome: document.getElementById('nome').value.trim(),
        matricula: document.getElementById('matricula').value.trim(),
        possuiRestricao,
        tipoRestricao: possuiRestricao ? document.getElementById('tipoRestricao').value : null,
        descricao: possuiRestricao ? document.getElementById('descricao').value : null,
        idUser: usuario?.id || null
      })});
      form.reset();
      if (extras) extras.style.display = 'none';
      mostrarToast('Restrição registrada com sucesso!');
    } catch (err) { mostrarToast(err.message); }
  });
}

async function configurarInteressesPresenca() {
  const checks = document.querySelectorAll('.interesse-prato');
  if (!checks.length) return;
  const usuario = usuarioAtual();
  if (usuario?.id) {
    try {
      const marcadas = await api(`/presencas/minhas/${usuario.id}`);
      checks.forEach(check => { check.checked = marcadas.includes(check.dataset.dia); });
    } catch (e) { console.error(e); }
  }
  checks.forEach(check => check.addEventListener('change', async () => {
    const usuario = usuarioAtual();
    const dia = check.dataset.dia;
    if (!usuario?.id) {
      check.checked = false;
      mostrarToast('Faça login para agendar sua presença.');
      return;
    }
    try {
      if (check.checked) {
        await api('/presencas/marcar', { method: 'POST', body: JSON.stringify({ idUser: usuario.id, dia }) });
        mostrarToast('Agendamento realizado!');
      } else {
        await api(`/presencas/marcar/${usuario.id}/${encodeURIComponent(dia)}`, { method: 'DELETE' });
        mostrarToast('Agendamento cancelado.');
      }
    } catch (err) {
      check.checked = !check.checked;
      if (err.message && err.message.includes('Usuário não encontrado')) {
        limparUsuario();
        localStorage.removeItem('restaurante_token');
        mostrarToast('Sua sessão é antiga — faça login novamente.');
        setTimeout(() => window.location.href = 'login.html', 1200);
      } else {
        mostrarToast(err.message);
      }
    }
  }));
}

async function carregarPresencasAdmin() {
  const loading = document.getElementById('presencas-loading');
  const conteudo = document.getElementById('presencas-conteudo');
  if (!loading || !conteudo) return;
  try {
    const dados = await api('/presencas/semana');
    dados.dias.forEach((dia, index) => {
      const cells = (row) => document.querySelector(`#tabela-presencas tr:nth-child(${row}) td[data-dia="${index}"]`);
      const a = cells(2), b = cells(3), c = cells(4);
      if (a) a.textContent = dia.marcadas;
      if (b) b.textContent = dia.registradas;
      if (c) c.textContent = dia.diferenca;
    });
    document.getElementById('media-registradas').textContent = dados.medias.registradas;
    document.getElementById('media-agendadas').textContent = dados.medias.marcadas;
    document.getElementById('media-diferenca').textContent = dados.medias.diferenca;
    loading.style.display = 'none';
    conteudo.style.display = 'block';
  } catch (err) {
    console.error(err);
    loading.textContent = 'Não foi possível carregar os dados de presença.';
  }
}

function configurarRegistroPresencas() {
  const form = document.getElementById('formPresencas');
  if (!form) return;
  const itens = [
    ['Segunda-feira', 'preseg'], ['Terça-feira', 'preter'], ['Quarta-feira', 'prequa'],
    ['Quinta-feira', 'prequi'], ['Sexta-feira', 'presex']
  ];
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      for (const [dia, id] of itens) {
        const valor = Number(document.getElementById(id).value);
        if (!Number.isInteger(valor) || valor < 0) throw new Error(`Informe uma quantidade válida para ${dia}.`);
        await api('/presencas/registradas', { method: 'POST', body: JSON.stringify({ dia, quantidade: valor }) });
      }
      mostrarToast('Presenças registradas com sucesso!');
      setTimeout(() => window.location.href = 'Presenca_admin.html', 500);
    } catch (err) { mostrarToast(err.message); }
  });
}

async function carregarComentariosAdmin() {
  const lista = document.getElementById('listaComentariosAdmin');
  if (!lista) return;
  try {
    const dados = await api('/comentarios/admin');
    lista.innerHTML = dados.length ? dados.map(c => `
      <article class="comentario-card">
        <div class="comentario-card-topo"><strong>${c.nome}</strong><span>${c.matricula || 'Sem matrícula'}</span></div>
        <div class="comentario-card-topo"><span>📅 ${c.diaRefeicao || 'Dia não informado'}</span><span>${'★'.repeat(c.avaliacao || 0)}${'☆'.repeat(5 - (c.avaliacao || 0))}</span><span>${new Date(c.dataComentario).toLocaleString('pt-BR')}</span></div>
        <p class="comentario-card-texto"></p>
      </article>`).join('') : '<p>Nenhum comentário recebido.</p>';
    [...lista.querySelectorAll('.comentario-card-texto')].forEach((el, i) => el.textContent = dados[i].texto);
  } catch (err) { console.error(err); lista.innerHTML = '<p>Não foi possível carregar os comentários.</p>'; }
}

async function carregarFormulariosAdmin() {
  const lista = document.getElementById('listaFormulariosAdmin');
  if (!lista) return;
  try {
    const dados = await api('/formularios/restricao/admin');
    lista.innerHTML = dados.length ? dados.map(f => `
      <article class="aviso-card">
        <h3>${f.nome}</h3>
        <p><strong>Matrícula:</strong> ${f.matricula}</p>
        <p><strong>Possui restrição:</strong> ${f.possuiRestricao ? 'Sim' : 'Não'}</p>
        ${f.possuiRestricao ? `<p><strong>Tipo:</strong> ${f.tipoRestricao || 'Não informado'}</p><p><strong>Descrição:</strong> ${f.descricao || 'Não informada'}</p>` : ''}
        <small>Enviado em ${new Date(f.dataEnvio).toLocaleString('pt-BR')}</small>
      </article>`).join('') : '<p>Nenhum formulário recebido.</p>';
  } catch (err) { console.error(err); lista.innerHTML = '<p>Não foi possível carregar os formulários.</p>'; }
}

function configurarCadastro() {
  const form = document.getElementById('formCadastro');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const tipo = document.getElementById('tipoUsuario').value;
    const dados = {
      nome: document.getElementById('cadNome').value.trim(),
      email: document.getElementById('cadEmail').value.trim(),
      senha: document.getElementById('cadSenha').value,
      matricula: document.getElementById('cadMatricula').value.trim() || null
    };
    if (tipo === 'nutricionista') {
      dados.codigoAutorizacao = document.getElementById('cadCodigoNutricionista')?.value.trim() || '';
    }
    try {
      const endpoint = tipo === 'nutricionista' ? '/nutricionistas' : '/alunos';
      await api(endpoint, { method: 'POST', body: JSON.stringify(dados) });
      mostrarToast('Conta criada com sucesso!');
      setTimeout(() => window.location.href = 'login.html', 500);
    } catch (err) { mostrarToast(err.message); }
  });
  const tipo = document.getElementById('tipoUsuario');
  const matricula = document.getElementById('campoMatricula');
  const campoCodigo = document.getElementById('campoCodigoNutricionista');
  const atualizarCamposCadastro = () => {
    if (matricula) matricula.style.display = tipo.value === 'aluno' ? 'block' : 'none';
    if (campoCodigo) campoCodigo.style.display = tipo.value === 'nutricionista' ? 'block' : 'none';
  };
  if (tipo) {
    tipo.addEventListener('change', atualizarCamposCadastro);
    atualizarCamposCadastro();
  }
}

function configurarLogin() {
  const form = document.getElementById('formLogin');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const result = await api('/login', { method: 'POST', body: JSON.stringify({
        email: document.getElementById('loginEmail').value.trim(),
        senha: document.getElementById('loginSenha').value
      })});
      localStorage.setItem('restaurante_token', result.token);
      salvarUsuario(result.usuario);
      mostrarToast('Login realizado!');
      setTimeout(() => window.location.href = result.usuario.tipoUsuario === 'nutricionista' ? 'index_admin.html' : 'index.html', 500);
    } catch { mostrarToast('E-mail ou senha inválidos.'); }
  });
}

async function configurarPratosAdmin() {
  const lista = document.getElementById('listaPratosAdmin');
  if (!lista) return;
  const pratos = await api('/pratos');
  lista.innerHTML = pratos.map(p => `<article class="aviso-card"><h3>${p.nome}</h3><p>${p.descricao || ''}</p><button class="btn-excluir-prato" data-id="${p.id}">Excluir</button></article>`).join('');
  lista.querySelectorAll('.btn-excluir-prato').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Excluir este prato?')) return;
    await api(`/pratos/${btn.dataset.id}`, { method: 'DELETE' });
    configurarPratosAdmin();
  }));
}

function configurarAddPrato() {
  const form = document.getElementById('formPrato');
  if (!form) return;
  const arquivoInput = document.getElementById('pratoFoto');
  const preview = document.getElementById('previewFotoPrato');
  if (arquivoInput && preview) {
    arquivoInput.addEventListener('change', () => {
      const arquivo = arquivoInput.files?.[0];
      if (arquivo) {
        if (!['image/jpeg','image/png','image/webp'].includes(arquivo.type)) {
          arquivoInput.value = '';
          preview.removeAttribute('src');
          mostrarToast('Escolha uma imagem JPG, PNG ou WEBP.');
          return;
        }
        preview.src = URL.createObjectURL(arquivo);
        preview.hidden = false;
      } else { preview.hidden = true; }
    });
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const botao = form.querySelector('[type="submit"]');
    if (botao) { botao.disabled = true; botao.textContent = 'Salvando...'; }
    try {
      let fotoUrl = null;
      const arquivo = arquivoInput?.files?.[0];
      if (arquivo) {
        const dados = new FormData();
        dados.append('arquivo', arquivo);
        const resposta = await fetch(`${API}/upload/prato`, { method: 'POST', body: dados });
        const retorno = await resposta.json();
        if (!resposta.ok) throw new Error(retorno.mensagem || `Erro no envio da foto (${resposta.status})`);
        fotoUrl = retorno.fotoUrl;
      }
      const prato = await api('/pratos', { method: 'POST', body: JSON.stringify({
        nome: document.getElementById('pratoNome').value.trim(),
        descricao: document.getElementById('pratoDescricao').value.trim(),
        ingredientes: document.getElementById('pratoIngredientes').value.trim(),
        modoPreparo: document.getElementById('pratoModo').value.trim(),
        tempoPreparo: Number(document.getElementById('pratoTempo').value) || null,
        fotoUrl
      })});
      await api('/cardapio', { method: 'POST', body: JSON.stringify({
        dia: document.getElementById('pratoDia').value,
        idPrato: prato.id,
        sobremesa: document.getElementById('pratoSobremesa')?.value.trim() || null
      })});
      mostrarToast('Prato cadastrado e adicionado ao dia escolhido!');
      setTimeout(() => window.location.href = 'index_admin.html', 700);
    } catch (err) {
      mostrarToast(err.message);
      if (botao) { botao.disabled = false; botao.textContent = 'Cadastrar prato no cardápio'; }
    }
  });
}

async function configurarCardapioAdmin() {
  const form = document.getElementById('formCardapioAdmin');
  if (!form) return;
  const pratos = await api('/pratos');
  document.querySelectorAll('.dia-pratos').forEach(select => {
    select.innerHTML = pratos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
  });
  try {
    const semana = await api('/cardapio/semana');
    (semana || []).forEach(dia => {
      const select = document.querySelector(`.dia-pratos[data-dia="${dia.nome}"]`);
      if (!select) return;
      (dia.pratos || []).forEach(prato => {
        const option = select.querySelector(`option[value="${prato.id}"]`);
        if (option) option.selected = true;
      });
      const sobremesa = dia.sobremesa;
      const campoSobremesa = document.getElementById('sobremesa');
      if (sobremesa && campoSobremesa) campoSobremesa.value = sobremesa;
    });
  } catch (err) { console.error(err); }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const selects = document.querySelectorAll('.dia-pratos');
    let total = 0;
    selects.forEach(select => total += select.selectedOptions.length);
    if (total === 0 && !confirm('Nenhum prato selecionado. Isso vai esvaziar o cardápio da semana inteira. Continuar?')) return;
    try {
      await api('/cardapio/semana', { method: 'DELETE' });
      for (const select of selects) {
        for (const option of select.selectedOptions) {
          await api('/cardapio', { method: 'POST', body: JSON.stringify({ dia: select.dataset.dia, idPrato: Number(option.value), sobremesa: document.getElementById('sobremesa').value }) });
        }
      }
      mostrarToast('Cardápio atualizado!');
    } catch (err) { mostrarToast(err.message); }
  });
}

async function atualizarContadorAvisos() {
  const usuario = usuarioAtual();
  const badges = document.querySelectorAll('[data-aviso-badge]');
  if (!badges.length) return;
  if (!usuario?.id || usuario.tipoUsuario !== 'aluno' || !localStorage.getItem('restaurante_token')) {
    badges.forEach(b => { b.textContent = ''; b.style.display = 'none'; });
    return;
  }
  try {
    const resultado = await api(`/avisos/nao-lidos/${usuario.id}`);
    badges.forEach(b => {
      b.textContent = resultado.quantidade > 9 ? '9+' : String(resultado.quantidade);
      b.style.display = resultado.quantidade > 0 ? 'inline-flex' : 'none';
      b.setAttribute('aria-label', `${resultado.quantidade} avisos não lidos`);
    });
  } catch (e) {
    console.warn('Não foi possível atualizar o contador de avisos.', e);
  }
}

async function configurarPaginaAvisos() {
  const lista = document.getElementById('listaAvisosAluno');
  if (!lista) return;
  const usuario = usuarioAtual();
  try {
    const avisos = usuario?.id && usuario.tipoUsuario === 'aluno'
      ? await api(`/avisos/usuario/${usuario.id}`)
      : await api('/avisos');

    if (!avisos.length) {
      lista.innerHTML = '<p class="sem-comentarios">Nenhum aviso publicado no momento.</p>';
      return;
    }
    lista.innerHTML = avisos.map(a => `
      <article class="aviso-publicado ${a.visualizado === false ? 'aviso-nao-lido' : ''}">
        <div class="aviso-publicado-topo">
          <strong>${a.visualizado === false ? 'Novo aviso' : 'Aviso'}</strong>
          <small>${new Date(a.dataCriacao).toLocaleString('pt-BR')}</small>
        </div>
        <p class="aviso-publicado-texto"></p>
        ${usuario?.id && usuario.tipoUsuario === 'aluno' && a.visualizado === false
          ? `<button type="button" class="btn-marcar-aviso" data-id="${a.id}">Marcar como lido</button>`
          : ''}
      </article>`).join('');
    [...lista.querySelectorAll('.aviso-publicado-texto')].forEach((el, i) => el.textContent = avisos[i].texto);
    lista.querySelectorAll('.btn-marcar-aviso').forEach(btn => btn.addEventListener('click', async () => {
      try {
        await api(`/avisos/${btn.dataset.id}/visualizar`, {
          method: 'POST', body: JSON.stringify({ idUser: usuario.id })
        });
        await configurarPaginaAvisos();
        await atualizarContadorAvisos();
      } catch (err) { mostrarToast(err.message); }
    }));
  } catch (err) {
    console.error(err);
    lista.innerHTML = '<p>Não foi possível carregar os avisos. Entre novamente na sua conta e tente de novo.</p>';
  }
}

async function carregarAvisosAdmin() {
  const lista = document.getElementById('listaAvisosAdmin');
  if (!lista) return;
  try {
    const avisos = await api('/avisos');
    lista.innerHTML = avisos.length ? avisos.map(a => `
      <article class="aviso-publicado">
        <div class="aviso-publicado-topo"><strong>Aviso publicado</strong><small>${new Date(a.dataCriacao).toLocaleString('pt-BR')}</small></div>
        <p class="aviso-publicado-texto"></p>
        <button type="button" class="btn-excluir-aviso" data-id="${a.id}">Encerrar aviso</button>
      </article>`).join('') : '<p class="sem-comentarios">Nenhum aviso ativo no momento.</p>';
    [...lista.querySelectorAll('.aviso-publicado-texto')].forEach((el, i) => el.textContent = avisos[i].texto);
    lista.querySelectorAll('.btn-excluir-aviso').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Deseja encerrar este aviso?')) return;
      try {
        await api(`/avisos/${btn.dataset.id}`, { method: 'DELETE' });
        await carregarAvisosAdmin();
      } catch (err) { mostrarToast(err.message); }
    }));
  } catch (err) {
    console.error(err);
    lista.innerHTML = '<p>Não foi possível carregar os avisos.</p>';
  }
}

function configurarAviso() {
  const form = document.getElementById('formAviso');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/avisos', { method: 'POST', body: JSON.stringify({ texto: document.getElementById('avisoTexto').value.trim(), diasExpiracao: Number(document.getElementById('avisoExpira').value) || null }) });
      mostrarToast('Aviso publicado!');
      setTimeout(() => window.location.href = 'avisos_admin.html', 500);
    } catch (err) { mostrarToast(err.message); }
  });
}

async function configurarLogout() {
  if (!location.pathname.endsWith('sair.html')) return;
  const token = localStorage.getItem('restaurante_token');
  const usuario = usuarioAtual();
  try {
    if (token) await api('/logout', { method: 'POST', body: JSON.stringify({ token }) });
  } catch (err) { console.error(err); }
  limparUsuario();
  localStorage.removeItem('restaurante_token');
  const status = document.getElementById('sair-status');
  if (status) status.textContent = usuario ? 'Até logo, ' + usuario.nome + '! Sessão encerrada.' : 'Sessão encerrada.';
  setTimeout(() => window.location.href = 'index.html', 1500);
}

destacarNavAtivo();
carregarCardapio();
carregarAvisos();
atualizarContadorAvisos();
configurarPaginaAvisos();
carregarAvisosAdmin();
configurarComentario();
configurarRestricao();
configurarCadastro();
configurarLogin();
configurarPratosAdmin();
configurarAddPrato();
configurarCardapioAdmin();
configurarAviso();
configurarRegistroPresencas();
carregarPresencasAdmin();
carregarComentariosAdmin();
carregarFormulariosAdmin();
configurarLogout();