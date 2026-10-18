// artigo-semanal v1.0 — Valor e Mercado: ARTIGOS SEMANAIS automáticos (1ª pauta: Petrobras e o mercado de petróleo).
// Pedido do Thiago (17/10/2026 21h21). Mesmo motor da manchete-do-dia (SQL 154): pedido em LOTE à Anthropic com busca na web,
// conferência automática, uma correção, foto do Unsplash. Cada pauta (public.vm_pautas_semanais, SQL 157) diz o dia e a hora
// de escrever; o artigo entra na Redação (public.vm_artigos) como AGENDADO para o horário de publicação — o Thiago pode ler,
// editar ou despublicar antes — e o agendador vm-publicar-agendados (SQL 146) publica sozinho.
//
// O que o redator recebe ALÉM da busca na web (dados da casa, conferidos):
//   - fechamento dos tickers da pauta e do Ibovespa nos últimos pregões (public.cotacoes, B3 COTAHIST);
//   - documentos da companhia na CVM e títulos de imprensa da semana (public.emissor_noticias, SQL 156).
//
// Chamadas (Authorization: Bearer <COLETOR_TOKEN>):
//   {}                                    passo normal do agendador (a cada 5 min)
//   {"acao":"situacao"}                   execuções desta semana
//   {"acao":"teste","pauta":"petrobras"}  começa um TESTE agora (vira RASCUNHO na Redação, nunca é publicado sozinho)
// Variáveis: ANTHROPIC_API_KEY, COLETOR_TOKEN, UNSPLASH_ACCESS_KEY (sem ela, sai sem foto); opcionais VM_MODELO, VM_BUSCAS_SEMANAL.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são automáticas. Nenhuma chave neste arquivo. O artigo nunca menciona IA.

export const VERSAO = "1.1";
const MODELO = Deno.env.get("VM_MODELO") || "claude-sonnet-5-5";
const RESERVA = Deno.env.get("VM_MODELO_RESERVA") || "claude-sonnet-4-5";
const BUSCAS = (() => { const n = parseInt(Deno.env.get("VM_BUSCAS_SEMANAL") ?? "", 10); return isNaN(n) ? 25 : Math.max(4, Math.min(30, n)); })();
const API = Deno.env.get("ANTHROPIC_URL") || "https://api.anthropic.com/v1";
const UNSPLASH = Deno.env.get("UNSPLASH_URL") || "https://api.unsplash.com";
const PRECO_ENT = 1.5, PRECO_SAI = 7.5, PRECO_BUSCA = 0.01;
const JANELA_HORAS = 6;                 // a produção pode começar até 6 h depois da hora marcada
const MAX_CONTINUA = 10, MAX_REENVIO = 3;
const AUTOR = "Redação Valor e Mercado";

let http: typeof fetch = fetch;
export function usarFetch(f: typeof fetch) { http = f; }

// ------------------------------------------------------------------ datas (Brasília, UTC-3)
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function agoraBrt(agora = new Date()) {
  const b = new Date(agora.getTime() - 3 * 3600e3);
  return { data: b.toISOString().slice(0, 10), minutos: b.getUTCHours() * 60 + b.getUTCMinutes(), dia: b.getUTCDay() };
}
export function dataExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}
export const somaDias = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
/** horário de publicação em UTC (ISO) a partir do dia de escrita + dias + minutos em Brasília */
export function publicarEm(semana: string, dias: number, minutos: number): string {
  const d = somaDias(semana, dias);
  return new Date(Date.parse(`${d}T00:00:00Z`) + (minutos + 180) * 60e3).toISOString();
}

// ------------------------------------------------------------------ regras editoriais (as mesmas da manchete)
const CLICHES = ["em suma", "por fim", "vale destacar", "vale ressaltar", "é importante lembrar", "é importante destacar",
  "portanto", "uma jornada", "mergulhar de cabeça", "um olhar atento", "em resumo", "em conclusão",
  "nesse sentido", "cenário desafiador", "impressionante", "com base nos dados", "com base nas informações",
  "dados fornecidos", "informações disponíveis", "é importante notar", "cabe destacar", "neste cenário"];
const VEICULOS = ["reuters", "bloomberg", "valor econômico", "valor economico", "folha de s.paulo", "folha de são paulo", "estadão",
  "estado de s. paulo", "o globo", "infomoney", "cnn", "g1", "exame", "broadcast", "financial times", "wall street journal",
  "agência brasil", "agencia brasil", "poder360", "money times", "bbc", "cnbc", "associated press", "afp", "the economist",
  "neofeed", "brazil journal", "veja", "istoé dinheiro", "agência estado", "uol", "metrópoles", "correio braziliense", "oilprice", "argus", "platts"];
const RECOMENDACAO = ["recomendamos", "recomenda-se", "nossa recomendação", "vale a pena comprar", "hora de comprar",
  "hora de vender", "aproveite para comprar", "compre ", "venda já", "preço-alvo da soliduns"];
const IA = ["inteligência artificial", "inteligencia artificial", "modelo de linguagem", "gerado automaticamente", "como uma ia", "chatgpt", "claude"];

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const semAcento = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\x7f]/g, "").toLowerCase();
export const txt = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
export function semMarcas(t0: string): string {
  return (t0 || "").replace(/\*\*|__/g, "").replace(/^\s*([-•*]|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim();
}
export function citacoesDeVeiculos(t: string): number {
  const a = " " + semAcento(t) + " ";
  return VEICULOS.reduce((n, v) => n + (a.match(new RegExp("[^a-z0-9]" + reEsc(semAcento(v)) + "(?=[^a-z0-9])", "g"))?.length ?? 0), 0);
}
export function normUrl(u: unknown): string {
  let s = String(u ?? "").trim().toLowerCase();
  s = s.replace(/^https?:\/\/(www\.)?/, "").split("#")[0];
  s = s.replace(/[?&](utm_[^=&]+|ref|fbclid|gclid)=[^&]*/g, "");
  return s.replace(/\/+$/, "");
}
const palavras = (t: string) => (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%-]*/gu) ?? []).length;

// ------------------------------------------------------------------ pauta e dados da casa
type Obj = Record<string, unknown>;
export type Pauta = { id: string; nome: string; chapeu: string; editoria: string; tickers: string[]; tema: string; estrutura?: string;
  exigir?: string[]; palavras_min?: number; palavras_max?: number; fontes_min?: number; dia_escrever: number;
  hora_escrever: number; dias_publicar: number; hora_publicar: number; foto_busca: string; tags: string[]; ativa: boolean };

export function instrucoes(p: Pauta, hoje: string, dados: string): string {
  const tk = p.tickers.join(" e ");
  const pmin = p.palavras_min ?? 900, pmax = p.palavras_max ?? 1400, exigir = p.exigir?.length ? p.exigir : p.tickers;
  const estrutura = (p.estrutura || "abertura sem intertítulo | intertítulo sobre a companhia | intertítulo sobre o setor no mundo | intertítulo sobre o Brasil | intertítulo \"O que acompanhar\"")
    .split("|").map((x, i) => `  ${i + 1}. ${x.trim()}`).join("\n");
  return `Você é um jornalista de economia sênior, especializado em energia e petróleo, com passagens pelas principais redações financeiras globais e domínio de geopolítica do petróleo, regulação do setor (ANP, CNPE, OPEP+), contabilidade de petroleiras (Ebitda, alavancagem, fluxo de caixa livre, dividendos) e precificação de commodities (Brent, WTI, spreads de refino, câmbio). Sua tarefa é escrever o ARTIGO SEMANAL do portal "Valor e Mercado".

[PAUTA]
${p.tema}

[DATA DE REFERÊNCIA]
Hoje é ${dataExtenso(hoje)} (${hoje}). O artigo cobre os 7 dias até hoje e será publicado amanhã cedo. Use a ferramenta de busca na web para apurar TUDO o que aconteceu nesta semana; não escreva nenhum número, data ou fato que não tenha encontrado na busca ou nos dados da casa abaixo.

[DADOS DA CASA — conferidos, use quando forem relevantes]
${dados}

[ESTRUTURA OBRIGATÓRIA]
- chapeu: "${p.chapeu}".
- titulo: até 90 caracteres, factual, presente do indicativo, sem ponto final, com o fato mais importante da semana para a companhia ou para o petróleo.
- linha_fina: 140 a 220 caracteres, com os dados complementares cruciais, sem repetir palavras do título.
- corpo: parágrafos de 2 a 4 frases e intertítulos curtos (até 60 caracteres, sem ponto final), NESTA ordem:
${estrutura}
- Entre ${pmin.toLocaleString("pt-BR")} e ${pmax.toLocaleString("pt-BR")} palavras no corpo. O corpo precisa citar: ${exigir.join(", ")}.
- Cada motor do preço vem com o fato concreto da semana, a data e o efeito observado no Brent (em US$ e %). Se um motor não teve fato novo na semana, diga em uma frase qual é a situação vigente, com a data do último fato.
- Publicações de referência (relatórios da OPEP, IEA, EIA etc.) são citadas pelo nome e pela data de divulgação, com os números principais.
- foto_busca: 2 a 4 palavras EM INGLÊS para a foto (ex.: "oil platform offshore", "oil refinery night", "oil tanker sea"); foto_alternativa: outra mais genérica. Nada de nomes de pessoas, marcas ou logotipos.
- seo_titulo (até 90 caracteres) e seo_descricao (até 200 caracteres).
- fontes: de ${p.fontes_min ?? 5} a 20 páginas que você efetivamente usou (de preferência as fontes primárias: OPEP, IEA, EIA, ANP, a própria empresa), com o endereço EXATO devolvido pela busca.

[RESTRIÇÕES RÍGIDAS DE ESTILO]
1. Proibido usar muletas e clichês: "em suma", "por fim", "vale destacar", "é importante lembrar", "portanto", "uma jornada", "em resumo", "nesse sentido", "neste cenário".
2. Nada de parágrafo final moralista, otimista ou que "resuma o aprendizado": termine com o último dado relevante.
3. Voz ativa e alta densidade de dados (números, percentuais, pontos-base, barris por dia, dólares por barril, tickers).
4. Jornalismo, não consultoria: NUNCA recomende comprar, vender ou manter ativos, nem dê preço-alvo próprio.
5. Números no padrão brasileiro: vírgula decimal, percentuais com 2 casas, variações com sinal, câmbio com 4 casas, petróleo em US$ por barril com 2 casas.
6. Atribua à FONTE PRIMÁRIA (a Petrobras, a ANP, a OPEP+, a EIA, o governo, o tribunal). Título e linha fina nunca citam jornais ou agências; no corpo, no máximo DUAS vezes, só quando a informação for exclusiva daquele veículo.
7. Escreva como o repórter que apurou. Nenhuma menção a pesquisa, busca, ferramentas, instruções, inteligência artificial ou falta de informação.
8. Texto corrido, sem marcação nenhuma (asteriscos, negrito, listas, marcadores, emojis). Cada parágrafo é um bloco de frases completas; caixa alta só em siglas e tickers.
9. Cada dado diz quando aconteceu (dia da semana e data). Nada de frase truncada, repetida ou com reticências.

[FORMATO DA RESPOSTA]
Pesquise sem escrever comentários entre as buscas. Depois, entregue o artigo chamando a ferramenta "entregar_artigo" uma única vez, com todos os campos, e data_referencia = ${hoje}. Não escreva o artigo no texto.`;
}

const T = { type: "string" };
export const ENTREGA = { name: "entregar_artigo", description: "Entrega o artigo semanal pronto para a Redação.",
  input_schema: { type: "object", required: ["data_referencia", "chapeu", "titulo", "linha_fina", "corpo", "fontes"], properties: {
    data_referencia: T, chapeu: T, titulo: T, linha_fina: T,
    corpo: { type: "array", items: { type: "object", required: ["tipo", "texto"], properties: { tipo: { type: "string", enum: ["paragrafo", "intertitulo"] }, texto: T } } },
    foto_busca: T, foto_alternativa: T, seo_titulo: T, seo_descricao: T,
    fontes: { type: "array", items: { type: "object", properties: { titulo: T, url: T }, required: ["url"] } } } } };

export type Artigo = { chapeu: string; titulo: string; linha_fina: string; corpo: { tipo: string; texto: string }[];
  foto_busca: string; foto_alternativa: string; seo_titulo: string; seo_descricao: string; foto?: Obj };
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Obj[] : []);

export function desembrulhar(d: unknown): Obj | null {
  if (typeof d === "string") { try { d = JSON.parse(d); } catch { return null; } }
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const o = d as Obj;
    for (const k of ["corpo", "fontes"]) {
      const v = o[k];
      if (typeof v === "string" && "[{".includes(v.trim().slice(0, 1) || "x")) { try { o[k] = JSON.parse(v); } catch { /* fica */ } }
    }
    return o;
  }
  return null;
}
export function limpar(d: Obj, urls: Record<string, [string, string]>, p: Pauta): { a: Artigo; fontes: { titulo: string; url: string }[]; dataRef: string } {
  const corpo = arr(d.corpo).map((b) => ({ tipo: b.tipo === "intertitulo" ? "intertitulo" : "paragrafo", texto: semMarcas(txt(b.texto)) }))
    .filter((b) => b.texto).map((b) => b.tipo === "intertitulo" ? { ...b, texto: b.texto.replace(/[.:]\s*$/, "") } : b);
  const a: Artigo = { chapeu: txt(d.chapeu).toUpperCase() || p.chapeu, titulo: semMarcas(txt(d.titulo)).replace(/\.$/, ""),
    linha_fina: semMarcas(txt(d.linha_fina)), corpo, foto_busca: txt(d.foto_busca) || p.foto_busca, foto_alternativa: txt(d.foto_alternativa),
    seo_titulo: txt(d.seo_titulo).slice(0, 90), seo_descricao: txt(d.seo_descricao).slice(0, 200) };
  const fontes: { titulo: string; url: string }[] = [], vistos = new Set<string>();
  for (const f of arr(d.fontes)) {
    const n = normUrl(f.url);
    if (urls[n] && !vistos.has(n) && /^https:\/\//.test(urls[n][0])) {
      const [url, tit] = urls[n];
      fontes.push({ titulo: (txt(f.titulo) || txt(tit) || url).slice(0, 200), url });
      vistos.add(n);
    }
  }
  return { a, fontes: fontes.slice(0, 30), dataRef: txt(d.data_referencia) };
}
export function problemas(a: Artigo, fontes: unknown[], dataRef: string, hoje: string, p: Pauta): string[] {
  const e: string[] = [];
  if (dataRef !== hoje) e.push(`data_referencia deve ser ${hoje} (veio '${dataRef}')`);
  if (a.titulo.length < 20 || a.titulo.length > 90) e.push(`título com ${a.titulo.length} caracteres (20 a 90)`);
  if (a.linha_fina.length < 120 || a.linha_fina.length > 260) e.push(`linha fina com ${a.linha_fina.length} caracteres (120 a 260)`);
  const pars = a.corpo.filter((b) => b.tipo === "paragrafo"), ints = a.corpo.filter((b) => b.tipo === "intertitulo");
  const nSec = (p.estrutura || "a|b|c|d|e").split("|").length - 1;   // seções com intertítulo (a 1ª é a abertura)
  if (a.corpo.length < nSec * 2 + 1 || a.corpo.length > nSec * 4 + 4) e.push(`corpo com ${a.corpo.length} blocos (${nSec * 2 + 1} a ${nSec * 4 + 4})`);
  if (ints.length < nSec - 1 || ints.length > nSec + 1) e.push(`${ints.length} intertítulo(s) (esperado ${nSec})`);
  if (a.corpo[0]?.tipo === "intertitulo") e.push("o artigo abre com parágrafo, não com intertítulo");
  if (ints.some((b) => b.texto.length > 70)) e.push("intertítulo com mais de 70 caracteres");
  const n = palavras(pars.map((b) => b.texto).join(" "));
  const pmin = p.palavras_min ?? 900, pmax = p.palavras_max ?? 1400;
  if (n < pmin * 0.9 || n > pmax * 1.15) e.push(`corpo com ${n} palavras (${pmin} a ${pmax})`);
  const corpoTxt = pars.map((b) => b.texto).join(" ");
  const corpoSA = " " + semAcento(corpoTxt) + " ";
  for (const t of (p.exigir?.length ? p.exigir : p.tickers)) {
    const alvo = semAcento(t), alt = alvo === "opep" ? ["opep", "opec"] : alvo === "estados unidos" ? ["estados unidos", "eua"] : [alvo];
    if (!alt.some((v) => new RegExp(`[^a-z0-9]${reEsc(v)}[^a-z0-9]`).test(corpoSA))) e.push(`o corpo não cita ${t}`);
  }
  if (citacoesDeVeiculos(a.titulo + " " + a.linha_fina)) e.push("título e linha fina não citam jornais nem agências");
  const nv = citacoesDeVeiculos(corpoTxt);
  if (nv > 2) e.push(`o corpo cita jornais/agências ${nv} vezes (máximo 2; atribua à fonte primária)`);
  const tudo = semAcento(JSON.stringify(a));
  for (const c of CLICHES) if (new RegExp("\\b" + reEsc(semAcento(c)) + "\\b").test(tudo)) e.push(`clichê proibido: "${c}"`);
  for (const c of RECOMENDACAO) if (tudo.includes(semAcento(c))) e.push(`recomendação de investimento proibida: "${c.trim()}"`);
  for (const c of IA) if (tudo.includes(semAcento(c))) e.push(`menção proibida: "${c}"`);
  if (/\.\.\.|…/.test(corpoTxt)) e.push("reticências no corpo (frase truncada?)");
  const fmin = p.fontes_min ?? 5;
  if (fontes.length < fmin) e.push(`menos de ${fmin} fontes com endereço exato devolvido pela busca (vieram ${fontes.length})`);
  return e;
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
async function pgEscreve<T = unknown>(metodo: string, caminho: string, corpo: unknown, prefer = "return=minimal"): Promise<T | null> {
  const r = await http(`${base()}/${caminho}`, { method: metodo, body: JSON.stringify(corpo), headers: cab({ Prefer: prefer }) });
  if (!r.ok) throw new Error(`gravação em ${caminho.split("?")[0]} falhou (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return prefer.includes("representation") ? await r.json() : null;
}
async function pgRpc<T>(nome: string, args: Obj): Promise<T> {
  const r = await http(`${base()}/rpc/${nome}`, { method: "POST", body: JSON.stringify(args), headers: cab() });
  if (!r.ok) throw new Error(`função ${nome} falhou (${r.status})`);
  return await r.json();
}

const br = (n: number, c = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
/** Bloco de dados da casa: fechamentos e documentos/notícias da semana. Falha em silêncio (a busca cobre). */
export async function dadosDaCasa(p: Pauta, hoje: string): Promise<string> {
  const linhas: string[] = [];
  const desde = somaDias(hoje, -12);
  try {
    const cods = [...p.tickers, "IBOV"].map((c) => `"${c}"`).join(",");
    const cot = await pgGet<{ codigo: string; data_ref: string; fechamento: number }[]>(
      `cotacoes?select=codigo,data_ref,fechamento&codigo=in.(${cods})&data_ref=gte.${desde}&order=data_ref.asc`);
    for (const c of [...p.tickers, "IBOV"]) {
      const s = cot.filter((x) => x.codigo === c);
      if (s.length < 2) continue;
      const ult = s.at(-1)!, sem = s.length >= 6 ? s.at(-6)! : s[0];
      const v = (ult.fechamento / sem.fechamento - 1) * 100;
      linhas.push(`- ${c}: fechou ${c === "IBOV" ? br(ult.fechamento, 0) + " pontos" : "R$ " + br(ult.fechamento)} em ${ult.data_ref}; `
        + `variação de ${v >= 0 ? "+" : ""}${br(v)}% desde ${sem.data_ref} (fechamentos: ${s.slice(-6).map((x) => x.data_ref.slice(5) + " " + br(x.fechamento, c === "IBOV" ? 0 : 2)).join("; ")}). Fonte: B3.`);
    }
  } catch { /* sem cotações: a busca cobre */ }
  try {
    for (const t of p.tickers) {
      const d = await pgRpc<{ emissor?: Obj[]; imprensa?: Obj[] }>("emissor_noticias_dossie", { p_mercado: "br", p_ticker: t, p_dias: 8 });
      for (const x of arr(d.emissor).slice(0, 8)) linhas.push(`- ${t} — documento à CVM em ${String(x.data).slice(0, 10)}: ${txt(x.categoria)} — ${txt(x.titulo)}`);
      for (const x of arr(d.imprensa).slice(0, 10)) linhas.push(`- ${t} — manchete de ${String(x.data).slice(0, 10)} (${txt(x.fonte)}): ${txt(x.titulo)}`
        + (x.sem_comunicado_oficial ? " [sem comunicado oficial da empresa no período]" : ""));
    }
  } catch { /* sem dossiê: a busca cobre */ }
  const vistas = [...new Set(linhas)];
  return vistas.length ? vistas.join("\n") : "- (sem dados da casa nesta semana; apure tudo pela busca)";
}

// ------------------------------------------------------------------ Anthropic (lote)
const cabAnthropic = () => ({ "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "", "anthropic-version": "2023-06-01", "content-type": "application/json" });
export function pedido(mensagens: unknown[], sistema: string, buscas: number, modelo: string): Obj {
  const tools: unknown[] = buscas ? [{ type: "web_search_20250305", name: "web_search", max_uses: buscas }, ENTREGA] : [ENTREGA];
  return { model: modelo, max_tokens: 24000, system: sistema, messages: mensagens, tools };
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

// ------------------------------------------------------------------ foto (Unsplash) no formato da Redação (vm_foto_valida)
const UTM = "utm_source=soliduns_valor_e_mercado&utm_medium=referral";
const comUtm = (u: string) => u ? u + (u.includes("?") ? "&" : "?") + UTM : "";
export async function buscarFoto(termos: string[], log: string[]): Promise<Obj | null> {
  const chave = Deno.env.get("UNSPLASH_ACCESS_KEY");
  if (!chave) { log.push("Foto: UNSPLASH_ACCESS_KEY não configurada — artigo sem foto."); return null; }
  const cabU = { Authorization: `Client-ID ${chave}`, "Accept-Version": "v1" };
  for (const termo of termos.map(txt).filter(Boolean)) {
    let r: Response;
    try { r = await http(`${UNSPLASH}/search/photos?${new URLSearchParams({ query: termo, orientation: "landscape", per_page: "20", content_filter: "high" })}`, { headers: cabU }); }
    catch { continue; }
    if (r.status === 401 || r.status === 403) { log.push(`Foto: chave do Unsplash recusada (${r.status}).`); return null; }
    if (!r.ok) continue;
    const res = arr((await r.json()).results);
    const f = res[Math.floor(Math.random() * Math.min(res.length, 8))];
    if (!f) continue;
    const urls = (f.urls ?? {}) as Obj, user = (f.user ?? {}) as Obj, links = (f.links ?? {}) as Obj;
    const raw = String(urls.raw ?? "");
    if (!raw.startsWith("https://")) continue;
    if (links.download_location) { try { await http(String(links.download_location), { headers: cabU }); } catch { /* melhor esforço */ } }
    const foto: Obj = { src: raw + (raw.includes("?") ? "&" : "?") + "w=1600&h=900&fit=crop&crop=entropy&q=80&auto=format",
      alt: (txt(f.alt_description ?? f.description) || termo).slice(0, 300).padEnd(3, "."), fotografo: (txt(user.name) || "Unsplash").slice(0, 80), origem: "Unsplash" };
    const fu = comUtm(String(((user.links ?? {}) as Obj).html ?? "")), pu = comUtm(String(links.html ?? ""));
    if (fu.startsWith("https://")) foto.fotografo_url = fu;
    if (pu.startsWith("https://")) foto.pagina_url = pu;
    log.push(`Foto: '${termo}' -> ${foto.fotografo} / Unsplash`);
    return foto;
  }
  log.push("Foto: nenhuma encontrada — artigo sem foto.");
  return null;
}

// ------------------------------------------------------------------ execução
export type Execucao = { pauta: string; semana: string; modo: "producao" | "teste"; etapa: string; rodada: number; continuacoes: number;
  reenvios: number; modelo: string; lote_id: string | null; mensagens: unknown[]; buscas: number; urls: Record<string, [string, string]>;
  artigo: Obj | null; fontes: unknown[]; artigo_id: number | null; ent: number; sai: number; nbuscas: number; registro: string[] };
const salvar = (x: Execucao) => pgEscreve("POST", "vm_artigo_semanal_execucoes?on_conflict=pauta,semana,modo",
  [{ ...x, atualizado_em: new Date().toISOString() }], "resolution=merge-duplicates,return=minimal");
const custo = (x: Execucao) => Math.round((x.ent / 1e6 * PRECO_ENT + x.sai / 1e6 * PRECO_SAI + x.nbuscas * PRECO_BUSCA) * 1e4) / 1e4;
const hora = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(11, 16).replace(":", "h");
const anota = (x: Execucao, s: string) => { x.registro = [...(x.registro ?? []), `${hora()} ${s}`].slice(-60); };

export function nova(p: Pauta, semana: string, modo: "producao" | "teste"): Execucao {
  return { pauta: p.id, semana, modo, etapa: "nova", rodada: 0, continuacoes: 0, reenvios: 0, modelo: MODELO, lote_id: null,
    mensagens: [{ role: "user", content: `Apure e escreva o artigo semanal de hoje (${dataExtenso(semana)}) e entregue pela ferramenta entregar_artigo.` }],
    buscas: BUSCAS, urls: {}, artigo: null, fontes: [], artigo_id: null, ent: 0, sai: 0, nbuscas: 0, registro: [] };
}
async function enviarPedido(x: Execucao, p: Pauta) {
  const sistema = instrucoes(p, x.semana, await dadosDaCasa(p, x.semana));
  x.lote_id = await mandarLote(`vm-sem-${x.pauta}-${x.semana}-${x.modo}-${x.rodada}-${x.continuacoes}-${x.reenvios}`, pedido(x.mensagens, sistema, x.buscas, x.modelo));
  x.etapa = "aguardando";
  anota(x, `pedido enviado (rodada ${x.rodada + 1}, ${x.modelo}, até ${x.buscas} buscas)`);
}

export async function processarResposta(x: Execucao, p: Pauta, msg: Obj) {
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
    await enviarPedido(x, p);
    return;
  }
  const entrega = desembrulhar(conteudo.find((b) => b.type === "tool_use" && b.name === "entregar_artigo")?.input);
  let erros: string[]; let lim: ReturnType<typeof limpar> | null = null;
  if (!entrega) erros = ["artigo não entregue pela ferramenta entregar_artigo"];
  else { lim = limpar(entrega, x.urls, p); erros = problemas(lim.a, lim.fontes, lim.dataRef, x.semana, p); }
  anota(x, `conferência (rodada ${x.rodada + 1}): ` + (erros.length ? erros.join("; ") : "OK"));
  if (!erros.length && lim) {
    const log: string[] = [];
    const foto = await buscarFoto([lim.a.foto_busca, lim.a.foto_alternativa, p.foto_busca], log).catch(() => null);
    log.forEach((l) => anota(x, l));
    if (foto) lim.a.foto = foto;
    x.artigo = lim.a as unknown as Obj; x.fontes = lim.fontes; x.etapa = "pronta"; x.mensagens = [];
    anota(x, `pronto: ${lim.a.titulo} — ${lim.fontes.length} fontes — US$ ${custo(x)}`);
    return;
  }
  if (x.rodada >= 1) { x.etapa = "falhou"; x.mensagens = []; anota(x, `NÃO entregue: a conferência falhou duas vezes. US$ ${custo(x)}`); return; }
  const precisaBuscar = erros.some((e) => e.includes("fontes"));
  x.mensagens = [{ role: "user", content: "Este é o artigo semanal que você escreveu:\n" + JSON.stringify(entrega ?? {}).slice(0, 60000) +
    "\n\nEle não passou na conferência automática. Corrija SÓ estes pontos, mantenha o resto e entregue o artigo completo pela ferramenta entregar_artigo" +
    (precisaBuscar ? " (pode fazer até 5 buscas para achar as fontes com o endereço exato)" : "") + ":\n- " + erros.join("\n- ") }];
  x.buscas = precisaBuscar ? 5 : 0; x.rodada = 1; x.continuacoes = 0; x.reenvios = 0;
  await enviarPedido(x, p);
}

/** Grava o artigo na Redação: produção = AGENDADO para o horário da pauta; teste = RASCUNHO. */
export function linhaArtigo(a: Artigo, fontes: unknown[], p: Pauta, x: Execucao): Obj {
  const corpo = a.corpo.map((b) => ({ tipo: b.tipo, conteudo: [{ texto: b.texto }] }));
  const linha: Obj = { tipo: "reportagem", situacao: x.modo === "producao" ? "agendado" : "rascunho", chapeu: a.chapeu.slice(0, 60),
    titulo: a.titulo.slice(0, 90), linha_fina: a.linha_fina.slice(0, 260), autor: AUTOR, editoria: p.editoria, lugar: "artigos",
    corpo, fontes, tags: p.tags.slice(0, 8), seo_titulo: a.seo_titulo || null, seo_descricao: a.seo_descricao || null };
  if (a.foto) linha.foto = a.foto;
  if (x.modo === "producao") linha.publicar_em = publicarEm(x.semana, p.dias_publicar, p.hora_publicar);
  return linha;
}

export async function passo(acao: string, pautaPedida: string | undefined, agora = new Date()): Promise<Obj> {
  const { data, minutos, dia } = agoraBrt(agora);
  const pautas = await pgGet<Pauta[]>("vm_pautas_semanais?select=*&ativa=is.true");
  if (acao === "situacao") {
    const l = await pgGet<Execucao[]>(`vm_artigo_semanal_execucoes?select=pauta,semana,modo,etapa,ent,sai,nbuscas,artigo_id,registro&semana=gte.${somaDias(data, -7)}`);
    return { data, pautas: pautas.map((p) => p.id), execucoes: l.map((e) => ({ pauta: e.pauta, semana: e.semana, modo: e.modo, etapa: e.etapa,
      artigo_id: e.artigo_id, custo_usd: custo(e), registro: e.registro })) };
  }
  const resumo: Obj[] = [];
  for (const p of pautas) {
    if (pautaPedida && p.id !== pautaPedida) continue;
    for (const modo of ["producao", "teste"] as const) {
      if (acao === "teste" && modo === "producao") continue;
      // produção: execução do dia da pauta; teste: a mais recente em andamento (ou nova, se pedida agora)
      let x: Execucao | null = null;
      if (modo === "producao") {
        const l = await pgGet<Execucao[]>(`vm_artigo_semanal_execucoes?select=*&pauta=eq.${p.id}&modo=eq.producao&semana=gte.${somaDias(data, -1)}&order=semana.desc&limit=1`);
        x = l[0] ?? null;
        if (!x) {
          const naJanela = dia === p.dia_escrever && minutos >= p.hora_escrever && minutos <= p.hora_escrever + JANELA_HORAS * 60;
          if (!naJanela) continue;
          x = nova(p, data, "producao"); anota(x, `início (produção) — artigo-semanal v${VERSAO}`);
        }
      } else {
        const l = await pgGet<Execucao[]>(`vm_artigo_semanal_execucoes?select=*&pauta=eq.${p.id}&modo=eq.teste&order=atualizado_em.desc&limit=1`);
        x = l[0] ?? null;
        const terminal = (e: string) => ["agendada", "falhou"].includes(e);
        if (acao === "teste") { if (!x || terminal(x.etapa) || x.semana !== data) { x = nova(p, data, "teste"); anota(x, `início (TESTE) — artigo-semanal v${VERSAO}`); } }
        else if (!x || terminal(x.etapa)) continue;
      }
      if (["agendada", "falhou"].includes(x.etapa)) { resumo.push({ pauta: p.id, modo, etapa: x.etapa }); continue; }
      try {
        if (x.etapa === "nova") await enviarPedido(x, p);
        else if (x.etapa === "aguardando" && x.lote_id) {
          const r = await lerLote(x.lote_id);
          if (r.tipo === "succeeded") await processarResposta(x, p, r.msg);
          else if (r.tipo !== "pendente") {
            anota(x, `lote ${r.tipo}: ${r.erro}`);
            if (/not_found/.test(r.erro) && x.modelo !== RESERVA) { x.modelo = RESERVA; anota(x, `modelo indisponível — usando a reserva ${RESERVA}`); await enviarPedido(x, p); }
            else if (/invalid_request|authentication|permission/.test(r.erro)) { x.etapa = "falhou"; anota(x, "ERRO: pedido recusado pela Anthropic."); }
            else if (++x.reenvios <= MAX_REENVIO) await enviarPedido(x, p);
            else { x.etapa = "falhou"; anota(x, "ERRO: o lote falhou 3 vezes."); }
          }
        }
        if (x.etapa === "pronta" && x.artigo) {
          const g = await pgEscreve<{ id: number }[]>("POST", "vm_artigos", [linhaArtigo(x.artigo as unknown as Artigo, x.fontes, p, x)], "return=representation");
          x.artigo_id = g?.[0]?.id ?? null; x.etapa = "agendada";
          anota(x, x.modo === "producao" ? `gravado na Redação (artigo ${x.artigo_id}), AGENDADO para ${publicarEm(x.semana, p.dias_publicar, p.hora_publicar)}`
                                         : `TESTE gravado na Redação como RASCUNHO (artigo ${x.artigo_id})`);
        }
      } catch (e) { anota(x, `aviso: ${(e as Error).message}`); }
      await salvar(x);
      resumo.push({ pauta: p.id, modo, etapa: x.etapa, custo_usd: custo(x), ultimo: x.registro.at(-1) });
    }
  }
  return { data, resumo: resumo.length ? resumo : "nada a fazer agora" };
}

export async function tratar(req: Request): Promise<Response> {
  const token = Deno.env.get("COLETOR_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) return Response.json({ erro: "não autorizado" }, { status: 401 });
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return Response.json({ erro: "falta ANTHROPIC_API_KEY nos Secrets das Edge Functions" }, { status: 500 });
  let corpo: { acao?: string; pauta?: string } = {};
  try { corpo = await req.json(); } catch { /* vazio */ }
  try { return Response.json({ versao: VERSAO, ...(await passo(corpo.acao ?? "", corpo.pauta)) }); }
  catch (e) { return Response.json({ versao: VERSAO, erro: String((e as Error).message ?? e) }, { status: 500 }); }
}

Deno.serve(tratar);
