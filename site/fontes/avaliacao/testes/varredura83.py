import sys, subprocess, time
from playwright.sync_api import sync_playwright
rotas = ['#/','#/acoes','#/admin','#/calculadoras','#/educacao','#/educacao/preparatorios','#/equipe','#/executivo/ativos','#/executivo/consultoria',
 '#/gestao-financeira','#/gestao-fiscal','#/investimentos','#/investimentos/acoes','#/investimentos/empresas','#/investimentos/leilao',
 '#/investimentos/mercado-financeiro','#/leilao','#/login','#/mercado-imobiliario','#/quem-somos','#/servicos/ativos','#/servicos/caixa',
 '#/servicos/consultoria','#/servicos/educacao-financeira','#/servicos/educacao-tributaria','#/mercado','#/relatorios-analise','#/leilao/alertas','#/leilao-veiculos','#/leilao-automoveis','#/avaliacao-imoveis','#/laudos','#/investimentos/avaliacao-imoveis']
def rodar(pasta, porta):
    p = subprocess.Popen([sys.executable,'-m','http.server',str(porta)],cwd=pasta,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.5); res={}
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(); pg = b.new_page(); errs=[]
            pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
            pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://localhost:{porta}') else r.continue_())
            pg.goto(f'http://localhost:{porta}/index.html'); pg.wait_for_timeout(2500)
            for r in rotas:
                n = len(errs); pg.evaluate(f"location.hash = '{r}'"); pg.wait_for_timeout(900)
                res[r] = errs[n:]
            b.close()
    finally: p.kill()
    return res
BASE = sys.argv[1] if len(sys.argv) > 2 else '/home/claude/ava/base_deploy'
NOVA = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/ava/deploy'
a = rodar(BASE, 8931)
b = rodar(NOVA, 8932)
novos = {r: [e for e in b[r] if e not in a[r]] for r in rotas}
for r in rotas: print(f"{r:40s} v82:{len(a[r])} v83:{len(b[r])}", ('NOVO ERRO: '+str(novos[r])) if novos[r] else '')
print('RESULTADO:', 'TUDO OK' if not any(novos.values()) else 'FALHA')
