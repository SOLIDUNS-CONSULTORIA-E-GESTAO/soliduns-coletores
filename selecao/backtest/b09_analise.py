"""Análise do backtest: métricas, ciclos da Selic (queda e alta), risco-país, eleições, custos, carteiras aleatórias."""
import sys
import numpy as np, pandas as pd
B = sys.argv[1]; V = sys.argv[2] if len(sys.argv) > 2 else B
nav = pd.read_pickle(f'{V}/bt_nav.pkl'); cart = pd.read_pickle(f'{V}/bt_carteiras.pkl'); rank = pd.read_pickle(f'{V}/bt_rankings.pkl')
giro = pd.read_pickle(f'{V}/bt_giro.pkl'); mac = pd.read_pickle(f'{B}/macro.pkl')
ret = pd.read_parquet(f'{B}/retornos.parquet', columns=['data', 'ticker', 'r'])
R = ret.pivot(index='data', columns='ticker', values='r').sort_index(); dias = R.index
C, I, CDI = 'Carteira SOLIDUNS (10 ações)', 'Ibovespa', 'CDI'
cols = list(nav.columns)
out = {}

def met(s, cdi):
    r = s.pct_change().dropna(); a = (s.index[-1] - s.index[0]).days / 365.25
    cg = (s.iloc[-1] / s.iloc[0]) ** (1 / a) - 1; cc = (cdi.iloc[-1] / cdi.iloc[0]) ** (1 / a) - 1
    vol = r.std() * np.sqrt(252); dd = (s / s.cummax() - 1).min()
    return dict(cagr=cg, vol=vol, sharpe=(cg - cc) / vol if vol > 0 else np.nan, max_dd=dd, acum=s.iloc[-1] / s.iloc[0] - 1)

# 1. métricas por período
per = {'Total (2001–2026)': ('2001-01-01', '2026-12-31'), 'Fase B (2001–06/2011)': ('2001-01-01', '2011-06-30'),
       'Fase A (07/2011–2026)': ('2011-07-01', '2026-12-31')}
tab = []
for nome, (a, b) in per.items():
    s = nav.loc[a:b]
    for c in cols:
        m = met(s[c], s[CDI]); tab.append(dict(periodo=nome, serie=c, **m))
out['metricas'] = pd.DataFrame(tab)
rq = nav.resample('QE').last().pct_change().dropna()
beta = np.cov(rq[C], rq[I])[0, 1] / rq[I].var()
out['beta_trimestral'] = beta
out['pct_trim_acima_ibov'] = float((rq[C] > rq[I]).mean())
out['pct_trim_acima_cdi'] = float((rq[C] > rq[CDI]).mean())
out['giro_medio'] = float(giro.iloc[1:].mean())

# 2. ciclos da Selic (meta): queda = do 1º corte ao último corte do ciclo; alta = idem
sel = mac['selic_meta'].sort_index(); sel = sel[sel.index >= '2000-06-01']
mud = sel[sel.diff().fillna(0) != 0]
ev = pd.DataFrame({'data': mud.index, 'nivel': mud.values, 'dir': np.sign(mud.diff().fillna(-1).values)})
ciclos = []; atual = None
for r in ev.itertuples():
    if atual and r.dir == atual['dir'] and (r.data - atual['fim']).days <= 200:
        atual['fim'] = r.data; atual['nivel_fim'] = r.nivel; atual['n'] += 1
    else:
        if atual: ciclos.append(atual)
        ant = sel[sel.index < r.data]
        atual = dict(dir=r.dir, ini=r.data, fim=r.data, nivel_ini=float(ant.iloc[-1]) if len(ant) else r.nivel, nivel_fim=r.nivel, n=1)
ciclos.append(atual)
linhas = []
for c in ciclos:
    a, b = max(c['ini'], nav.index[0]), c['fim']
    if b <= nav.index[0] or (b - a).days < 60: continue
    s = nav.loc[a:b]
    if len(s) < 20: continue
    rr = {k: s[k].iloc[-1] / s[k].iloc[0] - 1 for k in cols}
    linhas.append(dict(tipo='Queda' if c['dir'] < 0 else 'Alta', inicio=a.date(), fim=b.date(), selic=f"{c['nivel_ini']:.2f}% → {c['nivel_fim']:.2f}%",
                       meses=round((b - a).days / 30.4), **{k: v for k, v in rr.items()}))
out['ciclos'] = pd.DataFrame(linhas)
# agregados: retorno ao ano dentro dos períodos de queda x alta x estável
lab = pd.Series('Estável', index=nav.index)
for c in out['ciclos'].itertuples():
    lab.loc[str(c.inicio):str(c.fim)] = c.tipo
rd = nav.pct_change().dropna(); lab = lab.reindex(rd.index)
agg = []
for t in ['Queda', 'Alta', 'Estável']:
    x = rd[lab == t]; n = len(x)
    agg.append(dict(regime=t, pregoes=n, **{k: (1 + x[k]).prod() ** (252 / n) - 1 for k in cols}))
out['regimes_selic'] = pd.DataFrame(agg)

# 3. risco-país (EMBI+ até 07/2024): trimestres em que caiu x subiu
emb = mac['embi'].sort_index().astype(float).resample('QE').last()
de = emb.diff().reindex(rq.index)
rr = rq.join(de.rename('d_embi')).dropna()
out['risco_pais'] = pd.DataFrame([dict(regime=f'Risco-país caiu (n={int((rr.d_embi < 0).sum())})', **rr[rr.d_embi < 0][cols].mean().to_dict()),
                                   dict(regime=f'Risco-país subiu (n={int((rr.d_embi > 0).sum())})', **rr[rr.d_embi > 0][cols].mean().to_dict())])

# 4. janelas eleitorais (1º de julho ao fim de dezembro)
el = []
for y in (2002, 2006, 2010, 2014, 2018, 2022, 2026):
    s = nav.loc[f'{y}-07-01':f'{y}-12-31']
    if len(s) > 20: el.append(dict(ano=y, **{k: s[k].iloc[-1] / s[k].iloc[0] - 1 for k in cols}))
out['eleicoes'] = pd.DataFrame(el)

# 5. setores na carteira em períodos de queda x alta da Selic
cart['regime'] = cart['data'].map(lambda d: lab.asof(d) if d >= lab.index[0] else 'Estável')
out['setores_regime'] = (cart.groupby(['regime', 'grupo'])['peso'].sum() / cart.groupby('regime')['data'].nunique()).unstack(0).fillna(0).round(3)

# 6. motor trimestral (para custos e carteiras aleatórias)
ds = sorted(cart['data'].unique())
def rq_acao(i):
    D = ds[i]; fim = ds[i + 1] if i + 1 < len(ds) else dias[-1]
    per = dias[(dias > D) & (dias <= fim)]
    return (1 + R.loc[per].fillna(0)).prod() - 1
RQ = [rq_acao(i) for i in range(len(ds))]
def cagr_q(rets):
    v = np.prod(1 + np.array(rets)); a = (dias[-1] - ds[0]).days / 365.25; return v ** (1 / a) - 1
def carteira_q(pesos_por_data, custo):
    rets, ant = [], None
    for i, D in enumerate(ds):
        w = pesos_por_data[D]
        g = 1.0 if ant is None else float((w.reindex(w.index.union(ant.index)).fillna(0) - ant.reindex(w.index.union(ant.index)).fillna(0)).abs().sum())
        r = float((w * RQ[i].reindex(w.index).fillna(0)).sum())
        rets.append((1 - custo * g) * (1 + r) - 1)
        dr = w * (1 + RQ[i].reindex(w.index).fillna(0)); ant = dr / dr.sum()
    return cagr_q(rets)
W = {D: g.set_index('ticker')['peso'] for D, g in cart.groupby('data')}
out['custos'] = pd.DataFrame([dict(custo_por_lado=f'{c:.2%}', cagr=carteira_q(W, c)) for c in (0.0, 0.0015, 0.005, 0.01)])
# só a seleção (10 primeiras, peso igual) e carteiras aleatórias de 10 elegíveis (peso igual)
top_ew = {D: pd.Series(0.1, index=g.sort_values('escore', ascending=False)['ticker'].head(10)) for D, g in rank.groupby('data') if D in W}
cagr_top = carteira_q(top_ew, 0.0015)
rng = np.random.default_rng(42); sims = []
eleg = {D: list(g['ticker']) for D, g in rank.groupby('data') if D in W}
for k in range(1000):
    pw = {D: pd.Series(0.1, index=rng.choice(eleg[D], 10, replace=False)) for D in ds}
    sims.append(carteira_q(pw, 0.0015))
sims = np.array(sims)
out['aleatorias'] = dict(cagr_top10_peso_igual=cagr_top, media=sims.mean(), p5=np.percentile(sims, 5), p50=np.percentile(sims, 50),
                         p95=np.percentile(sims, 95), percentil_metodo=float((sims < cagr_top).mean()), max=sims.max())
# idem por fase
for fase, cond in (('B', lambda D: D < pd.Timestamp('2011-07-01')), ('A', lambda D: D >= pd.Timestamp('2011-07-01'))):
    idx = [i for i, D in enumerate(ds) if cond(D)]
    def cg(pw):
        v = 1.0
        for i in idx:
            w = pw[ds[i]]; v *= 1 + float((w * RQ[i].reindex(w.index).fillna(0)).sum()) - 0.0015
        a = len(idx) / 4; return v ** (1 / a) - 1
    sm = []
    for k in range(500):
        sm.append(cg({ds[i]: pd.Series(0.1, index=rng.choice(eleg[ds[i]], 10, replace=False)) for i in idx}))
    out[f'aleatorias_{fase}'] = dict(metodo=cg(top_ew), p50=np.median(sm), p95=np.percentile(sm, 95), percentil=float((np.array(sm) < cg(top_ew)).mean()))
pd.to_pickle(out, f'{V}/bt_analise.pkl')
pd.set_option('display.width', 250); pd.set_option('display.float_format', lambda v: f'{v:.3f}')
for k, v in out.items():
    print('\n==', k); print(v if not isinstance(v, pd.DataFrame) else v.to_string(index=False))
