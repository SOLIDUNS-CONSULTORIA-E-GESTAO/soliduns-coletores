# Teste da Edge Function coletor-fechamento: B3, BCB e PostgREST simulados; leitura do COTAHIST comparada com o robô atual.
import io, json, os, subprocess, sys, threading, time, zipfile, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
sys.path.insert(0, "/home/claude/soliduns-coletores/coletor")
import coletar_cotahist as CH

def reg(codbdi, tk, preco_ult, data="20261014", tpmerc="010", fat=1, nome="EMPRESA"):
    def n(v, w): return str(int(round(v * 100))).zfill(w)
    l = ("01" + data + codbdi + tk.ljust(12) + tpmerc + nome.ljust(12)[:12] + "ON  NM".ljust(10) + "   " + "R$  "
         + n(preco_ult * 0.99, 13) + n(preco_ult * 1.02, 13) + n(preco_ult * 0.97, 13) + n(preco_ult, 13) + n(preco_ult, 13)
         + n(preco_ult, 13) + n(preco_ult, 13) + "01234" + "000000000000123400" + n(1234567.89, 18)
         + "0" * 13 + "0" + "00000000" + str(fat).zfill(7) + "0" * 13 + "BRPETRACNPR6" + "123")
    assert len(l) == 245, len(l)
    return l
LINHAS = [reg("02", "PETR4", 38.45), reg("14", "BOVA11", 204.12, nome="ISHARES BOVA"), reg("12", "HGLG11", 160.5),
          reg("02", "VALE3", 61.2), reg("96", "PETR4F", 38.4), reg("02", "PETRJ400", 1.2, tpmerc="070"),
          reg("02", "ABCD3", 4520.0, fat=1000)]
arq = "00COTAHIST.2026BOVESPA 20261014".ljust(245) + "\n" + "\n".join(LINHAS) + "\n" + "99COTAHIST.2026".ljust(245) + "\n"
zb = io.BytesIO(); zf = zipfile.ZipFile(zb, "w"); zf.writestr("COTAHIST_D14102026.TXT", arq.encode("latin1")); zf.close()
ZIP = zb.getvalue()
SGS = {432: [{"data": "13/10/2026", "valor": "15.00"}, {"data": "14/10/2026", "valor": "15.00"}, {"data": "04/11/2099", "valor": "15.00"}],
       4389: [{"data": "14/10/2026", "valor": "14.90"}], 433: [{"data": "01/09/2026", "valor": "0.48"}]}
PTAX = {"USD": [{"cotacaoCompra": 5.0, "cotacaoVenda": 5.0096, "dataHoraCotacao": "2026-10-13 13:09:00.0", "tipoBoletim": "Fechamento"},
                {"cotacaoCompra": 5.03, "cotacaoVenda": 5.0310, "dataHoraCotacao": "2026-10-14 10:04:00.0", "tipoBoletim": "Abertura"},
                {"cotacaoCompra": 5.03, "cotacaoVenda": 5.0402, "dataHoraCotacao": "2026-10-14 13:05:00.0", "tipoBoletim": "Fechamento"}],
        "EUR": [{"cotacaoCompra": 5.6, "cotacaoVenda": 5.6092, "dataHoraCotacao": "2026-10-13 13:09:00.0", "tipoBoletim": "Fechamento"}]}
gravado, pedidos = [], []
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def resp(self, code, body, ct="application/json"):
        self.send_response(code); self.send_header("Content-Type", ct); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        p = self.path; pedidos.append(p)
        if p.startswith("/SerHist/COTAHIST_D14102026.ZIP"): return self.resp(200, ZIP, "application/zip")
        if p.startswith("/SerHist/"): return self.resp(404, b"nao")
        if p.startswith("/sgs/bcdata.sgs."):
            n = int(p.split("bcdata.sgs.")[1].split("/")[0])
            assert "/dados?formato=json&dataInicial=" in p and "&dataFinal=" in p, p      # v1.3: por intervalo de datas
            if n == 4389 and not any("ERRO_CDI" in x for x in pedidos):    # 1ª vez: página de erro (como o BCB fez em 14/10)
                pedidos.append("ERRO_CDI"); return self.resp(200, b"<html>erro</html>", "text/html")
            return self.resp(200, json.dumps(SGS[n]).encode())
        if p.startswith("/olinda/"):
            m = "USD" if "%27USD%27" in p else "EUR"; return self.resp(200, json.dumps({"value": PTAX[m]}).encode())
        if p.startswith("/rest/v1/cotacoes?select=data_ref"): return self.resp(200, b'[{"data_ref":"2026-10-13"}]')
        self.resp(404, b"?")
    def do_POST(self):
        corpo = self.rfile.read(int(self.headers["Content-Length"]))
        if self.path.startswith("/rest/v1/cotacoes?on_conflict=fonte,codigo,data_ref"):
            assert self.headers.get("apikey") == "sb_secret_TESTE" and "merge-duplicates" in self.headers.get("Prefer")
            lote = json.loads(corpo)
            if len({tuple(sorted(o)) for o in lote}) > 1:              # regra real do PostgREST (PGRST102)
                return self.resp(400, b'{"code":"PGRST102","message":"All object keys must match"}')
            gravado.extend(lote); return self.resp(201, b"")
        self.resp(404, b"?")
srv = HTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_port}"
env = dict(os.environ, COLETOR_TOKEN="tok-teste", SUPABASE_URL=base, SUPABASE_SERVICE_ROLE_KEY="sb_secret_TESTE",
           VM_B3_BASE=base + "/SerHist", VM_SGS_BASE=base + "/sgs", VM_OLINDA_BASE=base + "/olinda", PORT="8765")
deno = "/tmp/claude-0/sp/denoi/node_modules/.bin/deno"
fn = "/home/claude/soliduns-coletores/supabase/functions/coletor-fechamento/index.ts"
print("fixtures prontas", flush=True)
proc = subprocess.Popen([deno, "run", "--allow-net", "--allow-env", fn], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
F = []
def ok(c, m):
    print(("  ok  " if c else "  FALHA ") + m)
    if not c: F.append(m)
def chamar(corpo, token="tok-teste"):
    rq = urllib.request.Request("http://127.0.0.1:8000/", data=json.dumps(corpo).encode(), method="POST",
                                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        r = urllib.request.urlopen(rq, timeout=60); return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())
try:
    for _ in range(120):
        try: urllib.request.urlopen("http://127.0.0.1:8000/", timeout=1)
        except urllib.error.HTTPError: break
        except Exception: time.sleep(1)
    print("servidor no ar", flush=True)
    st, j = chamar({}, token="errado"); ok(st == 401, "sem o token certo: 401")
    st, j = chamar({}); print("   resumo:", json.dumps({k: v for k, v in j.items() if k != "amostra"}, ensure_ascii=False))
    ok(st == 200 and j.get("gravadas") == len(gravado), "execução normal grava")
    b3 = [g for g in gravado if g["fonte"] == "B3 COTAHIST"]
    ok(sorted(g["codigo"] for g in b3) == ["ABCD3", "BOVA11", "HGLG11", "PETR4", "VALE3"], "B3: só à vista 010 e CODBDI 02/12/14: " + str(sorted(g["codigo"] for g in b3)))
    # mesma leitura do robô atual (coletar_cotahist.ler_linha) para as ações
    for l in LINHAS:
        py = CH.ler_linha(l)
        if not py: continue
        ts = next(g for g in b3 if g["codigo"] == py["ticker"])
        ok(all(abs(ts[a] - py[b]) < 1e-6 for a, b in [("abertura", "abertura"), ("maxima", "maxima"), ("minima", "minima"), ("fechamento", "fechamento"), ("volume", "volume_fin")]) and ts["negocios"] == py["negocios"] and ts["data_ref"] == py["data"],
           f"{py['ticker']}: igual ao robô atual (fechamento {ts['fechamento']})")
    ok(next(g for g in b3 if g["codigo"] == "ABCD3")["fechamento"] == 4.52, "fator de cotação aplicado (ABCD3 4520/1000 = 4,52)")
    ok(all(g["url_fonte"].endswith("COTAHIST_D14102026.ZIP") and g["coletado_em"] for g in b3), "B3: endereço e hora da coleta em cada registro")
    ok(any("/SerHist/COTAHIST_D14102026.ZIP" in p for p in pedidos) and not any("13102026" in p for p in pedidos), "só baixa pregões que faltam (último gravado 13/10)")
    usd = [g for g in gravado if g["codigo"] == "USD"]
    ok(sorted((g["data_ref"], g["fechamento"]) for g in usd) == [("2026-10-13", 5.0096), ("2026-10-14", 5.0402)], "PTAX: só boletim de FECHAMENTO (abertura descartada)")
    ok({g["codigo"] for g in gravado if g["fonte"] == "BCB SGS"} == {"SELIC", "CDI", "IPCA"}, "SGS: Selic, CDI e IPCA (CDI recuperado após resposta ilegível)")
    ok(len({tuple(sorted(g)) for g in gravado}) == 1, "todas as linhas com o mesmo conjunto de campos (PGRST102)")
    ok(next(g for g in gravado if g["codigo"] == "IPCA")["data_ref"] == "2026-09-01", "IPCA na data do mês (dd/mm/aaaa -> aaaa-mm-dd)")
    ok(all(g["unidade"] for g in gravado), "unidade em todos os registros")
    ok(max(g["data_ref"] for g in gravado) <= __import__("datetime").date.today().isoformat(), "nada com data futura (meta Selic vem até o próximo Copom)")
    sgs_urls = [p for p in pedidos if p.startswith("/sgs/")]
    ok(any("bcdata.sgs.433/dados?formato=json&dataInicial=" in p for p in sgs_urls) and not any("ultimos" in p for p in sgs_urls), "SGS pedido por intervalo de datas até hoje")
    n = len(gravado); st, j = chamar({"so_teste": True})
    ok(st == 200 and len(gravado) == n and j.get("amostra"), "so_teste: confere e não grava")
    st, j = chamar({"data": "2026-10-12"}); ok("2026-10-12: arquivo ainda não publicado" in j.get("b3", []), "pregão sem arquivo: avisa e segue (" + str(j.get("b3")) + ")")
finally:
    proc.kill()
    try: out = proc.communicate(timeout=5)[0].decode()[-600:]
    except Exception: out = ""
    if F: print(out)
print("TUDO OK" if not F else "FALHAS: " + str(F))
