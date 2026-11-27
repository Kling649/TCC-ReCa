"""
Varredura das 18 páginas em desktop e celular: procura erros de JavaScript e
rolagem horizontal (o celular não deve ter conteúdo fora da tela).
Uso: python tests/navegador/varredura.py   (com o servidor rodando)
"""
import asyncio, json, os, urllib.request
from playwright.async_api import async_playwright
BASE = os.environ.get("BASE_URL", "http://localhost:8787")
CHROME = os.environ.get("CHROME_PATH")

def api(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + "/api" + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode() or "null"
            return r.status, json.loads(txt)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "null")

# Prepara contas: nutricionista e aluno
api("POST", "/nutricionistas", {"nome":"Nutri Teste","email":"nutri@ifrj.com","senha":"segredo1","codigoAutorizacao":"CODIGO-TESTE-E2E"})
api("POST", "/alunos", {"nome":"Ana Aluna","email":"ana@aluno.com","senha":"segredo1","matricula":"2026001"})
_, nlog = api("POST", "/login", {"email":"nutri@ifrj.com","senha":"segredo1"})
_, alog = api("POST", "/login", {"email":"ana@aluno.com","senha":"segredo1"})
NUTRI = nlog; ALUNO = alog

PUBLICAS = ["/", "/comentarios.html", "/formularios.html", "/avisos.html", "/contato.html", "/login.html", "/cadastro.html"]
ADMIN = ["/admin/", "/admin/cardapio.html", "/admin/pratos.html", "/admin/prato.html", "/admin/contagem.html",
         "/admin/presencas.html", "/admin/comentarios.html", "/admin/formularios.html", "/admin/avisos.html", "/admin/contato.html"]

async def checar(b, perfil, caminho, token_obj=None):
    vp = {"width":1366,"height":900} if perfil=="desktop" else {"width":390,"height":844}
    ctx = await b.new_context(viewport=vp, device_scale_factor=1, is_mobile=(perfil=="mobile"), has_touch=(perfil=="mobile"))
    page = await ctx.new_page()
    erros = []
    page.on("pageerror", lambda e: erros.append("JS: " + str(e)[:160]))
    page.on("console", lambda m: erros.append("console: " + m.text[:160]) if m.type == "error" and "fonts.googleapis" not in m.text and "Failed to load resource" not in m.text else None)
    if token_obj:
        await page.goto(BASE + "/login.html", wait_until="domcontentloaded")
        await page.evaluate("([t,u]) => { localStorage.setItem('restaurante_token', t); localStorage.setItem('restaurante_usuario', JSON.stringify(u)); }", [token_obj["token"], token_obj["usuario"]])
    await page.goto(BASE + caminho, wait_until="networkidle")
    await page.wait_for_timeout(500)
    over = await page.evaluate("() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})")
    url = page.url
    nome = caminho.strip("/").replace("/", "_").replace(".html", "") or "index"
    await page.screenshot(path=f"{os.environ.get('PASTA_CAPTURAS', '/tmp')}/{perfil}_{nome}.png", full_page=False)
    await ctx.close()
    return {"caminho": caminho, "perfil": perfil, "url_final": url.replace(BASE, ""), "overflow": over["sw"] > over["cw"], "sw": over["sw"], "cw": over["cw"], "erros": erros}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        resultados = []
        for perfil in ["desktop", "mobile"]:
            for c in PUBLICAS:
                resultados.append(await checar(b, perfil, c))
            for c in ADMIN:
                resultados.append(await checar(b, perfil, c, {"token": NUTRI["token"], "usuario": NUTRI["usuario"]}))
        await b.close()
        ruins = [r for r in resultados if r["erros"] or r["overflow"]]
        for r in resultados:
            flag = "OK " if not (r["erros"] or r["overflow"]) else "!! "
            print(f"{flag}{r['perfil']:8} {r['caminho']:26} -> {r['url_final']:26} overflow={r['overflow']} ({r['sw']}/{r['cw']})")
            for e in r["erros"][:4]: print("      ", e)
        print("\nTotal:", len(resultados), "| com problema:", len(ruins))
asyncio.run(main())
