"""Ações em circulação por empresa e ano, do FRE (capital integralizado) — usado no lugar do campo de ações do ITR,
que vem em milhares para parte das empresas. Saída: fre_acoes.pkl (cnpj, ano, dref, acoes)."""
import sys, zipfile, io
import pandas as pd
B = sys.argv[1]; out = []
for ano in range(2010, 2027):
    z = zipfile.ZipFile(f'{B}/cvm/fre_cia_aberta_{ano}.zip')
    d = pd.read_csv(io.BytesIO(z.read(f'fre_cia_aberta_capital_social_{ano}.csv')), sep=';', encoding='latin1', dtype=str)
    d = d[d['Tipo_Capital'].str.contains('Integralizado', na=False)].copy()
    d['acoes'] = pd.to_numeric(d['Quantidade_Total_Acoes'], errors='coerce'); d['Versao'] = pd.to_numeric(d['Versao'])
    d = d[d['acoes'] > 0].sort_values(['CNPJ_Companhia', 'Versao', 'Data_Autorizacao_Aprovacao'])
    d = d.groupby('CNPJ_Companhia').tail(1)
    out.append(pd.DataFrame({'cnpj': d['CNPJ_Companhia'], 'ano': ano, 'dref': d['Data_Referencia'], 'acoes': d['acoes'].astype('int64')}))
r = pd.concat(out, ignore_index=True)
if len(sys.argv) > 2 and sys.argv[2] == '--comparar':
    v = pd.read_pickle(f'{B}/fre_acoes.pkl'); m = v.merge(r, on=['cnpj', 'ano'], how='outer', indicator=True)
    print(len(v), len(r), m['_merge'].value_counts().to_dict(), 'iguais:', int((m.acoes_x == m.acoes_y).sum()))
else:
    r.to_pickle(f'{B}/fre_acoes.pkl'); print(len(r))
