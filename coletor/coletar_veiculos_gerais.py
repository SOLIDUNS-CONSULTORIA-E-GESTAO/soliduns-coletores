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

VERSAO = "1.0"
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
