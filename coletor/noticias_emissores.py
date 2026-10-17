"""
SOLIDUNS — NOTÍCIAS POR EMPRESA (B3 e EUA) para os Relatórios de Análise — v1.0 (17/10/2026)

Pedido do Thiago (17/10 16h53): o relatório do emissor passa a juntar o que a EMPRESA informou e o que a IMPRENSA
publicou ("nem sempre a empresa noticia informações relevantes"). Grava em public.emissor_noticias (SQL 156):

  EMISSOR — Brasil: CVM, Portal de Dados Abertos, base IPE (licença ODbL): fatos relevantes, comunicados ao mercado,
            avisos aos acionistas e calendários. Empresa -> ticker pelo CNPJ (public.fundamentos_br).
            Complemento do dia: os documentos da CVM que o robô cvm-documentos já grava em public.vm_achados.
  EMISSOR — EUA: SEC EDGAR (submissions): 8-K (com os itens traduzidos), 10-Q, 10-K, 6-K, 20-F, 40-F.
  IMPRENSA — títulos dos feeds JÁ LIBERADOS do radar (public.vm_achados) que citam a empresa pelo ticker ou pelo nome.
            Guarda só título, link, data e o nome do veículo (pauta, com crédito). Nenhum texto de matéria é copiado.

Empresas: as que têm Relatório de Análise (public.relatorios_analise) + EMISSORES_EXTRA ("PETR4,br;AAPL,us").
Janela: EMISSORES_DIAS (padrão 180). Modo teste: EMISSORES_GRAVAR=0 (só mostra).
SEC: identificação no cabeçalho (SEC_USER_AGENT) e no máximo ~5 pedidos por segundo (regra de acesso justo).
"""
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import time
import unicodedata
import zipfile

import requests

VERSAO = "1.1"
IPE_URL = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_{ano}.zip"
SEC_TICKERS = "https://www.sec.gov/files/company_tickers_exchange.json"
SEC_SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_DOC = "https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{doc}"
UA_SEC = os.environ.get("SEC_USER_AGENT") or "SOLIDUNS Consultoria recon@soliduns.com.br"
UA = "SOLIDUNS-noticias/1.0 (+https://soliduns.com.br; recon@soliduns.com.br)"

CATEGORIAS_BR = {"fato relevante": "Fato relevante", "comunicado ao mercado": "Comunicado ao mercado",
                 "aviso aos acionistas": "Aviso aos acionistas", "calendario de eventos corporativos": "Calendário de eventos"}
FORMS_US = {"8-K": "8-K (evento relevante)", "8-K/A": "8-K/A (correção)", "10-Q": "10-Q (resultado trimestral)",
            "10-K": "10-K (relatório anual)", "6-K": "6-K (comunicado de emissor estrangeiro)",
            "20-F": "20-F (relatório anual de emissor estrangeiro)", "40-F": "40-F (relatório anual)"}
ITENS_8K = {
    "1.01": "acordo relevante assinado", "1.02": "fim de acordo relevante", "1.03": "falência ou recuperação judicial",
    "1.05": "incidente de cibersegurança", "2.01": "compra ou venda de ativos", "2.02": "resultados do período",
    "2.03": "nova dívida relevante", "2.04": "vencimento antecipado de dívida", "2.05": "reestruturação / demissões",
    "2.06": "baixa contábil (impairment)", "3.01": "aviso de deslistagem", "3.02": "venda de ações sem registro",
    "3.03": "mudança nos direitos dos acionistas", "4.01": "troca de auditor", "4.02": "balanço anterior não confiável",
    "5.01": "mudança de controle", "5.02": "saída/entrada de diretores ou conselheiros", "5.03": "mudança no estatuto",
    "5.07": "resultado de votação em assembleia", "7.01": "comunicado ao mercado (Reg FD)", "8.01": "outros eventos",
    "9.01": "demonstrações e anexos",
}
SUFIXOS_EMPRESA = re.compile(r"\b(s\.?\s?/?a\.?|sa|cia\.?|companhia|holding|participacoes|participações|ltda|inc|corp|corporation|"
                             r"co|company|ltd|plc|n\.?v\.?|group|grupo|the|class [a-c]|de|do|da|e)\b\.?", re.I)


def log(*a):
    print(*a, flush=True)


def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").lower()


def so_digitos(s):
    return re.sub(r"\D", "", s or "")


# ------------------------------------------------------------------ Supabase
def sb():
    url, ch = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not ch:
        raise RuntimeError("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY (Secrets do GitHub).")
    cab = {"apikey": ch, "Content-Type": "application/json"}
    if not ch.startswith("sb_"):
        cab["Authorization"] = f"Bearer {ch}"
    return url.rstrip("/"), cab


def sb_todos(caminho, passo=1000):
    url, cab = sb()
    out, ini = [], 0
    while True:
        r = requests.get(f"{url}/rest/v1/{caminho}", headers=dict(cab, Range=f"{ini}-{ini + passo - 1}"), timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f"leitura {caminho.split('?')[0]}: {r.status_code} {r.text[:200]}")
        bloco = r.json()
        out += bloco
        if len(bloco) < passo:
            return out
        ini += passo


def sb_gravar(linhas):
    url, cab = sb()
    n = 0
    for i in range(0, len(linhas), 500):
        r = requests.post(f"{url}/rest/v1/emissor_noticias?on_conflict=mercado,ticker,link", json=linhas[i:i + 500],
                          headers=dict(cab, Prefer="resolution=ignore-duplicates,return=representation"), timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f"gravação recusada: {r.status_code} {r.text[:300]}")
        n += len(r.json())
    return n


def sb_registrar(situacao, novos, detalhe, erro=None):
    try:
        url, cab = sb()
        requests.post(f"{url}/rest/v1/vm_coletas", json=[{"coletor": "noticias-emissores", "situacao": situacao, "novos": novos,
                                                         "detalhe": detalhe, "erro": erro}], headers=cab, timeout=60)
    except Exception as e:  # noqa: BLE001
        log("  aviso: não registrei a execução:", e)


# ------------------------------------------------------------------ empresas acompanhadas
def empresas_acompanhadas():
    """[(mercado, ticker)] das empresas com Relatório de Análise + extras."""
    saida = set()
    try:
        for x in sb_todos("relatorios_analise?select=acao,mercado"):
            tk = str(x.get("acao") or "").upper().strip()
            if tk:
                saida.add(("us" if x.get("mercado") == "us" else "br", tk))
    except Exception as e:  # noqa: BLE001
        log("  aviso: não li relatorios_analise:", e)
    for item in (os.environ.get("EMISSORES_EXTRA") or "").split(";"):
        if "," in item:
            tk, m = item.split(",", 1)
            saida.add(("us" if m.strip().lower() == "us" else "br", tk.strip().upper()))
    return sorted(saida)


# Palavras comuns que também são nome de empresa: só contam com inicial MAIÚSCULA no título ("Vale anuncia…", não "vale a pena").
COMUNS = {"vale", "meta", "gol", "oi", "natura", "apple", "amazon", "target", "visa", "oracle", "shell", "alphabet", "block",
          "energisa", "copel", "light", "eneva", "rumo", "cosan", "marfrig", "minerva", "localiza", "suzano", "klabin", "magazine"}
APELIDOS_ARQ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dados", "apelidos_emissores.json")


def _limpo(txt):
    base = SUFIXOS_EMPRESA.sub(" ", sem_acento(txt or ""))
    base = re.sub(r"[^a-z0-9& ]+", " ", base)
    return re.sub(r"\s+", " ", base).strip()


def apelidos(nome, ticker, extras=()):
    """Formas de citar a empresa num título: o ticker, o nome (sem 'S.A.', 'Inc.'…), cada parte de nomes compostos
    ('PETROLEO BRASILEIRO S.A. - PETROBRAS' -> 'petrobras') e os apelidos conferidos à mão (dados/apelidos_emissores.json)."""
    out = set()
    if ticker and len(ticker) >= 4:
        out.add(ticker.upper())
    for e in extras or ():
        if 2 <= len(e.strip()) < 4:
            out.add("=" + e.strip())          # nome curto (B3, JBS, WEG, Gol): só com a grafia exata no título
    partes = [nome or ""] + re.split(r"\s+[-–]\s+", nome or "")[1:] + list(extras or ())
    for p in partes:
        b = _limpo(p)
        if len(b) >= 4:
            out.add(b)
    return out


def cita(titulo, aps):
    titulo = titulo or ""
    t = " " + re.sub(r"[^a-z0-9& ]+", " ", sem_acento(titulo)) + " "
    tu = " " + re.sub(r"[^A-Z0-9 ]+", " ", titulo) + " "
    original = " " + re.sub(r"[^\wÀ-ú& ]+", " ", titulo) + " "
    for a in aps:
        if a.startswith("="):
            if re.search(r"(?<![\wÀ-ú])" + re.escape(a[1:]) + r"(?![\wÀ-ú])", titulo):
                return True
            continue
        if a.isupper():
            if f" {a} " in tu:
                return True
        elif f" {a} " in t:
            if a in COMUNS:
                cap = a[0].upper() + a[1:]
                if not re.search(r"(?<![\wÀ-ú])" + re.escape(cap) + r"(?![\wÀ-ú])", sem_acento_preserva(original)):
                    continue
            return True
    return False


def sem_acento_preserva(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn")


def apelidos_conferidos():
    try:
        with open(APELIDOS_ARQ, encoding="utf-8") as f:
            return {k.upper(): v for k, v in json.load(f).items() if not k.startswith("_")}
    except FileNotFoundError:
        return {}


# ------------------------------------------------------------------ Brasil: CVM IPE
def ler_ipe(anos, inicio):
    docs = []
    for ano in anos:
        r = requests.get(IPE_URL.format(ano=ano), headers={"User-Agent": UA}, timeout=300)
        if r.status_code != 200:
            log(f"  CVM IPE {ano}: HTTP {r.status_code}")
            continue
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            nome = next((n for n in z.namelist() if n.lower().endswith(".csv")), None)
            texto = z.read(nome).decode("latin-1")
        for x in csv.DictReader(io.StringIO(texto), delimiter=";"):
            cat = CATEGORIAS_BR.get(sem_acento(x.get("Categoria", "")).strip())
            if not cat:
                continue
            data = (x.get("Data_Entrega") or x.get("Data_Referencia") or "")[:10]
            if not data or data < inicio:
                continue
            link = (x.get("Link_Download") or "").strip()
            if not link.startswith("http"):
                continue
            assunto = re.sub(r"\s+", " ", x.get("Assunto") or "").strip()
            esp = (x.get("Especie") or "").strip()
            docs.append({"cnpj": so_digitos(x.get("CNPJ_Companhia")), "empresa": (x.get("Nome_Companhia") or "").strip(),
                         "categoria": cat, "data": data, "link": link,
                         "titulo": f"{cat}{(': ' + assunto) if assunto else (' — ' + esp if esp else '')}"[:400],
                         "detalhe": {"especie": esp or None, "assunto": assunto or None, "protocolo": x.get("Protocolo_Entrega") or None,
                                     "codigo_cvm": x.get("Codigo_CVM") or None}})
        log(f"  CVM IPE {ano}: {len(docs)} documento(s) acumulados")
    return docs


def emissor_br(empresas, inicio):
    if not empresas:
        return []
    fund = sb_todos("fundamentos_br?select=ticker,cnpj,empresa")
    por_cnpj = {}
    for f in fund:
        por_cnpj.setdefault(so_digitos(f.get("cnpj")), []).append(f)
    alvo = {tk for _, tk in empresas}
    anos = sorted({int(inicio[:4]), dt.date.today().year})
    linhas = []
    for d in ler_ipe(anos, inicio):
        for f in por_cnpj.get(d["cnpj"], []):
            if f["ticker"] in alvo:
                linhas.append({"mercado": "br", "ticker": f["ticker"], "empresa": f.get("empresa") or d["empresa"], "origem": "emissor",
                               "fonte": "CVM", "categoria": d["categoria"], "titulo": d["titulo"], "link": d["link"],
                               "publicado_em": d["data"] + "T12:00:00-03:00", "detalhe": d["detalhe"]})
    # complemento do dia (IPE é semanal): documentos que o cvm-documentos gravou no radar (título "EMPRESA — categoria: assunto")
    nomes = {}
    for f in fund:
        if f["ticker"] in alvo:
            nomes.setdefault(sem_acento(f.get("empresa") or ""), []).append(f)
    try:
        achados = sb_todos(f"vm_achados?select=titulo,link,publicado_em,coletado_em,fonte_nome&fonte_nome=ilike.*CVM*&coletado_em=gte.{inicio}")
    except Exception as e:  # noqa: BLE001
        achados = []
        log("  aviso: não li os documentos do dia (vm_achados):", e)
    for a in achados:
        emp, _, resto = (a.get("titulo") or "").partition(" — ")
        for f in nomes.get(sem_acento(emp.strip()), []):
            cat = resto.split(":")[0].strip().capitalize() or "Documento"
            linhas.append({"mercado": "br", "ticker": f["ticker"], "empresa": f.get("empresa"), "origem": "emissor", "fonte": "CVM",
                           "categoria": cat, "titulo": resto[:400] or a["titulo"][:400], "link": a["link"],
                           "publicado_em": a.get("publicado_em") or a.get("coletado_em"), "detalhe": {"via": "radar do dia"}})
    log(f"BR emissor: {len(linhas)} documento(s) das {len(alvo)} empresas")
    return linhas


# ------------------------------------------------------------------ EUA: SEC EDGAR
def sec_get(url):
    for t in range(3):
        r = requests.get(url, headers={"User-Agent": UA_SEC, "Accept-Encoding": "gzip, deflate"}, timeout=60)
        if r.status_code == 200:
            time.sleep(0.25)
            return r.json()
        if r.status_code in (429, 503):
            time.sleep(10 * (t + 1))
            continue
        log(f"  SEC {url}: HTTP {r.status_code}")
        return None
    return None


def emissor_us(empresas, inicio):
    alvo = {tk for m, tk in empresas if m == "us"}
    if not alvo:
        return [], {}
    j = sec_get(SEC_TICKERS) or {}
    campos = j.get("fields") or ["cik", "name", "ticker", "exchange"]
    idx = {c: campos.index(c) for c in ("cik", "name", "ticker")}
    info = {}
    for l in j.get("data", []):
        tk = str(l[idx["ticker"]] or "").upper().replace("-", ".")
        if tk in alvo and tk not in info:
            info[tk] = {"cik": str(int(l[idx["cik"]])).zfill(10), "empresa": str(l[idx["name"]] or "").strip()}
    linhas = []
    for tk in sorted(alvo):
        if tk not in info:
            log(f"  SEC: {tk} não encontrado na lista de tickers")
            continue
        sub = sec_get(SEC_SUBMISSIONS.format(cik=info[tk]["cik"]))
        rec = ((sub or {}).get("filings") or {}).get("recent") or {}
        for i, form in enumerate(rec.get("form", [])):
            if form not in FORMS_US:
                continue
            data = rec["filingDate"][i]
            if data < inicio:
                continue
            acc = rec["accessionNumber"][i]
            doc = rec.get("primaryDocument", [""] * (i + 1))[i]
            itens = [x.strip() for x in str((rec.get("items") or [""] * (i + 1))[i] or "").split(",") if x.strip()]
            desc = "; ".join(ITENS_8K.get(x, x) for x in itens if x != "9.01")
            titulo = FORMS_US[form] + (f": {desc}" if desc else "")
            link = SEC_DOC.format(cik=int(info[tk]["cik"]), acc=acc.replace("-", ""), doc=doc) if doc else \
                f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={info[tk]['cik']}&type={form}"
            linhas.append({"mercado": "us", "ticker": tk, "empresa": info[tk]["empresa"], "origem": "emissor", "fonte": "SEC EDGAR",
                           "categoria": form, "titulo": titulo[:400], "link": link, "publicado_em": data + "T12:00:00-04:00",
                           "detalhe": {"itens_8k": itens or None, "accession": acc}})
    log(f"EUA emissor: {len(linhas)} documento(s) de {len(info)} empresa(s)")
    return linhas, info


# ------------------------------------------------------------------ v1.1: InfoMoney (decisão do Thiago 17/10 18h47, "1 E 2")
# Feed público (https://www.infomoney.com.br/feed/), robots.txt sem bloqueio (conferido 17/10), sem página de termos de uso.
# 10 notícias por página, ~13 páginas por dia: lê as páginas (?paged=N) até passar da janela, 1 pedido a cada 20 s (robô educado).
# Guarda SÓ título, link, data e o crédito "InfoMoney". Pedido de autorização por e-mail enviado em paralelo.
INFOMONEY_FEED = "https://www.infomoney.com.br/feed/?paged={n}"


def ler_infomoney(desde_iso, max_paginas=None):
    import email.utils
    import xml.etree.ElementTree as ET
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import educado as E
    max_paginas = max_paginas or int(os.environ.get("EMISSORES_INFOMONEY_PAGINAS") or 40)
    itens = []
    for n in range(1, max_paginas + 1):
        url = INFOMONEY_FEED.format(n=n)
        if not E.PORTEIRO.esperar(url):
            log("  InfoMoney: robots.txt não permite — parei"); break
        try:
            r = requests.get(url, headers={"User-Agent": E.UA}, timeout=60)
        except requests.RequestException as e:
            log("  InfoMoney: falha de rede", type(e).__name__); break
        E.PORTEIRO.resposta(url, r.status_code, r.headers)
        if r.status_code != 200:
            log(f"  InfoMoney página {n}: HTTP {r.status_code} — parei"); break
        try:
            raiz = ET.fromstring(r.content)
        except ET.ParseError:
            log(f"  InfoMoney página {n}: XML inválido — parei"); break
        pagina, velho = [], False
        for it in raiz.iter("item"):
            tit, lk, pd = (it.findtext("title") or "").strip(), (it.findtext("link") or "").strip(), it.findtext("pubDate")
            try:
                quando = email.utils.parsedate_to_datetime(pd).astimezone(dt.timezone.utc)
            except Exception:  # noqa: BLE001
                continue
            if quando.isoformat() < desde_iso:
                velho = True; continue
            if tit and lk.startswith("http"):
                pagina.append({"titulo": tit, "link": lk, "publicado_em": quando.isoformat(), "coletado_em": quando.isoformat(),
                               "fonte_nome": "InfoMoney"})
        itens += pagina
        if velho or not pagina:
            break
    log(f"  InfoMoney: {len(itens)} notícia(s) lidas")
    return itens


# ------------------------------------------------------------------ imprensa (radar já liberado)
def imprensa(empresas, nomes, inicio):
    try:
        achados = sb_todos(f"vm_achados?select=titulo,link,publicado_em,coletado_em,fonte_nome&coletado_em=gte.{inicio}"
                           "&fonte_nome=not.ilike.*CVM*")
    except Exception as e:  # noqa: BLE001
        log("  aviso: não li o radar (vm_achados):", e)
        achados = []
    if os.environ.get("EMISSORES_INFOMONEY", "1") != "0":
        dias_im = int(os.environ.get("EMISSORES_INFOMONEY_DIAS") or 2)
        desde_im = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=dias_im)).isoformat()
        try:
            achados += ler_infomoney(desde_im)
        except Exception as e:  # noqa: BLE001
            log("  aviso: InfoMoney falhou:", type(e).__name__, e)
    conf = apelidos_conferidos()
    aps = {(m, tk): apelidos(nomes.get((m, tk)), tk, conf.get(tk, [])) for m, tk in empresas}
    linhas = []
    for a in achados:
        for (m, tk), ap in aps.items():
            if ap and cita(a.get("titulo"), ap):
                linhas.append({"mercado": m, "ticker": tk, "empresa": nomes.get((m, tk)), "origem": "imprensa",
                               "fonte": a.get("fonte_nome") or "Imprensa", "categoria": "Notícia", "titulo": (a["titulo"] or "")[:400],
                               "link": a["link"], "publicado_em": a.get("publicado_em") or a.get("coletado_em"), "detalhe": {}})
    log(f"Imprensa: {len(linhas)} citação(ões) em {len(achados)} títulos do radar")
    return linhas


def main():
    dias = int(os.environ.get("EMISSORES_DIAS") or 180)
    gravar = os.environ.get("EMISSORES_GRAVAR", "1") != "0"
    inicio = (dt.date.today() - dt.timedelta(days=dias)).isoformat()
    log(f"SOLIDUNS — Notícias por empresa v{VERSAO} — desde {inicio} — {'GRAVANDO' if gravar else 'SÓ TESTE'}")
    empresas = empresas_acompanhadas()
    log(f"{len(empresas)} empresa(s): " + ", ".join(f"{t}({m})" for m, t in empresas[:40]))
    detalhe, linhas, erros = {}, [], []
    nomes = {}
    try:
        br = emissor_br([e for e in empresas if e[0] == "br"], inicio)
        linhas += br; detalhe["br_emissor"] = len(br)
        for f in br:
            nomes.setdefault(("br", f["ticker"]), f.get("empresa"))
        try:
            for f in sb_todos("fundamentos_br?select=ticker,empresa"):
                nomes.setdefault(("br", f["ticker"]), f.get("empresa"))
        except Exception:  # noqa: BLE001
            pass
    except Exception as e:  # noqa: BLE001
        erros.append(f"BR: {e}"); log("ERRO BR:", e)
    try:
        us, info = emissor_us(empresas, inicio)
        linhas += us; detalhe["us_emissor"] = len(us)
        for tk, i in info.items():
            nomes[("us", tk)] = i["empresa"]
    except Exception as e:  # noqa: BLE001
        erros.append(f"EUA: {e}"); log("ERRO EUA:", e)
    im = imprensa(empresas, nomes, inicio)
    linhas += im; detalhe["imprensa"] = len(im)
    # sem repetição (mesmo link para a mesma empresa)
    vistos, unicas = set(), []
    for l in linhas:
        ch = (l["mercado"], l["ticker"], l["link"])
        if ch not in vistos and l.get("publicado_em"):
            vistos.add(ch); unicas.append(l)
    novos = 0
    if gravar and unicas:
        novos = sb_gravar(unicas)
    log(f"FIM: {len(unicas)} item(ns) ({detalhe}); novos gravados: {novos}" + (f"; ERROS: {erros}" if erros else ""))
    if gravar:
        sb_registrar("erro" if erros and not unicas else ("parcial" if erros else "ok"), novos, detalhe, "; ".join(erros) or None)
    for l in unicas[:12]:
        log(f"  {l['mercado']} {l['ticker']:<6} {l['origem']:<8} {l['publicado_em'][:10]} {l['fonte'][:18]:<18} {l['titulo'][:90]}")
    if erros and not unicas:
        sys.exit(1)


if __name__ == "__main__":
    main()
