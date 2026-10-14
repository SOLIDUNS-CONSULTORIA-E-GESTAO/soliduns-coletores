// SOLIDUNS · Valor e Mercado — Edge Function "scanner-do-dia" — v1.0 (14/10/2026)
//
// ETAPA 3 do plano de fontes (Prompts 14 a 17): escreve o "Scanner do Dia" como RASCUNHO para aprovação humana.
//   1. Monta o contexto do dia SÓ com a base própria: public.cotacoes (indicadores de fechamento e maiores variações
//      da B3) e public.vm_achados (radar: camada livre com o resumo do feed; camada pauta só com o título).
//   2. Chama a API da Anthropic (modelo em VM_MODELO; padrão Sonnet), SEM busca na web, com a instrução de sistema
//      IGUAL ao prompt-sistema-agente.txt, versão 1.0 (texto abaixo da linha de "=", conferido pelo sha256).
//   3. Verificação automática (Prompt 15): números sem referência, referência inexistente, valor que não bate com o
//      registro, lacunas entre colchetes, vocabulário vetado, data futura. Reprovado também vai para a fila, com os
//      pontos destacados: quem decide é o editor.
//   4. Grava em public.vm_materias com situação "rascunho", o modelo, a versão do prompt, o contexto e o custo. NUNCA publica.
//
// Chamada: pg_cron às 6h45 de Brasília (dias úteis) e o botão "Gerar agora"/"Gerar de novo" da redação, via pg_net.
// Corpo opcional: {"so_teste": true} (não grava) · {"devolvida": <id>, "instrucao": "..."} (nova geração pedida pelo editor).
// Variáveis: COLETOR_TOKEN (manual) · ANTHROPIC_API_KEY (manual) · VM_MODELO (opcional) ·
//            SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (automáticas). Nenhuma chave neste arquivo.

const VERSAO = "1.0";
const PROMPT_VERSAO = "1.0";
const PROMPT_SHA256 = "c400ce9e9788afb6d8febbead081e47abe908d21e6f56d2fb8a564065ffffcd0";
// prompt-sistema-agente.txt, versão 1.0 — texto EXATO abaixo da linha de "=" (sem alterações)
export const SISTEMA = "Você escreve para o Valor e Mercado, portal brasileiro de economia e mercado financeiro. Escreve em português do Brasil, para profissionais de finanças, empresários e investidores informados.\n\n**Material.** Você só pode afirmar o que estiver no contexto fornecido nesta mensagem. Não use conhecimento próprio sobre o assunto. Se um dado necessário não estiver no contexto, escreva a lacuna entre colchetes, assim: [verificar valor]. Nunca estime, nunca complete, nunca suponha.\n\n**Estrutura.** Produza: chapéu com uma palavra, título, linha fina, texto em parágrafos e lista de referências. Título com verbo no presente, voz ativa, sem ponto final, até 70 caracteres. Linha fina de 140 a 200 caracteres, acrescentando informação e nunca repetindo o título. Primeiro parágrafo de 35 a 50 palavras com o que aconteceu, quanto, quando e segundo qual documento. Parágrafos seguintes com duas a quatro frases cada, em ordem decrescente de importância.\n\n**Números.** Vírgula decimal e ponto de milhar. Câmbio com quatro casas, percentual com duas, pontos de índice sem decimal. Variação sempre com sinal. Diferença entre taxas se expressa em pontos percentuais, nunca em por cento. Toda variação declara a base de comparação. Índice de bolsa se expressa em pontos, jamais em reais. Horário no formato 18h30.\n\n**Atribuição.** Toda informação declara sua origem: segundo o comunicado, de acordo com a ata, dados do IBGE mostram. Cada número do texto precisa constar na lista de referências, ligado ao identificador do registro que o originou no contexto.\n\n**Proibições, sem exceção.** Não atribua causa a movimento de mercado, a menos que a causa esteja declarada no próprio documento; use \"em sessão marcada por\" ou \"no mesmo dia em que\". Não faça previsão; pode relatar previsão de terceiro, com atribuição. Não recomende compra, venda ou alocação. Não use primeira pessoa. Não invente declaração nem atribua fala a ninguém. Não escreva \"fontes de mercado\", \"pessoas próximas\" ou \"apurou o Valor e Mercado\". Não reproduza texto de terceiros.\n\n**Vocabulário vetado.** disparar, despencar, desabar, derreter, euforia, pânico, sangria, massacre, festa, no radar dos investidores, o mercado precifica, em meio a, cenário desafiador, diante das incertezas.\n\n**Saída.** Responda apenas com um objeto JSON, sem texto antes ou depois, sem marcação de código, contendo: chapeu, titulo, linha_fina, paragrafos (lista de textos), editoria_sugerida, tags (lista) e referencias (lista de objetos com o número citado e o identificador do registro de origem).";

const MODELO = Deno.env.get("VM_MODELO") || "claude-sonnet-5-5";
const RESERVA = "claude-sonnet-4-5";
const ANTHROPIC_URL = Deno.env.get("VM_ANTHROPIC_URL") ?? "https://api.anthropic.com/v1/messages";   // troca só em teste
const PRECO_ENT = 3.0, PRECO_SAI = 15.0;    // US$ por milhão de tokens (estimativa para o registro de custo)
const INDICADORES = ["SELIC", "CDI", "IPCA", "USD", "EUR", "BOVA11"];
const VOLUME_MIN = 50e6;                    // maiores variações: só papéis com R$ 50 milhões ou mais negociados
const VETADAS = ["disparar", "dispara", "disparou", "despencar", "despenca", "despencou", "desabar", "desaba", "desabou",
  "derreter", "derrete", "derreteu", "euforia", "pânico", "sangria", "massacre", "festa", "no radar dos investidores",
  "o mercado precifica", "em meio a", "cenário desafiador", "diante das incertezas"];
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

type Registro = Record<string, unknown> & { id: string };
export type Contexto = { data_de_hoje: string; indicadores: Registro[]; maiores_variacoes_b3: Registro[];
  fontes_oficiais_livres: Registro[]; assuntos_em_pauta: Registro[]; observacao: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);
export function hojeBrasilia(agora = new Date()): Date { return new Date(iso(new Date(agora.getTime() - 3 * 3600e3)) + "T00:00:00Z"); }
const extenso = (d: Date) => `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;

// ------------------------------------------------------------------ Supabase (PostgREST)
function cab(extra: Record<string, string> = {}): Record<string, string> {
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const h: Record<string, string> = { apikey: chave, "Content-Type": "application/json", ...extra };
  if (!chave.startsWith("sb_")) h.Authorization = `Bearer ${chave}`;
  return h;
}
const base = () => `${Deno.env.get("SUPABASE_URL")}/rest/v1`;
async function pgGet<T>(caminho: string): Promise<T> {
  const r = await fetch(`${base()}/${caminho}`, { headers: cab() });
  if (!r.ok) throw new Error(`leitura falhou (${r.status}) em ${caminho.split("?")[0]} — rodou as migrations 137 e 138?`);
  return await r.json();
}
async function pgPost(tabela: string, linhas: unknown[], prefer = "return=minimal"): Promise<unknown> {
  const r = await fetch(`${base()}/${tabela}`, { method: "POST", body: JSON.stringify(linhas), headers: cab({ Prefer: prefer }) });
  if (!r.ok) throw new Error(`gravação em ${tabela} falhou (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return prefer.includes("representation") ? await r.json() : null;
}

// ------------------------------------------------------------------ contexto do dia
type Cot = { id: number; fonte: string; codigo: string; descricao: string | null; data_ref: string; fechamento: number;
  unidade: string; url_fonte: string; volume?: number | null; codbdi?: string | null };
type Ach = { id: number; fonte_nome: string; camada: string; titulo: string; resumo: string | null; link: string; publicado_em: string | null };

export async function montarContexto(hoje: Date): Promise<{ ctx: Contexto; urls: Record<string, { fonte: string; url: string }> }> {
  const urls: Record<string, { fonte: string; url: string }> = {};
  const indicadores: Registro[] = [];
  for (const cod of INDICADORES) {
    const fonte = cod === "BOVA11" ? "&fonte=eq.B3%20COTAHIST" : "";
    const ls = await pgGet<Cot[]>(`cotacoes?select=id,fonte,codigo,descricao,data_ref,fechamento,unidade,url_fonte&codigo=eq.${cod}${fonte}` +
      `&data_ref=lte.${iso(hoje)}&order=data_ref.desc&limit=2`);
    for (const c of ls) {
      const id = `cot:${c.id}`;
      indicadores.push({ id, codigo: c.codigo, descricao: cod === "BOVA11" ? "BOVA11, fundo de índice que replica o Ibovespa (preço da cota, em reais)" : c.descricao,
        data_de_referencia: c.data_ref, valor: c.fechamento, unidade: c.unidade, fonte: c.fonte });
      urls[id] = { fonte: c.fonte, url: c.url_fonte };
    }
  }
  const variacoes: Registro[] = [];
  const d1 = (await pgGet<{ data_ref: string }[]>(`cotacoes?select=data_ref&fonte=eq.B3%20COTAHIST&data_ref=lte.${iso(hoje)}&order=data_ref.desc&limit=1`))[0]?.data_ref;
  const d0 = d1 ? (await pgGet<{ data_ref: string }[]>(`cotacoes?select=data_ref&fonte=eq.B3%20COTAHIST&data_ref=lt.${d1}&order=data_ref.desc&limit=1`))[0]?.data_ref : undefined;
  if (d1 && d0) {
    const sel = "select=id,codigo,fechamento,volume,url_fonte,fonte&fonte=eq.B3%20COTAHIST&codbdi=eq.02";
    const hojeB3 = await pgGet<Cot[]>(`cotacoes?${sel}&data_ref=eq.${d1}&volume=gte.${VOLUME_MIN}&limit=2000`);
    const antes = new Map((await pgGet<Cot[]>(`cotacoes?${sel}&data_ref=eq.${d0}&limit=5000`)).map((c) => [c.codigo, c]));
    const comVar = hojeB3.flatMap((c) => {
      const a = antes.get(c.codigo);
      return a && a.fechamento > 0 ? [{ c, a, v: Math.round((c.fechamento / a.fechamento - 1) * 10000) / 100 }] : [];
    }).sort((x, y) => y.v - x.v);
    const escolhidos = [...comVar.slice(0, 5), ...comVar.slice(-5).reverse()].filter((x, i, arr) => arr.findIndex((y) => y.c.id === x.c.id) === i);
    for (const { c, a, v } of escolhidos) {
      const id = `cot:${c.id}`;
      variacoes.push({ id, ticker: c.codigo, pregao: d1, fechamento_reais: c.fechamento, pregao_anterior: d0,
        fechamento_anterior_reais: a.fechamento, variacao_percentual: v, volume_financeiro_reais: c.volume, fonte: "B3 COTAHIST" });
      urls[id] = { fonte: "B3 COTAHIST", url: c.url_fonte };
    }
  }
  const desde = new Date(Date.now() - 30 * 3600e3).toISOString();
  const achados = await pgGet<Ach[]>(`vm_achados?select=id,fonte_nome,camada,titulo,resumo,link,publicado_em&coletado_em=gte.${desde}` +
    `&order=publicado_em.desc.nullslast&limit=80`);
  const livres: Registro[] = [], pauta: Registro[] = [];
  for (const a of achados) {
    const id = `ach:${a.id}`;
    urls[id] = { fonte: a.fonte_nome, url: a.link };
    if (a.camada === "livre" && livres.length < 30) livres.push({ id, fonte: a.fonte_nome, titulo: a.titulo, resumo: a.resumo, publicado_em: a.publicado_em, link: a.link });
    else if (a.camada === "pauta" && pauta.length < 30) pauta.push({ id, fonte: a.fonte_nome, assunto: a.titulo, publicado_em: a.publicado_em });
  }
  return { urls, ctx: { data_de_hoje: iso(hoje), indicadores, maiores_variacoes_b3: variacoes, fontes_oficiais_livres: livres, assuntos_em_pauta: pauta,
    observacao: "Indicadores e cotações são de FECHAMENTO. 'fontes_oficiais_livres' trazem só o resumo publicado pela própria fonte (uso com crédito). " +
      "'assuntos_em_pauta' trazem só o assunto: o texto desses veículos não está no contexto e não pode ser reproduzido nem resumido." } };
}

export function pedido(hoje: Date, ctx: Contexto, anterior?: unknown, instrucao?: string): string {
  return `Escreva o "Scanner do Dia" do Valor e Mercado para ${extenso(hoje)}: a análise que abre a coluna "O que move o dia" na home. ` +
    "Reúna, em ordem decrescente de importância, o que os indicadores de fechamento mais recentes mostram, as maiores variações da bolsa no último pregão " +
    "e o que as fontes oficiais publicaram nas últimas 24 horas. Use o chapéu \"Scanner\". " +
    "Os identificadores das referências são o campo \"id\" de cada registro do contexto. " +
    "Itens de \"assuntos_em_pauta\" só podem ser citados como tema, com atribuição ao veículo; não reproduza nem resuma o texto deles." +
    (instrucao ? `\n\nINSTRUÇÃO DO EDITOR PARA ESTA NOVA VERSÃO: ${instrucao}\n\nVERSÃO ANTERIOR (devolvida pelo editor):\n${JSON.stringify(anterior)}` : "") +
    `\n\nCONTEXTO:\n${JSON.stringify(ctx)}`;
}

// ------------------------------------------------------------------ Anthropic
async function chamar(mensagens: unknown[]): Promise<{ texto: string; modelo: string; ent: number; sai: number }> {
  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) throw new Error("Defina ANTHROPIC_API_KEY nos segredos das Edge Functions.");
  let ultimo = "";
  for (const modelo of [MODELO, RESERVA].filter((m, i, a) => a.indexOf(m) === i)) {
    for (let t = 0; t < 3; t++) {
      const r = await fetch(ANTHROPIC_URL, { method: "POST", headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: modelo, max_tokens: 4000, system: SISTEMA, messages: mensagens }) });
      const corpo = await r.text();
      if (r.ok) {
        const j = JSON.parse(corpo);
        const texto = (j.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
        return { texto, modelo, ent: j.usage?.input_tokens ?? 0, sai: j.usage?.output_tokens ?? 0 };
      }
      ultimo = `${r.status}: ${corpo.slice(0, 200)}`;
      if ((r.status === 400 || r.status === 404) && corpo.toLowerCase().includes("model")) break;      // tenta o modelo reserva
      if (r.status === 401 || r.status === 403) throw new Error(`Chave da Anthropic recusada (${r.status}).`);
      if ([429, 500, 502, 503, 529].includes(r.status)) { await new Promise((ok) => setTimeout(ok, 8000 * (t + 1))); continue; }
      throw new Error(`Erro da Anthropic ${ultimo}`);
    }
  }
  throw new Error(`Nenhum modelo respondeu (${ultimo}).`);
}
export function extrairJson(t: string): Record<string, unknown> {
  let s = (t ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const i = s.indexOf("{"), f = s.lastIndexOf("}");
  if (i < 0 || f <= i) throw new Error("resposta sem JSON");
  s = s.slice(i, f + 1);
  const j = JSON.parse(s);
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("JSON não é um objeto");
  return j;
}

// ------------------------------------------------------------------ verificação automática (Prompt 15)
export type Checagem = { checagem: string; ok: boolean; bloqueia: boolean; detalhe: string[] };
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const numBr = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));
function decimais(s: string) { const p = s.split(","); return p.length > 1 ? p[1].length : 0; }
// números do texto, sem datas (14/10, 2026), horários (18h30) e ordinais
export function numerosDoTexto(t: string): string[] {
  const limpo = t.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ")
    .replace(new RegExp(`\\b\\d{1,2}(º)? de (${MESES.join("|")})\\b`, "gi"), " ").replace(/\b\d{1,2}h\d{0,2}\b/gi, " ")
    .replace(/\b\d+[ºª]/g, " ").replace(/\((\d{1,2})\)/g, " ");
  return (limpo.match(/(?<![\w.,])[-+−]?\d{1,3}(?:\.\d{3})+(?:,\d+)?|(?<![\w.,])[-+−]?\d+(?:,\d+)?/g) ?? [])
    .map((x) => x.replace(/^[+−-]/, "")).filter((x) => !/^(19|20)\d{2}$/.test(x));
}
function valoresDoRegistro(r: Registro | undefined): number[] {
  if (!r) return [];
  return Object.values(r).flatMap((v) => typeof v === "number" ? [v] : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? [parseFloat(v)] : []);
}
export function verificar(g: Record<string, unknown>, ctx: Contexto, hoje: Date): Checagem[] {
  const ch: Checagem[] = [];
  const pars = Array.isArray(g.paragrafos) ? (g.paragrafos as unknown[]).map(String) : [];
  const refs = Array.isArray(g.referencias) ? g.referencias as Record<string, unknown>[] : [];
  const faltam = ["chapeu", "titulo", "linha_fina"].filter((k) => !String(g[k] ?? "").trim());
  ch.push({ checagem: "campos", ok: !faltam.length && pars.length > 0 && Array.isArray(g.referencias), bloqueia: true,
    detalhe: [...faltam.map((k) => `campo vazio: ${k}`), ...(pars.length ? [] : ["sem parágrafos"])] });
  const registros = new Map<string, Registro>([...ctx.indicadores, ...ctx.maiores_variacoes_b3, ...ctx.fontes_oficiais_livres, ...ctx.assuntos_em_pauta].map((r) => [r.id, r]));
  const idRef = (r: Record<string, unknown>) => String(r.identificador ?? r.id ?? r.registro ?? r.id_registro ?? "").trim();
  const numRef = (r: Record<string, unknown>) => String(r.numero ?? r["número"] ?? r.valor ?? "").trim();
  const inexistentes = refs.filter((r) => !registros.has(idRef(r))).map((r) => `${numRef(r)} → "${idRef(r)}" não existe no contexto`);
  ch.push({ checagem: "referencias_existem", ok: !inexistentes.length, bloqueia: true, detalhe: inexistentes });
  const divergentes: string[] = [];
  for (const r of refs) {
    const reg = registros.get(idRef(r)), n = numRef(r).replace(/[^\d.,-]/g, "");
    if (!reg || !n) continue;
    const v = numBr(n), d = decimais(n), vals = valoresDoRegistro(reg);
    // compara em módulo (queda "de 5,00%" = −5) e aceita escala de mil, milhão e bilhão (R$ 900 milhões = 900000000)
    const bate = (x: number) => [1, 1e3, 1e6, 1e9].some((k) => Math.abs(Math.round(Math.abs(x) / k * 10 ** d) / 10 ** d - Math.abs(v)) < 0.5 / 10 ** d + 1e-9);
    if (Number.isFinite(v) && vals.length && !vals.some(bate))
      divergentes.push(`${numRef(r)} não confere com o registro ${idRef(r)} (${vals.join(" / ")})`);
  }
  ch.push({ checagem: "valores_conferem", ok: !divergentes.length, bloqueia: true, detalhe: divergentes });
  const texto = [g.titulo, g.linha_fina, ...pars].map(String).join(" \n ");
  const citados = new Set(refs.map((r) => numRef(r).replace(/[^\d.,]/g, "")));
  const semRef = [...new Set(numerosDoTexto(texto))].filter((n) => !citados.has(n));
  ch.push({ checagem: "numeros_com_referencia", ok: !semRef.length, bloqueia: true, detalhe: semRef.map((n) => `${n} sem referência`) });
  const lacunas = texto.match(/\[[^\]]{2,80}\]/g) ?? [];
  ch.push({ checagem: "lacunas", ok: !lacunas.length, bloqueia: true, detalhe: lacunas.map((l) => `lacuna a preencher: ${l}`) });
  const t = ` ${semAcento(texto)} `;
  const vet = VETADAS.filter((p) => new RegExp(`[^a-z]${semAcento(p)}[^a-z]`).test(t));
  ch.push({ checagem: "vocabulario_vetado", ok: !vet.length, bloqueia: true, detalhe: vet.map((p) => `vetado: "${p}"`) });
  const futuras = (texto.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) ?? []).filter((d) => { const [dd, mm, aa] = d.split("/"); return `${aa}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}` > iso(hoje); });
  ch.push({ checagem: "datas", ok: !futuras.length, bloqueia: true, detalhe: futuras.map((d) => `data posterior a hoje: ${d}`) });
  const tit = String(g.titulo ?? ""), lf = String(g.linha_fina ?? "");
  const forma = [...(tit.length > 70 ? [`título com ${tit.length} caracteres (máx. 70)`] : []), ...(/\.\s*$/.test(tit) ? ["título termina em ponto"] : []),
    ...((lf.length < 140 || lf.length > 200) ? [`linha fina com ${lf.length} caracteres (140 a 200)`] : [])];
  ch.push({ checagem: "forma", ok: !forma.length, bloqueia: false, detalhe: forma });
  return ch;
}

// ------------------------------------------------------------------ handler
export async function tratar(req: Request): Promise<Response> {
  const token = Deno.env.get("COLETOR_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) return Response.json({ erro: "não autorizado" }, { status: 401 });
  let corpo: { so_teste?: boolean; devolvida?: number; instrucao?: string } = {};
  try { corpo = await req.json(); } catch (_) { /* vazio */ }
  const hoje = hojeBrasilia(), resumo: Record<string, unknown> = { versao: VERSAO, prompt_versao: PROMPT_VERSAO };
  try {
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SISTEMA))))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    if (sha !== PROMPT_SHA256) throw new Error("o texto do prompt de sistema foi alterado (sha256 não confere)");
    let anterior: unknown;
    if (corpo.devolvida) anterior = (await pgGet<{ gerado: unknown }[]>(`vm_materias?select=gerado&id=eq.${Number(corpo.devolvida)}`))[0]?.gerado;
    const { ctx, urls } = await montarContexto(hoje);
    resumo.contexto = { indicadores: ctx.indicadores.length, variacoes: ctx.maiores_variacoes_b3.length,
      livres: ctx.fontes_oficiais_livres.length, pauta: ctx.assuntos_em_pauta.length };
    if (!ctx.indicadores.length && !ctx.fontes_oficiais_livres.length) throw new Error("contexto vazio: sem indicadores nem achados para escrever");
    const msgs: { role: string; content: string }[] = [{ role: "user", content: pedido(hoje, ctx, anterior, corpo.instrucao) }];
    let r = await chamar(msgs), ent = r.ent, sai = r.sai, gerado: Record<string, unknown>;
    try { gerado = extrairJson(r.texto); } catch (_) {
      msgs.push({ role: "assistant", content: r.texto || "(vazio)" }, { role: "user", content: "A resposta não é um objeto JSON válido. Responda apenas com o objeto JSON pedido, sem texto antes ou depois." });
      r = await chamar(msgs); ent += r.ent; sai += r.sai;
      gerado = extrairJson(r.texto);
    }
    const verificacoes = verificar(gerado, ctx, hoje);
    const ok = verificacoes.every((c) => c.ok || !c.bloqueia);
    const refs = Array.isArray(gerado.referencias) ? gerado.referencias as Record<string, unknown>[] : [];
    const vistos = new Set<string>(), fontes: { id: string; fonte: string; url: string }[] = [];
    for (const x of refs) {
      const id = String(x.identificador ?? x.id ?? x.registro ?? x.id_registro ?? "").trim(), u = urls[id];
      if (u && !vistos.has(u.url)) { vistos.add(u.url); fontes.push({ id, ...u }); }
    }
    const custo = Math.round((ent / 1e6 * PRECO_ENT + sai / 1e6 * PRECO_SAI) * 10000) / 10000;
    const linha = { tipo: "scanner", data_ref: iso(hoje), situacao: "rascunho", gerado, fontes, contexto: ctx, verificacoes, verificacao_ok: ok,
      gerado_por_ia: true, modelo: r.modelo, prompt_versao: PROMPT_VERSAO, prompt_sha256: sha, instrucao_extra: corpo.instrucao ?? null,
      origem_id: corpo.devolvida ? Number(corpo.devolvida) : null, tokens_entrada: ent, tokens_saida: sai, custo_usd: custo };
    Object.assign(resumo, { titulo: gerado.titulo, verificacao_ok: ok, reprovacoes: verificacoes.filter((c) => !c.ok && c.bloqueia).map((c) => c.checagem),
      modelo: r.modelo, custo_usd: custo });
    if (corpo.so_teste) { resumo.rascunho = { gerado, verificacoes, fontes }; return Response.json(resumo); }
    const gravada = await pgPost("vm_materias", [linha], "return=representation") as { id: number }[];
    resumo.id = gravada?.[0]?.id;
    await pgPost("vm_coletas", [{ coletor: "scanner-do-dia", situacao: "ok", novos: 1, detalhe: resumo, erro: null }]);
    return Response.json(resumo);
  } catch (e) {
    resumo.erro = String((e as Error).message ?? e);
    try { if (!corpo.so_teste) await pgPost("vm_coletas", [{ coletor: "scanner-do-dia", situacao: "erro", novos: 0, detalhe: null, erro: resumo.erro }]); } catch (_) { /* sem registro */ }
    return Response.json(resumo, { status: 500 });
  }
}

Deno.serve(tratar);
