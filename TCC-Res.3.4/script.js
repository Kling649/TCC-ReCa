const API = '/api';

function usuarioAtual() {
  try { return JSON.parse(localStorage.getItem('restaurante_usuario') || 'null'); }
  catch { return null; }
}

function salvarUsuario(usuario) { localStorage.setItem('restaurante_usuario', JSON.stringify(usuario)); }
function limparUsuario() { localStorage.removeItem('restaurante_usuario'); }

async function api(url, options = {}) {
  const response = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
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

async function carregarCardapio() {
  const grid = document.getElementById('cardapio-grid');
  if (!grid) return;
  try {
    const dias = await api('/cardapio/semana');
        grid.innerHTML = dias.map(dia => `
      <article class="card-dia">
        <div class="dia-header">${dia.nome}</div>
        <ul class="pratos-lista">
          ${dia.pratos.map(p => `<li data-prato-id="${p.id}">${p.nome}</li>`).join('') || '<li>Nenhum prato cadastrado.</li>'}
        </ul>
        <div class="sobremesa">Sobremesa: ${dia.sobremesa || 'Não informada'}</div>
        <div class="check"><label>Tenho Interesse:</label><input class="interesse-prato" type="checkbox" data-dia="${dia.nome}"></div>
      </article>`).join('');

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

async function carregarComentarios() {
  const lista = document.getElementById('listaComentarios');
  const vazio = document.getElementById('semComentarios');
  if (!lista) return;
  try {
    const dados = await api('/comentarios');
    lista.innerHTML = dados.map(c => `
      <div class="comentario-card">
        <div class="comentario-card-topo">
          <span class="comentario-card-dia">📅 ${c.diaRefeicao || 'Dia não informado'}</span>
          <span class="comentario-card-estrelas">${'★'.repeat(c.avaliacao || 0)}${'☆'.repeat(5 - (c.avaliacao || 0))}</span>
          <span class="comentario-card-data">${new Date(c.dataComentario).toLocaleString('pt-BR')}</span>
        </div>
        <p class="comentario-card-texto"></p>
      </div>`).join('');
    [...lista.querySelectorAll('.comentario-card-texto')].forEach((el, i) => el.textContent = dados[i].texto);
    if (vazio) vazio.style.display = dados.length ? 'none' : 'block';
  } catch (e) { console.error(e); }
}

async function configurarComentario() {
  const form = document.getElementById('formComentario');
  if (!form) return;
  await carregarComentarios();
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
    console.log('CLIQUE NO INTERESSE:', check.dataset.dia);
    const usuario = usuarioAtual();
    const dia = check.dataset.dia;
    if (!usuario?.id) {
      check.checked = false;
      mostrarToast('Faça login para marcar sua presença.');
      return;
    }
    try {
      if (check.checked) {
        await api('/presencas/marcar', { method: 'POST', body: JSON.stringify({ idUser: usuario.id, dia }) });
      } else {
        await api(`/presencas/marcar/${usuario.id}/${encodeURIComponent(dia)}`, { method: 'DELETE' });
      }
    } catch (err) {
      check.checked = !check.checked;
      mostrarToast(err.message);
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
    document.getElementById('media-marcadas').textContent = dados.medias.marcadas;
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
    try {
      const endpoint = tipo === 'nutricionista' ? '/nutricionistas' : '/alunos';
      await api(endpoint, { method: 'POST', body: JSON.stringify(dados) });
      mostrarToast('Conta criada com sucesso!');
      setTimeout(() => window.location.href = 'login.html', 500);
    } catch (err) { mostrarToast(err.message); }
  });
  const tipo = document.getElementById('tipoUsuario');
  const matricula = document.getElementById('campoMatricula');
  if (tipo && matricula) tipo.addEventListener('change', () => matricula.style.display = tipo.value === 'aluno' ? 'block' : 'none');
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
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/pratos', { method: 'POST', body: JSON.stringify({
        nome: document.getElementById('pratoNome').value.trim(),
        descricao: document.getElementById('pratoDescricao').value.trim(),
        ingredientes: document.getElementById('pratoIngredientes').value.trim(),
        modoPreparo: document.getElementById('pratoModo').value.trim(),
        tempoPreparo: Number(document.getElementById('pratoTempo').value) || null
      })});
      mostrarToast('Prato cadastrado!');
      setTimeout(() => window.location.href = 'Pratos_admin.html', 500);
    } catch (err) { mostrarToast(err.message); }
  });
}

async function configurarCardapioAdmin() {
  const form = document.getElementById('formCardapioAdmin');
  if (!form) return;
  const pratos = await api('/pratos');
  document.querySelectorAll('.dia-pratos').forEach(select => {
    select.innerHTML = pratos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/cardapio/semana', { method: 'DELETE' });
      for (const select of document.querySelectorAll('.dia-pratos')) {
        for (const option of select.selectedOptions) {
          await api('/cardapio', { method: 'POST', body: JSON.stringify({ dia: select.dataset.dia, idPrato: Number(option.value), sobremesa: document.getElementById('sobremesa').value }) });
        }
      }
      mostrarToast('Cardápio atualizado!');
    } catch (err) { mostrarToast(err.message); }
  });
}

function configurarAviso() {
  const form = document.getElementById('formAviso');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/avisos', { method: 'POST', body: JSON.stringify({ texto: document.getElementById('avisoTexto').value.trim(), diasExpiracao: Number(document.getElementById('avisoExpira').value) || null }) });
      mostrarToast('Aviso publicado!');
      setTimeout(() => window.location.href = 'index_admin.html', 500);
    } catch (err) { mostrarToast(err.message); }
  });
}

function configurarLogout() {
  if (!location.pathname.endsWith('sair.html')) return;
  limparUsuario();
  localStorage.removeItem('restaurante_token');
}

destacarNavAtivo();
carregarCardapio();
carregarAvisos();
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
