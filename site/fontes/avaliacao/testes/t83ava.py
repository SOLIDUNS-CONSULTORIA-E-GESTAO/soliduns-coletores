"""Teste de integração do módulo Avaliação de imóveis na plataforma SOLIDUNS (v83-AVA).
Plataforma real (index.html patchado) + avaliacao.html + Supabase simulado (PGlite com o SQL 160 e as funções da plataforma).
Uso: python3 t83ava.py desktop|mobile"""
import sys, os, json, time, urllib.request, urllib.error, re
from playwright.sync_api import sync_playwright
SITE = os.environ.get('AVA_SITE', 'http://localhost:8766/')
MOCK = 'http://localhost:54322'
SB = 'https://evcsniicnrlrtzpdmeza.supabase.co'
AQUI = os.path.dirname(os.path.abspath(__file__))
FX = os.environ.get('AVA_FX') or next(p for p in [os.path.join(AQUI, 'fx') + '/', '/tmp/claude-0/-home-claude/2f1ef20d-48ab-546f-9bf2-d5d06d011352/scratchpad/qa/fx/'] if os.path.isdir(p))
MODE = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
R = []; ERRS = []
def rec(i, ok, d=''):
    R.append((i, bool(ok), str(d)[:300])); print(('OK    ' if ok else 'FALHA ') + i + ('' if ok else '  -> ' + str(d)[:300]), flush=True)
def srv(path, body=None, raw=False):
    data = None if body is None else (body.encode() if isinstance(body, str) else json.dumps(body).encode())
    req = urllib.request.Request(MOCK + path, data=data, method='POST' if body is not None else 'GET', headers={'apikey': 'anon-test-key', 'content-type': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read() or 'null')
sql = lambda q: srv('/__mock/sql', q)
def criar(email, nome, status='aprovado', area='avaliacao_imoveis', perfil='usuario'):
    j = srv('/auth/v1/signup', {'email': email, 'password': 'Senha#Forte82', 'data': {'nome': nome}})
    uid = j['user']['id']
    sql(f"insert into public.acessos values ('{uid}','{email}','{nome}','{status}','{perfil}')")
    if area: sql(f"insert into public.teste_areas values ('{uid}','{area}')")
    return {'id': uid, 'email': email, 'nome': nome, 'sess': {'access_token': j['access_token'], 'refresh_token': j['refresh_token'], 'user': j['user'],
            'expires_at': int(time.time() * 1000) + 3600 * 1000, 'email': email, 'nome': nome, 'perfil': perfil}}
def renovar(u):
    j = srv('/auth/v1/token?grant_type=password', {'email': u['email'], 'password': 'Senha#Forte82'})
    u['sess'].update({'access_token': j['access_token'], 'refresh_token': j['refresh_token'], 'expires_at': int(time.time() * 1000) + 3600 * 1000})
    return u
LIB = open(os.environ.get('DOCX_IIFE') or next(p for p in [os.path.join(AQUI, 'node_modules/docx/dist/index.iife.js'), '/opt/npm-tools/node_modules/docx/dist/index.iife.js'] if os.path.exists(p))).read()
PLAT = ('/auth/v1/', '/rest/v1/acessos', '/rest/v1/rpc/minhas_areas', '/rest/v1/rpc/aval_', '/rest/v1/aval_', '/storage/v1/object/')

def run():
    with sync_playwright() as p:
        b = p.chromium.launch()
        def ctx_novo():
            c = b.new_context(**p.devices['Pixel 7'], accept_downloads=True) if MODE == 'mobile' else b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
            def supa(route):
                u = route.request.url; path = u[len(SB):]
                if path.startswith(PLAT):
                    h = dict(route.request.headers); h['apikey'] = 'anon-test-key'
                    try:
                        resp = route.fetch(url=MOCK + path, headers=h)
                        route.fulfill(response=resp)
                    except Exception as e:
                        route.abort()
                elif path.startswith('/rest/v1/usuarios_cpf'):
                    route.fulfill(status=200, content_type='application/json', body='[{"cpf":"52998224725"}]', headers={'Access-Control-Allow-Origin': '*'})
                else:
                    route.fulfill(status=200, content_type='application/json', body='[]', headers={'Access-Control-Allow-Origin': '*'})
            c.route(re.compile(r'^https://(?!evcsniicnrlrtzpdmeza).*'), lambda r: r.abort())
            c.route(SB + '/**', supa)
            c.route('https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=LIB))
            pg = c.new_page(); pg.set_default_timeout(10000)
            pg.on('pageerror', lambda e: ERRS.append('pageerror: ' + str(e)))
            return c, pg
        def entrar(c, pg, u):
            pg.goto(SITE + '#/educacao'); pg.wait_for_timeout(300)
            pg.evaluate("s=>{localStorage.setItem('gestao-fiscal-auth-session', JSON.stringify(s))}", u['sess'])
            pg.evaluate("location.hash='#/investimentos'"); pg.reload(); pg.wait_for_timeout(3000)
        def modulo(pg):
            f = pg.frame_locator('#aval-frame')
            fr = pg.frame(url=re.compile(r'avaliacao\.html'))
            return fr
        def esperar_modulo(pg, t=15):
            end = time.time() + t
            while time.time() < end:
                fr = modulo(pg)
                if fr:
                    try:
                        if fr.evaluate("typeof STATE!=='undefined'&&!['carregando'].includes(STATE.route)"): return fr
                    except Exception: pass
                pg.wait_for_timeout(250)
            return modulo(pg)
        def wait_sync(fr, t=20):
            end = time.time() + t
            while time.time() < end:
                if fr.evaluate("naNuvem()&&!CLOUD.pendente&&!CLOUD.ocupado&&CLOUD.fila.length===0&&CLOUD.estado==='ok'"): return True
                fr.wait_for_timeout(250)
            return False
        click = (lambda pg, sel: pg.tap(sel)) if MODE == 'mobile' else (lambda pg, sel: pg.click(sel))

        ana = criar('ana@perita.com', 'Ana Souza Perita')
        bruno = criar('bruno@perito.com', 'Bruno Lima Perito', area='*')
        semarea = criar('carla@x.com', 'Carla Sem Plano', area='leiloes')
        adm = criar('dr.thiago.viegas@gmail.com', 'Thiago Viegas', area=None, perfil='admin')

        # ---------- 0. outras áreas da plataforma continuam iguais ----------
        c0, pg0 = ctx_novo(); u0 = criar('outro@x.com', 'Outro Usuario Teste', area='*'); entrar(c0, pg0, u0)
        n0 = len(ERRS)
        for r in ['leilao', 'leilao-veiculos', 'mercado-imobiliario', 'investimentos/mercado-financeiro', 'educacao', 'calculadoras', 'investimentos']:
            pg0.evaluate("r=>location.hash='#/'+r", r); pg0.wait_for_timeout(900)
        rec('Áreas existentes abrem sem erro novo (logado)', len(ERRS) == n0, ERRS[n0:][:3])
        rec('Módulo não é carregado nas outras áreas', pg0.evaluate("!document.getElementById('aval-frame').getAttribute('src')"))
        pg0.evaluate("document.getElementById('btn-sair-dash').click()"); pg0.wait_for_timeout(1500)
        rec('Botão Sair da plataforma funciona sem o módulo aberto', pg0.evaluate('sessaoAtual===null'))
        c0.close()

        # ---------- 1. hub e abertura do módulo ----------
        c1, pg = ctx_novo(); entrar(c1, pg, ana)
        rec('Plataforma entra com a sessão da perita', pg.evaluate("!!sessaoAtual&&sessaoAtual.email") == 'ana@perita.com', pg.evaluate("location.hash"))
        rec('Card "Avaliação de imóveis" no hub de Investimentos', pg.locator('#painel-investimentos-escolha .escolha-card[data-painel="avaliacao-imoveis"]').count() == 1)
        rec('Card sem selo de plano para quem tem a área', pg.evaluate("!document.querySelector('.escolha-card[data-painel=\"avaliacao-imoveis\"]').classList.contains('area-fora-plano')"))
        rec('Quadro não carrega antes de abrir o painel', pg.evaluate("!document.getElementById('aval-frame').getAttribute('src')"))
        pg.evaluate("document.querySelector('#painel-investimentos-escolha').classList.contains('ativo')||mostrarPainelDash('investimentos-escolha')"); pg.wait_for_timeout(300)
        click(pg, '.escolha-card[data-painel="avaliacao-imoveis"]'); pg.wait_for_timeout(500)
        rec('Endereço vira #/avaliacao-imoveis', pg.evaluate('location.hash') == '#/avaliacao-imoveis', pg.evaluate('location.hash'))
        rec('Título da aba', 'Avaliação de imóveis' in pg.title(), pg.title())
        fr = esperar_modulo(pg)
        rec('Módulo abre no painel, sem tela de login própria', fr is not None and fr.evaluate('STATE.route') == 'painel', fr and fr.evaluate('STATE.route'))
        rec('Módulo usa a sessão da plataforma', fr.evaluate('SESSION.userId') == ana['id'] and fr.evaluate('EMB!==null'))
        rec('Sem acesso livre de administrador no módulo', fr.locator('[data-action=admin-entrar]').count() == 0)
        n = fr.evaluate('DB.avaliacoes.length')
        rec('Exemplos criados no primeiro acesso', n >= 5, n)
        rec('Gravação no banco da plataforma (aval_avaliacoes)', wait_sync(fr) and sql(f"select count(*)::int n from public.aval_avaliacoes where owner='{ana['id']}'")[0]['n'] == n)
        pf = sql(f"select nome,email from public.aval_perfis where id='{ana['id']}'")
        rec('Perfil do perito criado com nome e e-mail da plataforma', pf and pf[0]['nome'] == 'Ana Souza Perita' and pf[0]['email'] == 'ana@perita.com', pf)
        rec('Visual da plataforma (fundo preto, dourado)', fr.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(0, 0, 0)' and fr.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") == '#eec617')
        ov = fr.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
        rec('Sem rolagem lateral dentro do quadro', ov <= 1, ov)
        hq = pg.evaluate("document.getElementById('aval-frame').getBoundingClientRect().height")
        rec('Quadro ocupa a tela', hq >= (450 if MODE == 'mobile' else 560), hq)

        # ---------- 2. trabalho dentro do módulo ----------
        fr.evaluate("ACTIONS.nova({dataset:{seg:'urbano'}})"); fr.wait_for_timeout(400)
        nova = fr.evaluate('STATE.params.id')
        rec('Nova avaliação criada no módulo', fr.evaluate('STATE.route') == 'avaliacao' and bool(nova))
        aid = fr.evaluate("DB.avaliacoes.find(a=>a.codigo==='AV-2026-014'&&a.ownerId===SESSION.userId).id")
        fr.evaluate(f"go('avaliacao',{{id:'{aid}',tab:3}})"); fr.wait_for_timeout(400)
        fr.set_input_files('#up-foto', [FX + 'foto1.jpg', FX + 'foto2.jpg']); fr.wait_for_timeout(2500)
        rec('Fotos enviadas para a pasta aval-anexos do perito', wait_sync(fr, 25) and len([x for x in srv('/__mock/blobs') if x.startswith(ana['id'] + '/' + aid + '/')]) == 2, srv('/__mock/blobs'))
        fr.evaluate("go('conta')"); fr.wait_for_timeout(300)
        rec('Perfil do perito sem formulário de senha (é da plataforma)', fr.locator('#f-senha').count() == 0 and fr.locator('#f-perfil').count() == 1)
        fr.fill('#pf-reg', 'CREA-DF 12345/D'); fr.locator('#f-perfil button[type=submit]').click(); fr.wait_for_timeout(800)
        rec('Registro profissional salvo no banco', sql(f"select registro from public.aval_perfis where id='{ana['id']}'")[0]['registro'] == 'CREA-DF 12345/D')
        fr.evaluate("ACTIONS['emb-conta']()"); pg.wait_for_timeout(500)
        rec('Botão "Abrir Minha conta" abre a conta da plataforma', pg.evaluate("!!document.getElementById('conta-overlay')&&getComputedStyle(document.getElementById('conta-overlay')).display!=='none'"))
        pg.evaluate("fecharConta()")
        pg.wait_for_timeout(300)
        vis = pg.evaluate("[document.getElementById('painel-avaliacao-imoveis').classList.contains('ativo'), getComputedStyle(document.getElementById('conta-overlay')).display, document.getElementById('tela-dashboard').style.display]")
        rec('Depois de fechar Minha conta, o módulo continua na tela', vis[0] and vis[1] == 'none' and vis[2] != 'none', vis)
        # laudo em Word dentro do quadro
        unl = open(next(p for p in [os.path.join(AQUI, 'unlock.js'), '/tmp/claude-0/-home-claude/2f1ef20d-48ab-546f-9bf2-d5d06d011352/scratchpad/qa/unlock.js'] if os.path.exists(p))).read()
        fr.evaluate(unl, 'AV-2026-014'); fr.evaluate(f"go('avaliacao',{{id:'{aid}',tab:10}})"); fr.wait_for_timeout(400)
        try:
            with pg.expect_download(timeout=40000) as d:
                fr.locator('button[data-action=baixar-laudo]:visible').first.click()
            d.value.save_as(os.path.join(AQUI, 'laudo_modulo.docx'))
            rec('Laudo em Word baixado de dentro da plataforma', os.path.getsize(os.path.join(AQUI, 'laudo_modulo.docx')) > 50000)
        except Exception as e:
            rec('Laudo em Word baixado de dentro da plataforma', False, str(fr.evaluate("[STATE.route,STATE.params.tab,faseAtual(curAval()),[...document.querySelectorAll('[data-action=baixar-laudo]')].map(b=>b.offsetParent!==null&&!b.disabled)]"))+' | '+str(e)[:60])
        aud = fr.evaluate("routeAudit().filter(x=>!x.ok).map(x=>x.label+': '+x.problemas.join('; '))")
        rec('Auditoria de rotas do módulo aprovada', len(aud) == 0, aud)

        # ---------- 3. endereços ----------
        pg.goto(SITE + '#/laudos'); pg.wait_for_timeout(1500)
        rec('Apelido #/laudos leva ao módulo', pg.evaluate('location.hash') == '#/avaliacao-imoveis', pg.evaluate('location.hash'))
        pg.goto(SITE + 'avaliacao.html'); pg.wait_for_timeout(1500)
        rec('avaliacao.html aberto sozinho volta para a plataforma', pg.url.endswith('/#/avaliacao-imoveis'), pg.url)

        # ---------- 4. sair pela plataforma ----------
        pg.wait_for_timeout(2500); fr = esperar_modulo(pg)
        rec('Módulo reabre após recarregar a página', fr is not None and fr.evaluate('STATE.route') in ('painel', 'avaliacao'), fr and fr.evaluate('STATE.route'))
        wait_sync(fr)
        sair = '#btn-sair-dash' if MODE == 'desktop' else '#btn-sair-dash'
        if MODE == 'mobile': pg.evaluate("document.getElementById('btn-sair-dash').click()")
        else: pg.click(sair)
        pg.wait_for_timeout(2500)
        rec('Sair da plataforma encerra a sessão', pg.evaluate("sessaoAtual===null"))
        rec('Sair limpa as avaliações guardadas no aparelho', pg.evaluate("!Object.keys(localStorage).some(k=>k.startsWith('soliduns-aval-modulo-v1')&&localStorage.getItem(k).includes('AV-2026'))"),
            pg.evaluate("Object.keys(localStorage)"))
        nfiles = pg.evaluate("(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('soliduns-avalia-arquivos',1);q.onupgradeneeded=()=>q.result.createObjectStore('files');q.onsuccess=()=>r(q.result)});return await new Promise(r=>{const q=db.transaction('files').objectStore('files').count();q.onsuccess=()=>r(q.result)})})()")
        rec('Sair apaga as fotos guardadas no aparelho', nfiles == 0, nfiles)
        rec('Quadro do módulo fechado', pg.evaluate("!document.getElementById('aval-frame').getAttribute('src')"))

        # ---------- 5. outro perito no mesmo computador ----------
        entrar(c1, pg, bruno); pg.evaluate("location.hash='#/avaliacao-imoveis'"); pg.wait_for_timeout(500)
        fr = esperar_modulo(pg)
        rec('Outro perito abre o módulo no mesmo navegador', fr is not None and fr.evaluate('SESSION.userId') == bruno['id'])
        rec('Não vê nada da perita anterior', fr.evaluate(f"DB.avaliacoes.every(a=>a.ownerId==='{bruno['id']}')"))
        r = fr.evaluate(f"sb(rest(NV_T.av,'select=id&owner=eq.{ana['id']}')).then(x=>x.length)")
        rec('Banco nega as avaliações da perita para outro perito', r == 0, r)
        r = fr.evaluate(f"sb('/storage/v1/object/authenticated/aval-anexos/{ana['id']}/{aid}/x',{{blob:true}}).then(()=>'leu',e=>'negado')")
        rec('Arquivos da perita negados para outro perito', r == 'negado', r)
        # perde a área no meio do uso
        sql(f"delete from public.teste_areas where id='{bruno['id']}'")
        fr.evaluate("CLOUD.puxado=0;document.activeElement&&document.activeElement.blur();nvPuxar()"); fr.wait_for_timeout(1500)
        rec('Plano sem a área: o módulo fecha e explica', fr.evaluate('STATE.route') == 'sem-acesso', fr.evaluate('STATE.route'))
        sql(f"insert into public.teste_areas values ('{bruno['id']}','*')")
        c1.close()

        # ---------- 6. usuário sem a área ----------
        c2, pg2 = ctx_novo(); entrar(c2, pg2, semarea)
        rec('Card com selo "Planos pagos" para quem não tem a área', pg2.evaluate("document.querySelector('.escolha-card[data-painel=\"avaliacao-imoveis\"]').classList.contains('area-fora-plano')"))
        pg2.evaluate("location.hash='#/avaliacao-imoveis'"); pg2.wait_for_timeout(1500)
        rec('Sem a área: tela de plano da plataforma, módulo não carrega', pg2.evaluate("!document.getElementById('aval-frame').getAttribute('src')") and pg2.evaluate("document.getElementById('painel-plano-bloqueado')?.classList.contains('ativo')"))
        r = pg2.evaluate("fetch(SUPABASE_URL+'/rest/v1/rpc/aval_pode',{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+sessaoAtual.access_token,'Content-Type':'application/json'},body:'{}'}).then(r=>r.json())")
        rec('Servidor também recusa quem não tem a área', r is False, r)
        c2.close()

        # ---------- 7. administrador do sistema ----------
        c3, pg3 = ctx_novo(); entrar(c3, pg3, adm); pg3.evaluate("location.hash='#/avaliacao-imoveis'"); pg3.wait_for_timeout(500)
        fr = esperar_modulo(pg3)
        rec('Administrador do sistema abre o módulo (sem a área no plano)', fr is not None and fr.evaluate('SESSION.role') == 'admin', fr and fr.evaluate('SESSION.role'))
        fr.evaluate("go('admin-usuarios')"); fr.wait_for_timeout(400)
        rec('Administrador vê os peritos', fr.evaluate('DB.users.length') >= 3 and 'Ana Souza Perita' in fr.inner_text('main'))
        rec('Sem plano/bloqueio no módulo (ficam na Equipe da plataforma)', fr.locator('[data-uplan]').count() == 0 and 'Equipe' in fr.inner_text('main'))
        fr.evaluate(f"ACTIONS.impersonar({{dataset:{{uid:'{ana['id']}'}}}})"); fr.wait_for_timeout(400)
        rec('Administrador vê a área da perita (suporte)', fr.evaluate('minhas().length') >= 5 and fr.evaluate(f"minhas().every(a=>a.ownerId==='{ana['id']}')"))
        fr.evaluate("ACTIONS['sair-imp']()"); fr.wait_for_timeout(300)
        try:
            with pg3.expect_download(timeout=60000) as d:
                fr.evaluate("ACTIONS['copia-seguranca']()")
            d.value.save_as(os.path.join(AQUI, 'copia_admin.zip'))
            import zipfile
            z = zipfile.ZipFile(os.path.join(AQUI, 'copia_admin.zip')); nomes = z.namelist(); j = json.loads(z.read('dados.json'))
            fotos = [n for n in nomes if n.startswith('anexos/')]
            ok_zip = z.testzip() is None and len(j['avaliacoes']) >= 12 and len(fotos) >= 2 and 'LEIA-ME.txt' in nomes
            rec('Cópia de segurança (.zip) do administrador com dados e fotos da nuvem', ok_zip, (len(j['avaliacoes']), len(fotos), nomes[:4]))
        except Exception as e:
            rec('Cópia de segurança (.zip) do administrador com dados e fotos da nuvem', False, e)
        c3.close()

        # ---------- 8. pedido de outra área: Leilão > "Avaliar este imóvel" (contrato v1) ----------
        c4, pg4 = ctx_novo(); entrar(c4, pg4, renovar(ana))
        LOTE = {'origem': 'leilao', 'ref': 'caixa-123', 'url': 'https://exemplo.gov.br/edital.pdf', 'uf': 'DF', 'cidade': 'Brasília', 'bairro': 'Asa Sul',
                'endereco': 'SQS 308 Bloco C', 'tipo': 'apartamento', 'area': '96.5', 'matricula': '45.678 — 1º RI/DF', 'processo': '0701234-55.2026.8.07.0001',
                'valorEdital': 850000, 'lance': 520000, 'campoEstranho': '<script>x</script>'}
        r = pg4.evaluate("d=>avalAbrirCom(d)", LOTE); pg4.wait_for_timeout(500)
        fr = esperar_modulo(pg4); pg4.wait_for_timeout(1500)
        a = fr.evaluate("curAval()&&{t:curAval().titulo,tip:curAval().tipologia,seg:curAval().segmento,mat:curAval().doc.matricula,ar:curAval().doc.areaDoc,proc:curAval().processo,o:curAval().origem,tab:STATE.params.tab,est:JSON.stringify(curAval()).includes('campoEstranho')}")
        rec('Leilão abre o módulo com avaliação já preenchida (módulo ainda fechado)', r is True and a and a['tab'] == 1 and a['tip'] == 'Apartamento' and a['seg'] == 'urbano' and a['mat'].startswith('45.678') and a['ar'] == '96.5' and a['proc'].startswith('0701234') and 'Brasília/DF' in a['t'], a)
        rec('Origem do leilão registrada (edital e lance) e campo desconhecido ignorado', a and a['o']['valorEdital'] == 850000 and a['o']['lance'] == 520000 and a['o']['ref'] == 'caixa-123' and not a['est'], a and a['o'])
        rec('Aviso de origem na fase F1', 'Criada a partir de um leilão' in fr.inner_text('main'))
        rec('Avaliação do leilão gravada no banco', wait_sync(fr) and sql("select count(*)::int n from public.aval_avaliacoes where dados->'origem'->>'ref'='caixa-123'")[0]['n'] == 1)
        n1 = fr.evaluate('DB.avaliacoes.length')
        pg4.evaluate("d=>avalAbrirCom(d)", {**LOTE, 'ref': 'tj-77', 'tipo': 'chacara', 'area': '2.4'}); pg4.wait_for_timeout(1200)
        b2 = fr.evaluate("({n:DB.avaliacoes.length,seg:curAval().segmento,tip:curAval().tipologia,ref:curAval().origem.ref})")
        rec('Segundo pedido com o módulo aberto: imóvel rural', b2['n'] == n1 + 1 and b2['seg'] == 'rural' and b2['ref'] == 'tj-77', b2)
        c4.close()
        c5, pg5 = ctx_novo(); entrar(c5, pg5, semarea)
        r = pg5.evaluate("d=>avalAbrirCom(d)", LOTE); pg5.wait_for_timeout(1200)
        rec('Pedido de quem não tem a área: tela de plano, nada criado', r is False and pg5.evaluate("!document.getElementById('aval-frame').getAttribute('src')"))
        pg5.goto(SITE + 'privacidade.html'); t1 = pg5.inner_text('main')
        pg5.goto(SITE + 'termos.html'); t2 = pg5.inner_text('main')
        rec('Privacidade e Termos citam o módulo (fotos com GPS, responsabilidade do profissional)', 'Avaliação de imóveis' in t1 and 'GPS' in t1 and 'CREA ou no CAU' in t2 and '9 de outubro de 2026' in t1 + t2)
        c5.close()
        # ---------- 9. achados da auditoria (09/10) ----------
        def api(u, metodo, caminho, corpo=None, prefer='return=minimal'):
            req = urllib.request.Request(MOCK + caminho, data=None if corpo is None else json.dumps(corpo).encode(), method=metodo,
                                         headers={'apikey': 'anon-test-key', 'Authorization': 'Bearer ' + u['sess']['access_token'], 'content-type': 'application/json', 'Prefer': prefer})
            try:
                r = urllib.request.urlopen(req); return r.status, r.read()
            except urllib.error.HTTPError as e:
                return e.code, e.read()
        renovar(bruno)
        # C1 — código escondido em ids e campos de texto
        st_, _ = api(bruno, 'POST', '/rest/v1/aval_avaliacoes', [{'id': 'x"><img src=x onerror=alert(1)>', 'codigo': 'X', 'dados': {}}])
        rec('C1: banco recusa id com código escondido', st_ == 400, st_)
        PAY = '<img src=x onerror="(window.top||window).__xss=1">'
        dados = {'id': 'avxss1', 'ownerId': bruno['id'], 'codigo': 'AV-' + PAY, 'titulo': 'Teste ' + PAY, 'segmento': 'urbano', 'tipologia': 'Apartamento',
                 'processo': '', 'juizo': '', 'partes': '', 'finalidade': '', 'objetivo': 'valor_mercado', 'dataRef': '2026-10-01', 'grauMin': '2', 'prazo': '',
                 'enq': {'apto': True}, 'doc': {'areaUso': 'documental', 'aprovado': True, 'matricula': '1', 'dataMatricula': '2026-10-01', 'areaDoc': '80'},
                 'vistoria': {'validada': True, 'dataCom': '2026-09-01', 'data': '2026-09-10'}, 'mercado': {'revisada': True},
                 'amostra': [{'id': 'd" onmouseover="x', 'ref': PAY, 'area': '80', 'preco': '700000', 'natureza': 'oferta', 'fonte': PAY, 'data': '2026-09-01', 'f': {}}],
                 'metodo': {}, 'calc': {}, 'espec': {}, 'resultado': {}, 'quesitos': [{'id': 'q"><b', 'cod': PAY, 'origem': 'juizo', 'texto': PAY, 'resposta': ''}],
                 'emissao': {'check': {}}, 'benfeitorias': [], 'evolutivo': {},
                 'anexos': [{'id': 'fx"><img src=x onerror=1>', 'tipo': 'foto', 'cat': PAY, 'legenda': PAY, 'nome': PAY, 'data': '2026-09-10T10:00', 'lat': '', 'lon': ''},
                            {'id': 'dc_ok1', 'tipo': 'doc', 'docTipo': PAY, 'nome': PAY, 'data': '2026-09-10T10:00', 'bytes': 10, 'mime': 'application/pdf'}],
                 'atualizado': 0}
        st_, _ = api(bruno, 'POST', '/rest/v1/aval_avaliacoes', [{'id': 'avxss1', 'codigo': 'X', 'dados': dados}])
        rec('C1: avaliação maliciosa de teste gravada pelo perito (id válido)', st_ == 201, st_)
        c9, p9 = ctx_novo(); entrar(c9, p9, renovar(adm)); p9.evaluate("location.hash='#/avaliacao-imoveis'"); p9.wait_for_timeout(500)
        f9 = esperar_modulo(p9)
        for rota in ["go('painel')", "go('avaliacoes')", "go('avaliacao',{id:'avxss1',tab:1})", "go('avaliacao',{id:'avxss1',tab:2})", "go('avaliacao',{id:'avxss1',tab:3})",
                     "go('avaliacao',{id:'avxss1',tab:4})", "go('avaliacao',{id:'avxss1',tab:9})", "go('auditoria')", "go('admin-usuarios')"]:
            f9.evaluate(rota); f9.wait_for_timeout(450)
        x1 = p9.evaluate('window.__xss'); x2 = f9.evaluate('window.__xss')
        rec('C1: nenhum código injetado roda nas telas do administrador', x1 is None and x2 is None, (x1, x2))
        ids = f9.evaluate("(()=>{const a=DB.avaliacoes.find(x=>x.id==='avxss1');return a?[...a.anexos,...a.amostra,...a.quesitos].map(x=>x.id):null})()")
        rec('C1: ids inválidos dentro da avaliação são trocados ao carregar', ids and all(re.fullmatch(r'[A-Za-z0-9_-]{1,60}', i) for i in ids), ids)
        try:
            with p9.expect_download(timeout=60000) as d:
                f9.evaluate("ACTIONS['copia-seguranca']()")
            d.value.save_as(os.path.join(AQUI, 'copia_admin2.zip'))
            import zipfile
            j = json.loads(zipfile.ZipFile(os.path.join(AQUI, 'copia_admin2.zip')).read('dados.json'))
            donos = {m.get('ownerId') for m in j['mercado']}
            esp_m = sql("select count(distinct owner)::int n from public.aval_mercado")[0]['n']; esp_p = sql("select count(*)::int n from public.aval_parametros")[0]['n']
            rec('Cópia do administrador leva o banco de mercado e os parâmetros de todos os peritos', len(donos) == esp_m and esp_m >= 1 and ana['id'] in donos and len(j['parametros']) == esp_p and len(j.get('peritos') or []) >= 2, (len(donos), esp_m, len(j['parametros']), esp_p))
        except Exception as e:
            rec('Cópia do administrador leva o banco de mercado e os parâmetros de todos os peritos', False, e)
        aud = sql(f"select usuario, papel from public.aval_auditoria where owner='{ana['id']}'")
        rec('M4: toda a trilha da perita tem o e-mail e o papel carimbados pelo servidor', aud and all(r['usuario'] == 'ana@perita.com' and r['papel'] == 'perito' for r in aud), aud[:3])
        # limpeza de arquivos de contas excluídas (M5)
        zeca = criar('zeca@x.com', 'Zeca Perito Saindo')
        c10, p10 = ctx_novo(); entrar(c10, p10, zeca); p10.evaluate("location.hash='#/avaliacao-imoveis'"); p10.wait_for_timeout(500)
        f10 = esperar_modulo(p10); azid = f10.evaluate("DB.avaliacoes.find(a=>a.codigo==='AV-2026-014').id")
        f10.evaluate(f"go('avaliacao',{{id:'{azid}',tab:3}})"); f10.wait_for_timeout(300)
        f10.set_input_files('#up-foto', [FX + 'foto1.jpg']); f10.wait_for_timeout(2000); wait_sync(f10, 20)
        rec('M5: foto da conta que será excluída está no Storage', any(x.startswith(zeca['id'] + '/') for x in srv('/__mock/blobs')))
        c10.close()
        sql(f"delete from auth.users where id='{zeca['id']}'")
        f9.evaluate("go('admin-config')"); f9.wait_for_timeout(300)
        recente = f9.evaluate("procurarOrfaos()")
        rec('A-N1: arquivo de conta excluída enviado há menos de 24 h não é apontado', not any(o['pasta'] == zeca['id'] for o in recente), recente)
        sql(f"update storage.objects set created_at=now()-interval '2 days' where name like '{zeca['id']}/%'")
        f9.evaluate("ACTIONS['limpar-orfaos']()"); f9.wait_for_timeout(1500)
        corpo = f9.inner_text('body')
        rec('A-N1: antes de apagar, o módulo pede confirmação com a contagem', 'Limpar arquivos de contas excluídas' in corpo and 'não existem mais' in corpo and any(x.startswith(zeca['id'] + '/') for x in srv('/__mock/blobs')), corpo[-300:])
        f9.evaluate("closeModal()")
        r = f9.evaluate("limparOrfaos()")
        mn5 = f9.evaluate("[idsSeguros({id:'avX1',ownerId:'u1',anexos:[{id:'fx_1',path:'u2/avY/fx_1'},{id:'fx_2',path:'u1/avX1/fx_2'},{id:'fx_3',path:'u1/avX1/../x'}]}).anexos.map(x=>x.path), caminhoDaAval({id:'avX1',ownerId:'u1'},'u1/avX1/fx_9')]")
        rec('M-N5: caminho de arquivo fora da pasta da própria avaliação é descartado', mn5 == [[None, 'u1/avX1/fx_2', None], True], mn5)
        rec('M5: "Limpar arquivos de contas excluídas" apaga só as fotos da conta excluída', r and r['arquivos'] >= 1 and not any(x.startswith(zeca['id'] + '/') for x in srv('/__mock/blobs')) and any(x.startswith(ana['id'] + '/') for x in srv('/__mock/blobs')), (r, len(srv('/__mock/blobs'))))
        c9.close()

        # A1 — trabalho sem internet sobe ao reabrir (não é sobrescrito)
        c11, p11 = ctx_novo(); entrar(c11, p11, renovar(ana)); p11.evaluate("location.hash='#/avaliacao-imoveis'"); p11.wait_for_timeout(500)
        f11 = esperar_modulo(p11); wait_sync(f11)
        aoff = f11.evaluate("(DB.avaliacoes.find(a=>a.ownerId===SESSION.userId&&a.codigo==='AV-2026-015')||DB.avaliacoes.find(a=>a.ownerId===SESSION.userId&&a.codigo!=='AV-2026-014')||{}).id")
        if not aoff: print('DEBUG A1', f11.evaluate("[STATE.route,SESSION&&SESSION.userId,DB.avaliacoes.map(a=>a.codigo+':'+a.ownerId)]"))
        c11.route('http://localhost:54322/**', lambda r: r.abort())
        c11.route(SB + '/rest/v1/aval_**', lambda r: r.abort()); c11.route(SB + '/storage/**', lambda r: r.abort()); c11.route(SB + '/rest/v1/rpc/aval_pode', lambda r: r.abort())
        f11.evaluate(f"go('avaliacao',{{id:'{aoff}',tab:3}})"); f11.wait_for_timeout(300)
        f11.evaluate(f"(()=>{{const a=DB.avaliacoes.find(x=>x.id==='{aoff}');a.titulo='Vistoria sem sinal';touch(a)}})()")
        f11.set_input_files('#up-foto', [FX + 'foto3.jpg']); f11.wait_for_timeout(2500)
        rec('A1: sem internet a alteração fica guardada no aparelho', f11.evaluate('CLOUD.pendente') and sql(f"select dados->>'titulo' t from public.aval_avaliacoes where id='{aoff}'")[0]['t'] != 'Vistoria sem sinal')
        c11.unroute(SB + '/rest/v1/aval_**'); c11.unroute(SB + '/storage/**'); c11.unroute(SB + '/rest/v1/rpc/aval_pode')
        p11.reload(); p11.wait_for_timeout(500); p11.evaluate("location.hash='#/avaliacao-imoveis'"); f11 = esperar_modulo(p11, 25); p11.wait_for_timeout(2500)
        t_srv = sql(f"select dados->>'titulo' t, jsonb_array_length(coalesce(dados->'anexos','[]')) n from public.aval_avaliacoes where id='{aoff}'")[0]
        rec('A1: ao reabrir com internet, o trabalho feito sem sinal sobe antes de baixar', t_srv['t'] == 'Vistoria sem sinal' and t_srv['n'] >= 1 and f11.evaluate(f"DB.avaliacoes.find(x=>x.id==='{aoff}').titulo") == 'Vistoria sem sinal', t_srv)
        rec('A1: a foto tirada sem sinal chegou ao Storage', any(x.startswith(ana['id'] + '/' + aoff + '/') for x in srv('/__mock/blobs')))

        # M3 — dois aparelhos editando a mesma avaliação: as duas alterações ficam
        c12, p12 = ctx_novo(); entrar(c12, p12, renovar(ana)); p12.evaluate("location.hash='#/avaliacao-imoveis'"); p12.wait_for_timeout(500)
        f12 = esperar_modulo(p12); wait_sync(f12)
        f11.evaluate(f"go('avaliacao',{{id:'{aoff}',tab:3}})"); f11.wait_for_timeout(300)
        f11.set_input_files('#up-foto', [FX + 'foto4.jpg']); f11.wait_for_timeout(2000); wait_sync(f11, 20)
        f12.evaluate(f"(()=>{{const a=DB.avaliacoes.find(x=>x.id==='{aoff}');a.partes='Editado no aparelho 2';touch(a)}})()")
        wait_sync(f12, 20); f12.wait_for_timeout(500)
        srvm = sql(f"select dados->>'partes' p, dados->>'titulo' t, jsonb_array_length(dados->'anexos') n from public.aval_avaliacoes where id='{aoff}'")[0]
        rec('M3: edição do aparelho 2 não apaga a foto enviada pelo aparelho 1', srvm['p'] == 'Editado no aparelho 2' and srvm['n'] >= 2 and srvm['t'] == 'Vistoria sem sinal', srvm)
        rec('M3: o aparelho 2 avisa que combinou as alterações', 'combinadas' in f12.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' ')"))
        c12.close()

        # M1/M2 — Sair por outros botões e duplo clique
        chave = p11.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('soliduns-aval-modulo-v1-u-'))")
        p11.evaluate("(()=>{const b=document.getElementById('btn-sair-dash');b.click();b.click();})()"); p11.wait_for_timeout(4000)
        sobra = p11.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('soliduns-aval-modulo-v1-u-')).map(k=>[k,(localStorage.getItem(k)||'').includes('AV-2026')])")
        rec('M2: duplo clique em Sair ainda limpa o módulo e sai', p11.evaluate('sessaoAtual===null') and not any(x[1] for x in sobra), (chave, sobra))
        c11.close()
        c13, p13 = ctx_novo(); entrar(c13, p13, renovar(ana)); p13.evaluate("location.hash='#/avaliacao-imoveis'"); p13.wait_for_timeout(500); esperar_modulo(p13)
        p13.evaluate("document.getElementById('btn-cpf-gate-sair').click()"); p13.wait_for_timeout(3000)
        rec('M1: Sair pelo aviso de CPF também passa pelo módulo', p13.evaluate("sessaoAtual===null&&!document.getElementById('aval-frame').getAttribute('src')"))
        c13.close()

        # tipos de arquivo aceitos
        c14, p14 = ctx_novo(); entrar(c14, p14, renovar(bruno)); p14.evaluate("location.hash='#/avaliacao-imoveis'"); p14.wait_for_timeout(500)
        f14 = esperar_modulo(p14); f14.evaluate("ACTIONS.nova({dataset:{seg:'urbano'}})"); f14.wait_for_timeout(400); ab = f14.evaluate("STATE.params.id"); f14.evaluate(unl, f14.evaluate("curAval().codigo"))
        f14.evaluate(f"go('avaliacao',{{id:'{ab}',tab:2}})"); f14.wait_for_timeout(300)
        open(os.path.join(AQUI, 'pagina.html'), 'w').write('<script>alert(1)</script>')
        n0 = f14.evaluate(f"(DB.avaliacoes.find(a=>a.id==='{ab}').anexos||[]).length")
        f14.set_input_files('#up-doc', [os.path.join(AQUI, 'pagina.html')]); f14.wait_for_timeout(800)
        rec('Arquivo que não é PDF, Word ou imagem é recusado', f14.evaluate(f"(DB.avaliacoes.find(a=>a.id==='{ab}').anexos||[]).length") == n0)
        st_, _ = api(bruno, 'POST', f"/storage/v1/object/aval-anexos/{bruno['id']}/{ab}/x1", None) if False else (None, None)
        req = urllib.request.Request(MOCK + f"/storage/v1/object/aval-anexos/{bruno['id']}/{ab}/pag1", data=b'<script>1</script>', method='POST',
                                     headers={'apikey': 'anon-test-key', 'Authorization': 'Bearer ' + bruno['sess']['access_token'], 'content-type': 'text/html'})
        try: urllib.request.urlopen(req); st_ = 200
        except urllib.error.HTTPError as e: st_ = e.code
        rec('Storage recusa página HTML enviada direto pela API', st_ == 400, st_)
        # apagar meus dados (M5)
        f14.evaluate(f"go('avaliacao',{{id:'{ab}',tab:3}})"); f14.wait_for_timeout(300)
        f14.set_input_files('#up-foto', [FX + 'foto2.jpg']); f14.wait_for_timeout(2000); wait_sync(f14, 20)
        f14.evaluate("apagarMeusDados()"); f14.wait_for_timeout(3000)
        resto = sql(f"select (select count(*) from public.aval_avaliacoes where owner='{bruno['id']}')::int a, (select count(*) from public.aval_perfis where id='{bruno['id']}')::int p, (select count(*) from public.aval_mercado where owner='{bruno['id']}')::int m")[0]
        rec('Apagar meus dados: avaliações, mercado, perfil e arquivos do perito saem do servidor', resto == {'a': 0, 'p': 0, 'm': 0} and not any(x.startswith(bruno['id'] + '/') for x in srv('/__mock/blobs')), resto)
        rec('Apagar meus dados: tela de confirmação', f14.evaluate('STATE.route') == 'sem-acesso' and 'apagados' in f14.inner_text('body'))
        c14.close()
        log = srv('/__mock/log'); erros = [x for x in log if 'erro' in str(x[0])]
        rec('Sem erros inesperados no servidor', all(('row-level' in str(e) or 'permission' in str(e) or 'aval_avaliacoes_id_ok' in str(e)) for e in erros), erros[-5:])
        novos = [e for e in ERRS if 'aval' in e.lower() or 'SOLIDUNS_AVAL' in e]
        rec('Sem erros de JavaScript do módulo', len(novos) == 0, novos[:5])
        print('Outros erros da página (fora do módulo):', len(ERRS) - len(novos), [e[:120] for e in ERRS if e not in novos][:5])
        b.close()

run()
ok = sum(1 for r in R if r[1]); print('\n%s AVA TOTAL %d OK %d FALHAS %d' % (MODE, len(R), ok, len(R) - ok))
json.dump(R, open(os.path.join(AQUI, 'res-t83-%s.json' % MODE), 'w'), ensure_ascii=False, indent=1)
