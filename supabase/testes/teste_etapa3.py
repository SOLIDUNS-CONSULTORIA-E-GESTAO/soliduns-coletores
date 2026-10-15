# Teste da Etapa 3: radar-fontes + scanner-do-dia com feeds, Anthropic e PostgREST simulados.
import json, os, subprocess, sys, threading, time, urllib.request, hashlib, datetime as dt, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
HOJE = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date().isoformat()
AGORA = dt.datetime.now(dt.timezone.utc)
rfc = lambda d: d.strftime("%a, %d %b %Y %H:%M:%S +0000")
FEED_LIVRE = f"""<?xml version="1.0"?><rss><channel><title>Agência Brasil</title>
<item><title>Copom mantém Selic em 13,75% ao ano</title><link>https://agenciabrasil.ebc.com.br/economia/selic</link>
<description><![CDATA[<p>O Comitê de Política Monetária manteve a taxa básica em 13,75% ao ano &amp; sinalizou cautela.</p>]]></description>
<pubDate>{rfc(AGORA - dt.timedelta(hours=3))}</pubDate></item>
<item><title>Notícia velha</title><link>https://agenciabrasil.ebc.com.br/economia/velha</link><description>x</description>
<pubDate>{rfc(AGORA - dt.timedelta(days=5))}</pubDate></item></channel></rss>"""
FEED_PAUTA = f"""<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Agência rebaixa nota de empresa X</title>
<link href="https://rating.exemplo/x"/><summary>TEXTO PROTEGIDO DO VEÍCULO QUE NÃO PODE SER GUARDADO</summary><updated>{AGORA.isoformat()}</updated></entry></feed>"""
FONTES = [{"id": 59, "nome": "Agência Brasil", "camada": "livre", "url_coleta": None},
          {"id": 41, "nome": "Fitch Ratings", "camada": "pauta", "url_coleta": None}]
COT = {"SELIC": [{"id": 901, "fonte": "BCB SGS", "codigo": "SELIC", "descricao": "Meta da taxa Selic (Copom)", "data_ref": HOJE, "fechamento": 13.75, "unidade": "% a.a.", "url_fonte": "https://api.bcb.gov.br/x432"}],
       "USD": [{"id": 902, "fonte": "BCB Olinda", "codigo": "USD", "descricao": "Dólar PTAX", "data_ref": HOJE, "fechamento": 5.0441, "unidade": "R$ por US$", "url_fonte": "https://olinda.bcb.gov.br/x"},
               {"id": 903, "fonte": "BCB Olinda", "codigo": "USD", "descricao": "Dólar PTAX", "data_ref": "2026-10-13", "fechamento": 5.0096, "unidade": "R$ por US$", "url_fonte": "https://olinda.bcb.gov.br/x"}]}
B3 = {"2026-10-14": [{"id": 1001, "codigo": "PETR4", "fechamento": 40.0, "volume": 9e8, "url_fonte": "https://b3/COTAHIST_D14102026.ZIP", "fonte": "B3 COTAHIST"},
                     {"id": 1002, "codigo": "VALE3", "fechamento": 57.0, "volume": 7e8, "url_fonte": "https://b3/COTAHIST_D14102026.ZIP", "fonte": "B3 COTAHIST"}],
      "2026-10-13": [{"id": 1, "codigo": "PETR4", "fechamento": 38.45, "volume": 1, "url_fonte": "u", "fonte": "B3 COTAHIST"},
                     {"id": 2, "codigo": "VALE3", "fechamento": 60.0, "volume": 1, "url_fonte": "u", "fonte": "B3 COTAHIST"}]}
achados, materias, coletas, anth, agenda, patches = [], [], [], [], [], []
AG_ANTH = []
MODO = {"resposta": "boa"}
def resposta_agenda():
    busca = {"type": "web_search_tool_result", "content": [{"type": "web_search_result", "url": "https://www.bcb.gov.br/focus", "title": "Focus"},
                                                           {"type": "web_search_result", "url": "https://www.bls.gov/cpi/", "title": "CPI"}]}
    itens = [{"hora": "08:25", "regiao": "br", "categoria": "Banco Central", "evento": "Boletim Focus", "consenso": "", "fonte": "BCB", "url": "https://bcb.gov.br/focus/"},
             {"hora": "às 9h30", "regiao": "us", "categoria": "Agenda EUA", "evento": "CPI de setembro (BLS)", "consenso": "0,3% no mês", "fonte": "BLS", "url": "https://www.bls.gov/cpi/"},
             {"hora": "15h", "regiao": "us", "categoria": "Federal Reserve", "evento": "Fala inventada", "consenso": "", "fonte": "X", "url": "https://inventado.com/x"}]
    return {"content": [busca, {"type": "tool_use", "id": "t1", "name": "entregar_agenda", "input": {"itens": itens}}],
            "usage": {"input_tokens": 40000, "output_tokens": 2000, "server_tool_use": {"web_search_requests": 6}}, "stop_reason": "tool_use"}
def resposta_ia():
    if MODO["resposta"] == "boa":
        g = {"chapeu": "Scanner", "titulo": "Copom mantém Selic em 13,75% e dólar fecha a R$ 5,0441",
             "linha_fina": "Petrobras sobe 4,03% no último pregão com volume de R$ 900 milhões, enquanto a Vale recua 5,00%; a PTAX do dólar avança sobre o fechamento de 13 de outubro",
             "paragrafos": ["O Comitê de Política Monetária manteve a Selic em 13,75% ao ano, segundo a Agência Brasil.",
                            "A PTAX do dólar fechou a R$ 5,0441, de acordo com o Banco Central. PETR4 subiu 4,03% e VALE3 caiu 5,00%, segundo a B3."],
             "editoria_sugerida": "Mercados", "tags": ["Selic"],
             "referencias": [{"numero": "13,75", "identificador": "cot:901"}, {"numero": "5,0441", "identificador": "cot:902"},
                             {"numero": "4,03", "identificador": "cot:1001"}, {"numero": "5,00", "identificador": "cot:1002"},
                             {"numero": "900", "identificador": "cot:1001"}]}
    else:
        g = {"chapeu": "Scanner", "titulo": "Dólar dispara a R$ 5,10 em meio a incertezas.", "linha_fina": "curta",
             "paragrafos": ["O dólar disparou a R$ 5,10. A inflação ficou em [verificar valor]."],
             "referencias": [{"numero": "5,10", "identificador": "cot:902"}, {"numero": "1", "identificador": "cot:999"}]}
    t = json.dumps(g, ensure_ascii=False)
    if MODO["resposta"] == "cerca": t = "```json\n" + t + "\n```"
    if MODO["resposta"] == "cerca":   # caminho antigo (texto), ainda aceito
        return {"content": [{"type": "text", "text": t}], "usage": {"input_tokens": 9000, "output_tokens": 900}, "stop_reason": "end_turn"}
    return {"content": [{"type": "tool_use", "id": "e1", "name": "entregar_edicao", "input": g}],
            "usage": {"input_tokens": 9000, "output_tokens": 900}, "stop_reason": "tool_use"}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def resp(self, code, body, ct="application/json"):
        b = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", ct); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query); p = u.path
        if p == "/feed/livre.xml": return self.resp(200, FEED_LIVRE.encode(), "application/rss+xml")
        if p == "/feed/pauta.xml": return self.resp(200, FEED_PAUTA.encode(), "application/atom+xml")
        if p == "/rest/v1/fontes_noticia":
            if q.get("verificada_em") == ["is.null"]: return self.resp(200, [{"id": i} for i in range(57)])
            return self.resp(200, FONTES)
        if p == "/rest/v1/cotacoes":
            if q.get("select") == ["data_ref"]:
                return self.resp(200, [{"data_ref": "2026-10-13"}] if "data_ref" in q and q["data_ref"][0].startswith("lt.") else [{"data_ref": "2026-10-14"}])
            if "codigo" in q: return self.resp(200, COT.get(q["codigo"][0].split(".", 1)[1], []))
            d = q["data_ref"][0].split(".", 1)[1]; return self.resp(200, B3.get(d, []))
        if p == "/rest/v1/vm_achados": return self.resp(200, [dict(a, id=i + 1) for i, a in enumerate(achados)])
        if p == "/rest/v1/vm_materias": return self.resp(200, [{"gerado": materias[0]["gerado"]}] if materias else [])
        if p == "/rest/v1/vm_agenda": return self.resp(200, [dict(a, id=100 + i) for i, a in enumerate(agenda)])
        self.resp(404, {"p": p})
    def do_DELETE(self): self.resp(204, b"")
    def do_PATCH(self):
        patches.append((self.path, json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
        for m in materias:
            if m["situacao"] == "publicada" and "situacao=eq.publicada" in self.path: m["situacao"] = "substituida"
        self.resp(204, b"")
    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        p = urllib.parse.urlparse(self.path).path
        if p == "/v1/messages":
            if any(t.get("name") == "entregar_agenda" for t in corpo.get("tools", [])):
                AG_ANTH.append(corpo); return self.resp(200, resposta_agenda())
            anth.append(corpo); return self.resp(200, resposta_ia())
        if p == "/rest/v1/vm_agenda":
            assert "on_conflict=chave" in self.path and "merge-duplicates" in self.headers["Prefer"]
            for a in corpo:
                if not any(x["chave"] == a["chave"] for x in agenda): agenda.append(a)
            return self.resp(201, b"")
        if p == "/rest/v1/vm_achados":
            assert "ignore-duplicates" in self.headers["Prefer"]
            for a in corpo:
                if not any(x["link"] == a["link"] for x in achados): achados.append(a)
            return self.resp(201, b"")
        if p == "/rest/v1/vm_coletas": coletas.extend(corpo); return self.resp(201, b"")
        if p == "/rest/v1/vm_materias":
            for m in corpo: materias.append(dict(m, id=len(materias) + 1))
            return self.resp(201, [{"id": len(materias)}])
        self.resp(404, {"p": p})
srv = HTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_port}"
FONTES[0]["url_coleta"] = base + "/feed/livre.xml"; FONTES[1]["url_coleta"] = base + "/feed/pauta.xml"
deno = "/tmp/claude-0/sp/denoi/node_modules/.bin/deno"
env = dict(os.environ, COLETOR_TOKEN="tok", SUPABASE_URL=base, SUPABASE_SERVICE_ROLE_KEY="sb_secret_T", ANTHROPIC_API_KEY="sk-teste",
           VM_ANTHROPIC_URL=base + "/v1/messages", NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost")
fn = "/home/claude/soliduns-coletores/supabase/functions/"
procs = [subprocess.Popen([deno, "run", "--allow-net", "--allow-env", "--allow-read", "/home/claude/v120/t_etapa3/lancar.ts", "file://" + fn + nome + "/index.ts", str(pt)], env=env,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) for nome, pt in (("radar-fontes", 8701), ("scanner-do-dia", 8702), ("agenda-do-dia", 8703))]
F = []
def ok(c, m):
    print(("  ok  " if c else "  FALHA ") + m, flush=True)
    if not c: F.append(m)
def chamar(pt, corpo, token="tok"):
    rq = urllib.request.Request(f"http://127.0.0.1:{pt}/", data=json.dumps(corpo).encode(), method="POST",
                                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try: r = urllib.request.urlopen(rq, timeout=90); return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read())
try:
    for pt in (8701, 8702, 8703):
        for _ in range(90):
            try: urllib.request.urlopen(f"http://127.0.0.1:{pt}/", timeout=1)
            except urllib.error.HTTPError: break
            except Exception: time.sleep(1)
    print("== radar", flush=True)
    ok(chamar(8701, {}, "x")[0] == 401, "radar: sem token -> 401")
    st, j = chamar(8701, {}); print("   ", json.dumps(j, ensure_ascii=False)[:300])
    ok(st == 200 and j["fontes_aguardando_conferencia"] == 57, "radar: lê só fontes conferidas e informa as que aguardam conferência")
    livre = [a for a in achados if a["camada"] == "livre"]; pauta = [a for a in achados if a["camada"] == "pauta"]
    ok(len(livre) == 1 and livre[0]["resumo"].startswith("O Comitê de Política Monetária manteve a taxa básica em 13,75% ao ano & sinalizou"), "livre: título + resumo do feed (HTML e entidades limpos), notícia de 5 dias fora")
    ok(len(pauta) == 1 and pauta[0]["resumo"] is None and pauta[0]["link"] == "https://rating.exemplo/x", "pauta: só título e link — o texto do veículo NÃO é guardado")
    n = len(achados); chamar(8701, {}); ok(len(achados) == n, "radar idempotente (link único)")
    ok(coletas and coletas[-1]["coletor"] == "radar-fontes" and coletas[-1]["situacao"] == "ok", "radar registra a execução em vm_coletas")
    print("== agenda", flush=True)
    ok(chamar(8703, {}, "x")[0] == 401, "agenda: sem token -> 401")
    st, j = chamar(8703, {}); print("   ", json.dumps(j, ensure_ascii=False)[:300])
    a = AG_ANTH[-1]
    ok(any(t.get("type") == "web_search_20250305" for t in a["tools"]) and a["model"] == "claude-sonnet-5-5", "agenda: Sonnet com busca na web")
    ok(st == 200 and len(agenda) == 2 and {x["evento"] for x in agenda} == {"Boletim Focus", "CPI de setembro (BLS)"}, "agenda: grava itens com link vindo da busca; o inventado fica de fora")
    ok(sorted(x["hora"] for x in agenda) == ["08h25", "09h30"] and all(x["origem"] == "pesquisa_web" for x in agenda), "agenda: horário padronizado e origem pesquisa_web")
    ok(next(x for x in agenda if x["evento"] == "Boletim Focus")["consenso"] is None and next(x for x in agenda if "CPI" in x["evento"])["consenso"] == "0,3% no mês", "agenda: consenso só quando a fonte traz")
    ok(any("Fala inventada" in d and "não veio da busca" in d for d in j.get("descartados", [])), "agenda: informa o item descartado")
    n = len(agenda); chamar(8703, {}); ok(len(agenda) == n, "agenda idempotente (chave única)")
    agenda.append({"data_ref": HOJE, "hora": "08h25", "regiao": "br", "categoria": "Banco Central", "evento": "Focus (calendário oficial)", "consenso": None,
                   "fonte": "BCB", "url": "https://www.bcb.gov.br/focus", "origem": "calendario_oficial", "chave": "x"})
    print("== scanner", flush=True)
    ok(chamar(8702, {}, "x")[0] == 401, "scanner: sem token -> 401")
    st, j = chamar(8702, {}); print("   ", json.dumps({k: v for k, v in j.items() if k != "rascunho"}, ensure_ascii=False)[:400])
    sistema = open("/tmp/claude-0/sp/sistema_v1.txt", encoding="utf-8").read()
    a = anth[-1]
    ok(a["system"] == sistema, "instrução de sistema IGUAL ao prompt-sistema-agente.txt (abaixo da linha)")
    ok([t.get("name") for t in a.get("tools", [])] == ["entregar_edicao"] and a.get("tool_choice", {}).get("type") == "auto" and "entregar_edicao" in a["messages"][0]["content"] and a["model"] == "claude-sonnet-5-5", "Sonnet, sem busca na web: só a ferramenta de entrega (entregar_edicao), pedida na mensagem")
    msg = a["messages"][0]["content"]
    ok("TEXTO PROTEGIDO" not in msg and "Agência rebaixa nota de empresa X" in msg, "contexto: pauta só com o assunto (texto do veículo fora)")
    ok("ag:" in msg and "CPI de setembro (BLS)" in msg and "Focus (calendário oficial)" in msg and '"evento":"Boletim Focus"' not in msg, "contexto: agenda do dia, com o calendário oficial na frente da pesquisa")
    ok("cot:901" in msg and "ach:1" in msg and '"variacao_percentual":4.03' in msg and '"variacao_percentual":-5' in msg, "contexto: indicadores, achados livres e variações da B3 com id")
    m = materias[-1]
    ok(st == 200 and m["situacao"] == "publicada" and m["publicacao_automatica"] is True and m["texto_aprovado"]["titulo"] == m["gerado"]["titulo"], "publica automaticamente (decisão do Thiago), com o texto gerado")
    ok(m["prompt_versao"] == "1.0" and m["prompt_sha256"] == hashlib.sha256(sistema.encode()).hexdigest() and m["modelo"] == "claude-sonnet-5-5", "guarda modelo, versão e impressão digital do prompt")
    ok(m["verificacao_ok"] is True, "texto bom passa na verificação: " + str([c for c in m["verificacoes"] if not c["ok"]]))
    ok({f["id"] for f in m["fontes"]} >= {"cot:901", "cot:902", "cot:1001"} and all(f["url"].startswith("http") for f in m["fontes"]), "fontes resolvidas com endereço da consulta")
    ok(m["contexto"]["indicadores"] and m["custo_usd"] > 0 and m["tokens_entrada"] == 9000, "contexto e custo guardados")
    MODO["resposta"] = "ruim"; st, j = chamar(8702, {}); m = materias[-1]
    falhas = {c["checagem"]: c["detalhe"] for c in m["verificacoes"] if not c["ok"]}; print("   reprovações:", json.dumps(falhas, ensure_ascii=False)[:500])
    ok(m["situacao"] == "publicada" and m["verificacao_ok"] is False and materias[-2]["situacao"] == "substituida", "verificação só registra; o novo Scanner substitui o anterior do dia")
    ok({"referencias_existem", "valores_conferem", "lacunas", "vocabulario_vetado", "forma"} <= set(falhas), "aponta referência inexistente, valor divergente, lacuna, vocabulário vetado e forma")
    MODO["resposta"] = "cerca"; st, j = chamar(8702, {"devolvida": 1, "instrucao": "Destaque o dólar no título"}); m = materias[-1]
    ok(st == 200 and m["origem_id"] == 1 and m["instrucao_extra"] == "Destaque o dólar no título", "nova geração pedida pelo editor guarda a origem e a instrução")
    ok("INSTRUÇÃO DO EDITOR" in anth[-1]["messages"][0]["content"] and "Copom mantém Selic" in anth[-1]["messages"][0]["content"], "a instrução e a versão anterior vão ao agente")
    n = len(materias); st, j = chamar(8702, {"so_teste": True}); ok(st == 200 and len(materias) == n and j.get("rascunho"), "so_teste não grava")
finally:
    for p in procs: p.kill()
print("TUDO OK" if not F else "FALHAS: " + str(F))
