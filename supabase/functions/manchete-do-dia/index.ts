// manchete-do-dia v1.0 — Valor e Mercado: a edição do dia (Manchete de capa + Scanner do dia) escrita pelo Supabase.
// Decisão do Thiago (16/10/2026 17h45): "MANCHETE PELO SUPABASE — SIGA".
//
// Por que em etapas: no plano gratuito uma Edge Function vive no máximo 150 s, e a redação com busca na web leva minutos.
// Por isso o pedido vai pelo LOTE de mensagens da Anthropic (Message Batches: responde em minutos, custa metade) e o
// pg_cron chama esta função a cada 5 min; a edição anda das 05h00 às 08h55 de Brasília (fora disso, só um teste pedido à mão).
// Cada chamada dá UM passo e termina em segundos:
//   nova      -> manda o pedido em lote (até 12 buscas na web)
//   aguardando-> o lote terminou? lê a resposta; "pause_turn" continua a conversa; erro passageiro manda de novo;
//                modelo inexistente troca para a reserva; resposta pronta passa pela CONFERÊNCIA (as mesmas travas do robô
//                do GitHub, redigir_valor_mercado.py v1.4); se falhar, pede UMA correção; se falhar de novo, desiste
//   pronta    -> foto de capa (Unsplash) já escolhida; às 06h30 grava em public.vm_edicoes (publicado = true)
//   publicada / falhou / substituida (o robô do GitHub publicou antes)
// O robô do GitHub fica de RESERVA às 07h15: se não houver edição publicada hoje, ele escreve como antes.
//
// Chamadas (Authorization: Bearer <COLETOR_TOKEN>):
//   {}                         passo normal do agendador
//   {"acao":"situacao"}        mostra a execução de hoje
//   {"acao":"teste"}           começa uma execução de TESTE agora, a qualquer hora (nunca publica; o agendador a leva adiante
//                              a cada 5 min; o resultado fica em vm_manchete_execucoes, modo 'teste')
// Variáveis: ANTHROPIC_API_KEY, COLETOR_TOKEN, UNSPLASH_ACCESS_KEY (sem ela, sai sem foto); opcionais VM_MODELO, VM_BUSCAS.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são automáticas. Nenhuma chave neste arquivo. A página nunca menciona IA.

export const VERSAO = "1.1";   // v1.1 (18/10/2026): foto de capa vem primeiro do BANCO DE IMAGENS PRÓPRIO (SQL 161); Unsplash é a reserva
const MODELO = Deno.env.get("VM_MODELO") || "claude-sonnet-5-5";
const RESERVA = Deno.env.get("VM_MODELO_RESERVA") || "claude-sonnet-4-5";
const BUSCAS = (() => { const n = parseInt(Deno.env.get("VM_BUSCAS") ?? "", 10); return isNaN(n) ? 12 : Math.max(1, Math.min(20, n)); })();
const API = Deno.env.get("ANTHROPIC_URL") || "https://api.anthropic.com/v1";
const UNSPLASH = Deno.env.get("UNSPLASH_URL") || "https://api.unsplash.com";
// preço do LOTE (metade do normal), por milhão de tokens — só para o registro de custo
const PRECO_ENT = 1.5, PRECO_SAI = 7.5, PRECO_BUSCA = 0.01;
export const JANELA = { inicio: 5 * 60, publica: 6 * 60 + 30, fim: 8 * 60 + 55 };   // minutos do dia em Brasília
const MAX_CONTINUA = 6, MAX_REENVIO = 3;

let http: typeof fetch = fetch;
export function usarFetch(f: typeof fetch) { http = f; }

// ------------------------------------------------------------------ datas (Brasília, UTC-3)
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function agoraBrt(agora = new Date()) {
  const b = new Date(agora.getTime() - 3 * 3600e3);
  return { data: b.toISOString().slice(0, 10), minutos: b.getUTCHours() * 60 + b.getUTCMinutes() };
}
export function dataExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

// ------------------------------------------------------------------ regras editoriais (iguais às do robô do GitHub v1.4)
const CLICHES = ["em suma", "por fim", "vale destacar", "vale ressaltar", "é importante lembrar", "é importante destacar",
  "portanto", "uma jornada", "mergulhar de cabeça", "um olhar atento", "em resumo", "em conclusão",
  "nesse sentido", "cenário desafiador", "impressionante",
  "segundo a agenda", "de acordo com a agenda", "conforme a agenda", "com base nos dados", "com base nas informações",
  "dados fornecidos", "informações disponíveis", "é importante notar", "cabe destacar", "neste cenário"];
const VEICULOS = ["reuters", "bloomberg", "valor econômico", "valor economico", "folha de s.paulo", "folha de são paulo", "estadão",
  "estado de s. paulo", "o globo", "infomoney", "cnn", "g1", "exame", "broadcast", "financial times", "wall street journal",
  "agência brasil", "agencia brasil", "poder360", "money times", "bbc", "cnbc", "associated press", "afp", "the economist",
  "neofeed", "brazil journal", "veja", "istoé dinheiro", "agência estado", "uol", "metrópoles", "correio braziliense"];
const RECOMENDACAO = ["recomendamos", "recomenda-se", "nossa recomendação", "vale a pena comprar", "hora de comprar",
  "hora de vender", "aproveite para comprar", "compre ", "venda já"];

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const semAcento = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\x7f]/g, "").toLowerCase();
export const txt = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

export function semFormulas(t0: string): string {
  let t = (t0 || "").replace(/(^|[.!?]\s+)(segundo|de acordo com|conforme)\s+(a|o)\s+(agenda|calend[aá]rio)(\s+(do dia|de hoje|oficial))?\s*,\s*(\S)/gi,
    (_m, a, _b, _c, _d, _e, _f, g) => a + String(g).toUpperCase());
  t = t.replace(/\*\*|__/g, "");
  t = t.replace(/^\s*([-•*]|\d+[.)])\s+/, "");
  t = t.replace(/\s+/g, " ");
  t = t.replace(/,\s*(segundo|de acordo com|conforme)\s+(a|o)\s+(agenda|calend[aá]rio)(\s+(do dia|de hoje))?(?=[,.;])/gi, "");
  return t.trim();
}
export function citacoesDeVeiculos(t: string): number {
  const a = " " + semAcento(t) + " ";
  return VEICULOS.reduce((n, v) => n + (a.match(new RegExp("[^a-z0-9]" + reEsc(semAcento(v)) + "(?=[^a-z0-9])", "g"))?.length ?? 0), 0);
}
export function consensoNorm(c: unknown): string {
  const t = txt(c).replace(/^[ ;.]+|[ ;.]+$/g, "");
  if (!t || ["-", "—", "–"].includes(t) || /^(sem consenso|n\/?d|n\/?a|nao ha|não há|indisponivel|indisponível)(?![\p{L}\p{N}_])/u.test(t.toLowerCase())) return "";
  return t;
}
export function horaNorm(h: string): string {
  const m = (h || "").match(/(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (m && parseInt(m[1], 10) < 24) return `${String(parseInt(m[1], 10)).padStart(2, "0")}h${m[2] ?? "00"}`;
  return txt(h).slice(0, 14) || "A definir";
}
export function normUrl(u: unknown): string {
  let s = String(u ?? "").trim().toLowerCase();
  s = s.replace(/^https?:\/\/(www\.)?/, "").split("#")[0];
  s = s.replace(/[?&](utm_[^=&]+|ref|fbclid|gclid)=[^&]*/g, "");
  return s.replace(/\/+$/, "");
}

export function instrucoes(hoje: string): string {
  return `Você é um jornalista de economia sênior e analista macroeconômico com passagens pelas principais redações financeiras globais (Bloomberg, Valor Econômico e Financial Times). Sua tarefa é produzir de forma autônoma o conteúdo editorial do dia para a home do portal "Valor e Mercado".

[MATRIZ DE COMPETÊNCIAS TÉCNICAS REQUERIDAS]
Aplique conhecimentos avançados em:
1. História e precedentes econômicos: contextualize os movimentos de mercado e as crises contemporâneas com análises comparativas com ciclos econômicos passados, grandes choques de oferta, reformas monetárias históricas e a evolução das instituições financeiras globais.
2. Direito brasileiro e internacional: impactos jurídicos e regulatórios sobre os mercados, incluindo jurisprudência do STF, andamento de PECs e projetos de lei, direito tributário e administrativo, arbitragens internacionais, tratados comerciais e marcos regulatórios globais.
3. Geopolítica e ciência política: conexão entre conflitos internacionais, eleições, decisões de comércio exterior, risco soberano e mudanças regulatórias domésticas.
4. Matemática financeira e estatística: leitura precisa de taxas de juros (curva de juros, cupom cambial), volatilidade, inflação e amostragem de dados econômicos.
5. Contabilidade e contabilidade pública: balanços corporativos (Ebitda, alavancagem, DFP) e contas públicas (regras fiscais, resultado primário, dívida bruta/líquida, caixa do Tesouro).
6. Geografia econômica: logística de commodities, gargalos em cadeias globais de suprimento, infraestrutura portuária e demografia industrial.

[DATA DE REFERÊNCIA]
Hoje é ${dataExtenso(hoje)} (${hoje}). Toda a análise considera este dia. Ignore os fatos de edições anteriores: busque informação estritamente nova, das últimas 24 horas de mercado e dos fatos previstos para hoje. Use a ferramenta de busca na web para apurar TUDO; não escreva nenhum número, horário ou fato que não tenha encontrado na busca de hoje.

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
- data_referencia: ${hoje}
- agenda.hora: horário de Brasília no formato 09h00; evento sem horário definido: "Dia todo" ou "A definir".
- fontes: de 3 a 12 páginas que você efetivamente usou, com o endereço EXATO devolvido pela busca.`;
}

const T = { type: "string" };
export const ENTREGA = { name: "entregar_edicao", description: "Entrega a edição final do dia (Manchete de capa + Scanner do dia) para publicação.",
  input_schema: { type: "object", required: ["data_referencia", "manchete", "scanner", "fontes"], properties: {
    data_referencia: T,
    manchete: { type: "object", required: ["cartola", "titulo", "linha_fina", "corpo"], properties: {
      cartola: T, titulo: T, linha_fina: T, corpo: { type: "array", items: T }, foto_busca: T, foto_alternativa: T } },
    scanner: { type: "object", required: ["pos_fechamento", "agenda", "semana"], properties: {
      pos_fechamento: { type: "array", items: { type: "object", properties: { titulo: T, texto: T }, required: ["texto"] } },
      agenda: { type: "array", items: { type: "object", properties: { hora: T, evento: T, consenso: T }, required: ["hora", "evento"] } },
      semana: { type: "array", items: { type: "object", properties: { quando: T, texto: T }, required: ["texto"] } } } },
    fontes: { type: "array", items: { type: "object", properties: { titulo: T, url: T }, required: ["url"] } } } } };

// ------------------------------------------------------------------ conferência
type Obj = Record<string, unknown>;
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Obj[] : []);
export type Edicao = { manchete: Obj & { cartola: string; titulo: string; linha_fina: string; corpo: string[] };
  scanner: { pos_fechamento: Obj[]; agenda: { hora: string; evento: string; consenso: string }[]; semana: Obj[] } };

export function desembrulhar(d: unknown): Obj | null {
  if (typeof d === "string") { try { d = JSON.parse(d); } catch { return null; } }
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const o = d as Obj, ks = Object.keys(o);
    if (!("manchete" in o) && ks.length === 1 && o[ks[0]] && ["object", "string"].includes(typeof o[ks[0]])) return desembrulhar(o[ks[0]]);
    for (const k of ["manchete", "scanner", "fontes"]) {
      const v = o[k];
      if (typeof v === "string" && "[{".includes(v.trim().slice(0, 1) || "x")) { try { o[k] = JSON.parse(v); } catch { /* fica */ } }
    }
    return o;
  }
  return null;
}
export function extrairJson(texto: string): Obj {
  let t = (texto || "").trim();
  const m = t.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (m) t = m[1];
  const i = t.indexOf("{"), f = t.lastIndexOf("}");
  if (i < 0 || f <= i) throw new Error("resposta sem JSON");
  return JSON.parse(t.slice(i, f + 1));
}
export function limpar(d: Obj, urls: Record<string, [string, string]>): { ed: Edicao; fontes: { titulo: string; url: string }[]; dataRef: string } {
  const m = (d.manchete && typeof d.manchete === "object" ? d.manchete : {}) as Obj;
  const s = (d.scanner && typeof d.scanner === "object" ? d.scanner : {}) as Obj;
  const corpo = (Array.isArray(m.corpo) ? m.corpo : []).map((p) => semFormulas(txt(p))).filter(Boolean);
  const agenda = arr(s.agenda).filter((x) => txt(x.evento))
    .map((x) => ({ hora: horaNorm(txt(x.hora)), evento: txt(x.evento), consenso: consensoNorm(x.consenso) }));
  const chave = (x: { hora: string }) => /^\d{2}h\d{2}$/.test(x.hora) ? "0" + x.hora : "1";
  agenda.sort((a, b) => chave(a) < chave(b) ? -1 : chave(a) > chave(b) ? 1 : 0);
  const ed: Edicao = {
    manchete: { cartola: txt(m.cartola).toUpperCase(), titulo: semFormulas(txt(m.titulo)), linha_fina: semFormulas(txt(m.linha_fina)),
      corpo, foto_busca: txt(m.foto_busca), foto_alternativa: txt(m.foto_alternativa) },
    scanner: {
      pos_fechamento: arr(s.pos_fechamento).filter((x) => txt(x.texto)).map((x) => ({ titulo: txt(x.titulo), texto: txt(x.texto) })),
      agenda,
      semana: arr(s.semana).filter((x) => txt(x.texto)).map((x) => ({ quando: txt(x.quando), texto: txt(x.texto) })) } };
  const fontes: { titulo: string; url: string }[] = [], vistos = new Set<string>();
  for (const f of arr(d.fontes)) {
    const n = normUrl(f.url);
    if (urls[n] && !vistos.has(n)) {
      const [url, tit] = urls[n];
      fontes.push({ titulo: txt(f.titulo) || txt(tit) || url, url });
      vistos.add(n);
    }
  }
  return { ed, fontes, dataRef: txt(d.data_referencia) };
}
export function problemas(ed: Edicao, fontes: unknown[], dataRef: string, hoje: string): string[] {
  const p: string[] = [], m = ed.manchete, s = ed.scanner;
  if (dataRef !== hoje) p.push(`data_referencia deve ser ${hoje} (veio '${dataRef}')`);
  for (const k of ["cartola", "titulo", "linha_fina"] as const) if (!m[k]) p.push(`manchete.${k} vazio`);
  if (m.corpo.length < 3 || m.corpo.length > 4) p.push(`manchete.corpo precisa de 3 a 4 parágrafos (veio ${m.corpo.length})`);
  if (s.pos_fechamento.length < 3) p.push("scanner.pos_fechamento precisa de ao menos 3 itens");
  if (!s.agenda.length) p.push("scanner.agenda vazia");
  else if (!s.agenda.some((x) => /^\d{2}h\d{2}$/.test(x.hora))) p.push("scanner.agenda: nenhum item com horário de Brasília (formato 09h00)");
  if (s.semana.length < 3) p.push("scanner.semana precisa de ao menos 3 itens");
  if (citacoesDeVeiculos(m.titulo + " " + m.linha_fina)) p.push("título e linha fina não citam jornais nem agências de notícias (crédito só na lista de fontes)");
  const nv = citacoesDeVeiculos(m.corpo.join(" "));
  if (nv > 1) p.push(`o corpo da manchete cita jornais/agências ${nv} vezes: no máximo 1 (atribua à fonte primária — Banco Central, empresa, governo — e deixe o crédito na lista de fontes)`);
  const tudo = semAcento(JSON.stringify(ed));
  for (const c of CLICHES) if (new RegExp("\\b" + reEsc(semAcento(c)) + "\\b").test(tudo)) p.push(`clichê proibido: "${c}"`);
  for (const c of RECOMENDACAO) if (tudo.includes(semAcento(c))) p.push(`recomendação de investimento proibida: "${c.trim()}"`);
  if (fontes.length < 3) p.push(`menos de 3 fontes com endereço exato devolvido pela busca (vieram ${fontes.length})`);
  return p;
}

// ------------------------------------------------------------------ Anthropic (lote)
const cabAnthropic = () => ({ "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "", "anthropic-version": "2023-06-01", "content-type": "application/json" });
export function pedido(mensagens: unknown[], hoje: string, buscas: number, modelo: string): Obj {
  const tools: unknown[] = buscas ? [{ type: "web_search_20250305", name: "web_search", max_uses: buscas }, ENTREGA] : [ENTREGA];
  return { model: modelo, max_tokens: 16000, system: instrucoes(hoje), messages: mensagens, tools };
}
async function mandarLote(id: string, params: Obj): Promise<string> {
  const r = await http(`${API}/messages/batches`, { method: "POST", headers: cabAnthropic(), body: JSON.stringify({ requests: [{ custom_id: id, params }] }) });
  const t = await r.text();
  if (r.status === 401 || r.status === 403) throw new Error(`chave da Anthropic recusada (${r.status})`);
  if (!r.ok) throw new Error(`lote recusado (${r.status}): ${t.slice(0, 200)}`);
  return JSON.parse(t).id;
}
type Resultado = { tipo: "pendente" } | { tipo: "succeeded"; msg: Obj } | { tipo: "errored" | "expired" | "canceled"; erro: string };
async function lerLote(id: string): Promise<Resultado> {
  const r = await http(`${API}/messages/batches/${id}`, { headers: cabAnthropic() });
  if (!r.ok) throw new Error(`consulta do lote falhou (${r.status})`);
  const b = await r.json();
  if (b.processing_status !== "ended" || !b.results_url) return { tipo: "pendente" };
  const rr = await http(b.results_url, { headers: cabAnthropic() });
  if (!rr.ok) throw new Error(`resultado do lote falhou (${rr.status})`);
  const linha = (await rr.text()).split("\n").find((l) => l.trim());
  if (!linha) return { tipo: "errored", erro: "lote sem resultado" };
  const res = JSON.parse(linha).result ?? {};
  if (res.type === "succeeded") return { tipo: "succeeded", msg: res.message };
  const e = res.error?.error ?? res.error ?? {};
  return { tipo: res.type ?? "errored", erro: `${e.type ?? res.type ?? "erro"}: ${String(e.message ?? "").slice(0, 200)}` };
}

// ------------------------------------------------------------------ v1.1: foto de capa do BANCO DE IMAGENS PRÓPRIO (SQL 161)
/** Pede ao banco a imagem que mais combina com o assunto (sem repetir em 30 dias). Null = nada combina: usa o Unsplash. */
export async function fotoDoBanco(termos: unknown[], log: string[]): Promise<Obj | null> {
  const t = termos.map(txt).filter(Boolean);
  if (!t.length) return null;
  try {
    const r = await http(`${base()}/rpc/vm_banco_imagem_escolher`, { method: "POST", body: JSON.stringify({ p_termos: t }), headers: cab() });
    if (!r.ok) { log.push(`Foto de capa: banco de imagens indisponível (${r.status}) — vai o Unsplash.`); return null; }
    const b = await r.json() as Obj | null;
    if (!b || !String(b.src ?? "").startsWith("https://")) { log.push("Foto de capa: nada do assunto no banco de imagens — vai o Unsplash."); return null; }
    log.push(`Foto de capa: banco de imagens -> ${b.id} (${b.tema})`);
    return { id: `banco-${b.id}`, src: b.src, src_grande: b.src_grande, alt: txt(b.alt) || "Imagem ilustrativa",
      fotografo: "Imagem ilustrativa", fonte: "Arquivo Valor e Mercado", busca: t[0], cor_media: "" };
  } catch (e) { log.push(`Foto de capa: banco de imagens falhou (${(e as Error).message}) — vai o Unsplash.`); return null; }
}

// ------------------------------------------------------------------ foto de capa (Unsplash)
const UTM = "utm_source=soliduns_valor_e_mercado&utm_medium=referral";
const comUtm = (u: string) => u ? u + (u.includes("?") ? "&" : "?") + UTM : "";
export async function buscarFoto(m: Obj, usadas: Set<string>, log: string[]): Promise<Obj | null> {
  const chave = Deno.env.get("UNSPLASH_ACCESS_KEY");
  if (!chave) { log.push("Foto de capa: UNSPLASH_ACCESS_KEY não configurada — edição sem foto."); return null; }
  const cab = { Authorization: `Client-ID ${chave}`, "Accept-Version": "v1" };
  for (const termo0 of [m.foto_busca, m.foto_alternativa, "financial market trading"]) {
    const termo = txt(termo0);
    if (!termo) continue;
    let r: Response;
    try {
      const q = new URLSearchParams({ query: termo, orientation: "landscape", per_page: "20", content_filter: "high" });
      r = await http(`${UNSPLASH}/search/photos?${q}`, { headers: cab });
    } catch (e) { log.push(`Foto de capa: falha na busca '${termo}' (${(e as Error).message})`); continue; }
    if (r.status === 401 || r.status === 403) { log.push(`Foto de capa: chave do Unsplash recusada (${r.status}) — edição sem foto.`); return null; }
    if (!r.ok) { log.push(`Foto de capa: busca '${termo}' devolveu ${r.status}`); continue; }
    for (const f of arr((await r.json()).results)) {
      const urls = (f.urls ?? {}) as Obj, user = (f.user ?? {}) as Obj, links = (f.links ?? {}) as Obj;
      const raw = String(urls.raw ?? "");
      if (usadas.has(String(f.id)) || !raw.startsWith("https://") || Number(f.width ?? 0) < Number(f.height ?? 1)) continue;
      const j = raw.includes("?") ? "&" : "?";
      const foto = { id: f.id, src: raw + j + "w=1200&h=675&fit=crop&crop=entropy&q=80&auto=format",
        src_grande: raw + j + "w=1880&h=1058&fit=crop&crop=entropy&q=80&auto=format",
        alt: txt(f.alt_description ?? f.description) || termo, fotografo: txt(user.name) || "Unsplash",
        fotografo_url: comUtm(String(((user.links ?? {}) as Obj).html ?? "")),
        pagina_url: comUtm(String(links.html ?? "https://unsplash.com")), fonte: "Unsplash", busca: termo, cor_media: f.color ?? "" };
      if (links.download_location) { try { await http(String(links.download_location), { headers: cab }); } catch { /* aviso de uso: melhor esforço */ } }
      log.push(`Foto de capa: '${termo}' -> ${foto.pagina_url} (Foto: ${foto.fotografo} / Unsplash)`);
      return foto;
    }
    log.push(`Foto de capa: nada novo para '${termo}'`);
  }
  log.push("Foto de capa: nenhuma foto encontrada — edição sem foto.");
  return null;
}

// ------------------------------------------------------------------ Supabase (PostgREST)
function cab(extra: Record<string, string> = {}): Record<string, string> {
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const h: Record<string, string> = { apikey: chave, "Content-Type": "application/json", ...extra };
  if (!chave.startsWith("sb_")) h.Authorization = `Bearer ${chave}`;
  return h;
}
const base = () => `${Deno.env.get("SUPABASE_URL")}/rest/v1`;
async function pgGet<T>(caminho: string): Promise<T> {
  const r = await http(`${base()}/${caminho}`, { headers: cab() });
  if (!r.ok) throw new Error(`leitura falhou (${r.status}) em ${caminho.split("?")[0]}`);
  return await r.json();
}
async function pgEscreve(metodo: string, caminho: string, corpo: unknown, prefer = "return=minimal"): Promise<void> {
  const r = await http(`${base()}/${caminho}`, { method: metodo, body: JSON.stringify(corpo), headers: cab({ Prefer: prefer }) });
  if (!r.ok) throw new Error(`gravação em ${caminho.split("?")[0]} falhou (${r.status}): ${(await r.text()).slice(0, 200)}`);
}

export type Execucao = { data: string; modo: "producao" | "teste"; etapa: string; rodada: number; continuacoes: number; reenvios: number;
  modelo: string; lote_id: string | null; mensagens: unknown[]; buscas: number; urls: Record<string, [string, string]>;
  edicao: Obj | null; fontes: unknown[]; ent: number; sai: number; nbuscas: number; registro: string[]; atualizado_em?: string };
const salvar = (x: Execucao) => pgEscreve("POST", "vm_manchete_execucoes?on_conflict=data,modo",
  [{ ...x, atualizado_em: new Date().toISOString() }], "resolution=merge-duplicates,return=minimal");
const custo = (x: Execucao) => Math.round((x.ent / 1e6 * PRECO_ENT + x.sai / 1e6 * PRECO_SAI + x.nbuscas * PRECO_BUSCA) * 1e4) / 1e4;
const hora = () => { const b = new Date(Date.now() - 3 * 3600e3); return b.toISOString().slice(11, 16).replace(":", "h"); };
const anota = (x: Execucao, s: string) => { x.registro = [...(x.registro ?? []), `${hora()} ${s}`].slice(-60); };

export function nova(data: string, modo: "producao" | "teste"): Execucao {
  return { data, modo, etapa: "nova", rodada: 0, continuacoes: 0, reenvios: 0, modelo: MODELO, lote_id: null,
    mensagens: [{ role: "user", content: `Apure e escreva a edição de hoje (${dataExtenso(data)}) e entregue pela ferramenta entregar_edicao.` }],
    buscas: BUSCAS, urls: {}, edicao: null, fontes: [], ent: 0, sai: 0, nbuscas: 0, registro: [] };
}
async function enviarPedido(x: Execucao) {
  x.lote_id = await mandarLote(`vm-${x.data}-${x.modo}-${x.rodada}-${x.continuacoes}-${x.reenvios}`, pedido(x.mensagens, x.data, x.buscas, x.modelo));
  x.etapa = "aguardando";
  anota(x, `pedido enviado (rodada ${x.rodada + 1}, ${x.modelo}, até ${x.buscas} buscas)`);
}

/** Lê a resposta do lote, junta os endereços devolvidos pela busca e decide o próximo passo. */
export async function processarResposta(x: Execucao, msg: Obj, fotosUsadas: () => Promise<Set<string>>) {
  const uso = (msg.usage ?? {}) as Obj;
  x.ent += Number(uso.input_tokens ?? 0) + Number(uso.cache_read_input_tokens ?? 0);
  x.sai += Number(uso.output_tokens ?? 0);
  x.nbuscas += Number(((uso.server_tool_use ?? {}) as Obj).web_search_requests ?? 0);
  const conteudo = arr(msg.content);
  for (const b of conteudo) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content))
      for (const r of arr(b.content)) if (r.url) x.urls[normUrl(r.url)] = [String(r.url), String(r.title ?? "")];
    for (const c of arr(b.citations)) if (c.url && !x.urls[normUrl(c.url)]) x.urls[normUrl(c.url)] = [String(c.url), String(c.title ?? "")];
  }
  if (msg.stop_reason === "pause_turn") {
    if (++x.continuacoes > MAX_CONTINUA) { x.etapa = "falhou"; anota(x, "ERRO: a redação não terminou (pause_turn repetido)."); return; }
    x.mensagens = [...x.mensagens, { role: "assistant", content: conteudo }];
    anota(x, "busca pausada — continuando");
    await enviarPedido(x);
    return;
  }
  const texto = conteudo.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("");
  const entrega = desembrulhar(conteudo.find((b) => b.type === "tool_use" && b.name === "entregar_edicao")?.input);
  let bruto: Obj | null = entrega && entrega.manchete ? entrega : null;
  let erros: string[];
  let lim: ReturnType<typeof limpar> | null = null;
  try {
    if (!bruto) bruto = extrairJson(texto);
    lim = limpar(bruto, x.urls);
    erros = problemas(lim.ed, lim.fontes, lim.dataRef, x.data);
  } catch (e) {
    erros = [`edição ilegível (${(e as Error).message}); entregue pela ferramenta entregar_edicao`];
  }
  anota(x, `conferência (rodada ${x.rodada + 1}): ` + (erros.length ? erros.join("; ") : "OK"));
  if (!erros.length && lim) {
    const log: string[] = [];
    const mm = lim.ed.manchete as Obj;
    const foto = (await fotoDoBanco([mm.foto_busca, mm.foto_alternativa, mm.cartola, mm.titulo], log))
      ?? await buscarFoto(lim.ed.manchete, await fotosUsadas(), log).catch(() => null);
    log.forEach((l) => anota(x, l));
    if (foto) lim.ed.manchete.foto = foto;
    x.edicao = lim.ed as unknown as Obj; x.fontes = lim.fontes; x.etapa = "pronta"; x.mensagens = [];
    anota(x, `pronta: [${lim.ed.manchete.cartola}] ${lim.ed.manchete.titulo} — ${lim.fontes.length} fontes — US$ ${custo(x)}`);
    return;
  }
  if (x.rodada >= 1) { x.etapa = "falhou"; x.mensagens = []; anota(x, `NÃO publicada: a conferência falhou duas vezes. US$ ${custo(x)}`); return; }
  // correção numa conversa nova e curta: só a edição + os pontos a corrigir
  const rascunho = bruto ? JSON.stringify(bruto) : (texto || "").slice(0, 30000);
  const precisaBuscar = erros.some((e) => e.includes("fontes"));
  x.mensagens = [{ role: "user", content: "Esta é a edição de hoje que você escreveu:\n" + rascunho +
    "\n\nEla não passou na conferência automática. Corrija SÓ estes pontos, mantenha o resto igual e entregue a edição completa pela ferramenta entregar_edicao" +
    (precisaBuscar ? " (pode fazer até 4 buscas para achar as fontes com o endereço exato)" : "") + ":\n- " + erros.join("\n- ") }];
  x.buscas = precisaBuscar ? 4 : 0; x.rodada = 1; x.continuacoes = 0; x.reenvios = 0;
  await enviarPedido(x);
}

async function publicadaHoje(data: string): Promise<boolean> {
  const l = await pgGet<unknown[]>(`vm_edicoes?select=data&data=eq.${data}&publicado=is.true`);
  return l.length > 0;
}
async function fotosRecentes(): Promise<Set<string>> {
  try {
    const l = await pgGet<{ conteudo?: { manchete?: { foto?: { id?: unknown } } } }[]>("vm_edicoes?select=conteudo&order=data.desc&limit=15");
    return new Set(l.map((e) => String(e.conteudo?.manchete?.foto?.id)));
  } catch { return new Set(); }
}

/** Um passo da execução. Devolve o resumo para o registro do pg_net. */
export async function passo(acao: string, agora = new Date()): Promise<Obj> {
  const { data, minutos } = agoraBrt(agora);
  const modo = acao === "teste" || acao === "continuar_teste" ? "teste" : "producao";
  if (acao === "situacao") {
    const l = await pgGet<Execucao[]>(`vm_manchete_execucoes?select=modo,etapa,ent,sai,nbuscas,registro&data=eq.${data}`);
    return { data, execucoes: l.map((e) => ({ modo: e.modo, etapa: e.etapa, custo_usd: custo(e), registro: e.registro })) };
  }
  const lista = await pgGet<Execucao[]>(`vm_manchete_execucoes?select=*&data=eq.${data}&modo=eq.${modo}`);
  let x: Execucao | null = lista[0] ?? null;
  const terminal = (e: string) => ["pronta", "falhou", "publicada", "substituida"].includes(e);
  if (acao === "continuar_teste" && (!x || terminal(x.etapa))) return { modo, etapa: x?.etapa ?? "sem teste" };
  if (acao === "teste" && x && terminal(x.etapa)) x = null;            // novo teste começa do zero

  if (modo === "producao") {
    if (await publicadaHoje(data)) {
      if (x && !["publicada", "substituida"].includes(x.etapa)) { x.etapa = "substituida"; anota(x, "a edição de hoje já estava publicada (robô de reserva)"); await salvar(x); }
      return { data, etapa: x?.etapa ?? "já publicada" };
    }
    if (!x && (minutos < JANELA.inicio || minutos > JANELA.fim)) return { data, etapa: "fora do horário" };
  }
  if (!x) { x = nova(data, modo); anota(x, `início (${modo}) — manchete-do-dia v${VERSAO}`); }

  try {
    if (x.etapa === "nova") await enviarPedido(x);
    else if (x.etapa === "aguardando" && x.lote_id) {
      const r = await lerLote(x.lote_id);
      if (r.tipo === "succeeded") await processarResposta(x, r.msg, fotosRecentes);
      else if (r.tipo !== "pendente") {
        anota(x, `lote ${r.tipo}: ${r.erro}`);
        if (/not_found/.test(r.erro) && x.modelo !== RESERVA) { x.modelo = RESERVA; anota(x, `modelo indisponível — usando a reserva ${RESERVA}`); await enviarPedido(x); }
        else if (/invalid_request|authentication|permission/.test(r.erro)) { x.etapa = "falhou"; anota(x, "ERRO: pedido recusado pela Anthropic."); }
        else if (++x.reenvios <= MAX_REENVIO) await enviarPedido(x);
        else { x.etapa = "falhou"; anota(x, "ERRO: o lote falhou 3 vezes."); }
      }
    }
    if (x.etapa === "pronta" && modo === "producao" && minutos >= JANELA.publica) {
      const linha = { data, conteudo: x.edicao, fontes: x.fontes, modelo: x.modelo, custo_usd: custo(x),
        gerado_em: new Date().toISOString(), publicado: true };
      await pgEscreve("POST", "vm_edicoes?on_conflict=data", [linha], "resolution=merge-duplicates,return=minimal");
      x.etapa = "publicada"; anota(x, "Edição gravada e PUBLICADA em public.vm_edicoes.");
    }
  } catch (e) {
    anota(x, `aviso: ${(e as Error).message}`);       // tenta de novo no próximo passo (5 min)
  }
  await salvar(x);
  return { data, modo, etapa: x.etapa, custo_usd: custo(x), ultimo: x.registro.at(-1) };
}

export async function tratar(req: Request): Promise<Response> {
  const token = Deno.env.get("COLETOR_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) return Response.json({ erro: "não autorizado" }, { status: 401 });
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return Response.json({ erro: "falta ANTHROPIC_API_KEY nos Secrets das Edge Functions" }, { status: 500 });
  let corpo: { acao?: string } = {};
  try { corpo = await req.json(); } catch { /* vazio */ }
  try {
    const r = await passo(corpo.acao ?? "");
    if (!corpo.acao) r.teste = await passo("continuar_teste");          // o agendador também leva adiante um teste em andamento
    return Response.json({ versao: VERSAO, ...r });
  } catch (e) {
    return Response.json({ versao: VERSAO, erro: String((e as Error).message ?? e) }, { status: 500 });
  }
}

Deno.serve(tratar);
