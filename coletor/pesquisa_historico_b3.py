"""
SOLIDUNS — BASE DE PESQUISA: COTAÇÕES HISTÓRICAS DA B3 (Score Exponencial v1.0.2, camada 1) — v1.0 (22/10/2026)

Fonte OFICIAL e gratuita, a mesma do coletor diário (coletar_cotahist.py): Séries Históricas da B3,
arquivos anuais COTAHIST_A{AAAA}.ZIP (públicos, sem chave). Mercado à vista, lote padrão: ações e units.
O arquivo de cada ano traz TODOS os papéis negociados naquele ano, inclusive os que depois saíram da bolsa
(falência, fechamento de capital, incorporação) — por isso a base não tem viés de sobrevivência nos preços.

NÃO grava no Supabase (a base de pesquisa é grande demais para o banco do site): grava um arquivo por ano
(CSV compactado) em --saida, publicado depois numa Release do GitHub pelo workflow "Pesquisa - histórico B3".
Os preços são os ORIGINAIS da B3 (sem ajuste por desdobramento, grupamento ou proventos): o ajuste é a etapa 2.

Uso:  python coletor/pesquisa_historico_b3.py --anos 1995-2026 --saida dados_b3
"""
import argparse
import csv
import gzip
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import coletar_cotahist as cc  # noqa: E402  (mesma leitura do layout de 245 posições)

CAMPOS = ["ticker", "data", "abertura", "maxima", "minima", "fechamento", "negocios", "quantidade", "volume_fin", "isin"]


def anos_de(txt):
    out = []
    for parte in txt.split(","):
        parte = parte.strip()
        if "-" in parte:
            a, b = parte.split("-")
            out += list(range(int(a), int(b) + 1))
        elif parte:
            out.append(int(parte))
    return sorted(set(out))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--anos", required=True)
    ap.add_argument("--saida", required=True)
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)
    cc.resumo("| Ano | Linhas | Papéis | 1º pregão | Último pregão | PETR4 (último fech.) |\n|---|---|---|---|---|---|")
    papeis_por_ano = {}
    for ano in anos_de(a.anos):
        conteudo = cc.baixar(cc.URL_ANUAL.format(ano=ano), f"COTAHIST_A{ano}.ZIP")
        if not conteudo:
            cc.resumo(f"| {ano} | arquivo não encontrado na B3 | | | | |")
            continue
        linhas = sorted(cc.ler_zip(conteudo), key=lambda r: (r["ticker"], r["data"]))
        cam = os.path.join(a.saida, f"cotahist_{ano}.csv.gz")
        with gzip.open(cam, "wt", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=CAMPOS)
            w.writeheader()
            w.writerows(linhas)
        tks = {r["ticker"] for r in linhas}
        papeis_por_ano[ano] = tks
        datas = sorted({r["data"] for r in linhas})
        petr = [r["fechamento"] for r in linhas if r["ticker"] == "PETR4"]
        cc.resumo(f"| {ano} | {len(linhas):,} | {len(tks)} | {datas[0] if datas else '-'} | {datas[-1] if datas else '-'} | "
                  f"{petr[-1] if petr else '-'} |".replace(",", "."))
        time.sleep(3)                                   # respeita a B3: um arquivo por vez
    anos = sorted(papeis_por_ano)
    saidas = [(x, len(papeis_por_ano[x] - papeis_por_ano[y])) for x, y in zip(anos, anos[1:])]
    cc.resumo("Papéis que deixam de ser negociados de um ano para o outro (saídas da bolsa, trocas de código): "
              + ", ".join(f"{x}: {n}" for x, n in saidas))
    todos = set().union(*papeis_por_ano.values()) if papeis_por_ano else set()
    cc.resumo(f"Total de papéis distintos em {anos[0] if anos else '-'}–{anos[-1] if anos else '-'}: {len(todos)}")


if __name__ == "__main__":
    main()
