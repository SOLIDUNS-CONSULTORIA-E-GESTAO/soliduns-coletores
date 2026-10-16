"""
SOLIDUNS — Jornal "Valor e Mercado" — redator diário por IA — v1.5 (16/10/2026)

v1.5 (16/10, "MANCHETE PELO SUPABASE"): a edição passa a ser escrita pela Edge Function manchete-do-dia (SQL 154), que publica
      às 06h30. Este robô vira RESERVA: na execução agendada (07h15, VM_SO_SE_FALTAR=1) só escreve se não houver edição
      publicada hoje, e confere de novo antes de gravar para não sobrescrever a do Supabase. À mão (Run workflow) roda sempre.

v1.4 (16/10): regra 10 de formatação (texto corrido, sem marcação) e limpeza de asteriscos/marcadores no texto entregue.
v1.3 (15/10, revisão do plano editorial pelo Thiago): a manchete não abre com "Segundo a agenda do dia" (o robô tira, se
      vier); no máximo UMA citação a outro jornal/agência no corpo e nenhuma no título e na linha fina (crédito vai na
      lista de fontes); proibidas as expressões que denunciam texto automatizado. Tudo isso volta para correção.

v1.2 (15/10): foto de capa pelo UNSPLASH (chave UNSPLASH_ACCESS_KEY — a API do Pexels está pausada); o Pexels fica de reserva
      se só houver PEXELS_API_KEY. Unsplash: foto servida pelo próprio Unsplash, crédito "Foto: <fotógrafo> / Unsplash" com links
      (utm_source), e o aviso de uso (download_location) exigido pelas regras da API.

v1.1 (15/10): FOTO DE CAPA. A IA sugere termos de busca (em inglês) ligados à manchete; o robô busca a foto no
      banco Pexels (chave PEXELS_API_KEY; licença Pexels, crédito ao fotógrafo na página), sem repetir as fotos das
      últimas 15 edições. Sem chave ou sem resultado: a edição sai sem foto. Também: entrega da correção sem
      ferramenta obrigatória e modelo reserva só quando o principal não existe (404).

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

Secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, UNSPLASH_ACCESS_KEY (foto de capa; opcional; reserva: PEXELS_API_KEY).
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
           "nesse sentido", "cenário desafiador", "impressionante",
           # v1.3: atribuição redundante e marcas de texto automatizado
           "segundo a agenda", "de acordo com a agenda", "conforme a agenda", "com base nos dados", "com base nas informações",
           "dados fornecidos", "informações disponíveis", "é importante notar", "cabe destacar", "neste cenário"]
# v1.3: veículos de imprensa — no máximo 1 citação no corpo da manchete e nenhuma no título/linha fina
VEICULOS = ["reuters", "bloomberg", "valor econômico", "valor economico", "folha de s.paulo", "folha de são paulo", "estadão",
            "estado de s. paulo", "o globo", "infomoney", "cnn", "g1", "exame", "broadcast", "financial times", "wall street journal",
            "agência brasil", "agencia brasil", "poder360", "money times", "bbc", "cnbc", "associated press", "afp", "the economist",
            "neofeed", "brazil journal", "veja", "istoé dinheiro", "agência estado", "uol", "metrópoles", "correio braziliense"]


def sem_formulas(t):
    """Tira 'Segundo a agenda do dia,' (e variações) do começo ou do meio das frases."""
    t = re.sub(r"(^|[.!?]\s+)(segundo|de acordo com|conforme)\s+(a|o)\s+(agenda|calend[aá]rio)(\s+(do dia|de hoje|oficial))?\s*,\s*(\S)",
               lambda m: m.group(1) + m.group(7).upper(), t or "", flags=re.I)
    t = re.sub(r"\*\*|__", "", t or "")
    t = re.sub(r"^\s*([-•*]|\d+[.)])\s+", "", t)
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r",\s*(segundo|de acordo com|conforme)\s+(a|o)\s+(agenda|calend[aá]rio)(\s+(do dia|de hoje))?(?=[,.;])", "", t, flags=re.I)
    return t.strip()


def citacoes_de_veiculos(t):
    a = " " + sem_acento(t) + " "
    return sum(len(re.findall(r"[^a-z0-9]" + re.escape(sem_acento(v)) + r"[^a-z0-9]", a)) for v in VEICULOS)
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
7. Nunca abra a manchete, o título, a linha fina ou um parágrafo com a origem da pauta ("Segundo a agenda do dia", "De acordo com a agenda", "Conforme o calendário"): é redundante. Vá direto ao fato.
8. Atribua à FONTE PRIMÁRIA (Banco Central, IBGE, Tesouro, a empresa, o governo, o tribunal), não a outros jornais. Título e linha fina nunca citam jornais ou agências de notícias; no corpo, no máximo UMA vez, e só quando a informação for exclusiva daquele veículo. O crédito aos veículos consultados fica na lista de fontes.
9. Escreva como o repórter que apurou os fatos. Nada de expressões que denunciem texto automatizado ("com base nos dados", "com base nas informações disponíveis", "é importante notar", "cabe destacar", "neste cenário") e nenhuma menção a pesquisa, busca, ferramentas, instruções ou falta de informação.
10. Formatação: texto corrido, sem marcação nenhuma (asteriscos, negrito, títulos internos, listas, marcadores, emojis, quebras de linha dentro do parágrafo). Cada parágrafo do corpo é um bloco único de frases completas; caixa alta só em siglas e tickers.

[O QUE ENTREGAR]
BLOCO 1 — MANCHETE DE CAPA: o assunto mais relevante ou sensível que dita o humor e o volume de negócios no mercado de capitais hoje.
- cartola: etiqueta curta de assunto, em caixa alta (ex.: POLÍTICA MONETÁRIA, SUPREMO TRIBUNAL FEDERAL, REFORMA TRIBUTÁRIA);
- titulo: direto, factual, no presente do indicativo, destacando o impacto principal;
- linha_fina: frase de apoio com dados complementares cruciais, sem repetir palavras do título;
- corpo: 3 a 4 parágrafos curtos em pirâmide invertida (causas, o dado exato, o movimento dos ativos, paralelo histórico quando relevante, visão das mesas de operação);
- foto_busca: de 2 a 4 palavras EM INGLÊS para buscar a FOTO DE CAPA num banco de imagens, ligadas ao assunto concreto da manchete (ex.: "central bank building", "oil refinery", "soybean harvest", "stock exchange screen", "brazilian real banknotes", "container port cranes"). Nada de nomes de pessoas, marcas ou logotipos;
- foto_alternativa: outra busca em inglês, mais genérica, para o caso de a primeira não achar foto.

BLOCO 2 — SCANNER DO DIA ("O que move o dia"):
- pos_fechamento: o que aconteceu após as 18h de ontem (horário de Brasília): decisões judiciais, resultados divulgados à noite, fatos relevantes, fechamento das bolsas asiáticas e primeiras horas na Europa. De 3 a 6 itens.
- agenda: indicadores, decisões de bancos centrais, discursos de diretores do Fed/BC, votações, leilões do Tesouro e eventos políticos/jurídicos de hoje, cada um com horário de Brasília e consenso de mercado quando houver (sem consenso: deixe o campo vazio). Em ordem de horário.
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
        "cartola": _TXT, "titulo": _TXT, "linha_fina": _TXT, "corpo": {"type": "array", "items": _TXT},
        "foto_busca": _TXT, "foto_alternativa": _TXT}},
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
    # v1.1: sem tool_choice obrigatório (o Sonnet 5.5 recusou a ferramenta forçada no Scanner de 15/10); o pedido já manda usar a ferramenta
    ultimo = None
    for modelo in [MODELO] + ([RESERVA] if RESERVA and RESERVA != MODELO else []):
        for tentativa in range(3):
            r = requests.post(ANTHROPIC_URL, timeout=600, json=dict(corpo, model=modelo), headers={
                "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json"})
            if r.status_code == 200:
                return r.json(), modelo
            ultimo = f"{r.status_code}: {r.text[:300]}"
            if r.status_code == 404 or "not_found_error" in r.text:
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


def consenso_norm(c):
    """'Sem consenso nas fontes consultadas', 'N/D', '—' -> vazio (a página só mostra 'Consenso:' quando há número)."""
    c = txt(c).strip(" ;.")
    if not c or c in ("-", "—", "–") or re.match(r"^(sem consenso|n/?d|n/?a|nao ha|não há|indisponivel|indisponível)\b", c.lower()):
        return ""
    return c


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
        "manchete": {"cartola": txt(m.get("cartola")).upper(), "titulo": sem_formulas(txt(m.get("titulo"))),
                     "linha_fina": sem_formulas(txt(m.get("linha_fina"))),
                     "corpo": [sem_formulas(txt(p)) for p in (m.get("corpo") or []) if sem_formulas(txt(p))],
                     "foto_busca": txt(m.get("foto_busca")), "foto_alternativa": txt(m.get("foto_alternativa"))},
        "scanner": {
            "pos_fechamento": [{"titulo": txt(x.get("titulo")), "texto": txt(x.get("texto"))}
                               for x in (s.get("pos_fechamento") or []) if isinstance(x, dict) and txt(x.get("texto"))],
            "agenda": sorted([{"hora": hora_norm(txt(x.get("hora"))), "evento": txt(x.get("evento")), "consenso": consenso_norm(x.get("consenso"))}
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
    if citacoes_de_veiculos(m["titulo"] + " " + m["linha_fina"]):
        p.append("título e linha fina não citam jornais nem agências de notícias (crédito só na lista de fontes)")
    nv = citacoes_de_veiculos(" ".join(m["corpo"]))
    if nv > 1:
        p.append(f"o corpo da manchete cita jornais/agências {nv} vezes: no máximo 1 (atribua à fonte primária — Banco Central, empresa, governo — e deixe o crédito na lista de fontes)")
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


# ---------------------------------------------------------------- foto de capa (Pexels)
PEXELS_URL = os.environ.get("PEXELS_URL") or "https://api.pexels.com/v1/search"
FOTO_GENERICA = "financial market trading"


def _cab_supabase():
    url, chave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not chave:
        return None, None
    cab = {"apikey": chave}
    if not chave.startswith("sb_"):
        cab["Authorization"] = f"Bearer {chave}"
    return url, cab


def fotos_recentes():
    """Ids das fotos das últimas 15 edições (para não repetir a mesma foto na capa)."""
    url, cab = _cab_supabase()
    if not url:
        return set()
    try:
        r = requests.get(f"{url}/rest/v1/vm_edicoes?select=conteudo&order=data.desc&limit=15", headers=cab, timeout=60)
        return {str(((x.get("conteudo") or {}).get("manchete") or {}).get("foto", {}).get("id")) for x in r.json()} if r.ok else set()
    except (requests.RequestException, ValueError, AttributeError):
        return set()


UNSPLASH_URL = os.environ.get("UNSPLASH_URL") or "https://api.unsplash.com"
UTM = "utm_source=soliduns_valor_e_mercado&utm_medium=referral"


def _com_utm(u):
    return (u + ("&" if "?" in u else "?") + UTM) if u else ""


def buscar_foto(m):
    """Escolhe a foto de capa pelos termos sugeridos para a manchete (Unsplash; reserva Pexels). Nunca derruba a edição."""
    if os.environ.get("UNSPLASH_ACCESS_KEY"):
        return buscar_foto_unsplash(m, os.environ["UNSPLASH_ACCESS_KEY"])
    if os.environ.get("PEXELS_API_KEY"):
        return buscar_foto_pexels(m, os.environ["PEXELS_API_KEY"])
    log("Foto de capa: UNSPLASH_ACCESS_KEY não configurada — edição sem foto.")
    return None


def buscar_foto_unsplash(m, chave):
    usadas = fotos_recentes()
    cab = {"Authorization": f"Client-ID {chave}", "Accept-Version": "v1"}
    for termo in [m.get("foto_busca"), m.get("foto_alternativa"), FOTO_GENERICA]:
        termo = txt(termo)
        if not termo:
            continue
        try:
            r = requests.get(f"{UNSPLASH_URL}/search/photos", headers=cab, timeout=60,
                             params={"query": termo, "orientation": "landscape", "per_page": 20, "content_filter": "high"})
        except requests.RequestException as e:
            log(f"Foto de capa: falha na busca '{termo}' ({e})")
            continue
        if r.status_code in (401, 403):
            log(f"Foto de capa: chave do Unsplash recusada ({r.status_code}) — edição sem foto.")
            return None
        if not r.ok:
            log(f"Foto de capa: busca '{termo}' devolveu {r.status_code}")
            continue
        for f in (r.json().get("results") or []):
            urls, user = f.get("urls") or {}, f.get("user") or {}
            raw = urls.get("raw") or ""
            if str(f.get("id")) in usadas or not raw.startswith("https://") or (f.get("width") or 0) < (f.get("height") or 1):
                continue
            junta = "&" if "?" in raw else "?"
            foto = {"id": f.get("id"), "src": raw + junta + "w=1200&h=675&fit=crop&crop=entropy&q=80&auto=format",
                    "src_grande": raw + junta + "w=1880&h=1058&fit=crop&crop=entropy&q=80&auto=format",
                    "alt": txt(f.get("alt_description") or f.get("description")) or termo,
                    "fotografo": txt(user.get("name")) or "Unsplash",
                    "fotografo_url": _com_utm((user.get("links") or {}).get("html") or ""),
                    "pagina_url": _com_utm((f.get("links") or {}).get("html") or "https://unsplash.com"),
                    "fonte": "Unsplash", "busca": termo, "cor_media": f.get("color") or ""}
            baixar = (f.get("links") or {}).get("download_location")
            if baixar:                                  # regra da API do Unsplash: avisar o uso da foto
                try:
                    requests.get(baixar, headers=cab, timeout=30)
                except requests.RequestException:
                    pass
            log(f"Foto de capa: '{termo}' -> {foto['pagina_url']} (Foto: {foto['fotografo']} / Unsplash)")
            return foto
        log(f"Foto de capa: nada novo para '{termo}'")
    log("Foto de capa: nenhuma foto encontrada — edição sem foto.")
    return None


def buscar_foto_pexels(m, chave):
    usadas = fotos_recentes()
    for termo in [m.get("foto_busca"), m.get("foto_alternativa"), FOTO_GENERICA]:
        termo = txt(termo)
        if not termo:
            continue
        try:
            r = requests.get(PEXELS_URL, headers={"Authorization": chave}, timeout=60,
                             params={"query": termo, "orientation": "landscape", "size": "large", "per_page": 20, "locale": "en-US"})
        except requests.RequestException as e:
            log(f"Foto de capa: falha na busca '{termo}' ({e})")
            continue
        if r.status_code in (401, 403):
            log(f"Foto de capa: chave do Pexels recusada ({r.status_code}) — edição sem foto.")
            return None
        if not r.ok:
            log(f"Foto de capa: busca '{termo}' devolveu {r.status_code}")
            continue
        for f in (r.json().get("photos") or []):
            src = f.get("src") or {}
            if str(f.get("id")) in usadas or not src.get("landscape") or (f.get("width") or 0) < (f.get("height") or 1):
                continue
            foto = {"id": f.get("id"), "src": src.get("landscape"), "src_grande": src.get("large2x") or src.get("large"),
                    "alt": txt(f.get("alt")) or termo, "fotografo": txt(f.get("photographer")) or "Pexels",
                    "fotografo_url": f.get("photographer_url") or "", "pagina_url": f.get("url") or "https://www.pexels.com",
                    "fonte": "Pexels", "busca": termo, "cor_media": f.get("avg_color") or ""}
            log(f"Foto de capa: '{termo}' -> {foto['pagina_url']} (Foto: {foto['fotografo']} / Pexels)")
            return foto
        log(f"Foto de capa: nada novo para '{termo}'")
    log("Foto de capa: nenhuma foto encontrada — edição sem foto.")
    return None


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


def ja_publicada(hoje):
    """True se já há edição publicada hoje (a da Edge Function manchete-do-dia). Em dúvida (sem acesso), False."""
    url, cab = _cab_supabase()
    if not url:
        return False
    try:
        r = requests.get(f"{url}/rest/v1/vm_edicoes?select=data&data=eq.{hoje.isoformat()}&publicado=is.true", headers=cab, timeout=60)
        return r.ok and len(r.json()) > 0
    except (requests.RequestException, ValueError):
        return False


def main():
    hoje = (dt.datetime.now(BRT)).date()
    if os.environ.get("VM_DATA"):
        hoje = dt.date.fromisoformat(os.environ["VM_DATA"])
    reserva = os.environ.get("VM_SO_SE_FALTAR") == "1" and os.environ.get("VM_SO_TESTE") != "1"
    if reserva and ja_publicada(hoje):
        log(f"Edição de {data_extenso(hoje)} já publicada pelo Supabase (manchete-do-dia). Reserva não precisa agir.")
        return
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
    foto = buscar_foto(ed["manchete"])
    if foto:
        ed["manchete"]["foto"] = foto
    if os.environ.get("VM_SO_TESTE") == "1":
        print(json.dumps({"conteudo": ed, "fontes": fontes}, ensure_ascii=False, indent=2))
        log("VM_SO_TESTE=1: nada gravado.")
        return
    if reserva and ja_publicada(hoje):
        log("A edição do Supabase foi publicada enquanto a reserva escrevia: mantida a do Supabase, nada gravado.")
        return
    gravar(hoje, ed, fontes, red)
    log("Edição gravada e PUBLICADA em public.vm_edicoes.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        log(f"ERRO: {e}")
        sys.exit(1)
