"""Teste da v177 (correções da auditoria de layout do módulo Avaliação de imóveis, 24/10/2026):
  1. computador: os nomes das fases F1 a F10 aparecem inteiros;
  2. computador: as listas (Painel, Avaliações, Banco de mercado, Trilha de auditoria) cabem sem rolar para o lado;
  3. computador: na F4 a tabela da amostra ocupa a largura toda (estimativa e gates embaixo) e o botão Remover fica visível;
  4. celular: o botão "+" da barra de baixo tem o fundo amarelo;
  5. celular: os avisos não bloqueiam o toque nos botões que ficam embaixo deles;
  6. computador: o número do processo aparece inteiro na F1;
  e o menu lateral em ícones mostra o nome de cada item ao passar o mouse.
Precisa do mock_ava.js (porta 54322) e do site em http://localhost:8766/. Uso: python3 t177_layout.py pasta_imagens"""
import sys, os, json, time, re, urllib.request
from playwright.sync_api import sync_playwright
SITE = os.environ.get('AVA_SITE', 'http://localhost:8766/')
MOCK = 'http://localhost:54322'; SB = 'https://evcsniicnrlrtzpdmeza.supabase.co'
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
PLAT = ('/auth/v1/', '/rest/v1/acessos', '/rest/v1/rpc/minhas_areas', '/rest/v1/rpc/aval_', '/rest/v1/aval_', '/storage/v1/object/')
UNLOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'unlock.js')).read()
R = []
def rec(n, ok, d=''):
    R.append(bool(ok)); print(('OK    ' if ok else 'FALHA ') + n + ('' if ok else '  -> ' + str(d)[:400]), flush=True)
def srv(path, body=None):
    data = None if body is None else (body.encode() if isinstance(body, str) else json.dumps(body).encode())
    req = urllib.request.Request(MOCK + path, data=data, method='POST' if body is not None else 'GET', headers={'apikey': 'anon-test-key', 'content-type': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read() or 'null')
sql = lambda q: srv('/__mock/sql', q)
def criar(email, nome):
    j = srv('/auth/v1/signup', {'email': email, 'password': 'Senha#Forte82', 'data': {'nome': nome}}); uid = j['user']['id']
    sql(f"insert into public.acessos values ('{uid}','{email}','{nome}','aprovado','usuario')")
    sql(f"insert into public.teste_areas values ('{uid}','avaliacao_imoveis')")
    return {'access_token': j['access_token'], 'refresh_token': j['refresh_token'], 'user': j['user'], 'expires_at': int(time.time() * 1000) + 3600e3, 'email': email, 'nome': nome, 'perfil': 'usuario'}

def run():
    with sync_playwright() as p:
        b = p.chromium.launch()
        def ctx(movel, vw=1366):
            c = b.new_context(**(p.devices['iPhone 14'] if movel else {'viewport': {'width': vw, 'height': 900}}))
            def supa(route):
                path = route.request.url[len(SB):]
                if path.startswith(PLAT):
                    h = dict(route.request.headers); h['apikey'] = 'anon-test-key'
                    try: route.fulfill(response=route.fetch(url=MOCK + path, headers=h))
                    except Exception: route.abort()
                elif path.startswith('/rest/v1/usuarios_cpf'):
                    route.fulfill(status=200, content_type='application/json', body='[{"cpf":"52998224725"}]', headers={'Access-Control-Allow-Origin': '*'})
                else:
                    route.fulfill(status=200, content_type='application/json', body='[]', headers={'Access-Control-Allow-Origin': '*'})
            c.route(re.compile(r'^https://(?!evcsniicnrlrtzpdmeza).*'), lambda r: r.abort())
            c.route(SB + '/**', supa)
            pg = c.new_page(); pg.set_default_timeout(15000)
            return c, pg
        def entrar(pg, s):
            pg.goto(SITE + '#/educacao'); pg.wait_for_timeout(300)
            pg.evaluate("s=>{localStorage.setItem('gestao-fiscal-auth-session', JSON.stringify(s)); localStorage.setItem('sol-app-aviso-v173', String(Date.now()))}", s)
            pg.evaluate("location.hash='#/avaliacao-imoveis'"); pg.reload(); pg.wait_for_timeout(3000)
            fim = time.time() + 20
            while time.time() < fim:
                fr = pg.frame(url=re.compile(r'avaliacao\.html'))
                if fr:
                    try:
                        if fr.evaluate("typeof STATE!=='undefined'&&STATE.route!=='carregando'"): break
                    except Exception: pass
                pg.wait_for_timeout(250)
            fr.wait_for_timeout(1500)
            ids = fr.evaluate("DB.avaliacoes.filter(a=>a.ownerId===ownerId()).map(a=>({id:a.id,c:a.codigo,s:a.segmento}))")
            urb = next(a for a in ids if a['s'] == 'urbano')
            lib = fr.evaluate(f"(() => {{ const f = {UNLOCK}; return f({json.dumps(urb['c'])}); }})()")
            return fr, lib
        ir = lambda fr, r, prm=None: (fr.evaluate("([r,p]) => go(r,p)", [r, prm or {}]), fr.wait_for_timeout(500))
        TAB_LARGA = "() => [...document.querySelectorAll('.tbl-wrap')].filter(w => w.offsetParent && w.scrollWidth > w.clientWidth + 1).length"

        for vw in (1280, 1366):
            c, pg = ctx(False, vw); fr, lib = entrar(pg, criar(f'v177.{vw}.{time.time_ns()}@exemplo.com', 'Perito v177'))
            ir(fr, 'avaliacao', {'id': lib['id'], 'tab': 1})
            cort = fr.evaluate("""() => [...document.querySelectorAll('.stepper .step')].filter(s => [...s.querySelectorAll('span,b')]
                 .some(e => e.getBoundingClientRect().right > s.getBoundingClientRect().right - 2)).map(s => s.textContent.trim())""")
            rol = fr.evaluate("(() => { const s = document.querySelector('.stepper'); return s.scrollWidth - s.clientWidth })()")
            rec(f'{vw} px: nomes das fases F1 a F10 inteiros, sem rolar', not cort and rol <= 1, [cort, rol])
            proc = fr.evaluate("(() => { const i = document.getElementById('b-processo'); return i ? [i.scrollWidth, i.clientWidth] : null })()")
            rec(f'{vw} px: número do processo inteiro na F1', proc and proc[0] <= proc[1] + 1, proc)
            if vw == 1366: pg.screenshot(path=os.path.join(OUT, 'v177_fases_1366.png'))
            ruins = []
            for r in ('painel', 'avaliacoes', 'mercado', 'auditoria'):
                ir(fr, r); n = fr.evaluate(TAB_LARGA)
                if n: ruins.append(r)
            rec(f'{vw} px: Painel, Avaliações, Banco de mercado e Trilha de auditoria cabem sem rolar para o lado', not ruins, ruins)
            ir(fr, 'avaliacao', {'id': lib['id'], 'tab': 4})
            f4 = fr.evaluate("""() => { const pn = document.querySelector('.work > .panel').getBoundingClientRect(), rl = document.querySelector('.work > .rail').getBoundingClientRect();
                 const w = document.querySelector('.tbl-wrap'), wr = w.getBoundingClientRect(), bt = w.querySelector('[data-action=del-dado]').getBoundingClientRect();
                 return {embaixo: rl.top >= pn.bottom - 1, largura_painel: Math.round(pn.width), remover_visivel: bt.right <= wr.right + 1 && bt.left >= wr.left}; }""")
            rec(f'{vw} px: F4 com a tabela na largura toda, estimativa e gates embaixo, botão Remover visível', f4['embaixo'] and f4['remover_visivel'] and f4['largura_painel'] > 900, f4)
            ir(fr, 'avaliacao', {'id': lib['id'], 'tab': 3})
            rl3 = fr.evaluate("(() => { const pn = document.querySelector('.work > .panel').getBoundingClientRect(), rl = document.querySelector('.work > .rail').getBoundingClientRect(); return rl.left >= pn.right - 1 })()")
            rec(f'{vw} px: nas outras fases (ex.: F3) estimativa e gates continuam ao lado', rl3)
            tit = fr.evaluate("[...document.querySelectorAll('.side .nav button')].map(b => [b.title, getComputedStyle(b.querySelector('span')).display])")
            rec(f'{vw} px: menu lateral em ícones, com o nome de cada item ao passar o mouse', tit and all(t and d == 'none' for t, d in tit), tit)
            c.close()

        c, pg = ctx(False, 1920); fr, lib = entrar(pg, criar(f'v177.1920.{time.time_ns()}@exemplo.com', 'Perito v177'))
        w = fr.evaluate("innerWidth"); ir(fr, 'avaliacao', {'id': lib['id'], 'tab': 1})
        cort = fr.evaluate("[...document.querySelectorAll('.stepper .step')].filter(s => [...s.querySelectorAll('span,b')].some(e => e.getBoundingClientRect().right > s.getBoundingClientRect().right - 2)).length")
        rec(f'1920 px (quadro de {w} px): fases inteiras', cort == 0, cort)
        c.close()

        c, pg = ctx(True); fr, lib = entrar(pg, criar(f'v177.cel.{time.time_ns()}@exemplo.com', 'Perito v177'))
        ir(fr, 'avaliacao', {'id': lib['id'], 'tab': 6})
        fab = fr.evaluate("getComputedStyle(document.querySelector('.bnav .fab')).backgroundColor")
        acc = fr.evaluate("(() => { const d = document.createElement('div'); d.style.background = 'var(--accent)'; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c })()")
        rec('celular: botão "+" da barra de baixo com o fundo amarelo', fab == acc and fab != 'rgba(0, 0, 0, 0)', [fab, acc])
        fr.evaluate("toast('Teste de aviso por cima dos botões')"); fr.wait_for_timeout(200)
        sob = fr.evaluate("(() => { const t = document.querySelector('#toasts .toast').getBoundingClientRect(); const e = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2); return !!e && !e.closest('#toasts') })()")
        rec('celular: o toque passa pelo aviso e chega ao botão de baixo', sob)
        pg.screenshot(path=os.path.join(OUT, 'v177_celular.png'))
        c.close()
        b.close()
    print(f"\nv177 TOTAL {len(R)} OK {sum(R)} FALHAS {len(R) - sum(R)}")

run()
