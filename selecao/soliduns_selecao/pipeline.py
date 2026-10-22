"""Monta a tabela por empresa com todos os fatores e os valores por cenário."""
import os

import numpy as np
import pandas as pd
import requests
import yaml

from . import cenarios as CEN
from . import coleta_cvm as CVM
from . import coleta_mercado as MKT
from . import formulas as F
from .util import aviso, hoje as data_hoje, log, origem, sem_acento

SUF_ON, SUF_PN = ("3",), ("4", "5", "6", "7", "8")


def carregar(base):
    cfg = yaml.safe_load(open(os.path.join(base, "parametros.yaml"), encoding="utf-8"))
    st = yaml.safe_load(open(os.path.join(base, "setores.yaml"), encoding="utf-8"))
    return cfg, st


def grupo_do_setor(setor, st):
    s = str(setor or "").replace("Emp. Adm. Part. - ", "").strip()
    mapa = {sem_acento(k): v for k, v in st["mapa_cvm"].items()}
    return mapa.get(sem_acento(s), st["padrao"])


# ------------------------------------------------------------- preços
def metricas_preco(cot, hoje, cfg):
    cot = cot[cot["data"] <= pd.Timestamp(hoje)]
    ult = cot.sort_values("data").groupby("ticker").tail(1).set_index("ticker")
    datas = np.sort(cot["data"].unique())
    d63 = datas[-63] if len(datas) >= 63 else datas[0]
    vol = cot[cot["data"] >= d63].groupby("ticker")["volume"].mean()
    out = pd.DataFrame({"preco": ult["fech"], "data_preco": ult["data"], "volume_medio": vol})
    return out[out["data_preco"] >= pd.Timestamp(hoje) - pd.Timedelta(days=15)]


def beta_sigma(cot, tickers, hoje, anos):
    ini = pd.Timestamp(hoje) - pd.DateOffset(years=anos)
    c = cot[(cot["data"] >= ini) & (cot["ticker"].isin(list(tickers) + ["BOVA11"]))]
    px = c.pivot(index="data", columns="ticker", values="fech").sort_index()
    rd = px.pct_change(fill_method=None)
    rd = rd.where(rd.abs() < 0.35)
    sigma = rd.tail(252).std() * np.sqrt(252)
    sem = px.resample("W-FRI").last().pct_change(fill_method=None)
    sem = sem.where(sem.abs() < 0.5)
    m = sem["BOVA11"]
    betas = {}
    for t in tickers:
        if t not in sem:
            continue
        d = pd.concat([sem[t], m], axis=1).dropna()
        if len(d) < 30:
            continue
        b = np.cov(d.iloc[:, 0], d.iloc[:, 1])[0, 1] / np.var(d.iloc[:, 1], ddof=1)
        betas[t] = float(np.clip(0.67 * b + 0.33, 0.3, 2.0))      # beta ajustado (Blume)
    return pd.Series(betas), sigma


# ------------------------------------------------------- governança
NOTA_SEG = {"Novo Mercado": 100, "Nível 2 de Governança Corporativa": 80,
            "Nível 1 de Governança Corporativa": 60, "Bovespa Mais": 60, "Básico": 30}


def notas_governanca(row, seg_ticker):
    seg = seg_ticker or row.get("segmento") or "Básico"
    n_seg = NOTA_SEG.get(seg, 30)
    pn = row["ticker"][-1] in SUF_PN
    if seg in ("Novo Mercado", "Nível 2 de Governança Corporativa"):
        tag = 100
    else:
        tag = 20 if pn else 60                   # ON: 80% legal; PN: sem tag along obrigatório
    pi = row.get("pct_independentes")
    cons = 50.0 if pd.isna(pi) else float(np.clip(pi / 0.5, 0, 1) * 100)
    ffl = row.get("free_float")
    ff = 50.0 if pd.isna(ffl) else float(np.clip((ffl - 15) / 35, 0, 1) * 100)
    ctl = str(row.get("controle") or "")
    controle = 0 if "Estatal" in ctl else 100
    hist = max(0, 100 - 35 * int(row.get("ocorrencias") or 0))
    return {"segmento": n_seg, "tag_along": tag, "conselho": cons, "free_float": ff,
            "controle": controle, "historico": hist}, seg


# ------------------------------------------------------- crescimento setorial (5.2)
def estimar_eps(hist, tab, st):
    """Elasticidade da receita real ao PIB por grupo, com o histórico anual das DFP,
    combinada com o valor inicial do grupo (peso n/(n+12))."""
    eps = {g: v["eps"] for g, v in st["grupos"].items()}
    try:
        pib = requests.get(MKT.SGS.format(serie=7326, n=12), timeout=30).json()
        ipca = requests.get("https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados?formato=json"
                            "&dataInicial=01/12/2014&dataFinal=31/12/2030", timeout=30).json()
        pib = {int(x["data"][-4:]): float(x["valor"]) / 100 for x in pib}
        ipca = {int(x["data"][-4:]): float(x["valor"]) / 100 for x in ipca if x["data"][3:5] == "12"}
    except Exception as e:
        aviso(f"PIB/IPCA anuais não coletados ({e}); elasticidades ficam nos valores iniciais")
        return eps, {}
    if hist.empty:
        return eps, {}
    h = hist.merge(tab[["cnpj", "grupo"]].drop_duplicates(), on="cnpj")
    h = h.dropna(subset=["receita"])
    h = h[h["receita"] > 0]
    # só empresas presentes nos dois anos (evita "crescimento" por entrada de empresas)
    diag = {}
    for g, d in h.groupby("grupo"):
        pares = []
        for (a0, a1) in zip(sorted(d["ano"].unique())[:-1], sorted(d["ano"].unique())[1:]):
            x0 = d[d["ano"] == a0].set_index("cnpj")["receita"]
            x1 = d[d["ano"] == a1].set_index("cnpj")["receita"]
            comum = x0.index.intersection(x1.index)
            if len(comum) >= 3 and a1 in pib and a1 in ipca:
                gr = x1[comum].sum() / x0[comum].sum() - 1
                pares.append(((1 + gr) / (1 + ipca[a1]) - 1, pib[a1]))
        if len(pares) >= 4:
            y, x = np.array(pares).T
            b = np.polyfit(x, y, 1)[0]
            w = len(pares) / (len(pares) + 12)
            eps[g] = float(np.clip(w * b + (1 - w) * eps[g], -0.5, 3.0))
            diag[g] = (round(b, 2), len(pares), round(eps[g], 2))
    return eps, diag


# ------------------------------------------------------------ principal
def montar_tabela(base, cfg, st, pasta_cache, fundamentos_json=None):
    hoje = data_hoje(cfg)
    rb, mc = cfg["risco_brasil"], cfg["macro"]
    log(f"Data de referência: {hoje}")

    # --- mercado
    selic = MKT.selic_meta(cfg)
    MKT.focus(cfg, hoje.year + 1)
    MKT.damodaran(cfg)
    MKT.tesouro_y10(cfg, pasta_cache)
    origem("Candidato D", cfg["eleicao"].get("candidato_D") or "D", "parametros.yaml")
    origem("Candidato E", cfg["eleicao"].get("candidato_E") or "E", "parametros.yaml")
    origem("CDS 5 anos", f"{rb['cds_5a_pb']} pb", f"parametros.yaml (leitura de {rb['cds_data']})")
    try:
        idade = (hoje - pd.Timestamp(rb["cds_data"]).date()).days
        if idade > 7:
            aviso(f"CDS informado tem {idade} dias (leitura de {rb['cds_data']}): atualize cds_5a_pb em parametros.yaml")
    except (TypeError, ValueError):
        aviso("cds_data inválida em parametros.yaml")
    cds0, y10, m, erp = rb["cds_5a_pb"] / 1e4, rb["y10"] / 100, rb["m"], rb["erp_maduro"] / 100
    cot = MKT.cotahist([hoje.year - 1, hoje.year], pasta_cache)

    # --- CVM
    CVM.baixar_cvm(pasta_cache, hoje.year)
    fund, hist = CVM.fundamentos(pasta_cache, hoje, fundamentos_json)
    gov, seg_ticker = CVM.governanca(pasta_cache, hoje)
    px = metricas_preco(cot, hoje, cfg)
    acoes_fre = gov.set_index("cnpj")["acoes_fre"].dropna().to_dict()
    escala_mil = []

    excl = []
    linhas = []
    for cnpj, g in fund.groupby("cnpj"):
        g = g[g["ticker"].isin(px.index)]
        if g.empty:
            excl.append((cnpj, fund.loc[fund["cnpj"] == cnpj, "empresa"].iloc[0], "sem negociação recente"))
            continue
        r0 = g.iloc[0]
        cands = g.assign(vol=g["ticker"].map(px["volume_medio"])).sort_values("vol", ascending=False)
        tk = cands.iloc[0]["ticker"]
        on = [t for t in cands["ticker"] if t.endswith(SUF_ON)]
        pn = [t for t in cands["ticker"] if t.endswith(SUF_PN)]
        p_on = px.loc[on[0], "preco"] if on else np.nan
        p_pn = px.loc[pn[0], "preco"] if pn else np.nan
        if np.isnan(p_on):
            p_on = p_pn
        if np.isnan(p_pn):
            p_pn = p_on
        a_on, a_pn = r0.get("acoes_on") or 0, r0.get("acoes_pn") or 0
        # A composição do capital do ITR vem em milhares para parte das companhias,
        # sem indicar a escala. O FRE traz a quantidade em unidades: serve de régua.
        fre_q = acoes_fre.get(cnpj)
        if fre_q and (a_on + a_pn) > 0:
            k = fre_q / (a_on + a_pn)
            if 300 < k < 3000:
                a_on, a_pn = a_on * 1000, a_pn * 1000
                escala_mil.append(r0["ticker"])
        mcap = (p_on * a_on if a_on else 0) + (p_pn * a_pn if a_pn else 0)
        linhas.append({
            "cnpj": cnpj, "ticker": tk, "empresa": r0["empresa"], "setor_cvm": r0["setor"],
            "financeira": r0["financeira"], "preco": px.loc[tk, "preco"], "volume_medio": px.loc[tk, "volume_medio"],
            "valor_mercado": mcap if mcap > 0 else np.nan, "receita": r0["receita_ttm"],
            "lucro_bruto": r0["lucro_bruto_ttm"], "lucro": r0["lucro_liq_ttm"],
            "patrimonio": r0["patrimonio_liq"], "dividendos": r0["dividendos_ttm"],
            "dt_refer": r0["dt_refer"],
        })
    if escala_mil:
        aviso(f"{len(escala_mil)} empresas têm a quantidade de ações do ITR em milhares (corrigida pelo FRE); "
              f"ex.: {', '.join(sorted(escala_mil)[:8])}")
    tab = pd.DataFrame(linhas)
    tab = tab.merge(gov, on="cnpj", how="left")
    tab["grupo"] = tab["setor_cvm"].map(lambda s: grupo_do_setor(s, st))
    tab["estatal"] = tab["controle"].fillna("").str.contains("Estatal")

    # --- filtros (10.1)
    vmin = cfg["carteira"]["volume_minimo_rs"]
    uni = cfg.get("universo") or {}
    excl_grupos = set(uni.get("grupos_excluidos") or [])
    manter = {str(t).upper() for t in (uni.get("manter_mesmo_excluidos") or [])}
    if excl_grupos:
        origem("Setores excluídos", ", ".join(st["grupos"][g]["nome"] for g in sorted(excl_grupos) if g in st["grupos"]),
               "parametros.yaml (universo.grupos_excluidos)")
    motivos = []
    for r in tab.itertuples():
        m_ = None
        if r.grupo in excl_grupos and r.ticker not in manter:
            m_ = f"setor excluído por decisão de gestão ({st['grupos'][r.grupo]['nome']})"
        elif "recupera" in sem_acento(r.situacao):
            m_ = "recuperação judicial/extrajudicial"
        elif not (r.volume_medio >= vmin):
            m_ = f"liquidez abaixo de R$ {vmin / 1e6:.0f} mi/dia"
        elif not (r.lucro and r.lucro > 0):
            m_ = "lucro dos últimos 12 meses não positivo"
        elif not (r.patrimonio and r.patrimonio > 0):
            m_ = "patrimônio líquido não positivo"
        elif not (r.valor_mercado > 0):
            m_ = "valor de mercado não calculável"
        motivos.append(m_)
    tab["exclusao"] = motivos
    for r in tab[tab["exclusao"].notna()].itertuples():
        excl.append((r.cnpj, r.empresa, r.exclusao))
    tab = tab[tab["exclusao"].isna()].drop(columns="exclusao").reset_index(drop=True)
    log(f"Universo elegível: {len(tab)} empresas")

    # --- preço/lucro, ROE, payout
    tab["pl"] = tab["valor_mercado"] / tab["lucro"]
    # régua de segurança: quantidade de ações em milhares sem FRE para corrigir
    suspeito = (tab["pl"] < 0.5) & (tab["pl"] * 1000).between(1, 200)
    if suspeito.any():
        aviso(f"quantidade de ações multiplicada por 1.000 pela régua de P/L: {', '.join(tab.loc[suspeito, 'ticker'])}")
        tab.loc[suspeito, "valor_mercado"] *= 1000
        tab["pl"] = tab["valor_mercado"] / tab["lucro"]
    fora = ~tab["pl"].between(1, 100)
    for r in tab[fora].itertuples():
        excl.append((r.cnpj, r.empresa, f"P/L {r.pl:.1f} fora da faixa plausível (1 a 100): conferir dados"))
    tab = tab[~fora].reset_index(drop=True)
    tab["roe"] = tab["lucro"] / tab["patrimonio"]
    tab["payout"] = (tab["dividendos"].fillna(0) / tab["lucro"]).clip(cfg["valor"]["payout_minimo"], 1.0)

    # --- β, σ, λ, K_e (capítulo 3)
    betas, sigma = beta_sigma(cot, tab["ticker"], hoje, cfg["carteira"]["janela_beta_anos"])
    tab["beta"] = tab["ticker"].map(betas).fillna(1.0)
    tab["sigma"] = tab["ticker"].map(sigma).fillna(0.40).clip(lower=0.10)
    lam_g = {g: v["lambda"] for g, v in st["grupos"].items()}
    tab["lambda_bruto"] = tab["grupo"].map(lam_g)
    for tk, aj in (st.get("ajustes_por_acao") or {}).items():
        if "lambda" in aj:
            tab.loc[tab["ticker"] == tk, "lambda_bruto"] = aj["lambda"]
    media = np.average(tab["lambda_bruto"], weights=tab["valor_mercado"])
    tab["lambda"] = tab["lambda_bruto"] / media                       # (3.4) d_i / d̄
    tab["ke0"] = F.custo_capital(y10, cds0, tab["beta"], erp, tab["lambda"], m)
    origem("K_e da ação média (β = 1, λ = 1)", f"{F.custo_capital(y10, cds0, 1, erp, 1, m):.2%}", "fórmula (3.3)")

    # --- cenários (capítulo 4)
    pesq = CEN.ler_pesquisas(os.path.join(base, "pesquisas.csv"), cfg)
    p, v = CEN.p_atual(pesq, hoje, cfg)
    datas = sorted(cot.loc[cot["data"] <= pd.Timestamp(hoje), "data"].unique())
    dp = CEN.serie_dp(pesq, [pd.Timestamp(d) for d in datas], cfg)
    ke_m = F.custo_capital(y10, cds0, 1, erp, 1, m)
    g_m = mc["ipca"] / 100 + mc["pib"] / 100
    delta = CEN.estimar_delta(cfg, pesq, cot, dp, ke_m, g_m, base)
    p_mist = p if cfg["eleicao"].get("resultado") not in ("D", "E") else CEN.prob_em(pesq, hoje, cfg)[1]
    cds_d, cds_e = F.cds_cenarios(cds0, p_mist, delta)
    origem("CDS no cenário D", f"{cds_d * 1e4:.1f} pb", "fórmula (4.5)")
    origem("CDS no cenário E", f"{cds_e * 1e4:.1f} pb", "fórmula (4.5)")
    for s, c in (("D", cds_d), ("E", cds_e)):
        tab[f"ke_{s}"] = F.ke_cenario(tab["ke0"], rb["kappa"], tab["lambda"], m, c - cds0)

    # γ por ação (4.6)
    grupo_pol = {r.ticker: ("estatal" if r.estatal else st["grupos"][r.grupo]["politico"]) for r in tab.itertuples()}
    ret = CEN.retornos(cot, list(tab["ticker"]))
    gamma_m = CEN.regressao(CEN.retornos(cot, ["BOVA11"])["BOVA11"], dp)[0]
    gamma_m = 0.0 if not np.isfinite(gamma_m) else gamma_m
    gm = CEN.gammas(ret, dp, grupo_pol)
    tab = tab.merge(gm[["gamma", "gamma_mq", "gamma_ep", "gamma_peso_proprio"]], left_on="ticker",
                    right_index=True, how="left")
    tab["gamma"] = tab["gamma"].fillna(0.0)
    origem("Pregões usados para γ", len(dp), f"dias com mudança de probabilidade: {(dp.abs() > 1e-9).sum()}")

    # --- crescimento setorial (capítulo 5)
    eps, diag = estimar_eps(hist, tab, st)
    for g_, (b, n, e) in diag.items():
        origem(f"ε estimado — {g_}", e, f"histórico: coef. {b} com {n} anos, combinado com o valor inicial")
    sel_base = mc["selic_media"] / 100
    aj = mc.get("ajuste_cenario", {})
    for s, c in (("0", cds0), ("D", cds_d), ("E", cds_e)):
        a = aj.get(s, {}) if s != "0" else {}
        ipca_s = (mc["ipca"] + a.get("ipca", 0)) / 100
        pib_s = (mc["pib"] + a.get("pib", 0)) / 100
        selic_s = sel_base + rb["kappa_curto"] * (c - cds0)
        tab[f"g_setor_{s}"] = [F.crescimento_setor(ipca_s, pib_s, eps[g_], st["grupos"][g_]["eta"], selic_s, sel_base)
                               for g_ in tab["grupo"]]

    # --- valor por cenário (capítulo 8)
    sm = cfg["valor"]["spread_minimo"]
    for s, ke_col in (("0", "ke0"), ("D", "ke_D"), ("E", "ke_E")):
        tab[f"g_{s}"] = [F.crescimento_empresa(gs, roe, ph) for gs, roe, ph in
                         zip(tab[f"g_setor_{s}"], tab["roe"], tab["payout"])]
        tab[f"pl_justo_{s}"] = [F.pl_justo(ph, g_, ke, sm) for ph, g_, ke in zip(tab["payout"], tab[f"g_{s}"], tab[ke_col])]
        tab[f"U_{s}"] = tab[f"pl_justo_{s}"] / tab["pl"] - 1
    we = cfg["valor"]["peso_choque_empirico"]
    for s in ("D", "E"):
        tab[f"choque_fund_{s}"] = F.choque_fundamental(tab[f"pl_justo_{s}"], tab["pl_justo_0"])   # (10.2)
    tab["choque_emp_D"], tab["choque_emp_E"] = F.choque_empirico(tab["gamma"], p_mist)        # (4.7)
    for s in ("D", "E"):
        tab[f"choque_{s}"] = F.choque_combinado(tab[f"choque_emp_{s}"], tab[f"choque_fund_{s}"], we)  # (10.3)

    # --- governança (capítulo 6)
    notas, segs = [], []
    for r in tab.to_dict("records"):
        n, sg = notas_governanca(r, seg_ticker.get(r["ticker"]))
        notas.append(n)
        segs.append(sg)
    nt = pd.DataFrame(notas, index=tab.index).add_prefix("gov_")
    tab = pd.concat([tab, nt], axis=1)
    tab["segmento"] = segs
    pesos_g = cfg["governanca"]["pesos"]
    tab["igov"] = [F.igov({k: r[f"gov_{k}"] for k in pesos_g}, pesos_g) for r in tab.to_dict("records")]

    # --- margem bruta (capítulo 7)
    tab["mb_ttm"] = tab["lucro_bruto"] / tab["receita"]
    if not hist.empty:
        h = hist.dropna(subset=["receita", "lucro_bruto"]).copy()
        h = h[h["receita"] > 0]
        h["mb"] = h["lucro_bruto"] / h["receita"]
        h = h.sort_values("ano").groupby("cnpj").tail(5)
        estat = h.groupby("cnpj")["mb"].agg(["mean", "std", "count"])
        tab = tab.merge(estat, left_on="cnpj", right_index=True, how="left")
        tab["mb_media"] = ((tab["mean"] * tab["count"]).fillna(0) + tab["mb_ttm"]) / (tab["count"].fillna(0) + 1)
        tab["mb_desvio"] = tab["std"]
        tab = tab.drop(columns=["mean", "std", "count"])
    else:
        tab["mb_media"], tab["mb_desvio"] = tab["mb_ttm"], np.nan
    tab["mb_desvio"] = tab["mb_desvio"].fillna(tab["mb_desvio"].median())

    contexto = {"hoje": hoje, "p": p, "p_mistura": p_mist, "v": v, "delta": delta, "cds0": cds0,
                "cds_D": cds_d, "cds_E": cds_e, "gamma_m": gamma_m, "selic": selic, "ke_m": ke_m, "pesquisas": pesq,
                "dp": dp, "excluidas": pd.DataFrame(excl, columns=["cnpj", "empresa", "motivo"])}
    return tab, contexto
