"""
SOLIDUNS — BASE DE PESQUISA: COTAÇÕES AJUSTADAS E RETORNO TOTAL (Score Exponencial v1.0.2, camada 1, etapa 2)
v1.0 (22/10/2026)

Junta as duas bases de pesquisa publicadas em Releases do GitHub:
  - pesquisa-b3-cotahist: cotações originais da B3, um arquivo por ano (pesquisa_historico_b3.py);
  - pesquisa-b3-eventos: proventos em dinheiro e eventos em ações da B3 (pesquisa_eventos_b3.py).

Passos:
  1. PAPEL = a série contínua de uma ação. Liga (a) o código antigo de 3 letras ao novo de 4 pelo mesmo ISIN e
     (b) dois ISIN do mesmo código quando um termina e o outro começa em até 10 dias (troca de ISIN após evento).
  2. DESDOBRAMENTOS, GRUPAMENTOS E BONIFICAÇÕES: a mesma regra do coletor diário (coletar_cotahist.detectar_eventos):
     evento da B3 conferido pelo salto real de preço; salto grande sem evento, que bate com uma razão exata, entra
     como "heuristica" (cobre as empresas que saíram da bolsa, que a B3 não lista mais).
  3. PROVENTOS: cada provento vai para o papel do mesmo emissor e da mesma classe (final 3 = ON, 4 = PN, 5 = PNA,
     6 = PNB, 7 = PNC, 8 = PND, 11 = UNT) negociado na data-com. Entra na data ex (1º pregão depois da data-com).
     Provento maior que 60% do preço da data-com é recusado (provável erro de unidade) e vai para a auditoria.
  4. RETORNO TOTAL do dia: r(t) = [A(t) + D(t)] / A(t−1) − 1, com A = preço ajustado por desdobramentos e grupamentos
     e D = provento por ação na mesma base. Os proventos são reinvestidos no próprio papel.

Saída (--saida): diario_{ano}.csv.gz, mensal.csv.gz, papeis.csv.gz e auditoria.md.
Uso: python coletor/pesquisa_ajuste_b3.py --cotacoes dados_b3 --eventos dados_eventos --saida dados_ajustados
"""
import argparse
import bisect
import csv
import datetime as dt
import glob
import gzip
import math
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import coletar_cotahist as cc  # noqa: E402

LIMITE_QUEBRA = math.log(3)                                  # salto de 3x (ou queda a 1/3) num pregão
CLASSE = {"3": "ON", "4": "PN", "5": "PNA", "6": "PNB", "7": "PNC", "8": "PND", "11": "UNT"}
AUD = []


def aud(t):
    AUD.append(t)
    cc.log(t)


def num(v):
    v = str(v or "").strip().replace(".", "").replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None


def classe_de(ticker):
    m = re.search(r"(11|[3-8])$", ticker)
    return CLASSE.get(m.group(1)) if m else None


def ler_cotacoes(pasta):
    """{isin: [(data, ticker, abertura, fechamento, volume_fin, negocios)]} ordenado por data."""
    por_isin = defaultdict(list)
    for f in sorted(glob.glob(os.path.join(pasta, "cotahist_*.csv.gz"))):
        for r in csv.DictReader(gzip.open(f, "rt", encoding="utf-8")):
            if not r["isin"]:
                continue
            por_isin[r["isin"]].append((r["data"], r["ticker"], float(r["abertura"]), float(r["fechamento"]),
                                        float(r["volume_fin"]), int(r["negocios"])))
    for s in por_isin.values():
        s.sort()
    return por_isin


def montar_papeis(por_isin):
    """Liga ISIN do mesmo código quando um termina e o outro começa em até 10 dias. -> lista de listas de ISIN."""
    pai = {i: i for i in por_isin}

    def raiz(i):
        while pai[i] != i:
            pai[i] = pai[pai[i]]
            i = pai[i]
        return i
    fim_por_ticker = defaultdict(list)                      # ticker -> [(primeiro dia, último dia, isin)]
    for isin, s in por_isin.items():
        for tk in {x[1] for x in s}:
            dias = [x[0] for x in s if x[1] == tk]
            fim_por_ticker[tk].append((dias[0], dias[-1], isin))
    ligacoes = 0
    for tk, lst in fim_por_ticker.items():
        lst.sort()
        for (i0, f0, a), (i1, f1, b) in zip(lst, lst[1:]):
            if a == b:
                continue
            gap = (dt.date.fromisoformat(i1) - dt.date.fromisoformat(f0)).days
            if 0 < gap <= 10 and a[2:6] == b[2:6]:            # mesmo emissor, sem sobreposição
                ra, rb = raiz(a), raiz(b)
                if ra != rb:
                    pai[rb] = ra
                    ligacoes += 1
    grupos = defaultdict(list)
    for i in por_isin:
        grupos[raiz(i)].append(i)
    aud(f"- Papéis: {len(grupos)} (de {len(por_isin)} ISIN; {ligacoes} trocas de ISIN ligadas pelo código)")
    return list(grupos.values())


def serie_do_papel(isins, por_isin):
    dia = {}
    for i in isins:
        for d, tk, ab, fe, vol, neg in por_isin[i]:
            if d not in dia or vol > dia[d][4]:            # dois ISIN no mesmo dia (raro): fica o de maior volume
                dia[d] = (d, tk, ab, fe, vol, neg, i)
    return [dia[d] for d in sorted(dia)]


def ler_eventos(pasta):
    acoes, prov = defaultdict(list), defaultdict(list)
    f = os.path.join(pasta, "eventos_acoes_b3.csv.gz")
    if os.path.exists(f):
        for r in csv.DictReader(gzip.open(f, "rt", encoding="utf-8")):
            dc, fx = cc.data_br(r["data_com"]), num(r["fator"])
            if dc and fx and fx > 0:
                acoes[r["emissor"]].append((dc, fx, re.sub(r"\s+", " ", (r["rotulo"] or "").upper()), (r["isin"] or "").upper() or None))
    f = os.path.join(pasta, "proventos_b3.csv.gz")
    vistos = set()
    for r in csv.DictReader(gzip.open(f, "rt", encoding="utf-8")):
        dc, v, q = cc.data_br(r["data_com"]), num(r["valor"]), num(r["por_acoes"]) or 1
        if not dc or not v or v <= 0:
            continue
        chave = (r["emissor"], (r["classe"] or "").upper(), dc, r["tipo"], r["valor"])
        if chave in vistos:                                  # a B3 às vezes repete o registro
            continue
        vistos.add(chave)
        f_b3 = num(r["fech_vespera_ex"])
        prov[(r["emissor"], (r["classe"] or "").upper())].append((dc, v / q, r["tipo"], num(r["percentual"]), (f_b3 / q) if f_b3 else None))
    return acoes, prov


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cotacoes", required=True)
    ap.add_argument("--eventos", required=True)
    ap.add_argument("--saida", required=True)
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)
    aud("# Auditoria da base ajustada — Score Exponencial (camada 1)\n")
    por_isin = ler_cotacoes(a.cotacoes)
    papeis = montar_papeis(por_isin)
    ev_acoes, prov = ler_eventos(a.eventos)
    aud(f"- Eventos em ações da B3: {sum(len(v) for v in ev_acoes.values())}; proventos da B3: {sum(len(v) for v in prov.values())}")

    diario = defaultdict(list)
    mensal, cad = [], []
    tot = defaultdict(int)
    recusados = []
    quebras_ano = defaultdict(int)
    for n, isins in enumerate(sorted(papeis, key=lambda g: sorted(g)[0]), 1):
        serie = serie_do_papel(isins, por_isin)
        if len(serie) < 2:
            continue
        emissor = sorted(isins)[0][2:6]
        pid = f"{emissor}-{n:05d}"
        tk_final = serie[-1][1]
        # 2. desdobramentos e grupamentos (mesma regra do coletor diário)
        s_cc = [{"data": d, "abertura": ab, "fechamento": fe, "isin": i} for d, tk, ab, fe, vol, neg, i in serie]
        chave = emissor + "|" + pid
        # só eventos deste papel: ISIN do evento entre os ISIN do papel (ou sem ISIN, conferido pelo salto de preço)
        ev_p = [(dc, fx, rot, None) for (dc, fx, rot, ie) in ev_acoes.get(emissor, []) if not ie or ie in isins]
        evs, avisos = cc.detectar_eventos({chave: s_cc}, {emissor: ev_p})
        for e in evs:
            tot["evento_" + e["origem"]] += 1
        tot["saltos_sem_evento"] += len(avisos)
        datas = [x[0] for x in serie]
        # fator acumulado: preço até a data-com é dividido pelo fator do evento
        fatores = sorted((e["data_com"], e["fator"]) for e in evs)
        div_ate = [1.0] * len(serie)
        acum = 1.0
        k = len(fatores) - 1
        for j in range(len(serie) - 1, -1, -1):
            while k >= 0 and fatores[k][0] >= datas[j]:
                acum *= fatores[k][1]
                k -= 1
            div_ate[j] = acum
        # 2b. quebras sem evento: salto diário de 3 vezes ou mais (ou queda a menos de 1/3) que não foi explicado
        #     por evento da B3 nem por razão exata. Se o novo patamar se mantém, é tratado como evento não informado
        #     (retorno zero naquele dia); se não se mantém (pico de um dia), o pregão é descartado como erro de dado.
        A = [x[3] / div_ate[j] for j, x in enumerate(serie)]
        bom = [True] * len(serie)
        ult = 0
        for j in range(1, len(serie)):
            r_raw = A[j] / A[ult]
            if abs(math.log(r_raw)) <= LIMITE_QUEBRA:
                ult = j
                continue
            prox = sorted(A[j:j + 4])
            mantem = abs(math.log(prox[len(prox) // 2] / A[j])) <= math.log(1.25)
            if mantem:
                for k in range(j):
                    A[k] *= r_raw
                tot["quebras_tratadas_como_evento"] += 1
                quebras_ano[datas[j][:4]] += 1
                ult = j
            else:
                bom[j] = False
                tot["pregoes_descartados_pico"] += 1
        # 3. proventos do mesmo emissor e classe, na data ex (proporção do preço da data-com, na base ajustada)
        cls = classe_de(tk_final) or classe_de(serie[0][1])
        prov_dia = defaultdict(float)
        for (dc, v, tipo, pct, f_b3) in prov.get((emissor, cls or ""), []):
            if dc < datas[0] or dc >= datas[-1]:
                continue
            j_com = bisect.bisect_right(datas, dc) - 1              # último pregão até a data-com
            j_ex = j_com + 1
            while j_ex < len(serie) and not bom[j_ex]:
                j_ex += 1
            if j_com < 0 or j_ex >= len(serie) or not bom[j_com]:
                continue
            p_com = serie[j_com][3]
            if (dt.date.fromisoformat(datas[j_ex]) - dt.date.fromisoformat(dc)).days > 31:
                tot["proventos_sem_pregao_proximo"] += 1
                continue
            if f_b3 and f_b3 > 0:                                   # conferência: preço da B3 na véspera da data ex
                tot["conf_preco_total"] += 1
                if abs(math.log(f_b3 / p_com)) <= math.log(1.02):
                    tot["conf_preco_ok"] += 1
            frac = v / p_com
            if frac > 0.6:
                recusados.append(f"{pid} {tk_final} {dc} {tipo}: provento {v:.6f} sobre preço {p_com:.6f}")
                continue
            if pct and pct > 0 and abs(math.log(frac / (pct / 100))) > math.log(1.5):
                tot["provento_divergente_do_percentual_b3"] += 1
            prov_dia[j_ex] += frac * A[j_com]
            tot["proventos_aplicados"] += 1
        # 4. retorno total diário (só pregões válidos)
        idx, ultimo_mes = 1.0, None
        reg_mes = None
        ant = None
        for j, (d, tk, ab, fe, vol, neg, i) in enumerate(serie):
            if not bom[j]:
                continue
            a_t = A[j]
            r = 0.0 if ant is None else (a_t + prov_dia.get(j, 0.0)) / A[ant] - 1
            ant = j
            idx *= 1 + r
            diario[d[:4]].append((pid, tk, i, d, fe, round(a_t, 8), round(r, 8), round(idx, 8), vol, neg))
            mes = d[:7]
            if mes != ultimo_mes:
                if reg_mes:
                    mensal.append(reg_mes)
                reg_mes = {"papel": pid, "mes": mes, "volume_fin": 0.0, "negocios": 0, "pregoes": 0}
                ultimo_mes = mes
            reg_mes.update({"ticker": tk, "isin": i, "data": d, "fechamento": fe, "fech_aj": round(a_t, 8), "indice_rt": round(idx, 8)})
            reg_mes["volume_fin"] += vol
            reg_mes["negocios"] += neg
            reg_mes["pregoes"] += 1
        if reg_mes:
            mensal.append(reg_mes)
        cad.append({"papel": pid, "emissor": emissor, "classe": cls or "", "ticker_final": tk_final,
                    "tickers": " ".join(sorted({x[1] for x in serie})), "isins": " ".join(sorted(isins)),
                    "primeiro_pregao": datas[0], "ultimo_pregao": datas[-1], "pregoes": len(serie),
                    "eventos_acoes": len(evs), "proventos": len(prov_dia), "retorno_total_vida": round(idx - 1, 6),
                    "pregoes_descartados": bom.count(False)})
    # gravação
    for ano, linhas in sorted(diario.items()):
        with gzip.open(os.path.join(a.saida, f"diario_{ano}.csv.gz"), "wt", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["papel", "ticker", "isin", "data", "fechamento", "fech_aj", "ret_total", "indice_rt", "volume_fin", "negocios"])
            w.writerows(sorted(linhas, key=lambda x: (x[0], x[3])))
    with gzip.open(os.path.join(a.saida, "mensal.csv.gz"), "wt", encoding="utf-8", newline="") as f:
        campos = ["papel", "mes", "ticker", "isin", "data", "fechamento", "fech_aj", "indice_rt", "volume_fin", "negocios", "pregoes"]
        w = csv.DictWriter(f, fieldnames=campos)
        w.writeheader()
        w.writerows(mensal)
    with gzip.open(os.path.join(a.saida, "papeis.csv.gz"), "wt", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(cad[0].keys()))
        w.writeheader()
        w.writerows(cad)
    nprov = sum(len(v) for v in prov.values())
    aud(f"- Desdobramentos/grupamentos aplicados: {tot['evento_b3']} da B3 e {tot['evento_heuristica']} por salto exato de preço; "
        f"saltos grandes sem evento na regra do coletor diário: {tot['saltos_sem_evento']}")
    aud(f"- Quebras de 3x ou mais sem evento, tratadas como evento não informado: {tot['quebras_tratadas_como_evento']}; "
        f"pregões descartados por pico de um dia: {tot['pregoes_descartados_pico']}")
    aud("- Quebras por ano: " + ", ".join(f"{k}: {v}" for k, v in sorted(quebras_ano.items())))
    aud(f"- Proventos aplicados: {tot['proventos_aplicados']} de {nprov} ({tot['proventos_aplicados']/max(1,nprov):.0%}); "
        f"recusados por tamanho: {len(recusados)}; divergentes do percentual da B3 (> 50%): {tot['provento_divergente_do_percentual_b3']}")
    aud(f"- Conferência com o preço da véspera informado pela B3 em cada provento: {tot['conf_preco_ok']} de "
        f"{tot['conf_preco_total']} iguais ao nosso fechamento (até 2%) = {tot['conf_preco_ok']/max(1,tot['conf_preco_total']):.0%}")
    aud(f"- Papéis gravados: {len(cad)}; linhas diárias: {sum(len(v) for v in diario.values())}; linhas mensais: {len(mensal)}")
    for alvo in ["PETR4", "VALE3", "ITUB4", "WEGE3", "AMBV4", "TNLP4"]:
        c = [x for x in cad if alvo in x["tickers"].split()]
        for x in c[:1]:
            aud(f"- {alvo}: papel {x['papel']}, {x['primeiro_pregao']} a {x['ultimo_pregao']}, {x['eventos_acoes']} eventos em ações, "
                f"{x['proventos']} proventos, retorno total no período: {x['retorno_total_vida']:.1%}")
    aud("\n## Proventos recusados (amostra)\n" + "\n".join("- " + r for r in recusados[:40]))
    with open(os.path.join(a.saida, "auditoria.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(AUD) + "\n")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write("\n".join(AUD) + "\n")


if __name__ == "__main__":
    main()
