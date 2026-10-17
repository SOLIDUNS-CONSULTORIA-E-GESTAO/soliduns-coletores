import sys, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import educado as E
hits = {}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        port = self.server.server_port
        hits.setdefault(port, []).append((time.time(), self.path))
        if self.path == "/robots.txt":
            body = b"User-agent: *\nDisallow: /proibido\nCrawl-delay: 3\n" if port == P1 else b"User-agent: *\nDisallow:\n"
            self.send_response(200); self.send_header("Content-Type", "text/plain"); self.end_headers(); self.wfile.write(body); return
        if self.path == "/limite":
            self.send_response(429); self.send_header("Retry-After", "2"); self.end_headers(); return
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
s1 = ThreadingHTTPServer(("127.0.0.1", 0), H); s2 = ThreadingHTTPServer(("127.0.0.1", 0), H)
P1, P2 = s1.server_port, s2.server_port
for s in (s1, s2): threading.Thread(target=s.serve_forever, daemon=True).start()
import requests
pt = E.Porteiro(intervalo=1)
falhas = 0
def ok(c, m):
    global falhas; print(("OK  " if c else "FALHOU ") + m); falhas += (not c)
u1, u2 = f"http://127.0.0.1:{P1}", f"http://127.0.0.1:{P2}"
ok(not pt.esperar(u1 + "/proibido/x"), "robots.txt proíbe: não abre")
t0 = time.time()
def pega(u):
    if pt.esperar(u): r = requests.get(u); pt.resposta(u, r.status_code, r.headers)
th = [threading.Thread(target=pega, args=(u,)) for u in [u1 + "/a", u1 + "/b", u2 + "/a", u2 + "/b"]]
[t.start() for t in th]; [t.join() for t in th]
g1 = [t for t, p in hits[P1] if p != "/robots.txt"]; g2 = [t for t, p in hits[P2] if p != "/robots.txt"]
ok(len(g1) == 2 and g1[1] - g1[0] >= 2.9, f"Crawl-delay 3 s respeitado no site 1 ({g1[1]-g1[0]:.1f} s)")
ok(len(g2) == 2 and 0.9 <= g2[1] - g2[0] < 2.5, f"intervalo mínimo 1 s no site 2 ({g2[1]-g2[0]:.1f} s)")
ok(time.time() - t0 < 9, f"sites diferentes em paralelo ({time.time()-t0:.1f} s no total)")
for i in range(3): pega(u2 + "/limite")
ok(pt.fora(u2 + "/x") and not pt.esperar(u2 + "/x"), "3 respostas 429: site sai da rodada")
lim = [t for t, p in hits[P2] if p == "/limite"]
ok(lim[1] - lim[0] >= 1.9, f"Retry-After 2 s respeitado ({lim[1]-lim[0]:.1f} s)")
ok("20 s" in E.UA and "contato@" in E.UA, "robô se identifica")
print("TUDO OK" if not falhas else f"{falhas} FALHA(S)")
