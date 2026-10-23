"""
SOLIDUNS — SCORE EXPONENCIAL: GRAVA O RANKING MENSAL NO SUPABASE (metodologia v1.0.5)
v1.0 (23/10/2026)

Lê a saída do motor (score_mensal, universo_mensal, fundamentos_mensal) e grava, para o último MÊS FECHADO:
  - public.radar_exponencial: todas as ações elegíveis, na ordem do Score, com as notas dos 4 pilares (0 a 100, na
    escala do Score: 50 + 50/3 · z), a marca da carteira do Radar (faixa 20%/40%) e os sinais de alerta;
    SEMPRE com publicado = false: o teste histórico não passou nos critérios, e a tela do assinante mostra
    "Ranking em calibração". Publicar é decisão do Thiago (update ... set publicado = true).
  - public.radar_exponencial_acompanhamento: retorno, depois dos custos, da carteira do Radar em cada mês desde a
    primeira formação ao vivo (out/2026), contra o Ibovespa (BOVA11) — a conferência em tempo real.
Nada é enviado ao Telegram.

Uso: python coletor/score_publicar.py --motor score --ajustada aj --referencias ref --cvm cvm --eventos ev [--gravar]
     (sem --gravar, só mostra o que gravaria)
"""
import argparse
import datetime as dt
import json
import os
import sys

import numpy as np
import pandas as pd
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import score_teste as st  # noqa: E402

VERSAO = "1.0.5"
INICIO_AO_VIVO = "2026-10"
EM_PERIGO = 4.15
BENEISH_LIMITE = -1.78


def nota(z):
    return float(np.clip(50 + (50 / 3) * z, 0, 100)) if pd.notna(z) else None


def supa():
    url, chave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not chave:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY (Secrets do GitHub).")
    return url.rstrip("/"), {"apikey": chave, "Authorization": "Bearer " + chave, "Content-Type": "application/json"}


def pedido(metodo, caminho, **kw):
    url, cab = supa()
    cab = dict(cab, **kw.pop("cab", {}))
    r = requests.request(metodo, f"{url}/rest/v1/{caminho}", headers=cab, timeout=120, **kw)
    if r.status_code >= 300:
        raise RuntimeError(f"{metodo} {caminho}: HTTP {r.status_code} {r.text[:400]}")
    return r


def main():
    ap = argparse.ArgumentParser()
    for x in ("--motor", "--ajustada", "--referencias", "--cvm", "--eventos"):
        ap.add_argument(x, required=True)
    ap.add_argument("--gravar", action="store_true")
    ap.add_argument("--hoje", default=None, help="data de hoje (teste), AAAA-MM-DD")
    ap.add_argument("--json", default=None, help="teste: grava as linhas num arquivo JSON")
    a = ap.parse_args()
    hoje = dt.date.fromisoformat(a.hoje) if a.hoje else (dt.datetime.utcnow() - dt.timedelta(hours=3)).date()
    mes_atual = f"{hoje.year:04d}-{hoje.month:02d}"

    sc = pd.read_csv(os.path.join(a.motor, "score_mensal.csv.gz"))
    uni = pd.read_csv(os.path.join(a.motor, "universo_mensal.csv.gz"), dtype={"cd_cvm": str})
    fun = pd.read_csv(os.path.join(a.motor, "fundamentos_mensal.csv.gz"), usecols=["mes", "papel", "em_score", "beneish_m"])
    fechados = sorted(m for m in sc.mes.unique() if m < mes_atual)
    mes = fechados[-1]
    print(f"Mês fechado mais recente: {mes} (hoje {hoje})", flush=True)

    # carteira do Radar: a mesma regra do teste (entra no topo 20%, sai abaixo do topo 40%), de 2013 em diante
    hist = sc[(sc.mes >= st.INICIO) & (sc.mes <= mes)]
    alvos = st.alvos_radar(hist)
    na_carteira = set(alvos.get(mes, {}))
    anterior = fechados[-2] if len(fechados) > 1 else None
    entrou = na_carteira - set(alvos.get(anterior, {}))

    # data-base, preço e nome
    d = st.ler_diario(a.ajustada)
    fim = pd.Period(mes, "M").end_time.normalize()
    data_ref = d[(d.data <= fim)].data.max().date().isoformat()
    em = pd.read_csv(os.path.join(a.eventos, "emissores_b3.csv.gz"), dtype=str).fillna("")
    nome_b3 = dict(zip(em.emissor, em.nome_pregao))
    cad = pd.read_csv(os.path.join(a.cvm, "cvm_cadastro.csv.gz"), sep=";", dtype=str).fillna("")
    cad["cd"] = cad.CD_CVM.str.lstrip("0")
    nome_cvm = dict(zip(cad.cd, [c or s for c, s in zip(cad.DENOM_COMERC, cad.DENOM_SOCIAL)]))
    fech = pd.read_csv(os.path.join(a.ajustada, f"diario_{mes[:4]}.csv.gz"), usecols=["papel", "data", "fechamento"])
    fech = fech[fech.data <= str(fim.date())].groupby("papel").tail(1).set_index("papel").fechamento

    g = sc[sc.mes == mes].merge(uni[uni.mes == mes][["papel", "emissor", "cd_cvm"]], on="papel", how="left") \
        .merge(fun[fun.mes == mes][["papel", "em_score", "beneish_m"]], on="papel", how="left")
    g = g.sort_values("score", ascending=False).reset_index(drop=True)
    linhas = []
    for i, r in g.iterrows():
        sinais = []
        if r.papel in na_carteira:
            sinais.append("Carteira do Radar" + (" — entrou no mês" if r.papel in entrou else ""))
        if r.conc == 3:
            sinais.append("Momentum, qualidade e resultados na mesma direção")
        if pd.notna(r.em_score) and r.em_score < EM_PERIGO:
            sinais.append("Risco de crédito elevado (EM Score)")
        if pd.notna(r.beneish_m) and r.beneish_m > BENEISH_LIMITE:
            sinais.append("Alerta contábil (escore M)")
        nome = nome_b3.get(r.emissor, "") or nome_cvm.get(str(r.cd_cvm), "") or r.ticker
        linhas.append({
            "mercado": "br", "data_ref": data_ref, "posicao": i + 1, "ticker": r.ticker, "nome": nome.strip(), "setor": r.setor,
            "preco": round(float(fech.get(r.papel)), 2) if pd.notna(fech.get(r.papel)) else None,
            "nota_momentum": nota(r.z_M), "nota_fundamentos": nota(r.z_F), "nota_qualidade": nota(r.z_F),
            "nota_momento": nota(r.z_A), "nota_risco": nota(r.z_C), "score": round(float(r.score), 2),
            "carteira": r.papel in na_carteira, "sinais": sinais, "metodologia_versao": VERSAO, "publicado": False,
            "detalhe": {k: (None if pd.isna(r[k]) else round(float(r[k]), 4)) for k in
                        ["z_M", "z_F", "z_A", "z_C", "conc", "m_t", "w_M", "em_score", "beneish_m"]} | {"mes": mes, "papel": r.papel},
        })
    print(f"Ranking {mes} (data-base {data_ref}): {len(linhas)} ações; carteira do Radar: {len(na_carteira)} "
          f"({len(entrou)} entraram no mês)", flush=True)
    for l in linhas[:10]:
        print(f"  {l['posicao']:>3} {l['ticker']:<7} {l['score']:6.2f} {'*' if l['carteira'] else ' '} {l['nome'][:30]}", flush=True)

    # acompanhamento em tempo real (formações de out/2026 em diante, com o mês seguinte já fechado)
    acomp = []
    meses_vivo = [m for m in fechados if m >= INICIO_AO_VIVO and str(pd.Period(m, "M") + 1) < mes_atual]
    if meses_vivo:
        nef = pd.read_csv(os.path.join(a.referencias, "nefin_factors.csv.gz"))
        rf = pd.Series(nef.Risk_Free.values, index=pd.to_datetime(nef.Date))
        ret = st.retornos_mensais(d, rf, meses_vivo)
        custo = {(m, p): st.CORRETAGEM + st.EMOLUMENTOS + st.meio_spread(v)
                 for m, p, v in zip(uni.mes, uni.papel, uni.vol_medio_63)}
        cart = st.carteira({m: alvos[m] for m in meses_vivo}, ret, custo, meses_vivo,
                           st.CORRETAGEM + st.EMOLUMENTOS + st.FAIXAS_SPREAD[-1][1])
        ib = pd.read_csv(os.path.join(a.referencias, "ibovespa.csv.gz")).dropna(subset=["bova11_aj"])
        ib["data"] = pd.to_datetime(ib.data)
        ibm = ib.set_index("data").bova11_aj.resample("ME").last()
        ibm.index = ibm.index.to_period("M").astype(str)
        ibr = ibm.pct_change()
        for m in meses_vivo:
            mr = str(pd.Period(m, "M") + 1)
            acomp.append({"mercado": "br", "mes_formacao": m, "mes_retorno": mr, "n_acoes": len(alvos[m]),
                          "retorno_bruto": round(float(cart.loc[m, "bruto"]), 6), "custo": round(float(cart.loc[m, "custo"]), 6),
                          "retorno_liquido": round(float(cart.loc[m, "liquido"]), 6),
                          "ibovespa": None if pd.isna(ibr.get(mr)) else round(float(ibr.get(mr)), 6), "metodologia_versao": VERSAO})
        for x in acomp:
            print(f"  ao vivo {x['mes_retorno']}: Radar {x['retorno_liquido']:.2%} × Ibovespa "
                  f"{(x['ibovespa'] or 0):.2%} ({x['n_acoes']} ações)", flush=True)
    else:
        print("Acompanhamento ao vivo: ainda sem mês completo depois da primeira formação (out/2026).", flush=True)

    if a.json:
        json.dump({"radar": linhas, "acompanhamento": acomp}, open(a.json, "w"), ensure_ascii=False)
    if not a.gravar:
        print("Sem --gravar: nada foi gravado.")
        return
    # grava: apaga a prévia do mesmo dia (não publicada) e insere de novo; nunca mexe em ranking publicado
    pedido("DELETE", f"radar_exponencial?mercado=eq.br&data_ref=eq.{data_ref}&publicado=is.false",
           cab={"Prefer": "return=minimal"})
    pedido("POST", "radar_exponencial?on_conflict=mercado,data_ref,ticker", data=json.dumps(linhas),
           cab={"Prefer": "resolution=ignore-duplicates,return=minimal"})
    if acomp:
        pedido("POST", "radar_exponencial_acompanhamento?on_conflict=mercado,mes_formacao", data=json.dumps(acomp),
               cab={"Prefer": "resolution=merge-duplicates,return=minimal"})
    print(f"::notice title=Radar gravado::{mes} (data-base {data_ref}): {len(linhas)} ações, carteira {len(na_carteira)}, "
          f"acompanhamento {len(acomp)} meses; publicado = false (Ranking em calibração)", flush=True)


if __name__ == "__main__":
    main()
