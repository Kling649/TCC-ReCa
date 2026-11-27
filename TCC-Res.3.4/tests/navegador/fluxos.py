"""
Teste de fluxos no navegador (Playwright). Simula o aluno e a nutricionista:
agendar, comentar, responder formulário, ler avisos, editar cardápio, cadastrar prato,
fazer a contagem, publicar aviso e conferir a proteção da área administrativa.

Uso (com o servidor rodando, ex.: npm run dev:local):
  pip install playwright && python -m playwright install chromium
  python tests/navegador/fluxos.py desktop
  python tests/navegador/fluxos.py mobile
Variáveis opcionais: BASE_URL (padrão http://localhost:8787), CHROME_PATH.
Use banco limpo antes de rodar (apague .dados-local) para os resultados serem reproduzíveis.
"""
import asyncio, json, os, sys, urllib.request
from playwright.async_api import async_playwright
BASE = os.environ.get("BASE_URL", "http://localhost:8787")
CHROME = os.environ.get("CHROME_PATH")  # None = Chromium do próprio Playwright
PERFIL = sys.argv[1] if len(sys.argv) > 1 else "desktop"
VIEW = {"width": 1366, "height": 900} if PERFIL == "desktop" else {"width": 390, "height": 844}
ERROS = []
FALHAS = []

def api(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + "/api" + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode(); return e.code, (json.loads(t) if t else None)

def check(nome, cond, extra=""):
    print(("PASSOU  " if cond else "FALHOU  ") + nome + (f"  [{extra}]" if extra and not cond else ""))
    if not cond: FALHAS.append(nome)

async def aceitar(dialog):
    print(f"        (diálogo: {dialog.type} — {dialog.message[:70]!r})")
    await dialog.accept()

async def novo(b, token=None, usuario=None, pagina_inicial=None):
    ctx = await b.new_context(viewport=VIEW, is_mobile=(PERFIL == "mobile"), has_touch=(PERFIL == "mobile"), device_scale_factor=1)
    pg = await ctx.new_page()
    pg.on("pageerror", lambda e: ERROS.append(f"JS {pg.url}: {e}"))
    pg.on("console", lambda m: ERROS.append(f"console {pg.url}: {m.text[:200]}") if m.type == "error" and "Failed to load resource" not in m.text and "fonts.googleapis" not in m.text else None)
    pg.on("dialog", lambda d: asyncio.ensure_future(aceitar(d)))
    if token:
        await pg.goto(BASE + "/login.html", wait_until="domcontentloaded")
        await pg.evaluate("([t,u])=>{localStorage.setItem('restaurante_token',t);localStorage.setItem('restaurante_usuario',JSON.stringify(u));}", [token, usuario])
    return ctx, pg

async def fluxo_aluno(b):
    print("\n=== FLUXO ALUNO ===")
    ctx, pg = await novo(b)
    # 1. Login pela tela
    await pg.goto(BASE + "/login.html", wait_until="networkidle")
    await pg.fill("#email", "ana@aluno.com"); await pg.fill("#senha", "segredo1")
    await pg.click("#btn-entrar")
    await pg.wait_for_url(BASE + "/", timeout=8000)
    await pg.wait_for_selector(".menu-usuario", state="attached")
    check("login do aluno leva ao cardápio", pg.url == BASE + "/")
    check("menu mostra saudação do aluno", "Olá, Ana" in (await pg.text_content(".menu-usuario")))

    # 2. Agendamento (toque no interruptor do dia aberto)
    cardapio = api("GET", "/cardapio/semana")[1]
    abertos = [d["nome"] for d in cardapio["dias"] if not d["encerrado"]]
    fechados = [d["nome"] for d in cardapio["dias"] if d["encerrado"]]
    if abertos:
        dia = abertos[0]
        global DIA_AGENDADO
        DIA_AGENDADO = dia
        await pg.wait_for_selector(f'[data-card="{dia}"] .interruptor', timeout=8000)
        await pg.click(f'[data-card="{dia}"] .interruptor')
        await pg.wait_for_timeout(700)
        marcado = await pg.is_checked(f'[data-card="{dia}"] input.agendar')
        check(f"agendar {dia} marca o interruptor", marcado)
        st = await pg.text_content(f'[data-card="{dia}"] [data-status]')
        check("status muda para 'Presença confirmada'", "confirmada" in st, st)
        await pg.reload(wait_until="networkidle"); await pg.wait_for_timeout(500)
        check("agendamento persiste após recarregar", await pg.is_checked(f'[data-card="{dia}"] input.agendar'))
        await pg.click(f'[data-card="{dia}"] .interruptor'); await pg.wait_for_timeout(600)
        check("cancelar agendamento desmarca", not await pg.is_checked(f'[data-card="{dia}"] input.agendar'))
        await pg.click(f'[data-card="{dia}"] .interruptor'); await pg.wait_for_timeout(600)
    if fechados:
        dis = await pg.is_disabled(f'[data-card="{fechados[0]}"] input.agendar')
        check(f"dia já passado ({fechados[0]}) fica bloqueado", dis)

    # 3. Comentário
    await pg.goto(BASE + "/comentarios.html", wait_until="networkidle")
    await pg.select_option("#dia", "Quinta-feira")
    await pg.click('#estrelas-escolha [data-nota="4"]')
    await pg.fill("#texto", "Arroz soltinho e feijão bem temperado, parabéns!")
    await pg.click("#btn-enviar")
    await pg.wait_for_timeout(900)
    check("comentário enviado aparece entre os recentes", "Arroz soltinho" in (await pg.text_content("#lista-recentes")))
    # validação: sem dia/nota
    await pg.click("#btn-enviar"); await pg.wait_for_timeout(200)
    err_visivel = await pg.is_visible('[data-erro-para="texto"]') or await pg.is_visible('[data-erro-para="avaliacao"]')
    check("validação do comentário mostra erro sem enviar", err_visivel)
    ncom = api("GET", "/comentarios?tamanho=1")[1]["total"]
    check("'Ver mais' aparece quando há mais de 3 comentários", await pg.is_visible("#btn-ver-mais"), f"total={ncom}")
    if await pg.is_visible("#btn-ver-mais"):
        await pg.click("#btn-ver-mais")
        await pg.wait_for_selector("#janela-comentarios[open]", timeout=5000)
        check("janela de todos os comentários abre", True)
        await pg.click('#filtro-dias [data-filtro="Quinta-feira"]')
        await pg.wait_for_timeout(700)
        cards = await pg.locator("#lista-todos .comentario").count()
        check("filtro por dia mostra só cards do dia escolhido", cards >= 1, f"cards={cards}")
        textos = await pg.locator("#lista-todos .comentario-dia").all_text_contents()
        check("todos os cards filtrados são de quinta", all("Quinta" in t for t in textos), str(textos[:3]))
        await pg.click('#filtro-dias [data-filtro="todos"]'); await pg.wait_for_timeout(600)
        if await pg.is_visible("#btn-carregar-mais"):
            antes = await pg.locator("#lista-todos .comentario").count()
            await pg.click("#btn-carregar-mais"); await pg.wait_for_timeout(700)
            depois = await pg.locator("#lista-todos .comentario").count()
            check("'Carregar mais' acrescenta comentários", depois > antes, f"{antes}->{depois}")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)

    # 4. Formulário de restrição
    await pg.goto(BASE + "/formularios.html", wait_until="networkidle")
    check("nome e matrícula vêm preenchidos para o aluno logado", (await pg.input_value("#nome")) == "Ana Aluna")
    await pg.click('[data-possui="sim"]')
    await pg.wait_for_timeout(300)
    await pg.click('.opcao-restricao:has-text("Glúten")')
    await pg.click('.opcao-restricao:has-text("Lactose")')
    await pg.click("#btn-enviar"); await pg.wait_for_timeout(900)
    _, lista_forms = api("GET", "/formularios/restricao/admin", None, NUTRI["token"])
    registro = [i for i in lista_forms["itens"] if i["matricula"] == "2026001"]
    check("formulário gravado no servidor com as duas restrições", bool(registro) and {r["nome"] for r in registro[0]["restricoes"]} == {"Glúten", "Lactose"}, str(registro[:1]))

    # 5. Avisos
    await pg.goto(BASE + "/avisos.html", wait_until="networkidle")
    await pg.wait_for_timeout(400)
    check("avisos listados para o aluno", await pg.locator(".aviso").count() >= 1)
    check("aviso 'Novo' aparece", await pg.locator(".etiqueta.novo").count() >= 1)
    await pg.click("#btn-marcar-todos"); await pg.wait_for_timeout(700)
    check("marcar todos zera os não lidos", await pg.locator(".etiqueta.novo").count() == 0)
    check("contador do menu some depois de ler", await pg.locator(".topo .badge-aviso").count() == 0)
    await ctx.close()

async def fluxo_nutri(b):
    print("\n=== FLUXO NUTRICIONISTA ===")
    ctx, pg = await novo(b)
    await pg.goto(BASE + "/login.html", wait_until="networkidle")
    await pg.fill("#email", "nutri@ifrj.com"); await pg.fill("#senha", "segredo1")
    await pg.click("#btn-entrar")
    await pg.wait_for_url(BASE + "/admin/", timeout=8000)
    await pg.wait_for_selector("#indicadores .indicador", timeout=8000)
    check("login da nutricionista leva ao painel", pg.url == BASE + "/admin/")
    check("painel mostra os indicadores", await pg.locator("#indicadores .indicador").count() == 5)

    # Cardápio: marcar um prato, sobremesa e salvar
    await pg.goto(BASE + "/admin/cardapio.html", wait_until="networkidle")
    await pg.wait_for_selector(".prato-opcao", timeout=8000)
    await pg.click('.prato-opcao[data-dia="Sexta-feira"]:has-text("Lentilha")')
    await pg.fill("#sobremesa-Sexta-feira", "Banana")
    check("alterações não salvas aparecem", await pg.is_visible("#estado-alteracoes"))
    await pg.click("#btn-salvar"); await pg.wait_for_timeout(900)
    check("cardápio salvo (aviso de sucesso)", "salvo" in (await pg.text_content(".toast")))
    await pg.reload(wait_until="networkidle"); await pg.wait_for_selector(".prato-opcao", timeout=8000)
    check("cardápio persiste após recarregar", await pg.get_attribute('.prato-opcao[data-dia="Sexta-feira"]:has-text("Lentilha")', "aria-pressed") == "true")
    check("sobremesa salva por dia", (await pg.input_value("#sobremesa-Sexta-feira")) == "Banana")

    # Cadastrar prato e incluir no cardápio
    await pg.goto(BASE + "/admin/prato.html", wait_until="networkidle")
    await pg.fill("#nome", "Strogonoff de frango")
    await pg.fill("#ingredientes", "Frango, creme de leite, cogumelos")
    await pg.fill("#modo", "Refogar o frango e misturar o creme.")
    await pg.fill("#tempo", "35")
    await pg.select_option("#dia-cardapio", "Quarta-feira")
    await pg.click("#btn-salvar"); await pg.wait_for_timeout(1400)
    lista = api("GET", "/pratos")[1]
    check("prato cadastrado pela tela", any(p["nome"] == "Strogonoff de frango" for p in lista))
    cardapio = api("GET", "/cardapio/semana")[1]
    quarta = [d for d in cardapio["dias"] if d["nome"] == "Quarta-feira"][0]
    check("prato incluído no dia escolhido", any(p["nome"] == "Strogonoff de frango" for p in quarta["pratos"]))
    check("outros pratos de quarta foram mantidos", len(quarta["pratos"]) >= 4, str(len(quarta["pratos"])))

    # Validação do formulário de prato
    await pg.goto(BASE + "/admin/prato.html", wait_until="networkidle")
    await pg.click("#btn-salvar"); await pg.wait_for_timeout(200)
    check("prato sem nome mostra erro", await pg.is_visible('[data-erro-para="nome"]'))

    # Contagem: caso simples (Segunda, sem declarados) e caso com confirmação (Quinta)
    await pg.goto(BASE + "/admin/contagem.html", wait_until="networkidle")
    await pg.wait_for_selector("#painel:not([hidden])", timeout=8000)
    check("contagem abre no primeiro dia pendente", "Segunda" in (await pg.text_content("#titulo-dia")))
    await pg.click("#mais"); await pg.click("#mais")
    check("botão + soma uma pessoa por toque", (await pg.input_value("#efetivados")) == "2")
    check("prévia mostra excedente quando há mais que o declarado", "Excedente" in (await pg.text_content("#previa")))
    await pg.click("#salvar"); await pg.wait_for_timeout(900)
    mini = await pg.text_content("#resumo-dia")
    check("resumo do dia mostra excedente salvo", "Excedente" in mini and "2" in mini, mini[:80])
    # Quinta: declarados > 0 (aluno agendou) -> valor muito grande pede confirmação
    cardapio_hoje = api("GET", "/cardapio/semana")[1]["dias"]
    idx_agendado = [d["nome"] for d in cardapio_hoje].index(DIA_AGENDADO)
    await pg.click(f'.dia-botao[data-indice="{idx_agendado}"]'); await pg.wait_for_timeout(500)
    declarados = int((await pg.text_content("#declarados")).strip() or 0)
    check(f"declarados de {DIA_AGENDADO} = 1 (o aluno agendou)", declarados == 1, str(declarados))
    await pg.fill("#efetivados", "")
    await pg.fill("#efetivados", "20")
    await pg.click("#salvar"); await pg.wait_for_timeout(1000)
    res_q = [d for d in api("GET", "/presencas/resumo", None, NUTRI["token"])[1]["dias"] if d["dia"] == DIA_AGENDADO][0]
    check("valor muito diferente pediu confirmação e foi salvo após 'OK' (efetivados=20)", res_q["efetivados"] == 20, str(res_q))
    # Validação: valor inválido não salva
    await pg.fill("#efetivados", "-3"); await pg.click("#salvar"); await pg.wait_for_timeout(300)
    await pg.click("#salvar"); await pg.wait_for_timeout(300)
    check("valor negativo é recusado com mensagem", "números" in (await pg.text_content("#erro-contagem")), (await pg.text_content("#erro-contagem")))
    res_q2 = [d for d in api("GET", "/presencas/resumo", None, NUTRI["token"])[1]["dias"] if d["dia"] == DIA_AGENDADO][0]
    check("valor inválido NÃO foi enviado ao servidor (continua 20)", res_q2["efetivados"] == 20)

    # Presenças (resumo)
    await pg.goto(BASE + "/admin/presencas.html", wait_until="networkidle")
    await pg.wait_for_timeout(500)
    check("tabela de presenças com colunas novas", "Excedente" in (await pg.text_content("#tabela thead")) and "Faltas" in (await pg.text_content("#tabela thead")) and "Declarados" in (await pg.text_content("#tabela thead")))
    check("tabela tem linhas dos 5 dias", await pg.locator("#corpo tr").count() == 5)

    # Comentários recebidos
    await pg.goto(BASE + "/admin/comentarios.html", wait_until="networkidle")
    await pg.wait_for_selector("#lista .comentario", timeout=8000)
    check("comentário mostra o nome de quem comentou", "Ana Aluna" in (await pg.text_content("#lista")))
    await pg.click('#filtro [data-filtro="Quinta-feira"]'); await pg.wait_for_timeout(500)
    check("filtro de comentários por dia", await pg.locator("#lista .comentario").count() >= 1)

    # Restrições
    await pg.goto(BASE + "/admin/formularios.html", wait_until="networkidle")
    await pg.wait_for_selector("#lista .cartao-aluno", timeout=8000)
    check("restrição da aluna aparece com etiqueta", "Glúten" in (await pg.text_content("#lista")))
    await pg.fill("#nome-nova", "Milho"); await pg.select_option("#categoria-nova", "Alergia")
    await pg.click("#btn-nova"); await pg.wait_for_timeout(800)
    cat = api("GET", "/restricoes")[1]
    check("nova restrição cadastrada no catálogo público", any(r["nome"] == "Milho" for r in cat))

    # Avisos
    await pg.goto(BASE + "/admin/avisos.html", wait_until="networkidle")
    await pg.fill("#texto", "Hoje haverá manutenção na cozinha; o almoço será servido às 12h30.")
    await pg.click('[data-tipo="Urgente"]')
    await pg.select_option("#expiracao", "1")
    await pg.click("#btn-publicar"); await pg.wait_for_timeout(900)
    check("aviso urgente publicado aparece na lista", await pg.locator("#lista .etiqueta.tipo-urgente").count() >= 1)

    # Segurança: aluno não entra na área da nutricionista
    ctx2, pg2 = await novo(b, ALUNO["token"], ALUNO["usuario"])
    await pg2.goto(BASE + "/admin/", wait_until="domcontentloaded")
    await pg2.wait_for_timeout(2800)
    check("aluno é retirado da área da nutricionista", pg2.url == BASE + "/" or "exclusiva" in (await pg2.content()))
    await ctx2.close()
    st, _ = api("GET", "/comentarios/admin", None, ALUNO["token"])
    check("API nega a rota administrativa ao aluno (403)", st == 403, str(st))
    await ctx.close()

async def main():
    global NUTRI, ALUNO
    # Garante as contas de teste (no banco limpo elas não existem).
    api("POST", "/nutricionistas", {"nome": "Nutri Teste", "email": "nutri@ifrj.com", "senha": "segredo1", "codigoAutorizacao": "CODIGO-TESTE-E2E"})
    api("POST", "/alunos", {"nome": "Ana Aluna", "email": "ana@aluno.com", "senha": "segredo1", "matricula": "2026001"})
    _, n = api("POST", "/login", {"email": "nutri@ifrj.com", "senha": "segredo1"}); NUTRI = n
    _, a = api("POST", "/login", {"email": "ana@aluno.com", "senha": "segredo1"}); ALUNO = a
    # Massa de dados: 12 comentários (testa "Ver mais" e paginação) e a restrição da aluna
    for i in range(12):
        api("POST", "/comentarios", {"diaRefeicao": ["Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira"][i % 5], "avaliacao": (i % 5) + 1, "texto": f"Comentário de teste número {i+1} sobre o almoço."}, None)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        await fluxo_aluno(b)
        await fluxo_nutri(b)
        await b.close()
    print("\nErros de JavaScript/console:", len(ERROS))
    for e in ERROS[:12]: print("   ", e)
    print("Falhas:", FALHAS if FALHAS else "nenhuma")

NUTRI = ALUNO = None
DIA_AGENDADO = None
asyncio.run(main())
