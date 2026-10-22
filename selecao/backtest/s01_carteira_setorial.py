"""Carteira teórica setorial: 4 melhores ações de cada setor por fundamentos contábeis (dados da CVM até hoje).
Não financeiras: liquidez corrente, margem bruta, giro do ativo, renovação de ativos (capex / depreciação), CAGR de receita 5 anos.
Financeiras: Patrimônio/Ativo, margem líquida, ROE, CAGR de receita e CAGR de lucro 5 anos."""
import os, sys, io, zipfile, warnings
import numpy as np, pandas as pd, yaml
warnings.filterwarnings('ignore')
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI)); sys.path.insert(0, AQUI); sys.path.insert(0, os.path.join(RAIZ, 'coletor')); sys.path.insert(0, os.path.join(RAIZ, 'selecao'))
from manual_setores import NAO_ACAO
from soliduns_selecao.util import sem_acento
B, OUT = sys.argv[1], sys.argv[2]
sys.argv = [sys.argv[0], B]
import b06_fund_pit as F
HOJE = pd.Timestamp('2026-10-22')
st = yaml.safe_load(open(os.path.join(RAIZ, 'selecao', 'setores.yaml'), encoding='utf-8')
cfg = yaml.safe_load(open(os.path.join(RAIZ, 'selecao', 'parametros.yaml'), encoding='utf-8')
EXCL = set(cfg['universo']['grupos_excluidos'])
mapa = {sem_acento(k): v for k, v in st['mapa_cvm'].items()}
NOME = {k: v['nome'] for k, v in st['grupos'].items()} if 'grupos' in st else {}

# 1. universo: 200 ações mais negociadas (63 pregões), uma classe por empresa, volume médio >= R$ 5 milhões/dia
r = pd.read_parquet(f'{B}/retornos.parquet', columns=['data', 'ticker', 'volume', 'fech'])
r = r[~r['ticker'].str[:4].isin(NAO_ACAO)]
dias = sorted(r['data'].unique())[-63:]
w = r[r['data'].isin(dias)]
v = (w.groupby('ticker')['volume'].sum() / 63).sort_values(ascending=False)
v = v[~v.index.str[:4].duplicated()]
v = v[v >= 2e6].head(250)
ref = pd.read_pickle(f'{B}/ref.pkl')
U = pd.DataFrame({'ticker': v.index, 'vol_medio': v.values})
U['cnpj'] = U['ticker'].str[:4].map(ref['raiz'])
U = U.dropna(subset=['cnpj']).drop_duplicates('cnpj')
U['setor_cvm'] = U['cnpj'].map(ref['setor'])
def grupo(s):
    s2 = sem_acento(str(s or '').replace('Emp. Adm. Part. - ', '').strip())
    return mapa.get(s2, 'nao_mapeado')
U['grupo'] = U['setor_cvm'].map(grupo)
U = U[~U['grupo'].isin(EXCL)]

# 2. fundamentos na data (mesmas contas da plataforma)
dem, ind, cap = F.preparar(); F.init(dem, ind, cap)
fund = pd.DataFrame([x for x in (F.um((c, HOJE)) for c in U['cnpj']) if x])
U = U.merge(fund.drop(columns=['setor'], errors='ignore'), on='cnpj', how='inner')

# 3. capex e depreciação do último ano fechado (DFP 2025, DFC consolidado; individual se não houver)
def dfc(ano):
    z = zipfile.ZipFile(f'{B}/cvm/dfp_cia_aberta_{ano}.zip'); out = []
    for t in ('con', 'ind'):
        nm = [n for n in z.namelist() if f'DFC_MI_{t}' in n]
        if not nm: continue
        d = pd.read_csv(io.BytesIO(z.read(nm[0])), sep=';', encoding='latin1', dtype=str)
        d = d[d['ORDEM_EXERC'].str.contains('LTIMO', na=False)].copy()
        d['VERSAO'] = pd.to_numeric(d['VERSAO']); d = d[d['VERSAO'] == d.groupby('CNPJ_CIA')['VERSAO'].transform('max')]
        d['V'] = pd.to_numeric(d['VL_CONTA'], errors='coerce') * np.where(d['ESCALA_MOEDA'].str.upper().str.startswith('MIL'), 1000, 1)
        d['ds'] = d['DS_CONTA'].map(lambda s: sem_acento(str(s)).lower())
        capex = d[d['CD_CONTA'].str.startswith('6.02') & d['ds'].str.contains('imobilizado|intangive|ativo de contrato|ativos de contrato|propriedade para invest')
                  & ~d['ds'].str.contains('venda|recebimento|alienac|baixa') & (d['V'] < 0)]
        da = d[d['CD_CONTA'].str.startswith('6.01') & d['ds'].str.contains('deprecia|amortiza|exaust') & ~d['ds'].str.contains('emprestimo|financiamento|debenture|custo de transa|agio|desagio|premio')]
        k = pd.DataFrame({'capex': capex.groupby('CNPJ_CIA')['V'].sum().abs(), 'da': da.groupby('CNPJ_CIA')['V'].sum().abs()})
        k = k[(k['da'] > 0)]
        k['tipo'] = t; out.append(k)
    k = pd.concat(out); k = k[~k.index.duplicated()]   # consolidado primeiro
    return k
K = dfc(2025)
U = U.join(K[['capex', 'da']], on='cnpj')
U['renovacao'] = np.where(U['da'] > 0, U['capex'] / U['da'], np.nan)

# 4. indicadores
fin = U['grupo'].isin(['bancos', 'seguradoras']) | U['financeira'].fillna(False).astype(bool)
U['tipo'] = np.where(fin, 'financeira', 'nao_financeira')
U['liq_corrente'] = U['ativo_circ'] / U['passivo_circ']
U['margem_bruta'] = U['lucro_bruto_ttm'] / U['receita_ttm']
U['giro_ativo'] = U['receita_ttm'] / U['ativo_total']
U['cagr_receita'] = U['cagr_receitas'] / 100; U['cagr_lucro'] = U['cagr_lucros'] / 100
U['pl_ativo'] = U['patrimonio_liq'] / U['ativo_total']
U['margem_liq'] = U['lucro_liq_ttm'] / U['receita_ttm']
U['roe'] = U['lucro_liq_ttm'] / U['patrimonio_liq']
U['lucro_positivo'] = U['lucro_liq_ttm'] > 0
for c in ['margem_bruta', 'margem_liq', 'giro_ativo']: U[c] = U[c].replace([np.inf, -np.inf], np.nan)
U.loc[U['receita_ttm'] <= 0, ['margem_bruta', 'margem_liq', 'giro_ativo', 'cagr_receita']] = np.nan
U['so_holding'] = (~fin) & ~(U['receita_ttm'] > 0)
U = U[~U['ticker'].isin(['GOAU4', 'GOAU3'])]   # Metalúrgica Gerdau: controladora de Gerdau (GGBR4), mesmos números
IND_NF = ['liq_corrente', 'margem_bruta', 'giro_ativo', 'renovacao', 'cagr_receita']
IND_F = ['pl_ativo', 'margem_liq', 'roe', 'cagr_receita', 'cagr_lucro']

# 5. nota: média dos percentis dentro do setor (cada indicador com o mesmo peso; indicador ausente fica de fora da média)
E = U[U['lucro_positivo'] & (U['patrimonio_liq'] > 0) & ~U['so_holding']].copy()
partes = []
for g, x in E.groupby('grupo'):
    cols = IND_F if x['tipo'].iloc[0] == 'financeira' else IND_NF
    p = x[cols].rank(pct=True)
    x['nota'] = (p.mean(axis=1) * 100).round(1); x['n_ind'] = p.notna().sum(axis=1)
    partes.append(x.sort_values('nota', ascending=False).assign(pos=lambda d: range(1, len(d) + 1)))
E = pd.concat(partes)
E['nome_grupo'] = E['grupo'].map(lambda g: NOME.get(g, g))
cols = ['grupo', 'nome_grupo', 'pos', 'ticker', 'empresa', 'setor_cvm', 'nota', 'n_ind', 'liq_corrente', 'margem_bruta', 'giro_ativo', 'renovacao',
        'cagr_receita', 'pl_ativo', 'margem_liq', 'roe', 'cagr_lucro', 'receita_ttm', 'lucro_liq_ttm', 'dt_refer', 'vol_medio']
E[cols].to_pickle(f'{OUT}/carteira_setorial.pkl')
fora = U[~U.index.isin(E.index) | ~U['lucro_positivo']][['ticker', 'empresa', 'grupo', 'lucro_liq_ttm']]
fora.to_pickle(f'{OUT}/carteira_setorial_fora.pkl')
pd.set_option('display.width', 250)
print(U['grupo'].value_counts().to_string()); print('sem mapeamento:', U[U.grupo == 'nao_mapeado'][['ticker', 'setor_cvm']].values.tolist())
print('prejuízo/PL negativo:', U[~(U['lucro_positivo'] & (U['patrimonio_liq'] > 0))]['ticker'].tolist())
for g, x in E.groupby('grupo'):
    print('\n==', g); print(x[x.pos <= 6][['pos', 'ticker', 'empresa', 'nota'] + (IND_F if x.tipo.iloc[0] == 'financeira' else IND_NF)].round(3).to_string(index=False))
