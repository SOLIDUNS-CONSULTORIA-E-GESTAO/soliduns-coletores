"""Teste do gerar_banco_imagens.py com BFL e Supabase simulados (rodar: python3 coletor/testes/t_banco_imagens.py)."""
import io, json, os, sys, tempfile
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import gerar_banco_imagens as g

falhas = 0
def ok(c, n):
    global falhas
    print(("OK  " if c else "FALHOU ") + n); falhas += 0 if c else 1

class R:
    def __init__(s, status=200, j=None, content=b"", text=""):
        s.status_code, s._j, s.content, s.text = status, j, content, text or json.dumps(j or {})
    ok = property(lambda s: s.status_code < 400)
    def json(s): return s._j
    def raise_for_status(s):
        if s.status_code >= 400: raise RuntimeError(f"HTTP {s.status_code}")

img = io.BytesIO(); Image.new("RGB", (1920, 1072), (30, 60, 90)).save(img, "JPEG"); IMG = img.getvalue()
estado = {"storage": {}, "catalogo": {"petroleo-01": 1}, "polls": 0, "pedidos": [], "credito": True}
def post(url, headers=None, json=None, data=None, timeout=None):
    if "api.bfl" in url:
        estado["pedidos"].append((url, json, headers.get("x-key")))
        if not estado["credito"]: return R(402)
        return R(200, {"id": "x", "polling_url": "https://api.bfl.ai/v1/get_result?id=x"})
    if "/storage/v1/object/" in url:
        estado["storage"][url.split("/object/")[1]] = (headers.get("Content-Type"), len(data)); return R(200, {})
    if "/rest/v1/vm_banco_imagens" in url:
        for l in json: estado["catalogo"][l["id"]] = l
        return R(201, {})
    return R(404)
def get(url, headers=None, timeout=None):
    if "get_result" in url:
        estado["polls"] += 1
        return R(200, {"status": "Pending"}) if estado["polls"] % 2 else R(200, {"status": "Ready", "result": {"sample": "https://delivery.eu1.bfl.ai/a.jpg"}})
    if "delivery" in url: return R(200, content=IMG)
    if "/rest/v1/vm_banco_imagens" in url: return R(200, [{"id": k} for k in estado["catalogo"]])
    return R(404)
g.requests.post, g.requests.get = post, get
g.time.sleep = lambda s: None
os.environ.update({"BFL_API_KEY": "chave-bfl-teste", "SUPABASE_URL": "https://sb.test", "SUPABASE_SERVICE_KEY": "sb_secret_x",
                   "BANCO_MAX": "3", "BANCO_TEMAS": "petroleo", "BANCO_PARALELO": "2"})
g.SAIDA = tempfile.mkdtemp()
g.main()
ids = [k for k in estado["catalogo"] if k != "petroleo-01"]
ok(ids == ["petroleo-02", "petroleo-03", "petroleo-04"] or sorted(ids) == ["petroleo-02", "petroleo-03", "petroleo-04"], "pula a cena já catalogada e gera 3: " + str(ids))
l = estado["catalogo"]["petroleo-02"]
ok(l["src"] == "https://sb.test/storage/v1/object/public/vm-imagens/banco/petroleo/petroleo-02-1200.jpg", "endereço público 1200: " + l["src"])
ok(l["src_grande"].endswith("petroleo-02-1880.jpg"), "endereço público 1880")
ok(all(v[0] == "image/jpeg" for v in estado["storage"].values()) and len(estado["storage"]) == 6, "6 arquivos jpg no Storage")
ok(all(p[0] == "https://api.bfl.ai/v1/flux-2-pro" and p[1]["width"] == 1920 and p[1]["height"] == 1072 and p[2] == "chave-bfl-teste" for p in estado["pedidos"]), "pedido à BFL: endpoint, tamanho e chave")
ok("No text" in estado["pedidos"][0][1]["prompt"] and "no identifiable faces" in estado["pedidos"][0][1]["prompt"], "prompt traz as proibições")
g1, g2 = g.recortar(IMG)
ok(Image.open(io.BytesIO(g1)).size == (1880, 1058) and Image.open(io.BytesIO(g2)).size == (1200, 675), "recorte 1880x1058 e 1200x675")
# sem crédito: para e sai com erro
estado["credito"] = False; os.environ["BANCO_TEMAS"] = "juros"
try: g.main(); ok(False, "sem crédito deveria parar")
except SystemExit as e: ok(e.code == 1, "sem crédito: para com erro (não gasta à toa)")
cenas = json.load(open(g.CENAS))["cenas"]
ok(len(cenas) == 300 and len({c["id"] for c in cenas}) == 300, "300 cenas com id único")
ok(all(c["alt"] and len(c["alt"]) <= 300 and c["palavras"] for c in cenas), "toda cena tem alt e palavras")
print("FALHAS:", falhas); sys.exit(1 if falhas else 0)
