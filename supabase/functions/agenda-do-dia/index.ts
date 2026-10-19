// SOLIDUNS · Valor e Mercado — Edge Function "agenda-do-dia" — v1.0 (14/10/2026)
//
// Radar da agenda do dia (decisão do Thiago, 14/10 15h43): o Sonnet PESQUISA NA WEB o que acontece hoje e grava cada
// item em public.vm_agenda (origem = 'pesquisa_web'), com horário de Brasília, consenso, fonte e link:
//   CVM (julgamentos, prazos, eventos corporativos: resultados, assembleias, ofertas) · Banco Central (Copom, Focus,
//   divulgações, leilões, falas de diretores) · Governo e Congresso (agenda da Fazenda e do Planalto, votações, leilões do
//   Tesouro, IBGE) · Federal Reserve (FOMC, falas, Livro Bege) · Agenda EUA (BLS, BEA, Census, Tesouro americano,
//   balanços) · principais fatos previstos para o dia.
// Só entram links que a busca realmente devolveu. Os coletores de calendários oficiais, quando existirem, gravam na mesma
// tabela com origem = 'calendario_oficial'. O "Scanner do Dia" (6h45) usa esta agenda como contexto.
//
// Chamada: pg_cron às 6h15 de Brasília (dias úteis) via pg_net, com "Authorization: Bearer <COLETOR_TOKEN>".
// Corpo opcional: {"so_teste": true} (pesquisa e confere, não grava).
// Variáveis: COLETOR_TOKEN · ANTHROPIC_API_KEY · VM_MODELO (opcional) · VM_BUSCAS (opcional, padrão 10) ·
//            SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (automáticas). Nenhuma chave neste arquivo.

const VERSAO = "1.1";   // v1.1 (19/10/2026, pedido do Thiago): agenda de INDICADORES do universo public.vm_indicadores_universo
                        // (SQL 168); na segunda-feira, a semana inteira (segunda a sexta). Impacto vem da lista mestre, não da IA.
const MODELO = Deno.env.get("VM_MODELO") || "claude-sonnet-5-5";
const RESERVA = "claude-sonnet-4-5";
const BUSCAS = Math.max(1, Math.min(20, parseInt(Deno.env.get("VM_BUSCAS") ?? "12", 10) || 12));
const BUSCAS_SEMANA = Math.max(1, Math.min(24, parseInt(Deno.env.get("VM_BUSCAS_SEMANA") ?? "16", 10) || 16));   // v1.1: segunda-feira
const ANTHROPIC_URL = Deno.env.get("VM_ANTHROPIC_URL") ?? "https://api.anthropic.com/v1/messages";   // troca só em teste
const PRECO_ENT = 3.0, PRECO_SAI = 15.0, PRECO_BUSCA = 0.01;
const CATEGORIAS = ["CVM", "Banco Central", "Governo e Congresso", "Federal Reserve", "Agenda EUA", "Empresas", "Outros"];
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const soma = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
export type Universo = { id: string; pais: string; grupo: string; indicador: string; instituicao: string; impacto: string; frequencia: string | null };
export const ehSegunda = (d: Date) => d.getUTCDay() === 1;
export function hojeBrasilia(agora = new Date()): Date { return new Date(iso(new Date(agora.getTime() - 3 * 3600e3)) + "T00:00:00Z"); }
const extenso = (d: Date) => `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;

const TXT = { type: "string" };
const ENTREGA = {
  name: "entregar_agenda",
  description: "Entrega a agenda do dia apurada na busca.",
  input_schema: { type: "object", required: ["itens"], properties: { itens: { type: "array", items: { type: "object",
    required: ["tipo", "data", "hora", "regiao", "categoria", "evento", "fonte", "url"],
    properties: { tipo: { type: "string", enum: ["indicador", "evento"] }, universo_id: TXT, data: TXT, hora: TXT,
      regiao: { type: "string", enum: ["br", "us", "global"] }, categoria: { type: "string", enum: CATEGORIAS },
      evento: TXT, referencia: TXT, consenso: TXT, anterior: TXT, fonte: TXT, url: TXT } } } } },
};

export function instrucoes(hoje: Date, universo: Universo[] = []): string {
  const semana = ehSegunda(hoje), fim = soma(hoje, 4);
  const periodo = semana ? `de HOJE, ${extenso(hoje)} (${iso(hoje)}), até SEXTA-FEIRA, ${extenso(fim)} (${iso(fim)})` : `de HOJE, ${extenso(hoje)} (${iso(hoje)})`;
  const lista = universo.map((u) => `${u.id} | ${u.pais} | ${u.indicador} | ${u.instituicao}`).join("\n");
  return `Você é o pesquisador de agenda do Valor e Mercado, portal brasileiro de economia e mercado financeiro.
Use a busca na web para levantar a agenda ${periodo}${semana ? " — é segunda-feira: levante a AGENDA DA SEMANA inteira de divulgação de indicadores econômicos" : ""}.

1. INDICADORES ECONÔMICOS (tipo "indicador"): todas as divulgações previstas no período dos indicadores da LISTA MESTRE abaixo (Brasil e EUA).
   Procure em calendários econômicos e nas páginas oficiais das instituições (IBGE, FGV, Banco Central, Tesouro, MTE, BLS, BEA, Census, Federal Reserve, ISM, Conference Board e as demais da lista).
   Para cada divulgação: universo_id (o código da lista), data (AAAA-MM-DD), horário de Brasília, referencia (período a que o dado se refere, ex.: "outubro", "3º trimestre", "semana até 17/10"),
   consenso e anterior (resultado anterior) SÓ quando a fonte trouxer o número.
2. OUTROS EVENTOS DE HOJE (tipo "evento"): CVM (julgamentos, prazos, resultados, assembleias, ofertas), falas de dirigentes do Banco Central e do Fed,
   agenda da Fazenda e do Planalto, votações no Congresso, leilões do Tesouro Nacional e do Tesouro americano, balanços de grandes empresas.${semana ? " Eventos só de HOJE; indicadores, a semana inteira." : ""}

LISTA MESTRE (universo_id | país | indicador | instituição):
${lista || "(lista indisponível: use os principais indicadores do IBGE, FGV, Banco Central, Tesouro, MTE, BLS, BEA, Census, Fed e ISM)"}

Regras:
- horário de Brasília no formato 09h00 (sem horário definido: "Dia todo" ou "A definir"); lembre que os dados americanos saem em horário de Nova York (converta para Brasília);
- não invente data, horário, número nem endereço; na dúvida, deixe o item de fora;
- cada item com o nome da fonte e o endereço EXATO de uma página devolvida pela busca que confirma a divulgação;
- indicador que não estiver na lista mestre pode entrar como "indicador" sem universo_id, se for relevante para o mercado;
- não escreva comentários entre as buscas.
Ao terminar, chame a ferramenta "entregar_agenda" uma única vez, com todos os itens (${semana ? "de 15 a 90" : "de 8 a 45"}).`;
}

// ------------------------------------------------------------------ Anthropic (com busca na web)
type Uso = { ent: number; sai: number; buscas: number; modelo: string };
export const normUrl = (u: string) => String(u || "").trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").split("#")[0]
  .replace(/[?&](utm_[^=&]+|ref|fbclid|gclid)=[^&]*/g, "").replace(/\/+$/, "");

async function pesquisar(hoje: Date, urls: Map<string, string>, uso: Uso, universo: Universo[]): Promise<Record<string, unknown>[] | null> {
  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) throw new Error("Defina ANTHROPIC_API_KEY nos segredos das Edge Functions.");
  let msgs: unknown[] = [{ role: "user", content: ehSegunda(hoje)
    ? `Levante a agenda de indicadores da semana (${iso(hoje)} a ${iso(soma(hoje, 4))}) e os eventos de hoje, e entregue pela ferramenta entregar_agenda.`
    : `Levante a agenda de hoje (${extenso(hoje)}) e entregue pela ferramenta entregar_agenda.` }];
  const corpoBase = { max_tokens: 20000, system: instrucoes(hoje, universo),
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: ehSegunda(hoje) ? BUSCAS_SEMANA : BUSCAS }, ENTREGA] };
  for (let volta = 0; volta < 6; volta++) {
    let resp: Record<string, unknown> | null = null, ultimo = "";
    for (const modelo of [MODELO, RESERVA].filter((m, i, a) => a.indexOf(m) === i)) {
      for (let t = 0; t < 3 && !resp; t++) {
        const r = await fetch(ANTHROPIC_URL, { method: "POST", headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ ...corpoBase, model: modelo, messages: msgs }) });
        const txt = await r.text();
        if (r.ok) { resp = JSON.parse(txt); uso.modelo = modelo; break; }
        ultimo = `${r.status}: ${txt.slice(0, 200)}`;
        if ((r.status === 400 || r.status === 404) && txt.toLowerCase().includes("model")) break;
        if (r.status === 401 || r.status === 403) throw new Error(`Chave da Anthropic recusada (${r.status}).`);
        if ([429, 500, 502, 503, 529].includes(r.status)) { await new Promise((ok) => setTimeout(ok, 10000 * (t + 1))); continue; }
        throw new Error(`Erro da Anthropic ${ultimo}`);
      }
      if (resp) break;
    }
    if (!resp) throw new Error(`Nenhum modelo respondeu (${ultimo}).`);
    const u = (resp.usage ?? {}) as Record<string, number & Record<string, number>>;
    uso.ent += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0); uso.sai += u.output_tokens ?? 0;
    uso.buscas += (u.server_tool_use as unknown as Record<string, number>)?.web_search_requests ?? 0;
    const blocos = (resp.content ?? []) as Record<string, unknown>[];
    for (const b of blocos) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content))
        for (const x of b.content as Record<string, string>[]) if (x.url) urls.set(normUrl(x.url), x.url);
      for (const c of (b.citations ?? []) as Record<string, string>[]) if (c.url && !urls.has(normUrl(c.url))) urls.set(normUrl(c.url), c.url);
    }
    const entrega = blocos.find((b) => b.type === "tool_use" && b.name === "entregar_agenda");
    if (entrega) {
      const inp = entrega.input as Record<string, unknown>;
      const itens = typeof inp?.itens === "string" ? JSON.parse(inp.itens as string) : inp?.itens;
      return Array.isArray(itens) ? itens : null;
    }
    if (resp.stop_reason === "pause_turn") { msgs = [...msgs, { role: "assistant", content: blocos }]; continue; }
    // terminou sem entregar: pede a entrega, sem novas buscas
    msgs = [...msgs, { role: "assistant", content: blocos }, { role: "user", content: "Entregue agora a agenda pela ferramenta entregar_agenda, com os itens já apurados." }];
  }
  return null;
}

// ------------------------------------------------------------------ conferência dos itens
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function horaNorm(h: string): string {
  const m = String(h || "").match(/(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (m && Number(m[1]) < 24) return `${m[1].padStart(2, "0")}h${m[2] ?? "00"}`;
  const t = String(h || "").trim();
  return /dia todo/i.test(t) ? "Dia todo" : "A definir";
}
export function limparItens(itens: Record<string, unknown>[], urls: Map<string, string>, hoje: Date, universo: Universo[] = []):
    { linhas: Record<string, unknown>[]; descartados: string[] } {
  const linhas: Record<string, unknown>[] = [], descartados: string[] = [], chaves = new Set<string>();
  const porId = new Map(universo.map((u) => [u.id, u]));
  const ultimo = iso(soma(hoje, ehSegunda(hoje) ? 4 : 0));
  const vazio = (v: unknown) => { const t = String(v ?? "").trim(); return /^(sem consenso|n\/?d|n\/?a|-|—|null)?$/i.test(t) ? null : t; };
  for (const it of itens ?? []) {
    const evento = String(it.evento ?? "").replace(/\s+/g, " ").trim();
    const url = urls.get(normUrl(String(it.url ?? "")));
    if (!evento) continue;
    if (!url) { descartados.push(`${evento.slice(0, 80)} (endereço não veio da busca)`); continue; }
    const u = porId.get(String(it.universo_id ?? "").trim());
    const tipo = u || it.tipo === "indicador" ? "indicador" : "evento";
    let data = /^\d{4}-\d{2}-\d{2}$/.test(String(it.data ?? "")) ? String(it.data) : iso(hoje);
    if (data < iso(hoje) || data > ultimo) { descartados.push(`${evento.slice(0, 80)} (data ${data} fora do período)`); continue; }
    if (tipo === "evento" && data !== iso(hoje)) continue;                 // eventos: só os de hoje
    const hora = horaNorm(String(it.hora ?? ""));
    const regiao = u ? (u.pais === "BR" ? "br" : "us") : ["br", "us", "global"].includes(String(it.regiao)) ? String(it.regiao) : "global";
    const categoria = CATEGORIAS.includes(String(it.categoria)) ? String(it.categoria) : "Outros";
    const nome = u ? u.indicador : evento;
    const chave = `${data}|pesquisa_web|${hora}|${semAcento(u ? u.id : evento).replace(/[^a-z0-9]+/g, " ").trim().slice(0, 160)}`;
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    linhas.push({ data_ref: data, hora, regiao, categoria, evento: evento.slice(0, 400),
      consenso: vazio(it.consenso)?.slice(0, 200) ?? null,
      fonte: String(it.fonte ?? "").trim().slice(0, 120) || new URL(url).hostname, url, origem: "pesquisa_web", chave,
      tipo, pais: u ? u.pais : tipo === "indicador" ? (regiao === "us" ? "EUA" : regiao === "br" ? "BR" : null) : null,
      grupo: u ? u.grupo : tipo === "indicador" ? "Atividade, Preços e Outros" : null,
      indicador: tipo === "indicador" ? nome.slice(0, 200) : null, instituicao: u ? u.instituicao : null,
      impacto: u ? u.impacto : tipo === "indicador" ? "baixo" : null,                       // impacto da LISTA MESTRE, nunca da IA
      referencia: vazio(it.referencia)?.slice(0, 80) ?? null, anterior: vazio(it.anterior)?.slice(0, 80) ?? null });
  }
  linhas.sort((a, b) => `${a.data_ref}${a.hora}`.localeCompare(`${b.data_ref}${b.hora}`));
  return { linhas, descartados };
}

// ------------------------------------------------------------------ Supabase (PostgREST)
function cab(extra: Record<string, string> = {}): Record<string, string> {
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const h: Record<string, string> = { apikey: chave, "Content-Type": "application/json", ...extra };
  if (!chave.startsWith("sb_")) h.Authorization = `Bearer ${chave}`;
  return h;
}
async function pgGet<T>(caminho: string): Promise<T> {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/${caminho}`, { headers: cab() });
  if (!r.ok) throw new Error(`leitura de ${caminho.split("?")[0]} falhou (${r.status})`);
  return await r.json() as T;
}
async function pgPost(tabela: string, linhas: unknown[], prefer: string): Promise<void> {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/${tabela}`, { method: "POST", body: JSON.stringify(linhas), headers: cab({ Prefer: prefer }) });
  if (!r.ok) throw new Error(`gravação em ${tabela.split("?")[0]} falhou (${r.status}): ${(await r.text()).slice(0, 200)} — rodou a migration 139?`);
}

// ------------------------------------------------------------------ handler
export async function tratar(req: Request): Promise<Response> {
  const token = Deno.env.get("COLETOR_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) return Response.json({ erro: "não autorizado" }, { status: 401 });
  let corpo: { so_teste?: boolean } = {};
  try { corpo = await req.json(); } catch (_) { /* vazio */ }
  const hoje = hojeBrasilia(), uso: Uso = { ent: 0, sai: 0, buscas: 0, modelo: MODELO }, urls = new Map<string, string>();
  const resumo: Record<string, unknown> = { versao: VERSAO, data: iso(hoje) };
  try {
    let universo: Universo[] = [];
    try { universo = await pgGet<Universo[]>("vm_indicadores_universo?select=id,pais,grupo,indicador,instituicao,impacto,frequencia&ativo=is.true&order=pais,grupo,id"); }
    catch (_) { /* sem a SQL 168: segue só com os eventos */ }
    const itens = await pesquisar(hoje, urls, uso, universo);
    if (!itens) throw new Error("a pesquisa não entregou a agenda");
    const { linhas, descartados } = limparItens(itens, urls, hoje, universo);
    const custo = Math.round((uso.ent / 1e6 * PRECO_ENT + uso.sai / 1e6 * PRECO_SAI + uso.buscas * PRECO_BUSCA) * 10000) / 10000;
    Object.assign(resumo, { itens: linhas.length, semana: ehSegunda(hoje), indicadores: linhas.filter((l) => l.tipo === "indicador").length,
      alto_impacto: linhas.filter((l) => l.impacto === "alto").length, descartados, buscas: uso.buscas, modelo: uso.modelo, custo_usd: custo,
      por_categoria: Object.fromEntries(CATEGORIAS.map((c) => [c, linhas.filter((l) => l.categoria === c).length]).filter(([, n]) => n)) });
    if (corpo.so_teste) { resumo.amostra = linhas.slice(0, 40); return Response.json(resumo); }
    if (linhas.length) await pgPost("vm_agenda?on_conflict=chave", linhas, "resolution=merge-duplicates,return=minimal");
    await pgPost("vm_coletas", [{ coletor: "agenda-do-dia", situacao: linhas.length ? "ok" : "erro", novos: linhas.length,
      detalhe: resumo, erro: linhas.length ? null : "nenhum item com endereço confirmado" }], "return=minimal");
    return Response.json(resumo, { status: linhas.length ? 200 : 502 });
  } catch (e) {
    resumo.erro = String((e as Error).message ?? e);
    try { if (!corpo.so_teste) await pgPost("vm_coletas", [{ coletor: "agenda-do-dia", situacao: "erro", novos: 0, detalhe: null, erro: resumo.erro }], "return=minimal"); } catch (_) { /* sem registro */ }
    return Response.json(resumo, { status: 500 });
  }
}

Deno.serve(tratar);
