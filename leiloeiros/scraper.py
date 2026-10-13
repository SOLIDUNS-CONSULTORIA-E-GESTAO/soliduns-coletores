#!/usr/bin/env python3
# scraper.py — leilões de imóveis e veículos
# pip install requests beautifulsoup4 lxml   (opcional: pip install playwright && playwright install chromium)
# cron (06h diário):  0 6 * * * cd /opt/leiloes && /usr/bin/python3 scraper.py >> cron.log 2>&1
import json, re, time, random, hashlib, logging, unicodedata, os, tempfile
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse, urlunparse, parse_qsl, urlencode
from urllib import robotparser
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from bs4 import BeautifulSoup

BASE = Path(__file__).resolve().parent
FONTES, SAIDA, LOG = BASE / "fontes.json", BASE / "lotes.json", BASE / "scraper.log"
TIMEOUT, TENTATIVAS, MAX_PAGINAS, MAX_LISTAGENS, WORKERS = 25, 3, 5, 6, 6
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    handlers=[logging.FileHandler(LOG, encoding="utf-8"), logging.StreamHandler()])
log = logging.getLogger("leiloes")

RE_VALOR = re.compile(r"R\$\s*([\d.]+(?:,\d{2})?)")
RE_DATA = re.compile(r"\b(\d{2})/(\d{2})/(\d{4})(?:\D{1,6}(\d{2})[:h](\d{2}))?")
RE_LINK_LOTE = re.compile(r"(lote|leilao|leiloes|imovel|imoveis|veiculo|veiculos|item|produto|detalhe|bem)", re.I)
RE_LINK_LISTA = re.compile(r"(leil(ao|oes)|agenda|lotes|imoveis|veiculos|andamento|proximos|abertos|busca)", re.I)
RE_PROXIMA = re.compile(r"^\s*(pr[oó]xim[ao]|seguinte|›|»|>)\s*$", re.I)
RE_CAPTCHA = re.compile(r"(g-recaptcha|hcaptcha|cf-challenge|cf_chl_|turnstile|just a moment|captcha)", re.I)

def sem_acento(t):
    return unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()

KW_IMOVEL = re.compile(r"\b(apartamento|apto|casa|sobrado|terreno|lote urbano|gleba|sala comercial|loja|galpao|predio|"
                       r"imovel|fazenda|chacara|sitio|area rural|cobertura|kitnet|flat|matricula|residencial)\b")
KW_VEICULO = re.compile(r"\b(veiculo|automovel|carro|moto|motocicleta|caminhao|onibus|utilitario|van|pickup|picape|"
                        r"reboque|semirreboque|renavam|chassi|placa|fiat|volkswagen|vw|chevrolet|ford|toyota|honda|"
                        r"hyundai|renault|nissan|jeep|yamaha|mercedes|scania|volvo|iveco|peugeot|citroen)\b")

class Bloqueado(Exception):
    pass

# ---------- HTTP ----------
def nova_sessao():
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9",
                      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"})
    return s

_robots = {}
def permitido(url):
    dom = "{0.scheme}://{0.netloc}".format(urlparse(url))
    if dom not in _robots:
        rp = robotparser.RobotFileParser()
        try:
            r = requests.get(dom + "/robots.txt", headers={"User-Agent": UA}, timeout=10)
            rp.parse(r.text.splitlines() if r.status_code == 200 else [])
        except requests.RequestException:
            rp.parse([])
        _robots[dom] = rp
    return _robots[dom].can_fetch(UA, url)

def baixar(s, url):
    if not permitido(url):
        raise Bloqueado("robots.txt")
    for i in range(1, TENTATIVAS + 1):
        try:
            r = s.get(url, timeout=TIMEOUT)
            corpo = r.text[:40000]
            if r.status_code in (403, 429, 503) and RE_CAPTCHA.search(corpo):
                raise Bloqueado(f"captcha/{r.status_code}")
            if r.status_code in (403, 429, 500, 502, 503, 504):
                raise requests.HTTPError(f"HTTP {r.status_code}")
            r.raise_for_status()
            if len(r.text) < 40000 and RE_CAPTCHA.search(corpo):
                raise Bloqueado("captcha")
            if not r.encoding or r.encoding.lower() == "iso-8859-1":
                r.encoding = r.apparent_encoding
            return r.text
        except Bloqueado:
            raise
        except requests.RequestException as e:
            espera = 2 ** i + random.uniform(0, 1.5)
            log.warning("tentativa %d/%d %s: %s (aguarda %.1fs)", i, TENTATIVAS, url, e, espera)
            time.sleep(espera)
    raise RuntimeError(f"falhou após {TENTATIVAS} tentativas: {url}")

def renderizar(url):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_page(user_agent=UA, locale="pt-BR")
        pg.goto(url, timeout=TIMEOUT * 1000, wait_until="networkidle")
        html = pg.content()
        b.close()
    if RE_CAPTCHA.search(html[:40000]) and len(html) < 40000:
        raise Bloqueado("captcha (render)")
    return html

# ---------- Normalização ----------
def valor_float(txt):
    m = RE_VALOR.search(txt or "")
    if not m:
        return None
    try:
        return float(m.group(1).replace(".", "").replace(",", "."))
    except ValueError:
        return None

def data_iso(txt):
    m = RE_DATA.search(txt or "")
    if not m:
        return None
    d, mo, a, h, mi = m.groups()
    try:
        return datetime(int(a), int(mo), int(d), int(h or 0), int(mi or 0)).isoformat()
    except ValueError:
        return None

def categoria(texto, tipos):
    t = sem_acento(texto)
    if KW_IMOVEL.search(t):
        return "imovel"
    if KW_VEICULO.search(t):
        return "veiculo"
    if tipos == ["imoveis"]:
        return "imovel"
    if tipos == ["veiculos"]:
        return "veiculo"
    return None

def canonico(url):
    p = urlparse(url)
    q = [(k, v) for k, v in parse_qsl(p.query) if not k.lower().startswith(("utm_", "fbclid", "gclid"))]
    return urlunparse((p.scheme, p.netloc.lower(), p.path.rstrip("/"), "", urlencode(q), ""))

def lote_id(link):
    return hashlib.sha1(canonico(link).encode()).hexdigest()[:16]

def montar(fonte, titulo, link, texto, valor=None, data=None):
    titulo = re.sub(r"\s+", " ", titulo or "").strip()[:300]
    cat = categoria(f"{titulo} {texto}", fonte.get("tipos", []))
    if not titulo or not link or not cat:
        return None
    return {"id": lote_id(link), "titulo": titulo, "categoria": cat,
            "valor": valor if valor is not None else valor_float(texto),
            "data": data or data_iso(texto), "link": canonico(link),
            "fonte": fonte["nome"], "grupo": fonte["grupo"],
            "texto": re.sub(r"\s+", " ", texto or "")[:1200]}

# ---------- Extração ----------
def de_jsonld(soup, base, fonte):
    out = []
    for sc in soup.find_all("script", type="application/ld+json"):
        try:
            dados = json.loads(sc.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        pilha = dados if isinstance(dados, list) else [dados]
        while pilha:
            o = pilha.pop()
            if not isinstance(o, dict):
                continue
            pilha.extend(o.get("@graph", []) or [])
            pilha.extend([x.get("item") for x in o.get("itemListElement", []) if isinstance(x, dict)])
            tipo = str(o.get("@type", ""))
            if any(k in tipo for k in ("Product", "Offer", "Event", "Residence", "Vehicle", "RealEstate", "Accommodation")):
                of = o.get("offers") or {}
                of = of[0] if isinstance(of, list) and of else of
                preco = of.get("price") if isinstance(of, dict) else None
                try:
                    preco = float(preco) if preco is not None else None
                except (TypeError, ValueError):
                    preco = None
                lote = montar(fonte, o.get("name"), urljoin(base, o.get("url") or ""),
                              f"{o.get('name','')} {o.get('description','')}", preco, o.get("startDate"))
                if lote:
                    out.append(lote)
    return out

def de_seletores(soup, base, fonte):
    sel, out = fonte["seletores"], []
    for card in soup.select(sel["card"]):
        a = card.select_one(sel.get("link", "a[href]"))
        tit = card.select_one(sel["titulo"]) if sel.get("titulo") else a
        txt = card.get_text(" ", strip=True)
        val = card.select_one(sel["valor"]).get_text(" ", strip=True) if sel.get("valor") and card.select_one(sel["valor"]) else txt
        dat = card.select_one(sel["data"]).get_text(" ", strip=True) if sel.get("data") and card.select_one(sel["data"]) else txt
        if a and a.get("href"):
            lote = montar(fonte, tit.get_text(" ", strip=True) if tit else "", urljoin(base, a["href"]),
                          txt, valor_float(val), data_iso(dat))
            if lote:
                out.append(lote)
    return out

def de_heuristica(soup, base, fonte):
    dom, out, vistos = urlparse(base).netloc, [], set()
    for a in soup.find_all("a", href=True):
        href = urljoin(base, a["href"])
        if urlparse(href).netloc != dom or not RE_LINK_LOTE.search(urlparse(href).path) or href in vistos:
            continue
        card = a
        for _ in range(5):
            if card.parent is None:
                break
            card = card.parent
            if RE_VALOR.search(card.get_text(" ", strip=True)):
                break
        txt = card.get_text(" ", strip=True)
        if len(txt) > 1500 or not (RE_VALOR.search(txt) or RE_DATA.search(txt)):
            continue
        h = card.find(["h1", "h2", "h3", "h4", "h5", "strong"])
        titulo = (h.get_text(" ", strip=True) if h else "") or a.get("title") or a.get_text(" ", strip=True)
        lote = montar(fonte, titulo, href, txt)
        if lote:
            vistos.add(href)
            out.append(lote)
    return out

def extrair(html, base, fonte):
    soup = BeautifulSoup(html, "lxml")
    lotes = de_jsonld(soup, base, fonte)
    if fonte.get("seletores"):
        lotes += de_seletores(soup, base, fonte)
    if not lotes:
        lotes = de_heuristica(soup, base, fonte)
    return lotes, soup

def proxima_pagina(soup, base):
    a = soup.find("a", rel="next") or next((x for x in soup.find_all("a", href=True)
                                             if RE_PROXIMA.match(x.get_text(" ", strip=True))), None)
    return urljoin(base, a["href"]) if a and a.get("href") else None

def descobrir_listagens(soup, base):
    dom, urls = urlparse(base).netloc, []
    for a in soup.find_all("a", href=True):
        u = urljoin(base, a["href"]).split("#")[0]
        if urlparse(u).netloc == dom and RE_LINK_LISTA.search(urlparse(u).path) and u not in urls:
            urls.append(u)
    return urls[:MAX_LISTAGENS]

# ---------- Fonte ----------
def obter_html(s, url, fonte):
    if fonte.get("render"):
        html = renderizar(url)
        if html:
            return html
    html = baixar(s, url)
    return html

def processar(fonte):
    s, lotes, visitadas = nova_sessao(), {}, set()
    try:
        inicio = fonte.get("listagem") or fonte["url"]
        html = obter_html(s, inicio, fonte)
        achados, soup = extrair(html, inicio, fonte)
        fila = [inicio] if achados else []
        if not achados and not fonte.get("listagem"):
            fila = descobrir_listagens(soup, inicio)
        for l in achados:
            lotes[l["id"]] = l
        visitadas.add(inicio)
        for url in fila:
            pag = 0
            while url and url not in visitadas | ({inicio} if pag == 0 and url == inicio else set()) or (pag == 0 and url == inicio):
                if pag >= MAX_PAGINAS:
                    break
                if url != inicio or pag > 0:
                    time.sleep(random.uniform(1.0, 2.5))
                    html = obter_html(s, url, fonte)
                    achados, soup = extrair(html, url, fonte)
                    if not achados and not fonte.get("render"):
                        r = renderizar(url)
                        if r:
                            achados, soup = extrair(r, url, fonte)
                    for l in achados:
                        lotes[l["id"]] = l
                visitadas.add(url)
                pag += 1
                url = proxima_pagina(soup, url)
        log.info("OK %s: %d lotes", fonte["nome"], len(lotes))
        return fonte["nome"], list(lotes.values()), None
    except Bloqueado as e:
        log.error("BLOQUEADO %s: %s", fonte["nome"], e)
        return fonte["nome"], list(lotes.values()), f"bloqueado: {e}"
    except Exception as e:
        log.error("ERRO %s: %s", fonte["nome"], e)
        return fonte["nome"], list(lotes.values()), str(e)

# ---------- Persistência ----------
def carregar_fontes():
    dados, fontes = json.loads(FONTES.read_text(encoding="utf-8")), []
    for grupo, itens in dados.items():
        if grupo.startswith("_") or not isinstance(itens, list):
            continue
        for f in itens:
            if f.get("ativo", True):
                fontes.append({**f, "grupo": grupo})
    return fontes

def salvar_atomico(path, obj):
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)

def main():
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    base = {l["id"]: l for l in json.loads(SAIDA.read_text(encoding="utf-8"))} if SAIDA.exists() else {}
    novos, erros = 0, {}
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for fut in as_completed([ex.submit(processar, f) for f in carregar_fontes()]):
            nome, lotes, erro = fut.result()
            if erro:
                erros[nome] = erro
            for l in lotes:
                if l["id"] in base:
                    base[l["id"]].update({k: v for k, v in l.items() if v is not None}, visto_em=agora)
                else:
                    base[l["id"]] = {**l, "primeiro_visto": agora, "visto_em": agora}
                    novos += 1
    salvar_atomico(SAIDA, sorted(base.values(), key=lambda x: (x.get("data") or "9999", x["fonte"])))
    salvar_atomico(BASE / "erros_ultima_execucao.json", {"execucao": agora, "erros": erros})
    log.info("FIM: %d lotes no total, %d novos, %d fontes com erro", len(base), novos, len(erros))

def enviar_supabase():
    url, chave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not chave:
        log.info("Supabase não configurado: resultado só em lotes.json")
        return
    lotes = []
    for l in json.loads(SAIDA.read_text(encoding="utf-8")):
        d = l.get("data") or ""
        lotes.append({"id": l["id"], "titulo": l["titulo"], "categoria": l["categoria"],
                      "valor": l.get("valor"), "data_leilao": d[:19] if re.match(r"\d{4}-\d{2}-\d{2}", d) else None,
                      "link": l["link"], "fonte": l["fonte"], "grupo": l.get("grupo"), "visto_em": l["visto_em"]})
    h = {"apikey": chave, "Authorization": f"Bearer {chave}", "Content-Type": "application/json",
         "Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(lotes), 500):
        r = requests.post(f"{url.rstrip('/')}/rest/v1/leiloes_lotes_raspados?on_conflict=id",
                          headers=h, json=lotes[i:i + 500], timeout=60)
        if r.status_code >= 300:
            log.error("Supabase %s: %s", r.status_code, r.text[:500])
            raise SystemExit(1)
    log.info("Supabase: %d lotes enviados", len(lotes))

if __name__ == "__main__":
    main()
    enviar_supabase()
