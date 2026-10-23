"""
SOLIDUNS — SCORE EXPONENCIAL: TESTE HISTÓRICO (metodologia v1.0.4, protocolo do teste v1.0.5)
v1.0 (23/10/2026)

O teste do Score é rodado UMA vez, depois do protocolo aprovado (--modo real). Antes disso, a máquina do teste é
conferida com dois placebos, que não usam o Score:
  --modo aleatorio : notas sorteadas (semente fixa). O teste deve dar "sem poder de previsão".
  --modo oraculo   : nota = retorno do mês seguinte + ruído. O teste deve dar poder de previsão enorme.

Passos (cada um descrito no protocolo):
  1. retorno de cada ação de um fim de mês ao seguinte, pelo índice de retorno total; ação que sai da bolsa rende
     até o último pregão e, no resto do mês, a taxa livre de risco do NEFIN;
  2. custo de cada negociação = corretagem + emolumentos da B3 + meio spread pela faixa de liquidez da ação;
  3. carteiras: quintis por pesos iguais, mantidas por 1, 3, 6 e 12 meses (Jegadeesh; Titman, 1993), e a carteira
     do Radar com faixa de manutenção (entra no topo 20%, sai abaixo do topo 40%);
  4. medidas: Fama-MacBeth com Newey-West, coeficiente de informação, alfa contra os 5 fatores do NEFIN, Sharpe
     deflacionado, probabilidade de sobreajuste (CSCV), teste SPA de Hansen e o período guardado contra o Ibovespa;
  5. conferência do EM Score contra recuperações judiciais e falências do cadastro da CVM.

Uso: python coletor/score_teste.py --motor S --ajustada A --referencias R --cvm C --modo aleatorio [--fator-custo 2]
"""
import argparse
import glob
import math
import os

import numpy as np
import pandas as pd
from scipy import stats

# ------------------------------------------------------------------------------------------- protocolo (v1.0.5)
INICIO = "2013-01"            # primeiro mês de Score completo (formação)
ULTIMO_RETORNO = "2026-08"    # último mês com retorno, fatores do NEFIN e Ibovespa completos
GUARDADO = 36                 # meses finais guardados para a conferência final
INICIO_MOMENTUM = "2007-01"   # Pilar Momentum sozinho (descritivo)
CORRETAGEM = 0.0005           # por lado
EMOLUMENTOS = 0.0003          # por lado (negociação + liquidação da B3)
FAIXAS_SPREAD = [(100e6, 0.0005), (20e6, 0.0015), (5e6, 0.0030), (0, 0.0050)]   # (volume diário mínimo, meio spread)
HOLDINGS = (1, 3, 6, 12)
SINAIS = {"Score": "score", "Momentum": "z_M", "Qualidade e valor": "z_F", "Momento fundamental": "z_A", "Risco e confluência": "z_C"}
BLOCOS_CSCV = 16
BOOT = 2000
BLOCO_MEDIO = 6
SEMENTE = 20261023


# ------------------------------------------------------------------------------------------- dados
def ler_diario(pasta):
    partes = [pd.read_csv(f, usecols=["papel", "ticker", "data", "indice_rt"], dtype={"papel": str, "ticker": str})
              for f in sorted(glob.glob(os.path.join(pasta, "diario_*.csv.gz")))]
    d = pd.concat(partes, ignore_index=True)
    d["data"] = pd.to_datetime(d["data"])
    return d.sort_values(["papel", "data"]).reset_index(drop=True)


def retornos_mensais(d, rf_dia, meses):
    """ret[(mes_formacao, papel)] = retorno do fim do mês de formação ao fim do mês seguinte."""
    fim = {m: pd.Period(m, "M").end_time.normalize() for m in meses}
    seguinte = {m: str(pd.Period(m, "M") + 1) for m in meses}
    rf_cum = (1 + rf_dia).cumprod()
    out = {}
    for papel, g in d.groupby("papel", sort=False):
        datas = g["data"].to_numpy()
        idx = g["indice_rt"].to_numpy(float)
        ultima = datas[-1]
        for m in meses:
            t0 = np.datetime64(fim[m])
            t1 = np.datetime64(pd.Period(seguinte[m], "M").end_time.normalize())
            j0 = np.searchsorted(datas, t0, side="right") - 1
            j1 = np.searchsorted(datas, t1, side="right") - 1
            if j0 < 0 or (t0 - datas[j0]).astype("timedelta64[D]").astype(int) > 10 or j1 < j0:
                continue
            r = idx[j1] / idx[j0] - 1
            if ultima < t1 and ultima <= t0 + np.timedelta64(31, "D"):
                # saiu da bolsa no mês: do último pregão ao fim do mês, rende a taxa livre de risco
                a = rf_cum.asof(pd.Timestamp(datas[j1]))
                b = rf_cum.asof(pd.Timestamp(t1))
                if np.isfinite(a) and np.isfinite(b) and a > 0:
                    r = (1 + r) * (b / a) - 1
            out[(m, papel)] = r
    return out


def meio_spread(vol):
    """Meio spread por faixa de volume financeiro médio diário (63 pregões) no mês de formação."""
    for lim, v in FAIXAS_SPREAD:
        if vol >= lim:
            return v
    return FAIXAS_SPREAD[-1][1]


# ------------------------------------------------------------------------------------------- carteiras
def carteira(alvos, ret, custo, meses, padrao=0.003):
    """Retorno bruto, custo e giro de uma carteira com pesos-alvo mensais (dict mês → {papel: peso})."""
    linhas, w_ant = [], {}
    for m in meses:
        alvo = alvos.get(m, {})
        giro = sum(abs(alvo.get(p, 0.0) - w_ant.get(p, 0.0)) for p in set(alvo) | set(w_ant))
        c = sum(abs(alvo.get(p, 0.0) - w_ant.get(p, 0.0)) * custo.get((m, p), padrao) for p in set(alvo) | set(w_ant))
        rp = {p: ret.get((m, p), 0.0) for p in alvo}
        bruto = sum(w * rp[p] for p, w in alvo.items())
        # pesos ao fim do mês, depois de os preços andarem (base do giro do mês seguinte)
        tot = sum(w * (1 + rp[p]) for p, w in alvo.items())
        w_ant = {p: w * (1 + rp[p]) / tot for p, w in alvo.items()} if tot > 0 else {}
        linhas.append((m, bruto, c, giro / 2))
    df = pd.DataFrame(linhas, columns=["mes", "bruto", "custo", "giro"]).set_index("mes")
    df["liquido"] = df.bruto - df.custo
    return df


def alvos_quintil(sc, sinal, q, K):
    """Pesos iguais nos papéis do quintil q, carteiras sobrepostas de K meses (cada coorte com 1/K do capital)."""
    meses = sorted(sc.mes.unique())
    membros = {}
    for m, g in sc.groupby("mes"):
        r = g[sinal].rank(pct=True, method="first")
        quint = np.ceil(r * 5).clip(1, 5)
        membros[m] = list(g.papel[quint == q])
    alvos = {}
    for i, m in enumerate(meses):
        w = {}
        coortes = [membros[meses[i - k]] for k in range(K) if i - k >= 0]
        vivos = set(sc[sc.mes == m].papel)                      # coorte antiga: só papéis ainda negociados
        for coo in coortes:
            coo = [p for p in coo if p in vivos] or coo
            for p in coo:
                w[p] = w.get(p, 0.0) + 1 / (len(coo) * len(coortes))
        alvos[m] = w
    return alvos


def alvos_radar(sc, sinal="score"):
    alvos, atual = {}, set()
    for m in sorted(sc.mes.unique()):
        g = sc[sc.mes == m]
        r = dict(zip(g.papel, g[sinal].rank(pct=True, method="first")))
        atual = {p for p in atual if r.get(p, 0) > 0.60} | {p for p, x in r.items() if x > 0.80}
        alvos[m] = {p: 1 / len(atual) for p in atual} if atual else {}
    return alvos


# ------------------------------------------------------------------------------------------- estatística
def nw_t(x, lags=None):
    """Média e estatística t com erro de Newey-West (defasagens: regra 4·(T/100)^(2/9))."""
    x = np.asarray(pd.Series(x).dropna(), float)
    T = len(x)
    if T < 10:
        return np.nan, np.nan
    L = lags if lags is not None else int(math.floor(4 * (T / 100) ** (2 / 9)))
    e = x - x.mean()
    s = e @ e / T
    for k in range(1, L + 1):
        s += 2 * (1 - k / (L + 1)) * (e[k:] @ e[:-k]) / T
    return x.mean(), x.mean() / math.sqrt(s / T)


def regressao_nw(y, X, lags=None):
    y = np.asarray(y, float)
    X = np.column_stack([np.ones(len(y)), np.asarray(X, float)])
    T, k = X.shape
    b = np.linalg.lstsq(X, y, rcond=None)[0]
    u = y - X @ b
    L = lags if lags is not None else int(math.floor(4 * (T / 100) ** (2 / 9)))
    Xu = X * u[:, None]
    S = Xu.T @ Xu
    for l in range(1, L + 1):
        G = Xu[l:].T @ Xu[:-l]
        S += (1 - l / (L + 1)) * (G + G.T)
    XtXi = np.linalg.inv(X.T @ X)
    V = XtXi @ S @ XtXi
    return b, b / np.sqrt(np.diag(V))


def sharpe(x):
    x = np.asarray(x, float)
    return x.mean() / x.std(ddof=1) if x.std(ddof=1) > 0 else np.nan


def sharpe_deflacionado(x, srs_familia):
    """Probabilidade do Sharpe deflacionado (Bailey; López de Prado, 2014), em base mensal."""
    x = np.asarray(x, float)
    T, sr = len(x), sharpe(x)
    N = len(srs_familia)
    V = np.var(srs_familia, ddof=1)
    g = 0.5772156649
    sr0 = math.sqrt(V) * ((1 - g) * stats.norm.ppf(1 - 1 / N) + g * stats.norm.ppf(1 - 1 / (N * math.e))) if N > 1 else 0.0
    sk, ku = stats.skew(x), stats.kurtosis(x, fisher=False)
    den = math.sqrt(max(1e-12, 1 - sk * sr + (ku - 1) / 4 * sr ** 2))
    return float(stats.norm.cdf((sr - sr0) * math.sqrt(T - 1) / den)), sr, sr0


def pbo_cscv(M, S=BLOCOS_CSCV):
    """Probabilidade de sobreajuste por validação cruzada combinatória (Bailey et al., 2017). M: T × N."""
    from itertools import combinations
    T, N = M.shape
    blocos = np.array_split(np.arange(T), S)
    logits = []
    for comb in combinations(range(S), S // 2):
        ins = np.concatenate([blocos[i] for i in comb])
        oos = np.concatenate([blocos[i] for i in range(S) if i not in comb])
        sr_is = np.array([sharpe(M[ins, j]) for j in range(N)])
        sr_oos = np.array([sharpe(M[oos, j]) for j in range(N)])
        melhor = int(np.nanargmax(sr_is))
        w = stats.rankdata(sr_oos)[melhor] / (N + 1)
        logits.append(math.log(w / (1 - w)))
    return float(np.mean(np.array(logits) <= 0)), len(logits)


def spa_hansen(D, B=BOOT, q=1 / BLOCO_MEDIO, semente=SEMENTE):
    """Teste SPA de Hansen (2005), versão consistente; D: T × N diferenças contra a referência. Devolve o valor p."""
    rng = np.random.default_rng(semente)
    T, N = D.shape
    dbar = D.mean(axis=0)
    om = np.sqrt(np.maximum(1e-16, ((D - dbar) ** 2).mean(axis=0)))
    stat = max(0.0, np.max(math.sqrt(T) * dbar / om))
    lim = -np.sqrt(om ** 2 / T * 2 * math.log(math.log(T)))
    mu = np.where(dbar >= lim, dbar, 0.0)
    cont = 0
    for _ in range(B):
        idx = np.empty(T, int)
        idx[0] = rng.integers(T)
        for t in range(1, T):
            idx[t] = rng.integers(T) if rng.random() < q else (idx[t - 1] + 1) % T
        db = D[idx].mean(axis=0) - mu
        cont += max(0.0, np.max(math.sqrt(T) * db / om)) >= stat
    return cont / B


# ------------------------------------------------------------------------------------------- principal
def main():
    ap = argparse.ArgumentParser()
    for x in ("--motor", "--ajustada", "--referencias", "--cvm"):
        ap.add_argument(x, required=True)
    ap.add_argument("--modo", choices=["aleatorio", "oraculo", "real"], required=True)
    ap.add_argument("--saida", default=None)
    ap.add_argument("--fator-custo", type=float, default=1.0, help="sensibilidade: multiplica todos os custos")
    a = ap.parse_args()
    saida = a.saida or a.motor
    os.makedirs(saida, exist_ok=True)

    sc = pd.read_csv(os.path.join(a.motor, "score_mensal.csv.gz"))
    sc = sc[(sc.mes >= INICIO_MOMENTUM) & (sc.mes <= ULTIMO_RETORNO)].copy()
    meses_todos = sorted(sc.mes.unique())
    d = ler_diario(a.ajustada)
    nef_d = pd.read_csv(os.path.join(a.referencias, "nefin_factors.csv.gz"))
    rf_dia = pd.Series(nef_d.Risk_Free.values, index=pd.to_datetime(nef_d.Date))
    ret = retornos_mensais(d, rf_dia, meses_todos)
    print(f"Retornos mensais: {len(ret)}", flush=True)
    uni = pd.read_csv(os.path.join(a.motor, "universo_mensal.csv.gz"), usecols=["mes", "papel", "vol_medio_63"])
    custo = {(m, p): a.fator_custo * (CORRETAGEM + EMOLUMENTOS + meio_spread(v)) for m, p, v in zip(uni.mes, uni.papel, uni.vol_medio_63)}
    med_custo = a.fator_custo * (CORRETAGEM + EMOLUMENTOS + FAIXAS_SPREAD[-1][1])       # papel fora do universo: a faixa mais cara
    sc["ret"] = [ret.get((m, p), np.nan) for m, p in zip(sc.mes, sc.papel)]
    sc = sc[sc.ret.notna()].copy()

    rng = np.random.default_rng(SEMENTE)
    if a.modo != "real":
        cols = list(SINAIS.values())
        if a.modo == "aleatorio":
            for c in cols:
                sc[c] = rng.normal(size=len(sc))
        else:
            for c in cols:
                sc[c] = sc.groupby("mes")["ret"].rank(pct=True) + rng.normal(scale=0.5, size=len(sc))
    titulo = {"aleatorio": "PLACEBO — notas sorteadas (não é o Score)", "oraculo": "PLACEBO — oráculo (não é o Score)",
              "real": "TESTE DO SCORE — rodada única"}[a.modo]

    nef = pd.read_csv(os.path.join(a.referencias, "nefin_factors_monthly.csv.gz"))
    nef["mes_ret"] = [f"{y:04d}-{m:02d}" for y, m in zip(nef.year, nef.month)]
    nef = nef.set_index("mes_ret")
    ibov = pd.read_csv(os.path.join(a.referencias, "ibovespa.csv.gz")).dropna(subset=["bova11_aj"])
    ibov["data"] = pd.to_datetime(ibov.data)
    ibm = ibov.set_index("data").bova11_aj.resample("ME").last()
    ibm.index = ibm.index.to_period("M").astype(str)
    ibov_ret = ibm.pct_change()                                  # retorno do mês (índice no fim do mês)

    meses_teste = [m for m in sorted(sc.mes.unique()) if m >= INICIO]
    mes_ret = {m: str(pd.Period(m, "M") + 1) for m in meses_teste}
    ult = [m for m in meses_teste if mes_ret[m] <= ULTIMO_RETORNO]
    principal = ult[:-GUARDADO]
    guardado = ult[-GUARDADO:]
    L = [f"# {titulo}\n", f"Formação de {principal[0]} a {principal[-1]} (retornos de {mes_ret[principal[0]]} a "
         f"{mes_ret[principal[-1]]}, {len(principal)} meses). Período guardado: formação de {guardado[0]} a {guardado[-1]} "
         f"(retornos de {mes_ret[guardado[0]]} a {mes_ret[guardado[-1]]}).\n"]

    # 1. Fama-MacBeth e coeficiente de informação
    def fm_ic(meses, sinal):
        b, ic = [], []
        for m in meses:
            g = sc[sc.mes == m]
            if len(g) < 20:
                continue
            x = g[sinal].to_numpy(float)
            y = g["ret"].to_numpy(float)
            b.append(np.polyfit(x, y, 1)[0])
            ic.append(stats.spearmanr(x, y).correlation)
        return nw_t(b), nw_t(ic)
    (bm, bt), (icm, ict) = fm_ic(principal, "score")
    L.append("## 1. Poder de previsão (período principal)\n")
    L.append(f"- Fama-MacBeth, coeficiente médio do Score: {bm:.5f} por ponto ao mês; **t = {bt:.2f}** (Newey-West)")
    L.append(f"- Coeficiente de informação médio: {icm:.4f}; t = {ict:.2f}")
    meses_mom = [m for m in sorted(sc.mes.unique()) if str(pd.Period(m, "M") + 1) <= ULTIMO_RETORNO]
    (bmm, btm), (icmm, ictm) = fm_ic(meses_mom, "z_M")
    L.append(f"- Pilar Momentum sozinho, desde {INICIO_MOMENTUM} (descritivo): t = {btm:.2f}; IC {icmm:.4f} (t = {ictm:.2f})")

    # 2. carteiras
    sct = sc[sc.mes >= INICIO]
    series = {}
    for nome, col in SINAIS.items():
        for K in HOLDINGS:
            for q in (1, 5):
                series[(nome, K, q)] = carteira(alvos_quintil(sct, col, q, K), ret, custo, meses_teste, med_custo)
    radar = carteira(alvos_radar(sct), ret, custo, meses_teste, med_custo)
    rf_m = pd.Series({m: nef.Risk_Free.get(mes_ret[m], np.nan) for m in meses_teste})
    fat = pd.DataFrame({m: nef.loc[mes_ret[m], ["Rm_minus_Rf", "SMB", "HML", "WML", "IML"]] for m in meses_teste
                        if mes_ret[m] in nef.index}).T
    L.append("\n## 2. Carteiras do Score (período principal; pesos iguais; % ao mês)\n")
    L.append("| Carteira | Retorno bruto | Custo | Retorno líquido | Giro mensal (um lado) |\n|---|---|---|---|---|")
    for K in HOLDINGS:
        for q in (5, 1):
            s = series[("Score", K, q)].loc[principal]
            L.append(f"| Quintil {q}, {K} mês(es) | {s.bruto.mean():.2%} | {s.custo.mean():.2%} | {s.liquido.mean():.2%} | {s.giro.mean():.0%} |")
    s = radar.loc[principal]
    L.append(f"| Radar (faixa 20%/40%) | {s.bruto.mean():.2%} | {s.custo.mean():.2%} | {s.liquido.mean():.2%} | {s.giro.mean():.0%} |")
    ib = ibov_ret.reindex([mes_ret[m] for m in principal])
    L.append(f"| Ibovespa (BOVA11) | {ib.mean():.2%} | — | {ib.mean():.2%} | — |")

    # 3. alfa do quintil do topo menos o de baixo (K = 1, bruto) contra 5 fatores
    ls = (series[("Score", 1, 5)].bruto - series[("Score", 1, 1)].bruto).loc[principal]
    X = fat.loc[principal].to_numpy(float)
    b, t = regressao_nw(ls.to_numpy(float), X)
    L.append("\n## 3. Alfa contra os 5 fatores do NEFIN (quintil 5 − quintil 1, 1 mês, bruto)\n")
    L.append(f"- **Alfa = {b[0]:.2%} ao mês; t = {t[0]:.2f}**")
    L.append("- Cargas: " + "; ".join(f"{n} {v:.2f} (t {tt:.1f})" for n, v, tt in zip(["mercado", "tamanho", "valor", "momentum", "iliquidez"], b[1:], t[1:])))

    # 4. Sharpe deflacionado e sobreajuste: família = 5 sinais × 4 prazos (quintil do topo, líquido) + Radar
    fam = {f"{n} K{K}": (series[(n, K, 5)].liquido.loc[principal] - rf_m.loc[principal]).to_numpy(float)
           for n in SINAIS for K in HOLDINGS}
    fam["Radar"] = (radar.liquido.loc[principal] - rf_m.loc[principal]).to_numpy(float)
    srs = [sharpe(v) for v in fam.values()]
    psr, sr, sr0 = sharpe_deflacionado(fam["Radar"], srs)
    Mx = np.column_stack(list(fam.values()))
    pbo, ncomb = pbo_cscv(Mx)
    L.append("\n## 4. Controles contra o excesso de testes (período principal)\n")
    L.append(f"- Família avaliada: {len(fam)} carteiras (5 sinais × 4 prazos, quintil do topo, líquido, e o Radar)")
    L.append(f"- Radar, Sharpe mensal sobre a taxa livre: {sr:.3f} (anual {sr * math.sqrt(12):.2f}); Sharpe esperado pela sorte "
             f"entre {len(fam)} tentativas: {sr0:.3f}")
    L.append(f"- **Sharpe deflacionado: probabilidade {psr:.1%}**")
    L.append(f"- **Probabilidade de sobreajuste (CSCV, {BLOCOS_CSCV} blocos, {ncomb} combinações): {pbo:.1%}**")
    Dm = np.column_stack([v - (ibov_ret.reindex([mes_ret[m] for m in principal]).to_numpy(float) - rf_m.loc[principal].to_numpy(float))
                          for v in fam.values()])
    p_spa = spa_hansen(Dm)
    L.append(f"- Teste SPA de Hansen contra o Ibovespa (nenhuma carteira da família melhor que o índice): valor p = {p_spa:.3f}")

    # 5. período guardado
    q5g = series[("Score", 1, 5)].liquido.loc[guardado]
    radg = radar.liquido.loc[guardado]
    ibg = ibov_ret.reindex([mes_ret[m] for m in guardado])
    L.append("\n## 5. Período guardado (36 meses, depois dos custos)\n")
    L.append(f"- **Quintil do topo (1 mês, líquido): {(1 + q5g).prod() - 1:.1%} acumulado**; Radar: {(1 + radg).prod() - 1:.1%}; "
             f"**Ibovespa: {(1 + ibg).prod() - 1:.1%}**")

    # 6. critérios
    crit = [("Estatística t do Score (Fama-MacBeth) ≥ 3", bt >= 3, f"{bt:.2f}"),
            ("Alfa Q5 − Q1 positivo com t ≥ 2", b[0] > 0 and t[0] >= 2, f"{b[0]:.2%}; t {t[0]:.2f}"),
            ("Sharpe deflacionado > 95%", psr > 0.95, f"{psr:.1%}"),
            ("Probabilidade de sobreajuste < 20%", pbo < 0.20, f"{pbo:.1%}"),
            ("Período guardado: quintil do topo à frente do Ibovespa", (1 + q5g).prod() > (1 + ibg).prod(),
             f"{(1 + q5g).prod() - 1:.1%} contra {(1 + ibg).prod() - 1:.1%}")]
    L.append("\n## 6. Critérios para publicar\n")
    L.append("| Critério | Resultado | Passou |\n|---|---|---|")
    for c, ok, v in crit:
        L.append(f"| {c} | {v} | {'sim' if ok else 'não'} |")
    L.append(f"\n**Conclusão: {'PASSOU EM TODOS' if all(c[1] for c in crit) else 'NÃO PASSOU'}**")

    # 7. conferência do EM Score (só no modo real tem sentido; nos placebos mostra a contagem de eventos)
    if a.modo == "real":
        L.append("\n## 7. Conferência do EM Score (recuperação judicial e falência, cadastro da CVM)\n")
        L += conferencia_em(a, sc)

    nome = {"aleatorio": "placebo_aleatorio", "oraculo": "placebo_oraculo", "real": "teste_score"}[a.modo]
    if a.fator_custo != 1:
        nome += f"_custo{a.fator_custo:g}x"
    with open(os.path.join(saida, f"{nome}.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    pd.DataFrame({"radar_liquido": radar.liquido, "q5_liquido": series[("Score", 1, 5)].liquido,
                  "q1_liquido": series[("Score", 1, 1)].liquido, "q5_bruto": series[("Score", 1, 5)].bruto,
                  "q1_bruto": series[("Score", 1, 1)].bruto, "radar_giro": radar.giro}).to_csv(os.path.join(saida, f"{nome}_series.csv"))
    print("\n".join(L))


def conferencia_em(a, sc):
    cad = pd.read_csv(os.path.join(a.cvm, "cvm_cadastro.csv.gz"), sep=";", dtype=str).fillna("")
    ev = cad[cad.SIT_EMISSOR.str.upper().str.contains("RECUPERA|FAL[EÊ]NCIA|LIQUIDA", regex=True)]
    ev = ev.assign(cd=ev.CD_CVM.str.lstrip("0"), data=pd.to_datetime(ev.DT_INI_SIT_EMISSOR, errors="coerce")).dropna(subset=["data"])
    fun = pd.read_csv(os.path.join(a.motor, "fundamentos_mensal.csv.gz"), usecols=["mes", "cd_cvm", "setor", "em_score"], dtype={"cd_cvm": str})
    out = ["| Prazo | Eventos com EM Score antes | Zona de perigo (< 4,15) | Cinzenta | Segura (≥ 5,85) |\n|---|---|---|---|---|"]
    for meses in (12, 24):
        z = {"perigo": 0, "cinza": 0, "segura": 0}
        n = 0
        for r in ev.itertuples():
            alvo = str((pd.Period(r.data, "M") - meses))
            f = fun[(fun.cd_cvm == r.cd) & (fun.mes == alvo)].em_score.dropna()
            if not len(f):
                continue
            n += 1
            v = f.iloc[0]
            z["perigo" if v < 4.15 else "segura" if v >= 5.85 else "cinza"] += 1
        out.append(f"| {meses} meses antes | {n} | {z['perigo']} | {z['cinza']} | {z['segura']} |")
    base = fun[(fun.mes >= INICIO) & fun.em_score.notna()].em_score
    out.append(f"\nReferência: em todas as ações e meses, {np.mean(base < 4.15):.0%} na zona de perigo, "
               f"{np.mean(base >= 5.85):.0%} na segura. Eventos no cadastro com data: {len(ev)} (só a situação atual de cada empresa).")
    return out


if __name__ == "__main__":
    main()
