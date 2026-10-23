"""
SOLIDUNS — BASE DE PESQUISA: DEMONSTRAÇÕES FINANCEIRAS DA CVM NO TEMPO CERTO (Score Exponencial v1.0.3, camada 1)
v1.1 (22/10/2026)

Fonte OFICIAL e gratuita: Portal de Dados Abertos da CVM (dados.cvm.gov.br), a mesma do coletor coletar_cvm.py.
  - DFP (anuais) de 2010 a hoje e ITR (trimestrais) de 2011 a hoje: TODAS as versões de cada documento, com a
    data de entrega à CVM (DT_RECEB). No teste, cada número só pode ser usado depois da data de entrega da versão
    usada — inclusive as reapresentações (versão 2, 3...), que chegam depois.
  - Composição do capital (quantidade de ações e ações em tesouraria) de cada documento.
  - FCA, valores mobiliários (código de negociação de cada CNPJ, com datas) — liga a empresa ao papel da B3.
  - Cadastro das companhias abertas (setor, situação, data e motivo do cancelamento de registro).
Contas guardadas (para não estourar o tamanho): Balanço até o 3º nível (ex.: 2.03.04 reservas de lucros), DRE e DFC
até o 4º nível (ex.: 3.99.01.01 lucro por ação; 6.01.01.02 depreciação). Só o exercício atual (ORDEM_EXERC = ÚLTIMO).
Valores em reais (a escala "MIL" é convertida; o lucro por ação, contas 3.99, já vem em reais por ação).

v1.1: Formulário de Referência (FRE), 2010 em diante: quantidade de ações do capital social, com a data de entrega.
A composição do capital das DFP/ITR só existe nos dados abertos de 2020 em diante; antes disso, a quantidade de
ações vem do FRE. Opção --so-fre baixa só o FRE (sem refazer DFP e ITR).

NÃO grava no Supabase: publica arquivos na Release "pesquisa-cvm" pelo workflow "Pesquisa - CVM".
Uso: python coletor/pesquisa_cvm.py --anos 2010-2026 --saida dados_cvm
"""
import argparse
import csv
import gzip
import io
import os
import re
import sys
import time
import unicodedata
import zipfile

import pandas as pd
import requests

BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA"
DEMOS = ["BPA", "BPP", "DRE", "DFC_MI", "DFC_MD"]
NIVEL_MAX = {"BPA": 3, "BPP": 3, "DRE": 4, "DFC_MI": 4, "DFC_MD": 4}
RESUMO = []


def log(t):
    print(t, flush=True)


def resumo(t):
    RESUMO.append(t)
    log(t)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(t + "\n\n")


def sem_acento(s):
    return unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().upper().strip()


def baixar(url):
    for t in range(4):
        try:
            r = requests.get(url, timeout=600, headers={"User-Agent": "SOLIDUNS-pesquisa/1.0 (dados abertos CVM)"})
            if r.status_code == 200 and r.content[:2] == b"PK":
                return r.content
            if r.status_code == 404:
                return None
            log(f"  {url}: HTTP {r.status_code} (tentativa {t + 1})")
        except requests.RequestException as e:
            log(f"  {url}: {type(e).__name__} (tentativa {t + 1})")
        time.sleep(10 * (t + 1))
    return None


def ler_csv(z, nome):
    with z.open(nome) as f:
        return pd.read_csv(f, sep=";", encoding="latin-1", dtype=str, keep_default_na=False, low_memory=False)


def gravar(df, caminho):
    with gzip.open(caminho, "wt", encoding="utf-8", newline="") as f:
        df.to_csv(f, index=False)


def documento(doc, ano, saida):
    url = f"{BASE}/DOC/{doc}/DADOS/{doc.lower()}_cia_aberta_{ano}.zip"
    conteudo = baixar(url)
    if not conteudo:
        resumo(f"| {doc} {ano} | arquivo não encontrado | | | |")
        return
    z = zipfile.ZipFile(io.BytesIO(conteudo))
    nomes = z.namelist()
    # índice: uma linha por documento e versão, com a data de entrega
    idx_nome = next((n for n in nomes if re.search(rf"{doc.lower()}_cia_aberta_{ano}\.csv$", n, re.I)), None)
    idx = ler_csv(z, idx_nome) if idx_nome else pd.DataFrame()
    if not idx.empty:
        idx.columns = [c.upper() for c in idx.columns]
        gravar(idx, os.path.join(saida, f"cvm_{doc.lower()}_{ano}_entregas.csv.gz"))
    partes = []
    for demo in DEMOS:
        for grupo in ("con", "ind"):
            n = next((x for x in nomes if re.search(rf"_{demo}_{grupo}_{ano}\.csv$", x, re.I)), None)
            if not n:
                continue
            df = ler_csv(z, n)
            df.columns = [c.upper() for c in df.columns]
            df = df[df["ORDEM_EXERC"].map(sem_acento).str.startswith("ULTIMO")]
            nivel = df["CD_CONTA"].str.count(r"\.") + 1
            df = df[nivel <= NIVEL_MAX[demo]].copy()
            esc = df.get("ESCALA_MOEDA", pd.Series("UNIDADE", index=df.index)).map(sem_acento)
            fator = esc.map(lambda e: 1000.0 if e.startswith("MIL") else 1.0)
            fator[df["CD_CONTA"].str.startswith("3.99")] = 1.0      # lucro por ação já vem em reais por ação
            df["VALOR"] = pd.to_numeric(df["VL_CONTA"].str.replace(",", ".", regex=False), errors="coerce") * fator
            df["DEMO"], df["GRUPO"] = demo, grupo
            cols = ["CNPJ_CIA", "CD_CVM", "DT_REFER", "VERSAO", "DT_INI_EXERC", "DT_FIM_EXERC", "DEMO", "GRUPO",
                    "CD_CONTA", "DS_CONTA", "ST_CONTA_FIXA", "VALOR"]
            partes.append(df[[c for c in cols if c in df.columns]])
    dem = pd.concat(partes, ignore_index=True) if partes else pd.DataFrame()
    if not dem.empty:
        gravar(dem, os.path.join(saida, f"cvm_{doc.lower()}_{ano}.csv.gz"))
    cap_nome = next((n for n in nomes if re.search(rf"composicao_capital_{ano}\.csv$", n, re.I)), None)
    if cap_nome:
        cap = ler_csv(z, cap_nome)
        cap.columns = [c.upper() for c in cap.columns]
        gravar(cap, os.path.join(saida, f"cvm_{doc.lower()}_{ano}_capital.csv.gz"))
    emp = dem["CNPJ_CIA"].nunique() if not dem.empty else 0
    versoes = (pd.to_numeric(idx.get("VERSAO", pd.Series(dtype=str)), errors="coerce") > 1).sum() if not idx.empty else 0
    resumo(f"| {doc} {ano} | {len(idx)} | {versoes} | {emp} | {len(dem):,} |".replace(",", "."))


def fca(ano, saida):
    conteudo = baixar(f"{BASE}/DOC/FCA/DADOS/fca_cia_aberta_{ano}.zip")
    if not conteudo:
        return 0
    z = zipfile.ZipFile(io.BytesIO(conteudo))
    n = next((x for x in z.namelist() if re.search(rf"valor_mobiliario_{ano}\.csv$", x, re.I)), None)
    if not n:
        return 0
    df = ler_csv(z, n)
    gravar(df, os.path.join(saida, f"cvm_fca_{ano}_valor_mobiliario.csv.gz"))
    return len(df)


def fre(ano, saida):
    conteudo = baixar(f"{BASE}/DOC/FRE/DADOS/fre_cia_aberta_{ano}.zip")
    if not conteudo:
        resumo(f"FRE {ano}: arquivo não encontrado")
        return
    z = zipfile.ZipFile(io.BytesIO(conteudo))
    nomes = z.namelist()
    if ano in (2010, 2015, 2025):
        print(f"::notice title=FRE {ano} arquivos::{' '.join(sorted(nomes))}", flush=True)
    guardados = []
    for n in nomes:
        base = os.path.basename(n).lower()
        if re.search(rf"fre_cia_aberta_{ano}\.csv$", base) or "capital_social" in base or "tesouraria" in base:
            df = ler_csv(z, n)
            curto = base.replace("fre_cia_aberta_", "").replace(f"_{ano}.csv", "").replace(f"{ano}.csv", "indice")
            gravar(df, os.path.join(saida, f"cvm_fre_{ano}_{curto}.csv.gz"))
            guardados.append(f"{curto} ({len(df)} linhas)")
            if ano == 2015:
                print(f"::notice title=FRE {curto} colunas::{' | '.join(df.columns)}", flush=True)
    resumo(f"FRE {ano}: " + ", ".join(guardados))


def anos_de(txt):
    a, b = (txt.split("-") + [txt])[:2]
    return list(range(int(a), int(b) + 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--anos", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--so-fre", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)
    for ano in anos_de(a.anos):
        fre(ano, a.saida)
    if a.so_fre:
        conteudo = baixar(f"{BASE}/DOC/DFP/DADOS/dfp_cia_aberta_2015.zip")
        if conteudo:
            print(f"::notice title=DFP 2015 arquivos::{' '.join(sorted(zipfile.ZipFile(io.BytesIO(conteudo)).namelist()))}", flush=True)
        return
    resumo("| Documento | Entregas (todas as versões) | Reapresentações | Empresas | Linhas de contas |\n|---|---|---|---|---|")
    for ano in anos_de(a.anos):
        for doc in ("DFP", "ITR"):
            if doc == "ITR" and ano < 2011:
                continue
            documento(doc, ano, a.saida)
            time.sleep(2)
    linhas_fca = {ano: fca(ano, a.saida) for ano in anos_de(a.anos)}
    resumo("FCA (códigos de negociação por CNPJ): " + ", ".join(f"{k}: {v}" for k, v in linhas_fca.items()))
    r = requests.get(f"{BASE}/CAD/DADOS/cad_cia_aberta.csv", timeout=120)
    if r.status_code == 200:
        with gzip.open(os.path.join(a.saida, "cvm_cadastro.csv.gz"), "wb") as f:
            f.write(r.content.decode("latin-1").encode("utf-8"))
        cad = list(csv.DictReader(io.StringIO(r.content.decode("latin-1")), delimiter=";"))
        canc = sum(1 for c in cad if (c.get("SIT") or "").upper().startswith("CANCELAD"))
        resumo(f"Cadastro: {len(cad)} companhias (registro cancelado: {canc})")


if __name__ == "__main__":
    main()
