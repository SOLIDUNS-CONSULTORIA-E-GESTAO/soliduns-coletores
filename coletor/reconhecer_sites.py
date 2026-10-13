"""Reconhecimento dos sites de leiloeiros (Playwright): para cada fonte com veículos do leiloeiros/fontes.json,
abre a página inicial e até 2 páginas de veículos/leilões, guarda as respostas JSON que o próprio site pede (XHR/fetch:
endereço + 4 KB do conteúdo) e os links e trechos do HTML. Saída: recon/<sigla>.json (o workflow publica no ramo 'recon').
Só páginas públicas; sem login, sem CAPTCHA. Opcional: RECON_SO="Copart Brasil,Freitas Leiloeiro"."""
import json, os, re, sys
from urllib.parse import urljoin, urlparse
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
FONTES = json.load(open(os.path.join(AQUI, "..", "leiloeiros", "fontes.json"), encoding="utf-8"))
SAIDA = os.path.join(AQUI, "..", "recon"); os.makedirs(SAIDA, exist_ok=True)
SO = {s.strip() for s in os.environ.get("RECON_SO", "").split(",") if s.strip()}
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
LIM = int(os.environ.get("RECON_LIM", "4000"))
EXTRAS = [u.strip() for u in os.environ.get("RECON_URLS", "").split(",") if u.strip()]
RE_VEI = re.compile(r"ve[ií]culo|carro|moto|autom|leil[aã]o|lotes|agenda|busca|pesquisa", re.I)

def sigla(u): return re.sub(r"[^a-z0-9]+", "-", urlparse(u).netloc.lower().replace("www.", "").split(".")[0])

def visitar(pg, url, jsons):
    r = {"url": url}
    try:
        resp = pg.goto(url, timeout=45000, wait_until="domcontentloaded")
        pg.wait_for_timeout(6000)
        r["status"] = resp.status if resp else None
        html = pg.content()
        r["titulo"] = pg.title()
        r["tamanho_html"] = len(html)
        r["captcha"] = bool(re.search(r"g-recaptcha|hcaptcha|cf-challenge|turnstile|just a moment", html[:60000], re.I))
        links = pg.eval_on_selector_all("a[href]", "as => as.map(a => [a.href, (a.innerText||'').trim().slice(0,60)])")
        r["links_veiculos"] = [l for l in links if RE_VEI.search(l[0] + " " + l[1])][:80]
        r["amostra_texto"] = re.sub(r"\s+", " ", pg.inner_text("body"))[:3000]
        r["next_data"] = bool(re.search(r'id="__NEXT_DATA__"', html))
        r["jsonld"] = len(re.findall(r'application/ld\+json', html))
    except Exception as e:
        r["erro"] = str(e)[:300]
    return r

def main():
    fontes = [dict(f, grupo=g) for g, itens in FONTES.items() if isinstance(itens, list) for f in itens
              if "veiculos" in f.get("tipos", []) and f.get("ativo", True) and (not SO or f["nome"] in SO)]
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        for f in fontes:
            ctx = b.new_context(user_agent=UA, locale="pt-BR"); pg = ctx.new_page(); jsons = []
            def resp(r):
                try:
                    if "json" in (r.headers.get("content-type") or "") and len(jsons) < 40:
                        jsons.append({"url": r.url, "metodo": r.request.method, "post": (r.request.post_data or "")[:6000],
                                      "status": r.status, "amostra": r.text()[:LIM]})
                except Exception:
                    pass
            pg.on("response", resp)
            out = {"nome": f["nome"], "base": f["url"], "paginas": []}
            out["paginas"].append(visitar(pg, f.get("listagem") or f["url"], jsons))
            seen = set()
            for u, t in out["paginas"][0].get("links_veiculos", []):
                if len(out["paginas"]) >= 3: break
                if urlparse(u).netloc.endswith(urlparse(f["url"]).netloc.replace("www.", "")) and u not in seen \
                   and re.search(r"ve[ií]culo|carro|autom", u + t, re.I):
                    seen.add(u); out["paginas"].append(visitar(pg, u, jsons))
            for u in EXTRAS:
                if urlparse(u).netloc.replace("www.", "") == urlparse(f["url"]).netloc.replace("www.", ""):
                    out["paginas"].append(visitar(pg, u, jsons))
                    try:
                        for _ in range(4):
                            pg.mouse.wheel(0, 4000); pg.wait_for_timeout(1500)
                    except Exception:
                        pass
            out["jsons"] = jsons
            json.dump(out, open(os.path.join(SAIDA, sigla(f["url"]) + ".json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f["nome"], "páginas:", len(out["paginas"]), "json:", len(jsons), flush=True)
            ctx.close()
        b.close()

if __name__ == "__main__":
    main()
