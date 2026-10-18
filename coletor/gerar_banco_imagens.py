#!/usr/bin/env python3
"""gerar_banco_imagens.py v1.0 — SOLIDUNS / Valor e Mercado — BANCO DE IMAGENS PRÓPRIO (18/10/2026).

Pedido do Thiago (18/10 14h43): banco de imagens próprio para variar a foto da manchete sem depender sempre de uma API.
Gera UMA VEZ cada cena de coletor/dados/banco_imagens_cenas.json com o FLUX.2 [pro] (Black Forest Labs), recorta em 16:9,
grava no Storage do Supabase (bucket público vm-imagens, pasta banco/<tema>/) e cataloga em public.vm_banco_imagens (SQL 161).
Cena já catalogada é pulada: rodar de novo só completa o que falta (e as cenas novas que entrarem no arquivo).

Regras: só cenas genéricas (sem pessoas reais, logomarcas, textos ou fatos reais). Crédito no site: "Imagem ilustrativa".
Chaves só em variáveis de ambiente (segredos do GitHub): BFL_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY. Nenhuma no código.

Variáveis opcionais:
  BANCO_MAX       quantas imagens gerar nesta rodada (padrão 300; teste: 3)
  BANCO_TEMAS     só estes temas (ex.: "petroleo,juros"); vazio = todos
  BANCO_GRAVAR    "0" = gera e salva só no disco do robô (artefato), sem gravar no Supabase
  BANCO_MODELO    endpoint da BFL (padrão flux-2-pro)
  BANCO_PARALELO  quantas ao mesmo tempo (padrão 3)
Custo de referência: ~US$ 0,03 a 0,05 por imagem (1920x1072) -> 300 imagens ~US$ 10 a 15.
"""
import io, json, os, sys, time, concurrent.futures as cf
import requests
from PIL import Image

VERSAO = "1.0"
AQUI = os.path.dirname(os.path.abspath(__file__))
CENAS = os.path.join(AQUI, "dados", "banco_imagens_cenas.json")
BFL = os.environ.get("BFL_URL", "https://api.bfl.ai/v1")
MODELO = os.environ.get("BANCO_MODELO", "flux-2-pro")
W, H = 1920, 1072                       # múltiplos de 16, ~16:9 (recorte final 1880x1058 e 1200x675)
BUCKET = "vm-imagens"
SAIDA = os.environ.get("BANCO_SAIDA", "banco_imagens_saida")


def env(nome, obrig=True):
    v = (os.environ.get(nome) or "").strip()
    if obrig and not v:
        sys.exit(f"ERRO: falta a variável {nome} (segredo do GitHub).")
    return v


def cab_sb(chave, extra=None):
    h = {"apikey": chave, "Content-Type": "application/json"}
    if not chave.startswith("sb_"):
        h["Authorization"] = f"Bearer {chave}"
    h.update(extra or {})
    return h


def ja_catalogadas(url, chave):
    r = requests.get(f"{url}/rest/v1/vm_banco_imagens?select=id&limit=5000", headers=cab_sb(chave), timeout=60)
    if r.status_code == 404:
        sys.exit("ERRO: tabela vm_banco_imagens não existe — rode a SQL 161 no Supabase antes.")
    r.raise_for_status()
    return {x["id"] for x in r.json()}


def gerar(chave_bfl, prompt, sessao=requests):
    """Pede a imagem à BFL e espera ficar pronta. Devolve os bytes da imagem."""
    cab = {"accept": "application/json", "x-key": chave_bfl, "Content-Type": "application/json"}
    r = sessao.post(f"{BFL}/{MODELO}", headers=cab, json={"prompt": prompt, "width": W, "height": H, "output_format": "jpeg",
                                                          "safety_tolerance": 2}, timeout=60)
    if r.status_code == 402:
        raise RuntimeError("SEM_CREDITO: a conta da BFL está sem crédito")
    if r.status_code in (401, 403):
        raise RuntimeError("CHAVE_RECUSADA: confira o segredo BFL_API_KEY")
    r.raise_for_status()
    j = r.json()
    poll = j.get("polling_url")
    if not poll:
        raise RuntimeError(f"resposta sem polling_url: {str(j)[:200]}")
    for _ in range(240):                         # até ~2 min
        time.sleep(0.5 if _ < 20 else 1.0)
        p = sessao.get(poll, headers={"accept": "application/json", "x-key": chave_bfl}, timeout=30)
        p.raise_for_status()
        d = p.json()
        st = d.get("status")
        if st == "Ready":
            url = ((d.get("result") or {}).get("sample")) or ""
            if not url.startswith("https://"):
                raise RuntimeError("imagem pronta sem endereço")
            img = sessao.get(url, timeout=60)            # o endereço vale 10 min: baixa na hora
            img.raise_for_status()
            return img.content
        if st in ("Error", "Failed", "Content Moderated", "Request Moderated"):
            raise RuntimeError(f"geração recusada/falhou: {st}")
    raise RuntimeError("tempo esgotado esperando a imagem")


def recortar(dados):
    """Recorta em 16:9 (centro) e devolve (jpg 1880x1058, jpg 1200x675)."""
    im = Image.open(io.BytesIO(dados)).convert("RGB")
    alvo = 16 / 9
    w, h = im.size
    if w / h > alvo:
        nw = int(h * alvo); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / alvo); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    saidas = []
    for tam, q in (((1880, 1058), 84), ((1200, 675), 82)):
        b = io.BytesIO()
        im.resize(tam, Image.LANCZOS).save(b, "JPEG", quality=q, optimize=True, progressive=True)
        saidas.append(b.getvalue())
    return saidas


def enviar_storage(url, chave, caminho, dados):
    r = requests.post(f"{url}/storage/v1/object/{BUCKET}/{caminho}", data=dados, timeout=120,
                      headers={**{k: v for k, v in cab_sb(chave).items() if k != "Content-Type"},
                               "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "max-age=31536000"})
    if not r.ok:
        raise RuntimeError(f"Storage recusou {caminho} ({r.status_code}): {r.text[:200]}")
    return f"{url}/storage/v1/object/public/{BUCKET}/{caminho}"


def catalogar(url, chave, linha):
    r = requests.post(f"{url}/rest/v1/vm_banco_imagens?on_conflict=id", json=[linha], timeout=60,
                      headers=cab_sb(chave, {"Prefer": "resolution=merge-duplicates,return=minimal"}))
    if not r.ok:
        raise RuntimeError(f"catálogo recusou {linha['id']} ({r.status_code}): {r.text[:200]}")


def main():
    chave_bfl = env("BFL_API_KEY")
    gravar = os.environ.get("BANCO_GRAVAR", "1") != "0"
    url = env("SUPABASE_URL", gravar).rstrip("/")
    chave_sb = env("SUPABASE_SERVICE_KEY", gravar)
    maximo = int(os.environ.get("BANCO_MAX", "300") or 300)
    temas = {t.strip() for t in (os.environ.get("BANCO_TEMAS") or "").split(",") if t.strip()}
    paralelo = max(1, min(6, int(os.environ.get("BANCO_PARALELO", "3") or 3)))

    cenas = json.load(open(CENAS, encoding="utf-8"))["cenas"]
    if temas:
        cenas = [c for c in cenas if c["tema"] in temas]
    feitas = ja_catalogadas(url, chave_sb) if gravar else set()
    fila = [c for c in cenas if c["id"] not in feitas][:maximo]
    print(f"Banco de imagens v{VERSAO} — modelo {MODELO} — {len(cenas)} cenas, {len(feitas)} já no banco, {len(fila)} a gerar agora"
          + ("" if gravar else " (TESTE: não grava no Supabase)"), flush=True)
    os.makedirs(SAIDA, exist_ok=True)
    ok, erros, parar = 0, [], False

    def uma(c):
        dados = gerar(chave_bfl, c["prompt"])
        grande, media = recortar(dados)
        if not gravar:
            open(os.path.join(SAIDA, c["id"] + ".jpg"), "wb").write(media)
            return c["id"], "salva no artefato"
        base = f"banco/{c['tema']}/{c['id']}"
        src_g = enviar_storage(url, chave_sb, base + "-1880.jpg", grande)
        src = enviar_storage(url, chave_sb, base + "-1200.jpg", media)
        catalogar(url, chave_sb, {"id": c["id"], "tema": c["tema"], "palavras": c["palavras"], "prompt": c["prompt"],
                                  "alt": c["alt"], "src": src, "src_grande": src_g, "modelo": MODELO})
        if ok < 6:                                         # amostras para conferir no artefato
            open(os.path.join(SAIDA, c["id"] + ".jpg"), "wb").write(media)
        return c["id"], src

    with cf.ThreadPoolExecutor(paralelo) as ex:
        futuros = {}
        it = iter(fila)
        for c in [next(it, None) for _ in range(paralelo)]:
            if c: futuros[ex.submit(uma, c)] = c
        while futuros:
            pronto = next(cf.as_completed(futuros))
            c = futuros.pop(pronto)
            try:
                cid, onde = pronto.result(); ok += 1
                print(f"  OK {cid} -> {onde}", flush=True)
            except Exception as e:
                msg = str(e); erros.append(f"{c['id']}: {msg}")
                print(f"  FALHOU {c['id']}: {msg}", flush=True)
                if msg.startswith(("SEM_CREDITO", "CHAVE_RECUSADA")):
                    parar = True
            if not parar:
                n = next(it, None)
                if n: futuros[ex.submit(uma, n)] = n
    print(f"Fim: {ok} imagens geradas, {len(erros)} falhas" + (" — PAROU: " + erros[-1] if parar else ""), flush=True)
    json.dump({"geradas": ok, "falhas": erros}, open(os.path.join(SAIDA, "resumo.json"), "w"), ensure_ascii=False, indent=1)
    if parar or (fila and ok == 0):
        sys.exit(1)


if __name__ == "__main__":
    main()
