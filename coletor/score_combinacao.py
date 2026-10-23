"""
SOLIDUNS — SCORE EXPONENCIAL: MOTOR DE CÁLCULO (metodologia v1.0.4) — etapa 3: notas, pilares e Score mensal
v1.0 (22/10/2026)

Junta os subitens das etapas 1 (preço) e 2 (balanço e risco) e calcula, em cada fim de mês (camadas 4 a 6):
  1. nota padronizada robusta de cada subitem, dentro do setor: z = (x − mediana) / (1,4826 · MAD), limitada a ±3;
     subitem em que "menor é melhor" entra com o sinal trocado; subitem sem dado = 0 (ação típica);
     setor com menos de 5 ações com dado no subitem: padroniza contra todas as ações do mês;
  2. nota de cada pilar = média das notas dos subitens, padronizada de novo pela mesma fórmula;
  3. concordância (subitem do Pilar 4) = nº de pilares entre M, F e A com nota positiva (0 a 3);
  4. peso do Momentum: w_M = 0,25 · mín(1; 12% / σ̂), σ̂ = volatilidade anualizada do fator WML do NEFIN em 126
     pregões até o dia; os outros três pilares dividem o resto em partes iguais;
  5. Score = 50 + (50/3) · Σ w · z, limitado a [0, 100].
Sem teste de desempenho: nenhuma linha olha para retornos futuros.

Saída: score_mensal.csv.gz e conferencia_etapa3.md.
Uso: python coletor/score_combinacao.py --motor S --referencias R
"""
import argparse
import os

import numpy as np
import pandas as pd

SUBITENS = {
    "M": [("r12_1", 1), ("r7_12", 1), ("max52", 1), ("caminho", 1), ("mm200", 1), ("giro", -1)],
    "F": [("piotroski", 1), ("gp_a", 1), ("qmj", 1), ("accruals", -1), ("ebit_ev", 1), ("folga_b", 1)],
    "A": [("sue", 1), ("dlucro_ativo", 1), ("mohanram", 1), ("lt_alav", 1)],
    "C": [("vol252", -1), ("beta252", -1), ("amihud63", -1), ("conc", 1), ("em_score", 1), ("beneish_m", -1)],
}
MIN_SETOR = 5
SIGMA_ALVO = 0.12
JANELA_WML = 126
INICIO_COMPLETO = "2013-01"


def zrob(x):
    x = pd.Series(x, dtype=float)
    v = x.dropna()
    if len(v) < 2:
        return pd.Series(np.where(x.notna(), 0.0, np.nan), index=x.index)
    med = v.median()
    mad = 1.4826 * (v - med).abs().median()
    if not np.isfinite(mad) or mad == 0:
        return pd.Series(np.where(x.notna(), 0.0, np.nan), index=x.index)
    return ((x - med) / mad).clip(-3, 3)


def nota_no_setor(df, col):
    """Nota robusta dentro do setor e do mês; setor com menos de MIN_SETOR valores usa o mês inteiro."""
    z = pd.Series(np.nan, index=df.index)
    for mes, g in df.groupby("mes"):
        zmes = zrob(g[col])
        for setor, h in g.groupby("setor"):
            if h[col].notna().sum() >= MIN_SETOR:
                z.loc[h.index] = zrob(h[col]).values
            else:
                z.loc[h.index] = zmes.loc[h.index].values
    return z


def multiplicador_momentum(ref, meses_fim):
    nef = pd.read_csv(os.path.join(ref, "nefin_factors.csv.gz"))
    nef["data"] = pd.to_datetime(nef["Date"])
    nef = nef.sort_values("data")
    sig = nef["WML"].rolling(JANELA_WML, min_periods=JANELA_WML).std() * np.sqrt(252)
    serie = pd.Series(sig.values, index=nef["data"].values)
    out = {}
    for mes, dia in meses_fim.items():
        s = serie[:dia].dropna()
        out[mes] = (float(s.iloc[-1]), str(s.index[-1].date())) if len(s) else (np.nan, "")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--motor", required=True)
    ap.add_argument("--referencias", required=True)
    a = ap.parse_args()

    mom = pd.read_csv(os.path.join(a.motor, "momentum_mensal.csv.gz"), dtype={"cd_cvm": str})
    fun = pd.read_csv(os.path.join(a.motor, "fundamentos_mensal.csv.gz"), dtype={"cd_cvm": str})
    cols_f = [c for (c, _) in sum(SUBITENS.values(), []) if c in fun.columns and c not in mom.columns]
    df = mom.merge(fun[["mes", "papel", "financeiro"] + cols_f], on=["mes", "papel"], how="left")
    df["financeiro"] = df["financeiro"].fillna(False).astype(bool)
    print(f"Ações × meses: {len(df)}; meses: {df.mes.nunique()} ({df.mes.min()} a {df.mes.max()})", flush=True)

    # 1. notas dos subitens (sinal: maior é melhor)
    for pilar, subs in SUBITENS.items():
        for col, sinal in subs:
            if col == "conc":
                continue
            df[f"x_{col}"] = sinal * df[col]
            df[f"z_{col}"] = nota_no_setor(df, f"x_{col}").fillna(0.0)
            df.drop(columns=[f"x_{col}"], inplace=True)
    # 2. pilares M, F e A
    for pilar in ("M", "F", "A"):
        df[f"bruto_{pilar}"] = df[[f"z_{c}" for c, _ in SUBITENS[pilar]]].mean(axis=1)
        df[f"z_{pilar}"] = nota_no_setor(df, f"bruto_{pilar}").fillna(0.0)
    # 3. concordância e Pilar 4
    df["conc"] = (df[["z_M", "z_F", "z_A"]] > 0).sum(axis=1)
    df["z_conc"] = nota_no_setor(df, "conc").fillna(0.0)
    df["bruto_C"] = df[[f"z_{c}" for c, _ in SUBITENS["C"]]].mean(axis=1)
    df["z_C"] = nota_no_setor(df, "bruto_C").fillna(0.0)
    # 4. peso do Momentum
    fim = pd.read_csv(os.path.join(a.motor, "universo_mensal.csv.gz"), usecols=["mes"]).mes.unique()
    dias = {m: pd.Period(m, "M").end_time.normalize() for m in fim}
    mult = multiplicador_momentum(a.referencias, dias)
    df["sigma_wml"] = df.mes.map(lambda m: mult[m][0])
    df["wml_ate"] = df.mes.map(lambda m: mult[m][1])
    df["m_t"] = np.minimum(1.0, SIGMA_ALVO / df["sigma_wml"])
    df["w_M"] = 0.25 * df["m_t"]
    df["w_outros"] = (1 - df["w_M"]) / 3
    # 5. Score
    df["score"] = (50 + (50 / 3) * (df.w_M * df.z_M + df.w_outros * (df.z_F + df.z_A + df.z_C))).clip(0, 100)
    df["posicao_pct"] = df.groupby("mes")["score"].rank(pct=True, ascending=True)
    df["completo"] = df.mes >= INICIO_COMPLETO
    cols = (["mes", "papel", "ticker", "setor", "financeiro", "completo", "score", "posicao_pct", "z_M", "z_F", "z_A", "z_C",
             "conc", "m_t", "sigma_wml", "wml_ate", "w_M"] + [f"z_{c}" for c, _ in sum(SUBITENS.values(), [])])
    df[cols].to_csv(os.path.join(a.motor, "score_mensal.csv.gz"), index=False, compression="gzip")
    conferencia(df, a.motor)


def conferencia(df, saida):
    L = ["# Conferência — motor do Score, etapa 3 (notas, pilares e Score)\n",
         "Sem teste de desempenho: só a distribuição das notas e a coerência do cálculo.\n"]
    L.append("## Por ano (dezembro)\n")
    L.append("| Ano | Ações | Score médio | Desvio | Mín | Máx | m_t (peso do Momentum = 25% × m_t) |\n|---|---|---|---|---|---|---|")
    for ano in sorted(df.mes.str[:4].unique()):
        ms = sorted(m for m in df.mes.unique() if m.startswith(ano))
        mes = f"{ano}-12" if f"{ano}-12" in ms else ms[-1]
        g = df[df.mes == mes]
        L.append(f"| {ano} | {len(g)} | {g.score.mean():.1f} | {g.score.std():.1f} | {g.score.min():.1f} | {g.score.max():.1f} | {g.m_t.iloc[0]:.2f} |")
    L.append("\n## Meses de maior proteção do Momentum (menor m_t)\n")
    mt = df.groupby("mes").agg(m_t=("m_t", "first"), sigma=("sigma_wml", "first")).sort_values("m_t").head(8)
    for mes, r in mt.iterrows():
        L.append(f"- {mes}: volatilidade do WML {r.sigma:.0%} → m_t = {r.m_t:.2f} (peso do Momentum {0.25 * r.m_t:.1%})")
    q = df[df.completo]
    L.append("\n## Correlação média entre os pilares (postos, mês a mês, 2013 em diante)\n")
    P = ["z_M", "z_F", "z_A", "z_C"]
    cm = sum(g[P].corr("spearman").fillna(0) for _, g in q.groupby("mes")) / q.mes.nunique()
    L.append("| | " + " | ".join(P) + " |\n|---|---|---|---|---|")
    for p in P:
        L.append(f"| {p} | " + " | ".join(f"{cm.loc[p, x]:.2f}" for x in P) + " |")
    L.append("\n## Subitens com dado, 2013 em diante (sem dado = nota zero)\n")
    for pil, subs in SUBITENS.items():
        L.append(f"- Pilar {pil}: " + "; ".join(f"{c} {q[c].notna().mean():.0%}" for c, _ in subs))
    for mes in [df.mes.max(), "2025-03", "2020-12", "2016-12"]:
        g = df[df.mes == mes].sort_values("score", ascending=False)
        if not len(g):
            continue
        L.append(f"\n## 10 maiores Scores — {mes} ({len(g)} ações; m_t = {g.m_t.iloc[0]:.2f})\n")
        L.append("| Ação | Setor | Score | M | F | A | C | Concordância |\n|---|---|---|---|---|---|---|---|")
        for r in g.head(10).itertuples():
            L.append(f"| {r.ticker} | {r.setor} | {r.score:.1f} | {r.z_M:.2f} | {r.z_F:.2f} | {r.z_A:.2f} | {r.z_C:.2f} | {r.conc} |")
    for tk in ["PETR4", "WEGE3", "MGLU3"]:
        r = df[(df.mes == "2025-03") & (df.ticker == tk)]
        if len(r):
            r = r.iloc[0]
            L.append(f"\n- {tk} em 2025-03: Score {r.score:.2f}; M {r.z_M:.3f}, F {r.z_F:.3f}, A {r.z_A:.3f}, C {r.z_C:.3f}; "
                     f"posição {r.posicao_pct:.0%}")
    with open(os.path.join(saida, "conferencia_etapa3.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
