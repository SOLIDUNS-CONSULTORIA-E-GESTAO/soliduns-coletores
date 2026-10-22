"""Confere as fórmulas do robô contra os exemplos numéricos do compêndio.
Rodar a partir da pasta 'selecao':  python -m pytest testes   (ou: python testes/test_formulas.py)"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from soliduns_selecao import formulas as F    # noqa: E402

perto = lambda a, b, tol=1e-3: abs(a - b) < tol


def test_exemplo_3_7_custo_de_capital():
    # CDS 1,10%; Y10 13,5%; ERP 4,5%; m 1,5; β 1; λ 1 -> CRP 1,65%; Rf 12,40%; Ke 18,55%
    assert perto(F.crp(0.011, 1.5), 0.0165)
    assert perto(F.rf_brl(0.135, 0.011), 0.124)
    assert perto(F.custo_capital(0.135, 0.011, 1.0, 0.045, 1.0, 1.5), 0.1855)
    assert perto(F.multiplicador(2.0, 1.0, 1.5), 2.5)
    assert perto(F.multiplicador(2.0, 0.4, 1.5), 1.6)


def test_exemplo_4_6_cenarios():
    p = F.prob_d(0.51, 0.03)
    assert perto(p, 0.6306, 1e-4)
    cds_d, cds_e = F.cds_cenarios(0.011, 0.63, 0.008)
    assert perto(cds_d * 1e4, 80.4, 0.01) and perto(cds_e * 1e4, 160.4, 0.01)
    assert perto(F.ke_cenario(0.1855, 2.0, 1.0, 1.5, cds_d - 0.011), 0.1781)
    assert perto(F.ke_cenario(0.1855, 2.0, 1.0, 1.5, cds_e - 0.011), 0.1981)
    sd, se = F.choque_empirico(0.20, 0.63)
    assert perto(sd, 0.074) and perto(se, -0.126)


def test_exemplo_8_4_valor():
    pl_d = F.pl_justo(0.6, 0.085, 0.1781)
    pl_e = F.pl_justo(0.6, 0.075, 0.1981)
    assert perto(pl_d, 6.99, 0.01) and perto(pl_e, 5.24, 0.01)
    u_d, u_e = F.potencial(pl_d, 6.0), F.potencial(pl_e, 6.0)
    assert perto(u_d, 0.165, 1e-3) and perto(u_e, -0.127, 1e-3)
    assert perto(F.potencial_esperado(0.63, u_d, u_e), 0.057, 1e-3)
    assert perto(F.pior_caso(u_d, u_e), u_e)


def test_leitura_em_taxa_e_choques():
    # (8.6) e (8.7): φ 0,6; g 8,5%; P/L 6 -> R = 19,35%; X = R − 17,81% = 1,54 p.p.
    r = F.retorno_implicito(0.6, 0.085, 6.0)
    assert perto(r, 0.1935) and perto(F.excesso(r, 0.1781), 0.0154)
    # (10.2) e (10.3)
    assert perto(F.choque_fundamental(5.24, 6.0), -0.1267)
    assert perto(F.choque_combinado(-0.126, -0.1267, 0.5), -0.12635, 1e-5)
    # (4.8): γ_m 0,25; K_e 18,55%; g 5,6%; κ 2; m 1,5 -> Δ = 0,25 × 0,1295 / 2,5 = 1,295%
    assert perto(F.delta_implicito(0.25, 0.1855, 0.056, 2.0, 1.5), 0.01295, 1e-5)


def test_exemplo_9_4_escore():
    pesos = {"a": 0.25, "b": 0.20, "c": 0.20, "d": 0.20, "e": 0.15}
    z = {"a": 1.2, "b": 0.8, "c": 0.5, "d": 1.0, "e": 0.3}
    assert perto(F.escore(z, pesos), 0.805)
    z = {"a": 1.5, "b": -1.2, "c": 0.9, "d": -0.4, "e": 0.6}
    assert perto(F.escore(z, pesos), 0.325)


def test_crescimento_e_media_de_pesquisas():
    assert perto(F.crescimento_empresa(0.085, 0.20, 0.6), 0.08)
    assert perto(F.media_pesquisas([2000, 1000], [0.50, 0.53]), 0.51)
    assert perto(F.crescimento_setor(0.043, 0.013, 1.6, 0.9, 0.12, 0.12), 0.0638)


if __name__ == "__main__":
    for nome, f in list(globals().items()):
        if nome.startswith("test_"):
            f()
            print("ok ", nome)
