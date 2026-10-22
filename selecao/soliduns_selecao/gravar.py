"""Gravação no Supabase da plataforma (tabelas da migration supabase/migrations/182_selecao_carteira.sql).
Mesmo padrão do coletor da CVM: SUPABASE_URL e SUPABASE_SERVICE_KEY nas variáveis de
ambiente (Secrets do GitHub). Falha aqui nunca derruba a execução: o relatório em Excel
continua valendo."""
import datetime as dt
import json
import math
import os

import numpy as np
import requests

from .util import AVISOS, ORIGEM, aviso, log

DICA_SQL = " Rode a migration supabase/migrations/182_selecao_carteira.sql no SQL Editor do Supabase."


def _cabecalho():
    url, chave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not chave:
        return None, None
    cab = {"apikey": chave, "Content-Type": "application/json"}
    if not chave.startswith("sb_"):
        cab["Authorization"] = f"Bearer {chave}"
    return url.rstrip("/"), cab


def _limpo(v):
    if isinstance(v, np.generic):
        v = v.item()
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def _linhas(df, mapa, extra):
    out = []
    for r in df.to_dict("records"):
        linha = dict(extra)
        for col_db, col_df in mapa.items():
            linha[col_db] = _limpo(r.get(col_df))
        out.append(linha)
    return out


COL_CARTEIRA = {"ticker": "ticker", "empresa": "empresa", "setor": "grupo_nome", "peso": "peso",
                "escore": "escore", "preco": "preco", "pl": "pl", "ret_implicito": "ret_implicito",
                "ke_esperado": "ke_esperado", "excesso_rel": "excesso_rel", "choque_d": "choque_D",
                "choque_e": "choque_E", "gamma": "gamma", "igov": "igov", "segmento": "segmento",
                "estatal": "estatal"}
COL_RANKING = {"ticker": "ticker", "empresa": "empresa", "setor": "grupo_nome", "escore": "escore",
               "z_retorno_esperado": "z_retorno_esperado", "z_pior_caso": "z_pior_caso",
               "z_crescimento": "z_crescimento", "z_governanca": "z_governanca", "q_margem": "q_margem",
               "u_esperado": "U_esperado", "u_min": "U_min", "ret_implicito": "ret_implicito",
               "ke_esperado": "ke_esperado", "excesso_rel": "excesso_rel", "g_esperado": "g_esperado",
               "igov": "igov", "mb_media": "mb_media", "gamma": "gamma", "choque_d": "choque_D",
               "choque_e": "choque_E", "ke_atual": "ke0", "ke_d": "ke_D", "ke_e": "ke_E", "pl": "pl",
               "beta": "beta", "lambda": "lambda", "estatal": "estatal", "segmento": "segmento"}


def gravar(ctx, cfg, ranking, carteiras):
    url, cab = _cabecalho()
    if not url:
        aviso("SUPABASE_URL/SUPABASE_SERVICE_KEY não definidos: nada gravado no Supabase")
        return False
    agora = dt.datetime.now(dt.timezone.utc).isoformat()
    execucao = {
        "data_referencia": ctx["hoje"].isoformat(), "modo": cfg["carteira"]["modo"],
        "resultado": cfg["eleicao"].get("resultado") or "", "regime": cfg["escore"]["regime"],
        "executado_em": agora, "p_d": _limpo(ctx["p"]), "delta_pb": _limpo(ctx["delta"] * 1e4),
        "cds_pb": _limpo(ctx["cds0"] * 1e4), "cds_d_pb": _limpo(ctx["cds_D"] * 1e4),
        "cds_e_pb": _limpo(ctx["cds_E"] * 1e4), "ke_medio": _limpo(ctx["ke_m"]),
        "selic": _limpo(ctx["selic"]), "gamma_bolsa": _limpo(ctx["gamma_m"]),
        "n_universo": int(len(ranking)), "n_excluidas": int(len(ctx["excluidas"])),
        "carteiras": json.loads(json.dumps([res for _, res in carteiras], default=_limpo)),
        "parametros": {k: [str(v[0]), v[1]] for k, v in ORIGEM.items()},
        "avisos": list(AVISOS),
    }
    # SQL 182: o robô grava como prévia; o administrador publica pela página (ou automaticamente, se configurado)
    if cfg.get("site", {}).get("publicar_automaticamente"):
        execucao.update(publicado=True, publicado_em=agora, publicado_por="robô (publicação automática)")
    try:
        r = requests.post(f"{url}/rest/v1/selecao_execucoes?on_conflict=data_referencia,modo,resultado",
                          json=execucao, timeout=60,
                          headers=dict(cab, Prefer="resolution=merge-duplicates,return=representation"))
        if r.status_code >= 300:
            dica = DICA_SQL if r.status_code in (400, 404) else ""
            aviso(f"Supabase recusou a execução ({r.status_code} {r.text[:200]}).{dica}")
            return False
        exec_id = r.json()[0]["id"]
        for tabela in ("selecao_carteiras", "selecao_ranking"):     # regravação no mesmo dia
            requests.delete(f"{url}/rest/v1/{tabela}?execucao_id=eq.{exec_id}", headers=cab, timeout=60)
        cart = []
        for df, res in carteiras:
            cart += _linhas(df, COL_CARTEIRA, {"execucao_id": exec_id, "carteira": res["rotulo"]})
        rank = _linhas(ranking.assign(posicao=range(1, len(ranking) + 1)), {**COL_RANKING, "posicao": "posicao"},
                       {"execucao_id": exec_id})
        for tabela, linhas in (("selecao_carteiras", cart), ("selecao_ranking", rank)):
            for i in range(0, len(linhas), 500):
                r = requests.post(f"{url}/rest/v1/{tabela}", json=linhas[i:i + 500], timeout=120,
                                  headers=dict(cab, Prefer="return=minimal"))
                if r.status_code >= 300:
                    aviso(f"{tabela} não gravada ({r.status_code} {r.text[:200]}).{DICA_SQL}")
                    return False
        log(f"Supabase: execução {exec_id} gravada ({len(cart)} linhas de carteira, {len(rank)} de ranking)")
        return True
    except requests.RequestException as e:
        aviso(f"Supabase indisponível ({e}); o relatório em Excel continua valendo")
        return False
