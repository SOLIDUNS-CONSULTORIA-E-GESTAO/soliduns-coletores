"""Dados da CVM.
- Fundamentos: reaproveita o coletor da plataforma (coletor/coletar_cvm.py),
  função montar(), lendo os arquivos de uma pasta de cache.
- Governança: FCA (segmento de listagem, controle, situação do emissor),
  FRE (free float e conselho de administração) e processos sancionadores."""
import json
import os
import re
import sys
import zipfile

import pandas as pd

from .util import aviso, baixar, log, sem_acento

BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA"
URL_SANCIONADOR = "https://dados.cvm.gov.br/dados/PROCESSO/SANCIONADOR/DADOS/processo_sancionador.zip"

AQUI = os.path.dirname(os.path.abspath(__file__))
PASTA_COLETOR = os.path.normpath(os.path.join(AQUI, "..", "..", "coletor"))


def _zip_ok(b):
    return b[:2] == b"PK"


def baixar_cvm(pasta, ano):
    """Garante no cache os arquivos que o coletor da plataforma lê."""
    for a in range(ano - 7, ano + 1):
        baixar(f"{BASE}/DOC/DFP/DADOS/dfp_cia_aberta_{a}.zip", pasta,
               max_idade_h=None if a < ano - 1 else 72, validar=_zip_ok)
    for a in (ano - 1, ano):
        baixar(f"{BASE}/DOC/ITR/DADOS/itr_cia_aberta_{a}.zip", pasta, max_idade_h=72, validar=_zip_ok)
        baixar(f"{BASE}/DOC/FCA/DADOS/fca_cia_aberta_{a}.zip", pasta, max_idade_h=72, validar=_zip_ok)
        baixar(f"{BASE}/DOC/FRE/DADOS/fre_cia_aberta_{a}.zip", pasta, max_idade_h=72, validar=_zip_ok)
    baixar(f"{BASE}/CAD/DADOS/cad_cia_aberta.csv", pasta, max_idade_h=72)
    baixar(URL_SANCIONADOR, pasta, max_idade_h=72, validar=_zip_ok)


def fundamentos(pasta, hoje, arquivo_json=None):
    """Linhas por ação (como em public.fundamentos_br) e histórico anual."""
    if arquivo_json and os.path.exists(arquivo_json):
        log(f"Fundamentos lidos de {arquivo_json}")
        linhas = json.load(open(arquivo_json, encoding="utf-8"))
        hist_path = os.path.splitext(arquivo_json)[0] + ".historico.json"
        hist = json.load(open(hist_path, encoding="utf-8")) if os.path.exists(hist_path) else []
        return pd.DataFrame(linhas), pd.DataFrame(hist)
    if PASTA_COLETOR not in sys.path:
        sys.path.insert(0, PASTA_COLETOR)
    try:
        import coletar_cvm
    except ImportError as e:
        raise RuntimeError("Não encontrei coletor/coletar_cvm.py. A pasta 'selecao' deve ficar dentro "
                           "do repositório soliduns-coletores, ao lado da pasta 'coletor'.") from e
    coletar_cvm.DIAG_TICKERS = set()            # sem diagnóstico detalhado no registro
    historico = []
    log("Montando fundamentos com o coletor da plataforma (alguns minutos)...")
    linhas = coletar_cvm.montar(fonte=pasta, hoje=hoje, historico=historico)
    cache = os.path.join(pasta, f"fundamentos_{hoje.isoformat()}.json")
    json.dump(linhas, open(cache, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(historico, open(os.path.splitext(cache)[0] + ".historico.json", "w", encoding="utf-8"),
              ensure_ascii=False)
    return pd.DataFrame(linhas), pd.DataFrame(historico)


def _csv(caminho_zip, trecho):
    with zipfile.ZipFile(caminho_zip) as z:
        for n in z.namelist():
            if trecho in n:
                return pd.read_csv(z.open(n), sep=";", encoding="latin-1", dtype=str, keep_default_na=False)
    return pd.DataFrame()


def _ultima_versao(df, chave="CNPJ_Companhia"):
    if df.empty:
        return df
    df = df.copy()
    df["_v"] = pd.to_numeric(df.get("Versao", 1), errors="coerce").fillna(1)
    df["_r"] = df.get("Data_Referencia", "")
    df = df.sort_values(["_r", "_v"])
    ult = df.groupby(chave)[["_r", "_v"]].transform("last")
    return df[(df["_r"] == ult["_r"]) & (df["_v"] == ult["_v"])]


def governanca(pasta, hoje):
    """DataFrame por CNPJ e dicionário ticker -> segmento."""
    ano = hoje.year
    fca = next((p for p in (os.path.join(pasta, f"fca_cia_aberta_{a}.zip") for a in (ano, ano - 1))
                if os.path.exists(p)), None)
    fre_list = [p for p in (os.path.join(pasta, f"fre_cia_aberta_{a}.zip") for a in (ano, ano - 1))
                if os.path.exists(p)]
    if not fca:
        raise RuntimeError("Arquivo FCA da CVM não encontrado no cache.")
    geral = _ultima_versao(_csv(fca, "_geral_"))
    vm = _csv(fca, "_valor_mobiliario_")
    vm = vm[vm["Codigo_Negociacao"].str.len() > 0]
    segmento = {r.Codigo_Negociacao.strip().upper(): r.Segmento for r in vm.itertuples()}
    seg_cnpj = {}
    ordem = {"Novo Mercado": 4, "Nível 2 de Governança Corporativa": 3, "Nível 1 de Governança Corporativa": 2,
             "Bovespa Mais": 2, "Básico": 1}
    for r in vm.itertuples():
        if ordem.get(r.Segmento, 0) >= ordem.get(seg_cnpj.get(r.CNPJ_Companhia, ""), 0):
            seg_cnpj[r.CNPJ_Companhia] = r.Segmento

    g = pd.DataFrame({"cnpj": geral["CNPJ_Companhia"],
                      "controle": geral["Especie_Controle_Acionario"],
                      "situacao": geral["Situacao_Emissor"],
                      "razao_social": geral["Nome_Empresarial"]})
    g["segmento"] = g["cnpj"].map(seg_cnpj).fillna("")

    # FRE: free float e conselho (o FRE mais recente de cada companhia)
    ff, cons, acoes_fre = {}, {}, {}
    for fre in reversed(fre_list):                # ano anterior primeiro; o atual sobrescreve
        cs = _csv(fre, "_capital_social_2")
        if not cs.empty:
            cs = _ultima_versao(cs[cs["Tipo_Capital"] == "Capital Integralizado"])
            for r in cs.itertuples():
                v = pd.to_numeric(r.Quantidade_Total_Acoes, errors="coerce")
                if pd.notna(v) and v > 0:
                    acoes_fre[r.CNPJ_Companhia] = float(v)
        d = _ultima_versao(_csv(fre, "_distribuicao_capital_2"))
        for r in d.itertuples():
            v = pd.to_numeric(r.Percentual_Total_Acoes_Circulacao, errors="coerce")
            if pd.notna(v):
                ff[r.CNPJ_Companhia] = float(v)
        a = _ultima_versao(_csv(fre, "_administrador_membro_conselho_fiscal_"))
        a = a[a["Orgao_Administracao"].str.contains("Conselho de Administra", na=False)]
        a = a[~a["Cargo_Eletivo_Ocupado"].str.contains("Suplente", na=False)]
        for cnpj, gg in a.groupby("CNPJ_Companhia"):
            total = len(gg)
            indep = gg["Cargo_Eletivo_Ocupado"].str.contains("Independente", na=False).sum()
            if total:
                cons[cnpj] = indep / total
    g["acoes_fre"] = g["cnpj"].map(acoes_fre)          # quantidade em unidades (FRE)
    g["free_float"] = g["cnpj"].map(ff)
    g["pct_independentes"] = g["cnpj"].map(cons)

    # Processos sancionadores com a companhia entre os acusados (últimos N anos)
    g["ocorrencias"] = 0
    ps = os.path.join(pasta, "processo_sancionador.zip")
    if os.path.exists(ps):
        proc = _csv(ps, "processo_sancionador.csv")
        acus = _csv(ps, "processo_sancionador_acusado.csv")
        proc["abertura"] = pd.to_datetime(proc["Data_Abertura"], errors="coerce")
        recentes = set(proc.loc[proc["abertura"] >= pd.Timestamp(hoje) - pd.DateOffset(years=5), "NUP"])
        acus = acus[acus["NUP"].isin(recentes)]
        norm = lambda s: re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", sem_acento(s))).strip()
        nomes = acus["Nome_Acusado"].map(norm)
        contagem = nomes.value_counts().to_dict()
        g["ocorrencias"] = g["razao_social"].map(lambda n: contagem.get(norm(n), 0))
    else:
        aviso("processos sancionadores da CVM não disponíveis; componente 'histórico' fica neutro")
    return g, segmento
