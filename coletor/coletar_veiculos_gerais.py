"""
SOLIDUNS — LEILÃO DE AUTOMÓVEIS — Leiloeiros gerais — v1.0 (13/10/2026)

Amplia a cobertura de veículos para os leiloeiros de leiloeiros/fontes.json (Copart, Sodré Santoro, Freitas,
Palácio dos Leilões, Parque dos Leilões, Pestana, Milan, Sato, leiloeiros judiciais...). Os sites já lidos por
leitores próprios (Zuk, Mega, Superbid, VIP, Leilo) ficam de fora. Bancos, seguradoras e frotas aparecem como
COMITENTE nesses leiloeiros (Santander, BV, Itaú, Bradesco, Porto Seguro...): lote de banco/financeira -> fonte 'banco'.

Como lê: o raspador genérico (leiloeiros/scraper.py: JSON-LD, seletores ou heurística; respeita robots.txt,
sem CAPTCHA/login) traz os cartões; cada cartão passa pelas REGRAS FIXAS (veiculos_regras / coletar_leiloeiros):
marca e modelo casados com a Tabela FIPE, ano, cidade/UF do IBGE, condição. Entra SÓ o lote com marca da FIPE
identificada e ano ou valor (o resto é descartado e contado no log). Custo zero (sem IA).

Grava em public.veiculos_leiloes (fonte 'leiloeiro' ou 'banco'; anunciante_sigla = 'g-<site>'), com a comissão
do leiloeiro quando o cartão informa ("comissão de 5%"). Lote não visto há 3 dias (com leitura do site sem erro) -> encerrado.
v1.1: leitor PRÓPRIO da Sodré Santoro (a busca de lotes que o próprio site usa, /api/search-lots: veículos de
bancos, seguradoras e judiciais, com marca, modelo, ano, km, pátio, comitente, fotos e comissão). Os demais
continuam no raspador genérico até ganharem leitor próprio (reconhecimento: rotina "Reconhecimento - sites de leiloeiros").
v1.3: leitor PRÓPRIO da Pestana Leilões (lista /procurar-bens?tipoBem=421 lida na página + /api/v2/leilao para
cidade do pátio e edital). Origem "Retomado" (recuperado de financiamento) -> fonte 'banco'; "Judicial" -> judicial.
v1.4: leitor PRÓPRIO do Leilões Judiciais (/veiculos?pagina=N, 42 por página, lido no DOM; página de cada
leilão para nome do comitente/vara e data). Vara/tribunal -> judicial; Detran/PRF/Receita -> órgão público.
v1.5: leitor PRÓPRIO da Freitas Leiloeiro (/Leiloes/Pesquisar?categoria=1 no navegador, clicando em
"Carregar mais lotes"; comitente FINANCEIRA/BANCO -> banco; pátios em SP).
Secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY. Opcional: GERAIS_SO="Copart Brasil,Sodré Santoro" (testar poucas).
"""
import datetime as dt
import hashlib
import os
import re
import sys
from urllib.parse import urlparse

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
sys.path.insert(0, os.path.join(AQUI, "..", "leiloeiros"))

import coletar_leiloeiros as CL          # noqa: E402  (sb_get, sb_upsert, sb_patch, linha_veiculo, NOMES, UFS)
import scraper as G                     # noqa: E402
from veiculos_regras import Catalogo, Cidades  # noqa: E402

VERSAO = "1.5"
JA_LIDOS = ("portalzuk.", "megaleiloes.", "superbid.", "vipleiloes.", "leilo.com.br")
DIAS_SEM_VER = 3
RE_BANCO = re.compile(r"\b(banco|santander|bradesco|ita[uú]|caixa econ|bv financeira|banco bv|safra|daycoval|omni|"
                      r"sicoob|sicredi|financeira|cons[oó]rcio|aymor[eé]|pan\b|votorantim|porto seguro financ)", re.I)
RE_COMISSAO = re.compile(r"comiss[aã]o[^%\d]{0,40}(\d{1,2}(?:[.,]\d{1,2})?)\s*%", re.I)
RE_CID_UF = re.compile(r"([A-ZÀ-Úa-zà-ú][A-Za-zÀ-ú' .\-]{2,40})\s*[/\-–]\s*(" + "|".join(sorted(CL.UFS)) + r")\b")


def sigla(url):
    h = urlparse(url).netloc.lower().replace("www.", "")
    return "g-" + re.sub(r"[^a-z0-9]+", "-", h.split(".")[0])[:20]


def para_linha(f, lote, catalogo, cidades, agora, hoje):
    texto = f"{lote['titulo']} {lote.get('texto') or ''}"
    sg = sigla(f["url"])
    CL.NOMES[sg] = f["nome"]
    m = RE_CID_UF.search(lote.get("texto") or "")
    cidade, uf = None, None
    if m:
        uf, palavras = m.group(2), m.group(1).split()
        for i in range(max(0, len(palavras) - 4), len(palavras)):     # "Pátio em Campinas" -> "Campinas"
            c = cidades.oficial(" ".join(palavras[i:]), uf)
            if c:
                cidade = c
                break
    data = (lote.get("data") or "")[:10] or None
    x = {"codigo": hashlib.sha1(lote["link"].encode()).hexdigest()[:14], "link": lote["link"],
         "titulo": lote["titulo"], "comitente": texto, "foto": None}
    v = CL.linha_veiculo(sg, x, texto, None, catalogo, cidades, agora, hoje, uf, cidade,
                         lote.get("valor"), data, None)
    if not v or not v.get("marca") or not (v.get("ano_modelo") or v.get("ano_fabricacao") or v.get("lance_inicial")):
        return None
    if RE_BANCO.search(texto):
        v["fonte"] = "banco"
    c = RE_COMISSAO.search(texto)
    if c:
        pct = float(c.group(1).replace(",", "."))
        v["comissao_pct"] = pct if 0 < pct <= 20 else None
    v["origem_nome"] = f["nome"]
    return v


# ------------------------------------------------------------ leitores próprios
SODRE_URL = "https://www.sodresantoro.com.br"
SODRE_PAG, SODRE_MAX = 48, 60


def _sodre_corpo(de):
    return {"indices": ["veiculos", "judiciais-veiculos"],
            "query": {"bool": {"filter": [
                {"bool": {"should": [{"bool": {"must": [{"term": {"auction_status": "online"}}]}},
                                     {"bool": {"must": [{"term": {"auction_status": "aberto"}}],
                                               "must_not": [{"terms": {"lot_status_id": [5, 7]}}]}}],
                          "minimum_should_match": 1}},
                {"bool": {"must_not": [{"term": {"lot_test": True}}]}}]}},
            "from": de, "size": SODRE_PAG,
            "sort": [{"lot_status_id_order": {"order": "asc"}}, {"auction_date_init": {"order": "asc"}}]}


def ler_sodre(f, catalogo, cidades, agora, hoje):
    """v1.2: a busca é feita DE DENTRO da página (fetch do próprio navegador, mesma origem e cookies);
    se o site recusar (403), lê as respostas que a própria página pede ao navegar /veiculos/lotes?page=N."""
    from playwright.sync_api import sync_playwright
    sg = sigla(f["url"]); CL.NOMES[sg] = f["nome"]
    linhas, descartados, erro, vistos = {}, 0, None, set()

    def usar(res):
        nonlocal descartados
        for x in res:
            k = str(x.get("lot_id") or x.get("id"))
            if k in vistos:
                continue
            vistos.add(k)
            v = linha_sodre(f, sg, x, catalogo, cidades, agora, hoje)
            if v:
                linhas[v["id"]] = v
            else:
                descartados += 1

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(user_agent=G.UA, locale="pt-BR")
        pg = ctx.new_page()
        capturadas = []
        def resp(r):
            if "/api/search-lots" in r.url and r.status == 200:
                try:
                    capturadas.append(r.json().get("results") or [])
                except Exception:
                    pass
        pg.on("response", resp)
        try:
            pg.goto(SODRE_URL + "/veiculos/lotes", timeout=60000, wait_until="networkidle")
            pg.wait_for_timeout(3000)
            for i in range(SODRE_MAX):
                r = pg.evaluate("""async (corpo) => {
                    const r = await fetch('/api/search-lots', {method: 'POST', credentials: 'include',
                        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}, body: JSON.stringify(corpo)});
                    return {status: r.status, dados: r.ok ? await r.json() : null};
                }""", _sodre_corpo(i * SODRE_PAG))
                if r["status"] != 200:
                    erro = f"search-lots HTTP {r['status']} (fetch na página)"
                    break
                res = (r["dados"] or {}).get("results") or []
                usar(res)
                if len(res) < SODRE_PAG:
                    break
                pg.wait_for_timeout(1500)
            if erro:                                     # plano B: navegar pelas páginas da lista
                for c in capturadas:
                    usar(c)
                for n in range(2, SODRE_MAX + 1):
                    antes = len(vistos)
                    pg.goto(f"{SODRE_URL}/veiculos/lotes?page={n}", timeout=60000, wait_until="networkidle")
                    pg.wait_for_timeout(2500)
                    for c in capturadas:
                        usar(c)
                    capturadas.clear()
                    if len(vistos) == antes:
                        break
                if linhas:
                    erro = None
                else:
                    erro += "; plano B (navegação) também sem lotes"
        except Exception as e:
            erro = str(e)[:200]
        b.close()
    return linhas, descartados, erro


def linha_sodre(f, sg, x, catalogo, cidades, agora, hoje):
    CL.NOMES[sg] = f["nome"]
    loc = (x.get("lot_location") or "").strip()
    m = re.search(r"^(.*?)(?:\s+[ivx]+)?\s*/\s*([a-z]{2})$", loc, re.I)
    uf = m.group(2).upper() if m else None
    cidade = cidades.oficial(m.group(1), uf) if m and uf in CL.UFS else None
    ano = "/".join(str(a) for a in (x.get("lot_year_manufacture"), x.get("lot_year_model")) if a)
    comit = " · ".join(t for t in (x.get("client_name"), x.get("auction_name")) if t)
    texto = " ".join(str(t) for t in (x.get("lot_brand"), x.get("lot_model"), ano, x.get("lot_fuel"), x.get("lot_color"),
                                       f"{x['lot_km']} km" if x.get("lot_km") else "", "sucata" if x.get("lot_is_scrap") else "",
                                       f"Comitente: {comit}.", (x.get("lot_description") or "")[:500]) if t)
    def num(v):
        try:
            v = float(v)
            return v if v > 0 else None
        except (TypeError, ValueError):
            return None
    lance = num(x.get("bid_actual")) or num(x.get("bid_initial"))
    fotos = [u for u in (x.get("lot_pictures") or []) if isinstance(u, str)][:8]
    item = {"codigo": str(x.get("lot_id") or x.get("id")), "titulo": (x.get("lot_title") or "").title(), "comitente": comit,
            "link": f"https://leilao.sodresantoro.com.br/telao/enter_html/leilao_id/{x.get('auction_id')}/lote_id/{x.get('lot_id')}",
            "foto": fotos[0] if fotos else None, "fotos": fotos[1:]}
    v = CL.linha_veiculo(sg, item, texto, None, catalogo, cidades, agora, hoje, uf, cidade, lance,
                         (x.get("auction_date_init") or "")[:10] or None, (x.get("lot_date_end") or "")[:10] or None)
    if not v or not v.get("marca"):
        return None
    if not v.get("modelo_codigo") and v.get("marca_codigo") and x.get("lot_model") and catalogo:
        fam, cod = catalogo.modelo(v["tipo"], v["marca_codigo"], x["lot_model"])
        if fam:
            v.update(familia=fam, modelo_codigo=cod, modelo_texto=f"{v['marca']}/{x['lot_model']}"[:80])
            v["titulo"] = CL.titulo_veiculo(v, item["titulo"])
    if x.get("lot_year_model") and not v.get("ano_modelo"):
        v["ano_modelo"] = int(x["lot_year_model"])
    if x.get("lot_year_manufacture") and not v.get("ano_fabricacao"):
        v["ano_fabricacao"] = int(x["lot_year_manufacture"])
    if x.get("lot_km") and not v.get("km"):
        v["km"] = int(x["lot_km"])
    v["modalidade"] = "judicial" if x.get("lot_is_judicial") or x.get("segment_slug") == "judiciais" else "extrajudicial"
    if v["modalidade"] != "judicial" and RE_BANCO.search(comit):
        v["fonte"] = "banco"
    c = RE_COMISSAO.search(x.get("lot_rate_information") or "")
    if c:
        pct = float(c.group(1).replace(",", "."))
        v["comissao_pct"] = pct if 0 < pct <= 20 else None
    v["origem_nome"] = f"{f['nome']} · {x['client_name'].title()}"[:80] if x.get("client_name") else f["nome"]
    return v


PESTANA_URL = "https://www.pestanaleiloes.com.br"
PESTANA_QTD, PESTANA_MAX = 48, 30
JS_PESTANA_CARDS = """() => {
  const out = [], vistos = new Set();
  document.querySelectorAll('a[href*="/agenda-de-leiloes/"]').forEach(a => {
    const m = a.href.match(/agenda-de-leiloes\\/(\\d+)\\/(\\d+)/); if (!m || vistos.has(m[2])) return;
    let c = a; for (let i = 0; i < 6 && c.parentElement; i++) { c = c.parentElement; if (/Lance/.test(c.innerText || '')) break; }
    const img = c.querySelector('img[src*="http"]');
    vistos.add(m[2]);
    out.push({leilao: m[1], lote: m[2], link: a.href.split('?')[0], texto: (c.innerText || '').slice(0, 900), foto: img ? img.src : null});
  });
  return out;
}"""


def ler_pestana(f, catalogo, cidades, agora, hoje):
    from playwright.sync_api import sync_playwright
    sg = sigla(f["url"]); CL.NOMES[sg] = f["nome"]
    linhas, descartados, erro, vistos = {}, 0, None, set()
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_context(user_agent=G.UA, locale="pt-BR").new_page()
        try:
            pg.goto(PESTANA_URL, timeout=60000, wait_until="domcontentloaded")
            pg.wait_for_timeout(2500)
            leiloes = {}
            r = pg.evaluate("async () => { const r = await fetch('/api/v2/leilao'); return r.ok ? await r.json() : []; }")
            for l in r or []:
                ex = (l.get("exposicao") or [{}])[0] or {}
                ed = next((d.get("link") for d in (l.get("documentos") or []) if "edital" in (d.get("nome") or "").lower()), None)
                leiloes[str(l.get("id"))] = {"nome": l.get("nome"), "cidade": ex.get("cidade"), "uf": ex.get("estado"), "edital": ed}
            for n in range(1, PESTANA_MAX + 1):
                pg.goto(f"{PESTANA_URL}/procurar-bens?tipoBem=421&lotePage={n}&loteQty={PESTANA_QTD}",
                        timeout=60000, wait_until="networkidle")
                pg.wait_for_timeout(2000)
                cards = [c for c in pg.evaluate(JS_PESTANA_CARDS) if c["lote"] not in vistos]
                if not cards:
                    break
                for c in cards:
                    vistos.add(c["lote"])
                    v = linha_pestana(f, sg, c, leiloes.get(c["leilao"]) or {}, catalogo, cidades, agora, hoje)
                    if v:
                        linhas[v["id"]] = v
                    else:
                        descartados += 1
        except Exception as e:
            erro = str(e)[:200]
        b.close()
    return linhas, descartados, erro


RE_PESTANA_DATA = re.compile(r"(\d{2})/(\d{2})/(\d{4})")


def linha_pestana(f, sg, c, lei, catalogo, cidades, agora, hoje):
    CL.NOMES[sg] = f["nome"]
    linhas_txt = [t.strip() for t in c["texto"].split("\n") if t.strip()]
    origem = next((t for t in linhas_txt if t in ("Retomado", "Sinistrado", "Judicial", "Recuperado", "Frota", "Particular")), "")
    titulo = next((t for t in linhas_txt if re.search(r"\b(19|20)\d\d\b", t) and not t.startswith("LOTE")
                   and not RE_PESTANA_DATA.search(t)), "")
    m = re.search(r"Lance (?:atual|inicial|m[ií]nimo):\s*R\$\s*([\d.]+,\d{2})", c["texto"])
    lance = float(m.group(1).replace(".", "").replace(",", ".")) if m else None
    d = RE_PESTANA_DATA.search(c["texto"])
    data = f"{d.group(3)}-{d.group(2)}-{d.group(1)}" if d else None
    if data and data < str(hoje):
        return None
    uf = (lei.get("uf") or "").upper() or None
    cidade = cidades.oficial(lei.get("cidade"), uf) if lei.get("cidade") and uf in CL.UFS else None
    nome_leilao = lei.get("nome") or next((t for t in linhas_txt if t.lower().startswith("leilão")), "")
    texto = f"{titulo} {origem}. Comitente: {nome_leilao}."
    item = {"codigo": c["lote"], "titulo": titulo, "comitente": texto, "link": c["link"], "foto": c.get("foto")}
    v = CL.linha_veiculo(sg, item, texto, None, catalogo, cidades, agora, hoje, uf, cidade, lance, data, None)
    if not v or not v.get("marca"):
        return None
    a = re.search(r"\b((?:19|20)\d\d)\s*/?\s*((?:19|20)\d\d)\b", titulo)
    if a and not v.get("ano_modelo"):
        fab, mod = int(a.group(1)), int(a.group(2))
        if 0 <= mod - fab <= 1 and fab <= hoje.year + 1:
            v.update(ano_fabricacao=fab, ano_modelo=mod)
            v["titulo"] = CL.titulo_veiculo(v, titulo)
    if not v.get("uf"):
        t = re.search(r"\bTJ([A-Z]{2})\b", nome_leilao)
        if t and t.group(1) in CL.UFS:
            v["uf"] = t.group(1)
    if origem == "Judicial" or re.search(r"judicial|\btj[a-z]{2}\b|\btrt\b|\btrf\b", nome_leilao, re.I):
        v["modalidade"] = "judicial"
    else:
        v["modalidade"] = "extrajudicial"
        if origem in ("Retomado", "Recuperado") or RE_BANCO.search(nome_leilao):
            v["fonte"] = "banco"
    v["origem_nome"] = f"{f['nome']} · {nome_leilao}"[:80] if nome_leilao else f["nome"]
    if lei.get("edital"):
        v["link_edital"] = lei["edital"]
    return v


LJ_URL = "https://www.leiloesjudiciais.com.br"
LJ_MAX, LJ_LEILOES_MAX = 40, 120
JS_LJ_CARDS = """() => {
  const out = [], vistos = new Set();
  document.querySelectorAll('a[href*="/lote/"]').forEach(a => {
    const m = a.href.match(/leiloesjudiciais\\.com\\.br\\/lote\\/(\\d+)\\/(\\d+)/); if (!m || vistos.has(m[2])) return;
    let c = a; for (let i = 0; i < 7 && c.parentElement; i++) { c = c.parentElement; if (/Avalia|Lance m/.test(c.innerText || '')) break; }
    const img = c.querySelector('img[src^="http"]');
    vistos.add(m[2]);
    out.push({leilao: m[1], lote: m[2], link: a.href.split('?')[0], texto: (c.innerText || '').slice(0, 900), foto: img ? img.src : null});
  });
  return out;
}"""
RE_ORGAO = re.compile(r"\b(detran|prf|pol[ií]cia rodovi[aá]ria|receita federal|ciretran|dnit|der\b)", re.I)


def ler_leiloes_judiciais(f, catalogo, cidades, agora, hoje):
    from playwright.sync_api import sync_playwright
    sg = sigla(f["url"]); CL.NOMES[sg] = f["nome"]
    linhas, descartados, erro, vistos, cartoes = {}, 0, None, set(), []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_context(user_agent=G.UA, locale="pt-BR").new_page()
        try:
            for n in range(1, LJ_MAX + 1):
                pg.goto(f"{LJ_URL}/veiculos?pagina={n}", timeout=60000, wait_until="networkidle")
                pg.wait_for_timeout(1500)
                novos = [c for c in pg.evaluate(JS_LJ_CARDS) if c["lote"] not in vistos]
                if not novos:
                    break
                for c in novos:
                    vistos.add(c["lote"])
                cartoes += novos
            leiloes = {}
            for lid in list(dict.fromkeys(c["leilao"] for c in cartoes))[:LJ_LEILOES_MAX]:
                try:
                    pg.goto(f"{LJ_URL}/leilao/{lid}", timeout=45000, wait_until="domcontentloaded")
                    pg.wait_for_timeout(1200)
                    t = re.sub(r"\s+", " ", pg.inner_text("body"))
                    i = t.find("Comitente")
                    trecho = t[i:i + 300] if i >= 0 else t[:600]
                    d = re.search(r"(\d{2})/(\d{2})/(\d{4})", t)
                    leiloes[lid] = {"texto": trecho, "titulo": pg.title(),
                                    "data": f"{d.group(3)}-{d.group(2)}-{d.group(1)}" if d else None}
                except Exception:
                    pass
            for c in cartoes:
                v = linha_lj(f, sg, c, leiloes.get(c["leilao"]) or {}, catalogo, cidades, agora, hoje)
                if v:
                    linhas[v["id"]] = v
                else:
                    descartados += 1
        except Exception as e:
            erro = str(e)[:200]
        b.close()
    return linhas, descartados, erro


def _brl(t):
    return float(t.replace(".", "").replace(",", ".")) if t else None


def linha_lj(f, sg, c, lei, catalogo, cidades, agora, hoje):
    CL.NOMES[sg] = f["nome"]
    txt = c["texto"]
    if re.search(r"encerrad|arrematad|suspens|cancelad|retirad|vendid", txt, re.I):
        return None
    ls = [t.strip() for t in txt.split("\n") if t.strip()]
    titulo = next((t for t in ls if re.search(r"[A-Za-zÀ-ú]{3}", t) and not t.startswith("#")
                   and not re.search(r"^(aberto|em breve|aguardando|avalia|lance|clique|r\$)", t, re.I)), "")
    loc = next((t for t in ls if re.match(r"^[A-Za-zÀ-ú' .\-]+/[A-Z]{2}$", t)), "")
    cidade, uf = (loc.rsplit("/", 1) + [None])[:2] if loc else (None, None)
    uf = uf if uf in CL.UFS else None
    cidade = cidades.oficial(cidade, uf) if cidade and uf else None
    av = re.search(r"Avalia[cç][aã]o\s*R\$\s*([\d.]+,\d{2})", txt)
    mn = re.search(r"Lance m[ií]nimo\s*R\$\s*([\d.]+,\d{2})", txt)
    at = re.search(r"Lance Atual\s*R\$\s*([\d.]+,\d{2})", txt)
    lance = max(x for x in (_brl(mn.group(1)) if mn else 0, _brl(at.group(1)) if at else 0)) or None
    data = lei.get("data") if (lei.get("data") or "") >= str(hoje) else None
    comit = lei.get("texto") or lei.get("titulo") or ""
    texto = f"{titulo}. Comitente: {comit}"
    item = {"codigo": c["lote"], "titulo": titulo, "comitente": texto, "link": c["link"], "foto": c.get("foto")}
    v = CL.linha_veiculo(sg, item, texto, None, catalogo, cidades, agora, hoje, uf, cidade, lance, data, None)
    if not v or not v.get("marca"):
        return None
    a = re.search(r"\s-\s(\d{2})/(\d{2})\s-", titulo)
    if a and not v.get("ano_modelo"):
        yy = hoje.year % 100
        fab, mod = [(2000 if int(x) <= yy + 1 else 1900) + int(x) for x in a.groups()]
        if 0 <= mod - fab <= 1:
            v.update(ano_fabricacao=fab, ano_modelo=mod)
            v["titulo"] = CL.titulo_veiculo(v, titulo)
    if av and not v.get("avaliacao"):
        v["avaliacao"] = _brl(av.group(1))
    if RE_ORGAO.search(comit):
        v["fonte"], v["modalidade"] = ("detran" if re.search(r"detran|ciretran", comit, re.I) else "prf" if re.search(r"prf|rodovi", comit, re.I) else "receita"), "extrajudicial"
    elif CL.RE_JUDICIAL.search(comit) or not comit:
        v["modalidade"] = "judicial"
    else:
        v["modalidade"] = "extrajudicial"
        if RE_BANCO.search(comit):
            v["fonte"] = "banco"
    nome = re.sub(r"^Comitente:?\s*", "", comit)[:60].strip()
    v["origem_nome"] = f"{f['nome']} · {nome}"[:80] if nome else f["nome"]
    return v


FREITAS_URL = "https://www.freitasleiloeiro.com.br"
FREITAS_CLIQUES = 80
JS_FREITAS_CARDS = """() => {
  const out = [], vistos = new Set();
  document.querySelectorAll('a[href*="LoteDetalhes"]').forEach(a => {
    const u = new URL(a.href); const id = u.searchParams.get('leilaoId') + '-' + u.searchParams.get('loteNumero');
    if (vistos.has(id)) return;
    let c = a; for (let i = 0; i < 7 && c.parentElement; i++) { c = c.parentElement; if (/R\\$/.test(c.innerText || '') && /\\d{2}\\/\\d{2}\\/\\d{4}/.test(c.innerText || '')) break; }
    const img = c.querySelector('img[src^="http"]');
    vistos.add(id);
    out.push({codigo: id, link: a.href, texto: (c.innerText || '').replace(/\\s+/g, ' ').slice(0, 600), foto: img ? img.src : null});
  });
  return out;
}"""


def ler_freitas(f, catalogo, cidades, agora, hoje):
    from playwright.sync_api import sync_playwright
    sg = sigla(f["url"]); CL.NOMES[sg] = f["nome"]
    linhas, descartados, erro = {}, 0, None
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_context(user_agent=G.UA, locale="pt-BR").new_page()
        try:
            pg.goto(f"{FREITAS_URL}/Leiloes/Pesquisar?query=&categoria=1", timeout=60000, wait_until="networkidle")
            pg.wait_for_timeout(2000)
            antes = -1
            for _ in range(FREITAS_CLIQUES):
                n = pg.locator('a[href*="LoteDetalhes"]').count()
                if n == antes:
                    break
                antes = n
                botao = pg.get_by_text(re.compile(r"Carregar mais lotes", re.I))
                if not botao.count():
                    break
                botao.first.click()
                pg.wait_for_timeout(2500)
            for c in pg.evaluate(JS_FREITAS_CARDS):
                v = linha_freitas(f, sg, c, catalogo, cidades, agora, hoje)
                if v:
                    linhas[v["id"]] = v
                else:
                    descartados += 1
        except Exception as e:
            erro = str(e)[:200]
        b.close()
    return linhas, descartados, erro


def linha_freitas(f, sg, c, catalogo, cidades, agora, hoje):
    CL.NOMES[sg] = f["nome"]
    t = c["texto"]
    if re.search(r"vendid|encerrad|cancelad|retirad|condicional", t, re.I):
        return None
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})\s+\d{2}:\d{2}\s+(.+?),\s*(\d{2})/(\d{2}),", t)
    if not m:
        return None
    data = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    if data < str(hoje):
        return None
    titulo = m.group(4).strip()
    vl = re.search(r"R\$\s*([\d.]+,\d{2})", t)
    lance = _brl(vl.group(1)) if vl else None
    comit = re.search(r"(?:Maior lance|Lance inicial|Lance m[ií]nimo)\s+(.+?)\s+(?:ABERTO|EM BREVE|AGUARD|$)", t)
    comit = comit.group(1).strip() if comit else ""
    texto = f"{titulo} {m.group(5)}/{m.group(6)} {t[m.end():m.end() + 120]} Comitente: {comit}."
    item = {"codigo": c["codigo"], "titulo": titulo, "comitente": texto, "link": c["link"], "foto": c.get("foto")}
    v = CL.linha_veiculo(sg, item, texto, None, catalogo, cidades, agora, hoje, "SP", None, lance, data, None)
    if not v or not v.get("marca"):
        return None
    yy = hoje.year % 100
    fab, mod = [(2000 if int(x) <= yy + 1 else 1900) + int(x) for x in (m.group(5), m.group(6))]
    if 0 <= mod - fab <= 1:
        v.update(ano_fabricacao=fab, ano_modelo=mod)
        v["titulo"] = re.sub(r"\s\d{2}(?=\s(?:19|20)\d\d$)", "", CL.titulo_veiculo(v, titulo))
    if CL.RE_JUDICIAL.search(comit):
        v["modalidade"] = "judicial"
    else:
        v["modalidade"] = "extrajudicial"
        if RE_BANCO.search(comit):
            v["fonte"] = "banco"
    v["origem_nome"] = f"{f['nome']} · {comit.title()}"[:80] if comit else f["nome"]
    return v


LEITORES = {"freitasleiloeiro.": ler_freitas, "sodresantoro.": ler_sodre, "pestanaleiloes.": ler_pestana, "leiloesjudiciais.": ler_leiloes_judiciais}


def main():
    agora_dt = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    agora, hoje = agora_dt.isoformat().replace("+00:00", "Z"), dt.date.today()
    CL.log(f"SOLIDUNS — Veículos: leiloeiros gerais v{VERSAO} — {dt.datetime.now():%d/%m/%Y %H:%M}")
    catalogo = Catalogo(CL.sb_get("veiculos_fipe_marcas?select=tipo,codigo,nome"),
                        CL.sb_get("veiculos_fipe_modelos?select=tipo,marca_codigo,codigo,nome,familia"))
    cidades = Cidades()
    so = {s.strip() for s in os.environ.get("GERAIS_SO", "").split(",") if s.strip()}
    fontes = [f for f in G.carregar_fontes() if "veiculos" in f.get("tipos", [])
              and not any(j in f["url"] for j in JA_LIDOS) and (not so or f["nome"] in so)]
    total, resumo = 0, []
    for f in fontes:
        proprio = next((fn for k, fn in LEITORES.items() if k in f["url"]), None)
        if proprio:
            nome, lotes = f["nome"], []
            linhas, descartados, erro = proprio(f, catalogo, cidades, agora, hoje)
        else:
            nome, lotes, erro = G.processar(f)
            linhas, descartados = {}, 0
        for l in lotes:
            if l.get("categoria") != "veiculo":
                continue
            v = para_linha(f, l, catalogo, cidades, agora, hoje)
            if v:
                linhas[v["id"]] = v
            else:
                descartados += 1
        if linhas:
            CL.gravar_veiculos(list(linhas.values()))
        msg = f"{nome}: {len(linhas)} veículo(s) gravado(s), {descartados} descartado(s)"
        if erro:
            msg += f"; ERRO: {erro}"
        elif linhas:
            limite = (agora_dt - dt.timedelta(days=DIAS_SEM_VER)).isoformat().replace("+00:00", "Z")
            n = CL.sb_patch("veiculos_leiloes", {"anunciante_sigla": f"eq.{sigla(f['url'])}", "situacao": "eq.ativo",
                                                 "atualizado_em": f"lt.{limite}"}, {"situacao": "encerrado", "atualizado_em": agora})
            msg += f"; {n} encerrado(s) por não aparecer há {DIAS_SEM_VER} dias"
        CL.log("  " + msg)
        resumo.append(msg)
        total += len(linhas)
    CL.sb_upsert("veiculos_fontes", [{"fonte": "leiloeiros_gerais", "nome": "Leiloeiros (rede ampliada)",
                                      "situacao": "ativa", "ultima_execucao": agora,
                                      "mensagem": " | ".join(resumo)[:1900]}], "fonte")
    CL.log(f"FIM: {total} veículo(s) de {len(fontes)} leiloeiro(s)")


if __name__ == "__main__":
    main()
