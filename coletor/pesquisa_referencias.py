"""
SOLIDUNS — BASE DE PESQUISA: SÉRIES DE REFERÊNCIA E LIGAÇÃO B3 ↔ CVM (Score Exponencial v1.0.3, camada 1)
v1.2 (23/10/2026)

Fontes oficiais e gratuitas:
  - NEFIN-USP (nefin.com.br/data/risk-factors): fatores de risco brasileiros diários e mensais (mercado, tamanho,
    valor, momentum, iliquidez e taxa livre de risco), de 2001 em diante. Uso interno; citar "NEFIN (2026). Risk
    Factors. Center for Research in Financial Economics, University of São Paulo".
  - Tesouro Transparente: taxas do Tesouro Direto desde 2002 (Tesouro IPCA+ e IPCA+ com juros semestrais = NTN-B).
    Daqui sai o juro real da NTN-B mais longa de cada dia (taxa exigida "k" do subitem de Molodovsky).
  - Banco Central (Olinda, Expectativas de Mercado): medianas anuais do IPCA no Boletim Focus, desde 2001
    (inflação esperada "π" do subitem de Molodovsky).
  - Ligação PAPEL da B3 → empresa da CVM (CD_CVM), por três caminhos, nesta ordem:
      (a) código CVM informado pela B3 no cadastro do emissor;
      (b) código de negociação no FCA da CVM (CNPJ → CD_CVM);
      (c) nome: razão social da B3 igual à razão social no cadastro da CVM (sem acentos, pontuação e "S.A.").
  v1.2: Ibovespa — série 7 do SGS do Banco Central (até set/2019) e o fundo de índice BOVA11 (COTAHIST, desde
  2008), referência do teste histórico. O Ibovespa é índice de retorno total (proventos reinvestidos).
  v1.1: código CVM de emissor estrangeiro (80000 em diante, ex.: JBS N.V. depois da mudança para Nova York) não
  serve para o histórico do papel brasileiro: nesse caso, o FCA (b) vem antes.
Uso: python coletor/pesquisa_referencias.py --eventos dados_eventos --cvm dados_cvm --ajustada dados_ajustados --saida dados_ref
"""
import argparse
import csv
import glob
import gzip
import io
import os
import re
import time
import unicodedata
import urllib.parse
from collections import defaultdict

import numpy as np
import pandas as pd
import requests

NEFIN = ["nefin_factors.csv", "nefin_factors_monthly.csv", "nefin_factors_equally_weighted.csv",
         "nefin_factors_equally_weighted_monthly.csv"]
URL_NEFIN = "https://nefin.com.br/nefindata/risk-factors/{}"
URL_TESOURO = ("https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/"
               "resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv")
URL_FOCUS = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais"
UA = {"User-Agent": "SOLIDUNS-pesquisa/1.0 (dados públicos)"}
RESUMO = []


def resumo(t):
    RESUMO.append(t)
    print(t, flush=True)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(t + "\n\n")


def baixar(url, params=None, timeout=300):
    for t in range(4):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=timeout)
            if r.status_code == 200:
                return r
            print(f"  {url}: HTTP {r.status_code}", flush=True)
        except requests.RequestException as e:
            print(f"  {url}: {type(e).__name__}", flush=True)
        time.sleep(10 * (t + 1))
    return None


def gz(caminho, texto):
    with gzip.open(caminho, "wt", encoding="utf-8", newline="") as f:
        f.write(texto)


def nefin(saida):
    for n in NEFIN:
        r = baixar(URL_NEFIN.format(n))
        if not r:
            resumo(f"NEFIN {n}: não baixou")
            continue
        gz(os.path.join(saida, n + ".gz"), r.text)
        df = pd.read_csv(io.StringIO(r.text))
        resumo(f"NEFIN {n}: {len(df)} linhas; colunas {list(df.columns)}; de {df.iloc[0, 0]} a {df.iloc[-1, 0]}")


def tesouro(saida):
    r = baixar(URL_TESOURO, timeout=600)
    if not r:
        resumo("Tesouro: não baixou")
        return
    df = pd.read_csv(io.StringIO(r.content.decode("latin-1")), sep=";", dtype=str)
    df.columns = [c.strip() for c in df.columns]
    df = df[df["Tipo Titulo"].str.contains("IPCA", case=False, na=False)].copy()
    for c in ("Data Vencimento", "Data Base"):
        df[c] = pd.to_datetime(df[c], format="%d/%m/%Y", errors="coerce")
    for c in ("Taxa Compra Manha", "Taxa Venda Manha"):
        df[c] = pd.to_numeric(df[c].str.replace(",", ".", regex=False), errors="coerce")
    df = df.dropna(subset=["Data Base", "Data Vencimento"]).sort_values(["Data Base", "Data Vencimento"])
    gz(os.path.join(saida, "tesouro_ipca.csv.gz"), df.to_csv(index=False))
    # juro real da NTN-B mais longa de cada dia (taxa de venda da manhã, a de quem compra no mercado secundário do TD)
    taxa = df.dropna(subset=["Taxa Venda Manha"])
    longa = taxa.loc[taxa.groupby("Data Base")["Data Vencimento"].idxmax(), ["Data Base", "Tipo Titulo", "Data Vencimento", "Taxa Venda Manha"]]
    longa.columns = ["data", "titulo", "vencimento", "juro_real_aa"]
    gz(os.path.join(saida, "ntnb_mais_longa.csv.gz"), longa.to_csv(index=False, date_format="%Y-%m-%d"))
    resumo(f"Tesouro IPCA+: {len(df)} linhas; NTN-B mais longa: {len(longa)} dias, de {longa.data.min():%Y-%m-%d} a "
           f"{longa.data.max():%Y-%m-%d}; último juro real {longa.juro_real_aa.iloc[-1]}% a.a.")


def focus(saida):
    linhas, skip = [], 0
    filtro = "Indicador eq 'IPCA' and baseCalculo eq 0"
    while True:
        q = urllib.parse.quote                                      # o Olinda não aceita "+" no lugar de espaço
        url = (f"{URL_FOCUS}?$filter={q(filtro)}&$select=Data,DataReferencia,Mediana,numeroRespondentes"
               f"&$orderby=Data&$top=10000&$skip={skip}&$format=json")
        r = baixar(url)
        if not r:
            break
        v = r.json().get("value", [])
        linhas += v
        if len(v) < 10000:
            break
        skip += 10000
    if not linhas:
        resumo("Focus: não baixou")
        return
    df = pd.DataFrame(linhas)
    gz(os.path.join(saida, "focus_ipca.csv.gz"), df.to_csv(index=False))
    df["ano"] = df["Data"].str[:4].astype(int)
    prox = df[df["DataReferencia"].astype(int) == df["ano"] + 1][["Data", "Mediana"]].rename(columns={"Data": "data", "Mediana": "ipca_ano_seguinte"})
    gz(os.path.join(saida, "focus_ipca_ano_seguinte.csv.gz"), prox.to_csv(index=False))
    resumo(f"Focus IPCA: {len(df)} linhas; IPCA do ano seguinte: {len(prox)} datas, de {prox.data.min()} a {prox.data.max()}")


def ibovespa(saida):
    """Ibovespa: série 7 do SGS do Banco Central (até set/2019) e o fundo de índice BOVA11 (COTAHIST da B3, desde
    2008), que acompanha o Ibovespa. O BOVA11 é a referência do teste (dá para comprar); o SGS confere."""
    import datetime as dt
    import io
    import sys
    import zipfile
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import coletar_cotahist as cc
    sgs = []
    for ini in range(2005, 2020, 5):
        url = (f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.7/dados?formato=json&dataInicial=01/01/{ini}"
               f"&dataFinal=31/12/{ini + 4}")
        r = baixar(url)
        for x in (r.json() if r else []):
            d, m, a = x["data"].split("/")
            sgs.append((f"{a}-{m}-{d}", float(x["valor"])))
    bova = []
    for ano in range(2008, dt.date.today().year + 1):
        conteudo = cc.baixar(cc.URL_ANUAL.format(ano=ano), f"COTAHIST_A{ano}.ZIP")
        if not conteudo:
            continue
        with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
            with z.open(z.namelist()[0]) as f:
                for l in io.TextIOWrapper(f, encoding="latin-1"):
                    if l[0:2] == "01" and l[12:24].strip() == "BOVA11" and l[24:27] == "010":
                        fat = int(l[210:217] or 1) or 1
                        bova.append((f"{l[2:6]}-{l[6:8]}-{l[8:10]}", int(l[108:121]) / 100 / fat))
    s1 = pd.DataFrame(sgs, columns=["data", "ibov_sgs"]).drop_duplicates("data")
    s2 = pd.DataFrame(bova, columns=["data", "bova11"]).drop_duplicates("data")
    df = s2.merge(s1, on="data", how="outer").sort_values("data")
    # desdobramento ou grupamento do BOVA11: salto de mais de 30% num pregão vira ajuste (o índice não salta assim)
    f = df.dropna(subset=["bova11"]).copy()
    r = f.bova11 / f.bova11.shift(1)
    ajuste = np.ones(len(f))
    for i in np.where((r > 1.3) | (r < 0.77))[0]:
        ajuste[:i] *= r.iloc[i]
        print(f"::notice title=BOVA11 salto::{f.data.iloc[i]} razão {r.iloc[i]:.4f}", flush=True)
    f["bova11_aj"] = f.bova11 * ajuste
    df = df.merge(f[["data", "bova11_aj"]], on="data", how="left")
    gz(os.path.join(saida, "ibovespa.csv.gz"), df.to_csv(index=False))
    m = df.assign(mes=df.data.str[:7]).groupby("mes")[["ibov_sgs", "bova11_aj"]].last().pct_change()
    m = m[(m.index >= "2009-01") & (m.index <= "2019-08")].dropna()
    print(f"::notice title=Ibovespa::SGS {len(s1)} pregões até {s1.data.max()}; BOVA11 {len(s2)} pregões de {s2.data.min()} "
          f"a {s2.data.max()}; retornos mensais 2009-2019: correlação {m.corr().iloc[0, 1]:.4f}, diferença média "
          f"{(m.bova11_aj - m.ibov_sgs).mean():.4%} ao mês", flush=True)


def normal(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().upper()
    s = re.sub(r"\b(S\.?\s?A\.?|S/A|CIA\.?|COMPANHIA|EM RECUPERACAO JUDICIAL|EM LIQUIDACAO)\b", " ", s)
    return re.sub(r"[^A-Z0-9]+", " ", s).strip()


def ligacao(eventos, cvm, ajustada, saida):
    em = pd.read_csv(os.path.join(eventos, "emissores_b3.csv.gz"), dtype=str).fillna("")
    papeis = pd.read_csv(os.path.join(ajustada, "papeis.csv.gz"), dtype=str).fillna("")
    idx = pd.concat([pd.read_csv(f, dtype=str) for f in glob.glob(os.path.join(cvm, "cvm_*_entregas.csv.gz"))])
    cnpj2cvm = dict(zip(idx.CNPJ_CIA, idx.CD_CVM.str.lstrip("0")))
    com_doc = set(idx.CD_CVM.str.lstrip("0"))
    fca = pd.concat([pd.read_csv(f, dtype=str) for f in glob.glob(os.path.join(cvm, "cvm_fca_*_valor_mobiliario.csv.gz"))])
    tk2cvm = {}
    for r in fca.dropna(subset=["Codigo_Negociacao"]).itertuples():
        c = cnpj2cvm.get(r.CNPJ_Companhia)
        if c:
            tk2cvm[r.Codigo_Negociacao.strip()] = c
    cad = pd.read_csv(os.path.join(cvm, "cvm_cadastro.csv.gz"), sep=";", dtype=str).fillna("")
    nome2cvm = defaultdict(set)
    for r in cad.itertuples():
        for n in (r.DENOM_SOCIAL, r.DENOM_COMERC):
            if normal(n):
                nome2cvm[normal(n)].add(r.CD_CVM.lstrip("0"))
    em_cvm = dict(zip(em.emissor, em.codigo_cvm.str.lstrip("0")))
    em_nome = dict(zip(em.emissor, em.razao_social))
    out, metodo = [], defaultdict(int)
    for p in papeis.itertuples():
        cd, m = "", ""
        estrangeiro = em_cvm.get(p.emissor, "").isdigit() and int(em_cvm[p.emissor]) >= 80000
        if em_cvm.get(p.emissor) in com_doc and not estrangeiro:
            cd, m = em_cvm[p.emissor], "codigo_cvm_b3"
        if not cd:
            for t in p.tickers.split():
                if tk2cvm.get(t) in com_doc:
                    cd, m = tk2cvm[t], "fca_codigo_negociacao"
                    break
        if not cd and estrangeiro and em_cvm[p.emissor] in com_doc:
            cd, m = em_cvm[p.emissor], "codigo_cvm_b3"
        if not cd and em_nome.get(p.emissor):
            cands = nome2cvm.get(normal(em_nome[p.emissor]), set()) & com_doc
            if len(cands) == 1:
                cd, m = cands.pop(), "nome"
        metodo[m or "sem_ligacao"] += 1
        out.append({"papel": p.papel, "emissor": p.emissor, "ticker_final": p.ticker_final, "ultimo_pregao": p.ultimo_pregao,
                    "cd_cvm": cd, "metodo": m})
    lig = pd.DataFrame(out)
    gz(os.path.join(saida, "ligacao_b3_cvm.csv.gz"), lig.to_csv(index=False))
    rec = lig[(lig.ultimo_pregao >= "2011-01-01") & ~lig.ticker_final.str.endswith("11")]
    resumo(f"Ligação B3 → CVM: {dict(metodo)}. Papéis negociados de 2011 em diante (sem units/ETFs): {len(rec)}, "
           f"ligados {(rec.cd_cvm != '').sum()} ({(rec.cd_cvm != '').mean():.0%})")


def main():
    ap = argparse.ArgumentParser()
    for a in ("--eventos", "--cvm", "--ajustada", "--saida"):
        ap.add_argument(a, required=True)
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)
    try:
        ibovespa(a.saida)
    except Exception:
        import traceback
        print("::notice title=Ibovespa erro::" + traceback.format_exc().replace("\n", " | ")[-900:], flush=True)
    nefin(a.saida)
    tesouro(a.saida)
    focus(a.saida)
    ligacao(a.eventos, a.cvm, a.ajustada, a.saida)


if __name__ == "__main__":
    main()
