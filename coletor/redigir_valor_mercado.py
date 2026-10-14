"""
SOLIDUNS — Jornal "Valor e Mercado" — redator diário por IA — v1.0 (14/10/2026)

Todo dia às 06h30 de Brasília (valor-e-mercado.yml) escreve a edição do dia da capa do jornal
(página pública #/noticias da SOLIDUNS):
  - MANCHETE DE CAPA: cartola, título, linha fina e corpo (3 a 4 parágrafos, pirâmide invertida);
  - SCANNER DO DIA: pós-fechamento (desde as 18h de ontem), agenda de hoje (horário de Brasília e
    consenso) e perspectiva para o resto da semana.
A IA (Anthropic, com busca na web) apura e escreve; este programa confere o resultado e grava em
public.vm_edicoes (SQL 133) com publicado = true (PUBLICAÇÃO AUTOMÁTICA, decisão do Thiago em 14/10).

Travas antes de publicar (se falhar, tenta corrigir 1 vez; se falhar de novo, NÃO publica e a
capa continua com a edição anterior):
  - JSON completo (todos os blocos), corpo com 3 a 4 parágrafos, agenda com horário;
  - data de referência = hoje;
  - nenhum clichê proibido e nenhuma recomendação de investimento;
  - no mínimo 3 fontes, e só endereços que a busca realmente devolveu (nada de link inventado).

Secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY.
Opcionais: VM_MODELO (padrão claude-sonnet-5-5; reserva claude-sonnet-4-5), VM_BUSCAS (padrão 8),
VM_SO_TESTE=1 (escreve e confere, mas não grava). ANTHROPIC_URL troca o endereço (testes).
Tirar do ar a edição do dia (SQL Editor):  update public.vm_edicoes set publicado = false where data = current_date;
"""
import datetime as dt
import json
import os
import re
import sys
import time
import unicodedata

import requests

MODELO = os.environ.get("VM_MODELO") or "claude-sonnet-5-5"
RESERVA = os.environ.get("VM_MODELO_RESERVA") or "claude-sonnet-4-5"
try:                                   # variável VM_BUSCAS do GitHub: 1 a 20 (inválida -> 8)
    BUSCAS = max(1, min(20, int(str(os.environ.get("VM_BUSCAS") or "8").strip())))
except ValueError:
    BUSCAS = 8
ANTHROPIC_URL = os.environ.get("ANTHROPIC_URL") or "https://api.anthropic.com/v1/messages"
# preço aproximado por milhão de tokens (US$) — só para o registro de custo
PRECO_ENT, PRECO_SAI, PRECO_BUSCA = 3.0, 15.0, 0.01

BRT = dt.timezone(dt.timedelta(hours=-3))
DIAS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
         "outubro", "novembro", "dezembro"]

CLICHES = ["em suma", "por fim", "vale destacar", "vale ressaltar", "é importante lembrar", "é importante destacar",
           "portanto", "uma jornada", "mergulhar de cabeça", "um olhar atento", "em resumo", "em conclusão",
           "nesse sentido", "cenário desafiador", "impressionante"]
RECOMENDACAO = ["recomendamos", "recomenda-se", "nossa recomendação", "vale a pena comprar", "hora de comprar",
                "hora de vender", "aproveite para comprar", "compre ", "venda já"]


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def data_extenso(d):
    return f"{DIAS[d.weekday()]}, {d.day} de {MESES[d.month - 1]} de {d.year}"


def instrucoes(hoje):
    return f"""Você é um jornalista de economia sênior e analista macroeconômico com passagens pelas principais redações financeiras globais (Bloomberg, Valor Econômico e Financial Times). Sua tarefa é produzir de forma autônoma o conteúdo editorial do dia para a home do portal "Valor e Mercado".

[MATRIZ DE COMPETÊNCIAS TÉCNICAS REQUERIDAS]
Aplique conhecimentos avançados em:
1. História e precedentes econômicos: contextualize os movimentos de mercado e as crises contemporâneas com análises comparativas com ciclos econômicos passados, grandes choques de oferta, reformas monetárias históricas e a evolução das instituições financeiras globais.
2. Direito brasileiro e internacional: impactos jurídicos e regulatórios sobre os mercados, incluindo jurisprudência do STF, andamento de PECs e projetos de lei, direito tributário e administrativo, arbitragens internacionais, tratados comerciais e marcos regulatórios globais.
3. Geopolítica e ciência política: conexão entre conflitos internacionais, eleições, decisões de comércio exterior, risco soberano e mudanças regulatórias domésticas.
4. Matemática financeira e estatística: leitura precisa de taxas de juros (curva de juros, cupom cambial), volatilidade, inflação e amostragem de dados econômicos.
5. Contabilidade e contabilidade pública: balanços corporativos (Ebitda, alavancagem, DFP) e contas públicas (regras fiscais, resultado primário, dívida bruta/líquida, caixa do Tesouro).
6. Geografia econômica: logística de commodities, gargalos em cadeias globais de suprimento, infraestrutura portuária e demografia industrial.

[DATA DE REFERÊNCIA]
Hoje é {data_extenso(hoje)} ({hoje.isoformat()}). Toda a análise considera este dia. Ignore os fatos de edições anteriores: busque informação estritamente nova, das últimas 24 horas de mercado e dos fatos previstos para hoje. Use a ferramenta de busca na web para apurar TUDO; não escreva nenhum número, horário ou fato que não tenha encontrado na busca de hoje.

[RESTRIÇÕES RÍGIDAS DE ESTILO]
1. Proibido usar muletas e clichês: "em suma", "por fim", "vale destacar", "é importante lembrar", "portanto", "uma jornada", "mergulhar de cabeça", "um olhar atento", "em resumo", "nesse sentido".
2. Nada de parágrafo conclusivo moralista, otimista ou que "resuma o aprendizado". Termine com o último dado relevante, como faz o jornalismo profissional de negócios.
3. Voz ativa e alta densidade de dados por parágrafo (números, porcentagens, pontos-base, tickers).
4. Nada de adjetivos vazios ("uma alta impressionante"): use precisão numérica ("uma alta de 2,4 pontos percentuais").
5. Jornalismo, não consultoria: NUNCA recomende comprar, vender ou manter ativos.
6. Números no padrão brasileiro: vírgula decimal, câmbio com 4 casas, percentuais com 2 casas, variação com sinal, índices em pontos.

[O QUE ENTREGAR]
BLOCO 1 — MANCHETE DE CAPA: o assunto mais relevante ou sensível que dita o humor e o volume de negócios no mercado de capitais hoje.
- cartola: etiqueta curta de assunto, em caixa alta (ex.: POLÍTICA MONETÁRIA, SUPREMO TRIBUNAL FEDERAL, REFORMA TRIBUTÁRIA);
- titulo: direto, factual, no presente do indicativo, destacando o impacto principal;
- linha_fina: frase de apoio com dados complementares cruciais, sem repetir palavras do título;
- corpo: 3 a 4 parágrafos curtos em pirâmide invertida (causas, o dado exato, o movimento dos ativos, paralelo histórico quando relevante, visão das mesas de operação).

BLOCO 2 — SCANNER DO DIA ("O que move o dia"):
- pos_fechamento: o que aconteceu após as 18h de ontem (horário de Brasília): decisões judiciais, resultados divulgados à noite, fatos relevantes, fechamento das bolsas asiáticas e primeiras horas na Europa. De 3 a 6 itens.
- agenda: indicadores, decisões de bancos centrais, discursos de diretores do Fed/BC, votações, leilões do Tesouro e eventos políticos/jurídicos de hoje, cada um com horário de Brasília e consenso de mercado quando houver. Em ordem de horário.
- semana: eventos, gatilhos de liquidez e julgamentos de maior peso SÓ nos próximos dias úteis desta semana, de amanhã até sexta-feira (se hoje for sexta, sábado ou domingo, a próxima semana, de segunda a sexta). Nada de datas fora dessa janela nem de eventos de hoje. De 3 a 6 itens, com o dia em "quando" (ex.: "Quinta (15/10)").

[FORMATO DA RESPOSTA]
Pesquise sem escrever comentários entre as buscas. Depois, entregue a edição chamando a ferramenta "entregar_edicao" (uma única vez, com todos os campos). Não escreva a edição no texto.
Antes de entregar, releia cada frase: nenhuma frase pode ficar truncada, repetida ou com reticências; cada dado precisa dizer quando aconteceu (dia e horário), sem expressões vagas como "um dos pregões da semana".
- data_referencia: {hoje.isoformat()}
- agenda.hora: horário de Brasília no formato 09h00; evento sem horário definido: "Dia todo" ou "A definir".
- fontes: de 3 a 12 páginas que você efetivamente usou, com o endereço EXATO devolvido pela busca."""


# ---------------------------------------------------------------- Anthropic
_TXT = {"type": "string"}
ENTREGA = {"name": "entregar_edicao", "description": "Entrega a edição final do dia (Manchete de capa + Scanner do dia) para publicação.",
  "input_schema": {"type": "object", "required": ["data_referencia", "manchete", "scanner", "fontes"], "properties": {
    "data_referencia": _TXT,
    "manchete": {"type": "object", "required": ["cartola", "titulo", "linha_fina", "corpo"], "properties": {
        "cartola": _TXT, "titulo": _TXT, "linha_fina": _TXT, "corpo": {"type": "array", "items": _TXT}}},
    "scanner": {"type": "object", "required": ["pos_fechamento", "agenda", "semana"], "properties": {
        "pos_fechamento": {"type": "array", "items": {"type": "object", "properties": {"titulo": _TXT, "texto": _TXT}, "required": ["texto"]}},
        "agenda": {"type": "array", "items": {"type": "object", "properties": {"hora": _TXT, "evento": _TXT, "consenso": _TXT}, "required": ["hora", "evento"]}},
        "semana": {"type": "array", "items": {"type": "object", "properties": {"quando": _TXT, "texto": _TXT}, "required": ["texto"]}}}},
    "fontes": {"type": "array", "items": {"type": "object", "properties": {"titulo": _TXT, "url": _TXT}, "required": ["url"]}}}}}


def chamar(mensagens, sistema, buscas, forcar_entrega=False):
    chave = os.environ.get("ANTHROPIC_API_KEY")
    if not chave:
        raise RuntimeError("Defina ANTHROPIC_API_KEY (Secrets do GitHub).")
    corpo = {"max_tokens": 16000, "system": sistema, "messages": mensagens, "tools": [ENTREGA]}
    if buscas:
        corpo["tools"] = [{"type": "web_search_20250305", "name": "web_search", "max_uses": buscas}, ENTREGA]
    if forcar_entrega:
        corpo["tool_choice"] = {"type": "tool", "name": "entregar_edicao"}
    ultimo = None
    for modelo in [MODELO] + ([RESERVA] if RESERVA and RESERVA != MODELO else []):
        for tentativa in range(3):
            r = requests.post(ANTHROPIC_URL, timeout=600, json=dict(corpo, model=modelo), headers={
                "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json"})
            if r.status_code == 200:
                return r.json(), modelo
            ultimo = f"{r.status_code}: {r.text[:300]}"
            if r.status_code in (400, 404) and "model" in r.text.lower():
                log(f"  modelo {modelo} indisponível — tentando a reserva")
                break
            if r.status_code in (401, 403):
                raise RuntimeError(f"Chave da Anthropic recusada ({r.status_code}).")
            if r.status_code in (429, 500, 502, 503, 529):
                time.sleep(20 * (tentativa + 1))
                continue
            raise RuntimeError(f"Erro da Anthropic {ultimo}")
    raise RuntimeError(f"Nenhum modelo respondeu ({ultimo}).")


def desembrulhar(d):
    """A entrega às vezes vem com campos como texto JSON ou dentro de uma chave única ({"edicao": {...}})."""
    if isinstance(d, str):
        try:
            d = json.loads(d)
        except ValueError:
            return None
    if isinstance(d, dict) and "manchete" not in d and len(d) == 1 and isinstance(next(iter(d.values())), (dict, str)):
        d = desembrulhar(next(iter(d.values())))
    if isinstance(d, dict):
        for k in ("manchete", "scanner", "fontes"):
            if isinstance(d.get(k), str) and d[k].strip()[:1] in "[{":
                try:
                    d[k] = json.loads(d[k])
                except ValueError:
                    pass
    return d


class Redacao:
    def __init__(self):
        self.ent = self.sai = self.buscas = 0
        self.modelo = None
        self.urls = {}        # url normalizada -> (url, título) devolvidos pela busca

    def conversar(self, mensagens, sistema, buscas, forcar_entrega=False):
        """Devolve (edição entregue pela ferramenta ou None, texto livre)."""
        for _ in range(6):                                   # pause_turn: a busca pode pausar o turno
            resp, self.modelo = chamar(mensagens, sistema, buscas, forcar_entrega)
            uso = resp.get("usage") or {}
            self.ent += uso.get("input_tokens", 0) + uso.get("cache_read_input_tokens", 0)
            self.sai += uso.get("output_tokens", 0)
            self.buscas += (uso.get("server_tool_use") or {}).get("web_search_requests", 0)
            for b in resp.get("content", []):
                if b.get("type") == "web_search_tool_result" and isinstance(b.get("content"), list):
                    for x in b["content"]:
                        if x.get("url"):
                            self.urls[norm_url(x["url"])] = (x["url"], x.get("title") or "")
                for c in b.get("citations") or []:
                    if c.get("url"):
                        self.urls.setdefault(norm_url(c["url"]), (c["url"], c.get("title") or ""))
            if resp.get("stop_reason") == "pause_turn":
                mensagens = mensagens + [{"role": "assistant", "content": resp["content"]}]
                continue
            texto = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text")
            entrega = next((b.get("input") for b in resp.get("content", [])
                            if b.get("type") == "tool_use" and b.get("name") == "entregar_edicao"), None)
            entrega = desembrulhar(entrega)
            if not (isinstance(entrega, dict) and entrega.get("manchete")):
                log(f"  aviso: entrega incompleta (stop_reason={resp.get('stop_reason')}, "
                    f"campos={sorted(entrega) if isinstance(entrega, dict) else type(entrega).__name__}, texto={len(texto)} caracteres)")
            return (entrega if isinstance(entrega, dict) else None), texto
        raise RuntimeError("A IA não terminou o texto (pause_turn repetido).")

    def custo(self):
        return round(self.ent / 1e6 * PRECO_ENT + self.sai / 1e6 * PRECO_SAI + self.buscas * PRECO_BUSCA, 4)


# ---------------------------------------------------------------- conferência
def norm_url(u):
    u = (u or "").strip().lower()
    u = re.sub(r"^https?://(www\.)?", "", u)
    u = u.split("#")[0]
    u = re.sub(r"[?&](utm_[^=&]+|ref|fbclid|gclid)=[^&]*", "", u)
    return u.rstrip("/")


def sem_acento(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


def extrair_json(texto):
    t = (texto or "").strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", t, re.S)
    if m:
        t = m.group(1)
    i, f = t.find("{"), t.rfind("}")
    if i < 0 or f <= i:
        raise ValueError("resposta sem JSON")
    return json.loads(t[i:f + 1])


def txt(v):
    return re.sub(r"\s+", " ", str(v or "")).strip()


def hora_norm(h):
    """'10:30', 'às 9h', '14h30 (Brasília)' -> '10h30', '09h00', '14h30'; sem horário: o rótulo curto ('Dia todo')."""
    m = re.search(r"(\d{1,2})\s*[h:]\s*(\d{2})?", h or "")
    if m and int(m.group(1)) < 24:
        return f"{int(m.group(1)):02d}h{m.group(2) or '00'}"
    return txt(h)[:14] or "A definir"


def limpar(d, red):
    """Normaliza o JSON e troca as fontes pela lista conferida (só endereços que a busca devolveu)."""
    m, s = d.get("manchete") or {}, d.get("scanner") or {}
    out = {
        "manchete": {"cartola": txt(m.get("cartola")).upper(), "titulo": txt(m.get("titulo")),
                     "linha_fina": txt(m.get("linha_fina")),
                     "corpo": [txt(p) for p in (m.get("corpo") or []) if txt(p)]},
        "scanner": {
            "pos_fechamento": [{"titulo": txt(x.get("titulo")), "texto": txt(x.get("texto"))}
                               for x in (s.get("pos_fechamento") or []) if isinstance(x, dict) and txt(x.get("texto"))],
            "agenda": sorted([{"hora": hora_norm(txt(x.get("hora"))), "evento": txt(x.get("evento")), "consenso": txt(x.get("consenso"))}
                              for x in (s.get("agenda") or []) if isinstance(x, dict) and txt(x.get("evento"))],
                             key=lambda x: (0, x["hora"]) if re.match(r"^\d{2}h\d{2}$", x["hora"]) else (1, "")),
            "semana": [{"quando": txt(x.get("quando")), "texto": txt(x.get("texto"))}
                       for x in (s.get("semana") or []) if isinstance(x, dict) and txt(x.get("texto"))]},
    }
    fontes, vistos = [], set()
    for f in d.get("fontes") or []:
        if not isinstance(f, dict):
            continue
        n = norm_url(f.get("url"))
        if n in red.urls and n not in vistos:
            url, tit = red.urls[n]
            fontes.append({"titulo": txt(f.get("titulo")) or txt(tit) or url, "url": url})
            vistos.add(n)
    return out, fontes, txt(d.get("data_referencia"))


def problemas(ed, fontes, data_ref, hoje):
    p = []
    m, s = ed["manchete"], ed["scanner"]
    if data_ref != hoje.isoformat():
        p.append(f"data_referencia deve ser {hoje.isoformat()} (veio '{data_ref}')")
    for k in ("cartola", "titulo", "linha_fina"):
        if not m[k]:
            p.append(f"manchete.{k} vazio")
    if not 3 <= len(m["corpo"]) <= 4:
        p.append(f"manchete.corpo precisa de 3 a 4 parágrafos (veio {len(m['corpo'])})")
    if len(s["pos_fechamento"]) < 3:
        p.append("scanner.pos_fechamento precisa de ao menos 3 itens")
    if not s["agenda"]:
        p.append("scanner.agenda vazia")
    elif not any(re.match(r"^\d{2}h\d{2}$", x["hora"]) for x in s["agenda"]):
        p.append("scanner.agenda: nenhum item com horário de Brasília (formato 09h00)")
    if len(s["semana"]) < 3:
        p.append("scanner.semana precisa de ao menos 3 itens")
    tudo = sem_acento(json.dumps(ed, ensure_ascii=False))
    for c in CLICHES:
        if re.search(r"\b" + re.escape(sem_acento(c)) + r"\b", tudo):
            p.append(f"clichê proibido: \"{c}\"")
    for c in RECOMENDACAO:
        if sem_acento(c) in tudo:
            p.append(f"recomendação de investimento proibida: \"{c.strip()}\"")
    if len(fontes) < 3:
        p.append(f"menos de 3 fontes com endereço exato devolvido pela busca (vieram {len(fontes)})")
    return p


# ---------------------------------------------------------------- Supabase
def gravar(hoje, ed, fontes, red):
    url, chave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not chave:
        raise RuntimeError("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY (Secrets do GitHub).")
    cab = {"apikey": chave, "Content-Type": "application/json",
           "Prefer": "resolution=merge-duplicates,return=minimal"}
    if not chave.startswith("sb_"):
        cab["Authorization"] = f"Bearer {chave}"
    linha = {"data": hoje.isoformat(), "conteudo": ed, "fontes": fontes, "modelo": red.modelo,
             "custo_usd": red.custo(), "gerado_em": dt.datetime.now(dt.timezone.utc).isoformat(), "publicado": True}
    for _ in range(3):
        r = requests.post(f"{url}/rest/v1/vm_edicoes?on_conflict=data", json=[linha], headers=cab, timeout=120)
        if r.status_code < 300:
            return
        log(f"  aviso: gravação falhou ({r.status_code}) {r.text[:200]}")
        time.sleep(10)
    raise RuntimeError("Não foi possível gravar a edição no Supabase (rodou o SQL 133?).")


def main():
    hoje = (dt.datetime.now(BRT)).date()
    if os.environ.get("VM_DATA"):
        hoje = dt.date.fromisoformat(os.environ["VM_DATA"])
    log(f"Valor e Mercado — edição de {data_extenso(hoje)} — modelo {MODELO}, até {BUSCAS} buscas")
    red, sistema = Redacao(), instrucoes(hoje)
    pedido = [{"role": "user", "content": f"Apure e escreva a edição de hoje ({data_extenso(hoje)}) e entregue pela ferramenta entregar_edicao."}]
    entrega, texto = red.conversar(pedido, sistema, BUSCAS)
    ed = fontes = None
    for rodada in range(2):
        bruto = entrega
        try:
            if bruto is None:
                bruto = extrair_json(texto)                 # reserva: edição escrita no texto
            ed, fontes, data_ref = limpar(bruto, red)
            erros = problemas(ed, fontes, data_ref, hoje)
        except (ValueError, json.JSONDecodeError, AttributeError) as e:
            erros = [f"edição ilegível ({e}); entregue pela ferramenta entregar_edicao"]
        log(f"Conferência (rodada {rodada + 1}): " + ("OK" if not erros else "; ".join(erros)))
        if not erros:
            break
        if rodada == 1:
            log(f"Custo estimado: US$ {red.custo()} ({red.ent} tokens de entrada, {red.sai} de saída, {red.buscas} buscas)")
            raise SystemExit("Edição NÃO publicada: a conferência falhou duas vezes. A capa segue com a edição anterior.")
        # correção numa conversa nova e curta: só a edição + os pontos a corrigir (não reenvia as páginas da busca)
        rascunho = json.dumps(bruto, ensure_ascii=False) if isinstance(bruto, dict) else (texto or "")[:30000]
        precisa_buscar = any("fontes" in e for e in erros)
        correcao = ("Esta é a edição de hoje que você escreveu:\n" + rascunho
                    + "\n\nEla não passou na conferência automática. Corrija SÓ estes pontos, mantenha o resto igual e entregue a edição completa pela ferramenta entregar_edicao"
                    + (" (pode fazer até 4 buscas para achar as fontes com o endereço exato)" if precisa_buscar else "") + ":\n- " + "\n- ".join(erros))
        entrega, texto = red.conversar([{"role": "user", "content": correcao}], sistema,
                                       4 if precisa_buscar else 0, forcar_entrega=not precisa_buscar)
    log(f"Manchete: [{ed['manchete']['cartola']}] {ed['manchete']['titulo']}")
    log(f"Scanner: {len(ed['scanner']['pos_fechamento'])} pós-fechamento, {len(ed['scanner']['agenda'])} na agenda, "
        f"{len(ed['scanner']['semana'])} na semana; {len(fontes)} fontes")
    log(f"Custo estimado: US$ {red.custo()} ({red.ent} tokens de entrada, {red.sai} de saída, {red.buscas} buscas) — {red.modelo}")
    if os.environ.get("VM_SO_TESTE") == "1":
        print(json.dumps({"conteudo": ed, "fontes": fontes}, ensure_ascii=False, indent=2))
        log("VM_SO_TESTE=1: nada gravado.")
        return
    gravar(hoje, ed, fontes, red)
    log("Edição gravada e PUBLICADA em public.vm_edicoes.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        log(f"ERRO: {e}")
        sys.exit(1)
