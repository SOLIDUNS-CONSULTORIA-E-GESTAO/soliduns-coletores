"""
SOLIDUNS — TRIAGEM DE LEILOEIROS — v1.0 (16/10/2026)

Pedido do Thiago (16/10 19h44, "PODE SEGUIR"): antes de ligar qualquer fonte nova, conferir se o site
segue no ar e se a coleta é permitida (regra permanente do projeto). NÃO coleta lotes: só lê a página
inicial, o robots.txt e as páginas de termos de uso de cada candidato.

Para cada fonte de leiloeiros/candidatos_2026-10-16.json (e, com TRIAGEM_TAMBEM_ATUAIS=1, do fontes.json):
  1. página inicial: responde? redireciona para outro domínio? tem desafio anti-robô (Cloudflare, CAPTCHA)?
  2. robots.txt: libera a página inicial e a página de lotes para robôs em geral?
  3. termos de uso: acha os links de termos/condições/regulamento/política na página inicial, abre até 3,
     e procura cláusulas que proíbam robôs, raspagem ou extração automatizada (guarda o trecho).
Resultado por fonte:
  LIBERADO            robots permite, sem bloqueio, termos lidos e sem proibição
  LIBERADO_SEM_TERMOS robots permite, sem bloqueio, mas não achamos os termos (conferir à mão)
  SO_COM_AUTORIZACAO  os termos proíbem robôs/raspagem (ou o robots.txt veta)
  BLOQUEADO           Cloudflare/CAPTCHA/403 — não contornamos
  FORA_DO_AR          não respondeu ou erro
Educado: identifica-se como robô da SOLIDUNS, 1 pedido por vez em cada site, pausa de 2 s entre pedidos.
Saída: triagem/resultado.json e triagem/RELATORIO.md (o workflow publica no ramo "triagem").
"""
import json
import os
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib import robotparser
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

RAIZ = Path(__file__).resolve().parent.parent
UA = "SOLIDUNS-triagem/1.0 (+https://soliduns.com.br; verificacao de robots.txt e termos de uso)"
UA_NAV = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
PAUSA, TIMEOUT = 2.0, 25
SAIDA = RAIZ / "triagem"

RE_DESAFIO = re.compile(r"(cf-challenge|cf_chl_|challenge-platform|just a moment|checking your browser|g-recaptcha|hcaptcha|turnstile|ddos-guard|access denied|attention required)", re.I)
RE_LINK_TERMOS = re.compile(r"(termo|condi[cç][oõ]es|regulamento|pol[ií]tica|privacidade|aviso legal|legal|uso do site|termos-de-uso|condicoes-de-uso)", re.I)
# proibição de robôs/raspagem: palavra do assunto perto de uma palavra de proibição (até ~160 caracteres)
ASSUNTO = r"(rob[oô]s?|bots?\b|crawler|spider|scrap|raspag|rastreador|extra[cç][aã]o (autom|de dados)|minera[cç][aã]o de dados|data mining|meios? automatizad|ferramentas? automatizad|programas? automatizad|coleta automatizad|captura autom)"
PROIBE = r"(proib|vedad|n[aã]o (é|e|ser[aá]) permitid|n[aã]o poder[aá]|n[aã]o pode|n[aã]o [eé] autorizad|sem (a )?(pr[eé]via )?autoriza|abster|n[aã]o utiliz)"
RE_PROIBE = re.compile(rf"{ASSUNTO}[^.]{{0,160}}{PROIBE}|{PROIBE}[^.]{{0,160}}{ASSUNTO}", re.I)


def sem_acento(s):
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()


def url_de(u):
    u = (u or "").strip()
    return u if u.startswith("http") else "https://" + u


class Site:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA_NAV, "Accept-Language": "pt-BR,pt;q=0.9", "From": "contato@soliduns.com.br"})
        self.ultimo = 0.0

    def get(self, url, ua=None):
        espera = PAUSA - (time.time() - self.ultimo)
        if espera > 0:
            time.sleep(espera)
        try:
            return self.s.get(url, timeout=TIMEOUT, allow_redirects=True, headers={"User-Agent": ua} if ua else None)
        finally:
            self.ultimo = time.time()


def desafio(r):
    if r is None:
        return False
    corpo = r.text[:20000] if "html" in (r.headers.get("content-type") or "") else ""
    if r.status_code in (403, 429, 503) and ("cf-ray" in {k.lower() for k in r.headers} or RE_DESAFIO.search(corpo)):
        return True
    return bool(RE_DESAFIO.search(corpo)) and len(corpo) < 15000


def triar(f):
    url = url_de(f["url"])
    base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    out = {"nome": f["nome"], "url": url, "grupo": f.get("grupo"), "bens": f.get("bens"), "uf": f.get("uf"),
           "status": None, "url_final": None, "robots": None, "termos": [], "proibicao": None, "classe": None, "nota": ""}
    s = Site()
    try:
        r = s.get(url)
    except requests.RequestException as e:
        out.update(classe="FORA_DO_AR", nota=f"erro: {type(e).__name__}")
        return out
    out["status"], out["url_final"] = r.status_code, r.url
    if desafio(r):
        out.update(classe="BLOQUEADO", nota=f"desafio anti-robô (HTTP {r.status_code})")
        return out
    if r.status_code >= 400:
        out.update(classe="FORA_DO_AR" if r.status_code >= 500 or r.status_code == 404 else "BLOQUEADO", nota=f"HTTP {r.status_code}")
        return out
    final = f"{urlparse(r.url).scheme}://{urlparse(r.url).netloc}"
    if urlparse(final).netloc.replace("www.", "") != urlparse(base).netloc.replace("www.", ""):
        out["nota"] = f"redireciona para {urlparse(final).netloc}; "
    # robots.txt do domínio final
    rp = robotparser.RobotFileParser()
    try:
        rr = s.get(final + "/robots.txt", ua=UA)
        if rr.status_code == 200 and "html" not in (rr.headers.get("content-type") or ""):
            rp.parse(rr.text.splitlines())
            pode_ini = rp.can_fetch(UA, r.url) and rp.can_fetch("*", r.url)
            out["robots"] = "permite" if pode_ini else "veta"
            if re.search(r"(?im)^\s*disallow:\s*/\s*$", rr.text) and re.search(r"(?im)^\s*user-agent:\s*\*\s*$", rr.text) and not pode_ini:
                out["robots"] = "veta tudo"
        else:
            out["robots"] = f"sem robots.txt (HTTP {rr.status_code})"
    except requests.RequestException:
        out["robots"] = "robots.txt não respondeu"
    # termos de uso
    sopa = BeautifulSoup(r.text, "html.parser")
    links = []
    for a in sopa.find_all("a", href=True):
        txt = " ".join(a.get_text(" ").split())[:80]
        href = urljoin(r.url, a["href"])
        if href.startswith("http") and (RE_LINK_TERMOS.search(txt) or RE_LINK_TERMOS.search(a["href"])) and href not in [l[1] for l in links]:
            links.append((txt or a["href"], href))
    links.sort(key=lambda l: (0 if re.search(r"termo|condi", l[0] + l[1], re.I) else 1))
    for txt, href in links[:3]:
        try:
            t = s.get(href)
        except requests.RequestException:
            continue
        if t.status_code != 200:
            continue
        texto = " ".join(BeautifulSoup(t.text, "html.parser").get_text(" ").split()) if "html" in (t.headers.get("content-type") or "") else ""
        out["termos"].append(href)
        m = RE_PROIBE.search(texto)
        if m:
            ini = max(0, m.start() - 120)
            out["proibicao"] = {"pagina": href, "trecho": texto[ini:m.end() + 120]}
            break
    # classe
    if out["proibicao"] or (out["robots"] or "").startswith("veta"):
        out["classe"] = "SO_COM_AUTORIZACAO"
        out["nota"] += "termos proíbem robôs/raspagem" if out["proibicao"] else "robots.txt veta"
    elif out["termos"]:
        out["classe"] = "LIBERADO"
    else:
        out["classe"] = "LIBERADO_SEM_TERMOS"
        out["nota"] += "termos de uso não encontrados na página inicial — conferir à mão"
    return out


def main():
    cand = json.loads((RAIZ / "leiloeiros" / "candidatos_2026-10-16.json").read_text(encoding="utf-8"))
    if os.environ.get("TRIAGEM_TAMBEM_ATUAIS") == "1":
        atuais = json.loads((RAIZ / "leiloeiros" / "fontes.json").read_text(encoding="utf-8"))
        for k, v in atuais.items():
            if isinstance(v, list):
                cand += [{"nome": x["nome"], "url": x["url"], "grupo": "Já na plataforma", "bens": x.get("tipos")} for x in v if x.get("ativo", True)]
    so = [s.strip().lower() for s in (os.environ.get("TRIAGEM_SO") or "").split(",") if s.strip()]
    if so:
        cand = [c for c in cand if any(x in c["nome"].lower() for x in so)]
    print(f"Triagem de {len(cand)} fontes", flush=True)
    res = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        for i, o in enumerate(ex.map(triar, cand), 1):
            res.append(o)
            print(f"[{i}/{len(cand)}] {o['classe']:20s} {o['nome']} — {o['nota']}", flush=True)
    SAIDA.mkdir(exist_ok=True)
    (SAIDA / "resultado.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    from collections import Counter
    c = Counter(o["classe"] for o in res)
    linhas = [f"# Triagem de leiloeiros — {time.strftime('%d/%m/%Y %H:%M')} UTC", "", "| Classe | Fontes |", "|---|---|"]
    linhas += [f"| {k} | {v} |" for k, v in c.most_common()]
    for classe in ["LIBERADO", "LIBERADO_SEM_TERMOS", "SO_COM_AUTORIZACAO", "BLOQUEADO", "FORA_DO_AR"]:
        lista = [o for o in res if o["classe"] == classe]
        if lista:
            linhas += ["", f"## {classe} ({len(lista)})", ""]
            linhas += [f"- {o['nome']} — {o['url']} — robots: {o['robots']} — {o['nota']}"
                       + (f" — trecho: \"{o['proibicao']['trecho'][:300]}\"" if o.get("proibicao") else "") for o in lista]
    (SAIDA / "RELATORIO.md").write_text("\n".join(linhas) + "\n", encoding="utf-8")
    print("\n".join(linhas[:12]))


if __name__ == "__main__":
    sys.exit(main())
