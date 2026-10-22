"""Séries macro 2000–2026: Banco Central (SGS) e Ipeadata (EMBI+ Brasil)."""
import datetime as dt, json, sys, time
import pandas as pd, requests

OUT = sys.argv[1]
def sgs(serie, ini=2000, fim=2026, passo=4):
    partes = []
    for a in range(ini, fim + 1, passo + 1):
        b = min(a + passo, fim)
        url = (f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados?formato=json"
               f"&dataInicial=01/01/{a}&dataFinal=31/12/{b}")
        for t in range(2):
            try:
                r = requests.get(url, timeout=30); r.raise_for_status(); j = r.json(); partes += j if isinstance(j, list) else []; break
            except Exception as e:
                time.sleep(3 * (t + 1))
    s = pd.Series({pd.to_datetime(x['data'], dayfirst=True): float(str(x['valor']).replace(',', '.')) for x in partes if x.get('valor') not in (None, '', 'None')}).sort_index()
    return s[~s.index.duplicated()]

series = {'selic_meta': 432, 'cdi_dia': 12, 'ibov': 7, 'ipca_mes': 433, 'pib_ano': 7326, 'swap_pre_360': 7806, 'swap_pre_720': 7808}
import os
dados = pd.read_pickle(OUT) if os.path.exists(OUT) else {}
for nome, cod in series.items():
    if nome in dados and len(dados[nome]) > 0: continue
    try:
        dados[nome] = sgs(cod); pd.to_pickle(dados, OUT); print(nome, cod, len(dados[nome]), dados[nome].index.min().date(), dados[nome].index.max().date(), dados[nome].iloc[-1], flush=True)
    except Exception as e:
        print('falhou', nome, cod, e)
r = requests.get("http://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='JPM366_EMBI366')", timeout=120).json()['value']
embi = pd.Series({pd.to_datetime(x['VALDATA'][:10]): x['VALVALOR'] for x in r if x['VALVALOR'] is not None}).sort_index()
dados['embi'] = embi; print('embi', len(embi), embi.index.min().date(), embi.index.max().date())
pd.to_pickle(dados, OUT)
