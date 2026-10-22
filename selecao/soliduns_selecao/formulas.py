"""Fórmulas do compêndio, uma função por fórmula (taxas em fração: 0.1355 = 13,55%).
O número entre parênteses é o da fórmula no compêndio."""
import numpy as np
from scipy.stats import norm


# ---------------------------------------------------------- capítulo 3
def crp(cds, m):
    """(3.1) prêmio de risco país para ações = CDS × m."""
    return cds * m


def rf_brl(y10, cds):
    """(3.2) taxa livre de risco em reais = Y10 − CDS."""
    return y10 - cds


def custo_capital(y10, cds, beta, erp_m, lam, m):
    """(3.3) K_e = R_f^BRL + β·ERP_m + λ·CRP."""
    return rf_brl(y10, cds) + beta * erp_m + lam * crp(cds, m)


def multiplicador(kappa, lam, m):
    """(3.6) termo entre parênteses: κ − 1 + λ·m."""
    return kappa - 1 + lam * m


def ke_cenario(ke0, kappa, lam, m, delta_cds):
    """(3.6) K_e no cenário = K_e atual + (κ − 1 + λ·m)·ΔCDS."""
    return ke0 + multiplicador(kappa, lam, m) * delta_cds


# ---------------------------------------------------------- capítulo 4
def media_pesquisas(amostras, votos_d):
    """(4.1) média das pesquisas ponderada pela amostra."""
    a = np.asarray(amostras, float)
    return float(np.sum(a * np.asarray(votos_d, float)) / np.sum(a))


def prob_d(v_d, sigma_v):
    """(4.2) p_D = Φ((v̄_D − 0,5) / σ_v)."""
    return float(norm.cdf((v_d - 0.5) / sigma_v))


def cds_cenarios(cds0, p_d, delta):
    """(4.5) CDS_D = CDS_0 − (1 − p_D)·Δ ; CDS_E = CDS_0 + p_D·Δ."""
    return cds0 - (1 - p_d) * delta, cds0 + p_d * delta


def choque_empirico(gamma, p_d):
    """(4.7) choque_D = γ·(1 − p_D) ; choque_E = −γ·p_D."""
    return gamma * (1 - p_d), -gamma * p_d


def delta_implicito(gamma_m, ke_m, g_m, kappa, m):
    """(4.8) Δ implícito na bolsa = γ_mercado·(K_e − g)/(κ − 1 + m) (ação média)."""
    return gamma_m * (ke_m - g_m) / multiplicador(kappa, 1.0, m)


# ---------------------------------------------------------- capítulo 5
def crescimento_setor(ipca, pib, eps, eta, selic_s, selic_base):
    """(5.1) g_{k,s} = π_s + ε_k·g^PIB_s − η_k·(Selic_s − Selic_base), em fração."""
    return ipca + eps * pib - eta * (selic_s - selic_base)


# ---------------------------------------------------------- capítulo 6 e 7
def igov(notas, pesos):
    """(6.1) IGov = Σ ω_j · c_ij (notas de 0 a 100)."""
    return sum(pesos[k] * notas[k] for k in pesos)


def margem_bruta(receita, custo_ou_lucro_bruto, e_lucro_bruto=True):
    """(7.1) MB = (RL − CPV) / RL. Aceita o lucro bruto já calculado."""
    if not receita:
        return np.nan
    lb = custo_ou_lucro_bruto if e_lucro_bruto else receita - custo_ou_lucro_bruto
    return lb / receita


# ---------------------------------------------------------- capítulo 8
def crescimento_empresa(g_setor, roe, payout):
    """(8.1) g_i = min{ g_setor ; ROE·(1 − φ) }."""
    return min(g_setor, roe * (1 - payout))


def pl_justo(payout, g, ke, spread_minimo=0.03):
    """(8.2) (P/L)* = φ·(1 + g) / (K_e − g), com K_e − g de pelo menos `spread_minimo`."""
    return payout * (1 + g) / max(ke - g, spread_minimo)


def potencial(pl_j, pl_atual):
    """(8.3) U = (P/L)* / (P/L) − 1."""
    return pl_j / pl_atual - 1


def potencial_esperado(p_d, u_d, u_e):
    """(8.4) E[U] = p_D·U_D + (1 − p_D)·U_E."""
    return p_d * u_d + (1 - p_d) * u_e


def pior_caso(u_d, u_e):
    """(8.5) U_min = min{U_D ; U_E}."""
    return min(u_d, u_e)


def retorno_implicito(payout, g, pl):
    """(8.6) R = φ·(1 + g)/(P/L) + g: taxa de retorno embutida no preço de hoje."""
    return payout * (1 + g) / pl + g


def excesso(ret, ke):
    """(8.7) X = R − K_e: quanto o preço paga acima (ou abaixo) do custo de capital."""
    return ret - ke


# ---------------------------------------------------------- capítulo 9 e 10
def padronizar(x, winsor=(0.025, 0.975)):
    """(9.1) z = (x̃ − média) / desvio, com corte nos percentis."""
    import pandas as pd
    s = pd.Series(x, dtype=float)
    lo, hi = s.quantile(winsor[0]), s.quantile(winsor[1])
    s = s.clip(lo, hi)
    dp = s.std(ddof=0)
    return (s - s.mean()) / dp if dp and dp > 0 else s * 0.0


def escore(z_por_fator, pesos):
    """(9.2) S = Σ W_k · z_k."""
    return sum(pesos[k] * z_por_fator[k] for k in pesos)


def pesos_brutos(s, sigma):
    """(10.1) w_i = (S_i⁺/σ_i) / Σ (S_j⁺/σ_j).
    S⁺ desloca o menor escore para um valor positivo."""
    s = np.asarray(s, float)
    sigma = np.asarray(sigma, float)
    s_mais = s - s.min() + 0.1 * (np.std(s) if np.std(s) > 0 else 1.0)
    w = s_mais / sigma
    return w / w.sum()


def choque_fundamental(pl_justo_s, pl_justo_0):
    """(10.2) choque fundamental = (P/L)*_s / (P/L)*_0 − 1."""
    return pl_justo_s / pl_justo_0 - 1


def choque_combinado(choque_emp, choque_fund, peso_empirico):
    """(10.3) choque = w_e·choque empírico + (1 − w_e)·choque fundamental."""
    return peso_empirico * choque_emp + (1 - peso_empirico) * choque_fund


def gamma_carteira(w, gamma):
    """(10.5) Γ_c = Σ w_i · γ_i."""
    return float(np.dot(w, gamma))
