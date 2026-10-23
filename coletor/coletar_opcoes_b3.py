"""
SOLIDUNS — OPÇÕES DE AÇÕES DA B3 (calls e puts): fechamento diário, volatilidade implícita e delta — v1.0 (23/10/2026)
SQL 187 (public.opcoes_br_hist + RPCs opcoes_br_pregoes / opcoes_br_pregao). Site: v172 (aba Opções).

Fontes OFICIAIS e gratuitas (sem chave e sem assinatura):
  1. Séries Históricas da B3 (COTAHIST, o mesmo arquivo das ações): registros de opções de compra (TPMERC 070) e de
     venda (TPMERC 080) — código, preço de exercício, vencimento, abertura, máxima, mínima, fechamento, negócios,
     quantidade e volume. O ativo-objeto é ligado pelo ISIN gravado no registro da opção (é o ISIN da ação).
  2. Arquivos públicos da B3 (arquivos.b3.com.br): cadastro de instrumentos (ativo-objeto e estilo americano/europeu)
     e posições em aberto (quantidade de opções em aberto). Usados quando existem para a data; senão ficam vazios.
  3. Banco Central (SGS 1178): Selic anualizada, base 252, como taxa livre de risco.
Calculado pela SOLIDUNS: dias úteis até o vencimento (calendário de feriados nacionais da B3), volatilidade implícita
pelo modelo de Black-Scholes (sem dividendos; taxa contínua ln(1 + Selic); prazo em dias úteis ÷ 252) e delta.
Opções de índice (IBOV) ficam de fora nesta versão (o índice não está no arquivo do mercado à vista).

Gravação compacta: uma linha por pregão e ativo-objeto, com as opções do dia numa lista (jsonb). Campos de cada opção:
  [código, tipo C/P, estilo A/E/null, exercício, vencimento, abertura, máxima, mínima, fechamento, negócios,
   quantidade, volume R$, fechamento anterior, vol. implícita, delta, posição em aberto, dias úteis]
O fechamento anterior é o último fechamento da mesma série nos 10 pregões anteriores (opção não negocia todo dia).

Modos:
  python coletor/coletar_opcoes_b3.py                       diário: pregões que faltam (até 10 dias úteis)
  python coletor/coletar_opcoes_b3.py --desde 2026-01-02    carga do passado (arquivo anual da B3)
  --fonte PASTA   lê os arquivos de uma pasta (teste, sem rede)   --saida PASTA  grava JSON em vez do banco
Nunca grava valor de exemplo: sem Selic do dia, a volatilidade implícita e o delta ficam vazios.
"""
import argparse
import csv
import datetime as dt
import io
import json
import math
import os
import sys
import time
import zipfile

import requests

VERSAO = "1.0"
URL_ANUAL = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A{ano}.ZIP"
URL_DIARIO = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D{ddmmaaaa}.ZIP"
URL_PEDIDO = "https://arquivos.b3.com.br/api/download/requestname?fileName={nome}&date={data}"
URL_TOKEN = "https://arquivos.b3.com.br/api/download/?token={token}"
URL_SELIC = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.1178/dados?formato=json&dataInicial={ini}&dataFinal={fim}"
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                     "Chrome/129.0.0.0 Safari/537.36"), "Accept": "*/*", "Accept-Language": "pt-BR,pt;q=0.9"}
JANELA_ANTERIOR = 10          # pregões para achar o fechamento anterior da mesma série
FONTE = None
SAIDA = None


def log(*a):
    print(*a, flush=True)


def resumo(t):
    log(t)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(t + "\n\n")


# --------------------------------------------------------------------------------------- calendário da B3
def pascoa(a):
    b, c = divmod(a, 100)
    d = (19 * (a % 19) + b - b // 4 - (b - (b + 8) // 25 + 1) // 3 + 15) % 30
    e = (32 + 2 * (b % 4) + 2 * (c // 4) - d - c % 4) % 7
    f = d + e - 7 * ((a % 19 + 11 * d + 22 * e) // 451) + 114
    return dt.date(a, f // 31, f % 31 + 1)


_FER = {}


def feriados(ano):
    if ano not in _FER:
        p = pascoa(ano)
        fixos = [(1, 1), (4, 21), (5, 1), (9, 7), (10, 12), (11, 2), (11, 15), (12, 24), (12, 25), (12, 31)]
        if ano >= 2024:
            fixos.append((11, 20))          # Consciência Negra, feriado nacional desde 2024
        s = {dt.date(ano, m, d) for m, d in fixos}
        s |= {p - dt.timedelta(days=48), p - dt.timedelta(days=47), p - dt.timedelta(days=2), p + dt.timedelta(days=60)}
        _FER[ano] = s
    return _FER[ano]


def dia_util(d):
    return d.weekday() < 5 and d not in feriados(d.year)


def dias_uteis(de, ate):
    """Dias úteis em (de, ate]: o prazo da opção que vence em `ate`, visto no fechamento de `de`."""
    if ate <= de:
        return 0
    n, d = 0, de
    while d < ate:
        d += dt.timedelta(days=1)
        if dia_util(d):
            n += 1
    return n


# --------------------------------------------------------------------------------------- Black-Scholes
def _N(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def bs_preco(tipo, S, K, T, r, v):
    if v <= 0 or T <= 0:
        return max(0.0, (S - K) if tipo == "C" else (K - S))
    d1 = (math.log(S / K) + (r + v * v / 2) * T) / (v * math.sqrt(T))
    d2 = d1 - v * math.sqrt(T)
    if tipo == "C":
        return S * _N(d1) - K * math.exp(-r * T) * _N(d2)
    return K * math.exp(-r * T) * _N(-d2) - S * _N(-d1)


def vol_implicita(tipo, preco, S, K, T, r):
    """Volatilidade que iguala o preço de Black-Scholes ao fechamento; None se o preço está fora do intervalo."""
    if not (preco > 0 and S > 0 and K > 0 and T > 0):
        return None
    piso = bs_preco(tipo, S, K, T, r, 1e-4)
    if preco <= piso + 1e-9:
        return None
    lo, hi = 1e-4, 5.0
    if bs_preco(tipo, S, K, T, r, hi) < preco:
        return None
    for _ in range(80):
        m = (lo + hi) / 2
        if bs_preco(tipo, S, K, T, r, m) < preco:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def delta(tipo, S, K, T, r, v):
    d1 = (math.log(S / K) + (r + v * v / 2) * T) / (v * math.sqrt(T))
    return _N(d1) if tipo == "C" else _N(d1) - 1


# --------------------------------------------------------------------------------------- leitura do COTAHIST
def ler_registros(texto):
    """Linhas do COTAHIST -> (data, {isin: (ticker, fechamento)} do à vista, [opções])."""
    vista, opcoes = {}, []
    for l in texto:
        if len(l) < 245 or l[0:2] != "01":
            continue
        tp = l[24:27]
        if tp not in ("010", "070", "080"):
            continue
        try:
            d = dt.date(int(l[2:6]), int(l[6:8]), int(l[8:10]))
            fat = int(l[210:217] or 1) or 1
            p = lambda a, b: int(l[a:b]) / 100 / fat
            if tp == "010":
                if l[10:12] != "96":                    # todo o à vista menos o fracionário (ações, units, ETFs, BDRs)
                    vista.setdefault(d, {})[l[230:242].strip()] = (l[12:24].strip(), p(108, 121))
                continue
            opcoes.append({"data": d, "codigo": l[12:24].strip(), "tipo": "C" if tp == "070" else "P",
                           "isin": l[230:242].strip(), "abertura": p(56, 69), "maxima": p(69, 82),
                           "minima": p(82, 95), "fechamento": p(108, 121), "negocios": int(l[147:152]),
                           "quantidade": int(l[152:170]), "volume": int(l[170:188]) / 100,
                           "strike": p(188, 201), "vencimento": dt.date(int(l[202:206]), int(l[206:208]), int(l[208:210]))})
        except ValueError:
            continue
    return vista, opcoes


def baixar(url, nome, binario=True):
    if FONTE:
        cam = os.path.join(FONTE, nome)
        return open(cam, "rb").read() if os.path.exists(cam) else None
    for t in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=600)
            if r.status_code == 200 and (not binario or r.content[:2] == b"PK"):
                return r.content
            if r.status_code == 404:
                return None
            log(f"  {nome}: HTTP {r.status_code} (tentativa {t + 1})")
        except requests.RequestException as e:
            log(f"  {nome}: {type(e).__name__} (tentativa {t + 1})")
        time.sleep(5 * (t + 1))
    return None


def arquivo_b3(nome, d):
    """Arquivo público da B3 (CSV com ';') da data, ou None."""
    if FONTE:
        cam = os.path.join(FONTE, f"{nome}_{d:%Y%m%d}.bin")
        texto = open(cam, encoding="latin-1").read() if os.path.exists(cam) else None
    else:
        texto = None
        try:
            r = requests.get(URL_PEDIDO.format(nome=nome, data=d.isoformat()), headers=UA, timeout=120)
            tok = r.json().get("token") if r.status_code == 200 else None
            if tok:
                time.sleep(1)
                r2 = requests.get(URL_TOKEN.format(token=tok), headers=UA, timeout=600)
                if r2.status_code == 200 and r2.content:
                    texto = r2.content.decode("latin-1")
        except (requests.RequestException, ValueError) as e:
            log(f"  {nome} {d}: {type(e).__name__}")
    if not texto:
        return None
    linhas = texto.splitlines()
    while linhas and not linhas[0].startswith("RptDt;"):    # "Status do Arquivo: Final" antes do cabeçalho
        linhas.pop(0)
    if not linhas:
        return None
    return list(csv.DictReader(io.StringIO("\n".join(linhas)), delimiter=";"))


def cadastro_e_posicoes(d):
    """{código: (ativo, estilo)} do cadastro e {código: posição em aberto} da data (vazios se a B3 não tiver)."""
    cad, pos = {}, {}
    linhas = arquivo_b3("InstrumentsConsolidatedFile", d)
    for x in linhas or []:
        if x.get("SctyCtgyNm") == "OPTION ON EQUITIES":
            est = {"AMER": "A", "EURO": "E"}.get(x.get("OptnStyle"))
            cad[x["TckrSymb"]] = (x.get("Asst") or None, est)
    linhas = arquivo_b3("DerivativesOpenPositionFile", d)
    for x in linhas or []:
        if x.get("SgmtNm") in ("EQUITY CALL", "EQUITY PUT"):
            try:
                pos[x["TckrSymb"]] = int(x.get("TtlPos") or 0)
            except ValueError:
                pass
    return cad, pos


# --------------------------------------------------------------------------------------- Selic
def selic(ini, fim):
    """{data: taxa anual (decimal)} da Selic anualizada base 252 (SGS 1178)."""
    if FONTE:
        cam = os.path.join(FONTE, "selic.json")
        j = json.load(open(cam)) if os.path.exists(cam) else []
    else:
        j = []
        for t in range(3):
            try:
                r = requests.get(URL_SELIC.format(ini=f"{ini:%d/%m/%Y}", fim=f"{fim:%d/%m/%Y}"), timeout=120,
                                 headers={"Accept": "application/json"})
                if r.status_code == 200:
                    j = r.json()
                    break
            except (requests.RequestException, ValueError):
                pass
            time.sleep(5 * (t + 1))
    out = {}
    for x in j:
        try:
            dd, mm, aa = x["data"].split("/")
            out[dt.date(int(aa), int(mm), int(dd))] = float(str(x["valor"]).replace(",", ".")) / 100
        except (KeyError, ValueError):
            continue
    return out


def selic_do_dia(tab, d):
    """Taxa do pregão; aceita a do dia útil anterior (o BC publica com 1 dia de atraso)."""
    for k in range(6):
        v = tab.get(d - dt.timedelta(days=k))
        if v is not None:
            return v
    return None


# --------------------------------------------------------------------------------------- montagem
def montar_dia(d, vista, opcoes, anteriores, cad, pos, taxa):
    """Linhas do banco (uma por ativo-objeto) do pregão `d`; atualiza `anteriores` com os fechamentos do dia."""
    r = math.log(1 + taxa) if taxa is not None else None
    vis = vista.get(d, {})
    por_ativo, sem_objeto = {}, 0
    for o in opcoes:
        estilo = cad.get(o["codigo"], (None, None))[1]
        obj = vis.get(o["isin"])            # o ISIN do registro da opção é o da ação-objeto
        if obj is None:
            sem_objeto += 1
            continue
        ativo, S = obj
        du = dias_uteis(d, o["vencimento"])
        T = du / 252
        vi = dl = None
        if r is not None and du > 0 and S > 0:
            vi = vol_implicita(o["tipo"], o["fechamento"], S, o["strike"], T, r)
            if vi is not None:
                dl = delta(o["tipo"], S, o["strike"], T, r, vi)
        ant = anteriores.get(o["codigo"])
        item = [o["codigo"], o["tipo"], estilo, round(o["strike"], 4), o["vencimento"].isoformat(),
                round(o["abertura"], 4), round(o["maxima"], 4), round(o["minima"], 4), round(o["fechamento"], 4),
                o["negocios"], o["quantidade"], round(o["volume"], 2), round(ant, 4) if ant is not None else None,
                round(vi, 4) if vi is not None else None, round(dl, 4) if dl is not None else None,
                pos.get(o["codigo"]), du]
        g = por_ativo.setdefault(ativo, {"preco": S, "itens": []})
        g["itens"].append(item)
    for o in opcoes:
        anteriores[o["codigo"]] = o["fechamento"]
    linhas = []
    for ativo, g in por_ativo.items():
        g["itens"].sort(key=lambda x: -x[11])
        linhas.append({"data": d.isoformat(), "ativo": ativo, "preco_ativo": round(g["preco"], 4),
                       "selic": round(taxa, 6) if taxa is not None else None, "n_opcoes": len(g["itens"]),
                       "volume": round(sum(x[11] for x in g["itens"]), 2), "itens": g["itens"]})
    return linhas, sem_objeto


# --------------------------------------------------------------------------------------- banco
def supa():
    url, chave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not chave:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY (Secrets do GitHub).")
    return url.rstrip("/"), {"apikey": chave, "Authorization": f"Bearer {chave}", "Content-Type": "application/json"}


def gravar(linhas, lote=15):
    if SAIDA:
        os.makedirs(SAIDA, exist_ok=True)
        for l in linhas:
            open(os.path.join(SAIDA, f"opcoes_{l['data']}.jsonl"), "a").write(json.dumps(l) + "\n")
        return
    url, cab = supa()
    agora = dt.datetime.now(dt.timezone.utc).isoformat()
    for i in range(0, len(linhas), lote):
        corpo = [dict(l, coletado_em=agora) for l in linhas[i:i + lote]]
        for t in range(3):
            r = requests.post(f"{url}/rest/v1/opcoes_br_hist?on_conflict=data,ativo", json=corpo, timeout=300,
                              headers=dict(cab, Prefer="resolution=merge-duplicates,return=minimal"))
            if r.status_code < 300:
                break
            if r.status_code == 404:
                sys.exit("Tabela opcoes_br_hist não existe: rode o SQL 187 no Supabase.")
            if t == 2:
                raise RuntimeError(f"Gravação recusada: HTTP {r.status_code} {r.text[:400]}")
            time.sleep(5)


def datas_gravadas(desde):
    if SAIDA:
        return set()
    url, cab = supa()
    r = requests.post(f"{url}/rest/v1/rpc/opcoes_br_datas_gravadas", json={"p_desde": desde.isoformat()},
                      headers=cab, timeout=60)
    if r.status_code == 404:
        sys.exit("Função opcoes_br_datas_gravadas não existe: rode o SQL 187 no Supabase.")
    r.raise_for_status()
    return {dt.date.fromisoformat(x) for x in (r.json() or [])}


def limpar(dias):
    if SAIDA:
        return
    url, cab = supa()
    r = requests.post(f"{url}/rest/v1/rpc/opcoes_br_limpar", json={"p_pregoes": dias}, headers=cab, timeout=300)
    if r.status_code < 300:
        log(f"Limpeza: {r.text.strip()} linha(s) com mais de {dias} pregões apagada(s).")


# --------------------------------------------------------------------------------------- execução
def linhas_zip(conteudo):
    """Linhas de um .ZIP do COTAHIST, lidas aos poucos (o arquivo anual passa de 600 MB descompactado)."""
    with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
        with z.open(z.namelist()[0]) as f:
            for bruto in io.TextIOWrapper(f, encoding="latin-1"):
                yield bruto.rstrip("\r\n")


def por_pregao(linhas):
    """Agrupa as linhas por pregão, na ordem do arquivo (o COTAHIST vem ordenado por data)."""
    atual, bloco, vistos = None, [], set()
    for l in linhas:
        if len(l) < 245 or l[0:2] != "01" or l[24:27] not in ("010", "070", "080"):
            continue
        d = l[2:10]
        if d != atual:
            if bloco:
                yield ler_dia(bloco)
            if d in vistos:
                raise RuntimeError(f"COTAHIST fora de ordem de data ({d})")
            vistos.add(d)
            atual, bloco = d, []
        bloco.append(l)
    if bloco:
        yield ler_dia(bloco)


def ler_dia(bloco):
    vista, opcoes = ler_registros(bloco)
    d = next(iter(vista)) if vista else (opcoes[0]["data"] if opcoes else None)
    return d, vista, opcoes


def processar(dias, eh_alvo, cad_pos_por_dia, tab_selic):
    """dias: [(data, à vista, opções)] em ordem de data; grava os pregões em que eh_alvo(data) é verdadeiro."""
    recentes = []                              # [{código: fechamento}] dos últimos pregões
    total, gravados = 0, 0
    for d, vista, opcoes in dias:
        if d is None:
            continue
        if opcoes and eh_alvo(d):
            anteriores = {}
            for m in recentes[-JANELA_ANTERIOR:]:
                anteriores.update(m)
            cad, pos = cad_pos_por_dia(d)
            taxa = selic_do_dia(tab_selic, d)
            linhas, sem_obj = montar_dia(d, vista, opcoes, anteriores, cad, pos, taxa)
            n = sum(l["n_opcoes"] for l in linhas)
            gravar(linhas)
            total += n
            gravados += 1
            com_vi = sum(1 for l in linhas for x in l["itens"] if x[13] is not None)
            log(f"{d}: {n} opções de {len(linhas)} ativos (sem ativo-objeto: {sem_obj}; com vol. implícita: {com_vi};"
                f" cadastro: {'sim' if cad else 'não'}; posições: {'sim' if pos else 'não'};"
                f" Selic: {f'{taxa * 100:.2f}%' if taxa is not None else 'sem dado'})")
        if opcoes:
            recentes.append({o["codigo"]: o["fechamento"] for o in opcoes})
            recentes = recentes[-JANELA_ANTERIOR:]
    return gravados, total


def main():
    global FONTE, SAIDA
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", help="carga do passado a partir desta data (AAAA-MM-DD)")
    ap.add_argument("--ate", help="último pregão (padrão: hoje)")
    ap.add_argument("--manter", type=int, default=126, help="pregões guardados no banco (~6 meses)")
    ap.add_argument("--fonte")
    ap.add_argument("--saida")
    a = ap.parse_args()
    FONTE, SAIDA = a.fonte, a.saida
    hoje = dt.date.fromisoformat(a.ate) if a.ate else dt.date.today()
    log(f"SOLIDUNS — opções da B3 v{VERSAO}")

    if a.desde:
        ini = dt.date.fromisoformat(a.desde)
        primeiro = ini - dt.timedelta(days=25)          # pregões antes do início: só para o fechamento anterior
        tab = selic(ini - dt.timedelta(days=10), hoje)

        def dias():
            for ano in range(primeiro.year, hoje.year + 1):
                c = baixar(URL_ANUAL.format(ano=ano), f"COTAHIST_A{ano}.ZIP")
                if c is None:
                    log(f"COTAHIST_A{ano}: não encontrado")
                    continue
                log(f"COTAHIST_A{ano}: {len(c) / 1e6:.0f} MB")
                for x in por_pregao(linhas_zip(c)):
                    if x[0] is not None and primeiro <= x[0] <= hoje:
                        yield x
                del c
        eh_alvo = lambda d: d >= ini
    else:
        ja = datas_gravadas(hoje - dt.timedelta(days=40))
        candidatos, d = [], hoje
        while len(candidatos) < 10 + JANELA_ANTERIOR + 2 and d > hoje - dt.timedelta(days=60):
            if dia_util(d):
                candidatos.append(d)
            d -= dt.timedelta(days=1)
        candidatos.sort()
        faltam = {x for x in candidatos[-10:] if x not in ja}
        if not faltam:
            resumo("Nenhum pregão novo de opções a gravar.")
            return
        tab = selic(min(faltam) - dt.timedelta(days=10), max(faltam))

        def dias():
            for x in candidatos:
                if x > max(faltam):
                    break
                c = baixar(URL_DIARIO.format(ddmmaaaa=f"{x:%d%m%Y}"), f"COTAHIST_D{x:%d%m%Y}.ZIP")
                if c is not None:
                    yield from por_pregao(linhas_zip(c))
        eh_alvo = lambda d: d in faltam
    if not tab:
        log("aviso: Selic indisponível no Banco Central; volatilidade implícita e delta ficam vazios.")

    def cad_pos(d):                               # cadastro e posições: só nos pregões recentes
        return cadastro_e_posicoes(d) if (hoje - d).days <= 20 else ({}, {})
    n_dias, n_op = processar(dias(), eh_alvo, cad_pos, tab)
    if not n_dias:
        resumo("A B3 ainda não publicou o arquivo do pregão (ou não houve opções).")
        return
    resumo(f"Opções da B3: {n_dias} pregão(ões) gravado(s), {n_op} registros de opções.")
    limpar(a.manter)


if __name__ == "__main__":
    main()
