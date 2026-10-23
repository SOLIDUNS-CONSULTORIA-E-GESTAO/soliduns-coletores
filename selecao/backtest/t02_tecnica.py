"""Indicadores técnicos e níveis de preço para uma lista de ações; maiores altas de um pregão."""
import sys, json
import numpy as np, pandas as pd
T = sys.argv[1]; TK = sys.argv[2].split(','); DIA = sys.argv[3]
d = pd.read_parquet(f'{T}/ohlc.parquet').sort_values('data')
out = {}
for tk in TK:
    x = d[d.ticker == tk].set_index('data')[['abe', 'max', 'min', 'fech', 'volume']].copy()
    if len(x) < 130 or x.index[-1] < d.data.max(): continue
    c, h, l = x.fech, x['max'], x['min']
    for n in (9, 21, 50, 200): x[f'mme{n}'] = c.ewm(span=n, adjust=False).mean()
    x['mm200'] = c.rolling(200).mean()
    dl = c.diff(); up = dl.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean(); dn = (-dl.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    x['ifr14'] = 100 - 100 / (1 + up / dn)
    x['macd'] = c.ewm(span=12, adjust=False).mean() - c.ewm(span=26, adjust=False).mean(); x['sinal'] = x.macd.ewm(span=9, adjust=False).mean()
    m20, s20 = c.rolling(20).mean(), c.rolling(20).std(); x['bb_sup'], x['bb_inf'] = m20 + 2 * s20, m20 - 2 * s20
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1); x['atr14'] = tr.ewm(alpha=1 / 14, adjust=False).mean()
    ll, hh = l.rolling(14).min(), h.rolling(14).max(); x['estoc_k'] = 100 * (c - ll) / (hh - ll); x['estoc_d'] = x.estoc_k.rolling(3).mean()
    # ADX
    pdm = (h.diff()).where((h.diff() > -l.diff()) & (h.diff() > 0), 0.0); ndm = (-l.diff()).where((-l.diff() > h.diff()) & (-l.diff() > 0), 0.0)
    atr = tr.ewm(alpha=1 / 14, adjust=False).mean(); pdi = 100 * pdm.ewm(alpha=1 / 14, adjust=False).mean() / atr; ndi = 100 * ndm.ewm(alpha=1 / 14, adjust=False).mean() / atr
    x['adx'] = (100 * (pdi - ndi).abs() / (pdi + ndi)).ewm(alpha=1 / 14, adjust=False).mean(); x['di_mais'], x['di_menos'] = pdi, ndi
    x['obv'] = (np.sign(c.diff()).fillna(0) * x.volume).cumsum()
    u = x.iloc[-1]
    # suportes e resistências: mínimas/máximas de 20, 60 e 252 pregões; pivôs semanais; Fibonacci do último movimento de 120 pregões
    w = x.iloc[-120:]; lo, hi = w['min'].min(), w['max'].max(); dlo, dhi = w['min'].idxmin(), w['max'].idxmax()
    fib = {k: (hi - (hi - lo) * k if dhi > dlo else lo + (hi - lo) * k) for k in (0.236, 0.382, 0.5, 0.618)}
    ext = {k: (lo + (hi - lo) * k if dhi > dlo else None) for k in (1.272, 1.618)}
    ult5 = x.iloc[-5:]; P = (ult5['max'].max() + ult5['min'].min() + u.fech) / 3
    out[tk] = dict(data=str(x.index[-1].date()), fech=u.fech, **{k: float(u[k]) for k in ['mme9', 'mme21', 'mme50', 'mme200', 'mm200', 'ifr14', 'macd', 'sinal', 'bb_sup', 'bb_inf',
                   'atr14', 'estoc_k', 'estoc_d', 'adx', 'di_mais', 'di_menos']},
                   obv_tend=float(np.polyfit(range(20), x.obv.iloc[-20:].values, 1)[0] / x.volume.iloc[-20:].mean()),
                   vol_rel=float(x.volume.iloc[-5:].mean() / x.volume.iloc[-60:].mean()),
                   min20=float(x['min'].iloc[-20:].min()), max20=float(x['max'].iloc[-20:].max()), min60=float(x['min'].iloc[-60:].min()),
                   max60=float(x['max'].iloc[-60:].max()), min252=float(x['min'].iloc[-252:].min()), max252=float(x['max'].iloc[-252:].max()),
                   max_hist=float(x['max'].max()), swing_lo=float(lo), swing_hi=float(hi), swing_lo_d=str(dlo.date()), swing_hi_d=str(dhi.date()),
                   fib={str(k): float(v) for k, v in fib.items()}, ext={str(k): (float(v) if v else None) for k, v in ext.items()},
                   pivo=float(P), r1=float(2 * P - ult5['min'].min()), s1=float(2 * P - ult5['max'].max()),
                   r2=float(P + ult5['max'].max() - ult5['min'].min()), s2=float(P - (ult5['max'].max() - ult5['min'].min())),
                   ret_5d=float(c.iloc[-1] / c.iloc[-6] - 1), ret_21d=float(c.iloc[-1] / c.iloc[-22] - 1), ret_ano=(float(c.iloc[-1] / c[c.index < '2026-01-01'].iloc[-1] - 1) if (c.index < '2026-01-01').any() else None),
                   ret_0510=float(c.loc[DIA] / c[c.index < DIA].iloc[-1] - 1) if pd.Timestamp(DIA) in c.index else None)
json.dump(out, open(f'{T}/tecnica.json', 'w'), indent=1, default=float)
for k, v in out.items():
    print(k, {a: (round(b, 2) if isinstance(b, float) else b) for a, b in v.items() if a not in ('fib', 'ext')}); print('  fib', {a: round(b, 2) for a, b in v['fib'].items()}, 'ext', v['ext'])
# maiores altas do dia
prev = d[d.data < DIA].data.max()
a = d[d.data == DIA].set_index('ticker'); b = d[d.data == prev].set_index('ticker')
r = (a.fech / b.fech - 1).dropna(); vol = a.volume
liq = d[(d.data < DIA) & (d.data >= pd.Timestamp(DIA) - pd.Timedelta(days=95))].groupby('ticker').volume.mean()
R = pd.DataFrame({'ret': r, 'vol_dia': vol, 'vol_medio': liq, 'nome': a.nome, 'fech': a.fech, 'ant': b.fech}).dropna(subset=['ret'])
R = R[(R.vol_medio >= 5e6) & (~R.index.str.startswith(('BOVA', 'IBOV')))].sort_values('ret', ascending=False)
R.to_pickle(f'{T}/altas_dia.pkl')
print(prev.date(), '->', DIA, len(R)); print(R.head(30).round(3).to_string())
bova = d[(d.ticker == 'BOVA11') & d.data.isin([prev, pd.Timestamp(DIA)])].fech.values; print('BOVA11', bova[1] / bova[0] - 1)
