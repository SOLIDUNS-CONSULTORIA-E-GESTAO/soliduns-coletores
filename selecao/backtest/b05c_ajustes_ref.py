"""Completa ref.pkl com as raízes manuais (RAIZ_MANUAL) e o setor do cadastro da CVM dessas empresas. Idempotente."""
import os, sys
import pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from manual_setores import RAIZ_MANUAL
B = sys.argv[1]
ref = pd.read_pickle(f'{B}/ref.pkl')
cad = pd.read_csv(f'{B}/cvm/cad_cia_aberta.csv', sep=';', encoding='latin1', dtype=str)
for r, c in RAIZ_MANUAL.items():
    ref['raiz'].setdefault(r, c)
    if c not in ref['setor']:
        s = cad.loc[cad['CNPJ_CIA'] == c, 'SETOR_ATIV'].dropna()
        if len(s): ref['setor'][c] = s.iloc[0]
pd.to_pickle(ref, f'{B}/ref.pkl')
print({r: (ref['raiz'][r], ref['setor'].get(ref['raiz'][r])) for r in RAIZ_MANUAL})
