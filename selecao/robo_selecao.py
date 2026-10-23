"""
SOLIDUNS — Robô de Seleção de Carteira de Ações Brasileiras
sob Risco Brasil e Risco Político (v1.0, 22/10/2026)

Implementa o "Compêndio metodológico" da SOLIDUNS: custo de capital por
cenário eleitoral a partir do CDS, probabilidade de cada cenário pelas
pesquisas, crescimento setorial, governança (FCA/FRE da CVM), margem bruta,
escore composto e carteira com restrição de perda por cenário.

Uso (a partir da pasta 'selecao'):
  python robo_selecao.py                       -> roda com os parâmetros do arquivo
  python robo_selecao.py --modo neutro         -> carteira com sensibilidade política ~ 0
  python robo_selecao.py --modo condicional    -> carteira atual + uma para cada resultado
  python robo_selecao.py --resultado D         -> depois da apuração (p_D = 1); E no outro caso
  python robo_selecao.py --regime normal       -> pesos de regime normal (Tabela 7)
  python robo_selecao.py --fundamentos x.json  -> fundamentos já gerados (coletar_cvm.py --saida)
  python robo_selecao.py --saida pasta/        -> onde gravar o relatório (padrão: resultados/)
  python robo_selecao.py --gravar              -> também grava no Supabase da plataforma
  python robo_selecao.py --sem-alvos           -> não calcula o Alvos SOLIDUNS (entrada, stop e alvos da B3)

Dados públicos: CVM, B3 (COTAHIST), Banco Central, Tesouro Direto e Damodaran.
O CDS de 5 anos é informado em parametros.yaml (dado pago).
Não constitui recomendação de investimento.
"""
import argparse
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

from soliduns_selecao import alvos as ALV          # noqa: E402
from soliduns_selecao import carteira as CART      # noqa: E402
from soliduns_selecao import gravar as GRAV         # noqa: E402
from soliduns_selecao import pipeline as PIPE       # noqa: E402
from soliduns_selecao import relatorio as REL       # noqa: E402
from soliduns_selecao.util import log               # noqa: E402


def main():
    ap = argparse.ArgumentParser(description="Robô de seleção de carteira SOLIDUNS")
    ap.add_argument("--modo", choices=["neutro", "cenarios", "condicional"])
    ap.add_argument("--resultado", choices=["D", "E"])
    ap.add_argument("--regime", choices=["eleitoral", "normal"])
    ap.add_argument("--data", help="data de referência AAAA-MM-DD")
    ap.add_argument("--fundamentos", help="JSON gerado por coletar_cvm.py --saida")
    ap.add_argument("--cache", default=os.path.join(AQUI, "cache"))
    ap.add_argument("--saida", default=os.path.join(AQUI, "resultados"))
    ap.add_argument("--sem-alvos", action="store_true", help="não calcula o Alvos SOLIDUNS")
    ap.add_argument("--gravar", action="store_true",
                    help="grava no Supabase (SUPABASE_URL e SUPABASE_SERVICE_KEY no ambiente)")
    a = ap.parse_args()

    cfg, st = PIPE.carregar(AQUI)
    if a.modo:
        cfg["carteira"]["modo"] = a.modo
    if a.resultado:
        cfg["eleicao"]["resultado"] = a.resultado
    if a.regime:
        cfg["escore"]["regime"] = a.regime
    if a.data:
        cfg["data_referencia"] = a.data

    tab, ctx = PIPE.montar_tabela(AQUI, cfg, st, a.cache, a.fundamentos)
    modo = cfg["carteira"]["modo"]
    p = ctx["p"]
    ranking = CART.pontuar(tab, p, cfg)
    carteiras = []
    modo_base = "cenarios" if modo == "condicional" else modo
    rot = {None: "Atual", "D": "Resultado D", "E": "Resultado E"}[cfg["eleicao"].get("resultado")]
    carteiras.append(CART.montar_carteira(ranking, cfg, p, modo_base, rot, ctx["gamma_m"]))
    if modo == "condicional" and cfg["eleicao"].get("resultado") is None:
        for s, ps in (("D", 1.0), ("E", 0.0)):
            rk = CART.pontuar(tab, ps, cfg, pos_choque=True)
            carteiras.append(CART.montar_carteira(rk, cfg, ps, "cenarios", f"Se vencer {s}",
                                                  ctx["gamma_m"]))

    os.makedirs(a.saida, exist_ok=True)
    nome = f"selecao_{ctx['hoje'].isoformat()}_{modo}"
    if cfg["eleicao"].get("resultado"):
        nome += f"_resultado{cfg['eleicao']['resultado']}"
    nomes_grupo = {g: v["nome"] for g, v in st["grupos"].items()}
    gravado = False
    if a.gravar:
        # grupo_nome é usado na gravação; o relatório também o preenche
        for df in [ranking] + [c[0] for c in carteiras]:
            df["grupo_nome"] = df["grupo"].map(nomes_grupo)
        gravado = GRAV.gravar(ctx, cfg, ranking, carteiras)
    alvos = None
    if (cfg.get("alvos") or {}).get("ativo") and not a.sem_alvos:
        try:
            alvos = ALV.calcular(tab, ctx, cfg, st)
            alvos.drop(columns=["serie"]).to_excel(os.path.join(a.saida, nome + "_alvos.xlsx"), index=False)
            if a.gravar:
                GRAV.gravar_alvos(ctx, cfg, alvos)
        except Exception as e:      # o Alvos nunca derruba a carteira
            from soliduns_selecao.util import aviso
            aviso(f"Alvos SOLIDUNS não calculado: {e}")
    REL.gerar(os.path.join(a.saida, nome + ".xlsx"), ctx, cfg, ranking, carteiras, nomes_grupo)
    REL.gerar_json(os.path.join(a.saida, nome + ".json"), ctx, carteiras, ranking)
    if a.gravar and not gravado:
        log("Atenção: resultado NÃO gravado no Supabase (veja os avisos acima); "
            "o relatório em Excel foi gerado.")
    log(f"Relatório salvo em {os.path.join(a.saida, nome + '.xlsx')}")


if __name__ == "__main__":
    main()
