"""Datas de rebalanceamento (1º pregão de jan/abr/jul/out) e universo líquido de cada data (100 maiores volumes médios
em 63 pregões, uma classe por empresa)."""
import os
import sys
import pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from manual_setores import NAO_ACAO
B = sys.argv[1]
r = pd.read_parquet(f'{B}/retornos.parquet', columns=['data', 'ticker', 'volume'])
r = r[~r['ticker'].str[:4].isin(NAO_ACAO)]
dias = pd.Series(sorted(r['data'].unique()))
datas = []
for a in range(2000, 2027):
    for m in (1, 4, 7, 10):
        d = dias[dias >= pd.Timestamp(a, m, 1)]
        if len(d) and d.iloc[0] < pd.Timestamp(a, m, 15): datas.append(d.iloc[0])
datas = [d for d in datas if d >= pd.Timestamp('2000-04-01')]
ref = pd.read_pickle(f'{B}/ref.pkl')
univ, univ_cnpj = {}, {}
for D in datas:
    i = dias[dias < D].index[-63:]
    w = r[r['data'].isin(dias[i])]
    v = (w.groupby('ticker')['volume'].sum() / 63).sort_values(ascending=False)
    v = v[~v.index.str[:4].duplicated()]          # uma classe por empresa: a mais líquida
    top = v.head(100)
    univ[D] = list(top.index)
    if D >= pd.Timestamp('2011-07-01'):
        univ_cnpj[D] = sorted({ref['raiz'][t[:4]] for t in top.index if t[:4] in ref['raiz']})
pd.to_pickle(univ, f'{B}/universo.pkl'); pd.to_pickle(univ_cnpj, f'{B}/datas_universo.pkl')
print(len(datas), 'datas;', datas[0].date(), '...', datas[-1].date(), '; fase A:', len(univ_cnpj), 'datas, cnpjs por data ~', round(sum(map(len, univ_cnpj.values())) / len(univ_cnpj)))
