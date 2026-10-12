#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
coletar_leiloes_veiculos_djen.py — v1.1 (12/10/2026) — MODO TESTE RÁPIDO

Alterações para o teste:
  - PAGINAS = 1 (apenas 1 página por tribunal)
  - TRIBUNAIS = ["TJSP"] (apenas São Paulo)
  - timeout = 15s na chamada requests.get
"""

import os, re, sys, hashlib, time
from datetime import date, datetime, timedelta, timezone
import requests

# ---------------------------------------------------------------- config
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
DJEN_RELAY   = os.environ["DJEN_RELAY_URL"].rstrip("/")
DJEN_TOKEN   = os.environ["DJEN_TOKEN"]

JANELA_DIAS = 3
PAGINAS     = 1

# MODO TESTE: apenas TJSP
TRIBUNAIS = ["TJSP"]

HEADERS_SUPA = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

# ---------------------------------------------------------------- regex
RE_PROC   = re.compile(r"\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b")
RE_ANO    = re.compile(r"\b(?:19|20)\d{2}(?:/(?:19|20)\d{2})?\b")
RE_PLACA  = re.compile(r"\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b")
RE_VALOR  = re.compile(r"R\$\s*([\d.]+,\d{2})")
RE_MODELO = re.compile(
    r"(?:ve[íi]culo|autom[óo]vel|carro|moto|caminh[ãa]o)\s+"
    r"([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)?)",
    re.IGNORECASE,
)

def extrair(texto):
    d = {}
    m = RE_PROC.search(texto);    d["processo"]    = m.group(0) if m else None
    m = RE_ANO.search(texto);     d["ano"]         = m.group(0) if m else None
    m = RE_PLACA.search(texto);   d["placa_final"] = m.group(0)[-4:] if m else None
    m = RE_VALOR.search(texto);   d["lance"]       = m.group(1) if m else None
    m = RE_MODELO.search(texto);  d["modelo"]      = m.group(1) if m else None
    return d

def id_unico(processo, tribunal, texto):
    base = f"{processo or ''}|{tribunal}|{texto[:200]}"
    return "djen-" + hashlib.sha1(base.encode("utf-8")).hexdigest()[:16]

# ---------------------------------------------------------------- DJEN
def consultar_djen(tribunal, pagina, ini, fim):
    """Chama a Edge Function swift-api (São Paulo) para o DJEN."""
    params = {
        "tribunal": tribunal,
        "inicio":   ini,
        "fim":      fim,
        "pagina":   str(pagina),
    }
    headers = {"x-soliduns-token": DJEN_TOKEN}
    for tentativa in range(3):
        try:
            # ALTERAÇÃO PARA TESTE: timeout de 15s (antes era 60)
            r = requests.get(DJEN_RELAY, params=params, headers=headers, timeout=15)
            if r.status_code == 200:
                return r.json()
            print(f"  [http {r.status_code}] {tribunal} p{pagina}")
        except Exception as e:
            print(f"  [rede] {tribunal} p{pagina}: {e}")
        time.sleep(2 * (tentativa + 1))
    return None

def parece_leilao_veiculo(texto):
    t = texto.lower()
    if not any(x in t for x in ("leil", "hasta", "praça", "arremata")):
        return False
    if not any(x in t for x in ("veículo","veiculo","automóvel","automovel",
                                "carro","moto","caminhão","caminhao")):
        return False
    if re.search(r"ve[íi]culo\s+(de\s+comunica|oficial|institucional)", t):
        return False
    return True

# ---------------------------------------------------------------- gravar
def gravar(lote):
    url = f"{SUPABASE_URL}/rest/v1/veiculos_leiloes"
    r = requests.post(url, headers=HEADERS_SUPA, json=[lote], timeout=30)
    if r.status_code not in (200, 201, 204):
        print(f"  [supabase {r.status_code}] {lote['id']}: {r.text[:200]}")
        return False
    return True

def registrar_fonte(itens_ativos, mensagem):
    url = f"{SUPABASE_URL}/rest/v1/veiculos_fontes?fonte=eq.djen"
    body = {
        "ultima_execucao": datetime.now(timezone.utc).isoformat(),
        "itens_ativos":    itens_ativos,
        "mensagem":        mensagem[:500],
        "situacao":        "ativa" if itens_ativos > 0 else "em_implantacao",
    }
    requests.patch(url, headers=HEADERS_SUPA, json=body, timeout=30)

# ---------------------------------------------------------------- main
def main():
    hoje = date.today()
    ini  = (hoje - timedelta(days=JANELA_DIAS)).isoformat()
    fim  = hoje.isoformat()
    print(f"DJEN — janela {ini} a {fim}")
    print(f"Tribunais: {len(TRIBUNAIS)} · Páginas por tribunal: {PAGINAS}")

    vistos = set()
    gravados = 0
    total_pub = 0

    for tribunal in TRIBUNAIS:
        for p in range(1, PAGINAS + 1):
            dados = consultar_djen(tribunal, p, ini, fim)
            if not dados:
                continue
            itens = dados.get("itens") or []
            total_pub += len(itens)
            for pub in itens:
                texto = (pub.get("texto") or "").strip()
                if not texto or not parece_leilao_veiculo(texto):
                    continue
                proc = pub.get("processo") or ""
                ident = id_unico(proc, tribunal, texto)
                if ident in vistos:
                    continue
                vistos.add(ident)

                info = extrair(texto)
                agora = datetime.now(timezone.utc).isoformat()
                lote = {
                    "id": ident,
                    "fonte": "djen",
                    "origem_nome": f"DJEN — {tribunal}",
                    "tipo": "veiculo",
                    "condicao": "usado",
                    "situacao": "ativo",
                    "modalidade": "judicial",
                    "processo": proc or info.get("processo"),
                    "leiloeiro": None,
                    "titulo": (info.get("modelo") or "Veículo em leilão judicial")[:120],
                    "descricao": texto[:4000],
                    "texto_busca": (texto + " " + tribunal)[:8000],
                    "url": pub.get("link"),
                    "ano_fabricacao": int(info["ano"][:4]) if info.get("ano") else None,
                    "placa_final": info.get("placa_final"),
                    "coletado_em": agora,
                    "atualizado_em": agora,
                }
                if gravar(lote):
                    gravados += 1
            if len(itens) < 100:
                break
        print(f"  {tribunal}: ok (acumulado {gravados})")

    print(f"\nRESULTADO: {gravados} lote(s) de veículo gravado(s) de {total_pub} publicação(ões) lida(s).")
    registrar_fonte(gravados, f"{gravados} ativos · janela {ini} a {fim}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERRO GERAL: {e}")
        sys.exit(1)
