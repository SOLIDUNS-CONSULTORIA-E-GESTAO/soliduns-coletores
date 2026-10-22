"""Retorno total diário aproximado por ação (2000–2026), só com o COTAHIST.
Regra: nos dias em que o número de distribuição (DISMES) muda há um evento (dividendo, JCP, bonificação, desdobramento,
grupamento, subscrição). A queda "mecânica" do preço nesse dia é compensada ao acionista (em dinheiro ou em ações).
Nesses dias o retorno da ação é substituído pelo retorno mediano do mercado no mesmo pregão (sem viés em média)."""
import re, sys
import numpy as np, pandas as pd

P = sys.argv[1]; OUT = sys.argv[2]
p = pd.read_parquet(P)
p = p[p['ticker'].str.match(r'^[A-Z][A-Z0-9]{3}(3|4|5|6|7|8|11)$') | (p['ticker'] == 'BOVA11')].copy()
p = p[p['fech'] > 0].sort_values(['ticker', 'data'])
g = p.groupby('ticker')
p['r_bruto'] = g['fech'].pct_change()
p['evento'] = g['dismes'].diff().fillna(0).ne(0)
p['dias'] = g['data'].diff().dt.days
# retorno de mercado do dia: mediana das 150 ações mais negociadas do dia, sem evento
p['rank_vol'] = p.groupby('data')['volume'].rank(ascending=False)
base = p[(p['rank_vol'] <= 150) & ~p['evento'] & p['r_bruto'].abs().lt(0.3) & (p['dias'] <= 5)]
mercado = base.groupby('data')['r_bruto'].median()
p['r_merc'] = p['data'].map(mercado).fillna(0.0)
# Regra (revisada após conferência): só se neutraliza o que é mecânico.
#  - dia com evento registrado (DISMES mudou): variação mecânica (provento, bonificação, desdobramento, grupamento)
#    -> retorno do mercado no dia. Queda real exatamente na data "ex" é rara; os casos grandes conferidos eram
#    desdobramentos (MGLU3 1:8 em 2017 e 2019, ALPA4 1:20, OGXP3 1:100...).
#  - SEM evento registrado: só é desdobramento/grupamento se a razão de preços bater com uma proporção típica
#    (1:2 ... 1:100 ou o inverso) com tolerância de 3%. Fora disso, é retorno REAL (ex.: Americanas, 12/01/2023, -77%).
#  - pregões depois de suspensão longa: retorno do período (mesma regra de desdobramento).
razao = 1 + p['r_bruto']
fat = np.array([2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50, 100], dtype=float)
cand = np.concatenate([fat, 1 / fat])
lr = np.log(razao.clip(lower=1e-9).values)[:, None]
dist = np.abs(lr - np.log(cand)[None, :]).min(axis=1)
tol = np.log(1.04)
desdob = (np.abs(lr[:, 0]) > np.log(1.3)) & (dist <= tol)
pequeno_evt = p['evento'] & p['r_bruto'].abs().le(0.25)
desdob = desdob & ~p['evento'].values
p['r'] = np.where(p['evento'] | desdob, p['r_merc'], p['r_bruto'])
sem_evt = pd.Series(desdob, index=p.index)
p['seg'] = p['especi'].str.extract(r'\b(NM|N1|N2|MA|M2)\b', expand=False).fillna('')
p['desdob'] = desdob
p = p.drop(columns=['rank_vol', 'dias'])
p.to_parquet(OUT, index=False)
ev = p.groupby(p['data'].dt.year)['evento'].mean()
print('linhas', len(p), 'tickers', p['ticker'].nunique(), 'saltos neutralizados sem evento', int(sem_evt.sum()))
# conferência: proventos implícitos por ano (eventos moderados) nas 60 mais líquidas
q = p[p['evento'] & p['r_bruto'].abs().lt(0.25)].copy()
q['provento'] = q['r_merc'] - q['r_bruto']
q['ano'] = q['data'].dt.year
liq = p.groupby([p['data'].dt.year, 'ticker'])['volume'].sum().groupby(level=0, group_keys=False).nlargest(60)
top = set(liq.index)
q = q[[(a, t) in top for a, t in zip(q['ano'], q['ticker'])]]
dy = q.groupby(['ano', 'ticker'])['provento'].sum().groupby(level=0).median()
print('rendimento implícito mediano dos eventos (60 mais líquidas):'); print((dy * 100).round(1).to_string())
