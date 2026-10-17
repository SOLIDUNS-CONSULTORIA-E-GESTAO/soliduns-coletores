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

VERSAO = "1.3"
SAIDA = Path(__file__).resolve().parent.parent / "recon-imoveis"
JA_LIDOS = ("portalzuk.", "megaleiloes.", "superbid.", "vipleiloes.", "leilo.com.br", "sodresantoro.", "pestanaleiloes.",
            "freitasleiloeiro.", "leiloesjudiciais.")
RE_CID_UF = re.compile(r"([A-ZÀ-Úa-zà-ú][A-Za-zÀ-ú' .\-]{2,40})\s*[/\-–]\s*(" + "|".join(sorted(CL.UFS)) + r")\b")
RE_JUDICIAL = re.compile(r"\b(processo|vara\b|judicial|tribunal|execu[cç][aã]o|penhor)", re.I)
RE_BANCO = re.compile(r"\b(banco do brasil|banco do nordeste|banco da amaz[oô]nia|banco inter|banco (?!d[oae]s?\b)[a-z]{3,}|santander|bradesco|ita[uú]|caixa econ[oô]mica|btg|banco inter|banrisul|brb|sicoob|sicredi|"
                      r"safra|daycoval|banestes|banco do brasil|bnb|banco do nordeste|banco da amaz[oô]nia|emgea|poupex)", re.I)


# v1.2 (conferência da 1ª amostra, 17/10): links de navegação, títulos genéricos, veículos e preço repetido da página
RE_NAV = re.compile(r"(/leiloes/?$|/lotes/?$|[?&](categoria|page|encerrados)=|/encerrados/?$|/venda-direta/?$|/divulgacao/?$)", re.I)
RE_TITULO_RUIM = re.compile(r"^(r\$|\d+ ?%|lote \d+|in[ií]cio|carregando|acessar|receba|lotes em destaque|ver |saiba|clique|\W*$)", re.I)
RE_VEICULO = re.compile(r"\b(ford|chevrolet|fiat|volkswagen|vw|toyota|honda|hyundai|renault|nissan|moto|motocicleta|caminh[aã]o|ve[ií]culo|carro|placa)\b", re.I)
RE_IMOVEL = re.compile(r"\b(im[oó]vel|casa|apartamento|apto|terreno|lote urbano|sala|galp[aã]o|fazenda|ch[aá]cara|s[ií]tio|pr[eé]dio|matr[ií]cula|m²|hectares?)\b", re.I)


def titulo_bom(lote):
    t = re.sub(r"\s+", " ", lote.get("titulo") or "").strip()
    if len(t) >= 12 and not RE_TITULO_RUIM.search(t):
        return t
    d = re.sub(r"\s+", " ", lote.get("texto") or "").strip()
    m = RE_IMOVEL.search(d)
    return (d[m.start():][:80] if m else d[:80]).strip(" -–:") or t


def sigla(url):
    from urllib.parse import urlparse
    h = urlparse(url).netloc.lower().replace("www.", "")
    return "i-" + re.sub(r"[^a-z0-9]+", "-", h.split(".")[0])[:20]


def para_radar(f, lote, cidades, agora, hoje):
    texto = f"{lote['titulo']} {lote.get('texto') or ''}"
    if RE_NAV.search(lote.get("link") or ""):
        return None, "link de navegação"
    tit = lote.get("titulo") or ""
    if (RE_VEICULO.search(texto) and not RE_IMOVEL.search(texto)) or (RE_VEICULO.search(tit) and not RE_IMOVEL.search(tit)):
        return None, "veículo"
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
                       cidade=cidade, tipo=R.tipo_imovel(texto), tipo_original=titulo_bom(lote)[:60], preco=preco,
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
        # preço da PÁGINA repetido em 3+ lotes diferentes = valor errado (pegou o destaque, não o do lote)
        cont = {}
        for x in linhas.values():
            cont[x["preco"]] = cont.get(x["preco"], 0) + 1
        for k in [k for k, x in linhas.items() if cont[x["preco"]] >= 3 and len(linhas) > 3 and len(cont) <= len(linhas) / 2]:
            del linhas[k]
            motivos["preço repetido"] = motivos.get("preço repetido", 0) + 1
        # mesmo imóvel por dois caminhos do site
        vistos = {}
        for k, x in list(linhas.items()):
            ch = (x["cidade"], x["tipo"], x["preco"], x["tipo_original"])
            if ch in vistos:
                del linhas[k]
                motivos["duplicado"] = motivos.get("duplicado", 0) + 1
            vistos[ch] = 1
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
                if not erro:   # v1.3: leitura completa -> lote não visto há 7 dias saiu (rodízio de 3 dias)
                    limite = (agora_dt - dt.timedelta(days=7)).isoformat().replace("+00:00", "Z")
                    n = CL.sb_patch("leiloes_radar", {"id": f"like.{sigla(f['url'])}-*", "situacao": "eq.ativo",
                                                      "visto_em": f"lt.{limite}"}, {"situacao": "saiu", "saiu_em": agora})
                    if n:
                        CL.log(f"    {n} lote(s) não vistos há 7 dias saíram")
    if gravar:   # v1.3: leilão já realizado sai da lista; pré-nota do Radar para os novos
        ontem = (hoje - dt.timedelta(days=1)).isoformat()
        n = CL.sb_patch("leiloes_radar", {"fonte": "eq.leiloeiro", "situacao": "eq.ativo",
                                          "or": f"(and(praca2.not.is.null,praca2.lt.{ontem}),and(praca2.is.null,praca1.lt.{ontem}))"},
                        {"situacao": "saiu", "saiu_em": agora})
        CL.log(f"DATA PASSOU: {n} imóvel(is) com o leilão já realizado saíram")
        # pré-nota: NÃO chama aqui (o cálculo de todo o Radar passa do tempo da API -> erro 500);
        # quem calcula é o robô "Leilões - bancos e leiloeiros" das 06h50, que roda depois deste.
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
