# Teste do handler "calendario-oficial" com banco, IBGE e BLS simulados.
import json, os, subprocess, threading, time, urllib.request, datetime as dt
from http.server import BaseHTTPRequestHandler, HTTPServer
F = []
def ok(c, m):
    print(("  ok  " if c else "  FALHA ") + m)
    if not c: F.append(m)
HOJE = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()
def br(d): return d.strftime("%d/%m/%Y")
VERIF = {"https://servicodados.ibge.gov.br/api/v3": True, "https://www.bls.gov": True, "https://www.federalreserve.gov": False,
         "https://www.bcb.gov.br/controleinflacao/copom": True, "https://www.bcb.gov.br/publicacoes/focus": True}
gravado, coletas, pedidos = [], [], []
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def env(self, out, ct="application/json", code=200):
        b = out if isinstance(out, bytes) else json.dumps(out).encode()
        self.send_response(code); self.send_header("Content-Type", ct); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        pedidos.append((self.path, self.headers.get("User-Agent")))
        if self.path.startswith("/rest/v1/fontes_noticia"):
            return self.env([{"url": u, "verificada_em": "2026-10-15T12:00:00Z" if v else None, "situacao": "ativa"} for u, v in VERIF.items()])
        if self.path.startswith("/ibge"):
            return self.env({"items": [{"nome_produto": "Pesquisa Mensal de Serviços", "data_divulgacao": br(HOJE) + " 09:00:00", "tipo_release": "Divulgação"},
                                       {"nome_produto": "Fora da janela", "data_divulgacao": "01/01/2030 09:00:00"}]})
        if self.path.startswith("/bls.ics"):
            d = HOJE.strftime("%Y%m%d")
            return self.env(("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=US-Eastern:%sT083000\r\nSUMMARY:Consumer Price Index for September 2026\r\nEND:VEVENT\r\n"
                             "BEGIN:VEVENT\r\nDTSTART;TZID=US-Eastern:%sT100000\r\nSUMMARY:Metropolitan Area Employment\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n" % (d, d)).encode(), "text/calendar")
        self.env({}, code=404)
    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if "vm_agenda" in self.path: gravado.append((self.path, self.headers.get("Prefer"), corpo))
        elif "vm_coletas" in self.path: coletas.append(corpo)
        self.env({}, code=201)
srv = HTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_port}"
deno = "/tmp/claude-0/sp/denoi/node_modules/.bin/deno"; aqui = os.path.dirname(os.path.abspath(__file__))
env = dict(os.environ, COLETOR_TOKEN="tok", SUPABASE_URL=base, SUPABASE_SERVICE_ROLE_KEY="sb_secret_T", VM_IBGE_URL=base + "/ibge/", VM_BLS_URL=base + "/bls.ics",
           NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost", DENO_NO_UPDATE_CHECK="1")
p = subprocess.Popen([deno, "run", "--allow-net", "--allow-env", "--allow-read", aqui + "/lancar.ts", "file://" + os.path.join(aqui, "../functions/calendario-oficial/index.ts"), "8771"], env=env,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try: urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8771", data=b"{}", method="POST")); break
        except urllib.error.HTTPError: break
        except Exception: time.sleep(0.5)
    def chamar(corpo, tok="tok"):
        r = urllib.request.Request("http://127.0.0.1:8771", data=json.dumps(corpo).encode(), method="POST", headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
        try: return json.loads(urllib.request.urlopen(r).read())
        except urllib.error.HTTPError as e: return {"_status": e.code, **json.loads(e.read() or b"{}")}
    ok(chamar({}, "x").get("_status") == 401, "sem token -> 401")
    r = chamar({"so_teste": True, "dias": 7}); print("   ", json.dumps(r, ensure_ascii=False)[:600])
    ok(not gravado and not coletas, "so_teste não grava")
    ok(any("Fed" in n or "fed" in n for n in r["notas"]) and not any("FOMC" in a for a in r["amostra"]), "fonte sem conferência manual (Fed) não roda")
    ok(any("IBGE: Pesquisa Mensal de Serviços" in a and "09h00" in a for a in r["amostra"]), "IBGE na agenda de hoje")
    ok(any("CPI: inflação ao consumidor dos EUA (BLS)" in a and "09h30" in a for a in r["amostra"]) and not any("Metropolitan" in a for a in r["amostra"]), "BLS: CPI às 9h30 de Brasília; divulgação irrelevante fica de fora")
    ok(any("SOLIDUNS" in (ua or "") for pth, ua in pedidos if pth.startswith("/bls")), "identifica-se ao BLS (User-Agent)")
    r2 = chamar({"dias": 7})
    ok(len(gravado) == 1 and "on_conflict=chave" in gravado[0][0] and "merge-duplicates" in gravado[0][1], "grava em vm_agenda (idempotente)")
    ok(all(x["origem"] == "calendario_oficial" for x in gravado[0][2]) and len(gravado[0][2]) == r2["itens"], "origem calendario_oficial: %d itens" % r2["itens"])
    ok(coletas and coletas[-1][0]["coletor"] == "calendario-oficial" and coletas[-1][0]["situacao"] == "ok", "registra a execução em vm_coletas")
finally:
    p.terminate()
print("TUDO OK" if not F else "FALHAS: " + str(F))
