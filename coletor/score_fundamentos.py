"""
SOLIDUNS — SCORE EXPONENCIAL: MOTOR DE CÁLCULO (metodologia v1.0.3) — etapa 2: subitens com balanço da CVM e de risco
v1.0 (22/10/2026)

Lê as bases de pesquisa (Releases em rascunho) e o universo da etapa 1. Para cada ação elegível, no ÚLTIMO PREGÃO
DE CADA MÊS, usa só o que era público naquele dia:
  - demonstrações (DFP e ITR) com data de entrega (DT_RECEB) até o dia; de cada período, a última versão entregue
    até o dia (reapresentações só valem depois de entregues);
  - quantidade de ações: composição do capital das DFP/ITR (2020 em diante, com a data de entrega) e, antes, o
    capital integralizado do Formulário de Referência (vale a partir da data de aprovação do capital); a quantidade
    é corrigida por desdobramentos e grupamentos pela própria série de preços (fechamento ÷ preço ajustado);
  - preços originais da B3 (valor de mercado = ON × preço da ON + PN × preço da PN, sem ações em tesouraria);
  - juro real da NTN-B mais longa e IPCA esperado (Focus) do dia; fatores do NEFIN até o dia.

Contas: demonstração consolidada quando existe, senão a individual. Fluxos (receita, lucro, caixa) em 12 meses
(soma dos 4 últimos trimestres; o trimestre sai da diferença entre acumulados do ano). Último período usado: o mais
recente com lucro de 12 meses calculável, até 15 meses antes do dia (mais velho que isso = sem dado).

Saída: fundamentos_mensal.csv.gz (uma linha por ação elegível e mês) e conferencia_etapa2.md.
Uso: python coletor/score_fundamentos.py --ajustada A --referencias R --cvm C --motor S
"""
import argparse
import datetime as dt
import glob
import math
import os
import re
from collections import defaultdict

import numpy as np
import pandas as pd

DEFASAGEM_MAX = 456                      # dias entre o fim do período e o dia (15 meses)
TOLERANCIA = 0                           # reapresentação até N dias depois da 1ª entrega vale desde a 1ª entrega
PREMIO = 0.04                            # prêmio de risco do subitem de Molodovsky
BENEISH = {"const": -4.840, "DSRI": 0.920, "GMI": 0.528, "AQI": 0.404, "SGI": 0.892, "DEPI": 0.115,
           "SGAI": -0.172, "TATA": 4.679, "LVGI": -0.327}
CONFERIR = [("9512", "PETR", "Petrobras"), ("5410", "WEGE", "WEG"), ("22470", "MGLU", "Magazine Luiza")]
MESES_CONF = ["2025-03", "2025-06", "2019-06"]


# ----------------------------------------------------------------------------------------------- leitura da CVM
def mes_idx(d):
    return d.year * 12 + d.month - 1


def ler_cvm(pasta):
    """Devolve: docs[cd] = lista de (dt_refer, versao, dt_receb, tipo); valores[(cd, dt_refer, versao)] = registro."""
    ent = []
    for f in glob.glob(os.path.join(pasta, "cvm_*_entregas.csv.gz")):
        e = pd.read_csv(f, dtype=str, usecols=["CNPJ_CIA", "CD_CVM", "DT_REFER", "VERSAO", "DT_RECEB"])
        e["tipo"] = "DFP" if "_dfp_" in f else "ITR"
        ent.append(e)
    ent = pd.concat(ent, ignore_index=True).dropna(subset=["DT_RECEB"])
    ent["cd"] = ent.CD_CVM.str.lstrip("0")
    cnpj_cd = dict(zip(ent.CNPJ_CIA, ent.cd))
    receb, primeira = {}, {}
    for r in ent.itertuples():
        k = (r.cd, r.DT_REFER, int(r.VERSAO))
        receb[k] = min(receb.get(k, r.DT_RECEB), r.DT_RECEB)
        primeira[k[:2]] = min(primeira.get(k[:2], r.DT_RECEB), r.DT_RECEB)
    # os dados abertos guardam só a ÚLTIMA versão de cada documento. Ela vale a partir da própria entrega; se chegou
    # até TOLERANCIA dias depois da 1ª entrega do período (correção de forma), vale desde a 1ª entrega.
    for k in receb:
        p1 = primeira[k[:2]]
        if (dt.date.fromisoformat(receb[k][:10]) - dt.date.fromisoformat(p1[:10])).days <= TOLERANCIA:
            receb[k] = p1

    reg = defaultdict(lambda: {"con": {}, "ind": {}})
    for f in sorted(glob.glob(os.path.join(pasta, "cvm_[di][ft][pr]_20[0-9][0-9].csv.gz"))):
        d = pd.read_csv(f, dtype=str, usecols=["CD_CVM", "DT_REFER", "VERSAO", "DT_INI_EXERC", "DEMO", "GRUPO",
                                               "CD_CONTA", "DS_CONTA", "VALOR"])
        nivel = d.CD_CONTA.str.count(r"\.") + 1
        dfc = d.DEMO.str.startswith("DFC")
        manter = (~dfc & (nivel <= 3) & ~d.CD_CONTA.str.startswith("3.99")) | \
                 (dfc & ((nivel <= 3) & d.CD_CONTA.str.match(r"6\.0[123]") | d.CD_CONTA.str.startswith("6.01.01.")))
        d = d[manter]
        d["VALOR"] = pd.to_numeric(d.VALOR, errors="coerce")
        d["cd"] = d.CD_CVM.str.lstrip("0")
        for r in d.itertuples(index=False):
            k = (r.cd, r.DT_REFER, int(r.VERSAO))
            g = reg[k][r.GRUPO]
            ini = r.DT_INI_EXERC if isinstance(r.DT_INI_EXERC, str) else ""
            g.setdefault((r.DEMO[:3], r.CD_CONTA), []).append((ini, r.DS_CONTA, r.VALOR))
        print(f"  lido {os.path.basename(f)}: {len(d)} linhas", flush=True)
    docs = defaultdict(list)
    valores = {}
    for k, gr in reg.items():
        if k not in receb:
            continue
        grupo = gr["con"] if gr["con"] else gr["ind"]
        rec = extrair(grupo, k[1])
        if rec is None:
            continue
        rec["grupo"] = "con" if gr["con"] else "ind"
        valores[k] = rec
        docs[k[0]].append((k[1], k[2], receb[k]))
    for cd in docs:
        docs[cd].sort(key=lambda x: x[2])
    return docs, valores, cnpj_cd


def extrair(g, dref):
    """Contas usadas, de uma demonstração (um grupo: consolidado ou individual)."""
    def bp(conta):
        v = g.get(("BPA", conta)) or g.get(("BPP", conta))
        return v[0][2] if v else np.nan

    def desc(conta):
        v = g.get(("BPA", conta)) or g.get(("BPP", conta)) or g.get(("DRE", conta)) or g.get(("DFC", conta))
        return v[0][1] if v else ""

    def fluxo(demo, conta):
        v = g.get((demo, conta))
        if not v:
            return np.nan, ""
        ini = min(x[0] for x in v)                                     # acumulado do ano: início mais antigo
        return next(x[2] for x in v if x[0] == ini), ini

    fim = dt.date.fromisoformat(dref)

    def tri(conta):
        """Coluna do trimestre (3 meses) da DRE do ITR, quando existe."""
        v = g.get(("DRE", conta))
        if not v:
            return np.nan
        ini = max(x[0] for x in v)
        if not ini or mes_idx(fim) - mes_idx(dt.date.fromisoformat(ini)) != 2:
            return np.nan
        return next(x[2] for x in v if x[0] == ini)

    at = bp("1")
    if not np.isfinite(at) or at <= 0:
        return None
    r = {"AT": at}
    # patrimônio líquido e lucro pela descrição (bancos e seguradoras usam outros códigos)
    pl_conta = next((c for (dm, c) in g if dm == "BPP" and c.count(".") == 1 and desc(c).upper().startswith("PATRIM")), None)
    r["PL"] = bp(pl_conta) if pl_conta else np.nan
    r["MINOR"], r["RES_LUC"], r["LUC_ACUM"], r["CAPITAL"] = 0.0, 0.0, 0.0, np.nan
    if pl_conta:
        for (dm, c) in g:
            if dm == "BPP" and c.startswith(pl_conta + ".") and c.count(".") == 2:
                ds = desc(c).upper()
                if "NAO CONTROLADORES" in sem_acento(ds):
                    r["MINOR"] = bp(c) or 0.0
                elif "RESERVAS DE LUCRO" in sem_acento(ds):
                    r["RES_LUC"] = bp(c) or 0.0
                elif "ACUMULADO" in sem_acento(ds) and "LUCRO" in sem_acento(ds):
                    r["LUC_ACUM"] = bp(c) or 0.0
                elif sem_acento(ds).startswith("CAPITAL SOCIAL"):
                    r["CAPITAL"] = bp(c)
    industrial = sem_acento(desc("1.01")).startswith("ATIVO CIRCULANTE")
    r["industrial"] = industrial
    if industrial:
        for nome, conta in [("AC", "1.01"), ("CAIXA", "1.01.01"), ("APLIC", "1.01.02"), ("RECEB", "1.01.03"),
                            ("ESTOQ", "1.01.04"), ("IMOB", "1.02.03"), ("INTANG", "1.02.04"), ("PC", "2.01"),
                            ("EMP_CP", "2.01.04"), ("PNC", "2.02"), ("EMP_LP", "2.02.01")]:
            r[nome] = bp(conta)
    # DRE: lucro do período (nível 2) e atribuído à controladora (nível 3)
    ll_conta = [c for (dm, c) in g if dm == "DRE" and c.count(".") == 1
                and re.match(r"LUCRO.*PREJUIZO.*PERIODO", sem_acento(desc(c)))]
    ini_ano = ""
    if ll_conta:
        r["LL"], ini_ano = fluxo("DRE", sorted(ll_conta)[-1])
        r["LL_T"] = tri(sorted(ll_conta)[-1])
        contr = [c for (dm, c) in g if dm == "DRE" and c.startswith(sorted(ll_conta)[-1] + ".")
                 and "CONTROLADORA" in sem_acento(desc(c))]
        r["LL_CONTR"] = fluxo("DRE", contr[0])[0] if contr else r["LL"]
        r["LL_CONTR_T"] = tri(contr[0]) if contr else r["LL_T"]
    else:
        r["LL"] = r["LL_CONTR"] = np.nan
    if industrial:
        for nome, conta in [("REC", "3.01"), ("CPV", "3.02"), ("LB", "3.03"), ("DV", "3.04.01"), ("DGA", "3.04.02"),
                            ("EBIT", "3.05")]:
            r[nome] = fluxo("DRE", conta)[0]
            r[nome + "_T"] = tri(conta)
    # DFC (método indireto ou direto)
    cfo, ini_dfc = fluxo("DFC", "6.01")
    r["CFO"] = cfo
    dep = capex = div = 0.0
    tem_dep = False
    for (dm, c), v in g.items():
        if dm != "DFC":
            continue
        ds = sem_acento(v[0][1])
        val = fluxo("DFC", c)[0]
        if not np.isfinite(val):
            continue
        if c.startswith("6.01.01.") and c.count(".") == 3 and re.search(r"DEPRECIA|AMORTIZA|EXAUST", ds) \
                and not re.search(r"AGIO|CUSTO DE TRANSAC|DESAGIO", ds):
            dep += val
            tem_dep = True
        elif c.startswith("6.02.") and c.count(".") == 2 and re.search(r"IMOBILIZADO|INTANGIVEL", ds) \
                and not re.search(r"VENDA|ALIENA|RECEBIMENTO|BAIXA", ds):
            capex -= val
        elif c.startswith("6.03.") and c.count(".") == 2 and re.search(r"DIVIDEND|JUROS SOBRE (O )?CAPITAL|JCP", ds) \
                and not re.search(r"RECEBID", ds):
            div -= val
    r["DEP"] = dep if tem_dep else np.nan
    r["CAPEX"] = capex
    r["DIV"] = div
    r["ini"] = ini_ano or ini_dfc
    return r


def sem_acento(s):
    import unicodedata
    return unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().upper()


FLUXOS = ["LL", "LL_CONTR", "REC", "CPV", "LB", "DV", "DGA", "EBIT", "CFO", "DEP", "CAPEX", "DIV"]
ESTOQUES = ["AT", "PL", "MINOR", "RES_LUC", "LUC_ACUM", "AC", "CAIXA", "APLIC", "RECEB", "ESTOQ", "IMOB", "INTANG",
            "PC", "EMP_CP", "PNC", "EMP_LP"]


# ------------------------------------------------------------------------------------- fotografia de uma empresa
class Foto:
    """Demonstrações de uma empresa como eram conhecidas num dia: período → registro (última versão entregue)."""

    def __init__(self, regs):
        self.p = {}
        for dref, rec in regs.items():
            d = dt.date.fromisoformat(dref)
            self.p[mes_idx(d)] = (d, rec)
        self.q = {}

    def bal(self, m, item):
        x = self.p.get(m)
        return x[1].get(item, np.nan) if x else np.nan

    def trimestre(self, m, item):
        """Valor do trimestre terminado no mês m (diferença entre acumulados do ano)."""
        ch = (m, item)
        if ch in self.q:
            return self.q[ch]
        v = np.nan
        x = self.p.get(m)
        if x and x[1].get("ini"):
            d, rec = x
            v = rec.get(item + "_T", np.nan)                             # DRE do ITR: a própria coluna do trimestre
            if not np.isfinite(v):
                ini = dt.date.fromisoformat(rec["ini"])
                meses = m - mes_idx(ini) + 1
                ytd = rec.get(item, np.nan)
                if meses == 3:
                    v = ytd
                elif meses in (6, 9, 12):
                    # acumulado do ano menos os trimestres anteriores do mesmo exercício (o 4º tri sai do anual)
                    ant = []
                    for i in range(1, meses // 3):
                        y = self.p.get(m - 3 * i)
                        ant.append(self.trimestre(m - 3 * i, item) if y and y[1].get("ini") == rec["ini"] else np.nan)
                    v = ytd - sum(ant) if all(np.isfinite(ant)) else np.nan
        self.q[ch] = v
        return v

    def ttm(self, m, item):
        v = [self.trimestre(m - 3 * i, item) for i in range(4)]
        if all(np.isfinite(v)):
            return float(sum(v))
        x = self.p.get(m)                                                # exercício fechado: o próprio anual
        if x and x[1].get("ini"):
            if m - mes_idx(dt.date.fromisoformat(x[1]["ini"])) + 1 == 12:
                return x[1].get(item, np.nan)
        return np.nan


def div0(a, b):
    return a / b if (np.isfinite(a) and np.isfinite(b) and b != 0) else np.nan


def razao_neutra(a, b):
    """Índice de Beneish: denominador zero ou sem dado → 1 (neutro)."""
    r = div0(a, b)
    return r if np.isfinite(r) else 1.0


def subitens_contabeis(f, m):
    """Subitens que só dependem das demonstrações (sem preço), no período-base m."""
    s = {}
    T = lambda it, k=0: f.ttm(m - 12 * k, it)                          # noqa: E731 — 12 meses terminados k anos antes
    B = lambda it, k=0: f.bal(m - 12 * k, it)                          # noqa: E731 — balanço k anos antes
    Q = lambda it, i=0: f.trimestre(m - 3 * i, it)                     # noqa: E731 — trimestre i trimestres antes
    at0, at1, at2 = B("AT"), B("AT", 1), B("AT", 2)
    pl_c = B("PL") - B("MINOR")
    ll, llc, cfo = T("LL"), T("LL_CONTR"), T("CFO")
    s.update(AT=at0, PL_CONTR=pl_c, LL_TTM=ll, LLC_TTM=llc, CFO_TTM=cfo, REC_TTM=T("REC"), LB_TTM=T("LB"),
             EBIT_TTM=T("EBIT"), DIV_TTM=T("DIV"))
    # ---- Pilar 2
    s["roe"] = div0(llc, pl_c) if pl_c > 0 else np.nan
    s["roa"] = div0(ll, at0)
    s["cfoa"] = div0(cfo, at0)
    s["gp_a"] = div0(T("LB"), at0)
    s["margem_bruta"] = div0(T("LB"), T("REC"))
    divida = B("EMP_CP") + B("EMP_LP")
    s["alavancagem"] = div0(divida, at0)
    s["cresc_gpoa_3a"] = div0(T("LB") - T("LB", 3), B("AT", 3))
    s["accruals"] = div0(ll - cfo, (at0 + at1) / 2)
    # Piotroski (2000): 9 testes, com ativo do início do ano
    roa_p, roa_p1 = div0(ll, at1), div0(T("LL", 1), at2)
    testes = [roa_p > 0 if np.isfinite(roa_p) else None,
              cfo > 0 if np.isfinite(cfo) else None,
              roa_p > roa_p1 if np.isfinite(roa_p) and np.isfinite(roa_p1) else None,
              div0(cfo, at1) > roa_p if np.isfinite(div0(cfo, at1)) and np.isfinite(roa_p) else None]
    lev0, lev1 = div0(B("EMP_LP"), (at0 + at1) / 2), div0(B("EMP_LP", 1), (at1 + at2) / 2)
    testes.append(lev0 <= lev1 if np.isfinite(lev0) and np.isfinite(lev1) else None)
    lc0, lc1 = div0(B("AC"), B("PC")), div0(B("AC", 1), B("PC", 1))
    testes.append(lc0 > lc1 if np.isfinite(lc0) and np.isfinite(lc1) else None)
    testes.append(None)                                                # emissão de ações: preenchido com a quantidade
    mb0, mb1 = div0(T("LB"), T("REC")), div0(T("LB", 1), T("REC", 1))
    testes.append(mb0 > mb1 if np.isfinite(mb0) and np.isfinite(mb1) else None)
    gi0, gi1 = div0(T("REC"), at1), div0(T("REC", 1), at2)
    testes.append(gi0 > gi1 if np.isfinite(gi0) and np.isfinite(gi1) else None)
    s["_piotroski"] = testes
    # Molodovsky: lucro normal, rentabilidade e distribuição dos 3 últimos exercícios (12 meses cada)
    lucros = [T("LL_CONTR", k) for k in range(3)]
    pls = [B("PL", k) - B("MINOR", k) for k in range(3)]
    divs = [T("DIV", k) for k in range(3)]
    s["E0"] = np.mean(lucros) if all(np.isfinite(lucros)) else np.nan
    roes = [div0(lucros[k], pls[k]) for k in range(3) if pls[k] > 0]
    s["R_molo"] = min(0.40, max(0.05, np.mean(roes))) if len(roes) == 3 and all(np.isfinite(roes)) else np.nan
    sl = sum(lucros) if all(np.isfinite(lucros)) else np.nan
    s["p_molo"] = min(1.0, max(0.0, sum(divs) / sl)) if np.isfinite(sl) and sl > 0 and all(np.isfinite(divs)) else np.nan
    # ---- Pilar 3
    dq = [Q("LL_CONTR", i) - Q("LL_CONTR", i + 4) for i in range(8)]
    dq_ok = [x for x in dq if np.isfinite(x)]
    if np.isfinite(dq[0]) and len(dq_ok) >= 4:
        dp = np.std(dq_ok, ddof=1)
        s["sue"] = dq[0] / dp if dp > 0 else np.nan
    else:
        s["sue"] = np.nan
    s["dlucro_ativo"] = div0(dq[0], B("AT", 1))
    # Mohanram (2005): sinais disponíveis na CVM (sem P&D e sem propaganda)
    s["m_roa"] = div0(ll, (at0 + at1) / 2)
    s["m_cfoa"] = div0(cfo, (at0 + at1) / 2)
    s["m_g3"] = (cfo > ll) if np.isfinite(cfo) and np.isfinite(ll) else None
    roa_q = [div0(Q("LL", i), f.bal(m - 3 * i, "AT")) for i in range(16)]
    roa_q = [x for x in roa_q if np.isfinite(x)]
    s["m_var_roa"] = np.var(roa_q, ddof=1) if len(roa_q) >= 8 else np.nan
    cr_q = [div0(Q("REC", i), Q("REC", i + 4)) - 1 for i in range(16)]
    cr_q = [x for x in cr_q if np.isfinite(x)]
    s["m_var_cresc"] = np.var(cr_q, ddof=1) if len(cr_q) >= 6 else np.nan
    s["m_capex"] = div0(T("CAPEX"), at1)
    # Lev; Thiagarajan (1993): despesas de vendas, gerais e administrativas contra a receita
    sga0, sga1 = -(T("DV") + T("DGA")), -(T("DV", 1) + T("DGA", 1))
    rec0, rec1 = T("REC"), T("REC", 1)
    if sga1 > 0 and rec1 > 0 and np.isfinite(sga0) and np.isfinite(rec0):
        s["lt_alav"] = -((sga0 / sga1 - 1) - (rec0 / rec1 - 1))
    else:
        s["lt_alav"] = np.nan
    # ---- Pilar 4: EM Score (Altman, 2005) e escore M (Beneish, 1999)
    passivo = B("PC") + B("PNC")
    x1 = div0(B("AC") - B("PC"), at0)
    x2 = div0(B("RES_LUC") + B("LUC_ACUM"), at0)
    x3 = div0(T("EBIT"), at0)
    x4 = div0(B("PL"), passivo)
    s["em_score"] = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4 + 3.25
    s.update(em_x1=x1, em_x2=x2, em_x3=x3, em_x4=x4)
    rec1_, rec0_ = T("REC", 1), T("REC")
    if rec0_ > 0 and rec1_ > 0 and at0 > 0 and at1 > 0:
        dsri = razao_neutra(div0(B("RECEB"), rec0_), div0(B("RECEB", 1), rec1_))
        gmi = razao_neutra(div0(T("LB", 1), rec1_), div0(T("LB"), rec0_))
        aq0 = 1 - div0(B("AC") + B("IMOB"), at0)
        aq1 = 1 - div0(B("AC", 1) + B("IMOB", 1), at1)
        aqi = razao_neutra(aq0, aq1)
        sgi = rec0_ / rec1_
        d0, d1 = T("DEP"), T("DEP", 1)
        depi = razao_neutra(div0(d1, d1 + B("IMOB", 1)), div0(d0, d0 + B("IMOB")))
        sgai = razao_neutra(div0(sga0, rec0_), div0(sga1, rec1_))
        lvgi = razao_neutra(div0(B("PC") + B("EMP_LP"), at0), div0(B("PC", 1) + B("EMP_LP", 1), at1))
        tata = div0(ll - cfo, at0)
        if np.isfinite(tata):
            b = BENEISH
            s["beneish_m"] = (b["const"] + b["DSRI"] * dsri + b["GMI"] * gmi + b["AQI"] * aqi + b["SGI"] * sgi
                              + b["DEPI"] * depi + b["SGAI"] * sgai + b["TATA"] * tata + b["LVGI"] * lvgi)
            s.update(bm_dsri=dsri, bm_gmi=gmi, bm_aqi=aqi, bm_sgi=sgi, bm_depi=depi, bm_sgai=sgai, bm_lvgi=lvgi,
                     bm_tata=tata)
    s.setdefault("beneish_m", np.nan)
    s["EMP_CP"], s["EMP_LP"], s["CAIXA"], s["APLIC"], s["MINOR"] = B("EMP_CP"), B("EMP_LP"), B("CAIXA"), B("APLIC"), B("MINOR")
    return s


def periodo_base(f, dia):
    """Período mais recente com lucro de 12 meses, até 15 meses antes do dia."""
    for m in sorted(f.p, reverse=True):
        d = f.p[m][0]
        if (dia - d).days > DEFASAGEM_MAX:
            return None
        if np.isfinite(f.ttm(m, "LL")):
            return m
    return None


# ---------------------------------------------------------------------------------------- ações e valor de mercado
def ler_acoes(pasta, cnpj_cd):
    """Registros de quantidade de ações por empresa: (disponível_em, data_da_quantidade, ON, PN, fonte)."""
    out = defaultdict(list)
    ent = {}
    for f in glob.glob(os.path.join(pasta, "cvm_*_entregas.csv.gz")) + glob.glob(os.path.join(pasta, "cvm_fre_*_indice.csv.gz")):
        e = pd.read_csv(f, dtype=str, usecols=["CNPJ_CIA", "DT_REFER", "VERSAO", "DT_RECEB"]).dropna()
        for r in e.itertuples():
            ent[(r.CNPJ_CIA, r.DT_REFER, int(r.VERSAO), "fre" if "_fre_" in f else "dem")] = r.DT_RECEB
    for f in glob.glob(os.path.join(pasta, "cvm_*_capital.csv.gz")):
        c = pd.read_csv(f, dtype=str)
        for r in c.itertuples():
            rec = ent.get((r.CNPJ_CIA, r.DT_REFER, int(r.VERSAO), "dem"))
            cd = cnpj_cd.get(r.CNPJ_CIA)
            if not rec or not cd:
                continue
            on = float(r.QT_ACAO_ORDIN_CAP_INTEGR or 0) - float(r.QT_ACAO_ORDIN_TESOURO or 0)
            pn = float(r.QT_ACAO_PREF_CAP_INTEGR or 0) - float(r.QT_ACAO_PREF_TESOURO or 0)
            if on + pn > 0:
                out[cd].append((rec, r.DT_REFER, on, pn, "DFP/ITR"))
    for f in glob.glob(os.path.join(pasta, "cvm_fre_*_capital_social.csv.gz")):
        c = pd.read_csv(f, dtype=str)
        c = c[c.Tipo_Capital.str.contains("Integralizado", na=False)]
        for r in c.itertuples():
            cd = cnpj_cd.get(r.CNPJ_Companhia)
            rec = ent.get((r.CNPJ_Companhia, r.Data_Referencia, int(r.Versao), "fre"))
            if not cd or not rec:
                continue
            on, pn = float(r.Quantidade_Acoes_Ordinarias or 0), float(r.Quantidade_Acoes_Preferenciais or 0)
            aprov = str(r.Data_Autorizacao_Aprovacao or "")[:10]
            disp = min(rec, aprov) if re.match(r"\d{4}-\d{2}-\d{2}", aprov) else rec
            if on + pn > 0:
                out[cd].append((disp, rec, on, pn, "FRE"))
    # a composição do capital das DFP/ITR não informa a escala: muitas empresas declaram em milhares de ações.
    # A escala é decidida pelo FRE (sempre em unidades) mais próximo no tempo: razão entre 300 e 3.000 → × 1.000.
    global ESCALA_CORRIGIDA
    for cd, regs in out.items():
        fre = [(r[1], r[2] + r[3]) for r in regs if r[4] == "FRE"]
        novos = []
        for r in regs:
            if r[4] == "DFP/ITR" and fre:
                tot_fre = min(fre, key=lambda x: abs((dt.date.fromisoformat(x[0][:10]) - dt.date.fromisoformat(r[1])).days))[1]
                if 300 <= tot_fre / (r[2] + r[3]) <= 3000:
                    r = (r[0], r[1], r[2] * 1000, r[3] * 1000, "DFP/ITR (mil)")
                    ESCALA_CORRIGIDA.add(cd)
            novos.append(r)
        out[cd] = sorted(novos, key=lambda x: (x[0], x[1]))
    return out


ESCALA_CORRIGIDA = set()


def acoes_em(regs, dia_txt):
    """Último registro disponível até o dia (DFP/ITR tem preferência sobre o FRE da mesma data)."""
    ok = [r for r in regs if r[0] <= dia_txt]
    if not ok:
        return None
    sem_futuro = [r for r in ok if r[1] <= dia_txt]
    if sem_futuro:
        return max(sem_futuro, key=lambda r: (r[0], r[1]))
    m = max(r[0] for r in ok)                          # só há registro entregue depois: o mais próximo do dia
    return min((r for r in ok if r[0] == m), key=lambda r: r[1])


class Precos:
    """Preços originais e ajustados por papel, para valor de mercado e correção da quantidade de ações."""

    def __init__(self, d):
        self.s = {}
        for papel, g in d.groupby("papel", sort=False):
            self.s[papel] = (g["data"].to_numpy(), g["fechamento"].to_numpy(float), g["fech_aj"].to_numpy(float),
                             g["volume_fin"].to_numpy(float), g["ticker"].to_numpy())

    def ultimo(self, papel, dia, janela_dias=31):
        datas, fe, aj, _, tk = self.s[papel]
        j = np.searchsorted(datas, np.datetime64(dia), side="right") - 1
        if j < 0 or (np.datetime64(dia) - datas[j]).astype("timedelta64[D]").astype(int) > janela_dias:
            return None
        return fe[j], fe[j] / aj[j], tk[j]

    def fator_em(self, papel, dia):
        """fechamento ÷ preço ajustado no pregão mais próximo do dia (muda só em desdobramentos e grupamentos)."""
        datas, fe, aj, _, _ = self.s[papel]
        j = np.searchsorted(datas, np.datetime64(dia))
        j = min(max(j, 0), len(datas) - 1)
        return fe[j] / aj[j]

    def volume(self, papel, ini, fim):
        datas, _, _, v, _ = self.s[papel]
        a, b = np.searchsorted(datas, np.datetime64(ini), side="right"), np.searchsorted(datas, np.datetime64(fim), side="right")
        return v[a:b].sum()


def classe(ticker):
    m = re.search(r"(11|[3-8])$", str(ticker))
    return {"3": "ON", "11": "UNT"}.get(m.group(1), "PN") if m else None


# --------------------------------------------------------------------------------------------- Molodovsky
def valor_molodovsky(g, R, pi, k, variante):
    """V(g)/E0. Variante A (registrada): D = E(1 − g/R). Variante B: D = p·E nas fases 1 e 2 (p = distribuição)."""
    E, v, desc = 1.0, 0.0, 1.0
    for s in range(1, 31):
        gs = g if s <= 10 else g - (g - pi) * (s - 10) / 20
        E *= 1 + gs
        desc /= 1 + k
        v += (E * (1 - gs / R) if variante[0] == "A" else E * variante[1]) * desc
    return v + E * (1 + pi) * (1 - pi / R) / (k - pi) * desc


def g_implicito(pe, R, pi, k, variante):
    lo, hi = -0.20, 0.60
    vlo, vhi = valor_molodovsky(lo, R, pi, k, variante), valor_molodovsky(hi, R, pi, k, variante)
    sobe = vhi > vlo
    alvo_alto, alvo_baixo = (vhi, vlo) if sobe else (vlo, vhi)
    if pe >= alvo_alto:
        return hi                                       # nem o crescimento mais exigente justifica o preço
    if pe <= alvo_baixo:
        return lo
    for _ in range(60):
        mid = (lo + hi) / 2
        vm = valor_molodovsky(mid, R, pi, k, variante)
        if (vm < pe) == sobe:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# --------------------------------------------------------------------------------------------- padronização
def zrob(x):
    x = pd.Series(x, dtype=float)
    med = x.median()
    mad = (x - med).abs().median() * 1.4826
    if not np.isfinite(mad) or mad == 0:
        return pd.Series(0.0, index=x.index).where(x.notna())
    return ((x - med) / mad).clip(-3, 3)


# --------------------------------------------------------------------------------------------- principal
def main():
    global TOLERANCIA
    ap = argparse.ArgumentParser()
    for a in ("--ajustada", "--referencias", "--cvm", "--motor"):
        ap.add_argument(a, required=True)
    ap.add_argument("--meses", default="", help="só estes meses (teste), ex.: 2019-06,2025-03")
    ap.add_argument("--tolerancia", type=int, default=TOLERANCIA)
    ap.add_argument("--sufixo", default="")
    a = ap.parse_args()
    TOLERANCIA = a.tolerancia

    u = pd.read_csv(os.path.join(a.motor, "universo_mensal.csv.gz"), dtype={"cd_cvm": str, "mes": str})
    eleg = u[u.elegivel].copy()
    eleg["cd_cvm"] = eleg.cd_cvm.fillna("")
    print(f"Elegíveis (ação × mês): {len(eleg)}", flush=True)

    partes = []
    for f in sorted(glob.glob(os.path.join(a.ajustada, "diario_*.csv.gz"))):
        partes.append(pd.read_csv(f, usecols=["papel", "ticker", "isin", "data", "fechamento", "fech_aj", "ret_total",
                                              "volume_fin"], dtype={"papel": str, "ticker": str, "isin": str}))
    d = pd.concat(partes, ignore_index=True)
    d["data"] = pd.to_datetime(d["data"]).values.astype("datetime64[D]")
    d = d.sort_values(["papel", "data"]).reset_index(drop=True)
    cal = np.array(sorted(d["data"].unique()), dtype="datetime64[D]")
    fm = pd.Series(cal).groupby(pd.Series(cal.astype("datetime64[ns]")).dt.to_period("M")).max()
    fim_mes = {str(k): np.datetime64(pd.Timestamp(v).date(), "D") for k, v in fm.items()}
    if a.meses:
        eleg = eleg[eleg.mes.isin(a.meses.split(","))]
    precos = Precos(d)
    d["emissor"] = d["isin"].str[2:6]
    papeis_emissor = d.groupby("emissor")["papel"].unique().to_dict()

    # risco (Pilar 4): volatilidade e beta de 252 pregões contra o mercado do NEFIN
    nef = pd.read_csv(os.path.join(a.referencias, "nefin_factors.csv.gz"))
    nef["data"] = pd.to_datetime(nef["Date"]).values.astype("datetime64[D]")
    mkt = dict(zip(nef.data, nef.Rm_minus_Rf))
    rf = dict(zip(nef.data, nef.Risk_Free))
    risco = {}
    meses_papel = eleg.groupby("papel")["mes"].apply(list).to_dict()
    for papel, g in d[d.papel.isin(set(eleg.papel))].groupby("papel", sort=False):
        datas, ret = g["data"].to_numpy(), g["ret_total"].to_numpy(float)
        rm = np.array([mkt.get(x, np.nan) for x in datas])
        rr = np.array([rf.get(x, np.nan) for x in datas])
        for mes in meses_papel[papel]:
            t = fim_mes[mes]
            kt = np.searchsorted(cal, t)
            ini = cal[max(0, kt - 251)]
            a0, b0 = np.searchsorted(datas, ini), np.searchsorted(datas, t, side="right")
            r = ret[a0:b0]
            vol = np.nanstd(r, ddof=1) * math.sqrt(252) if np.isfinite(r).sum() >= 150 else np.nan
            x, y = rm[a0:b0], r - rr[a0:b0]
            ok = np.isfinite(x) & np.isfinite(y)
            beta = np.cov(y[ok], x[ok])[0, 1] / np.var(x[ok], ddof=1) if ok.sum() >= 150 else np.nan
            risco[(mes, papel)] = (vol, beta)
    print("Risco calculado", flush=True)

    docs, valores, cnpj_cd = ler_cvm(a.cvm)
    acoes = ler_acoes(a.cvm, cnpj_cd)
    print(f"Empresas com demonstrações: {len(docs)}; com quantidade de ações: {len(acoes)}; "
          f"composição do capital em milhares (corrigida pelo FRE): {len(ESCALA_CORRIGIDA)}", flush=True)
    ntnb = pd.read_csv(os.path.join(a.referencias, "ntnb_mais_longa.csv.gz"))
    focus = pd.read_csv(os.path.join(a.referencias, "focus_ipca_ano_seguinte.csv.gz"))
    ntnb_d, ntnb_v = ntnb.data.to_numpy(str), ntnb.juro_real_aa.to_numpy(float) / 100
    foc_d, foc_v = focus.data.to_numpy(str), focus.ipca_ano_seguinte.to_numpy(float) / 100

    def ultimo_valor(datas, vals, dia):
        j = np.searchsorted(datas, dia, side="right") - 1
        return vals[j] if j >= 0 else np.nan

    cache = {}
    linhas = []
    for r in eleg.itertuples():
        t = fim_mes[r.mes].astype(object)
        dia_txt = t.isoformat()
        lin = {"mes": r.mes, "papel": r.papel, "ticker": r.ticker, "cd_cvm": r.cd_cvm, "setor": r.setor,
               "financeiro": r.setor == "Financeiro", "amihud63": r.amihud_63}
        lin["vol252"], lin["beta252"] = risco.get((r.mes, r.papel), (np.nan, np.nan))
        cd = r.cd_cvm
        if cd and cd in docs:
            # fotografia: para cada período, a última versão entregue até o dia
            escolha = {}
            for dref, ver, receb in docs[cd]:
                if receb <= dia_txt and ver >= escolha.get(dref, (0, ""))[0]:
                    escolha[dref] = (ver, receb)
            chave = (cd, tuple(sorted((k, v[0]) for k, v in escolha.items())))
            if chave not in cache:
                f = Foto({k: valores[(cd, k, v[0])] for k, v in escolha.items()})
                m = periodo_base(f, t)
                cache.clear() if len(cache) > 20000 else None
                cache[chave] = (f, m, subitens_contabeis(f, m) if m is not None else None)
            f, m, s = cache[chave]
            if s is not None:
                lin["dt_refer"] = f.p[m][0].isoformat()
                lin["dt_receb"] = max(v[1] for v in escolha.values())
                lin["industrial"] = bool(f.p[m][1].get("industrial"))
                lin.update({k: v for k, v in s.items() if not k.startswith("_")})
                # valor de mercado: ON × preço da ON + PN × preço da PN, quantidade corrigida por desdobramentos
                ac = acoes_em(acoes.get(cd, []), dia_txt)
                vm, fonte = valor_mercado(precos, papeis_emissor.get(r.emissor, []), ac, t)
                lin["valor_mercado"], lin["fonte_acoes"] = vm, fonte
                if ac:
                    lin["acoes_data"] = ac[1]
                # emissão de ações (teste 7 de Piotroski): quantidade corrigida contra a de 12 meses antes
                t1 = (pd.Timestamp(t) - pd.DateOffset(years=1)).date()
                ac1 = acoes_em(acoes.get(cd, []), t1.isoformat())
                pio = list(s["_piotroski"])
                if ac and ac1:
                    q0 = qtd_corrigida(precos, papeis_emissor.get(r.emissor, []), ac, t)
                    q1 = qtd_corrigida(precos, papeis_emissor.get(r.emissor, []), ac1, t)
                    if q0 and q1:
                        pio[6] = q0 <= q1 * 1.01
                feitos = [x for x in pio if x is not None]
                lin["piotroski"] = sum(feitos) * 9 / len(feitos) if len(feitos) >= 7 else np.nan
                lin["piotroski_testes"] = len(feitos)
                if np.isfinite(vm) and vm > 0:
                    ev = vm + (s["EMP_CP"] or 0) + (s["EMP_LP"] or 0) - (s["CAIXA"] or 0) - (s["APLIC"] or 0) + (s["MINOR"] or 0)
                    lin["ev"] = ev
                    lin["ebit_ev"] = s["EBIT_TTM"] / ev if ev > 0 and np.isfinite(s["EBIT_TTM"]) else np.nan
                    # giro: volume médio diário de todas as classes em 252 pregões ÷ valor de mercado
                    kt = np.searchsorted(cal, np.datetime64(t))
                    ini = cal[max(0, kt - 252)]
                    vol = sum(precos.volume(p, ini, np.datetime64(t)) for p in papeis_emissor.get(r.emissor, []))
                    lin["giro"] = vol / 252 / vm
                    # Molodovsky
                    pi = ultimo_valor(foc_d, foc_v, dia_txt)
                    rr = ultimo_valor(ntnb_d, ntnb_v, dia_txt)
                    k = rr + pi + PREMIO
                    lin.update(pi=pi, k=k)
                    E0, R, p = s["E0"], s["R_molo"], s["p_molo"]
                    if np.isfinite(E0) and E0 > 0 and np.isfinite(R) and np.isfinite(pi) and np.isfinite(k):
                        pe = vm / E0
                        lin["pe_normal"] = pe
                        ga = g_implicito(pe, R, pi, k, ("A",))
                        lin["g_impl_a"] = ga
                        if np.isfinite(p):
                            lin["folga_a"] = R * (1 - p) - ga
                            gb = g_implicito(pe, R, pi, k, ("B", p))
                            lin["g_impl_b"] = gb
                            lin["folga_b"] = R * (1 - p) - gb
        linhas.append(lin)
    df = pd.DataFrame(linhas)
    print(f"Linhas: {len(df)}", flush=True)

    # Subitens que dependem do corte do mês: QMJ simplificado e Mohanram (medianas do setor)
    df["qmj"] = np.nan
    df["mohanram"] = np.nan
    for (mes, setor), g in df.groupby(["mes", "setor"]):
        idx = g.index
        if "roe" not in g:
            continue
        if setor == "Financeiro":
            df.loc[idx, "qmj"] = zrob(g["roe"]).values
            continue
        prof = pd.concat([zrob(g[c]) for c in ["roe", "roa", "cfoa", "margem_bruta", "gp_a"]], axis=1).mean(axis=1)
        cresc = zrob(g["cresc_gpoa_3a"])
        seg = zrob(-g["alavancagem"])
        df.loc[idx, "qmj"] = pd.concat([prof, cresc, seg], axis=1).mean(axis=1).values
        testes = pd.DataFrame(index=idx)
        testes["g1"] = (g.m_roa > g.m_roa.median()).where(g.m_roa.notna())
        testes["g2"] = (g.m_cfoa > g.m_cfoa.median()).where(g.m_cfoa.notna())
        testes["g3"] = g.m_g3.map(lambda x: np.nan if x is None or (isinstance(x, float) and np.isnan(x)) else float(x))
        testes["g4"] = (g.m_var_roa < g.m_var_roa.median()).where(g.m_var_roa.notna())
        testes["g5"] = (g.m_var_cresc < g.m_var_cresc.median()).where(g.m_var_cresc.notna())
        testes["g7"] = (g.m_capex > g.m_capex.median()).where(g.m_capex.notna())
        tt = testes.astype(float)
        n = tt.notna().sum(axis=1)
        df.loc[idx, "mohanram"] = (tt.sum(axis=1) * 6 / n).where(n >= 4).values
    # financeiras: só rentabilidade (ROE), Molodovsky e surpresa de lucro
    fin = df.financeiro
    for c in ["piotroski", "gp_a", "accruals", "ebit_ev", "dlucro_ativo", "mohanram", "lt_alav", "em_score", "beneish_m"]:
        if c in df:
            df.loc[fin, c] = np.nan

    os.makedirs(a.motor, exist_ok=True)
    cols_fora = [c for c in df.columns if c.startswith("m_") and c not in ("mes",)]
    df.drop(columns=cols_fora).to_csv(os.path.join(a.motor, f"fundamentos_mensal{a.sufixo}.csv.gz"), index=False, compression="gzip")
    conferencia(df, docs, valores, acoes, a.motor)


def qtd_corrigida(precos, papeis, ac, t):
    """Quantidade total de ações na base de preços do dia t (desdobramentos e grupamentos entre as datas)."""
    disp, dref, on, pn, _ = ac
    tot = 0.0
    for qtd, cl in ((on, "ON"), (pn, "PN")):
        if qtd <= 0:
            continue
        cand = [p for p in papeis if classe(precos.s[p][4][-1]) == cl and precos.ultimo(p, t, 400)]
        if not cand:
            cand = [p for p in papeis if classe(precos.s[p][4][-1]) in ("ON", "PN") and precos.ultimo(p, t, 400)]
        if not cand:
            return None
        p = max(cand, key=lambda x: precos.volume(x, np.datetime64(t) - np.timedelta64(365, "D"), np.datetime64(t)))
        tot += qtd * precos.fator_em(p, dt.date.fromisoformat(dref[:10])) / precos.ultimo(p, t, 400)[1]
    return tot


def valor_mercado(precos, papeis, ac, t):
    if not ac:
        return np.nan, ""
    disp, dref, on, pn, fonte = ac
    vm = 0.0
    for qtd, cl in ((on, "ON"), (pn, "PN")):
        if qtd <= 0:
            continue
        cand = [p for p in papeis if classe(precos.s[p][4][-1]) == cl and precos.ultimo(p, t)]
        if not cand:                                       # classe sem negócio no mês: preço da outra classe
            cand = [p for p in papeis if classe(precos.s[p][4][-1]) in ("ON", "PN") and precos.ultimo(p, t)]
        if not cand:
            return np.nan, fonte
        p = max(cand, key=lambda x: precos.volume(x, np.datetime64(t) - np.timedelta64(63, "D"), np.datetime64(t)))
        preco, fator_t, _ = precos.ultimo(p, t)
        fator_d = precos.fator_em(p, dt.date.fromisoformat(dref[:10]))
        vm += qtd * (fator_d / fator_t) * preco
    return vm, fonte


# --------------------------------------------------------------------------------------------- conferência
def conferencia(df, docs, valores, acoes, saida):
    L = ["# Conferência — motor do Score, etapa 2 (subitens com balanço e de risco)\n"]
    sub = ["giro", "piotroski", "gp_a", "qmj", "accruals", "ebit_ev", "folga_a", "folga_b", "sue", "dlucro_ativo",
           "mohanram", "lt_alav", "vol252", "beta252", "amihud63", "em_score", "beneish_m"]
    L.append("## Cobertura: % das ações elegíveis com o subitem (dezembro de cada ano)\n")
    L.append("| Ano | Ações | " + " | ".join(sub) + " |\n|" + "---|" * (len(sub) + 2))
    for ano in range(2011, 2027):
        mes = f"{ano}-12" if ano < 2026 else df.mes.max()
        g = df[df.mes == mes]
        if len(g):
            L.append(f"| {ano} | {len(g)} | " + " | ".join(f"{g[c].notna().mean():.0%}" if c in g else "-" for c in sub) + " |")
    L.append("\n## Distribuição de cada subitem (todos os meses de 2013 em diante, sem financeiras)\n")
    L.append("| Subitem | p5 | p25 | mediana | p75 | p95 |\n|---|---|---|---|---|---|")
    q = df[(df.mes >= "2013-01") & ~df.financeiro]
    for c in sub:
        if c in q:
            v = q[c].dropna()
            if len(v):
                L.append(f"| {c} | " + " | ".join(f"{v.quantile(x):.3g}" for x in (0.05, 0.25, 0.5, 0.75, 0.95)) + " |")
    if "g_impl_a" in df:
        mol = df[(df.mes >= "2013-01")].dropna(subset=["g_impl_a", "R_molo", "k"])
        abaixo = (mol.R_molo < mol.k).mean()
        teto_a = (mol.g_impl_a >= 0.5999).mean()
        teto_b = (mol.g_impl_b.dropna() >= 0.5999).mean()
        L.append(f"\n## Molodovsky: R abaixo de k em {abaixo:.0%} dos casos; crescimento implícito no teto de 60%: "
                 f"{teto_a:.0%} na fórmula registrada (A) e {teto_b:.0%} na variante B\n")
        L.append("Na fórmula registrada, D = E·(1 − g/R): quando a rentabilidade R é menor que a taxa exigida k, crescer "
                 "destrói valor e V(g) cai com g. Aí nenhum crescimento justifica um preço acima de V(−20%), e o g* vai "
                 "para o teto. Na variante B, a distribuição observada p vale nas fases 1 e 2 (D = p·E), V(g) sempre "
                 "sobe com g e o g* fica no teto só em casos extremos.")
        L.append(f"\n- Correlação de postos da Folga A com o lucro normal sobre o preço (E/P): "
                 f"{-mol[['folga_a', 'pe_normal']].corr('spearman').iloc[0, 1]:.2f}")
        if "folga_b" in mol:
            L.append(f"- Correlação de postos da Folga B com E/P: {-mol[['folga_b', 'pe_normal']].corr('spearman').iloc[0, 1]:.2f}")
    for cd, em, nome in CONFERIR:
        L.append(f"\n## {nome} (código CVM {cd})\n")
        for mes in MESES_CONF:
            r = df[(df.mes == mes) & (df.cd_cvm == cd)]
            if not len(r):
                L.append(f"- {mes}: fora do universo ou sem dado")
                continue
            r = r.iloc[0]
            L.append(f"### {mes} — {r.ticker}; balanço-base {r.get('dt_refer', '-')}; última entrega usada {r.get('dt_receb', '-')}\n")
            itens = [("Receita 12m", "REC_TTM", "R$ bi"), ("Lucro bruto 12m", "LB_TTM", "R$ bi"), ("EBIT 12m", "EBIT_TTM", "R$ bi"),
                     ("Lucro líquido 12m", "LL_TTM", "R$ bi"), ("Lucro da controladora 12m", "LLC_TTM", "R$ bi"),
                     ("Caixa das operações 12m", "CFO_TTM", "R$ bi"), ("Dividendos e JCP pagos 12m", "DIV_TTM", "R$ bi"),
                     ("Ativo total", "AT", "R$ bi"), ("Patrimônio da controladora", "PL_CONTR", "R$ bi"),
                     ("Empréstimos CP", "EMP_CP", "R$ bi"), ("Empréstimos LP", "EMP_LP", "R$ bi"),
                     ("Caixa + aplicações", None, "R$ bi"), ("Valor de mercado", "valor_mercado", "R$ bi"),
                     ("Valor da firma (EV)", "ev", "R$ bi")]
            L.append("| Item | Valor |\n|---|---|")
            for rot, c, un in itens:
                v = (r.get("CAIXA", np.nan) + r.get("APLIC", np.nan)) if c is None else r.get(c, np.nan)
                L.append(f"| {rot} | {v / 1e9:,.2f} |".replace(",", "X").replace(".", ",").replace("X", "."))
            L.append(f"| Ações: fonte e data | {r.get('fonte_acoes', '-')} {r.get('acoes_data', '-')} |")
            sub2 = ["piotroski", "gp_a", "roe", "qmj", "accruals", "ebit_ev", "E0", "R_molo", "p_molo", "pi", "k", "pe_normal",
                    "g_impl_a", "folga_a", "g_impl_b", "folga_b", "sue", "dlucro_ativo", "mohanram", "lt_alav", "giro",
                    "vol252", "beta252", "em_score", "em_x1", "em_x2", "em_x3", "em_x4", "beneish_m"]
            L.append("\n| Subitem | Valor |\n|---|---|")
            for c in sub2:
                v = r.get(c, np.nan)
                if c == "E0":
                    v = v / 1e9
                L.append(f"| {c}{' (R$ bi)' if c == 'E0' else ''} | {v:.4g} |" if isinstance(v, (float, int, np.floating)) and np.isfinite(v) else f"| {c} | sem dado |")
    with open(os.path.join(saida, "conferencia_etapa2.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
