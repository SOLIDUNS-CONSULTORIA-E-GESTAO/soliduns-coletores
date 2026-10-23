"""ALVOS SOLIDUNS — preço de entrada, stop e alvos de todas as ações líquidas da B3.

Para cada ação (uma classe por empresa, volume médio mínimo em parametros.yaml › alvos):
  1. Indicadores técnicos do gráfico diário (médias móveis, IFR, MACD, Bollinger, estocástico, ADX, ATR, volume,
     pivô semanal, Fibonacci do último movimento de 120 pregões).
  2. Reação estimada do preço a cada resultado da eleição (choque D e E):
     - ações do universo elegível do robô: o próprio choque do robô (fórmula 10.3, fundamental + empírico);
     - demais ações: mesma conta, com β, λ e crescimento do grupo setorial e γ medido nos pregões com pesquisas.
  3. Níveis: entrada ideal (média do suporte S1 do pivô e da MME 9), entrada máxima (1% acima do preço), stop
     (abaixo do menor entre o suporte S2 e a MME 21, menos 1 ATR), alvo 1 (primeira resistência), alvo 2 do cenário D
     (preço do cenário, aproximado à resistência mais próxima até 10% acima) e alvo 2 técnico (sem eleição).
  4. Alertas que não entram na conta: setor fora das listas, ação retirada, prejuízo, patrimônio negativo,
     recuperação judicial, dívida alta, ganho/risco abaixo de 1, cotação abaixo de R$ 1 e preço abaixo da MME 200.
Nada aqui é recomendação de investimento."""
import numpy as np
import pandas as pd

from . import cenarios as CEN
from . import formulas as F
from .pipeline import beta_sigma, grupo_do_setor
from .util import log, origem, sem_acento

COLS_TEC = ["ifr", "adx", "di_mais", "di_menos", "macd", "sinal", "estoc_k", "estoc_d", "atr", "mme9", "mme21", "mme50",
            "mme200", "bb_inf", "bb_sup", "vol_rel", "ret_5d", "ret_21d", "ret_ano", "s2", "s1", "pivo", "r1", "r2",
            "min252", "max252"]


FATORES = np.array([2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50, 100], dtype=float)


def ajustar_desdobramentos(x):
    """O COTAHIST não ajusta desdobramentos e grupamentos. Um salto de mais de 30% num dia que bate (até 4%)
    com uma razão redonda (2, 3, 4, 5, 10, 1/2, 1/10...) é tratado como evento: os preços anteriores são
    corrigidos pela razão. Devolve a tabela corrigida e a lista de eventos encontrados."""
    x = x.copy()
    cand = np.concatenate([FATORES, 1 / FATORES])
    razao = (x["fech"] / x["fech"].shift()).values
    eventos = []
    for i in range(len(x) - 1, 0, -1):
        r = razao[i]
        if not np.isfinite(r) or abs(np.log(r)) < np.log(1.3):
            continue
        j = np.argmin(np.abs(np.log(r) - np.log(cand)))
        if abs(np.log(r) - np.log(cand[j])) <= np.log(1.04):
            k = cand[j]
            x.iloc[:i, x.columns.get_indexer(["max", "min", "fech"])] *= k
            x.iloc[:i, x.columns.get_indexer(["volume"])] *= 1.0
            eventos.append((x.index[i].strftime("%Y-%m-%d"), float(k)))
    return x, eventos


def indicadores(x, n_serie=160):
    """x: DataFrame diário de uma ação (índice = data; colunas max, min, fech, volume), em ordem cronológica."""
    c, h, l = x["fech"], x["max"], x["min"]
    e = {n: c.ewm(span=n, adjust=False).mean() for n in (9, 12, 21, 26, 50, 200)}
    dl = c.diff()
    up = dl.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    dn = (-dl.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    ifr = 100 - 100 / (1 + up / dn.replace(0, np.nan))
    macd = e[12] - e[26]
    sinal = macd.ewm(span=9, adjust=False).mean()
    m20, s20 = c.rolling(20).mean(), c.rolling(20).std()
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1 / 14, adjust=False).mean()
    ll, hh = l.rolling(14).min(), h.rolling(14).max()
    k = 100 * (c - ll) / (hh - ll).replace(0, np.nan)
    sobe, desce = h.diff(), -l.diff()
    pdm = sobe.where((sobe > desce) & (sobe > 0), 0.0)
    ndm = desce.where((desce > sobe) & (desce > 0), 0.0)
    pdi = 100 * pdm.ewm(alpha=1 / 14, adjust=False).mean() / atr
    ndi = 100 * ndm.ewm(alpha=1 / 14, adjust=False).mean() / atr
    adx = (100 * (pdi - ndi).abs() / (pdi + ndi).replace(0, np.nan)).ewm(alpha=1 / 14, adjust=False).mean()
    u5 = x.iloc[-5:]
    hi5, lo5, fe = u5["max"].max(), u5["min"].min(), c.iloc[-1]
    piv = (hi5 + lo5 + fe) / 3
    w = x.iloc[-120:]
    lo, hi = w["min"].min(), w["max"].max()
    alta = w["max"].idxmax() > w["min"].idxmin()
    fib = {f: (hi - (hi - lo) * f if alta else lo + (hi - lo) * f) for f in (0.382, 0.5, 0.618)}
    ext = {f: (lo + (hi - lo) * f if alta else np.nan) for f in (1.272, 1.618)}
    ano_ant = c[c.index < pd.Timestamp(c.index[-1].year, 1, 1)]
    t = dict(preco=fe, ifr=ifr.iloc[-1], adx=adx.iloc[-1], di_mais=pdi.iloc[-1], di_menos=ndi.iloc[-1], macd=macd.iloc[-1],
             sinal=sinal.iloc[-1], estoc_k=k.iloc[-1], estoc_d=k.rolling(3).mean().iloc[-1], atr=atr.iloc[-1],
             mme9=e[9].iloc[-1], mme21=e[21].iloc[-1], mme50=e[50].iloc[-1], mme200=e[200].iloc[-1],
             bb_inf=(m20 - 2 * s20).iloc[-1], bb_sup=(m20 + 2 * s20).iloc[-1],
             vol_rel=x["volume"].iloc[-5:].mean() / max(x["volume"].iloc[-60:].mean(), 1),
             ret_5d=fe / c.iloc[-6] - 1, ret_21d=fe / c.iloc[-22] - 1,
             ret_ano=(fe / ano_ant.iloc[-1] - 1) if len(ano_ant) else np.nan,
             s1=2 * piv - hi5, s2=piv - (hi5 - lo5), pivo=piv, r1=2 * piv - lo5, r2=piv + (hi5 - lo5),
             min20=x["min"].iloc[-20:].min(), max20=x["max"].iloc[-20:].max(), max60=x["max"].iloc[-60:].max(),
             min252=x["min"].iloc[-252:].min(), max252=x["max"].iloc[-252:].max(), max_hist=x["max"].max(),
             fib=fib, ext=ext)
    s = x.iloc[-n_serie:].index
    dig = 4 if fe < 2 else 2
    t["serie"] = [[d.strftime("%Y-%m-%d"), round(float(c[d]), dig), round(float(e[21][d]), dig), round(float(e[50][d]), dig),
                   round(float(e[200][d]), dig)] for d in s]
    return t


def niveis(t, up_d):
    """Entrada, stop e alvos a partir dos indicadores e da reação estimada ao cenário D."""
    p = t["preco"]
    ent_ideal = min(p, (t["s1"] + t["mme9"]) / 2)
    stop = min(t["s2"], t["mme21"]) - t["atr"]
    cand = [t["r1"], t["r2"], t["max20"], t["max60"], t["max252"], t["max_hist"], t["bb_sup"],
            *t["fib"].values(), *t["ext"].values()]
    res = sorted(v for v in cand if v is not None and np.isfinite(v) and v > p * 1.01)
    if not res:
        res = [p * 1.05]
    alvo1 = res[0]
    prox = (min(res[1], alvo1 * 1.10) if len(res) > 1 else alvo1 * 1.05)
    alvo2_n = max(prox, alvo1)
    alvo_c = p * (1 + up_d)
    perto = [v for v in res if alvo_c * 0.98 <= v <= alvo_c * 1.10]
    alvo2_d = min(perto, key=lambda v: abs(v - alvo_c)) if perto else max(alvo_c, alvo1)
    if alvo2_d <= alvo1:
        alvo2_d = max(prox, alvo_c)
    risco = max(ent_ideal - stop, 1e-9)
    return dict(ent_ideal=ent_ideal, ent_max=p * 1.01, stop=stop, alvo1=alvo1, alvo2_d=alvo2_d, alvo2_n=alvo2_n,
                ganho1=alvo1 / ent_ideal - 1, ganho_d=alvo2_d / ent_ideal - 1, ganho_d_atual=alvo2_d / p - 1,
                ganho_n=alvo2_n / ent_ideal - 1, perda=stop / ent_ideal - 1,
                rr_d=(alvo2_d - ent_ideal) / risco, rr_n=(alvo2_n - ent_ideal) / risco)


def calcular(tab, ctx, cfg, st):
    ca = cfg.get("alvos") or {}
    cot, fund = ctx["cot"], ctx["fund"]
    hoje = pd.Timestamp(ctx["hoje"])
    rb, mc = cfg["risco_brasil"], cfg["macro"]
    cot = cot[cot["data"] <= hoje].copy()
    if "max" not in cot:
        raise RuntimeError("COTAHIST sem máxima/mínima: atualize coleta_mercado.cotahist")

    # --- universo: uma classe por empresa, a mais líquida, com volume mínimo
    datas = np.sort(cot["data"].unique())
    d63 = datas[-63] if len(datas) >= 63 else datas[0]
    vol = cot[cot["data"] >= d63].groupby("ticker")["volume"].mean()
    ultimo = cot.groupby("ticker")["data"].max()
    f = fund.dropna(subset=["ticker"]).copy()
    f = f[f["ticker"].isin(vol.index) & f["ticker"].map(ultimo).ge(pd.Timestamp(datas[-1]))]
    f["vol"] = f["ticker"].map(vol)
    f = f.sort_values("vol", ascending=False).drop_duplicates("cnpj")
    f = f[f["vol"] >= ca.get("volume_minimo_rs", 2e6)].reset_index(drop=True)
    log(f"Alvos SOLIDUNS: {len(f)} ações com volume médio de pelo menos R$ {ca.get('volume_minimo_rs', 2e6) / 1e6:.0f} mi/dia")

    # --- choque de cada cenário: do robô (elegíveis) ou estimado com a mesma conta (demais)
    tb = tab.set_index("ticker")
    fora = [t for t in f["ticker"] if t not in tb.index]
    cds0, cds_d, cds_e, p_mist = ctx["cds0"], ctx["cds_D"], ctx["cds_E"], ctx["p_mistura"]
    y10, m, erp = rb["y10"] / 100, rb["m"], rb["erp_maduro"] / 100
    est = {}
    if fora:
        betas, _ = beta_sigma(cot, fora, ctx["hoje"], cfg["carteira"]["janela_beta_anos"])
        setor = f.set_index("ticker")["setor"]
        grp = {t: grupo_do_setor(setor.get(t), st) for t in fora}
        gpol = {t: st["grupos"][grp[t]]["politico"] for t in fora}
        gm = CEN.gammas(CEN.retornos(cot, fora), ctx["dp"], gpol) if len(ctx["dp"]) else pd.DataFrame()
        sel_base = mc["selic_media"] / 100
        for t in fora:
            gp = st["grupos"][grp[t]]
            lam = gp["lambda"] / ctx["lambda_media"]
            ke0 = F.custo_capital(y10, cds0, betas.get(t, 1.0), erp, lam, m)
            eps = ctx["eps"].get(grp[t], gp["eps"])
            g = {s: F.crescimento_setor(mc["ipca"] / 100, mc["pib"] / 100, eps, gp["eta"],
                                        sel_base + rb["kappa_curto"] * (c - cds0), sel_base)
                 for s, c in (("0", cds0), ("D", cds_d), ("E", cds_e))}
            sm = cfg["valor"]["spread_minimo"]
            base = max(ke0 - g["0"], sm)
            fund_s = {s: base / max(F.ke_cenario(ke0, rb["kappa"], lam, m, c - cds0) - g[s], sm) - 1
                      for s, c in (("D", cds_d), ("E", cds_e))}
            gam = float(gm["gamma"].get(t, 0.0)) if len(gm) else 0.0
            emp_d, emp_e = F.choque_empirico(gam, p_mist)
            we = cfg["valor"]["peso_choque_empirico"]
            est[t] = dict(grupo=grp[t], choque_d=F.choque_combinado(emp_d, fund_s["D"], we),
                          choque_e=F.choque_combinado(emp_e, fund_s["E"], we))

    # --- alertas
    excl_rob = set((cfg.get("universo") or {}).get("grupos_excluidos") or [])
    grupos_alerta = set(ca.get("grupos_alerta") or []) | excl_rob
    retiradas = {str(x).upper() for x in (ca.get("acoes_retiradas") or [])}
    motivo_rob = ctx["excluidas"].groupby("cnpj")["motivo"].first().to_dict() if len(ctx["excluidas"]) else {}
    nomes = {g: v["nome"] for g, v in st["grupos"].items()}

    linhas = []
    for r in f.itertuples():
        x = cot[cot["ticker"] == r.ticker].set_index("data").sort_index()
        if len(x) < 130:
            continue
        xa, ev = ajustar_desdobramentos(x[["max", "min", "fech", "volume"]])
        if ev:
            log(f"  {r.ticker}: preços anteriores ajustados por desdobramento/grupamento em {', '.join(d for d, _ in ev)}")
        t = indicadores(xa, ca.get("pregoes_grafico", 160))
        if r.ticker in tb.index:
            g, cd, ce, org = tb.at[r.ticker, "grupo"], tb.at[r.ticker, "choque_D"], tb.at[r.ticker, "choque_E"], "robô"
        else:
            e_ = est[r.ticker]
            g, cd, ce, org = e_["grupo"], e_["choque_d"], e_["choque_e"], "estimado"
        nv = niveis(t, cd if np.isfinite(cd) else 0.0)
        alert = []
        if g in grupos_alerta:
            alert.append(f"setor fora das listas ({nomes.get(g, g).lower()})")
        if r.ticker in retiradas:
            alert.append("ação retirada por decisão de gestão")
        lucro, pl = getattr(r, "lucro_liq_ttm", np.nan), getattr(r, "patrimonio_liq", np.nan)
        if pd.notna(lucro) and lucro < 0:
            alert.append("prejuízo nos últimos 12 meses")
        if pd.notna(pl) and pl < 0:
            alert.append("patrimônio líquido negativo")
        mot = motivo_rob.get(r.cnpj, "")
        if "recupera" in sem_acento(str(mot)) or "recupera" in sem_acento(str(r.empresa)):
            alert.append("recuperação judicial ou extrajudicial")
        ebit = getattr(r, "ebit_ttm", np.nan)
        divb, cx = getattr(r, "divida_bruta", np.nan), getattr(r, "caixa", np.nan)
        if not r.financeira and pd.notna(ebit) and ebit > 0 and pd.notna(divb) and (divb - (cx or 0)) / ebit > 4:
            alert.append("dívida líquida acima de 4 vezes o EBIT")
        if nv["rr_d"] < 1:
            alert.append("ganho/risco abaixo de 1")
        if t["preco"] < 1:
            alert.append("cotação abaixo de R$ 1")
        if t["preco"] < t["mme200"]:
            alert.append("preço abaixo da média de 200 dias")
        graves = ("setor fora", "retirada", "prejuízo", "negativo", "recuperação", "ganho/risco", "abaixo de R$ 1")
        linhas.append(dict(ticker=r.ticker, empresa=r.empresa, setor=nomes.get(g, g), grupo=g, volume_medio=r.vol,
                           choque_d=cd, choque_e=ce, preco_e=t["preco"] * (1 + ce) if np.isfinite(ce) else np.nan,
                           origem_choque=org, alertas=alert, limpa=not any(k in a for a in alert for k in graves),
                           serie=t["serie"], **{k: t[k] for k in ["preco"] + COLS_TEC}, **nv))
    out = pd.DataFrame(linhas)
    if out.empty:
        return out
    out = out.sort_values(["ganho_d", "rr_d"], ascending=False).reset_index(drop=True)
    out["posicao"] = range(1, len(out) + 1)
    dest = ca.get("ganho_destaque", 0.20)
    origem("Alvos SOLIDUNS", f"{len(out)} ações; {int(((out.ganho_d >= dest) & out.limpa).sum())} com ganho de "
           f"{dest:.0%} ou mais até o alvo 2 (cenário D) e sem alertas", "alvos.py")
    return out
