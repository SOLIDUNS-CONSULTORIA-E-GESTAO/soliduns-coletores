"""Testes offline do noticias_emissores (CVM IPE, SEC, imprensa) — python3 coletor/testes/t_noticias_emissores.py"""
import io, json, os, sys, zipfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import noticias_emissores as N

ok = 0
def confere(c, msg):
    global ok
    assert c, msg
    ok += 1

# --- dublês
IPE = "CNPJ_Companhia;Nome_Companhia;Codigo_CVM;Data_Referencia;Categoria;Tipo;Especie;Assunto;Data_Entrega;Tipo_Apresentacao;Protocolo_Entrega;Versao;Link_Download\n" \
      "33.000.167/0001-01;PETROLEO BRASILEIRO S.A. PETROBRAS;9512;2026-10-10;Fato Relevante;;;Reajuste do diesel;2026-10-10;AP;123;1;https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&numProtocolo=1\n" \
      "33.000.167/0001-01;PETROLEO BRASILEIRO S.A. PETROBRAS;9512;2026-10-11;Formulário de Referência;;;FRE;2026-10-11;AP;124;1;https://x/fre\n" \
      "33.592.510/0001-54;VALE S.A.;4170;2020-01-01;Fato Relevante;;;Antigo;2020-01-02;AP;1;1;https://x/antigo\n"
zb = io.BytesIO()
with zipfile.ZipFile(zb, "w") as z:
    z.writestr("ipe_cia_aberta_2026.csv", IPE.encode("latin-1"))
SEC_T = {"fields": ["cik", "name", "ticker", "exchange"], "data": [[320193, "Apple Inc.", "AAPL", "Nasdaq"]]}
SEC_S = {"filings": {"recent": {"form": ["8-K", "4", "10-Q"], "filingDate": ["2026-10-01", "2026-10-02", "2026-09-01"],
         "accessionNumber": ["0000320193-26-000100", "x", "0000320193-26-000080"], "primaryDocument": ["a8k.htm", "f4.xml", "a10q.htm"],
         "items": ["2.02,9.01", "", ""]}}}
ACHADOS = [{"titulo": "Petrobras reduz preço do diesel", "link": "https://ab/1", "publicado_em": "2026-10-12T10:00:00Z", "coletado_em": "2026-10-12T10:00:00Z", "fonte_nome": "Agência Brasil"},
           {"titulo": "Apple apresenta novo iPhone", "link": "https://ab/2", "publicado_em": "2026-10-03T10:00:00Z", "coletado_em": "2026-10-03T10:00:00Z", "fonte_nome": "Agência Brasil"},
           {"titulo": "Quando vale a pena trocar de banco", "link": "https://ab/3", "publicado_em": "2026-10-03T10:00:00Z", "coletado_em": "2026-10-03T10:00:00Z", "fonte_nome": "Agência Brasil"}]

class R:
    def __init__(s, code, content=b"", j=None): s.status_code, s.content, s._j, s.headers = code, content, j, {}
    def json(s): return s._j
def falso_get(url, headers=None, timeout=None):
    if "ipe_cia_aberta_2026" in url: return R(200, zb.getvalue())
    if "ipe_cia_aberta" in url: return R(404)
    if url == N.SEC_TICKERS: return R(200, j=SEC_T)
    if "submissions" in url: return R(200, j=SEC_S)
    raise AssertionError(url)
N.requests.get = falso_get
N.time.sleep = lambda s: None
def falso_todos(c, passo=1000):
    if c.startswith("relatorios_analise"): return [{"acao": "PETR4", "mercado": "br"}, {"acao": "VALE3", "mercado": "br"}, {"acao": "AAPL", "mercado": "us"}]
    if c.startswith("fundamentos_br"): return [{"ticker": "PETR4", "cnpj": "33.000.167/0001-01", "empresa": "Petrobras"}, {"ticker": "PETR3", "cnpj": "33.000.167/0001-01", "empresa": "Petrobras"},
                                                {"ticker": "VALE3", "cnpj": "33.592.510/0001-54", "empresa": "Vale"}]
    if c.startswith("vm_achados") and "ilike.*CVM*" in c and "not.ilike" not in c: return []
    if c.startswith("vm_achados"): return ACHADOS
    raise AssertionError(c)
N.sb_todos = falso_todos
gravadas = []
N.sb_gravar = lambda l: gravadas.extend(l) or len(l)
N.sb_registrar = lambda *a, **k: None
os.environ["EMISSORES_DIAS"] = "60"
import datetime as dt
class D(dt.date):
    @classmethod
    def today(cls): return dt.date(2026, 10, 17)
N.dt.date = D
os.environ["EMISSORES_INFOMONEY"] = "0"
N.main()
emi = [g for g in gravadas if g["origem"] == "emissor"]
imp = [g for g in gravadas if g["origem"] == "imprensa"]
confere(any(g["ticker"] == "PETR4" and g["categoria"] == "Fato relevante" and "Reajuste" in g["titulo"] for g in emi), "fato relevante da Petrobras")
confere(not any("PETR3" == g["ticker"] for g in gravadas), "PETR3 não tem relatório: fica de fora")
confere(not any("fre" in g["link"] for g in gravadas), "Formulário de Referência não entra")
confere(not any("antigo" in g["link"] for g in gravadas), "documento fora da janela não entra")
a8k = [g for g in emi if g["ticker"] == "AAPL" and g["categoria"] == "8-K"]
confere(a8k and "resultados do período" in a8k[0]["titulo"] and a8k[0]["link"].endswith("/000032019326000100/a8k.htm"), "8-K da Apple traduzido com link")
confere(not any(g["categoria"] == "4" for g in emi), "formulário 4 (insider) não entra")
confere(any(g["ticker"] == "AAPL" and g["categoria"] == "10-Q" for g in emi), "10-Q dentro da janela entra")
confere(any(g["ticker"] == "PETR4" and "diesel" in g["titulo"] for g in imp), "imprensa: Petrobras citada")
confere(any(g["ticker"] == "AAPL" and "iPhone" in g["titulo"] for g in imp), "imprensa: Apple citada")
confere(not any(g["ticker"] == "VALE3" for g in imp), "'vale a pena' não vira Vale")
print(f"OK — {ok} conferências")

# --- v1.1: InfoMoney (páginas até passar da janela)
import types
fake = types.SimpleNamespace(UA="x", PORTEIRO=types.SimpleNamespace(esperar=lambda u: True, resposta=lambda *a: None))
sys.modules["educado"] = fake
def rss(itens): return ("<rss><channel>" + "".join(f"<item><title>{t}</title><link>{l}</link><pubDate>{d}</pubDate></item>" for t, l, d in itens) + "</channel></rss>").encode()
PAGS = {1: rss([("Petrobras anuncia dividendos", "https://im/1", "Sat, 17 Oct 2026 18:00:00 +0000"), ("Ibovespa sobe", "https://im/2", "Sat, 17 Oct 2026 17:00:00 +0000")]),
        2: rss([("Vale corta produção", "https://im/3", "Fri, 16 Oct 2026 12:00:00 +0000"), ("Velha", "https://im/4", "Mon, 12 Oct 2026 12:00:00 +0000")]),
        3: rss([("Nunca lida", "https://im/5", "Sun, 11 Oct 2026 12:00:00 +0000")])}
pedidos = []
def get_im(url, headers=None, timeout=None):
    n = int(url.split("paged=")[1]); pedidos.append(n); return R(200, PAGS[n])
N.requests.get = get_im
it = N.ler_infomoney("2026-10-15T00:00:00+00:00", 10)
confere([x["link"] for x in it] == ["https://im/1", "https://im/2", "https://im/3"], "InfoMoney: só dentro da janela")
confere(pedidos == [1, 2], "InfoMoney: para na página que passa da janela")
confere(all(x["fonte_nome"] == "InfoMoney" for x in it), "InfoMoney: crédito")
print(f"OK — {ok} conferências (com InfoMoney)")
