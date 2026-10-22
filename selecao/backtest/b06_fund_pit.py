"""Fundamentos 'point-in-time': em cada data de rebalanceamento, só documentos entregues à CVM ANTES da data.
Usa coletar_cvm.montar_empresa / historico_anual (as mesmas contas da plataforma). Grava uma tabela por data (retoma)."""
import os, sys, warnings
from multiprocessing import Pool
import numpy as np, pandas as pd
warnings.filterwarnings('ignore')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'coletor')); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import coletar_cvm as C
C.DIAG_TICKERS = set()
C.log = lambda *a: None

B = sys.argv[1]; LIMITE_S = float(sys.argv[2]) if len(sys.argv) > 2 else 540
OUTD = os.path.join(B, 'fund'); os.makedirs(OUTD, exist_ok=True)
G = {}

def preparar():
    cvm = pd.read_pickle(os.path.join(B, 'cvm.pkl'))
    dem, ent, cap = cvm['dem'], cvm['entregas'], cvm['capital']
    dem = dem.astype({c: 'object' for c in dem.select_dtypes('category').columns})
    ent['dt_receb'] = pd.to_datetime(ent['dt_receb'])
    k = ent.set_index(['cnpj', 'documento', 'dt_refer'])['dt_receb']
    dem['RECEB'] = pd.MultiIndex.from_arrays([dem['CNPJ_CIA'], dem['DOCUMENTO'], dem['DT_REFER']]).map(k)
    dem = dem.dropna(subset=['RECEB'])
    dem['REF'] = pd.to_datetime(dem['DT_REFER'], errors='coerce')
    dem = C.ultima_versao(dem, ['CNPJ_CIA', 'DT_REFER', 'DOCUMENTO', 'DEMO'])
    ind = dem[(dem['DEMO'] == 'DFC') & (dem['TIPO'] == 'ind')]
    tem_con = dem[dem['TIPO'] == 'con'].groupby(['CNPJ_CIA', 'DT_REFER', 'DOCUMENTO']).size()
    chave = pd.MultiIndex.from_arrays([dem['CNPJ_CIA'], dem['DT_REFER'], dem['DOCUMENTO']])
    usa_con = chave.isin(tem_con.index)
    dem = dem[(dem['TIPO'] == 'con') == usa_con]
    cap['receb'] = pd.MultiIndex.from_arrays([cap['cnpj'], cap['documento'], cap['dt_refer']]).map(k)
    cap = cap.dropna(subset=['receb'])
    return {c: g for c, g in dem.groupby('CNPJ_CIA')}, {c: g for c, g in ind.groupby('CNPJ_CIA')}, cap

def um(args):
    cnpj, D = args
    g = G['dem'].get(cnpj)
    if g is None: return None
    g = g[g['RECEB'] < D]
    if g.empty: return None
    ind = G['ind'].get(cnpj); ind = ind[ind['RECEB'] < D] if ind is not None else None
    try:
        hist = []
        linhas = C.montar_empresa(cnpj, g, {cnpj: ['XXXX3']}, {}, {}, ind, hist)
    except Exception as e:
        return None
    if not linhas: return None
    r = dict(linhas[0]); r.pop('ticker', None)
    mb = [(h['ano'], h['lucro_bruto'] / h['receita']) for h in hist if h.get('receita') and h.get('lucro_bruto') is not None and h['receita'] > 0]
    r['mb_hist'] = [m for _, m in sorted(mb)[-5:]]
    c = G['cap'][(G['cap']['cnpj'] == cnpj) & (G['cap']['receb'] < D)]
    r['acoes'] = float(c.sort_values(['dt_refer', 'receb'])['acoes'].iloc[-1]) if len(c) else np.nan
    r['cnpj'] = cnpj; r['data'] = D
    return r

def init(dem, ind, cap):
    G['dem'], G['ind'], G['cap'] = dem, ind, cap

if __name__ == '__main__':
    import time; t0 = time.time()
    datas = pd.read_pickle(os.path.join(B, 'datas_universo.pkl'))   # {data: [cnpjs]}
    pend = [d for d in sorted(datas) if not os.path.exists(os.path.join(OUTD, d.strftime('%Y-%m-%d') + '.pkl'))]
    if not pend: print('nada pendente'); sys.exit()
    dem, ind, cap = preparar(); print('preparado em', round(time.time() - t0), 's', flush=True)
    init(dem, ind, cap)
    with Pool(2, initializer=init, initargs=(dem, ind, cap)) as pool:
        for D in pend:
            if time.time() - t0 > LIMITE_S: print('pausa por tempo; rode de novo'); break
            res = [r for r in pool.map(um, [(c, D) for c in datas[D]], chunksize=4) if r]
            pd.to_pickle(pd.DataFrame(res), os.path.join(OUTD, D.strftime('%Y-%m-%d') + '.pkl'))
            print(D.date(), len(datas[D]), '->', len(res), round(time.time() - t0), 's', flush=True)
