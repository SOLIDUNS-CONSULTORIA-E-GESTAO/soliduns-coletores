#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
coletar_leiloes_veiculos_djen.py
Versão 1.0 — 12/10/2026

Lê o DJEN (Diário de Justiça Eletrônico Nacional) via Edge Function
swift-api (São Paulo) e grava publicações de LEILÃO DE VEÍCULOS em
public.veiculos_leiloes com fonte='djen'.

Segredos necessários (GitHub Actions Secrets):
  SUPABASE_URL          — URL do projeto
  SUPABASE_SERVICE_KEY  — chave service_role
  DJEN_RELAY_URL        — URL da Edge Function swift-api
  DJEN_TOKEN            — token x-soliduns-token da função
"""

import os, re, sys, hashlib
from datetime import date, datetime, timedelta, timezone
import requests

# ---------------------------------------------------------------- config
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
DJEN_RELAY   = os.environ["DJEN_RELAY_URL"].rstrip("/")
DJEN_TOKEN   = os.environ["DJEN_TOKEN"]

JANELA_DIAS  = 3
TERMOS       = [
    "leilão veículo",
    "leilão automóvel",
    "alienação fiduciária veículo",
    "hasta pública veículo",
]

TRIBUNAIS = [
    "TJAC","TJAL","TJAM","TJAP","TJBA","TJCE","TJDFT","TJES","TJGO","TJMA",
    "TJMG","TJMS","TJMT","TJPA","TJPB","TJPE","TJPI","TJPR","TJRJ","TJRN",
    "TJRO","TJRR","TJRS","TJSC","TJSE","TJSP","TJTO",
    "TRF1","TRF2","TRF3","TRF4","TRF5","TRF6",
]

HEADERS_SUPA = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

# ---------------------------------------------------------------- regex
RE_PROC  = re.compile(r"\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b")
RE_ANO   = re.compile(r"\b(?:19|20)\d{2}(?:/(?:19|20)\d{2})?\b")
RE_PLACA = re.compile(r"\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b")
RE_VALOR = re.compile(r"R\$\s*([\d.]+,\d{2})")
RE_MODELO = re.compile(
    r"(?:ve[íi]culo|autom[óo]vel|carro|moto|caminh[ãa]o)\s+"
    r"([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)?)",
    re.IGNORECASE,
)

def extrair(texto):
    dados = {}
    m = RE_PROC.search(texto);    dados["processo"]    = m.group(0) if m else None
    m = RE_ANO.search(texto);     dados["ano"]         = m.group(0) if m else None
    m = RE_PLACA.search(texto);   dados["placa_final"] = m.group(0)[-4:] if m else None
    m = RE_VALOR.search(texto);   dados["lance"]       = m.group(1) if m else None
    m = RE_MODELO.search(texto);  dados["modelo"]      = m.group(1) if m else None
    return dados

def id_unico(processo, tribunal, texto):
    base = f"{processo or ''}|{tribunal}|{texto[:200]}"
    return "djen-" + hashlib.sha1(base.encode("utf-8")).hexdigest()[:16]

# ---------------------------------------------------------------- DJEN
def consultar_djen(tribunal, termo, ini, fim):
    url = f"{DJEN_RELAY}"
    params = {
        "datajud": "0",
        "tribunal": tribunal,
        "dataDisponibilizacaoInicio": ini,
        "dataDisponibilizacaoFim":    fim,
        "texto": termo,
    }
    headers = {"x-soliduns-token": DJEN_TOKEN}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=60)
    except Exception as e:
        print(f"  [erro rede] {tribunal} / '{termo}': {e}")
        return []
    if r.status_code != 200:
        print(f"  [erro http {r.status_code}] {tribunal} / '{termo}'")
        return []
    try:
        dados = r.json()
    except Exception:
        print(f"  [erro json] {tribunal} / '{termo}'")
        return []
    if isinstance(dados, dict):
        return dados.get("items") or dados.get("comunicacoes") or []
    if isinstance(dados, list):
        return dados
    return []

def parece_leilao_veiculo(texto):
    t = texto.lower()
    if not any(x in t for x in ("leil", "hasta", "praça", "arremata")):
        return False
    if not any(x in t for x in ("veículo", "veiculo", "automóvel", "automovel",
                                "carro", "moto", "caminhão", "caminhao")):
        return False
    if re.search(r"ve[íi]culo\s+(de\s+comunica|oficial|institucional)", t):
        return False
    return True

# ---------------------------------------------------------------- gravar
def gravar(lote):
    url = f"{SUPABASE_URL}/rest/v1/veiculos_leiloes"
    r = requests.post(url, headers=HEADERS_SUPA, json=[lote], timeout=30)
    if r.status_code not in (200, 201, 204):
        print(f"  [erro supabase {r.status_code}] {lote['id']}: {r.text[:200]}")
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
    print(f"Tribunais: {len(TRIBUNAIS)} · Termos: {len(TERMOS)}")

    vistos = set()
    gravados = 0
    total_pub = 0

    for tribunal in TRIBUNAIS:
        for termo in TERMOS:
            pubs = consultar_djen(tribunal, termo, ini, fim)
            total_pub += len(pubs)
            for pub in pubs:
                texto = (pub.get("texto") or "").strip()
                if not texto or not parece_leilao_veiculo(texto):
                    continue
                proc = pub.get("numeroprocesso") or ""
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
                    "url": pub.get("link") or pub.get("url"),
                    "ano_fabricacao": int(info["ano"][:4]) if info.get("ano") else None,
                    "placa_final": info.get("placa_final"),
                    "coletado_em": agora,
                    "atualizado_em": agora,
                }
                if gravar(lote):
                    gravados += 1
        print(f"  {tribunal}: ok (acumulado {gravados})")

    print(f"\nRESULTADO: {gravados} lote(s) de veículo gravado(s) de {total_pub} publicação(ões) lida(s).")
    registrar_fonte(gravados, f"{gravados} ativos · janela {ini} a {fim}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERRO GERAL: {e}")
        sys.exit(1)
