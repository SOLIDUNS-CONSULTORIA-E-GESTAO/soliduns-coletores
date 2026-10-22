"""
SOLIDUNS — BASE DE PESQUISA: PROVENTOS E EVENTOS SOCIETÁRIOS DA B3 (Score Exponencial v1.0.2, camada 1, etapa 2)
v1.2 (22/10/2026)

Fonte OFICIAL e gratuita: páginas de empresas listadas da B3 (sistemaswebb3-listados), as mesmas consultas do site
da B3, sem chave. Testado em 22/10/2026 (workflow "Diagnóstico eventos B3"):
  - GetListedSupplementCompany: nome de pregão da empresa (inclusive de empresas que saíram da bolsa) e os eventos
    em ações (desdobramento, grupamento, bonificação) das empresas listadas;
  - GetListedCashDividends (pelo nome de pregão): histórico de proventos em dinheiro desde 1995/1996, inclusive de
    empresas que saíram da bolsa (ex.: TELEMAR 1999-2011, AMBEV antiga 2000-2013), com a data-com, o valor por ação e
    o preço de fechamento da véspera da data ex.
Os emissores vêm dos ISIN da base de cotações (letras 3 a 6 do ISIN: BRPETRACNPR6 -> PETR), o que liga também os
códigos antigos de 3 letras (até 1997). A resposta da B3 vem como texto JSON dentro de JSON: é lida duas vezes.

v1.2: o cadastro guarda o código CVM de cada emissor (liga a B3 às demonstrações da CVM).
Saída (--saida): proventos_b3.csv.gz, eventos_acoes_b3.csv.gz e emissores_b3.csv.gz (com o que não foi encontrado).
Uso: python coletor/pesquisa_eventos_b3.py --cotacoes dados_b3 --saida dados_eventos
"""
import argparse
import base64
import csv
import glob
import gzip
import json
import os
import sys
import time

import requests
import urllib3

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import coletar_cotahist as cc  # noqa: E402

urllib3.disable_warnings()
BASE = "https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/"
S = requests.Session()
S.headers.update(cc.CAB_B3)
VERIFICAR = True


def tok(d):
    return base64.b64encode(json.dumps(d, separators=(",", ":")).encode()).decode()


def consultar(metodo, params):
    global VERIFICAR
    for t in range(4):
        try:
            r = S.get(BASE + metodo + "/" + tok(params), timeout=30, verify=VERIFICAR)
            if r.status_code == 200:
                d = r.json() if r.text.strip() else {}
                while isinstance(d, str):
                    d = json.loads(d) if d.strip() else {}
                return d
            if r.status_code == 404:
                return None
        except requests.exceptions.SSLError:
            VERIFICAR = False                                   # certificado incompleto da B3 (dado público, só leitura)
        except (requests.RequestException, ValueError):
            pass
        time.sleep(2 * (t + 1))
    return None


def emissores_da_base(pasta):
    em = {}
    for f in sorted(glob.glob(os.path.join(pasta, "cotahist_*.csv.gz"))):
        for r in csv.DictReader(gzip.open(f, "rt", encoding="utf-8")):
            isin = r["isin"] or ""
            if len(isin) == 12 and isin.startswith("BR"):
                e = em.setdefault(isin[2:6], set())
                e.add(r["ticker"])
    return em


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cotacoes", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--limite", type=int, default=0, help="só os N primeiros emissores (teste)")
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)
    emissores = emissores_da_base(a.cotacoes)
    lista = sorted(emissores)[: a.limite or None]
    cc.resumo(f"Emissores na base de cotações: {len(emissores)} (consultando {len(lista)})")
    prov, acoes, cad = [], [], []
    for n, em in enumerate(lista, 1):
        s = consultar("GetListedSupplementCompany", {"issuingCompany": em, "language": "pt-br"})
        while isinstance(s, list):
            s = s[0] if s else {}
        s = s if isinstance(s, dict) else {}
        nome = (s.get("tradingName") or "").strip()
        for e in s.get("stockDividends") or []:
            acoes.append({"emissor": em, "isin": e.get("isinCode") or e.get("assetIssued") or "", "rotulo": e.get("label"),
                          "fator": e.get("factor"), "data_com": e.get("lastDatePrior"), "aprovacao": e.get("approvedOn")})
        qtd = 0
        # v1.1: a consulta não aceita a barra do nome de pregão ("AMBEV S/A" -> 0; "AMBEV SA" -> 40 registros)
        nomes = list(dict.fromkeys([nome.replace("/", ""), nome.replace("/", " "), nome])) if nome else []
        for nome_c in nomes:
            if qtd:
                break
            pg = 1
            while True:
                d = consultar("GetListedCashDividends", {"language": "pt-br", "pageNumber": pg, "pageSize": 120, "tradingName": nome_c})
                if not isinstance(d, dict):
                    break
                for x in d.get("results") or []:
                    prov.append({"emissor": em, "nome_pregao": nome, "classe": x.get("typeStock"), "tipo": x.get("corporateAction"),
                                 "data_com": x.get("lastDatePriorEx"), "aprovacao": x.get("dateApproval"),
                                 "valor": x.get("valueCash"), "por_acoes": x.get("quotedPerShares"), "ratio": x.get("ratio"),
                                 "fech_vespera_ex": x.get("closingPricePriorExDate"), "data_fech_vespera_ex": x.get("dateClosingPricePriorExDate"),
                                 "percentual": x.get("corporateActionPrice")})
                    qtd += 1
                if pg >= ((d.get("page") or {}).get("totalPages") or 0):
                    break
                pg += 1
                time.sleep(0.4)
            time.sleep(0.3)
        cad.append({"emissor": em, "nome_pregao": nome, "codigo_cvm": (s.get("codeCVM") or "").strip(),
                    "razao_social": (s.get("companyName") or "").strip(), "codigos": " ".join(sorted(emissores[em])), "proventos": qtd,
                    "eventos_acoes": sum(1 for x in acoes if x["emissor"] == em), "situacao": "ok" if nome else "sem cadastro na B3"})
        if n % 100 == 0:
            cc.log(f"  {n}/{len(lista)} emissores; {len(prov)} proventos")
        time.sleep(0.4)
    for nome, linhas in [("proventos_b3", prov), ("eventos_acoes_b3", acoes), ("emissores_b3", cad)]:
        if not linhas:
            continue
        with gzip.open(os.path.join(a.saida, nome + ".csv.gz"), "wt", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
            w.writeheader()
            w.writerows(linhas)
    sem = [c for c in cad if c["situacao"] != "ok"]
    com_prov = [c for c in cad if c["proventos"]]
    anos = sorted(int(p["data_com"][-4:]) for p in prov if (p["data_com"] or "")[-4:].isdigit())
    cc.resumo(f"Proventos: {len(prov)} (de {anos[0] if anos else '-'} a {anos[-1] if anos else '-'}); emissores com proventos: "
              f"{len(com_prov)}; sem cadastro na B3: {len(sem)}; eventos em ações: {len(acoes)}")


if __name__ == "__main__":
    main()
