"""Teste complementar da v176 (Avaliação de imóveis na plataforma), além do t83ava.py e do t_nbr.py do pacote:
  1. o botão real "Avaliar este imóvel (laudo)" da ficha do Leilão (v86-LEI) abre o módulo com a avaliação preenchida;
  2. layout do módulo dentro da plataforma em 320, 390, 768, 1024 e 1440 px: nenhuma tela do módulo rola para o lado,
     nada sai da largura do quadro e a página da plataforma não fica afastada.
Precisa do mock_ava.js (porta 54322) e do site em http://localhost:8766/. Uso: python3 t176_botao_layout.py pasta_imagens"""
import sys, os, json, time, re, urllib.request
from playwright.sync_api import sync_playwright
SITE = os.environ.get('AVA_SITE', 'http://localhost:8766/')
MOCK = 'http://localhost:54322'; SB = 'https://evcsniicnrlrtzpdmeza.supabase.co'
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
PLAT = ('/auth/v1/', '/rest/v1/acessos', '/rest/v1/rpc/minhas_areas', '/rest/v1/rpc/aval_', '/rest/v1/aval_', '/storage/v1/object/')
R = []
def rec(n, ok, d=''):
    R.append(bool(ok)); print(('OK    ' if ok else 'FALHA ') + n + ('' if ok else '  -> ' + str(d)[:400]), flush=True)
def srv(path, body=None):
    data = None if body is None else json.dumps(body).encode() if not isinstance(body, str) else body.encode()
    req = urllib.request.Request(MOCK + path, data=data, method='POST' if body is not None else 'GET', headers={'apikey': 'anon-test-key', 'content-type': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read() or 'null')
sql = lambda q: srv('/__mock/sql', q)
def criar(email, nome, area='avaliacao_imoveis', perfil='usuario'):
    j = srv('/auth/v1/signup', {'email': email, 'password': 'Senha#Forte82', 'data': {'nome': nome}}); uid = j['user']['id']
    sql(f"insert into public.acessos values ('{uid}','{email}','{nome}','aprovado','{perfil}')")
    if area: sql(f"insert into public.teste_areas values ('{uid}','{area}')")
    return {'access_token': j['access_token'], 'refresh_token': j['refresh_token'], 'user': j['user'], 'expires_at': int(time.time() * 1000) + 3600e3, 'email': email, 'nome': nome, 'perfil': perfil}

MEDIR = """() => {
  const W = document.documentElement.clientWidth, fora = [];
  const vis = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || el.children.length) continue;
    const r = el.getBoundingClientRect(); if (r.right <= W + 1 || getComputedStyle(el).position === 'fixed') continue;
    let a = el.parentElement, rola = false; while (a) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { rola = true; break; } a = a.parentElement; }
    if (!rola) fora.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]) + ' ' + Math.round(r.right));
  }
  return { sobra: document.documentElement.scrollWidth - W, fora: [...new Set(fora)].slice(0, 5), rota: STATE.route, tab: (STATE.params || {}).tab };
}"""

def run():
    with sync_playwright() as p:
        b = p.chromium.launch()
        def ctx(w, h, movel):
            c = b.new_context(viewport={'width': w, 'height': h}, is_mobile=movel, has_touch=movel, device_scale_factor=3 if movel else 1,
                              user_agent=('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' if movel else None))
            def supa(route):
                u = route.request.url; path = u[len(SB):]
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
            pg.evaluate("location.hash='#/investimentos'"); pg.reload(); pg.wait_for_timeout(2500)
        def modulo(pg, t=20):
            fim = time.time() + t
            while time.time() < fim:
                fr = pg.frame(url=re.compile(r'avaliacao\.html'))
                if fr:
                    try:
                        if fr.evaluate("typeof STATE!=='undefined'&&STATE.route!=='carregando'"): return fr
                    except Exception: pass
                pg.wait_for_timeout(250)
            return None

        perita = criar(f'perita.v176.{int(time.time())}@exemplo.com', 'Perita Teste v176')
        # ---------- 1. botão real do Leilão ----------
        c, pg = ctx(1366, 900, False); entrar(pg, perita)
        lote = {'id': 'L176', 'radar_id': 'radar-176', 'uf': 'DF', 'cidade': 'Brasília', 'bairro': 'Asa Norte', 'endereco': 'SQN 210 Bloco B apto 301',
                'tipo_imovel': 'apartamento', 'area-util': '88.4', 'processo': '0709999-11.2026.8.07.0001', 'orgao': '3ª Vara Cível de Brasília',
                'matricula': '12.345 — 2º RI/DF', 'valor_avaliacao': 910000, 'lance_minimo': 545000, 'link_edital': 'https://exemplo.gov.br/edital-176.pdf'}
        pg.evaluate("""l => { leiloesDados = [l]; if (typeof vitOnline === 'function') window.__vo = vitOnline;
                         let c = document.getElementById('leilao-ficha-conteudo');
                         if (!c) { c = document.createElement('div'); c.id = 'leilao-ficha-conteudo'; document.body.appendChild(c); }
                         c.innerHTML = '<p>Ficha de teste</p>'; leiBotaoAvaliarV86('L176'); }""", lote)
        tem = pg.locator('#leilao-ficha-conteudo .lei-btn-avaliar').count()
        rec('Ficha do Leilão mostra o botão "Avaliar este imóvel (laudo)"', tem == 1, tem)
        if tem:
            pg.evaluate("document.querySelector('#leilao-ficha-conteudo .lei-btn-avaliar').click()"); pg.wait_for_timeout(800)   # a ficha de teste fica fora da tela
            fr = modulo(pg); pg.wait_for_timeout(1500)
            a = fr and fr.evaluate("curAval()&&{t:curAval().titulo,mat:curAval().doc.matricula,ar:curAval().doc.areaDoc,proc:curAval().processo,o:curAval().origem,tab:STATE.params.tab}")
            rec('Botão do Leilão abre o módulo com a avaliação preenchida (endereço, matrícula, área, processo, edital e lance)',
                a and a['tab'] == 1 and str(a['mat']).startswith('12.345') and str(a['ar']) in ('88.4', '88,4') and str(a['proc']).startswith('0709999')
                and 'Brasília/DF' in a['t'] and a['o'] and a['o'].get('valorEdital') in (910000, '910000') and a['o'].get('lance') in (545000, '545000'), a)
            pg.screenshot(path=os.path.join(OUT, 'v176_leilao_para_avaliacao.png'))
        c.close()

        # ---------- 2. layout do módulo em várias larguras ----------
        for w, h in [(320, 568), (390, 844), (768, 1024), (1024, 768), (1440, 900)]:
            movel = w < 768
            c, pg = ctx(w, h, movel); entrar(pg, perita)
            pg.evaluate("location.hash='#/avaliacao-imoveis'"); pg.wait_for_timeout(1500)
            fr = modulo(pg)
            if not fr: rec(f'{w} px: módulo abre', False); c.close(); continue
            pg.wait_for_timeout(1500)
            idav = fr.evaluate("(DB.avaliacoes.find(a=>a.ownerId) || DB.avaliacoes[0] || {}).id")
            telas = [('painel', {}), ('avaliacoes', {})] + [('avaliacao', {'id': idav, 'tab': t}) for t in range(1, 11)] + [('mercado', {}), ('parametros', {}), ('auditoria', {}), ('conta', {})]
            ruins = []
            for rota, prm in telas:
                try:
                    fr.evaluate("([r,p]) => go(r, p)", [rota, prm]); fr.wait_for_timeout(450)
                    m = fr.evaluate(MEDIR)
                except Exception as e:
                    ruins.append(f'{rota}{prm.get("tab", "")}: erro {e}'); continue
                if m['sobra'] > 1 or m['fora']: ruins.append(f"{rota}{prm.get('tab', '')}: sobra {m['sobra']} {m['fora']}")
                if w in (320, 390) and rota == 'avaliacao' and prm.get('tab') in (3, 6, 10):
                    pg.screenshot(path=os.path.join(OUT, f'v176_modulo_{w}_F{prm["tab"]}.png'))
            pagina = pg.evaluate("({iw: innerWidth, sw: document.documentElement.scrollWidth})")
            rec(f'{w} px: {len(telas)} telas do módulo (painel, lista, F1 a F10, mercado, parâmetros, auditoria, perfil) sem rolar para o lado', not ruins, ruins)
            rec(f'{w} px: a página da plataforma não fica afastada nem rola para o lado', pagina['iw'] == w and pagina['sw'] <= w + 1, pagina)
            c.close()
        b.close()
    print(f"\nv176 TOTAL {len(R)} OK {sum(R)} FALHAS {len(R) - sum(R)}")

run()
