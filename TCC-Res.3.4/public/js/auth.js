/* Login, cadastro e saída da conta. */
(function () {
  'use strict';
  const { api, aviso, Sessao, destinoAposLogin, pronto } = window.Comum;
  const el = (id) => document.getElementById(id);
  const pagina = location.pathname;

  // ---------- Utilitários de formulário ----------
  function marcarErro(campo, mensagem) {
    const caixa = document.querySelector(`[data-erro-para="${campo}"]`);
    if (caixa) { caixa.textContent = mensagem; caixa.hidden = !mensagem; }
    caixa?.closest('.campo')?.classList.toggle('com-erro', Boolean(mensagem));
  }
  function mostrarMensagem(id, texto) {
    const caixa = el(id);
    if (!caixa) return;
    caixa.textContent = texto;
    caixa.hidden = !texto;
  }

  // ---------- Login ----------
  async function entrar(evento) {
    evento.preventDefault();
    marcarErro('email', '');
    marcarErro('senha', '');
    mostrarMensagem('msg-erro', '');
    const email = el('email').value.trim();
    const senha = el('senha').value;
    if (!email) { marcarErro('email', 'Informe seu e-mail.'); return el('email').focus(); }
    if (!senha) { marcarErro('senha', 'Informe sua senha.'); return el('senha').focus(); }

    const botao = el('btn-entrar');
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
      const r = await api('/login', { body: { email, senha }, semToken: true });
      Sessao.salvar(r.token, r.usuario);
      aviso(`Bem-vindo, ${r.usuario.nome.split(' ')[0]}! ✓`);
      setTimeout(() => { location.href = destinoAposLogin(r.usuario); }, 400);
    } catch (erro) {
      mostrarMensagem('msg-erro', erro.status === 401 ? 'E-mail ou senha inválidos.' : erro.message);
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  }

  // ---------- Cadastro ----------
  let tipoCadastro = 'aluno';

  function trocarTipo(tipo) {
    tipoCadastro = tipo;
    document.querySelectorAll('[data-tipo]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.tipo === tipo));
    });
    el('campo-matricula').hidden = tipo !== 'aluno';
    el('campo-codigo').hidden = tipo !== 'nutricionista';
  }

  function validarCadastro() {
    ['nome', 'email', 'matricula', 'codigo', 'senha', 'senha2'].forEach((c) => marcarErro(c, ''));
    let valido = true;
    const nome = el('nome').value.trim();
    const email = el('email').value.trim();
    const matricula = el('matricula').value.trim();
    const senha = el('senha').value;
    if (nome.length < 2) { marcarErro('nome', 'Informe seu nome completo.'); valido = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { marcarErro('email', 'Informe um e-mail válido.'); valido = false; }
    if (tipoCadastro === 'aluno' && !matricula) { marcarErro('matricula', 'Informe sua matrícula.'); valido = false; }
    if (tipoCadastro === 'nutricionista' && !el('codigo').value.trim()) {
      marcarErro('codigo', 'Informe o código de autorização.'); valido = false;
    }
    if (senha.length < 6) { marcarErro('senha', 'A senha deve ter pelo menos 6 caracteres.'); valido = false; }
    if (el('senha2').value !== senha) { marcarErro('senha2', 'As senhas não são iguais.'); valido = false; }
    return valido;
  }

  async function cadastrar(evento) {
    evento.preventDefault();
    mostrarMensagem('msg-erro', '');
    if (!validarCadastro()) {
      document.querySelector('.campo.com-erro input')?.focus();
      return;
    }
    const corpo = {
      nome: el('nome').value.trim(),
      email: el('email').value.trim(),
      senha: el('senha').value,
    };
    if (tipoCadastro === 'aluno') {
      corpo.matricula = el('matricula').value.trim();
    } else {
      corpo.codigoAutorizacao = el('codigo').value.trim();
    }
    const botao = el('btn-cadastrar');
    botao.disabled = true;
    botao.textContent = 'Criando conta…';
    try {
      await api(tipoCadastro === 'aluno' ? '/alunos' : '/nutricionistas', { body: corpo, semToken: true });
      location.href = '/login.html?cadastrado=1';
    } catch (erro) {
      mostrarMensagem('msg-erro', erro.message);
      botao.disabled = false;
      botao.textContent = 'Criar conta';
    }
  }

  // ---------- Saída ----------
  async function sair() {
    const nome = Sessao.usuario()?.nome;
    try {
      if (Sessao.token()) await api('/logout', { method: 'POST' });
    } catch { /* mesmo sem conexão, encerra a sessão local */ }
    Sessao.limpar();
    el('sair-status').textContent = nome
      ? `Até logo, ${nome.split(' ')[0]}! Sessão encerrada.`
      : 'Sessão encerrada.';
    setTimeout(() => { location.href = '/'; }, 1500);
  }

  pronto.then((usuario) => {
    if (pagina.endsWith('/sair.html')) {
      sair();
      return;
    }
    if (pagina.endsWith('/login.html')) {
      if (usuario) location.replace(destinoAposLogin(usuario));
      else {
        if (new URLSearchParams(location.search).get('cadastrado')) mostrarMensagem('msg-cadastrado', 'Conta criada com sucesso! Agora é só entrar.');
        el('form-login').addEventListener('submit', entrar);
      }
      return;
    }
    if (pagina.endsWith('/cadastro.html')) {
      document.querySelectorAll('[data-tipo]').forEach((b) => {
        b.addEventListener('click', () => trocarTipo(b.dataset.tipo));
      });
      trocarTipo('aluno');
      el('form-cadastro').addEventListener('submit', cadastrar);
    }
  }, () => {});
})();
