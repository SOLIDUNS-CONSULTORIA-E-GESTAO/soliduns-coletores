# Teste do coletor "cvm-documentos" com CVM (consulta do dia e dados abertos) e banco simulados.
import json, os, subprocess, threading, time, urllib.request, io, zipfile, datetime as dt
from http.server import BaseHTTPRequestHandler, HTTPServer
F = []
def ok(c, m):
    print(("  ok  " if c else "  FALHA ") + m)
    if not c: F.append(m)
HOJE = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()
H = HOJE.strftime("%d/%m/%Y")
def reg(cod, emp, cat, tipo, esp, ent, seq, ver, prot, assunto=""):
    return "$&".join([cod, emp, cat, tipo, "<spanOrder>" + esp + "</spanOrder>", H, ent, "1", "Ativo", "1",
                      f"<i onclick=\"OpenDownloadDocumentos('{seq}','{ver}','{prot}','IPE')\"></i>", assunto])
DADOS = "&*".join([reg("009512", "PETROLEO BRASILEIRO S.A. PETROBRAS", "Fato Relevante", "", "Reajuste de preços", H + " 18:42", "111", "1", "1234567", "Reajuste do diesel"),
                   reg("004170", "VALE S.A.", "Comunicado ao Mercado", "", "Esclarecimentos", H + " 09:05", "222", "1", "7654321"),
                   reg("019348", "ITAU UNIBANCO HOLDING S.A.", "Assembleia", "AGE", "Edital", H + " 10:00", "333", "1", "9999999"),
                   reg("080000", "JPMORGAN CHASE & CO.", "Comunicado ao Mercado", "", "424B2", H + " 07:34", "444", "1", "4444444", "424B2"),
                   reg("080002", "GOLDMAN SACHS GROUP INC.", "Aviso aos Acionistas", "", "Dividendo", H + " 09:34", "666", "1", "6666660", "Dividendo"),
                   reg("080001", "ASML HOLDING NV", "Comunicado ao Mercado", "", "6-K", H + " 07:35", "555", "1", "5555550", "6-K"),
                   "lixo$&sem campos"])
VERIF = {"https://www.rad.cvm.gov.br/ENET": True, "https://dados.cvm.gov.br": True}
modo = {"enet": "ok"}; gravado, coletas, pedidos = [], [], []
def zip_ipe():
    csv = "CNPJ_Companhia;Nome_Companhia;Codigo_CVM;Data_Referencia;Categoria;Tipo;Especie;Assunto;Data_Entrega;Tipo_Apresentacao;Protocolo_Entrega;Versao;Link_Download\n"
    csv += f"x;GERDAU S.A.;003980;{HOJE};Fato Relevante;;Recompra;Programa de recompra;{HOJE};AP;001;1;https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&numSequencia=5&numVersao=1&numProtocolo=5555555&descTipo=IPE&CodigoInstituicao=1\n"
    csv += f"x;ANTIGA S.A.;1;2026-01-02;Fato Relevante;;X;Y;2026-01-02;AP;002;1;https://x.cvm/2\n"
    b = io.BytesIO(); z = zipfile.ZipFile(b, "w"); z.writestr(f"ipe_cia_aberta_{HOJE.year}.csv", csv.encode("latin1")); z.close(); return b.getvalue()
class S(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def env(self, out, ct="application/json", code=200, extra=None):
        b = out if isinstance(out, bytes) else json.dumps(out).encode()
        self.send_response(code); self.send_header("Content-Type", ct)
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        pedidos.append(("GET", self.path))
        if self.path.startswith("/rest/v1/fontes_noticia"):
            return self.env([{"id": 31 if "rad" in u else 32, "nome": "CVM", "url": u, "verificada_em": "2026-10-15T12:00:00Z" if v else None, "situacao": "ativa"} for u, v in VERIF.items()])
        if self.path.startswith("/ENETWeb/frmConsultaExternaCVM.aspx"): return self.env(b"<html>", "text/html", 200, {"Set-Cookie": "ASP.NET_SessionId=abc; path=/"})
        if self.path.startswith("/ENET/frmConsultaExternaCVM.aspx"): return self.env(b"<html>", "text/html")
        if self.path.startswith("/ipe/"): return self.env(zip_ipe(), "application/zip")
        self.env({}, code=404)
    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])) or b"{}")
        pedidos.append(("POST", self.path, corpo, self.headers.get("Cookie")))
        if self.path.endswith("/ListarDocumentos"):
            if modo["enet"] == "captcha": return self.env({"d": {"temErro": True, "msgErro": "Captcha inválido"}})
            return self.env({"d": {"dados": DADOS, "temErro": False}})
        if "vm_achados" in self.path: gravado.append((self.path, self.headers.get("Prefer"), corpo))
        elif "vm_coletas" in self.path: coletas.append(corpo)
        self.env({}, code=201)
srv = HTTPServer(("127.0.0.1", 0), S); threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_port}"
deno = "/tmp/claude-0/sp/denoi/node_modules/.bin/deno"; aqui = os.path.dirname(os.path.abspath(__file__))
env = dict(os.environ, COLETOR_TOKEN="tok", SUPABASE_URL=base, SUPABASE_SERVICE_ROLE_KEY="sb_secret_T",
           VM_ENET_BASES=f"{base}/ENETWeb/frmConsultaExternaCVM.aspx,{base}/ENET/frmConsultaExternaCVM.aspx", VM_IPE_BASE=base + "/ipe",
           NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost", DENO_NO_UPDATE_CHECK="1")
p = subprocess.Popen([deno, "run", "--allow-net", "--allow-env", "--allow-read", aqui + "/lancar.ts", "file://" + os.path.join(aqui, "../functions/cvm-documentos/index.ts"), "8772"], env=env,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def chamar(corpo, tok="tok"):
    r = urllib.request.Request("http://127.0.0.1:8772", data=json.dumps(corpo).encode(), method="POST", headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(r, timeout=60).read())
    except urllib.error.HTTPError as e: return {"_status": e.code, **json.loads(e.read() or b"{}")}
try:
    for _ in range(80):
        try: chamar({}, "x"); break
        except Exception: time.sleep(0.5)
    ok(chamar({}, "x").get("_status") == 401, "sem token -> 401")
    r = chamar({"so_teste": True}); print("   ", json.dumps(r, ensure_ascii=False)[:500])
    ok(r["via"] == "consulta_do_dia" and r["lidos"] == 6 and r["relevantes"] == 2 and r["descartados_estrangeiros"] == 3, "consulta do dia: 6 lidos, 2 relevantes (assembleia, 2 formulários SEC e 1 dividendo de estrangeiros ficam de fora; linha inválida descartada)")
    post = [x for x in pedidos if x[0] == "POST" and x[1].endswith("/ListarDocumentos")][0]
    ok(post[2]["categoria"] == "IPE_-1_-1_-1" and post[2]["dataAte"] == H and post[3] and "ASP.NET_SessionId=abc" in post[3], "consulta com as datas de hoje/ontem e o cookie da sessão")
    ok(any("PETROLEO BRASILEIRO S.A. PETROBRAS — Fato Relevante: Reajuste do diesel" in a for a in r["amostra"]), "título: empresa — categoria: assunto")
    ok(not gravado, "so_teste não grava")
    chamar({})
    ach = gravado[-1][2]
    ok("on_conflict=link" in gravado[-1][0] and "ignore-duplicates" in gravado[-1][1] and len(ach) == 2, "grava 2 achados (idempotente pelo link)")
    pe = [a for a in ach if a["titulo"].startswith("PETROLEO")][0]
    ok(pe["camada"] == "livre" and pe["fonte_id"] == 31 and pe["fonte_nome"] == "CVM" and "numProtocolo=1234567" in pe["link"] and pe["publicado_em"].endswith("21:42:00.000Z"), "achado: camada livre, crédito CVM, link do documento, hora de Brasília convertida")
    ok("o texto está no documento" in pe["resumo"] and "Reajuste" in pe["resumo"], "resumo só com os dados do protocolo (sem copiar o documento)")
    modo["enet"] = "captcha"; gravado.clear()
    r2 = chamar({})
    ok(r2["via"] == "dados_abertos" and r2["relevantes"] == 1 and any("captcha" in n.lower() for n in r2["notas"]), "consulta recusada (captcha) -> cai nos dados abertos")
    ok(gravado and gravado[-1][2][0]["fonte_id"] == 32 and gravado[-1][2][0]["titulo"].startswith("GERDAU S.A. — Fato Relevante"), "dados abertos: só a janela recente; crédito ao portal de dados abertos")
    VERIF["https://www.rad.cvm.gov.br/ENET"] = False; VERIF["https://dados.cvm.gov.br"] = False
    r3 = chamar({"so_teste": True})
    ok(r3.get("_status") == 502 and r3["via"] == "nenhuma" and sum("aguardando conferência" in n for n in r3["notas"]) == 2, "sem conferência manual: nenhuma via roda")
    ok(coletas and coletas[-1][0]["coletor"] == "cvm-documentos", "registra a execução em vm_coletas")
finally:
    p.terminate()
print("TUDO OK" if not F else "FALHAS: " + str(F))
