"""Prepara K_e e g de TODAS as ações líquidas da B3 (formato de bt_rankings) para a varredura de alvo 2.
K_e = Rf + beta·ERP + lambda·CRP (3.3), com beta semanal de 2 anos contra o BOVA11; g = IPCA + eps·PIB (5.1)."""
import sys, os, re
import numpy as np, pandas as pd, yaml
sys.path.insert(0, '/home/claude/soliduns-coletores/selecao')
from soliduns_selecao.util import sem_acento
B, T = sys.argv[1], sys.argv[2]
cfg = yaml.safe_load(open('/home/claude/soliduns-coletores/selecao/parametros.yaml', encoding='utf-8'))
st = yaml.safe_load(open('/home/claude/soliduns-coletores/selecao/setores.yaml', encoding='utf-8'))
rb, mc = cfg['risco_brasil'], cfg['macro']
CDS = rb['cds_5a_pb'] / 1e4; RF = rb['y10'] / 100 - CDS; ERP = rb['erp_maduro'] / 100; CRP = CDS * rb['m']
mapa = {sem_acento(k): v for k, v in st['mapa_cvm'].items()}
ohlc = pd.read_parquet(f'{T}/ohlc.parquet')
dias = sorted(ohlc.data.unique())[-63:]
v = ohlc[ohlc.data.isin(dias)].groupby('ticker').volume.sum() / 63
v = v[v.index.str.match(r'^[A-Z][A-Z0-9]{3}(3|4|5|6|11)$') & (v.index.str[:4].str.count(r'[A-Z]') >= 3)].sort_values(ascending=False)
v = v[~v.index.str[:4].isin(['IBOV', 'BOVA', 'SMAL', 'IVVB'])]
v = v[~v.index.str[:4].duplicated()]
v = v[v >= 2e6]
ref = pd.read_pickle(f'{B}/ref.pkl')
ret = pd.read_parquet(f'{B}/retornos.parquet', columns=['data', 'ticker', 'r'])
ret = ret[ret.data >= ret.data.max() - pd.Timedelta(days=730)]
R = ret.pivot(index='data', columns='ticker', values='r')
semana = lambda s: (1 + s.fillna(0)).resample('W-FRI').prod() - 1
mk = semana(R['BOVA11'])
rows = []
for tk, vol in v.items():
    cnpj = ref['raiz'].get(tk[:4]); setor = ref['setor'].get(cnpj) if cnpj else None
    grupo = mapa.get(sem_acento(str(setor or '').replace('Emp. Adm. Part. - ', '').strip()), 'nao_mapeado') if setor else 'sem_cadastro'
    gp = st['grupos'].get(grupo, st['grupos']['industria'])
    if tk not in R or R[tk].notna().sum() < 120: beta = np.nan
    else:
        s = semana(R[tk]); d = pd.concat([s, mk], axis=1).dropna(); d = d[(d.iloc[:, 0] != 0)]
        beta = float(np.cov(d.iloc[:, 0], d.iloc[:, 1])[0, 1] / d.iloc[:, 1].var()) if len(d) > 40 else np.nan
    b = float(np.clip(beta, 0.4, 2.0)) if np.isfinite(beta) else 1.0
    lam = gp['lambda']
    ke = RF + b * ERP + lam * CRP
    g = mc['ipca'] / 100 + gp['eps'] * mc['pib'] / 100
    rows.append(dict(data=pd.Timestamp('2026-10-21'), ticker=tk, grupo=grupo if grupo in st['grupos'] else 'industria', grupo_orig=grupo, setor=setor,
                     cnpj=cnpj, beta=b, beta_estimado=np.isfinite(beta), ke=ke, g_setor=g, vol_medio=vol))
U = pd.DataFrame(rows)
U.to_pickle(f'{T}/universo_b3.pkl')
open(f'{T}/lista.txt', 'w').write(','.join(U.ticker))
print(len(U), 'ações; sem cadastro/mapa:', (U.grupo_orig.isin(['sem_cadastro', 'nao_mapeado'])).sum(), '; Rf', round(RF, 4), 'CRP', round(CRP, 4))
print(U.grupo_orig.value_counts().to_string())
