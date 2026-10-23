"""
SOLIDUNS — SCORE EXPONENCIAL: MOTOR DE CÁLCULO (metodologia v1.0.3) — etapa 1: universo mensal e Pilar 1 (Momentum)
v1.1 (22/10/2026) — setores abreviados no cadastro da CVM ("Máqs.", "Const. Civil") deixam de cair em "Outros"

Lê as bases de pesquisa (Releases em rascunho): pesquisa-b3-ajustada (diário e papéis), pesquisa-referencias
(ligação B3 → CVM) e pesquisa-cvm (cadastro: setor). Calcula, no ÚLTIMO PREGÃO DE CADA MÊS, só com dados até
aquele dia:

CAMADA 2 — UNIVERSO (registro prévio, cap. 2 da metodologia)
  - ação ou unit de empresa (ISIN de cotas de fundo, "CTF", fica de fora: ETFs e fundos);
  - negociada nos últimos 5 pregões do mercado;
  - histórico de pelo menos 252 pregões negociados;
  - volume financeiro médio dos últimos 63 pregões do mercado (dias sem negócio contam zero) de R$ 1 milhão ou mais;
  - iliquidez de Amihud (média de |retorno| ÷ volume em R$ milhões, 63 pregões) fora do décimo pior entre as
    que passaram nos filtros anteriores;
  - uma classe por empresa: a de maior volume médio (emissor = letras 3 a 6 do ISIN).
  Setor: setor de atividade da CVM (holdings levadas ao setor principal), em 12 grupos (SETORES abaixo).

PILAR 1 — MOMENTUM DE PREÇO (subitens com o índice de retorno total e o preço ajustado)
  - r12_1   retorno de t−12 a t−1 meses (Jegadeesh; Titman, 1993; Carhart, 1997)
  - r7_12   retorno de t−12 a t−7 meses (Novy-Marx, 2012)
  - max52   preço ajustado ÷ máxima dos últimos 252 pregões (George; Hwang, 2004)
  - caminho −ID, ID = sinal(r12_1) × (% dias de queda − % dias de alta) na janela de t−12 a t−1 (Da; Gurun; Warachka, 2014)
  - mm200   preço ajustado ÷ média dos últimos 200 pregões negociados − 1 (Brock; Lakonishok; LeBaron, 1992)
  - o subitem de volume (giro, Lee; Swaminathan, 2000) precisa da quantidade de ações da CVM: entra na etapa 2.

Saída: universo_mensal.csv.gz (todos os papéis avaliados, com o motivo de exclusão), momentum_mensal.csv.gz
(só os elegíveis) e conferencia_etapa1.md.
Uso: python coletor/score_motor.py --ajustada A --referencias R --cvm C --saida S [--desde 2006-01]
"""
import argparse
import glob
import os
import re
import unicodedata

import numpy as np
import pandas as pd

VOL_MIN = 1_000_000.0
JANELA_LIQ = 63
HIST_MIN = 252
ATIVO_MAX = 5
SETORES = {
    "Financeiro": ["BANCOS", "SEGURADORAS", "INTERMEDIACAO FINANCEIRA", "ARRENDAMENTO", "CREDITO IMOBILIARIO",
                   "SECURITIZACAO", "BOLSAS DE VALORES", "FACTORING"],
    "Utilidade pública": ["ENERGIA ELETRICA", "SANEAMENTO"],
    "Petróleo, gás e mineração": ["PETROLEO E GAS", "EXTRACAO MINERAL"],
    "Materiais básicos": ["METALURGIA", "PAPEL E CELULOSE", "PETROQUIMICOS", "EMBALAGENS", "REFLORESTAMENTO", "QUIMIC"],
    "Bens industriais": ["MAQUINAS", "MAQS.", "OUTRAS ATIVIDADES INDUSTRIAIS"],
    "Transporte e logística": ["TRANSPORTE"],
    "Construção e imóveis": ["CONSTRUCAO", "CONST. CIVIL"],
    "Consumo cíclico": ["COMERCIO", "TEXTIL", "HOSPEDAGEM", "BRINQUEDOS", "EDUCACAO", "GRAFICAS"],
    "Consumo não cíclico": ["ALIMENTOS", "BEBIDAS", "AGRICULTURA", "PESCA"],
    "Saúde": ["SERVICOS MEDICOS", "FARMACEUTICO"],
    "Tecnologia e telecomunicações": ["TELECOMUNICACOES", "COMUNICACAO E INFORMATICA"],
}


def sem_acento(s):
    return unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().upper()


def setor_de(setor_cvm):
    s = re.sub(r"^EMP\. ADM\. PART\.\s*-\s*", "", sem_acento(setor_cvm))
    for grupo, chaves in SETORES.items():
        if any(k in s for k in chaves):
            return grupo
    return "Outros"


def ler_diario(pasta):
    partes = []
    for f in sorted(glob.glob(os.path.join(pasta, "diario_*.csv.gz"))):
        partes.append(pd.read_csv(f, usecols=["papel", "ticker", "isin", "data", "fech_aj", "ret_total", "indice_rt", "volume_fin"],
                                  dtype={"papel": str, "ticker": str, "isin": str, "data": str}))
    d = pd.concat(partes, ignore_index=True)
    d["data"] = pd.to_datetime(d["data"])
    return d.sort_values(["papel", "data"]).reset_index(drop=True)


def main():
    ap = argparse.ArgumentParser()
    for a in ("--ajustada", "--referencias", "--cvm", "--saida"):
        ap.add_argument(a, required=True)
    ap.add_argument("--desde", default="2006-01")
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)

    d = ler_diario(a.ajustada)
    cal = np.array(sorted(d["data"].unique()))                       # calendário do mercado
    pos = {t: i for i, t in enumerate(cal)}
    d["k"] = d["data"].map(pos).astype(int)
    fim_mes = pd.Series(cal).groupby(pd.Series(cal).dt.to_period("M")).max()
    fim_mes = fim_mes[fim_mes.index >= pd.Period(a.desde, "M")]

    lig = pd.read_csv(os.path.join(a.referencias, "ligacao_b3_cvm.csv.gz"), dtype=str).fillna("")
    cad = pd.read_csv(os.path.join(a.cvm, "cvm_cadastro.csv.gz"), sep=";", dtype=str).fillna("")
    cad["cd"] = cad.CD_CVM.str.lstrip("0")
    setor_cvm = dict(zip(cad.cd, cad.SETOR_ATIV))
    papel_cd = dict(zip(lig.papel, lig.cd_cvm))

    linhas_u, linhas_m = [], []
    for papel, g in d.groupby("papel", sort=False):
        isin = g["isin"].iloc[-1]
        if len(isin) == 12 and isin[6:9] == "CTF":
            continue                                                   # cotas de fundos e ETFs
        k = g["k"].to_numpy()
        idx = g["indice_rt"].to_numpy(float)
        preco = g["fech_aj"].to_numpy(float)
        ret = g["ret_total"].to_numpy(float)
        vol = g["volume_fin"].to_numpy(float)
        cumvol = np.concatenate([[0.0], np.cumsum(vol)])
        with np.errstate(divide="ignore", invalid="ignore"):
            illiq = np.where(vol > 0, np.abs(ret) / (vol / 1e6), np.nan)
        emissor = isin[2:6]
        cd = papel_cd.get(papel, "")
        setor = setor_de(setor_cvm.get(cd, "")) if cd else "Sem ligação CVM"
        for mes, t in fim_mes.items():
            kt = pos[t]
            j = np.searchsorted(k, kt, side="right") - 1               # último pregão do papel até t
            if j < 0:
                continue
            if kt - k[j] >= 63 * 6:                                    # já saiu da bolsa há muito tempo
                continue
            motivo = ""
            if kt - k[j] > ATIVO_MAX:
                motivo = "sem negócio nos últimos 5 pregões"
            elif j + 1 < HIST_MIN:
                motivo = "histórico menor que 252 pregões"
            ini = np.searchsorted(k, kt - JANELA_LIQ + 1)               # pregões do papel na janela de 63 do mercado
            vol63 = (cumvol[j + 1] - cumvol[ini]) / JANELA_LIQ
            ami = np.nanmean(illiq[ini:j + 1]) if j + 1 > ini else np.nan
            if not motivo and vol63 < VOL_MIN:
                motivo = "volume médio abaixo de R$ 1 milhão"
            linhas_u.append((str(mes), papel, g["ticker"].iloc[j], emissor, cd, setor, round(vol63, 2),
                             ami if np.isfinite(ami) else np.nan, j + 1, motivo))
            if motivo:
                continue
            # Pilar 1 — índices nos fins de mês anteriores
            def idx_em(meses_atras):
                tt = fim_mes.get(mes - meses_atras)
                if tt is None:
                    tt = cal[max(0, kt - 21 * meses_atras)]
                jj = np.searchsorted(k, pos[pd.Timestamp(tt)], side="right") - 1
                return (idx[jj], jj) if jj >= 0 else (np.nan, -1)
            i1, j1 = idx_em(1)
            i7, _ = idx_em(7)
            i12, j12 = idx_em(12)
            r12_1 = i1 / i12 - 1 if i12 > 0 else np.nan
            r7_12 = i7 / i12 - 1 if i12 > 0 else np.nan
            j252 = np.searchsorted(k, kt - 251)
            max52 = preco[j] / np.max(preco[j252:j + 1])
            mm200 = preco[j] / np.mean(preco[max(0, j - 199):j + 1]) - 1
            jan = ret[j12 + 1:j1 + 1] if j12 >= 0 and j1 > j12 else np.array([])
            if len(jan) >= 100 and np.isfinite(r12_1):
                pos_d, neg_d = np.mean(jan > 0), np.mean(jan < 0)
                caminho = -np.sign(r12_1) * (neg_d - pos_d)
            else:
                caminho = np.nan
            linhas_m.append((str(mes), papel, r12_1, r7_12, max52, caminho, mm200))

    u = pd.DataFrame(linhas_u, columns=["mes", "papel", "ticker", "emissor", "cd_cvm", "setor", "vol_medio_63",
                                        "amihud_63", "pregoes_hist", "motivo"])
    # Amihud: fora do décimo pior entre os que passaram nos filtros anteriores; depois, uma classe por empresa
    ok = u.motivo == ""
    lim = u[ok].groupby("mes")["amihud_63"].transform(lambda s: s.quantile(0.9))
    u.loc[ok & (u.amihud_63 > lim.reindex(u.index)), "motivo"] = "iliquidez de Amihud no décimo pior"
    ok = u.motivo == ""
    melhor = u[ok].sort_values("vol_medio_63", ascending=False).drop_duplicates(["mes", "emissor"])
    outra = ok & ~u.index.isin(melhor.index)
    u.loc[outra, "motivo"] = "outra classe da mesma empresa com mais volume"
    u["elegivel"] = u.motivo == ""
    m = pd.DataFrame(linhas_m, columns=["mes", "papel", "r12_1", "r7_12", "max52", "caminho", "mm200"])
    m = m.merge(u[u.elegivel][["mes", "papel", "ticker", "setor", "cd_cvm"]], on=["mes", "papel"])
    u.to_csv(os.path.join(a.saida, "universo_mensal.csv.gz"), index=False, compression="gzip")
    m.to_csv(os.path.join(a.saida, "momentum_mensal.csv.gz"), index=False, compression="gzip")

    # conferência
    linhas = ["# Conferência — motor do Score, etapa 1\n"]
    por_ano = u[u.elegivel].assign(ano=u.mes.str[:4]).groupby("ano")["papel"].nunique()
    ult = u[u.elegivel].groupby("mes").size()
    linhas.append("## Universo (papéis elegíveis no último mês de cada ano)\n")
    linhas.append("| Ano | Elegíveis em dezembro | Com ligação à CVM |\n|---|---|---|")
    for ano in sorted(por_ano.index):
        mes = max([x for x in ult.index if x.startswith(ano)])
        q = u[(u.mes == mes) & u.elegivel]
        linhas.append(f"| {ano} | {len(q)} | {(q.cd_cvm != '').sum()} |")
    linhas.append("\n## Motivos de exclusão (todos os meses)\n")
    for mot, n in u[~u.elegivel].motivo.value_counts().items():
        linhas.append(f"- {mot}: {n}")
    linhas.append("\n## Setores (dezembro do último ano completo)\n")
    ultimo = max(x for x in ult.index if x.endswith("-12"))
    for s, n in u[(u.mes == ultimo) & u.elegivel].setor.value_counts().items():
        linhas.append(f"- {s}: {n}")
    linhas.append("\n## Pilar 1 em ações conhecidas\n")
    linhas.append("| Mês | Ação | Retorno 12-1 | Retorno 12-7 | Preço/máxima 52 sem. | Caminho (−ID) | Preço/MM200 − 1 |\n|---|---|---|---|---|---|---|")
    for mes, tk in [("2020-12", "MGLU3"), ("2020-12", "PETR4"), ("2015-12", "PETR4"), ("2021-12", "WEGE3"),
                    ("2008-12", "VALE5"), ("2024-12", "ITUB4"), ("2016-12", "BBAS3"), ("2012-12", "OGXP3")]:
        r = m[(m.mes == mes) & (m.ticker == tk)]
        if len(r):
            r = r.iloc[0]
            linhas.append(f"| {mes} | {tk} | {r.r12_1:.1%} | {r.r7_12:.1%} | {r.max52:.2f} | {r.caminho:.2f} | {r.mm200:.1%} |")
        else:
            mot = u[(u.mes == mes) & (u.ticker == tk)].motivo
            linhas.append(f"| {mes} | {tk} | fora do universo: {mot.iloc[0] if len(mot) else 'sem dado'} | | | | |")
    with open(os.path.join(a.saida, "conferencia_etapa1.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")
    print("\n".join(linhas))


if __name__ == "__main__":
    main()
