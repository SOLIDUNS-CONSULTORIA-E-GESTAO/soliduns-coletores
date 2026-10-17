"""
SOLIDUNS — ROBÔ EDUCADO — v1.0 (16/10/2026)

Pedido do Thiago (16/10 21h32): "um crawler bem-comportado, que respeita robots.txt, usa crawl-delay e faz uma
requisição a cada 20 segundos, com impacto mínimo". Os robôs de leilão passam todos por aqui:

  - robots.txt: página proibida não é aberta (RFC 9309; robots.txt com erro 4xx = tudo permitido);
  - intervalo por SITE: no mínimo ROBO_INTERVALO segundos (padrão 20) entre dois pedidos ao mesmo site, ou o
    Crawl-delay / Request-rate do robots.txt, o que for MAIOR. Sites diferentes podem ser lidos em paralelo;
  - 429/503: respeita o Retry-After (ou espera 5 min) e, na 3ª vez, deixa o site para a próxima execução;
  - identifica-se como robô da SOLIDUNS, com endereço de contato;
  - no navegador (Playwright) não baixa imagens, vídeos, fontes nem rastreadores: só a página e os dados.
CAPTCHA, Cloudflare e afins NÃO são contornados (regra do projeto): o site sai da rodada e fica registrado.
"""
import os
import re
import threading
import time
import urllib.robotparser as rp
from urllib.parse import urlparse

import requests

UA = "SOLIDUNS-coletor/1.1 (+https://soliduns.com.br; robo educado: 1 pedido a cada 20 s; contato@soliduns.com.br)"
INTERVALO = float(os.environ.get("ROBO_INTERVALO") or (0 if os.environ.get("LEILOES_TESTE") else 20))
ESPERA_429 = float(os.environ.get("ROBO_ESPERA_429") or 300)


def host_de(url):
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}"


class Porteiro:
    def __init__(self, intervalo=INTERVALO, ua=UA):
        self.intervalo, self.ua = intervalo, ua
        self.trava = threading.Lock()
        self.hosts = {}                     # host -> {"trava", "proximo", "regra", "atraso", "avisos", "fora"}

    def _host(self, url):
        h = host_de(url)
        with self.trava:
            if h not in self.hosts:
                self.hosts[h] = {"trava": threading.Lock(), "proximo": 0.0, "regra": None, "atraso": self.intervalo,
                                 "avisos": 0, "fora": False}
            return h, self.hosts[h]

    def _regra(self, h, d):
        if d["regra"] is None:
            regra = rp.RobotFileParser()
            try:
                r = requests.get(h + "/robots.txt", headers={"User-Agent": self.ua}, timeout=30)
                regra.parse(r.text.splitlines() if r.status_code < 400 and "html" not in (r.headers.get("content-type") or "") else [])
            except requests.RequestException:
                regra.parse([])
            atraso = self.intervalo
            for agente in (self.ua, "*"):
                cd = regra.crawl_delay(agente)
                if cd:
                    atraso = max(atraso, float(cd))
                rr = regra.request_rate(agente)
                if rr and rr.requests:
                    atraso = max(atraso, rr.seconds / rr.requests)
            d["regra"], d["atraso"] = regra, atraso
            d["proximo"] = max(d["proximo"], time.time() + (atraso if self.intervalo else 0))   # o robots.txt também conta
        return d["regra"]

    def permitido(self, url):
        h, d = self._host(url)
        with d["trava"]:
            return self._regra(h, d).can_fetch(self.ua, url) and not d["fora"]

    def fora(self, url):
        return self._host(url)[1]["fora"]

    def esperar(self, url):
        """Bloqueia até a vez deste site. Devolve False se o robots.txt proíbe ou o site saiu da rodada."""
        h, d = self._host(url)
        with d["trava"]:
            regra = self._regra(h, d)
            if d["fora"] or not regra.can_fetch(self.ua, url):
                return False
            falta = d["proximo"] - time.time()
            if falta > 0:
                time.sleep(falta)
            d["proximo"] = time.time() + d["atraso"]
            return True

    def resposta(self, url, status, cabecalhos=None):
        """Avisa o resultado: 429/503 empurram a próxima vez do site (Retry-After) e, na 3ª, o site sai da rodada."""
        if status not in (429, 503):
            return
        h, d = self._host(url)
        ra = (cabecalhos or {}).get("Retry-After") or (cabecalhos or {}).get("retry-after")
        espera = float(ra) if ra and re.fullmatch(r"\d+", str(ra).strip()) else ESPERA_429
        with d["trava"]:
            d["avisos"] += 1
            d["proximo"] = time.time() + min(espera, 1800)
            if d["avisos"] >= 3:
                d["fora"] = True


PORTEIRO = Porteiro()

_BLOQUEAR = {"image", "media", "font"}
_RASTREADORES = re.compile(r"(google-analytics|googletagmanager|doubleclick|facebook\.net|hotjar|clarity\.ms|tiktok|criteo)", re.I)


def preparar(pg):
    """Playwright: não baixa imagens, vídeos, fontes nem rastreadores (menos carga no site)."""
    def filtro(rota):
        req = rota.request
        if req.resource_type in _BLOQUEAR or _RASTREADORES.search(req.url):
            return rota.abort()
        return rota.continue_()
    try:
        pg.route("**/*", filtro)
    except Exception:          # noqa: BLE001 — se a versão não suportar, segue sem o filtro
        pass
    return pg


def ir(pg, url, **kw):
    """pg.goto educado: espera a vez do site; devolve None (sem abrir) se o robots.txt proíbe."""
    if not PORTEIRO.esperar(url):
        return None
    r = pg.goto(url, **kw)
    if r is not None:
        PORTEIRO.resposta(url, r.status, r.headers)
    return r
