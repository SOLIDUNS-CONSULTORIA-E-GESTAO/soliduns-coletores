"""Conferências do backtest: (1) retorno total reconstruído x Ibovespa (carteira ponderada por valor de mercado, 2011+);
(2) contribuição por ação e por fase; (3) estabilidade por subperíodo."""
import sys
import numpy as np, pandas as pd
B = sys.argv[1]
nav = pd.read_pickle(f'{B}/bt_nav.pkl'); cart = pd.read_pickle(f'{B}/bt_carteiras.pkl'); rank = pd.read_pickle(f'{B}/bt_rankings.pkl')
ret = pd.read_parquet(f'{B}/retornos.parquet', columns=['data', 'ticker', 'r'])
R = ret.pivot(index='data', columns='ticker', values='r').sort_index()
dias = R.index
def cagr(s):
    a = (s.index[-1] - s.index[0]).days / 365.25; return s.iloc[-1] / s.iloc[0]
# (1) valor de mercado: elegíveis da fase A ponderados por mcap (do próprio ranking), trimestral
A = rank[rank['fase'] == 'A']
ds = sorted(A['data'].unique()); v = 1.0; serie = {}
for i, D in enumerate(ds):
    fim = ds[i + 1] if i + 1 < len(ds) else dias[-1]
    g = A[A['data'] == D].set_index('ticker')['mcap']; w = g / g.sum() * v
    for d in dias[(dias > D) & (dias <= fim)]:
        w = w * (1 + R.loc[d, w.index].fillna(0)); serie[d] = w.sum()
    v = w.sum()
mc = pd.Series(serie); ib = nav['Ibovespa'].reindex(mc.index); ib = ib / ib.iloc[0]; mc = mc / mc.iloc[0]
anos = (mc.index[-1] - mc.index[0]).days / 365.25
print(f'(1) 2011-07 a 2026-10: elegíveis por valor de mercado {mc.iloc[-1] ** (1 / anos) - 1:.1%} a.a. x Ibovespa {ib.iloc[-1] ** (1 / anos) - 1:.1%} a.a.;'
      f' correlação diária {mc.pct_change().corr(ib.pct_change()):.2f}')
# (2) contribuição por ação (soma de peso x retorno do trimestre)
contr = []
ds = sorted(cart['data'].unique())
for i, D in enumerate(ds):
    fim = ds[i + 1] if i + 1 < len(ds) else dias[-1]
    per = dias[(dias > D) & (dias <= fim)]
    g = cart[cart['data'] == D].set_index('ticker')
    rq = (1 + R.loc[per, g.index].fillna(0)).prod() - 1
    for t in g.index: contr.append((D, g.at[t, 'fase'], t, g.at[t, 'peso'], rq[t], g.at[t, 'peso'] * rq[t]))
c = pd.DataFrame(contr, columns=['data', 'fase', 'ticker', 'peso', 'ret_tri', 'contrib'])
c.to_pickle(f'{B}/bt_contrib.pkl')
print('\n(2) maiores contribuições trimestrais (peso x retorno):'); print(c.sort_values('contrib', ascending=False).head(12).to_string(index=False))
print('\n    piores:'); print(c.sort_values('contrib').head(8).to_string(index=False))
tot = c.groupby('ticker')['contrib'].sum().sort_values(ascending=False)
print('\n    ações com mais contribuição somada:', tot.head(12).round(2).to_dict())
q = c.groupby('data')['contrib'].sum()
print(f'    trimestres: {len(q)}; mediana {q.median():.1%}; sem as 5 melhores contribuições individuais, retorno trimestral médio cai de {q.mean():.2%} para '
      f'{(c["contrib"].sum() - c.sort_values("contrib", ascending=False).head(5)["contrib"].sum()) / len(q):.2%}')
# (3) subperíodos
cols = list(nav.columns)
print('\n(3) retorno ao ano por subperíodo:')
cortes = [('2001-01-01', '2005-12-31'), ('2006-01-01', '2010-12-31'), ('2011-01-01', '2015-12-31'), ('2016-01-01', '2020-12-31'), ('2021-01-01', '2026-12-31'),
          ('2001-01-01', '2011-06-30'), ('2011-07-01', '2026-12-31')]
linhas = []
for a, b in cortes:
    s = nav.loc[a:b]; an = (s.index[-1] - s.index[0]).days / 365.25
    linhas.append([f'{a[:7]} a {b[:7]}'] + [f'{(s[k].iloc[-1] / s[k].iloc[0]) ** (1 / an) - 1:.1%}' for k in cols])
print(pd.DataFrame(linhas, columns=['período'] + [k[:18] for k in cols]).to_string(index=False))
