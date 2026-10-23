"""Testes do Alvos SOLIDUNS (alvos.py): ajuste de desdobramento, indicadores e níveis."""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from soliduns_selecao import alvos as A   # noqa: E402


def serie(n=300, ini=10.0, passo=0.01, seed=1):
    rng = np.random.default_rng(seed)
    c = ini * np.cumprod(1 + passo / 10 + rng.normal(0, 0.01, n))
    d = pd.bdate_range('2025-01-02', periods=n)
    return pd.DataFrame({'max': c * 1.01, 'min': c * 0.99, 'fech': c, 'volume': 1e7}, index=d)


def test_desdobramento_2_para_1():
    x = serie()
    x.iloc[200:, :3] /= 2                      # desdobramento 1:2 no pregão 200
    aj, ev = A.ajustar_desdobramentos(x)
    assert len(ev) == 1 and ev[0][1] == 0.5
    assert abs(aj['fech'].iloc[199] / aj['fech'].iloc[200] - 1) < 0.05


def test_queda_forte_nao_e_desdobramento():
    x = serie()
    x.iloc[200:, :3] *= 0.62                   # queda de 38%: não bate com razão redonda
    _, ev = A.ajustar_desdobramentos(x)
    assert ev == []


def test_niveis_em_ordem():
    t = A.indicadores(serie(passo=0.02))
    n = A.niveis(t, 0.05)
    assert n['stop'] < n['ent_ideal'] <= t['preco'] < n['alvo1'] <= n['alvo2_d']
    assert n['alvo1'] <= n['alvo2_n']
    assert n['perda'] < 0 < n['ganho_d']
    assert len(t['serie']) == 160 and len(t['serie'][0]) == 5


def test_alvo2_acompanha_cenario():
    t = A.indicadores(serie(passo=0.02))
    baixo, alto = A.niveis(t, 0.01), A.niveis(t, 0.20)
    assert alto['alvo2_d'] >= baixo['alvo2_d']
