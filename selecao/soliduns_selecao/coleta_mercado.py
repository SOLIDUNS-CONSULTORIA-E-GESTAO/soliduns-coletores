"""Coleta de dados de mercado: Banco Central (SGS e Focus), Damodaran,
Tesouro Direto e cotações históricas da B3 (COTAHIST)."""
import re
import urllib.parse as up
import zipfile

import pandas as pd
import requests

from .util import aviso, baixar, log, origem

SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados/ultimos/{n}?formato=json"
FOCUS = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais"
DAMODARAN = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html"
TESOURO = ("https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/"
           "resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv")
COTAHIST = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A{ano}.ZIP"


def selic_meta(cfg):
    try:
        r = requests.get(SGS.format(serie=432, n=1), timeout=30).json()[-1]
        v = float(str(r["valor"]).replace(",", "."))
        origem("Selic meta", v, f"Banco Central SGS 432 ({r['data']})")
        return v
    except Exception as e:
        aviso(f"Selic (SGS 432) não coletada ({e}); usando a Selic média do arquivo de parâmetros")
        return cfg["macro"]["selic_media"]


def focus(cfg, ano):
    """Medianas do Focus para o ano `ano`: IPCA, PIB e Selic. Atualiza cfg['macro']."""
    m = cfg["macro"]
    try:
        q = {"$filter": f"DataReferencia eq '{ano}'", "$orderby": "Data desc", "$top": "120",
             "$format": "json", "$select": "Indicador,Data,Mediana,baseCalculo"}
        url = FOCUS + "?" + up.urlencode(q, quote_via=up.quote)
        v = requests.get(url, timeout=40).json()["value"]
        achou = {}
        for x in v:
            if x.get("baseCalculo") == 0 and x["Indicador"] not in achou:
                achou[x["Indicador"]] = (x["Mediana"], x["Data"])
        for chave, ind in (("ipca", "IPCA"), ("pib", "PIB Total"), ("selic_media", "Selic")):
            if ind in achou:
                m[chave] = float(achou[ind][0])
                origem(f"Focus {ind} {ano}", m[chave], f"Banco Central, Focus de {achou[ind][1]}")
    except Exception as e:
        aviso(f"Focus não coletado ({e}); usando IPCA, PIB e Selic do arquivo de parâmetros")
    return m


def damodaran(cfg):
    """Do quadro de Damodaran para o Brasil: prêmio maduro e razão m = CRP / spread."""
    rb = cfg["risco_brasil"]
    try:
        h = requests.get(DAMODARAN, timeout=40).text
        t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h))
        mt = re.search(r"Brazil\s+(\w+)\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%", t)
        if not mt:
            raise ValueError("linha do Brasil não encontrada")
        spread, crp, erp_total = (float(mt.group(i)) for i in (2, 3, 4))
        rb["erp_maduro"] = round(erp_total - crp, 2)
        rb["m"] = round(crp / spread, 2)
        origem("ERP maduro", rb["erp_maduro"], f"Damodaran (Brasil {mt.group(1)}: ERP total {erp_total}% − CRP {crp}%)")
        origem("m (razão de volatilidades)", rb["m"], f"Damodaran (CRP {crp}% / spread {spread}%)")
    except Exception as e:
        aviso(f"Damodaran não coletado ({e}); usando ERP maduro e m do arquivo de parâmetros")
        origem("ERP maduro", rb["erp_maduro"], "parametros.yaml")
        origem("m (razão de volatilidades)", rb["m"], "parametros.yaml")
    return rb


def tesouro_y10(cfg, pasta):
    """Taxa de compra do Tesouro Prefixado com Juros Semestrais mais próximo de 10 anos."""
    rb = cfg["risco_brasil"]
    cam = baixar(TESOURO, pasta, "precotaxatesourodireto.csv", max_idade_h=20,
                 validar=lambda b: b"Tipo Titulo" in b[:300])
    if not cam:
        aviso("Tesouro Direto não coletado; usando y10 do arquivo de parâmetros")
        origem("Y10", rb["y10"], "parametros.yaml (atualize se a coleta falhar)")
        return rb["y10"], None
    df = pd.read_csv(cam, sep=";", encoding="latin-1", dtype=str)
    df = df[df["Tipo Titulo"].str.contains("Prefixado com Juros", na=False)].copy()
    df["base"] = pd.to_datetime(df["Data Base"], dayfirst=True)
    df["venc"] = pd.to_datetime(df["Data Vencimento"], dayfirst=True)
    df["taxa"] = pd.to_numeric(df["Taxa Compra Manha"].str.replace(",", "."), errors="coerce")
    df = df.dropna(subset=["taxa"])
    ult = df["base"].max()
    d = df[df["base"] == ult].copy()
    d["dist"] = ((d["venc"] - ult).dt.days / 365.25 - 10).abs()
    linha = d.sort_values("dist").iloc[0]
    rb["y10"] = float(linha["taxa"])
    origem("Y10", rb["y10"], f"Tesouro Prefixado c/ Juros {linha['venc'].year}, {ult.date()}")
    # série diária do vencimento escolhido (para estimar κ, se houver CDS histórico)
    serie = df[df["venc"] == linha["venc"]].set_index("base")["taxa"].sort_index()
    return rb["y10"], serie


def cotahist(anos, pasta):
    """Fechamento e volume diários (mercado à vista) dos anos pedidos."""
    partes = []
    for ano in anos:
        cam = baixar(COTAHIST.format(ano=ano), pasta, f"COTAHIST_A{ano}.ZIP", max_idade_h=16,
                     validar=lambda b: b[:2] == b"PK", timeout=600)
        if not cam:
            aviso(f"COTAHIST {ano} não baixado")
            continue
        with zipfile.ZipFile(cam) as z:
            txt = z.open(z.namelist()[0]).read().decode("latin-1").splitlines()
        reg = []
        for l in txt:
            if not l.startswith("01"):
                continue
            tpmerc = l[24:27]
            bdi = l[10:12]
            cod = l[12:24].strip()
            if tpmerc != "010" or (bdi not in ("02", "14") and cod != "BOVA11"):
                continue
            reg.append((l[2:10], cod, int(l[108:121]) / 100, int(l[170:188]) / 100, int(l[210:217] or 1),
                        int(l[56:69]) / 100, int(l[69:82]) / 100, int(l[82:95]) / 100))
        df = pd.DataFrame(reg, columns=["data", "ticker", "fech", "volume", "fator", "abe", "max", "min"])
        for c in ("fech", "abe", "max", "min"):          # máxima e mínima: usadas pelo Alvos SOLIDUNS
            df[c] = df[c] / df["fator"].clip(lower=1)
        partes.append(df.drop(columns="fator"))
        log(f"COTAHIST {ano}: {len(df)} registros")
    if not partes:
        raise RuntimeError("Sem cotações: não foi possível obter o COTAHIST da B3.")
    df = pd.concat(partes, ignore_index=True)
    df["data"] = pd.to_datetime(df["data"], format="%Y%m%d")
    return df.drop_duplicates(["data", "ticker"], keep="last")
