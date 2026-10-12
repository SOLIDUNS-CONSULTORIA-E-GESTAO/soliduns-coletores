"""
SOLIDUNS — MERCADO FINANCEIRO — Fluxo e participação dos investidores na B3 — v1.0 (11/10/2026)

Fonte OFICIAL e gratuita: Boletim Diário do Mercado (BDI) da B3, capítulo "Indicadores e informativos",
tabela "Participação dos investidores" (desde 12/2022 a B3 publica esses números só no BDI).
  - Arquivo público: https://arquivos.b3.com.br/bdi/download/bdi/AAAA-MM-DD/BDI_02...AAAAMMDD.pdf
  - Conteúdo: compras e vendas (R$ mil) e participação (%) de Institucionais, Instituições Financeiras,
    Investidor Estrangeiro, Investidores Individuais e Outros — ACUMULADO DO MÊS até 2 dias úteis antes.
O robô:
  1. procura o BDI mais recente (últimos 7 dias, as duas grafias de nome que a B3 já usou);
  2. lê a tabela (pdftotext -layout) e CONFERE: 5 tipos, valores positivos e participações somando ~100%;
  3. só então grava em public.mercado_fluxo_investidores (SQL 124), em reais (R$ mil x 1000);
  4. guarda uma AMOSTRA do texto lido (artefato da rotina) — e, para estudo, uma amostra do
     "Relatório Dados de Mercado" (CSV da B3), que ainda NÃO é gravado (formato a confirmar).
Nunca grava número de exemplo: se a leitura não passar na conferência, nada vai para o banco.
NÃO usa o DATAWISE (produto pago da B3, que proíbe redistribuição).
Regras: robots.txt, robô identificado, 2 s entre pedidos, sem login.
Variáveis (Secrets do GitHub): SUPABASE_URL, SUPABASE_SERVICE_KEY. Testes: B3_BDI_BASE, B3_CSV_URL, FLUXO_HOJE.
"""

import base64
import datetime as dt
import io
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.parse as up
import urllib.robotparser as rp
import zipfile

import requests

VERSAO = "1.0"
UA = "SOLIDUNS-coletor/1.0 (+contato@soliduns.com.br)"
TESTE = bool(os.environ.get("LEILOES_TESTE"))
PAUSA = 0 if TESTE else 2
BDI_BASE = (os.environ.get("B3_BDI_BASE") or "https://arquivos.b3.com.br/bdi/download/bdi").rstrip("/")
CSV_URL = os.environ.get("B3_CSV_URL") or ("https://sistemaswebb3-listados.b3.com.br/marketDataProxy/MarketDataCall/"
                                          "GetDownloadMarketData/RELATORIO_DADOS_DE_MERCADO.csv")
AMOSTRAS = os.environ.get("AMOSTRAS") or "amostras_fluxo_b3"
FONTE = "B3 — Boletim Diário do Mercado (BDI)"
TIPOS = [  # (código no banco, padrão do nome na tabela)
    ("institucional", r"institucion"),
    ("inst_financeira", r"institui[cç][oõ]es\s+financeiras?"),
    ("estrangeiro", r"estrangeir"),
    ("pessoa_fisica", r"individua|pessoas?\s+f[ií]sicas?"),
    ("outros", r"^outros"),
]
relatorio = []
_robots = {}
_ultima = [0.0]


def log(*a):
    m = " ".join(str(x) for x in a)
    print(m, flush=True)
    relatorio.append(m)


def sa(t):
    return "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn").lower()


def guardar(nome, conteudo):
    os.makedirs(AMOSTRAS, exist_ok=True)
    modo = "wb" if isinstance(conteudo, bytes) else "w"
    with open(os.path.join(AMOSTRAS, nome), modo, **({} if modo == "wb" else {"encoding": "utf-8"})) as f:
        f.write(conteudo)


# ------------------------------------------------------------ internet educada
def permitido(sess, url):
    p = up.urlparse(url)
    base = f"{p.scheme}://{p.netloc}"
    if base not in _robots:
        r = rp.RobotFileParser()
        try:
            resp = sess.get(base + "/robots.txt", timeout=30)
            r.parse(resp.text.splitlines() if resp.status_code < 400 else [])
        except requests.RequestException:
            r.parse([])
        _robots[base] = r
    return _robots[base].can_fetch(UA, url)


def baixar(sess, url):
    if not permitido(sess, url):
        log(f"  robots.txt proíbe {url} — não aberto")
        return None, "robots"
    espera = PAUSA - (time.time() - _ultima[0])
    if espera > 0:
        time.sleep(espera)
    try:
        r = sess.get(url, timeout=60)
    except requests.RequestException as e:
        _ultima[0] = time.time()
        return None, type(e).__name__
    _ultima[0] = time.time()
    return (r.content if r.status_code == 200 else None), r.status_code


# ------------------------------------------------------------ leitura do BDI
def num_br(v):
    s = (v or "").strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


RE_LINHA = re.compile(r"^\s*([A-Za-zÀ-ú][A-Za-zÀ-ú ]{2,40}?)\s{2,}([\d.]+(?:,\d+)?)\s+([\d]{1,3},\d{1,2})\s+([\d.]+(?:,\d+)?)\s+([\d]{1,3},\d{1,2})\s*$")


def ler_tabela_bdi(texto):
    """texto do PDF (pdftotext -layout) -> {'linhas': {tipo: (compras_mil, part_c, vendas_mil, part_v)}, 'ate': date|None}"""
    i = sa(texto).find("participacao dos investidores")
    if i < 0:
        return None
    trecho = texto[i:i + 4000]
    linhas = {}
    for ln in trecho.splitlines():
        m = RE_LINHA.match(ln)
        if not m:
            continue
        nome = sa(m.group(1)).strip()
        for cod, pad in TIPOS:
            if cod not in linhas and re.search(pad, nome):
                linhas[cod] = (num_br(m.group(2)), num_br(m.group(3)), num_br(m.group(4)), num_br(m.group(5)))
                break
        if len(linhas) == len(TIPOS):
            break
    ate = None
    m = re.search(r"at[eé]\s+(\d{2})/(\d{2})/(\d{4})", trecho[:1500], re.I)
    if m:
        try:
            ate = dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            ate = None
    return {"linhas": linhas, "ate": ate}


def conferir(t):
    """5 tipos, valores positivos e participações coerentes (cada lado soma ~50% ou ~100%)"""
    if not t or len(t["linhas"]) != len(TIPOS):
        return False, f"{len(t['linhas']) if t else 0} de {len(TIPOS)} tipos lidos"
    v = t["linhas"].values()
    if any(x is None or x < 0 for row in v for x in row) or any(row[0] <= 0 or row[2] <= 0 for row in v):
        return False, "valor ausente ou negativo"
    sc, sv = sum(r[1] for r in v), sum(r[3] for r in v)
    if 45 <= sc <= 55 and 45 <= sv <= 55:
        return True, "participação por lado ~50% (do volume total)"
    if 95 <= sc <= 105 and 95 <= sv <= 105:
        return True, "participação por lado ~100%"
    return False, f"participações não fecham (compras {sc:.2f}%, vendas {sv:.2f}%)"


def pdf_para_texto(conteudo):
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(conteudo)
        nome = f.name
    try:
        r = subprocess.run(["pdftotext", "-layout", nome, "-"], capture_output=True, text=True, timeout=60)
        return r.stdout
    finally:
        os.unlink(nome)


def dias_uteis_antes(d, n):
    while n > 0:
        d -= dt.timedelta(days=1)
        if d.weekday() < 5:
            n -= 1
    return d


def buscar_bdi(sess, hoje):
    """o BDI mais recente que tenha a tabela; devolve (data do boletim, texto, tabela) ou (None, None, None)"""
    for k in range(0, 8):
        d = hoje - dt.timedelta(days=k)
        if d.weekday() >= 5:
            continue
        ymd, iso = d.strftime("%Y%m%d"), d.isoformat()
        for nome in (f"BDI_02-0_{ymd}.pdf", f"BDI_02_{ymd}.pdf"):
            url = f"{BDI_BASE}/{iso}/{nome}"
            conteudo, st = baixar(sess, url)
            if conteudo is None:
                log(f"  {nome}: {st}")
                continue
            if not conteudo.startswith(b"%PDF"):
                log(f"  {nome}: não é PDF ({len(conteudo)} bytes)")
                continue
            texto = pdf_para_texto(conteudo)
            guardar(f"bdi_{ymd}.txt", texto)
            t = ler_tabela_bdi(texto)
            if t and t["linhas"]:
                log(f"  {nome}: tabela 'Participação dos investidores' encontrada")
                return d, texto, t
            log(f"  {nome}: aberto, mas sem a tabela")
    return None, None, None


# ------------------------------------------------------------ amostra do CSV (estudo; não grava)
def amostra_csv(sess):
    conteudo, st = baixar(sess, CSV_URL)
    if conteudo is None:
        log(f"  Relatório Dados de Mercado (CSV): {st}")
        return
    bruto = conteudo
    formato = "texto"
    try:
        if bruto[:2] == b"PK":
            formato = "zip"
            with zipfile.ZipFile(io.BytesIO(bruto)) as z:
                bruto = z.read(z.namelist()[0])
        else:
            limpo = bruto.strip().strip(b'"')
            if re.fullmatch(rb"[A-Za-z0-9+/=\r\n]{200,}", limpo):
                formato = "base64"
                bruto = base64.b64decode(limpo)
                if bruto[:2] == b"PK":
                    formato = "base64+zip"
                    with zipfile.ZipFile(io.BytesIO(bruto)) as z:
                        bruto = z.read(z.namelist()[0])
    except Exception as e:  # noqa: BLE001
        log(f"  CSV: não consegui abrir ({type(e).__name__})")
    for enc in ("utf-8", "latin-1"):
        try:
            texto = bruto.decode(enc)
            break
        except UnicodeDecodeError:
            texto = None
    guardar("relatorio_dados_de_mercado.bin", conteudo)
    if texto:
        guardar("relatorio_dados_de_mercado.txt", texto)
        tem = "participa" in sa(texto)
        log(f"  Relatório Dados de Mercado (CSV): {len(conteudo)} bytes, formato {formato}; "
            f"{'tem' if tem else 'NÃO tem'} a seção de participação — guardado como amostra (ainda não é gravado)")
    else:
        log(f"  Relatório Dados de Mercado (CSV): {len(conteudo)} bytes, formato {formato}; texto não decodificado — amostra guardada")


# ------------------------------------------------------------ Supabase
def sb():
    url, ch = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not ch:
        raise RuntimeError("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY (Secrets do GitHub).")
    cab = {"apikey": ch, "Content-Type": "application/json"}
    if not ch.startswith("sb_"):
        cab["Authorization"] = f"Bearer {ch}"
    return url.rstrip("/"), cab


def gravar(linhas):
    url, cab = sb()
    r = requests.post(f"{url}/rest/v1/mercado_fluxo_investidores?on_conflict=periodo,data,tipo", json=linhas,
                      headers=dict(cab, Prefer="resolution=merge-duplicates,return=minimal"), timeout=60)
    if r.status_code == 404:
        raise RuntimeError("tabela mercado_fluxo_investidores não existe: rode o SQL 124 no Supabase")
    if r.status_code >= 300:
        raise RuntimeError(f"gravação recusada: {r.status_code} {r.text[:200]}")


def main():
    hoje = dt.date.fromisoformat(os.environ["FLUXO_HOJE"]) if os.environ.get("FLUXO_HOJE") else dt.date.today()
    log(f"SOLIDUNS — Fluxo dos investidores na B3 v{VERSAO} — {dt.datetime.now():%d/%m/%Y %H:%M} (UTC do servidor)")
    sess = requests.Session()
    sess.headers.update({"User-Agent": UA, "Accept-Language": "pt-BR"})
    d, texto, t = buscar_bdi(sess, hoje)
    try:
        amostra_csv(sess)
    except Exception as e:  # noqa: BLE001 — a amostra nunca derruba a leitura principal
        log(f"  CSV: erro {type(e).__name__}")
    if not t:
        log("RESULTADO: nenhum BDI com a tabela nos últimos 7 dias — nada gravado (o site continua 'em implantação').")
        return gravar_resumo()
    ok, motivo = conferir(t)
    log(f"Conferência: {'OK' if ok else 'FALHOU'} — {motivo}")
    if not ok:
        log("RESULTADO: leitura NÃO gravada (a amostra do texto ficou no artefato para correção).")
        return gravar_resumo()
    ate = t["ate"] or dias_uteis_antes(d, 2)
    mes = ate.replace(day=1)
    soma = sum(r[1] + r[3] for r in t["linhas"].values())
    linhas = []
    for cod, (c, pc, v, pv) in t["linhas"].items():
        part = round((pc + pv) * 100 / soma, 2) if soma else None     # participação no volume total (compra + venda)
        linhas.append({"periodo": "mes", "data": mes.isoformat(), "tipo": cod, "compras": round(c * 1000, 2),
                       "vendas": round(v * 1000, 2), "saldo": round((c - v) * 1000, 2), "participacao": part,
                       "referencia_ate": ate.isoformat(), "fonte": FONTE,
                       "coletado_em": dt.datetime.now(dt.timezone.utc).isoformat()})
        log(f"  {cod:16s} compras R$ {c * 1000 / 1e9:9.2f} bi | vendas R$ {v * 1000 / 1e9:9.2f} bi | "
            f"saldo R$ {(c - v) * 1000 / 1e9:+8.2f} bi | participação {part:5.2f}%")
    if "--sem-gravar" in sys.argv:
        log("(--sem-gravar: nada enviado ao banco)")
    else:
        gravar(linhas)
        log(f"RESULTADO: gravado o acumulado de {mes:%m/%Y} até {ate:%d/%m/%Y} (BDI de {d:%d/%m/%Y}).")
    return gravar_resumo()


def gravar_resumo(extra=""):
    destino = os.environ.get("GITHUB_STEP_SUMMARY")
    if destino:
        with open(destino, "a", encoding="utf-8") as f:
            f.write("## Fluxo dos investidores na B3\n\n```\n" + "\n".join(relatorio + ([extra] if extra else [])) + "\n```\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        gravar_resumo(f"ERRO: {type(e).__name__}: {str(e)[:300]}")
        raise
