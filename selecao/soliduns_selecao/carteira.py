"""Escore composto (capítulo 9) e montagem da carteira (capítulo 10)."""
import numpy as np
from scipy.optimize import minimize

from . import formulas as F
from .util import aviso, log


def z_setor(tab, col, winsor, minimo=4):
    """z dentro do grupo de setores; grupos pequenos usam o universo."""
    z_glob = F.padronizar(tab[col].fillna(tab[col].median()), winsor)
    z = z_glob.copy()
    for g, idx in tab.groupby("grupo").groups.items():
        if len(idx) >= minimo:
            v = tab.loc[idx, col]
            z.loc[idx] = F.padronizar(v.fillna(v.median()), winsor).values
    return z


def pontuar(tab, p, cfg, pos_choque=False):
    """Fatores padronizados e escore S para uma probabilidade p_D.
    pos_choque=True (carteiras condicionais montadas ANTES da apuração): o potencial
    é medido sobre o preço esperado depois do choque do resultado."""
    t = tab.copy()
    if pos_choque and p in (0.0, 1.0):
        s = "D" if p == 1.0 else "E"
        t[f"U_{s}"] = (1 + t[f"U_{s}"]) / (1 + t[f"choque_{s}"]) - 1
    w = tuple(cfg["escore"]["winsor"])
    t["U_esperado"] = F.potencial_esperado(p, t["U_D"], t["U_E"])
    if p in (0.0, 1.0):
        t["U_min"] = t["U_D"] if p == 1.0 else t["U_E"]
    else:
        t["U_min"] = np.minimum(t["U_D"], t["U_E"])
    # Leitura em taxa de retorno (mesma informação de U, em p.p. ao ano): retorno implícito
    # no preço, φ·(1+g)/(P/L) + g, contra o custo de capital esperado.
    t["ret_implicito"] = F.retorno_implicito(t["payout"], t["g_0"], t["pl"])               # (8.6)
    t["ke_esperado"] = p * t["ke_D"] + (1 - p) * t["ke_E"]
    t["excesso"] = F.excesso(t["ret_implicito"], t["ke_esperado"])                         # (8.7)
    t["excesso_rel"] = t["excesso"] - t["excesso"].median()
    t["g_esperado"] = p * t["g_setor_D"] + (1 - p) * t["g_setor_E"]
    t["choque_esperado"] = p * t["choque_D"] + (1 - p) * t["choque_E"]
    t["z_retorno_esperado"] = F.padronizar(t["U_esperado"], w)
    t["z_pior_caso"] = F.padronizar(t["U_min"], w)
    t["z_crescimento"] = F.padronizar(t["g_esperado"], w)
    t["z_governanca"] = F.padronizar(t["igov"], w)
    t["q_margem"] = z_setor(t, "mb_media", w) - 0.5 * z_setor(t, "mb_desvio", w)      # (7.2)
    pesos = cfg["escore"]["pesos"][cfg["escore"]["regime"]]
    fatores = {"retorno_esperado": t["z_retorno_esperado"], "pior_caso": t["z_pior_caso"],
               "crescimento": t["z_crescimento"], "governanca": t["z_governanca"], "margem": t["q_margem"]}
    t["escore"] = F.escore(fatores, pesos)                                             # (9.2)
    return t.sort_values("escore", ascending=False).reset_index(drop=True)


def _otimizar(sel, cfg, p, modo, gamma_alvo=0.0):
    c = cfg["carteira"]
    n = len(sel)
    w0 = F.pesos_brutos(sel["escore"], sel["sigma"])                                  # (10.1)
    lo, hi = c["peso_minimo"], c["peso_maximo"]
    restr = [{"type": "eq", "fun": lambda w: w.sum() - 1}]
    for g in sel["grupo"].unique():
        msk = (sel["grupo"] == g).values.astype(float)
        restr.append({"type": "ineq", "fun": lambda w, m=msk: c["setor_maximo"] - w @ m})
    if cfg["escore"]["regime"] == "eleitoral":
        est = sel["estatal"].values.astype(float)
        restr.append({"type": "ineq", "fun": lambda w: c["estatais_maximo"] - w @ est})
    # Com o resultado conhecido, a incerteza eleitoral acabou: não há restrição de cenário.
    cenarios = ["D", "E"] if 0 < p < 1 else []
    L = c["perda_maxima_cenario"]
    for s in cenarios:                                                                  # (10.4)
        ch = sel[f"choque_{s}"].values
        restr.append({"type": "ineq", "fun": lambda w, ch=ch: w @ ch + L})
    gam = sel["gamma"].values
    if modo == "neutro":
        tol = c["gamma_tolerancia"]
        # neutro = mesma sensibilidade política da bolsa (carteira só comprada não chega a zero)
        restr.append({"type": "ineq", "fun": lambda w: tol - (w @ gam - gamma_alvo)})
        restr.append({"type": "ineq", "fun": lambda w: tol + (w @ gam - gamma_alvo)})
    x0 = np.clip(w0, lo, hi)
    x0 = x0 / x0.sum()
    res = minimize(lambda w: np.sum((w - w0) ** 2), x0, method="SLSQP", bounds=[(lo, hi)] * n,
                   constraints=restr, options={"maxiter": 500, "ftol": 1e-12})
    w = res.x
    ok = res.success and all(r["fun"](w) >= -1e-6 for r in restr if r["type"] == "ineq") \
        and abs(w.sum() - 1) < 1e-6
    return w, ok, cenarios


def montar_carteira(t, cfg, p, modo, rotulo="", gamma_alvo=0.0):
    """Seleciona as N primeiras e otimiza os pesos; troca nomes até cumprir as restrições."""
    c = cfg["carteira"]
    n = c["n_acoes"]
    if len(t) < n:
        aviso(f"{rotulo}: universo com só {len(t)} ações; carteira terá menos de {n}")
        n = len(t)
    fila = list(range(n, len(t)))
    escolhidos = list(range(n))
    for tentativa in range(60):
        sel = t.loc[escolhidos].reset_index(drop=True)
        w, ok, cen = _otimizar(sel, cfg, p, modo, gamma_alvo)
        if ok:
            break
        if not fila or not cen and modo != "neutro":
            aviso(f"{rotulo}: não foi possível cumprir todas as restrições; carteira entregue com a melhor tentativa")
            break
        # troca a ação que mais atrapalha: pior choque no cenário mais exigido (ou maior |γ| no modo neutro)
        if modo == "neutro":
            gam_c = float(sel["gamma"] @ w) - gamma_alvo
            alvo = (sel["gamma"] * np.sign(gam_c)).idxmax()
        else:
            pior_s = min(cen, key=lambda s: float(sel[f"choque_{s}"] @ w))
            alvo = sel[f"choque_{pior_s}"].idxmin()
        escolhidos.remove(escolhidos[alvo])
        escolhidos.append(fila.pop(0))
    sel = sel.assign(peso=np.round(w, 4))
    sel["peso"] = sel["peso"] / sel["peso"].sum()
    resumo = {
        "rotulo": rotulo, "modo": modo, "p_D": p, "n": len(sel), "restricoes_ok": bool(ok),
        "gamma_carteira": F.gamma_carteira(sel["peso"], sel["gamma"]), "gamma_bolsa": gamma_alvo,
        "choque_D": float(sel["peso"] @ sel["choque_D"]), "choque_E": float(sel["peso"] @ sel["choque_E"]),
        "excesso_rel": float(sel["peso"] @ sel["excesso_rel"]), "escore_medio": float(sel["peso"] @ sel["escore"]),
        "igov_medio": float(sel["peso"] @ sel["igov"]),
    }
    log(f"Carteira {rotulo}: {len(sel)} ações; Γ = {resumo['gamma_carteira']:+.3f}; "
        f"choque D {resumo['choque_D']:+.1%}, E {resumo['choque_E']:+.1%}; restrições {'ok' if ok else 'NÃO atendidas'}")
    return sel.sort_values("peso", ascending=False).reset_index(drop=True), resumo
