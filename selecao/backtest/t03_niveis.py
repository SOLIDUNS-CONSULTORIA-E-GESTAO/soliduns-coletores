"""Níveis de entrada, stop e alvos no cenário de vitória da direita (Flávio Bolsonaro), por ação."""
import sys, json
import numpy as np, pandas as pd
from scipy.stats import norm
T = sys.argv[1]
tec = json.load(open(f'{T}/tecnica.json'))
# parâmetros do robô (parametros.yaml / setores.yaml)
KAPPA, KAPPA_C, M = 2.0, 1.5, 1.5
SET = {'bancos': dict(lam=1.30, eta=1.0), 'seguradoras': dict(lam=1.10, eta=-0.3), 'industria': dict(lam=0.90, eta=0.6)}
BASE = {'CXSE3': ('seguradoras', 0.1903, 0.0568), 'BBSE3': ('seguradoras', 0.1846, 0.0568), 'BBAS3': ('bancos', 0.2098, 0.0776),
        'BPAC11': ('bancos', 0.2188, 0.0776), 'POMO4': ('industria', 0.1967, 0.0772), 'B3SA3': ('bancos', 0.2176, 0.0776)}   # grupo, K_e, g do setor (robô, 01/10/2026)
# probabilidade de vitória da direita pelas pesquisas recentes (votos válidos), (4.1)-(4.2)
v = np.mean([0.51, 0.52, 46 / 90])          # Datafolha 15/10, Real Time Big Data 20/10, Quaest 14/10 (válidos)
pD = float(norm.cdf((v - 0.5) / 0.03))
DELTA = 0.0100                               # prêmio político entre cenários: 100 pb (hipótese, dentro de 20–300 pb do robô)
dcds = -(1 - pD) * DELTA                     # CDS cai o que ainda não está no preço
out = {'pD': pD, 'v': v, 'dcds_pb': dcds * 1e4}
for tk, (g, ke, gs) in BASE.items():
    s = SET[g]; t = tec[tk]; p = t['fech']
    dke = (KAPPA - 1 + s['lam'] * M) * dcds                 # (3.5)
    dg = -s['eta'] * KAPPA_C * dcds                          # Selic esperada cai → crescimento do setor
    up_fund = (ke - gs) / (ke + dke - (gs + dg)) - 1         # Gordon
    up_emp = t['ret_0510']                                   # reação ao 1º turno (choque de probabilidade parecido)
    up = 0.5 * up_fund + 0.5 * up_emp                        # (10.3) peso 0,5
    atr = t['atr14']
    ent_ideal = round(min(p, np.mean([t['s1'], t['mme9']])), 2)
    ent_max = round(p * 1.01, 2)
    stop = round(min(t['s2'], t['mme21']) - atr, 2)
    res = sorted([x for x in [t['r1'], t['r2'], t['max20'], t['max60'], t['max252'], t['max_hist'], t['ext']['1.272'], t['ext']['1.618'],
                              t['fib']['0.382'], t['fib']['0.5'], t['fib']['0.618'], t['bb_sup']] if x and x > p * 1.01])
    alvo1 = round(res[0], 2)
    alvo_c = p * (1 + up)
    acima = [x for x in res if x >= alvo_c * 0.98]
    alvo2 = round(max(alvo_c, alvo1) if not acima else min(acima, key=lambda x: abs(x - alvo_c)), 2)
    if alvo2 <= alvo1: alvo2 = round(max(res[1] if len(res) > 1 else alvo1, alvo_c), 2)
    out[tk] = dict(grupo=g, preco=p, up_fund=up_fund, up_emp=up_emp, up=up, ent_ideal=ent_ideal, ent_max=ent_max, stop=stop, alvo1=alvo1, alvo2=alvo2,
                   ganho1=alvo1 / ent_ideal - 1, ganho2=alvo2 / ent_ideal - 1, perda=stop / ent_ideal - 1,
                   rr2=(alvo2 - ent_ideal) / (ent_ideal - stop), resist=res[:6])
json.dump(out, open(f'{T}/niveis.json', 'w'), indent=1, default=float)
print('p_D', round(pD, 3), 'v', round(v, 4), 'dCDS pb', round(dcds * 1e4, 1))
for k, x in out.items():
    if isinstance(x, dict): print(k, {a: (round(b, 3) if isinstance(b, float) else ([round(c, 2) for c in b] if isinstance(b, list) else b)) for a, b in x.items()})
