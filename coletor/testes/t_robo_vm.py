# Teste do redator Valor e Mercado com Anthropic e Supabase simulados
import json, os, subprocess, sys, threading, copy
from http.server import BaseHTTPRequestHandler, HTTPServer
HOJE = "2026-10-14"
BOM = {"data_referencia": HOJE,
 "manchete": {"cartola": "política monetária", "titulo": "Copom mantém Selic e curva recua 12 pontos-base",
   "linha_fina": "DI janeiro/2027 cai a 14,10% após ata", "corpo": ["P1 com 1,2%.", "P2 com 3 pb.", "P3 com R$ 5,3120."]},
 "scanner": {"pos_fechamento": [{"titulo": "Ásia", "texto": "Nikkei +0,84%."}, {"titulo": "Europa", "texto": "Stoxx -0,10%."}, {"titulo": "STF", "texto": "Julgamento X."}],
   "agenda": [{"hora": "09h00", "evento": "IPCA-15", "consenso": "0,30%"}, {"hora": "15h00", "evento": "Livro Bege", "consenso": ""}],
   "semana": [{"quando": "Quinta (15/10)", "texto": "Varejo"}, {"quando": "Sexta (16/10)", "texto": "IBC-Br"}, {"quando": "Sexta (16/10)", "texto": "Vencimento"}]},
 "fontes": [{"titulo": "A", "url": "https://agenciabrasil.ebc.com.br/a?utm_source=x"}, {"titulo": "B", "url": "https://www.bcb.gov.br/b"}, {"titulo": "C", "url": "https://fed.gov/c/"}, {"titulo": "Inventada", "url": "https://inventado.com/z"}]}
RUIM = copy.deepcopy(BOM); RUIM["manchete"]["corpo"].append("Portanto, o mercado segue."); RUIM["fontes"] = RUIM["fontes"][:1]
CEN = sys.argv[1]; chamadas = []; gravado = []
def resposta(n):
    busca = {"type": "web_search_tool_result", "content": [{"type": "web_search_result", "url": u, "title": "t"} for u in
             ["https://agenciabrasil.ebc.com.br/a", "https://bcb.gov.br/b", "https://fed.gov/c"]]}
    if CEN == "pausa" and n == 0:
        return {"stop_reason": "pause_turn", "content": [busca], "usage": {"input_tokens": 1000, "output_tokens": 10, "server_tool_use": {"web_search_requests": 3}}}
    d = BOM if (CEN in ("pausa", "foto", "unsplash") or (CEN == "corrige" and n >= 1)) else RUIM
    if CEN == "ferramenta":
        d2 = copy.deepcopy(BOM); d2["scanner"]["agenda"] = [{"hora": "15:00", "evento": "Livro Bege"}, {"hora": "Dia todo", "evento": "Reunião do G20"}, {"hora": "às 9h", "evento": "IPCA-15"}]
        return {"stop_reason": "tool_use", "content": [busca, {"type": "text", "text": "Pronto."}, {"type": "tool_use", "id": "t1", "name": "entregar_edicao", "input": d2}],
                "usage": {"input_tokens": 50000, "output_tokens": 3000, "server_tool_use": {"web_search_requests": 5}}}
    return {"stop_reason": "end_turn", "content": [busca, {"type": "text", "text": "```json\n" + json.dumps(d, ensure_ascii=False) + "\n```"}],
            "usage": {"input_tokens": 50000, "output_tokens": 3000, "server_tool_use": {"web_search_requests": 5}}}
FOTOS = {"photos": [
  {"id": 111, "width": 6000, "height": 4000, "alt": "Usada ontem", "photographer": "A", "photographer_url": "https://www.pexels.com/@a", "url": "https://www.pexels.com/photo/111/", "src": {"landscape": "https://images.pexels.com/111-l.jpg", "large2x": "https://images.pexels.com/111-2x.jpg"}},
  {"id": 222, "width": 3000, "height": 4500, "alt": "Retrato", "photographer": "B", "photographer_url": "", "url": "https://www.pexels.com/photo/222/", "src": {"landscape": "https://images.pexels.com/222-l.jpg"}},
  {"id": 333, "width": 5000, "height": 3000, "alt": "Bank building facade", "photographer": "Maria Silva", "photographer_url": "https://www.pexels.com/@maria", "url": "https://www.pexels.com/photo/333/", "src": {"landscape": "https://images.pexels.com/333-l.jpg", "large2x": "https://images.pexels.com/333-2x.jpg"}}]}
UNS = {"results": [
  {"id": "usada1", "width": 6000, "height": 4000, "color": "#222", "urls": {"raw": "https://images.unsplash.com/photo-usada1?ixid=x"}, "user": {"name": "U"}, "links": {"html": "https://unsplash.com/photos/usada1"}},
  {"id": "abc", "width": 6000, "height": 4000, "color": "#2a3c5a", "alt_description": "trading screen with charts",
   "urls": {"raw": "https://images.unsplash.com/photo-abc?ixid=x"}, "user": {"name": "João Souza", "links": {"html": "https://unsplash.com/@joao"}},
   "links": {"html": "https://unsplash.com/photos/abc", "download_location": "BASE/baixou/abc"}}]}
buscas_foto = []
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith("/v1/search"):
            buscas_foto.append((self.path, self.headers.get("Authorization")))
            out = FOTOS if "central+bank" in self.path else {"photos": []}
        elif self.path.startswith("/search/photos"):
            buscas_foto.append((self.path, self.headers.get("Authorization")))
            out = UNS if "stock+exchange" in self.path else {"results": []}
        elif self.path.startswith("/baixou/"):
            buscas_foto.append((self.path, self.headers.get("Authorization"))); out = {}
        elif self.path.startswith("/rest/v1/vm_edicoes"):
            out = [{"conteudo": {"manchete": {"foto": {"id": 111}}}}, {"conteudo": {"manchete": {"foto": {"id": "usada1"}}}}]
        else:
            out = {}
        b = json.dumps(out).encode(); self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path.startswith("/v1/messages"):
            assert any(t.get("name") == "entregar_edicao" for t in corpo["tools"])
            out = resposta(len(chamadas)); chamadas.append(corpo)
        else:
            gravado.append((self.path, corpo)); out = {}
        b = json.dumps(out).encode(); self.send_response(201 if gravado and not self.path.startswith("/v1") else 200)
        self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
srv = HTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_port}"
env = dict(os.environ, ANTHROPIC_URL=base + "/v1/messages", ANTHROPIC_API_KEY="x", SUPABASE_URL=base, SUPABASE_SERVICE_KEY="sb_secret_x", VM_DATA=HOJE)
env.pop("PEXELS_API_KEY", None); env.pop("UNSPLASH_ACCESS_KEY", None)
UNS["results"][1]["links"]["download_location"] = base + "/baixou/abc"
if CEN == "unsplash":
    BOM["manchete"]["foto_busca"] = "stock exchange"
    env.update(UNSPLASH_URL=base, UNSPLASH_ACCESS_KEY="uns-teste")
if CEN == "foto":
    BOM["manchete"]["foto_busca"] = "oil refinery"; BOM["manchete"]["foto_alternativa"] = "central bank building"
    env.update(PEXELS_URL=base + "/v1/search", PEXELS_API_KEY="pex-teste")
p = subprocess.run([sys.executable, "-I", "/home/claude/soliduns-coletores/coletor/redigir_valor_mercado.py"], env=env, capture_output=True, text=True)
print(p.stdout[-900:], p.stderr[-400:])
ok = True
def conf(c, m):
    global ok; print(("PASSA " if c else "FALHA ") + m); ok &= bool(c)
if CEN == "corrige":
    conf(p.returncode == 0 and len(chamadas) == 2, "corrige: 2 chamadas e sucesso")
    conf("portanto" in chamadas[1]["messages"][-1]["content"].lower(), "pedido de correção cita o clichê")
    conf(len(chamadas[1]["messages"]) == 1, "correção numa conversa nova (não reenvia as buscas)")
    conf(any(t.get("type") == "web_search_20250305" and t.get("max_uses") == 4 for t in chamadas[1]["tools"]), "correção de fontes pode buscar (até 4)")
    path, linhas = gravado[0]; l = linhas[0]
    conf("vm_edicoes?on_conflict=data" in path and l["publicado"] is True and l["data"] == HOJE, "grava publicado na data")
    conf([f["url"] for f in l["fontes"]] == ["https://agenciabrasil.ebc.com.br/a", "https://bcb.gov.br/b", "https://fed.gov/c"], "fontes só da busca (inventada fora)")
    conf(l["conteudo"]["manchete"]["cartola"] == "POLÍTICA MONETÁRIA" and "fontes" not in l["conteudo"], "cartola em caixa alta")
if CEN == "ferramenta":
    conf(p.returncode == 0 and len(chamadas) == 1, "ferramenta: entrega numa chamada só")
    ag = gravado[0][1][0]["conteudo"]["scanner"]["agenda"]
    conf([a["hora"] for a in ag] == ["09h00", "15h00", "Dia todo"], "horários padronizados e em ordem: " + str([a["hora"] for a in ag]))
if CEN == "recusa":
    conf(p.returncode != 0 and not gravado and len(chamadas) == 2, "recusa: não publica após 2 falhas")
if CEN == "foto":
    m = gravado[0][1][0]["conteudo"]["manchete"]; f = m.get("foto") or {}
    conf(p.returncode == 0 and f.get("id") == 333, "foto: pula a usada nas últimas edições e a vertical; escolhe 333 -> " + str(f.get("id")))
    conf(f.get("fotografo") == "Maria Silva" and f.get("pagina_url") == "https://www.pexels.com/photo/333/" and f.get("fonte") == "Pexels" and f.get("src").endswith("333-l.jpg"), "foto: crédito, página e endereço guardados")
    conf([b[0].split("query=")[1].split("&")[0] for b in buscas_foto] == ["oil+refinery", "central+bank+building"] and all(b[1] == "pex-teste" for b in buscas_foto), "foto: tenta a busca principal e depois a alternativa, com a chave: " + str(buscas_foto))
    conf(m.get("foto_busca") == "oil refinery", "termos da busca guardados")
if CEN == "unsplash":
    f = gravado[0][1][0]["conteudo"]["manchete"].get("foto") or {}
    conf(p.returncode == 0 and f.get("id") == "abc", "unsplash: pula a foto já usada -> " + str(f.get("id")))
    conf(f.get("src", "").startswith("https://images.unsplash.com/photo-abc?ixid=x&w=1200&h=675&fit=crop") and "w=1880" in f.get("src_grande", ""), "unsplash: foto servida pelo Unsplash, recortada 16:9")
    conf(f.get("fotografo") == "João Souza" and f.get("fonte") == "Unsplash" and "utm_source=" in f.get("fotografo_url", "") and "utm_source=" in f.get("pagina_url", ""), "unsplash: crédito com links e utm")
    conf(any(b[0] == "/baixou/abc" and b[1] == "Client-ID uns-teste" for b in buscas_foto), "unsplash: aviso de uso (download_location) com a chave")
    conf(f.get("alt") == "trading screen with charts" and f.get("cor_media") == "#2a3c5a", "unsplash: texto alternativo e cor")
if CEN == "corrige":
    conf("foto" not in gravado[0][1][0]["conteudo"]["manchete"] and "UNSPLASH_ACCESS_KEY não configurada" in p.stdout, "sem chave de fotos: edição sai sem foto")
    conf(all("tool_choice" not in c for c in chamadas), "nenhuma chamada com ferramenta obrigatória")
if CEN == "pausa":
    conf(p.returncode == 0 and len(chamadas) == 2 and chamadas[1]["messages"][-1]["role"] == "assistant", "pause_turn continua o turno")
    conf(len(gravado) == 1, "grava após pausa")
sys.exit(0 if ok else 1)
