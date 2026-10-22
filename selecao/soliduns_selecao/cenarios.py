"""Motor de cenários (capítulo 4): probabilidade a partir das pesquisas,
prêmio político Δ e sensibilidade política γ de cada ação."""
import os

import numpy as np
import pandas as pd

from . import formulas as F
from .util import aviso, origem


def ler_pesquisas(caminho, cfg):
    df = pd.read_csv(caminho, sep=";", dtype=str).fillna("")
    df["data"] = pd.to_datetime(df["data_divulgacao"])
    num = lambda c: pd.to_numeric(df[c].str.replace(",", "."), errors="coerce")
    df["amostra"] = num("amostra").fillna(cfg["eleicao"]["amostra_padrao"])
    d, e = num("pct_D"), num("pct_E")
    df["v_D"] = d / (d + e)                       # fração de votos válidos de D entre os dois
    return df.dropna(subset=["v_D"]).sort_values("data")


def prob_em(pesq, quando, cfg, estrito=False):
    """(4.1)+(4.2) probabilidade de D com as pesquisas divulgadas até `quando`."""
    jan = pd.Timedelta(days=cfg["eleicao"]["janela_pesquisas_dias"])
    q = pd.Timestamp(quando)
    m = (pesq["data"] < q) if estrito else (pesq["data"] <= q)
    s = pesq[m & (pesq["data"] > q - jan)]
    if s.empty:
        s = pesq[m].tail(1)
    if s.empty:
        return np.nan, np.nan
    v = F.media_pesquisas(s["amostra"], s["v_D"])
    return v, F.prob_d(v, cfg["eleicao"]["sigma_v"])


def p_atual(pesq, hoje, cfg):
    res = cfg["eleicao"].get("resultado")
    if res in ("D", "E"):
        p = 1.0 if res == "D" else 0.0
        origem("p_D", p, f"resultado da eleição informado ({res})")
        return p, np.nan
    v, p = prob_em(pesq, hoje, cfg)
    origem("v̄_D (média das pesquisas)", round(v, 4), "fórmula (4.1), pesquisas.csv")
    origem("p_D", round(p, 4), f"fórmula (4.2), σ_v = {cfg['eleicao']['sigma_v']}")
    return p, v


def serie_dp(pesq, dias_pregao, cfg):
    """Δp_t de cada pregão: mudança da probabilidade com as pesquisas divulgadas
    antes do pregão (as pesquisas costumam sair à noite)."""
    ini = pesq["data"].min()
    dias = [d for d in dias_pregao if d > ini]
    p = pd.Series([prob_em(pesq, d, cfg, estrito=True)[1] for d in dias], index=dias)
    return p.diff().dropna()


def retornos(cot, tickers):
    px = cot[cot["ticker"].isin(tickers)].pivot(index="data", columns="ticker", values="fech").sort_index()
    r = px.pct_change(fill_method=None)
    return r.where(r.abs() < 0.35)               # descarta saltos de grupamento/desdobramento


def regressao(y, x):
    """OLS de y em [1, x]: (coeficiente de x, erro-padrão, n)."""
    m = pd.concat([y, x], axis=1).dropna()
    if len(m) < 8 or m.iloc[:, 1].abs().sum() == 0:
        return np.nan, np.nan, len(m)
    X = np.column_stack([np.ones(len(m)), m.iloc[:, 1].values])
    b, res, *_ = np.linalg.lstsq(X, m.iloc[:, 0].values, rcond=None)
    resid = m.iloc[:, 0].values - X @ b
    s2 = resid @ resid / max(len(m) - 2, 1)
    var = s2 * np.linalg.inv(X.T @ X)[1, 1]
    return float(b[1]), float(np.sqrt(var)), len(m)


def gammas(ret, dp, grupos):
    """(4.6) γ por ação, combinado com a média do grupo (encolhimento)."""
    linhas = []
    for t in ret.columns:
        g, se, n = regressao(ret[t], dp)
        linhas.append((t, g, se, n))
    df = pd.DataFrame(linhas, columns=["ticker", "gamma_mq", "gamma_ep", "n"]).set_index("ticker")
    df["grupo_pol"] = df.index.map(grupos)
    out = []
    for grp, d in df.groupby("grupo_pol"):
        ok = d.dropna(subset=["gamma_mq"])
        if ok.empty:
            continue
        centro = ok["gamma_mq"].median()
        tau2 = max(ok["gamma_mq"].var(ddof=1) - (ok["gamma_ep"] ** 2).mean(), 0.0025) if len(ok) > 2 else 0.01
        w = tau2 / (tau2 + ok["gamma_ep"] ** 2)
        g = w * ok["gamma_mq"] + (1 - w) * centro
        out.append(pd.DataFrame({"gamma": g, "gamma_peso_proprio": w, "gamma_grupo": centro}))
    res = df.join(pd.concat(out)) if out else df.assign(gamma=np.nan)
    res["gamma"] = res["gamma"].fillna(0.0)
    return res


def estimar_delta(cfg, pesq, cot, dp, ke_m, g_m, pasta):
    """(4.4) prêmio político Δ, em fração (0,01 = 100 pontos-base)."""
    rb = cfg["risco_brasil"]
    lim = (rb["delta_minimo_pb"] / 1e4, rb["delta_maximo_pb"] / 1e4)
    limitar = lambda d: float(np.sign(d) * min(max(abs(d), lim[0]), lim[1]))
    if rb.get("delta_pb") is not None:
        d = rb["delta_pb"] / 1e4
        origem("Δ (prêmio político)", f"{rb['delta_pb']} pb", "parametros.yaml")
        return d
    cds_csv = os.path.join(pasta, "cds_historico.csv")
    if os.path.exists(cds_csv):
        c = pd.read_csv(cds_csv, sep=";")
        c["data"] = pd.to_datetime(c["data"])
        s = c.set_index("data")["cds_pb"].astype(float).sort_index() / 1e4
        coef, se, n = regressao(s.diff(), dp)
        if np.isfinite(coef):
            d = limitar(-coef)
            origem("Δ (prêmio político)", f"{d * 1e4:.0f} pb", f"regressão (4.4) com cds_historico.csv, n = {n}")
            return d
    # Sem CDS diário: Δ implícito na reação da bolsa (BOVA11) às pesquisas.
    r = retornos(cot, ["BOVA11"])
    if "BOVA11" in r:
        gm, se, n = regressao(r["BOVA11"], dp)
        if np.isfinite(gm):
            d = limitar(F.delta_implicito(gm, ke_m, g_m, rb["kappa"], rb["m"]))          # (4.8)
            origem("γ do mercado (BOVA11)", round(gm, 3), f"regressão (4.6), n = {n}")
            origem("Δ (prêmio político)", f"{d * 1e4:.0f} pb",
                   "fórmula (4.8), implícito na bolsa; para usar o CDS, crie cds_historico.csv")
            return d
    aviso("Δ não estimado; usando 80 pontos-base")
    origem("Δ (prêmio político)", "80 pb", "valor de reserva")
    return 0.008
