"""Backtest da metodologia do robô SOLIDUNS — carteira teórica de 10 ações, rebalanceamento trimestral, 2000–2026.
Fase A (07/2011 em diante): método completo do robô (custo de capital sob risco Brasil, valor por Gordon, pior caso,
  crescimento setorial, IGov, margem bruta), com fundamentos point-in-time (entregues à CVM antes da data).
Fase B (2000 a 04/2011): versão reduzida — sem balanços estruturados na CVM. Retorno esperado = proventos dos últimos
  12 meses × (1 + g) + g (fórmula 8.6 com o dividend yield no lugar de φ/(P/L)), pior caso, crescimento setorial, IGov.
Sem informação do futuro: preços até o fechamento da data D, balanços entregues antes de D; a carteira rende a partir
do pregão seguinte. Varejo e construção civil excluídos (decisão de gestão), como no robô."""
import glob, os, sys, warnings
import numpy as np, pandas as pd, yaml
from scipy.optimize import minimize
warnings.filterwarnings('ignore')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from manual_setores import MANUAL, NAO_ACAO
from soliduns_selecao.util import sem_acento

OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True); FIX = sys.argv[3].split(',') if len(sys.argv) > 3 else ['est', 'ctl2010', 'stale', 'macro', 'fre']
B = sys.argv[1]; SEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = dict(n=10, wmin=0.05, wmax=0.15, setor_max=0.30, estatais_max=0.20, custo=0.0015, erp=0.045, m=1.5, kappa=2.0,
         spread_min=0.03, payout_min=0.25, stress_embi=0.01, stress_selic=0.015, inicio_A=pd.Timestamp('2011-07-01'))
PESOS_A = {'normal': dict(ret=0.35, pior=0.05, cresc=0.20, gov=0.20, mb=0.20),
           'eleitoral': dict(ret=0.25, pior=0.20, cresc=0.20, gov=0.20, mb=0.15)}
PESOS_B = {'normal': dict(ret=0.40, pior=0.05, cresc=0.25, gov=0.30),
           'eleitoral': dict(ret=0.30, pior=0.20, cresc=0.20, gov=0.30)}
ANOS_ELEICAO = {2002, 2006, 2010, 2014, 2018, 2022, 2026}

# ------------------------------------------------------------------ dados
YS = os.environ.get('YSEL', SEL)
st = yaml.safe_load(open(f'{YS}/setores.yaml', encoding='utf-8'))
cfg = yaml.safe_load(open(f'{YS}/parametros.yaml', encoding='utf-8'))
EXCL = set(cfg['universo']['grupos_excluidos'])
mapa = {sem_acento(k): v for k, v in st['mapa_cvm'].items()}
def grupo(setor):
    s = str(setor or '').replace('Emp. Adm. Part. - ', '').strip()
    return mapa.get(sem_acento(s), st['padrao'])

ret = pd.read_parquet(f'{B}/retornos.parquet', columns=['data', 'ticker', 'fech', 'volume', 'r', 'r_bruto', 'r_merc', 'evento', 'seg'])
R = ret.pivot(index='data', columns='ticker', values='r').sort_index()
F0 = ret.pivot(index='data', columns='ticker', values='fech').sort_index(); F = F0.ffill(limit=10)
SEG = ret.pivot(index='data', columns='ticker', values='seg').sort_index().ffill()
ev = ret[ret['evento'] & ret['r_bruto'].abs().lt(0.25)].assign(prov=lambda d: d['r_merc'] - d['r_bruto'])
PROV = ev.pivot_table(index='data', columns='ticker', values='prov', aggfunc='sum').reindex(index=R.index, columns=R.columns).fillna(0.0)
spl = ret[ret['evento'] & ret['r_bruto'].abs().gt(0.35)].assign(f=lambda d: 1 / (1 + d['r_bruto']))   # fator de ações
dias = R.index
univ = pd.read_pickle(f'{B}/universo.pkl')
ref = pd.read_pickle(f'{B}/ref.pkl')
fre = pd.read_pickle(f'{B}/fre_acoes.pkl')
mac = pd.read_pickle(f'{B}/macro.pkl')

# mercado (Ibovespa, retorno total): SGS 7 até 30/09/2019; BOVA11 depois
ib = mac['ibov']; r_ib = ib.pct_change().dropna()
r_bova = R['BOVA11'].dropna(); r_bova = r_bova[r_bova.index > ib.index.max()]
MKT = pd.concat([r_ib, r_bova]).reindex(dias).fillna(0.0)
CDI = (mac['cdi_dia'] / 100).reindex(dias).ffill().fillna(0.0)
selic = mac['selic_meta'].sort_index()
ipca = mac['ipca_mes'].sort_index(); pib = mac['pib_ano'].sort_index()
embi = mac['embi'].sort_index().astype(float)
cds_ancoras = pd.Series({pd.Timestamp('2025-01-15'): 214, pd.Timestamp('2026-04-24'): 122.9, pd.Timestamp('2026-05-08'): 116,
                         pd.Timestamp('2026-08-17'): 127, pd.Timestamp('2026-09-10'): 115, pd.Timestamp('2026-09-19'): 112,
                         pd.Timestamp('2026-10-09'): 110})
risco = pd.concat([embi, cds_ancoras]).sort_index()
risco = risco.reindex(risco.index.union(dias)).ffill().reindex(dias).ffill() if 'macro' in FIX else risco.reindex(risco.index.union(dias)).interpolate('time').reindex(dias).ffill()
def ult(s, D, defasagem_dias=0):
    s = s[s.index <= D - pd.Timedelta(days=defasagem_dias)]
    return float(s.iloc[-1]) if len(s) else np.nan

def macro(D):
    sel = ult(selic, D) / 100; sel1 = ult(selic, D - pd.DateOffset(years=1)) / 100
    ip = ipca[(ipca.index < D - pd.Timedelta(days=(42 if 'macro' in FIX else 20)))].tail(12)
    ipca12 = float(np.prod(1 + ip / 100) - 1)
    pb = ult(pib, pd.Timestamp(D.year - (2 if ('macro' in FIX and D.month < 4) else 1), 12, 31)) / 100
    return dict(selic=sel, dselic=sel - sel1, ipca=ipca12, pib=pb, risco=float(risco.loc[:D].iloc[-1]) / 1e4)

def acoes_fre(cnpj, D, tk):
    y = D.year if D >= pd.Timestamp(D.year, (10 if 'fre' in FIX else 6), 1) else D.year - 1
    f = fre[(fre['cnpj'] == cnpj) & (fre['ano'] <= y)]
    if f.empty: return np.nan
    a = float(f.sort_values('ano')['acoes'].iloc[-1]); base = pd.Timestamp(int(f['ano'].max()), 6, 1)
    s = spl[(spl['ticker'] == tk) & (spl['data'] > base) & (spl['data'] <= D)]
    return a * float(np.prod(s['f'])) if len(s) else a

def beta_sigma(tk, D):
    j = dias.get_loc(D)
    r = R[tk].iloc[max(0, j - 504):j + 1]; m = MKT.iloc[max(0, j - 504):j + 1]
    d = pd.concat([(1 + r.fillna(0)).groupby(np.arange(len(r)) // 5).prod() - 1,
                   (1 + m).groupby(np.arange(len(m)) // 5).prod() - 1], axis=1).dropna()
    b = 1.0
    if len(d) > 40 and d.iloc[:, 1].var() > 0:
        b = np.cov(d.iloc[:, 0], d.iloc[:, 1])[0, 1] / d.iloc[:, 1].var()
    s = R[tk].iloc[max(0, j - 252):j + 1].std() * np.sqrt(252)
    return float(np.clip(0.67 * b + 0.33, 0.3, 2.0)), float(s if np.isfinite(s) and s > 0.05 else 0.4), int(R[tk].iloc[:j + 1].notna().sum())

def z(x, grupo_ser=None, minimo=4):
    x = pd.Series(x, dtype=float); x = x.fillna(x.median())
    def pad(v):
        v = v.clip(v.quantile(0.025), v.quantile(0.975)); sd = v.std(ddof=0)
        return (v - v.mean()) / sd if sd > 0 else v * 0
    out = pad(x)
    if grupo_ser is not None:
        for g, idx in x.groupby(grupo_ser).groups.items():
            if len(idx) >= minimo: out.loc[idx] = pad(x.loc[idx]).values
    return out

def notas_gov(seg, tk, ctl, ff, cons, nsanc):
    n_seg = {'NM': 100, 'N2': 80, 'N1': 60, 'MA': 60, 'M2': 60}.get(seg, 30)
    tag = 100 if seg in ('NM', 'N2') else (20 if tk[-1] in '45678' else 60)
    c = 50.0 if not np.isfinite(cons) else float(np.clip(cons / 0.5, 0, 1) * 100)
    f = 50.0 if not np.isfinite(ff) else float(np.clip((ff - 15) / 35, 0, 1) * 100)
    k = 0 if ('estatal' in str(ctl).lower() if 'est' in FIX else 'Estatal' in str(ctl)) else 100
    h = max(0, 100 - 35 * nsanc)
    return 0.30 * n_seg + 0.15 * tag + 0.15 * c + 0.10 * f + 0.15 * k + 0.15 * h

def pesos(sel, eleitoral):
    n = len(sel); s = sel['escore'].values; sg = sel['sigma'].values
    w0 = (s - s.min() + 0.1 * (s.std() or 1)) / sg; w0 = w0 / w0.sum()
    rs = [{'type': 'eq', 'fun': lambda w: w.sum() - 1}]
    for g in sel['grupo'].unique():
        msk = (sel['grupo'] == g).values.astype(float)
        rs.append({'type': 'ineq', 'fun': lambda w, m=msk: P['setor_max'] - w @ m})
    if eleitoral:
        est = sel['estatal'].values.astype(float); rs.append({'type': 'ineq', 'fun': lambda w: P['estatais_max'] - w @ est})
    x0 = np.clip(w0, P['wmin'], P['wmax']); x0 /= x0.sum()
    r = minimize(lambda w: ((w - w0) ** 2).sum(), x0, method='SLSQP', bounds=[(P['wmin'], P['wmax'])] * n, constraints=rs,
                 options={'maxiter': 300})
    ok = r.success and all(c['fun'](r.x) >= -1e-6 for c in rs if c['type'] == 'ineq')
    return (r.x / r.x.sum() if ok else None)

def montar(D):
    fase = 'A' if D >= P['inicio_A'] else 'B'
    eleit = D.year in ANOS_ELEICAO and D.month in (7, 10)
    mc = macro(D)
    fund = pd.read_pickle(f'{B}/fund/{D:%Y-%m-%d}.pkl').set_index('cnpj') if fase == 'A' else None
    linhas = []
    for tk in univ[D]:
        rz = tk[:4]
        if rz in NAO_ACAO or tk not in F.columns or not np.isfinite(F.at[D, tk]): continue
        if 'stale' in FIX and not np.isfinite(F0.at[D, tk]): continue
        cnpj = ref['raiz'].get(rz)
        setor = ref['setor'].get(cnpj) if cnpj else (MANUAL.get(rz, (None,))[0])
        g = grupo(setor)
        if g in EXCL: continue
        ctl = ((ref['controle'].get((cnpj, max(2010, D.year - 1))) or ref['controle_cad'].get(cnpj)) if 'ctl2010' in FIX else (ref['controle'].get((cnpj, D.year - 1)) or ref['controle'].get((cnpj, D.year)) or ref['controle_cad'].get(cnpj))) if cnpj \
            else MANUAL.get(rz, (None, 'Privado'))[1]
        b, sg, nobs = beta_sigma(tk, D)
        if nobs < 200: continue
        seg = SEG.at[D, tk] if isinstance(SEG.at[D, tk], str) else ''
        ff = ref['free_float'].get((cnpj, D.year - 1), np.nan) if cnpj else np.nan
        cons = ref['conselho'].get((cnpj, D.year - 1), np.nan) if cnpj else np.nan
        sc = ref['sancoes']; nsanc = int(((sc['cnpj'] == cnpj) & (sc['abertura'] < D) & (sc['abertura'] >= D - pd.DateOffset(years=5))).sum()) if cnpj else 0
        gp = st['grupos'][g]
        gset = mc['ipca'] + gp['eps'] * mc['pib'] - gp['eta'] * mc['dselic']
        gset = float(np.clip(gset, 0.0, 0.25))
        L = dict(ticker=tk, cnpj=cnpj, grupo=g, setor=setor, estatal=('estatal' in str(ctl).lower() if 'est' in FIX else 'Estatal' in str(ctl)), beta=b, sigma=sg, lam_b=gp['lambda'],
                 eta=gp['eta'], g_setor=gset, igov=notas_gov(seg, tk, ctl, ff, cons, nsanc), preco=F.at[D, tk], seg=seg)
        if fase == 'A':
            if cnpj not in fund.index: continue
            f = fund.loc[cnpj]
            if isinstance(f, pd.DataFrame): f = f.iloc[0]
            lucro, pl_c, rec = f['lucro_liq_ttm'], f['patrimonio_liq'], f['receita_ttm']
            if not (lucro and lucro > 0 and pl_c and pl_c > 0): continue
            acoes = acoes_fre(cnpj, D, tk)
            if not np.isfinite(acoes) or acoes <= 0: continue
            mcap = acoes * L['preco']; pl = mcap / lucro; pvpa = mcap / pl_c
            if not (1 <= pl <= 100 and 0.05 <= pvpa <= 30): continue
            mbs = list(f['mb_hist']) + ([f['lucro_bruto_ttm'] / rec] if rec and f['lucro_bruto_ttm'] is not None and rec > 0 else [])
            mbs = [m for m in mbs if m is not None and np.isfinite(m)]
            L.update(mcap=mcap, pl=pl, roe=lucro / pl_c, payout=float(np.clip((f['dividendos_ttm'] or 0) / lucro, P['payout_min'], 1)),
                     mb=np.mean(mbs) if mbs else np.nan, mb_sd=np.std(mbs) if len(mbs) > 1 else np.nan)
        else:
            j = dias.get_loc(D); dy = float(PROV[tk].iloc[max(0, j - 251):j + 1].sum())
            L.update(mcap=np.nan, dy=float(np.clip(dy, 0, 0.25)))
        linhas.append(L)
    t = pd.DataFrame(linhas)
    if len(t) < P['n'] + 2: return None, None
    w_l = t['mcap'] if fase == 'A' else pd.Series(1.0, index=t.index)
    t['lam'] = t['lam_b'] / np.average(t['lam_b'], weights=w_l)
    crp = mc['risco'] * P['m']
    t['ke'] = mc['selic'] + t['beta'] * P['erp'] + t['lam'] * crp
    t['dke_s'] = (P['kappa'] - 1 + t['lam'] * P['m']) * P['stress_embi']
    t['g_s'] = (t['g_setor'] - t['eta'] * P['stress_selic']).clip(lower=0)
    if fase == 'A':
        gi = np.minimum(t['g_setor'], t['roe'] * (1 - t['payout'])); gis = np.minimum(t['g_s'], t['roe'] * (1 - t['payout']))
        plj = t['payout'] * (1 + gi) / np.maximum(t['ke'] - gi, P['spread_min'])
        plj_s = t['payout'] * (1 + gis) / np.maximum(t['ke'] + t['dke_s'] - gis, P['spread_min'])
        t['f_ret'] = plj / t['pl'] - 1; t['f_pior'] = np.minimum(t['f_ret'], plj_s / t['pl'] - 1)
        fat = dict(ret=z(t['f_ret']), pior=z(t['f_pior']), cresc=z(t['g_setor']), gov=z(t['igov']),
                   mb=z(t['mb'], t['grupo']) - 0.5 * z(t['mb_sd'], t['grupo']))
        W = PESOS_A['eleitoral' if eleit else 'normal']
    else:
        rr = t['dy'] * (1 + t['g_setor']) + t['g_setor']
        rr_s = t['dy'] * (1 + t['g_s']) + t['g_s']
        t['f_ret'] = rr - t['ke']; t['f_pior'] = np.minimum(t['f_ret'], rr_s - t['ke'] - t['dke_s'])
        fat = dict(ret=z(t['f_ret']), pior=z(t['f_pior']), cresc=z(t['g_setor']), gov=z(t['igov']))
        W = PESOS_B['eleitoral' if eleit else 'normal']
    t['escore'] = sum(W[k] * fat[k] for k in W)
    t = t.sort_values('escore', ascending=False).reset_index(drop=True)
    sel = t.head(P['n']).copy(); w = None; fila = list(range(P['n'], len(t)))
    for _ in range(20):
        w = pesos(sel, eleit)
        if w is not None: break
        if not fila: break
        cont = sel['grupo'].value_counts().idxmax(); i = sel[sel['grupo'] == cont].index[-1]
        sel = pd.concat([sel.drop(i), t.loc[[fila.pop(0)]]])
    if w is None: w = np.full(len(sel), 1 / len(sel))
    sel['peso'] = w; sel['data'] = D; sel['fase'] = fase; sel['eleitoral'] = eleit
    t['data'] = D; t['fase'] = fase
    return sel, t

# ------------------------------------------------------------------ simulação
datas = sorted(univ)
carteiras, rankings = [], []
for D in datas:
    sel, t = montar(D)
    if sel is not None:
        carteiras.append(sel); rankings.append(t)
    print(D.date(), 'fase', 'A' if D >= P['inicio_A'] else 'B', '-', 0 if sel is None else len(sel), 'ações', flush=True)
CART = pd.concat(carteiras, ignore_index=True); RANK = pd.concat(rankings, ignore_index=True)
CART.to_pickle(f'{OUT}/bt_carteiras.pkl'); RANK.to_pickle(f'{OUT}/bt_rankings.pkl')

def simular(alvos, nome, custo=P['custo']):
    """alvos: {D: Series(peso, index=ticker)}; rende a partir do pregão seguinte a D."""
    ds = sorted(alvos); nav = pd.Series(np.nan, index=dias); v = 1.0; w = pd.Series(dtype=float); giro = []
    for i, D in enumerate(ds):
        fim = ds[i + 1] if i + 1 < len(ds) else dias[-1]
        alvo = alvos[D]
        atual = (w / w.sum()) if w.sum() > 0 else w
        tv = alvo.reindex(alvo.index.union(atual.index)).fillna(0) - atual.reindex(alvo.index.union(atual.index)).fillna(0)
        g = float(tv.abs().sum()) if len(atual) else 1.0
        v *= (1 - custo * g); giro.append(g)
        w = alvo * v; nav.loc[D] = v
        per = dias[(dias > D) & (dias <= fim)]
        rr = R.loc[per, w.index].fillna(0.0)
        for d, row in rr.iterrows():
            w = w * (1 + row); nav.loc[d] = w.sum()
        v = w.sum()
    nav = nav.dropna(); return nav, np.array(giro)

alvos = {D: g.set_index('ticker')['peso'] for D, g in CART.groupby('data')}
nav_c, giro = simular(alvos, 'carteira')
ew = {D: pd.Series(1 / len(univ[D]), index=[t for t in univ[D] if t[:4] not in NAO_ACAO]) for D in datas}
ew = {D: s / s.sum() for D, s in ew.items()}
nav_ew, _ = simular(ew, 'universo')
ew_ex = {D: g.set_index('ticker').assign(p=1.0)['p'] for D, g in RANK.groupby('data')}
ew_ex = {D: s / s.sum() for D, s in ew_ex.items()}
nav_ewx, _ = simular(ew_ex, 'elegiveis')
ini = nav_c.index[0]
idx = dias[dias >= ini]
ibov = (1 + MKT.loc[idx]).cumprod(); ibov /= ibov.iloc[0]
cdi = (1 + CDI.loc[idx]).cumprod(); cdi /= cdi.iloc[0]
NAV = pd.DataFrame({'Carteira SOLIDUNS (10 ações)': nav_c, 'Ibovespa': ibov, 'CDI': cdi,
                    'Universo líquido (igual peso)': nav_ew, 'Elegíveis do método (igual peso)': nav_ewx}).reindex(idx).ffill()
NAV = NAV / NAV.iloc[0]
NAV.to_pickle(f'{OUT}/bt_nav.pkl'); pd.Series(giro, index=sorted(alvos)).to_pickle(f'{OUT}/bt_giro.pkl')
anos = (NAV.index[-1] - NAV.index[0]).days / 365.25
print('\nperíodo', NAV.index[0].date(), '->', NAV.index[-1].date(), f'({anos:.1f} anos); giro médio por rebalanceamento {np.mean(giro[1:]):.0%}')
for c in NAV: print(f'  {c:40s} acumulado {NAV[c].iloc[-1] - 1:9.0%}   ao ano {NAV[c].iloc[-1] ** (1 / anos) - 1:6.1%}')
