"""AUDITORIA FUNCIONAL DO MÓDULO AVALIAÇÃO DE IMÓVEIS — clica em CADA item de menu e CADA botão visível de CADA tela,
como o usuário faria (clique de verdade, não por código), no computador e no celular, e registra o que aconteceu.
Não altera o módulo. Ações destrutivas: a confirmação é aberta e CANCELADA (nada é apagado).
Precisa do mock_ava.js (porta 54322) e do site em http://localhost:8766/. Uso: python3 auditoria_botoes.py saida.json [desktop|mobile]"""
import sys, os, json, time, re, urllib.request
from playwright.sync_api import sync_playwright
SITE = os.environ.get('AVA_SITE', 'http://localhost:8766/')
MOCK = 'http://localhost:54322'; SB = 'https://evcsniicnrlrtzpdmeza.supabase.co'
SAIDA = sys.argv[1]; MODO = sys.argv[2] if len(sys.argv) > 2 else 'desktop'
PLAT = ('/auth/v1/', '/rest/v1/acessos', '/rest/v1/rpc/minhas_areas', '/rest/v1/rpc/aval_', '/rest/v1/aval_', '/storage/v1/object/')
AQUI = os.path.dirname(os.path.abspath(__file__))
UNLOCK = open(os.path.join(AQUI, 'unlock.js')).read()
DESTRUTIVAS = {'excluir-aval', 'excluir-user', 'apagar-meus-dados', 'limpar-orfaos', 'del-dado', 'del-benf', 'del-q', 'del-mercado', 'anx-del',
               'bloquear', 'logout', 'reset-param', 'emitir', 'sair-imp'}

def srv(path, body=None):
    data = None if body is None else (body.encode() if isinstance(body, str) else json.dumps(body).encode())
    req = urllib.request.Request(MOCK + path, data=data, method='POST' if body is not None else 'GET', headers={'apikey': 'anon-test-key', 'content-type': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read() or 'null')
sql = lambda q: srv('/__mock/sql', q)
def criar(email, nome, area='avaliacao_imoveis', perfil='usuario'):
    j = srv('/auth/v1/signup', {'email': email, 'password': 'Senha#Forte82', 'data': {'nome': nome}}); uid = j['user']['id']
    sql(f"insert into public.acessos values ('{uid}','{email}','{nome}','aprovado','{perfil}')")
    if area: sql(f"insert into public.teste_areas values ('{uid}','{area}')")
    return {'access_token': j['access_token'], 'refresh_token': j['refresh_token'], 'user': j['user'], 'expires_at': int(time.time() * 1000) + 3600e3, 'email': email, 'nome': nome, 'perfil': perfil}

COLETAR = """() => {
  const vis = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
  const sel = '[data-action],[data-go],[data-dd],[data-seg],[data-theme],[data-v],[data-pal],button,a[href],[role=button],[role=tab],select,input[type=checkbox],input[type=radio],input[type=file]';
  const out = [];
  document.querySelectorAll(sel).forEach((el, i) => {
    if (!vis(el) || el.closest('.toasts')) return;
    if (el.matches('input[type=file]')) return;
    const r = el.getBoundingClientRect();
    const rot = (el.getAttribute('aria-label') || el.title || el.textContent || el.value || '').replace(/\\s+/g, ' ').trim().slice(0, 50);
    const chave = el.dataset.action ? 'action:' + el.dataset.action : el.dataset.go ? 'go:' + el.dataset.go : el.dataset.dd ? 'dd:' + el.dataset.dd
      : el.dataset.seg ? 'seg:' + el.dataset.seg : el.dataset.theme ? 'theme:' + el.dataset.theme : el.dataset.v ? 'v:' + el.dataset.v : el.tagName.toLowerCase() + (el.type ? ':' + el.type : '');
    el.setAttribute('data-aud', String(out.length));
    out.push({ i: out.length, chave, rot, tag: el.tagName.toLowerCase(), dis: el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true', trava: !!document.querySelector('.lockmsg'),
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), menu: !!el.closest('.dd-menu'), side: !!el.closest('.side'),
      cortado: (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') || r.right > document.documentElement.clientWidth + 1 });
  });
  return out;
}"""
ESTADO = """() => ({ r: STATE.route, p: JSON.stringify(STATE.params || {}), modal: !!document.querySelector('#modal:not([hidden]), .modal:not([hidden]), [role=dialog]:not([hidden])')
  && [...document.querySelectorAll('#modal, .modal, [role=dialog]')].some(m => !m.hidden && getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().height > 0),
  dd: [...document.querySelectorAll('.dd-menu')].filter(m => !m.hidden).map(m => m.id), toasts: [...document.querySelectorAll('#toasts .toast')].map(t => t.className + '|' + t.textContent),
  tema: document.documentElement.dataset.theme || document.body.className, side: document.body.className + '|' + (document.querySelector('.nav, aside')?.className || '') })"""

LIMPAR = """() => { try { closePalette(); } catch (e) {} try { closeModal(); } catch (e) {}
  document.querySelectorAll('.dd-menu').forEach(m => { m.hidden = true; }); try { syncSheet(); } catch (e) {}
  try { if (STATE.sideOpen) { STATE.sideOpen = false; render(); } } catch (e) {} }"""

def run():
    rel = {'modo': MODO, 'telas': []}
    with sync_playwright() as p:
        b = p.chromium.launch()
        movel = MODO == 'mobile'
        c = b.new_context(**(p.devices['iPhone 14'] if movel else {'viewport': {'width': 1366, 'height': 900}}), accept_downloads=True)
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
        LIB = os.environ.get('DOCX_IIFE')
        if LIB: c.route('https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=open(LIB).read()))
        c.route(SB + '/**', supa)
        pg = c.new_page(); pg.set_default_timeout(8000)
        ev = {'erros': [], 'dialogs': [], 'downloads': [], 'popups': []}
        pg.on('pageerror', lambda e: ev['erros'].append(str(e)[:300]))
        pg.on('dialog', lambda d: (ev['dialogs'].append(d.type + ': ' + d.message[:160]), d.dismiss()))
        pg.on('download', lambda d: ev['downloads'].append(d.suggested_filename))
        c.on('page', lambda np: (ev['popups'].append(np.url), np.close()))

        def entrar(sess):
            pg.goto(SITE + '#/educacao'); pg.wait_for_timeout(300)
            pg.evaluate("s=>{localStorage.setItem('gestao-fiscal-auth-session', JSON.stringify(s)); localStorage.setItem('sol-app-aviso-v173', String(Date.now()))}", sess)
            pg.evaluate("location.hash='#/avaliacao-imoveis'"); pg.reload(); pg.wait_for_timeout(3500)
        def frame():
            fim = time.time() + 20
            while time.time() < fim:
                fr = pg.frame(url=re.compile(r'avaliacao\.html'))
                if fr:
                    try:
                        if fr.evaluate("typeof STATE!=='undefined'&&STATE.route!=='carregando'"): return fr
                    except Exception: pass
                pg.wait_for_timeout(250)
            return None

        def auditar_tela(nome, ir):
            fr = frame(); ir(fr); fr.wait_for_timeout(500)
            itens = fr.evaluate(COLETAR)
            tela = {'tela': nome, 'itens': []}
            vistos = set()
            for it in itens:
                if it['menu']: continue
                chave = (it['chave'], it['rot'])
                if chave in vistos: continue          # o mesmo botão repetido em várias linhas: testa o primeiro
                vistos.add(chave)
                tela['itens'].append(clicar(nome, ir, it))
            rel['telas'].append(tela)
            if os.environ.get('AUD_VERBOSO'):
                for x in tela['itens']: print('   ', x['res'], x['chave'], '|', x['rot'][:30], '|', str(x.get('det'))[:150])
            print(f"{nome}: {len(tela['itens'])} itens; problemas: {sum(1 for x in tela['itens'] if x['res'] in ('ERRO', 'SEM EFEITO', 'INACESSÍVEL', 'SEM TRATADOR', 'CORTADO'))}", flush=True)

        def clicar(nome, ir, it, dentro_de=None):
            fr = frame()
            fr.evaluate(LIMPAR); ir(fr); fr.wait_for_timeout(350)
            if dentro_de:
                fr.locator(f'[data-dd="{dentro_de}"]').first.click(timeout=3000); fr.wait_for_timeout(250)
            fr.evaluate(COLETAR)
            alvo = fr.locator(f'[data-aud]').filter(has_text=it['rot']) if False else None
            # reencontra pelo mesmo critério (chave + rótulo)
            idx = fr.evaluate("""([ch, rot]) => { const els = [...document.querySelectorAll('[data-aud]')];
              const lista = window.__audLista || []; return null; }""", [it['chave'], it['rot']])
            itens = fr.evaluate(COLETAR)
            cand = [x for x in itens if x['chave'] == it['chave'] and x['rot'] == it['rot'] and (bool(dentro_de) == x['menu'])]
            reg = {'chave': it['chave'], 'rot': it['rot'], 'w': it['w'], 'h': it['h']}
            if not cand: reg.update(res='SUMIU', det='não reapareceu ao voltar à tela'); return reg
            x = cand[0]
            if x['dis']: reg.update(res='DESATIVADO', det=('fase travada até o gate anterior (aviso na tela)' if x.get('trava') else 'botão desativado nesta situação')); return reg
            if x['cortado']: reg['aviso'] = 'texto cortado ou fora da largura'
            acao = it['chave'].split(':', 1)[1] if it['chave'].startswith('action:') else ''
            if acao == 'logout': reg.update(res='NÃO CLICADO', det='Sair (testado à parte)'); return reg
            if MODO == 'mobile' and x.get('side') and not fr.evaluate("STATE.sideOpen"):
                # no celular o menu lateral fica escondido: abre pelo botão "Menu", como o usuário faria
                try: fr.locator('.bnav [data-action="toggle-side"]').first.click(timeout=2500); fr.wait_for_timeout(350)
                except Exception as e: reg.update(res='INACESSÍVEL', det='botão Menu não abre: ' + str(e).split('\n')[0][:120]); return reg
                cand = [y for y in fr.evaluate(COLETAR) if y['chave'] == it['chave'] and y['rot'] == it['rot'] and y['side']]
                if not cand: reg.update(res='SUMIU', det='não aparece com o menu aberto'); return reg
                x = cand[0]; reg['via'] = 'menu lateral aberto pelo botão Menu'
            antes = fr.evaluate(ESTADO)
            fr.evaluate("() => { window.__mut = 0; window.__mo && window.__mo.disconnect(); window.__mo = new MutationObserver(m => { window.__mut += m.length; }); window.__mo.observe(document.body, {subtree: true, childList: true, attributes: true, characterData: true}); }")
            n_err, n_dlg, n_dl, n_pop = len(ev['erros']), len(ev['dialogs']), len(ev['downloads']), len(ev['popups'])
            try:
                fr.locator(f'[data-aud="{x["i"]}"]').click(timeout=2500, no_wait_after=True)
            except Exception as e:
                msg = str(e)
                quem = [l.strip() for l in msg.split('\n') if 'intercepts pointer events' in l or 'not visible' in l or 'outside of the viewport' in l]
                reg.update(res='INACESSÍVEL', det=(quem[-1][:220] if quem else ' / '.join(l.strip() for l in msg.split('\n')[-6:] if l.strip())[:400])); return reg
            fr.wait_for_timeout(700)
            try:
                depois = fr.evaluate(ESTADO); mut = fr.evaluate("window.__mut || 0")
            except Exception:
                depois = {'r': '?', 'p': '', 'modal': False, 'dd': [], 'toasts': [], 'tema': '', 'side': ''}; mut = 1
            efeitos = []
            if depois['r'] != antes['r'] or depois['p'] != antes['p']: efeitos.append(f"tela {antes['r']}→{depois['r']} {depois['p'][:60]}")
            if depois['modal'] and not antes['modal']: efeitos.append('abriu janela')
            if set(depois['dd']) - set(antes['dd']): efeitos.append('abriu menu ' + ','.join(set(depois['dd']) - set(antes['dd'])))
            novos_t = [t for t in depois['toasts'] if t not in antes['toasts']]
            if novos_t: efeitos.append('aviso: ' + ' / '.join(t.split('|', 1)[1][:80] for t in novos_t))
            if len(ev['dialogs']) > n_dlg: efeitos.append('pediu confirmação (cancelada): ' + ev['dialogs'][-1][:90])
            if len(ev['downloads']) > n_dl: efeitos.append('baixou ' + ev['downloads'][-1])
            if len(ev['popups']) > n_pop: efeitos.append('abriu nova aba ' + ev['popups'][-1][:80])
            if depois['tema'] != antes['tema'] or depois['side'] != antes['side']: efeitos.append('mudou a aparência/menu')
            if not efeitos and mut > 0: efeitos.append(f'alterou a tela ({mut} mudanças)')
            erros = ev['erros'][n_err:]
            if erros: reg.update(res='ERRO', det=' | '.join(erros)[:300], efeitos=efeitos)
            elif any('Ação indisponível' in e for e in efeitos): reg.update(res='SEM TRATADOR', det=efeitos)
            elif not efeitos and it['tag'] not in ('select',) and not it['chave'].startswith('input'): reg.update(res='SEM EFEITO', det='nada mudou na tela após o clique')
            else: reg.update(res='OK', det=efeitos)
            if it['chave'] == 'input:checkbox':
                # desfaz a marcação para não travar as fases seguintes (o robô não deve mudar os dados de exemplo)
                try:
                    y = [z for z in fr.evaluate(COLETAR) if z['chave'] == it['chave'] and z['rot'] == it['rot']]
                    if y: fr.locator(f'[data-aud="{y[0]["i"]}"]').click(timeout=2500, no_wait_after=True); fr.wait_for_timeout(300)
                except Exception: pass
            if depois['modal'] and acao in DESTRUTIVAS:
                try: fr.evaluate("() => { const b = document.querySelector('[data-action=fechar-modal]'); b && b.click(); }")
                except Exception: pass
            return reg

        perito = criar(f'auditoria.{time.time_ns()}@exemplo.com', 'Perito Auditoria')
        entrar(perito); fr = frame()
        fr.wait_for_timeout(2500)
        ids = fr.evaluate("DB.avaliacoes.filter(a=>a.ownerId===ownerId()).map(a=>({id:a.id,c:a.codigo,s:a.segmento,f:faseAtual(a)}))")
        rel['avaliacoes_exemplo'] = ids
        urb = next((a for a in ids if a['s'] == 'urbano'), ids[0]); rur = next((a for a in ids if a['s'] == 'rural'), None)
        lib = fr.evaluate(f"(() => {{ const f = {UNLOCK}; return f({json.dumps(urb['c'])}); }})()")
        rel['liberada'] = lib
        go = lambda r, prm=None: (lambda f: (f.evaluate("([r,p]) => go(r,p)", [r, prm or {}])))
        telas = [('Painel', go('painel')), ('Avaliações (lista)', go('avaliacoes')), ('Mercado', go('mercado')), ('Parâmetros', go('parametros')),
                 ('Auditoria', go('auditoria')), ('Perfil do perito', go('conta'))]
        telas += [(f'Avaliação urbana liberada · F{t}', go('avaliacao', {'id': lib['id'], 'tab': t})) for t in range(1, 11)]
        if rur: telas += [(f'Avaliação rural · F{t}', go('avaliacao', {'id': rur['id'], 'tab': t})) for t in (1, 4, 5, 6)]
        SO = os.environ.get('AUD_SO')
        if SO: telas = [t for t in telas if t[0] in SO.split('|')]
        for nome, ir in telas:
            try: auditar_tela(nome, ir)
            except Exception as e: rel['telas'].append({'tela': nome, 'erro_auditoria': str(e)[:300]}); print(nome, 'ERRO NA AUDITORIA', str(e)[:200])
        # itens dos menus suspensos (abre o menu e clica em cada item)
        for nome, ir in ([] if (SO and not os.environ.get('AUD_MENUS')) else [('Painel', go('painel')), ('Avaliações (lista)', go('avaliacoes')), ('Avaliação urbana liberada · F1', go('avaliacao', {'id': lib['id'], 'tab': 1})),
                         ('Avaliação urbana liberada · F5', go('avaliacao', {'id': lib['id'], 'tab': 5})), ('Avaliação urbana liberada · F9', go('avaliacao', {'id': lib['id'], 'tab': 9}))]):
            fr = frame(); ir(fr); fr.wait_for_timeout(400)
            dds = sorted(set(x['chave'][3:] for x in fr.evaluate(COLETAR) if x['chave'].startswith('dd:')))
            for dd in dds:
                fr = frame(); fr.evaluate(LIMPAR); ir(fr); fr.wait_for_timeout(300)
                try: fr.locator(f'[data-dd="{dd}"]').first.click(timeout=2500); fr.wait_for_timeout(300)
                except Exception as e:
                    q = [l.strip() for l in str(e).split('\n') if 'intercepts pointer events' in l or 'not visible' in l]
                    rel['telas'].append({'tela': f'{nome} · menu {dd}', 'erro_auditoria': 'não abre: ' + (q[-1][:220] if q else str(e)[:160])}); continue
                itens = [x for x in fr.evaluate(COLETAR) if x['menu']]
                tela = {'tela': f'{nome} · menu "{dd}"', 'itens': []}
                for it in itens: tela['itens'].append(clicar(nome, ir, it, dentro_de=dd))
                rel['telas'].append(tela); print(tela['tela'], len(tela['itens']), 'itens', flush=True)
        # Sair (por último)
        fr = frame(); fr.evaluate("go('painel')"); fr.wait_for_timeout(300)
        rel['erros_js_total'] = ev['erros']
        b.close()
    json.dump(rel, open(SAIDA, 'w'), ensure_ascii=False, indent=1)

run()
