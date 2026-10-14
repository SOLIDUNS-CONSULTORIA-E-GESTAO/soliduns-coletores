"""
SOLIDUNS — Notícias (manchetes) — v1.0 (14/10/2026)

Só as manchetes (título, fonte, link e data; nunca o texto) da Agência Brasil (economia), do Federal Reserve e da SEC,
em public.noticias — a mesma leitura da rotina "Fundos" (coletar_fundos.py, função manchetes), sem CVM nem câmbio.
Rotina "Notícias - manchetes" (noticias.yml): todo dia às 5h, 5h30, 7h, 8h, 12h e 18h de Brasília.
Grava por id (sem duplicar) e chama noticias_limpar (mantém só os últimos 30 dias).
Secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY.
"""
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import coletar_fundos as CF  # noqa: E402


def main():
    ns = CF.manchetes(None)
    br, us = sum(1 for n in ns if n["regiao"] == "br"), sum(1 for n in ns if n["regiao"] == "us")
    CF.log(f"Manchetes: {len(ns)} (Brasil {br}, EUA {us})")
    if not ns:
        CF.log("Nenhuma manchete lida — nada gravado.")
        return
    CF.gravar("noticias", ns, "id")
    url, cab = CF.cab_supabase()
    r = requests.post(f"{url}/rest/v1/rpc/noticias_limpar", json={}, headers=cab, timeout=120)
    CF.log(f"Limpeza das manchetes: {r.text.strip()}" if r.status_code < 300 else f"  aviso: limpeza não feita ({r.status_code})")


if __name__ == "__main__":
    main()
