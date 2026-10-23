"""
SOLIDUNS — SONDAGEM DAS FONTES GRATUITAS DE OPÇÕES DA B3 (23/10/2026). Não grava no Supabase.
  1. COTAHIST diário (Séries Históricas): registros de opções de compra (TPMERC 070) e de venda (080), e as
     linhas do mercado à vista (010) do mesmo dia, para ligar a opção ao ativo-objeto.
  2. Arquivos públicos da B3 (arquivos.b3.com.br): cadastro de instrumentos e posições em aberto de derivativos.
Saída em --saida (publicada numa Release de rascunho pelo workflow "Pesquisa - opções B3").
Uso: python coletor/pesquisa_opcoes_b3.py --data 2026-10-22 --saida sonda
"""
import argparse, datetime as dt, gzip, io, json, os, sys, time, zipfile
import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      "Accept": "*/*", "Accept-Language": "pt-BR,pt;q=0.9"}


def log(*a):
    print(*a, flush=True)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a").write(" ".join(map(str, a)) + "\n\n")


def get(url, **kw):
    try:
        r = requests.get(url, headers=UA, timeout=300, **kw)
        log(f"GET {url[:150]} -> {r.status_code} {len(r.content)} bytes {r.headers.get('content-type', '')}")
        return r
    except requests.RequestException as e:
        log(f"GET {url[:150]} -> {type(e).__name__}: {e}")
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--saida", default="sonda")
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)
    d = dt.date.fromisoformat(a.data)
    # 1. COTAHIST diário
    r = get(f"https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D{d:%d%m%Y}.ZIP")
    if r is not None and r.status_code == 200 and r.content[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            txt = z.read(z.namelist()[0]).decode("latin-1").splitlines()
        cont = {}
        sel = []
        for l in txt:
            if l[:2] != "01":
                continue
            k = l[24:27] + "/" + l[10:12]
            cont[k] = cont.get(k, 0) + 1
            if l[24:27] in ("070", "080", "010"):
                sel.append(l)
        log("COTAHIST: tipos de mercado/BDI: " + json.dumps(dict(sorted(cont.items(), key=lambda x: -x[1])[:25])))
        with gzip.open(os.path.join(a.saida, f"cotahist_{d:%Y%m%d}_opcoes_e_vista.txt.gz"), "wt", encoding="latin-1") as f:
            f.write("\n".join(sel) + "\n")
    # 2. arquivos públicos da B3
    for nome in ("InstrumentsConsolidatedFile", "DerivativesOpenPositionFile", "EquitiesOptionsOpenPosition",
                 "OptionsOpenPosition", "LendingOpenPositionFile"):
        r = get(f"https://arquivos.b3.com.br/api/download/requestname?fileName={nome}&date={d.isoformat()}")
        if r is None or r.status_code != 200:
            continue
        try:
            tok = r.json().get("token")
        except ValueError:
            log(f"  {nome}: resposta não é JSON: {r.text[:200]}")
            continue
        if not tok:
            log(f"  {nome}: sem token: {r.text[:200]}")
            continue
        time.sleep(1)
        r2 = get(f"https://arquivos.b3.com.br/api/download/?token={tok}")
        if r2 is not None and r2.status_code == 200 and r2.content:
            open(os.path.join(a.saida, f"{nome}_{d:%Y%m%d}.bin"), "wb").write(r2.content)
            log(f"  {nome}: primeiros bytes: {r2.content[:300]!r}")
        time.sleep(2)
    for tab in ("DerivativesOpenPosition", "InstrumentsConsolidated"):
        r = get(f"https://arquivos.b3.com.br/tabelas/table/{tab}/{d.isoformat()}/1")
        if r is not None and r.status_code == 200:
            open(os.path.join(a.saida, f"tabela_{tab}_{d:%Y%m%d}_p1.json"), "wb").write(r.content)
            log(f"  tabela {tab}: {r.content[:400]!r}")
        time.sleep(2)


if __name__ == "__main__":
    main()
