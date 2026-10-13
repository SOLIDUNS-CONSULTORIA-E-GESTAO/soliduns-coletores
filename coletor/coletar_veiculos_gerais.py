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

VERSAO = "1.2"
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


LEITORES = {"sodresantoro.": ler_sodre}


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
