"""
SOLIDUNS — RECONHECIMENTO DAS FONTES OFICIAIS DE VEÍCULOS — v1.0 (16/10/2026)

Pedido do Thiago (16/10 21h44, "SIM"): leitor próprio para PRF, Polícia Federal, Detran-PR e Detran-GO (lotes em PDF
e planilha). Antes de escrever o leitor, este passo guarda AMOSTRAS reais de cada fonte para estudar o formato:
  - abre a página de leilões de cada órgão (navegador, porque a da PRF monta a lista por JavaScript);
  - lista os links de editais, anexos e planilhas (.pdf, .xlsx, .xls, .csv, .ods);
  - baixa até 3 documentos por órgão (os mais recentes), até 15 MB cada;
  - extrai o texto dos PDFs (primeiras páginas) e as primeiras linhas das planilhas.
Robô educado (educado.py): robots.txt, Crawl-delay, 1 pedido a cada 20 s por site. Não coleta nada para o site.
Saída: recon-oficiais/ (o workflow publica no ramo 'recon-oficiais').
"""
import io
import json
import os
import re
import sys
from urllib.parse import urljoin, urlparse

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import educado as E  # noqa: E402

SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "recon-oficiais")
os.makedirs(SAIDA, exist_ok=True)
FONTES = {
    "prf": ["https://www.gov.br/prf/pt-br/assuntos/leiloes-prf", "https://www.gov.br/prf/pt-br/assuntos/leiloes-prf-ate-2023"],
    "pf": ["https://www.gov.br/pf/pt-br/assuntos/leiloes"],
    "detran-pr": ["https://www.detran.pr.gov.br/Pagina/Leiloes-publicos", "https://www.detran.pr.gov.br/leilaodeveiculos"],
    "detran-go": ["https://goias.gov.br/detran/leiloes/"],
}
RE_DOC = re.compile(r"\.(pdf|xlsx?|csv|ods)(\?|$|/@@download)|/@@download/file", re.I)
RE_LEILAO = re.compile(r"leil|edital|lote|anexo|hasta|aliena", re.I)
MAX_DOCS, MAX_MB = 3, 15


def baixar(url):
    if not E.PORTEIRO.esperar(url):
        return None, "robots.txt"
    try:
        r = requests.get(url, headers={"User-Agent": E.UA}, timeout=90, stream=True)
        E.PORTEIRO.resposta(url, r.status_code, r.headers)
        if r.status_code != 200:
            return None, f"HTTP {r.status_code}"
        dados = b""
        for parte in r.iter_content(65536):
            dados += parte
            if len(dados) > MAX_MB * 1024 * 1024:
                return None, "maior que 15 MB"
        return dados, r.headers.get("content-type", "")
    except requests.RequestException as e:
        return None, type(e).__name__


def amostra_pdf(dados):
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(dados)) as pdf:
            paginas = len(pdf.pages)
            texto = "\n".join((p.extract_text() or "") for p in pdf.pages[:4])
            tabelas = []
            for p in pdf.pages[:6]:
                for t in p.extract_tables()[:2]:
                    tabelas.append(t[:12])
            return {"paginas": paginas, "texto": texto[:12000], "tabelas": tabelas[:6]}
    except Exception as e:  # noqa: BLE001
        return {"erro": f"{type(e).__name__}: {e}"[:300]}


def amostra_planilha(dados, nome):
    try:
        if nome.lower().endswith(".csv"):
            return {"linhas": dados.decode("utf-8", "replace").splitlines()[:40]}
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(dados), read_only=True, data_only=True)
        out = {}
        for ws in wb.worksheets[:3]:
            out[ws.title] = [[("" if c is None else str(c))[:60] for c in row] for row in ws.iter_rows(max_row=30, values_only=True)]
            out[ws.title + "__total_linhas"] = ws.max_row
        return out
    except Exception as e:  # noqa: BLE001
        return {"erro": f"{type(e).__name__}: {e}"[:300]}


def main():
    from playwright.sync_api import sync_playwright
    resumo = {}
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = E.preparar(b.new_context(user_agent=E.UA, locale="pt-BR").new_page())
        for org, paginas in FONTES.items():
            info = {"paginas": [], "documentos": []}
            links = []
            fila, vistas = list(paginas), set()
            while fila and len(vistas) < 7:
                url = fila.pop(0)
                if url in vistas:
                    continue
                vistas.add(url)
                r = E.ir(pg, url, timeout=60000, wait_until="networkidle")
                if r is None:
                    info["paginas"].append({"url": url, "erro": "robots.txt"})
                    continue
                pg.wait_for_timeout(4000)
                lks = pg.eval_on_selector_all("a[href]", "as => as.map(a => [a.href, (a.innerText||'').trim().slice(0,120)])")
                texto = re.sub(r"\s+", " ", pg.inner_text("body"))
                info["paginas"].append({"url": url, "status": r.status, "titulo": pg.title(), "texto": texto[:6000],
                                        "links_leilao": [l for l in lks if RE_LEILAO.search(l[0] + " " + l[1])][:150]})
                links += [l for l in lks if RE_DOC.search(l[0]) or (RE_LEILAO.search(l[1]) and urlparse(l[0]).netloc)]
                if url in paginas:          # PF/PRF: os editais ficam em subpáginas por ano/leilão (2025-2026)
                    fila += [l[0] for l in lks if re.search(r"/leil[^#?]*20(25|26)", l[0]) and not RE_DOC.search(l[0])][:4]
            docs = [l for l in dict.fromkeys(tuple(l) for l in links) if RE_DOC.search(l[0])]
            info["links_documentos"] = docs[:80]
            for href, rotulo in docs[:MAX_DOCS]:
                dados, tipo = baixar(href)
                d = {"url": href, "rotulo": rotulo, "tipo": tipo}
                if dados:
                    d["bytes"] = len(dados)
                    nome = urlparse(href).path.split("/")[-1] or "doc"
                    if dados[:4] == b"%PDF":
                        d["pdf"] = amostra_pdf(dados)
                    elif dados[:2] == b"PK" or nome.lower().endswith((".xlsx", ".xls", ".csv", ".ods")):
                        d["planilha"] = amostra_planilha(dados, nome)
                info["documentos"].append(d)
            with open(os.path.join(SAIDA, f"{org}.json"), "w", encoding="utf-8") as f:
                json.dump(info, f, ensure_ascii=False, indent=1)
            resumo[org] = {"paginas": len(info["paginas"]), "links_documentos": len(info["links_documentos"]),
                           "baixados": sum(1 for d in info["documentos"] if d.get("bytes"))}
            print(org, resumo[org], flush=True)
        b.close()
    with open(os.path.join(SAIDA, "RESUMO.json"), "w", encoding="utf-8") as f:
        json.dump(resumo, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
