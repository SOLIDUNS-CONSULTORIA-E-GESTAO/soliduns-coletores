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

const VERSAO = "1.0";
const MODELO = Deno.env.get("VM_MODELO") || "claude-sonnet-5-5";
const RESERVA = "claude-sonnet-4-5";
const BUSCAS = Math.max(1, Math.min(20, parseInt(Deno.env.get("VM_BUSCAS") ?? "10", 10) || 10));
const ANTHROPIC_URL = Deno.env.get("VM_ANTHROPIC_URL") ?? "https://api.anthropic.com/v1/messages";   // troca só em teste
const PRECO_ENT = 3.0, PRECO_SAI = 15.0, PRECO_BUSCA = 0.01;
const CATEGORIAS = ["CVM", "Banco Central", "Governo e Congresso", "Federal Reserve", "Agenda EUA", "Empresas", "Outros"];
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
export function hojeBrasilia(agora = new Date()): Date { return new Date(iso(new Date(agora.getTime() - 3 * 3600e3)) + "T00:00:00Z"); }
const extenso = (d: Date) => `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;

const TXT = { type: "string" };
const ENTREGA = {
  name: "entregar_agenda",
  description: "Entrega a agenda do dia apurada na busca.",
  input_schema: { type: "object", required: ["itens"], properties: { itens: { type: "array", items: { type: "object",
    required: ["hora", "regiao", "categoria", "evento", "fonte", "url"],
    properties: { hora: TXT, regiao: { type: "string", enum: ["br", "us", "global"] }, categoria: { type: "string", enum: CATEGORIAS },
      evento: TXT, consenso: TXT, fonte: TXT, url: TXT } } } } },
};

export function instrucoes(hoje: Date): string {
  return `Você é o pesquisador de agenda do Valor e Mercado, portal brasileiro de economia e mercado financeiro.
Hoje é ${extenso(hoje)} (${iso(hoje)}). Use a busca na web para levantar o que está PREVISTO PARA HOJE e pode mexer com o mercado:
- CVM: julgamentos do colegiado, prazos regulatórios, eventos corporativos de companhias abertas (divulgação de resultados, assembleias, ofertas, pagamentos de proventos relevantes);
- Banco Central do Brasil: reunião ou ata do Copom, Boletim Focus, divulgações de estatísticas, leilões, falas do presidente e de diretores;
- Governo e Congresso: agenda do Ministério da Fazenda e da Presidência, votações em plenário, leilões do Tesouro Nacional, divulgações do IBGE;
- Federal Reserve: FOMC, falas de dirigentes, Livro Bege, atas;
- Agenda EUA: indicadores do BLS, BEA, Census e outros, leilões do Tesouro americano, balanços de grandes empresas;
- outros fatos relevantes previstos para hoje.
Regras:
- só eventos de HOJE, com horário de Brasília no formato 09h00 (sem horário definido: "Dia todo" ou "A definir");
- consenso de mercado só quando a fonte trouxer o número; caso contrário, deixe vazio;
- cada item com o nome da fonte e o endereço EXATO de uma página devolvida pela busca que confirma o evento;
- não invente evento, horário, número nem endereço; na dúvida, deixe o item de fora;
- não escreva comentários entre as buscas.
Ao terminar, chame a ferramenta "entregar_agenda" uma única vez, com todos os itens (de 8 a 40).`;
}

// ------------------------------------------------------------------ Anthropic (com busca na web)
type Uso = { ent: number; sai: number; buscas: number; modelo: string };
export const normUrl = (u: string) => String(u || "").trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").split("#")[0]
  .replace(/[?&](utm_[^=&]+|ref|fbclid|gclid)=[^&]*/g, "").replace(/\/+$/, "");

async function pesquisar(hoje: Date, urls: Map<string, string>, uso: Uso): Promise<Record<string, unknown>[] | null> {
  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) throw new Error("Defina ANTHROPIC_API_KEY nos segredos das Edge Functions.");
  let msgs: unknown[] = [{ role: "user", content: `Levante a agenda de hoje (${extenso(hoje)}) e entregue pela ferramenta entregar_agenda.` }];
  const corpoBase = { max_tokens: 16000, system: instrucoes(hoje),
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: BUSCAS }, ENTREGA] };
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
export function limparItens(itens: Record<string, unknown>[], urls: Map<string, string>, hoje: Date): { linhas: Record<string, unknown>[]; descartados: string[] } {
  const linhas: Record<string, unknown>[] = [], descartados: string[] = [], chaves = new Set<string>();
  for (const it of itens ?? []) {
    const evento = String(it.evento ?? "").replace(/\s+/g, " ").trim();
    const url = urls.get(normUrl(String(it.url ?? "")));
    if (!evento) continue;
    if (!url) { descartados.push(`${evento.slice(0, 80)} (endereço não veio da busca)`); continue; }
    const hora = horaNorm(String(it.hora ?? ""));
    const regiao = ["br", "us", "global"].includes(String(it.regiao)) ? String(it.regiao) : "global";
    const categoria = CATEGORIAS.includes(String(it.categoria)) ? String(it.categoria) : "Outros";
    const chave = `${iso(hoje)}|pesquisa_web|${hora}|${semAcento(evento).replace(/[^a-z0-9]+/g, " ").trim().slice(0, 160)}`;
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    const consenso = String(it.consenso ?? "").trim();
    linhas.push({ data_ref: iso(hoje), hora, regiao, categoria, evento: evento.slice(0, 400),
      consenso: /^(sem consenso|n\/?d|n\/?a|-|—)?$/i.test(consenso) ? null : consenso.slice(0, 200),
      fonte: String(it.fonte ?? "").trim().slice(0, 120) || new URL(url).hostname, url, origem: "pesquisa_web", chave });
  }
  linhas.sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
  return { linhas, descartados };
}

// ------------------------------------------------------------------ Supabase (PostgREST)
function cab(extra: Record<string, string> = {}): Record<string, string> {
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const h: Record<string, string> = { apikey: chave, "Content-Type": "application/json", ...extra };
  if (!chave.startsWith("sb_")) h.Authorization = `Bearer ${chave}`;
  return h;
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
    const itens = await pesquisar(hoje, urls, uso);
    if (!itens) throw new Error("a IA não entregou a agenda");
    const { linhas, descartados } = limparItens(itens, urls, hoje);
    const custo = Math.round((uso.ent / 1e6 * PRECO_ENT + uso.sai / 1e6 * PRECO_SAI + uso.buscas * PRECO_BUSCA) * 10000) / 10000;
    Object.assign(resumo, { itens: linhas.length, descartados, buscas: uso.buscas, modelo: uso.modelo, custo_usd: custo,
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
