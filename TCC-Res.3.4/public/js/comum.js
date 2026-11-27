/* =====================================================================
   TCC-Res 3.4 — script comum
   - Chamadas à API com token de sessão
   - Menu gerado a partir de uma única lista (mesmo menu em todas as páginas)
   - Proteção da área da nutricionista (body[data-area="admin"])
   - Utilitários: escapar HTML, datas, mensagens
   Todas as páginas carregam este arquivo antes do script próprio da página.
   ===================================================================== */
(function () {
  'use strict';

  const CHAVE_TOKEN = 'restaurante_token';
  const CHAVE_USUARIO = 'restaurante_usuario';
  const DIAS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
  const DIAS_SIGLA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
  const FUSO = 'America/Sao_Paulo';

  const MENU_PUBLICO = [
    { href: '/', rotulo: 'Cardápio' },
    { href: '/comentarios.html', rotulo: 'Comentários' },
    { href: '/formularios.html', rotulo: 'Formulários' },
    { href: '/avisos.html', rotulo: 'Avisos', aviso: true },
    { href: '/contato.html', rotulo: 'Contato' },
  ];

  const MENU_ADMIN = [
    { href: '/admin/', rotulo: 'Painel' },
    { href: '/admin/cardapio.html', rotulo: 'Cardápio' },
    { href: '/admin/pratos.html', rotulo: 'Pratos' },
    { href: '/admin/contagem.html', rotulo: 'Contagem' },
    { href: '/admin/presencas.html', rotulo: 'Presenças' },
    { href: '/admin/comentarios.html', rotulo: 'Comentários' },
    { href: '/admin/formularios.html', rotulo: 'Formulários' },
    { href: '/admin/avisos.html', rotulo: 'Avisos' },
    { href: '/admin/contato.html', rotulo: 'Contato' },
  ];

  // ------------------------------------------------------------------
  // Sessão (guardada no navegador)
  // ------------------------------------------------------------------
  const Sessao = {
    token() { return localStorage.getItem(CHAVE_TOKEN); },
    usuario() {
      try { return JSON.parse(localStorage.getItem(CHAVE_USUARIO) || 'null'); } catch { return null; }
    },
    salvar(token, usuario) {
      localStorage.setItem(CHAVE_TOKEN, token);
      localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
    },
    limpar() {
      localStorage.removeItem(CHAVE_TOKEN);
      localStorage.removeItem(CHAVE_USUARIO);
    },
  };

  // ------------------------------------------------------------------
  // Chamadas à API
  // ------------------------------------------------------------------
  class ErroApi extends Error {
    constructor(status, mensagem, dados) {
      super(mensagem);
      this.name = 'ErroApi';
      this.status = status;
      this.dados = dados;
    }
  }

  function mensagemPadrao(status) {
    if (status === 0) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    if (status === 401) return 'Sua sessão expirou. Entre novamente.';
    if (status === 403) return 'Você não tem permissão para esta ação.';
    if (status === 404) return 'Não encontrado.';
    if (status === 409) return 'Já existe um registro com estes dados.';
    if (status === 503) return 'Este recurso não está disponível no momento.';
    return 'Erro no servidor. Tente de novo em instantes.';
  }

  /**
   * Chama a API. `body` (objeto) é enviado como JSON; FormData é enviado como está.
   * Em erro, lança ErroApi com a mensagem em português vinda do servidor.
   */
  async function api(caminho, opcoes = {}) {
    const cabecalhos = {};
    let corpo;
    if (opcoes.body instanceof FormData) {
      corpo = opcoes.body;
    } else if (opcoes.body !== undefined) {
      cabecalhos['Content-Type'] = 'application/json';
      corpo = JSON.stringify(opcoes.body);
    }
    const token = Sessao.token();
    if (token && !opcoes.semToken) cabecalhos.Authorization = `Bearer ${token}`;

    let resposta;
    try {
      resposta = await fetch(`/api${caminho}`, {
        method: opcoes.method || (corpo !== undefined ? 'POST' : 'GET'),
        headers: cabecalhos,
        body: corpo,
        cache: 'no-store',
      });
    } catch {
      throw new ErroApi(0, mensagemPadrao(0));
    }

    let dados = null;
    if (resposta.status !== 204) {
      try { dados = await resposta.json(); } catch { dados = null; }
    }
    if (!resposta.ok) {
      if (resposta.status === 401 && token) Sessao.limpar();
      throw new ErroApi(resposta.status, (dados && dados.mensagem) || mensagemPadrao(resposta.status), dados);
    }
    return dados;
  }

  // ------------------------------------------------------------------
  // Utilitários
  // ------------------------------------------------------------------
  /** Escapa texto para uso seguro dentro de HTML (evita injeção de código). */
  function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /** Mostra uma mensagem rápida na parte inferior da tela. */
  function aviso(mensagem, tipo = 'sucesso') {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = mensagem;
    toast.dataset.tipo = tipo;
    toast.classList.add('visivel');
    clearTimeout(toast._temporizador);
    toast._temporizador = setTimeout(() => toast.classList.remove('visivel'), tipo === 'erro' ? 5200 : 3000);
  }

  /** Data e hora no fuso de Brasília, a partir de um timestamp da API. */
  function formatarDataHora(timestamp) {
    if (!timestamp) return '';
    const data = new Date(timestamp);
    if (Number.isNaN(data.getTime())) return '';
    return data.toLocaleString('pt-BR', {
      timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  /** "AAAA-MM-DD" -> "DD/MM" sem depender do fuso do navegador. */
  function formatarDataCurta(iso) {
    const [, mes, dia] = String(iso || '').split('-');
    return dia && mes ? `${dia}/${mes}` : '';
  }

  /** Estrelas (1 a 5) em texto, para exibição. */
  function estrelas(nota) {
    const n = Math.max(0, Math.min(5, Number(nota) || 0));
    return `<span class="estrelas" aria-label="${n} de 5 estrelas">${'★'.repeat(n)}<span class="vazia">${'☆'.repeat(5 - n)}</span></span>`;
  }

  /** Caminho sem "index.html" e sem barra final extra, para comparar com o menu. */
  function caminhoAtual() {
    return location.pathname.replace(/index\.html$/, '');
  }

  function normalizarHref(href) {
    return href.replace(/index\.html$/, '');
  }

  // ------------------------------------------------------------------
  // Menu
  // ------------------------------------------------------------------
  function montarMenu(area, usuario, avisosNaoLidos) {
    const itens = area === 'admin' ? MENU_ADMIN : MENU_PUBLICO;
    const atual = caminhoAtual();
    const links = itens.map((item) => {
      const selecionado = normalizarHref(item.href) === atual ? ' aria-current="page"' : '';
      const badge = item.aviso && avisosNaoLidos > 0
        ? ` <span class="badge-aviso" aria-label="${avisosNaoLidos} avisos não lidos">${avisosNaoLidos > 9 ? '9+' : avisosNaoLidos}</span>`
        : '';
      return `<li><a href="${item.href}"${selecionado}>${esc(item.rotulo)}${badge}</a></li>`;
    }).join('');

    let usuarioHtml;
    if (usuario) {
      const primeiroNome = esc(String(usuario.nome || '').split(' ')[0]);
      const painel = usuario.tipoUsuario === 'nutricionista' && area !== 'admin'
        ? '<a href="/admin/">Área da nutricionista</a>' : '';
      usuarioHtml = `<span>Olá, ${primeiroNome}</span>${painel}<a href="/sair.html">Sair</a>`;
    } else {
      usuarioHtml = '<a href="/login.html">Entrar</a>';
    }

    const topo = document.createElement('header');
    topo.className = 'topo';
    topo.innerHTML = `
      <div class="topo-linha">
        <a class="marca" href="${area === 'admin' ? '/admin/' : '/'}">
          Restaurante IFRJ<small>${area === 'admin' ? 'Área da nutricionista' : 'Campus Pinheiral'}</small>
        </a>
        <button type="button" class="menu-botao" aria-expanded="false" aria-controls="menu-principal">
          <span aria-hidden="true">☰</span> Menu
        </button>
        <nav aria-label="Principal">
          <ul class="menu-links" id="menu-principal">${links}</ul>
        </nav>
        <div class="menu-usuario">${usuarioHtml}</div>
      </div>`;
    document.body.insertBefore(topo, document.body.firstChild);

    const botao = topo.querySelector('.menu-botao');
    botao.addEventListener('click', () => {
      const aberto = topo.classList.toggle('menu-aberto');
      botao.setAttribute('aria-expanded', String(aberto));
    });
  }

  async function contarAvisosNaoLidos(usuario) {
    if (!usuario || usuario.tipoUsuario !== 'aluno') return 0;
    try {
      const r = await api('/avisos/meus');
      return r.naoLidos || 0;
    } catch {
      return 0;
    }
  }

  // ------------------------------------------------------------------
  // Início de cada página
  // ------------------------------------------------------------------
  async function validarSessao() {
    if (!Sessao.token()) return null;
    try {
      const r = await api('/sessao');
      Sessao.salvar(Sessao.token(), r.usuario);
      return r.usuario;
    } catch (erro) {
      if (erro.status === 401) Sessao.limpar();
      return null;
    }
  }

  function destinoAposLogin(usuario) {
    const proximo = new URLSearchParams(location.search).get('proximo');
    if (proximo && proximo.startsWith('/') && !proximo.startsWith('//')) return proximo;
    return usuario.tipoUsuario === 'nutricionista' ? '/admin/' : '/';
  }

  let resolverPronto;
  let rejeitarPronto;
  const pronto = new Promise((resolve, reject) => { resolverPronto = resolve; rejeitarPronto = reject; });

  async function iniciar() {
    const area = document.body.dataset.area === 'admin' ? 'admin' : 'publica';
    const usuario = await validarSessao();

    if (area === 'admin') {
      if (!usuario) {
        location.replace(`/login.html?proximo=${encodeURIComponent(location.pathname)}`);
        return;
      }
      if (usuario.tipoUsuario !== 'nutricionista') {
        document.body.classList.remove('carregando');
        document.querySelector('main')?.insertAdjacentHTML('afterbegin',
          '<div class="mensagem erro">Esta área é exclusiva da nutricionista. Você será levado à página inicial.</div>');
        setTimeout(() => { location.replace('/'); }, 2500);
        rejeitarPronto(new Error('acesso negado'));
        return;
      }
    }

    const avisos = await contarAvisosNaoLidos(usuario);
    montarMenu(area, usuario, avisos);
    document.body.classList.remove('carregando');
    resolverPronto(usuario);
  }

  /** Atualiza o contador de avisos não lidos no menu (quando a página muda o número). */
  function atualizarBadge(quantidade) {
    document.querySelectorAll('.topo .menu-links a').forEach((link) => {
      if (!link.textContent.trim().startsWith('Avisos')) return;
      let badge = link.querySelector('.badge-aviso');
      if (!quantidade) { badge?.remove(); return; }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'badge-aviso';
        link.appendChild(document.createTextNode(' '));
        link.appendChild(badge);
      }
      badge.textContent = quantidade > 9 ? '9+' : String(quantidade);
      badge.setAttribute('aria-label', `${quantidade} avisos não lidos`);
    });
  }

  // Utilidades expostas para os outros scripts.
  window.Comum = {
    atualizarBadge,
    api,
    ErroApi,
    Sessao,
    esc,
    aviso,
    estrelas,
    formatarDataHora,
    formatarDataCurta,
    destinoAposLogin,
    DIAS,
    DIAS_SIGLA,
    pronto,
  };

  document.addEventListener('DOMContentLoaded', () => {
    iniciar().catch((erro) => {
      console.error(erro);
      document.body.classList.remove('carregando');
    });
  });
})();
