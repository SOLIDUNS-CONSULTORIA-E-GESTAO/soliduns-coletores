"""Fundamentos da CVM com a DATA DE ENTREGA de cada documento (para o backtest não olhar o futuro).
Reaproveita as funções do coletor da plataforma (coletor/coletar_cvm.py)."""
import glob, os, re, sys, zipfile
import pandas as pd
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'coletor'))
import coletar_cvm as C

CVM = sys.argv[1]; OUT = sys.argv[2]
partes, entregas, capital = [], [], []
arquivos = sorted(glob.glob(os.path.join(CVM, 'dfp_cia_aberta_*.zip'))) + sorted(glob.glob(os.path.join(CVM, 'itr_cia_aberta_*.zip')))
for f in arquivos:
    doc = 'DFP' if 'dfp_' in f else 'ITR'
    z = open(f, 'rb').read()
    df = C.ler_demonstracoes(z, doc)
    cd = df['CD_CONTA'].astype(str)
    manter = ((df['DEMO'] == 'DRE')
              | (df['DEMO'] == 'DFC')
              | cd.isin(['1', '1.01', '1.01.01', '1.01.02'])
              | cd.str.match(r'^2\.0[1-9]'))
    df = df[manter][['CNPJ_CIA', 'DENOM_CIA', 'DT_REFER', 'VERSAO', 'DT_INI_EXERC', 'ORDEM_EXERC', 'CD_CONTA', 'DS',
                     'VALOR', 'ORDEM', 'DEMO', 'TIPO', 'DOCUMENTO']].copy()
    for c in ['CNPJ_CIA', 'DENOM_CIA', 'DT_REFER', 'DT_INI_EXERC', 'ORDEM_EXERC', 'CD_CONTA', 'DS', 'ORDEM', 'DEMO', 'TIPO', 'DOCUMENTO']:
        df[c] = df[c].astype('category')
    partes.append(df)
    entregas += C.ler_entregas(z, doc)
    cap = C.ler_csv_zip(z, r"composicao_capital_\d{4}\.csv$")
    if cap is not None and not cap.empty:
        cc = {k: C.col(cap, *v) for k, v in {'cnpj': ('cnpj',), 'ref': ('dt_refer',), 'ver': ('versao',), 'on': ('ordin', 'integr'),
              'pn': ('pref', 'integr'), 'tot': ('total', 'integr'), 'ont': ('ordin', 'tesour'), 'pnt': ('pref', 'tesour'), 'tott': ('total', 'tesour')}.items()}
        num = lambda c: pd.to_numeric(cap[c].astype(str).str.replace(',', '.'), errors='coerce').fillna(0) if c else 0
        d = pd.DataFrame({'cnpj': cap[cc['cnpj']], 'dt_refer': cap[cc['ref']], 'documento': doc,
                          'acoes': (num(cc['on']) + num(cc['pn']) - num(cc['ont']) - num(cc['pnt'])) if cc['on'] else (num(cc['tot']) - num(cc['tott']))})
        capital.append(d)
    print(os.path.basename(f), len(df), flush=True)
dem = pd.concat(partes, ignore_index=True)
for c in ['CNPJ_CIA', 'DENOM_CIA', 'DT_REFER', 'DT_INI_EXERC', 'ORDEM_EXERC', 'CD_CONTA', 'DS', 'ORDEM', 'DEMO', 'TIPO', 'DOCUMENTO']:
    dem[c] = dem[c].astype(str).astype('category')
ent = pd.DataFrame(entregas).drop_duplicates(['cnpj', 'documento', 'dt_refer'])
cap = pd.concat(capital, ignore_index=True)
pd.to_pickle({'dem': dem, 'entregas': ent, 'capital': cap}, OUT)
print('demonstrações', len(dem), 'entregas', len(ent), 'capital', len(cap), 'memória MB', round(dem.memory_usage(deep=True).sum() / 1e6))
