/* Restrições alimentares: resumo por tipo, filtro, lista dos alunos e cadastro de novos tipos. */
(function () {
  'use strict';
  const { api, esc, aviso, formatarDataCurta, pronto } = window.Comum;
  const el = (id) => document.getElementById(id);
  const TAMANHO = 20;

  let filtro = 'todas';
  let pagina = 1;
  let temMais = false;

  function renderResumo(resumo) {
    el('resumo').innerHTML = `
      <div class="indicador"><span class="valor">${resumo.comRestricao}</span><span class="legenda">Com restrição</span>
        <span class="detalhe">alunos (último formulário)</span></div>
      <div class="indicador"><span class="valor">${resumo.semRestricao}</span><span class="legenda">Sem restrição</span></div>`;
    el('filtro').innerHTML = [
      ['todas', 'Todas', resumo.comRestricao + resumo.semRestricao, true],
      ...resumo.porRestricao.map((r) => [String(r.id), r.nome, r.quantidade, false]),
    ].map(([valor, rotulo, qtd]) => `
      <button type="button" class="chip" data-filtro="${esc(valor)}" aria-pressed="${valor === filtro}">
        ${esc(rotulo)}<span class="contagem">${qtd}</span></button>`).join('');
  }

  function htmlCartao(f) {
    const chips = f.possuiRestricao && f.restricoes.length
      ? `<div class="chips">${f.restricoes.map((r) =>
          `<span class="etiqueta tipo-importante">${esc(r.nome)}</span>`).join('')}</div>`
      : '';
    const situacao = f.possuiRestricao
      ? '<span class="etiqueta" style="background:var(--laranja-claro);color:#a74c00">Possui restrição</span>'
      : '<span class="etiqueta ativo">Sem restrição</span>';
    return `
      <article class="cartao-aluno">
        <div class="comentario-topo" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <h3>${esc(f.nome)}</h3>${situacao}
        </div>
        <p class="meta">Matrícula ${esc(f.matricula)} · enviado em ${esc(formatarDataCurta(f.dataEnvio.slice(0, 10)))}
          ${f.envios > 1 ? ` · ${f.envios} envios` : ''}</p>
        ${chips}
        ${f.descricao ? `<p class="descricao">${esc(f.descricao)}</p>` : ''}
      </article>`;
  }

  async function carregarLista({ acrescentar }) {
    const parametros = new URLSearchParams({ pagina: String(pagina), tamanho: String(TAMANHO) });
    if (filtro !== 'todas') parametros.set('restricao', filtro);
    const dados = await api(`/formularios/restricao/admin?${parametros}`);
    temMais = dados.temMais;
    renderResumo(dados.resumo);
    const html = dados.itens.map(htmlCartao).join('');
    if (acrescentar) el('lista').insertAdjacentHTML('beforeend', html);
    else el('lista').innerHTML = html;
    el('vazio').hidden = dados.total > 0;
    el('btn-mais').hidden = !temMais;
    el('contagem').textContent = dados.total ? `Mostrando ${el('lista').children.length} de ${dados.total} aluno(s)` : '';
  }

  function trocarFiltro(e) {
    const botao = e.target.closest('[data-filtro]');
    if (!botao) return;
    filtro = botao.dataset.filtro;
    pagina = 1;
    el('lista').innerHTML = '<p class="carregando-texto">Carregando…</p>';
    carregarLista({ acrescentar: false }).catch((erro) => aviso(erro.message, 'erro'));
  }

  async function cadastrarRestricao(evento) {
    evento.preventDefault();
    const nome = el('nome-nova').value.trim();
    const caixa = document.querySelector('[data-erro-para="nome-nova"]');
    caixa.hidden = true;
    el('campo-nome-nova').classList.remove('com-erro');
    if (nome.length < 2) {
      caixa.textContent = 'Informe um nome com pelo menos 2 caracteres.';
      caixa.hidden = false;
      el('campo-nome-nova').classList.add('com-erro');
      return;
    }
    const botao = el('btn-nova');
    botao.disabled = true;
    try {
      await api('/restricoes', {
        body: {
          nome,
          categoria: el('categoria-nova').value,
          descricao: el('descricao-nova').value.trim() || null,
        },
      });
      aviso('Restrição cadastrada! Ela já aparece para os alunos. ✓');
      el('form-nova').reset();
    } catch (erro) {
      aviso(erro.message, 'erro');
    } finally {
      botao.disabled = false;
    }
  }

  pronto.then(() => {
    el('filtro').addEventListener('click', trocarFiltro);
    el('btn-mais').addEventListener('click', () => {
      if (!temMais) return;
      pagina += 1;
      carregarLista({ acrescentar: true }).catch((erro) => aviso(erro.message, 'erro'));
    });
    el('form-nova').addEventListener('submit', cadastrarRestricao);
    carregarLista({ acrescentar: false }).catch((erro) => {
      el('lista').innerHTML = `<div class="mensagem erro" style="grid-column:1/-1">${esc(erro.message)}</div>`;
    });
  }, () => {});
})();
