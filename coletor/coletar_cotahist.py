"""
SOLIDUNS — HISTÓRICO DIÁRIO DAS AÇÕES DA B3 (abertura, máxima, mínima, fechamento, volume) — v1.0 (12/10/2026)
v115-LEI · SQL 127 (public.cotacoes_br_hist + public.cotacoes_br_eventos + rpc precos_br_hist)

Fonte OFICIAL e gratuita: Séries Históricas de Cotações da B3 (arquivos COTAHIST, públicos, sem chave):
  - anual:  https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A{AAAA}.ZIP
  - diário: https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D{DDMMAAAA}.ZIP
Layout fixo de 245 posições (registro 01). Só o mercado à vista (TPMERC 010), lote padrão (CODBDI 02):
ações e units. Preços divididos pelo fator de cotação (FATCOT). Volume = volume financeiro (R$).

Modos:
  python coletor/coletar_cotahist.py --anos 2025,2026   carga do passado (uma vez; ~200 mil linhas)
  python coletor/coletar_cotahist.py                    diário: busca os pregões que faltam (até 10 dias úteis)
  --fonte PASTA   lê os .ZIP de uma pasta (teste, sem rede)   --saida PASTA  grava JSON em vez do banco

DESDOBRAMENTOS E GRUPAMENTOS (o preço da B3 nesses arquivos NÃO vem ajustado):
  - eventos da própria B3 (GetListedSupplementCompany, campo stockDividends: desdobramento, grupamento,
    bonificação), com a data-com;
  - o FATOR é conferido pelo salto real de preço (fechamento da data-com ÷ abertura do pregão seguinte):
    entre as leituras possíveis do fator da B3, vale a mais próxima do salto observado (até 18% de diferença);
  - salto ≥ 45% sem evento da B3, que bate (até 2%) com uma razão exata (2, 3, 4, 5, 10, 1/2…1/100), é
    registrado como evento "heuristica"; os demais saltos grandes só aparecem no registro (não ajusta).
  O preço guardado é o ORIGINAL; o ajuste é aplicado na leitura (rpc precos_br_hist), então um evento novo
  corrige o passado sem regravar nada.
Respeita a B3: 1 arquivo por vez, pausa entre consultas de eventos. Nunca grava valor de exemplo.
"""
import argparse
import base64
import datetime as dt
import io
import json
import math
import os
import re
import sys
import time
import zipfile

import requests

VERSAO = "1.2"
URL_ANUAL = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A{ano}.ZIP"
URL_DIARIO = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D{ddmmaaaa}.ZIP"
URL_EVENTOS = ("https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/"
               "CompanyCall/GetListedSupplementCompany/{token}")
CAB_B3 = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                         "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"),
          "Accept": "application/json, text/plain, */*", "Accept-Language": "pt-BR,pt;q=0.9",
          "Referer": "https://sistemaswebb3-listados.b3.com.br/listedCompaniesPage/",
          "Origin": "https://sistemaswebb3-listados.b3.com.br"}
TICKER_OK = re.compile(r"^[A-Z]{4}(3|4|5|6|7|8|11)$")   # ações e units (sem direitos/recibos de subscrição)
RAZOES = [2, 3, 4, 5, 6, 8, 10, 20, 25, 50, 100] + [1 / k for k in (2, 3, 4, 5, 6, 8, 10, 20, 25, 50, 100)]
FONTE = None
RESUMO = []


def log(*a):
    print(*a, flush=True)


def resumo(t):
    RESUMO.append(t)
    log(t)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(t + "\n\n")


# ---------------------------------------------------------------------------------------------- leitura
def ler_linha(l):
    """Uma linha do COTAHIST -> dict, ou None se não for ação/unit do mercado à vista, lote padrão."""
    if len(l) < 245 or l[0:2] != "01" or l[10:12] != "02" or l[24:27] != "010":
        return None
    tk = l[12:24].strip()
    if not TICKER_OK.match(tk):
        return None
    fat = int(l[210:217] or 1) or 1
    p = lambda a, b: int(l[a:b]) / 100 / fat
    try:
        d = dt.date(int(l[2:6]), int(l[6:8]), int(l[8:10])).isoformat()
        r = {"ticker": tk, "data": d, "abertura": round(p(56, 69), 6), "maxima": round(p(69, 82), 6),
             "minima": round(p(82, 95), 6), "fechamento": round(p(108, 121), 6),
             "negocios": int(l[147:152]), "quantidade": int(l[152:170]), "volume_fin": int(l[170:188]) / 100,
             "isin": l[230:242].strip() or None}
    except ValueError:
        return None
    if r["fechamento"] <= 0 or r["maxima"] < r["minima"]:
        return None
    return r


def ler_zip(conteudo):
    with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
        nome = z.namelist()[0]
        with z.open(nome) as f:
            for bruto in io.TextIOWrapper(f, encoding="latin-1"):
                r = ler_linha(bruto.rstrip("\r\n"))
                if r:
                    yield r


def baixar(url, nome):
    if FONTE:
        cam = os.path.join(FONTE, nome)
        return open(cam, "rb").read() if os.path.exists(cam) else None
    for t in range(3):
        try:
            r = requests.get(url, timeout=600, headers={"User-Agent": CAB_B3["User-Agent"]})
            if r.status_code == 200 and r.content[:2] == b"PK":
                return r.content
            if r.status_code == 404:
                return None
            log(f"  {nome}: HTTP {r.status_code} (tentativa {t + 1})")
        except requests.RequestException as e:
            log(f"  {nome}: {type(e).__name__} (tentativa {t + 1})")
        time.sleep(5 * (t + 1))
    return None


# ---------------------------------------------------------------------------------------------- eventos
def numero_br(v):
    v = str(v or "").strip().replace(".", "").replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None


def data_br(v):
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", str(v or "").strip())
    if not m:
        return None
    try:
        return dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
    except ValueError:
        return None


def eventos_b3(emissores, pausa=0.4):
    """{(emissor, isin|None): [(data_com, fator_b3, rotulo)]} a partir de stockDividends."""
    s = requests.Session()
    s.headers.update(CAB_B3)
    saida, falhas, verificar = {}, 0, True
    for n, em in enumerate(sorted(emissores), 1):
        tok = base64.b64encode(json.dumps({"issuingCompany": em, "language": "pt-br"}, separators=(",", ":")).encode()).decode()
        txt = None
        for t in range(3):
            try:
                r = s.get(URL_EVENTOS.format(token=tok), timeout=25, verify=verificar)
                if r.status_code == 200:
                    txt = r.text
                    break
            except requests.exceptions.SSLError:
                verificar = False                       # certificado incompleto da B3 (dado público, só leitura)
            except requests.RequestException:
                pass
            time.sleep(1 + t)
        if txt is None:
            falhas += 1
            if n == 15 and falhas == 15:
                log("  eventos da B3: 15 primeiras consultas falharam — seguindo sem eventos da B3")
                return saida, falhas
            continue
        try:
            d = json.loads(txt or "{}")
        except ValueError:
            continue
        d = (d[0] if d else {}) if isinstance(d, list) else d
        for e in d.get("stockDividends") or d.get("StockDividends") or []:
            dc = data_br(e.get("lastDatePrior"))
            f = numero_br(e.get("factor"))
            if not dc or not f or f <= 0:
                continue
            isin = (e.get("isinCode") or e.get("assetIssued") or "").strip().upper() or None
            saida.setdefault(em, []).append((dc, f, re.sub(r"\s+", " ", str(e.get("label") or "").strip().upper()), isin))
        time.sleep(pausa)
    return saida, falhas


def fator_b3(rotulo, f):
    """v1.2: leitura do fator da B3 (conferida com os eventos reais de 2025-26):
    DESDOBRAMENTO e BONIFICAÇÃO = % de aumento de ações (900 -> 1 vira 10; 4 -> 1,04);
    GRUPAMENTO = multiplicador de ações (0,025 -> 40 viram 1). Outros (cisão, redução de capital…) não
    mudam a quantidade de ações: não são ajustados."""
    r = (rotulo or "").upper()
    if "GRUPAMENTO" in r:
        return f if f > 0 else None
    if "DESDOBRAMENTO" in r or "BONIFICA" in r:
        return 1 + f / 100
    return None


def salto(serie, data_com):
    """(fechamento do último pregão <= data-com, abertura do 1º pregão > data-com) ou None."""
    ant = [x for x in serie if x["data"] <= data_com]
    dep = [x for x in serie if x["data"] > data_com]
    if not ant or not dep:
        return None
    a, b = ant[-1], dep[0]
    if (dt.date.fromisoformat(b["data"]) - dt.date.fromisoformat(a["data"])).days > 10 or b["abertura"] <= 0:
        return None
    return a["fechamento"] / b["abertura"], a["data"], b["data"]


def detectar_eventos(por_ticker, ev_b3):
    """Lista de {ticker, data_com, fator, tipo, origem, salto}. fator: divide os preços até a data-com."""
    eventos, avisos = [], []
    for tk, serie in por_ticker.items():
        usados = set()
        por_data = {}                                     # v1.2: eventos da mesma data-com são combinados (VIVT3 04/2025: 1/40 × 80 = 2)
        for (dc, f, rot, isin) in ev_b3.get(tk[:4], []):
            if isin and serie and serie[-1].get("isin") and isin != serie[-1]["isin"]:
                continue
            fx = fator_b3(rot, f)
            if fx is None:
                continue                                  # cisão/redução de capital etc.: não mexe na quantidade de ações
            lst = por_data.setdefault(dc, [])
            if (rot, round(fx, 10)) not in [(r, round(x, 10)) for r, x in lst]:   # a B3 às vezes repete o evento
                lst.append((rot, fx))
        for dc, lst in por_data.items():
            s = salto(serie, dc)
            if not s:
                continue
            obs = s[0]
            prod = math.prod(x for _, x in lst)
            opcoes = [(prod, " + ".join(r for r, _ in lst))] + ([(x, r) for r, x in lst] if len(lst) > 1 else [])
            fx, rot = min(opcoes, key=lambda o: abs(math.log(obs / o[0])))
            if abs(math.log(fx)) < 1e-6:
                continue
            if abs(math.log(obs / fx)) > 0.18:
                avisos.append(f"{tk} {dc}: evento B3 {rot} (fator {fx:.4f}) não bate com o salto {obs:.3f} — não ajustado")
                continue
            eventos.append({"ticker": tk, "data_com": s[1], "fator": round(fx, 8), "tipo": rot[:60] or "EVENTO",
                            "origem": "b3", "salto": round(obs, 6)})
            usados.add(s[1])
        for k, (a, b) in enumerate(zip(serie, serie[1:])):   # saltos grandes sem evento da B3
            if a["data"] in usados or b["abertura"] <= 0:
                continue
            if (dt.date.fromisoformat(b["data"]) - dt.date.fromisoformat(a["data"])).days > 10:
                continue                                   # papel sem negócio por semanas: não dá para afirmar
            if min(a["fechamento"], b["abertura"]) < 0.10:
                continue                                   # centavos: 1 tick parece "dobrar" o preço
            obs = a["fechamento"] / b["abertura"]
            if abs(math.log(obs)) < math.log(1.45):
                continue
            r = min(RAZOES, key=lambda x: abs(math.log(obs / x)))
            tol = 0.02 if abs(math.log(r)) < math.log(5) else 0.05   # razões grandes: coincidência é improvável
            seg = [x["fechamento"] for x in serie[k + 1:k + 4]]
            seg = sorted(seg)[len(seg) // 2] if seg else 0
            fica = seg > 0 and abs(math.log(a["fechamento"] / seg) - math.log(r)) <= 0.12   # o novo patamar se mantém
            if abs(math.log(obs / r)) <= tol and fica:
                eventos.append({"ticker": tk, "data_com": a["data"], "fator": round(r, 8),
                                "tipo": "DESDOBRAMENTO" if r > 1 else "GRUPAMENTO", "origem": "heuristica", "salto": round(obs, 6)})
            else:
                avisos.append(f"{tk} {a['data']}→{b['data']}: salto de {obs:.3f} sem evento — não ajustado")
    # v1.1: um evento por ticker e data-com (a B3 pode listar o mesmo evento 2×; a da B3 vale mais que a heurística)
    unicos = {}
    for e in eventos:
        k = (e["ticker"], e["data_com"])
        if k not in unicos or (unicos[k]["origem"] != "b3" and e["origem"] == "b3"):
            unicos[k] = e
    return list(unicos.values()), avisos


# ---------------------------------------------------------------------------------------------- banco
def supa():
    url, chave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not chave:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY (Secrets do GitHub).")
    return url.rstrip("/"), {"apikey": chave, "Authorization": "Bearer " + chave, "Content-Type": "application/json"}


def gravar(nome, linhas, conflito, lote=1000):
    url, cab = supa()
    agora = dt.datetime.now(dt.timezone.utc).isoformat()
    for i in range(0, len(linhas), lote):
        corpo = [dict(l, coletado_em=agora) for l in linhas[i:i + lote]]
        for t in range(3):
            r = requests.post(f"{url}/rest/v1/{nome}?on_conflict={conflito}", json=corpo, timeout=300,
                              headers=dict(cab, Prefer="resolution=merge-duplicates,return=minimal"))
            if r.status_code < 300:
                break
            if r.status_code == 404:
                sys.exit(f"Tabela {nome} não existe: rode o SQL 127 no Supabase.")
            if t == 2:
                raise RuntimeError(f"Gravação em {nome} recusada (lote {i // lote + 1}): HTTP {r.status_code} {r.text[:400]}")
            time.sleep(5)


def ultima_data():
    url, cab = supa()
    r = requests.get(f"{url}/rest/v1/cotacoes_br_hist?select=data&order=data.desc&limit=1", headers=cab, timeout=60)
    if r.status_code == 404:
        sys.exit("Tabela cotacoes_br_hist não existe: rode o SQL 127 no Supabase.")
    j = r.json() if r.ok else []
    return j[0]["data"] if j else None


def serie_do_banco(tickers, desde):
    """Para detectar eventos no modo diário: últimos pregões de cada ticker (só fechamento/abertura)."""
    url, cab = supa()
    out, ini = {}, 0
    while True:
        r = requests.get(f"{url}/rest/v1/cotacoes_br_hist?select=ticker,data,abertura,fechamento,isin&data=gte.{desde}"
                         f"&order=ticker.asc,data.asc", headers=dict(cab, Range=f"{ini}-{ini + 999}"), timeout=120)
        b = r.json() if r.ok else []
        for x in b:
            if x["ticker"] in tickers:
                out.setdefault(x["ticker"], []).append(x)
        if len(b) < 1000:
            return out
        ini += 1000


# ---------------------------------------------------------------------------------------------- principal
def dias_uteis_desde(ini, hoje):
    d, out = ini, []
    while d <= hoje:
        if d.weekday() < 5:
            out.append(d)
        d += dt.timedelta(days=1)
    return out


def main():
    try:
        principal()
    except SystemExit:
        raise
    except Exception as e:                                 # v1.1: qualquer erro aparece no Summary
        resumo(f"RESULTADO: **ERRO** {type(e).__name__}: {str(e)[:600]}")
        raise


def principal():
    global FONTE
    ap = argparse.ArgumentParser()
    ap.add_argument("--anos", help="carga do passado, ex.: 2025,2026")
    ap.add_argument("--fonte", help="pasta com os .ZIP (teste, sem rede)")
    ap.add_argument("--saida", help="pasta para gravar JSON em vez do banco")
    ap.add_argument("--hoje", help="AAAA-MM-DD (teste)")
    ap.add_argument("--sem-eventos", action="store_true", help="não consulta os eventos na B3 (teste)")
    a = ap.parse_args()
    FONTE = a.fonte
    hoje = dt.date.fromisoformat(a.hoje) if a.hoje else dt.date.today()
    resumo(f"### SOLIDUNS — histórico B3 (COTAHIST) v{VERSAO} — {dt.datetime.now():%d/%m/%Y %H:%M}")

    linhas = []
    if a.anos:
        for ano in [int(x) for x in a.anos.split(",") if x.strip()]:
            z = baixar(URL_ANUAL.format(ano=ano), f"COTAHIST_A{ano}.ZIP")
            if not z:
                resumo(f"- arquivo anual {ano}: **não encontrado** na B3")
                continue
            n0 = len(linhas)
            linhas.extend(ler_zip(z))
            resumo(f"- arquivo anual {ano}: {len(linhas) - n0:,} linhas de ações/units".replace(",", "."))
    else:
        ult = None if a.saida else ultima_data()
        ini = (dt.date.fromisoformat(ult) + dt.timedelta(days=1)) if ult else hoje - dt.timedelta(days=14)
        dias = dias_uteis_desde(max(ini, hoje - dt.timedelta(days=14)), hoje)[-10:]
        if not dias:
            resumo("- nada a buscar: o último pregão já está no banco")
        for d in dias:
            z = baixar(URL_DIARIO.format(ddmmaaaa=d.strftime("%d%m%Y")), f"COTAHIST_D{d:%d%m%Y}.ZIP")
            if not z:
                log(f"  {d:%d/%m/%Y}: sem arquivo (feriado, fim de semana ou ainda não publicado)")
                continue
            n0 = len(linhas)
            linhas.extend(ler_zip(z))
            resumo(f"- pregão {d:%d/%m/%Y}: {len(linhas) - n0} ações/units")
    if not linhas:
        resumo("RESULTADO: nenhuma linha nova — nada gravado.")
        return

    # um registro por ticker e dia (o último, se repetir)
    linhas = list({(l["ticker"], l["data"]): l for l in linhas}.values())
    por_ticker = {}
    for l in sorted(linhas, key=lambda x: (x["ticker"], x["data"])):
        por_ticker.setdefault(l["ticker"], []).append(l)
    if not a.anos and not a.saida:                       # diário: junta os pregões anteriores do banco
        antes = serie_do_banco(set(por_ticker), (hoje - dt.timedelta(days=20)).isoformat())
        for tk, s in antes.items():
            dias = {x["data"] for x in por_ticker[tk]}
            por_ticker[tk] = sorted([x for x in s if x["data"] not in dias] + por_ticker[tk], key=lambda x: x["data"])

    ev_b3, falhas = ({}, 0) if (a.sem_eventos or FONTE) else eventos_b3({tk[:4] for tk in por_ticker})
    if not (a.sem_eventos or FONTE):
        resumo(f"- eventos da B3 (desdobramento/grupamento/bonificação): {sum(len(v) for v in ev_b3.values())} lidos"
               + (f"; {falhas} empresa(s) sem resposta" if falhas else ""))
    eventos, avisos = detectar_eventos(por_ticker, ev_b3)
    resumo(f"- eventos aplicados no ajuste: {len(eventos)} (B3: {sum(e['origem'] == 'b3' for e in eventos)}; "
           f"por salto exato: {sum(e['origem'] == 'heuristica' for e in eventos)})")
    for e in eventos:
        log(f"    {e['ticker']} data-com {e['data_com']}: {e['tipo']} fator {e['fator']} ({e['origem']}, salto {e['salto']})")
    if avisos:
        resumo(f"- saltos grandes NÃO ajustados (conferir): {len(avisos)}")
        for t in avisos[:30]:
            log("    " + t)

    if a.saida:
        os.makedirs(a.saida, exist_ok=True)
        json.dump(linhas, open(os.path.join(a.saida, "cotacoes_br_hist.json"), "w"), ensure_ascii=False)
        json.dump(eventos, open(os.path.join(a.saida, "cotacoes_br_eventos.json"), "w"), ensure_ascii=False, indent=1)
        resumo(f"RESULTADO (teste): {len(linhas)} linhas e {len(eventos)} eventos em {a.saida}")
        return
    dmin, dmax = min(l["data"] for l in linhas), max(l["data"] for l in linhas)
    try:
        gravar("cotacoes_br_hist", linhas, "ticker,data")
    except Exception as e:                                 # v1.1: o motivo vai para o Summary
        resumo(f"RESULTADO: **ERRO** ao gravar o histórico — {str(e)[:600]}")
        sys.exit(1)
    if a.anos:                                            # v1.2: carga refaz os eventos automáticos do período
        try:
            url, cab = supa()
            r = requests.delete(f"{url}/rest/v1/cotacoes_br_eventos?origem=in.(b3,heuristica)&data_com=gte.{dmin}&data_com=lte.{dmax}",
                                headers=cab, timeout=120)
            resumo(f"- eventos automáticos antigos do período apagados para regravar (HTTP {r.status_code})")
        except requests.RequestException as e:
            resumo(f"- aviso: não consegui limpar os eventos antigos ({type(e).__name__})")
    if eventos:
        try:
            gravar("cotacoes_br_eventos", [{k: e[k] for k in ("ticker", "data_com", "fator", "tipo", "origem", "salto")} for e in eventos],
                   "ticker,data_com")
        except Exception as e:                             # eventos nunca derrubam o histórico já gravado
            resumo(f"- **aviso**: eventos de ajuste NÃO gravados — {str(e)[:500]}")
    resumo(f"RESULTADO: gravadas {len(linhas):,} linhas de {len(por_ticker)} ações/units, de {dmin} a {dmax}; "
           f"{len(eventos)} evento(s) de ajuste.".replace(",", "."))


if __name__ == "__main__":
    main()
