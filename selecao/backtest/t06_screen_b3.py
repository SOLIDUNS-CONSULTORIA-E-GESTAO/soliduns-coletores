"""Varredura: maiores ganhos até o alvo 2 entre todas as ações líquidas da B3, com alertas de fundamentos e setor."""
import sys, json
import numpy as np, pandas as pd
B, T, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
sys.argv = [sys.argv[0], B]
sys.path.insert(0, '/home/claude/backtest')
import b06_fund_pit as F
n = json.load(open(f'{T}/niveis_todas.json')); t = json.load(open(f'{T}/tecnica.json'))
U = pd.read_pickle(f'{T}/universo_b3.pkl').set_index('ticker')
R = pd.DataFrame({k: v for k, v in n.items() if isinstance(v, dict)}).T
for c in ['preco', 'up_fund', 'up_emp', 'up', 'ent_ideal', 'ent_max', 'stop', 'alvo1', 'alvo2', 'ganho1', 'ganho2', 'perda', 'rr2']: R[c] = R[c].astype(float)
for c, k in (('adx', 'adx'), ('ifr', 'ifr14'), ('ret21', 'ret_21d'), ('ret_ano', 'ret_ano'), ('ret_0510', 'ret_0510')):
    R[c] = [t[x][k] for x in R.index]
R['acima_mme200'] = [t[x]['fech'] > t[x]['mme200'] for x in R.index]
R = R.join(U[['grupo_orig', 'setor', 'cnpj', 'beta', 'vol_medio']])
# fundamentos (mesmas contas da plataforma)
dem, ind, cap = F.preparar(); F.init(dem, ind, cap)
fund = {}
for tk, c in R['cnpj'].dropna().items():
    r = F.um((c, pd.Timestamp('2026-10-22')))
    if r: fund[tk] = r
FD = pd.DataFrame(fund).T
R['empresa'] = FD.get('empresa'); R['lucro_12m'] = pd.to_numeric(FD.get('lucro_liq_ttm'), errors='coerce'); R['pl'] = pd.to_numeric(FD.get('patrimonio_liq'), errors='coerce')
ebitda = pd.to_numeric(FD.get('ebit_ttm'), errors='coerce')
R['div_liq_ebit'] = (pd.to_numeric(FD.get('divida_bruta'), errors='coerce') - pd.to_numeric(FD.get('caixa'), errors='coerce')) / ebitda.where(ebitda > 0)
EXCL = {'varejo': 'varejo (excluído)', 'construcao': 'construção civil (excluído)', 'transporte': 'transporte e logística (excluído)', 'saude_educacao': 'saúde e educação (excluído)'}
RETIRADAS = {'TTEN3', 'SOJA3', 'SLCE3', 'ORVR3'}
def alertas(r):
    a = []
    if r.grupo_orig in EXCL: a.append(EXCL[r.grupo_orig])
    if r.name in RETIRADAS: a.append('retirada por você')
    if pd.notna(r.lucro_12m) and r.lucro_12m < 0: a.append('prejuízo em 12 meses')
    if pd.notna(r.pl) and r.pl < 0: a.append('patrimônio negativo')
    if isinstance(r.empresa, str) and 'RECUPERA' in r.empresa.upper(): a.append('recuperação judicial')
    if pd.notna(r.div_liq_ebit) and r.div_liq_ebit > 4: a.append('dívida líquida > 4x EBIT')
    if r.rr2 < 1: a.append('ganho/risco < 1')
    if r.preco < 1: a.append('ação abaixo de R$ 1')
    if not r.acima_mme200: a.append('abaixo da MME 200')
    return '; '.join(a)
R['alertas'] = R.apply(alertas, axis=1)
R['limpa'] = ~R.alertas.str.contains('excluído|retirada|prejuízo|negativo|recuperação|ganho/risco < 1|abaixo de R. 1')
R = R.sort_values('ganho2', ascending=False)
R.to_pickle(f'{T}/screen_b3.pkl')
pd.set_option('display.width', 260)
print(len(R), 'ações;', (R.ganho2 >= 0.2).sum(), 'com ganho >= 20%;', ((R.ganho2 >= 0.2) & R.limpa).sum(), 'limpas')
print(R[R.ganho2 >= 0.15][['empresa', 'grupo_orig', 'preco', 'ent_ideal', 'stop', 'alvo2', 'ganho2', 'perda', 'rr2', 'ret_0510', 'alertas']].round(3).to_string())
