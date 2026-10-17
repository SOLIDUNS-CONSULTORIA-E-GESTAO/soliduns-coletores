"""
SOLIDUNS — IMÓVEIS DOS LEILOEIROS (rede ampliada) -> Radar — v1.0 (17/10/2026)

Pedido do Thiago (16/10 23h39, "SIGA"): os imóveis dos 262 leiloeiros liberados na triagem também devem chegar à plataforma.
Usa o raspador genérico (leiloeiros/scraper.py) com o robô educado (educado.py: robots.txt, Crawl-delay, 1 pedido a cada
20 s por site) e transforma cada lote de IMÓVEL num item do Radar (public.leiloes_radar), no mesmo formato do Zuk/Mega:
  - UF e cidade tiradas do texto ("Cidade/UF"); tipo, áreas e financiamento pelas regras do Radar (leiloeiros_regras.py);
  - preço = valor do lance que aparece no card; data do leilão = 1ª data do card;
  - comitente = banco/financeira quando o texto cita um; senão, o próprio leiloeiro;
  - judicial x extrajudicial pelo texto ("processo", "vara", "judicial");
  - sem fotos (card com a imagem padrão LEILÃO): só dados e o link para o lote no site do leiloeiro.
Descarta: lote sem UF, sem preço ou com preço fora de R$ 1 mil a R$ 200 milhões.

MODO REVISÃO (padrão): NÃO grava no banco. Guarda tudo em recon-imoveis/ (amostra + resumo por leiloeiro) para conferência.
Gravar de verdade só com IMOVEIS_GRAVAR=1 — depois de o Thiago conferir a amostra.
Rodízio: cada leiloeiro da rede ampliada nova a cada IMOVEIS_RODIZIO_DIAS dias (padrão 3); IMOVEIS_SO="Nome,Nome" lê só esses.
"""
import datetime as dt
import hashlib
import json
import os
import re
import sys
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "leiloeiros"))
import coletar_leiloeiros as CL          # noqa: E402  (linha_radar, NOMES, SITES, UFS, sb_*)
import leiloeiros_regras as R            # noqa: E402
import scraper as G                      # noqa: E402
from veiculos_regras import Cidades      # noqa: E402

VERSAO = "1.1"
SAIDA = Path(__file__).resolve().parent.parent / "recon-imoveis"
JA_LIDOS = ("portalzuk.", "megaleiloes.", "superbid.", "vipleiloes.", "leilo.com.br", "sodresantoro.", "pestanaleiloes.",
            "freitasleiloeiro.", "leiloesjudiciais.")
RE_CID_UF = re.compile(r"([A-ZÀ-Úa-zà-ú][A-Za-zÀ-ú' .\-]{2,40})\s*[/\-–]\s*(" + "|".join(sorted(CL.UFS)) + r")\b")
RE_JUDICIAL = re.compile(r"\b(processo|vara\b|judicial|tribunal|execu[cç][aã]o|penhor)", re.I)
RE_BANCO = re.compile(r"\b(banco [a-z]+|santander|bradesco|ita[uú]|caixa econ[oô]mica|btg|banco inter|banrisul|brb|sicoob|sicredi|"
                      r"safra|daycoval|banestes|banco do brasil|bnb|banco do nordeste|banco da amaz[oô]nia|emgea|poupex)", re.I)


def sigla(url):
    from urllib.parse import urlparse
    h = urlparse(url).netloc.lower().replace("www.", "")
    return "i-" + re.sub(r"[^a-z0-9]+", "-", h.split(".")[0])[:20]


def para_radar(f, lote, cidades, agora, hoje):
    texto = f"{lote['titulo']} {lote.get('texto') or ''}"
    preco = lote.get("valor")
    if not preco or not (1_000 <= preco <= 200_000_000):
        return None, "sem preço"
    uf = cidade = None
    for m in RE_CID_UF.finditer(texto):
        uf_c, palavras = m.group(2), m.group(1).split()
        for i in range(max(0, len(palavras) - 4), len(palavras)):
            c = cidades.oficial(" ".join(palavras[i:]), uf_c)
            if c:
                uf, cidade = uf_c, c
                break
        if uf:
            break
    if not uf:
        return None, "sem UF/cidade"
    sg = sigla(f["url"])
    CL.NOMES[sg] = f["nome"]
    CL.SITES[sg] = f["url"]
    mb = RE_BANCO.search(texto)
    comitente = mb.group(0).title() if mb else f["nome"]
    tot, priv, ter = R.areas(texto)
    codigo = hashlib.sha1(lote["link"].encode()).hexdigest()[:14]
    data = (lote.get("data") or "")[:10] or None
    x = CL.linha_radar(sg, codigo, uf, comitente, agora, hoje,
                       cidade=cidade, tipo=R.tipo_imovel(texto), tipo_original=lote["titulo"][:60], preco=preco,
                       financiamento=R.financiamento(texto), area_total=tot, area_privativa=priv, area_terreno=ter,
                       descricao=texto[:1500], modalidade_venda="Leilão", link=lote["link"], praca1=data, lance1=preco)
    x["fonte"] = "leiloeiro"
    x["modalidade"] = "judicial" if RE_JUDICIAL.search(texto) else "extrajudicial"
    return x, None


def main():
    agora_dt = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    agora, hoje = agora_dt.isoformat().replace("+00:00", "Z"), dt.date.today()
    gravar = os.environ.get("IMOVEIS_GRAVAR") == "1"
    CL.log(f"SOLIDUNS — Imóveis dos leiloeiros (rede ampliada) v{VERSAO} — {'GRAVANDO' if gravar else 'MODO REVISÃO (não grava)'}")
    so = {s.strip() for s in os.environ.get("IMOVEIS_SO", "").split(",") if s.strip()}
    fontes = [f for f in G.carregar_fontes() if "imoveis" in f.get("tipos", []) and f.get("grupo", "").startswith(("rede_ampliada", "leiloeiros_"))
              and not any(j in f["url"] for j in JA_LIDOS) and (not so or f["nome"] in so)]
    n = max(1, int(os.environ.get("IMOVEIS_RODIZIO_DIAS") or 3))
    if not so and n > 1:
        dia = hoje.toordinal() % n
        fontes = [f for f in fontes if f.get("grupo") != "rede_ampliada_2026_10" or zlib.crc32(f["url"].encode()) % n == dia]
    lim = int(os.environ.get("IMOVEIS_MAX_FONTES") or 0)
    if lim:
        fontes = fontes[:lim]
    CL.log(f"{len(fontes)} leiloeiro(s) nesta rodada")
    cidades = Cidades()
    SAIDA.mkdir(exist_ok=True)

    def rodar(f):
        nome, lotes, erro = G.processar(f)
        linhas, motivos = {}, {}
        for l in lotes:
            if l.get("categoria") != "imovel":
                continue
            x, motivo = para_radar(f, l, cidades, agora, hoje)
            if x:
                linhas[x["id"]] = x
            else:
                motivos[motivo] = motivos.get(motivo, 0) + 1
        return f, nome, list(linhas.values()), motivos, erro

    resumo, amostra, total = [], [], 0
    with ThreadPoolExecutor(max_workers=int(os.environ.get("IMOVEIS_PARALELO") or 8)) as ex:
        for fut in [ex.submit(rodar, f) for f in fontes]:
            try:
                f, nome, linhas, motivos, erro = fut.result()
            except Exception as e:                     # noqa: BLE001
                CL.log(f"  ERRO inesperado: {type(e).__name__}: {e}")
                continue
            msg = f"{nome}: {len(linhas)} imóvel(is)" + (f"; descartados {motivos}" if motivos else "") + (f"; ERRO: {erro}" if erro else "")
            CL.log("  " + msg)
            resumo.append({"leiloeiro": nome, "url": f["url"], "imoveis": len(linhas), "descartes": motivos, "erro": erro})
            amostra += linhas[:5]
            total += len(linhas)
            if gravar and linhas:
                CL.sb_upsert("leiloes_radar", linhas)
    (SAIDA / "resumo.json").write_text(json.dumps(resumo, ensure_ascii=False, indent=1), encoding="utf-8")
    (SAIDA / "amostra.json").write_text(json.dumps(amostra, ensure_ascii=False, indent=1), encoding="utf-8")
    CL.log(f"FIM: {total} imóvel(is) de {len(fontes)} leiloeiro(s) — {'gravados' if gravar else 'NÃO gravados (revisão)'}")


if __name__ == "__main__":
    # v1.1: qualquer falha fica registrada em recon-imoveis/erro.txt (o log do GitHub não é lido daqui)
    try:
        main()
    except Exception:                                  # noqa: BLE001
        import traceback
        SAIDA.mkdir(exist_ok=True)
        (SAIDA / "erro.txt").write_text(traceback.format_exc(), encoding="utf-8")
        raise
