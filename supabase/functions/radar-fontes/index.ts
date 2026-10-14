// SOLIDUNS · Valor e Mercado — Edge Function "radar-fontes" — v1.0 (14/10/2026)
//
// ETAPA 3 do plano de fontes (Prompts 12 e 19, partes 1 e 2): varre as fontes ATIVAS e CONFERIDAS À MÃO de
// public.fontes_noticia (verificada_em preenchida + url_coleta de um feed RSS/Atom) e grava em public.vm_achados,
// respeitando a camada de cada fonte:
//   livre      -> título, link, data e o resumo que o PRÓPRIO FEED publica (pode virar texto-base, com crédito);
//   pauta      -> só título, link e data (radar de assuntos; nenhum texto é guardado — o banco também recusa);
//   licenciada -> não roda.
// Nunca abre a página da notícia: lê só o feed. Idempotente (link único). Registra cada execução em public.vm_coletas.
// Fontes sem feed (sites, PDFs, APIs) ficam para os coletores por pilar.
//
// Chamada: pg_cron a cada 30 min (6h–20h30 de Brasília) via pg_net, com "Authorization: Bearer <COLETOR_TOKEN>".
// Variáveis: COLETOR_TOKEN (manual, a mesma do coletor de fechamento); SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (automáticas).

const VERSAO = "1.0";
const UA = "SOLIDUNS Valor e Mercado (soliduns.com.br) radar de fontes";
const JANELA_H = 48;            // só itens publicados nas últimas 48 horas
const MAX_POR_FONTE = 40;
const RESUMO_MAX = 600;

type Fonte = { id: number; nome: string; camada: string; url_coleta: string };
export type Item = { titulo: string; link: string; resumo: string | null; publicado_em: string | null };

// ------------------------------------------------------------------ leitura do feed (RSS 2.0 e Atom)
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function limparTexto(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
      return ENT[e.toLowerCase()] ?? m;
    }).replace(/\s+/g, " ").trim();
}
function tag(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, "i"));
  return m ? m[1] : null;
}
export function lerFeed(xml: string): Item[] {
  const itens: Item[] = [];
  const blocos = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of blocos) {
    const titulo = limparTexto(tag(b, "title") ?? "");
    let link = limparTexto(tag(b, "link") ?? "");
    if (!link) link = (b.match(/<link[^>]*href="([^"]+)"/i) ?? [])[1] ?? "";
    const resumoBruto = tag(b, "description") ?? tag(b, "summary") ?? "";
    const data = limparTexto(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date") ?? "");
    const t = Date.parse(data);
    if (!titulo || !/^https?:\/\//i.test(link)) continue;
    const resumo = limparTexto(resumoBruto);
    itens.push({ titulo: titulo.slice(0, 300), link: link.trim(), resumo: resumo ? resumo.slice(0, RESUMO_MAX) : null,
      publicado_em: Number.isFinite(t) ? new Date(t).toISOString() : null });
  }
  return itens;
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
  const r = await fetch(`${base()}/${caminho}`, { headers: cab() });
  if (!r.ok) throw new Error(`leitura falhou (${r.status}) em ${caminho.split("?")[0]} — rodou a migration 138?`);
  return await r.json();
}
async function pgPost(tabela: string, linhas: unknown[], prefer: string): Promise<void> {
  const r = await fetch(`${base()}/${tabela}`, { method: "POST", body: JSON.stringify(linhas), headers: cab({ Prefer: prefer }) });
  if (!r.ok) throw new Error(`gravação em ${tabela.split("?")[0]} falhou (${r.status}): ${(await r.text()).slice(0, 200)}`);
}

// ------------------------------------------------------------------ handler
export async function tratar(req: Request): Promise<Response> {
  const token = Deno.env.get("COLETOR_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) return Response.json({ erro: "não autorizado" }, { status: 401 });
  let corpo: { so_teste?: boolean } = {};
  try { corpo = await req.json(); } catch (_) { /* vazio */ }
  const resumo: Record<string, unknown> = { versao: VERSAO }, notas: string[] = [];
  let novos = 0, falhas = 0;
  try {
    const fontes = await pgGet<Fonte[]>("fontes_noticia?select=id,nome,camada,url_coleta&situacao=eq.ativa" +
      "&verificada_em=not.is.null&url_coleta=not.is.null&camada=neq.licenciada&order=id");
    const pendentes = await pgGet<{ id: number }[]>("fontes_noticia?select=id&situacao=eq.ativa&verificada_em=is.null");
    resumo.fontes_lidas = fontes.length;
    resumo.fontes_aguardando_conferencia = pendentes.length;
    const corte = Date.now() - JANELA_H * 3600e3;
    for (const f of fontes) {
      if (f.camada !== "livre" && f.camada !== "pauta") continue;          // licenciada nunca roda
      try {
        const r = await fetch(f.url_coleta, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
        if (!r.ok) { falhas++; notas.push(`${f.nome}: HTTP ${r.status}`); continue; }
        const itens = lerFeed(await r.text())
          .filter((i) => !i.publicado_em || Date.parse(i.publicado_em) >= corte).slice(0, MAX_POR_FONTE);
        const linhas = itens.map((i) => ({ fonte_id: f.id, fonte_nome: f.nome, camada: f.camada, titulo: i.titulo, link: i.link,
          resumo: f.camada === "livre" ? i.resumo : null,                     // pauta: o texto nunca é guardado
          publicado_em: i.publicado_em }));
        if (linhas.length && !corpo.so_teste) await pgPost("vm_achados?on_conflict=link", linhas, "resolution=ignore-duplicates,return=minimal");
        novos += linhas.length;
        notas.push(`${f.nome}: ${linhas.length} itens (${f.camada})`);
      } catch (e) { falhas++; notas.push(`${f.nome}: ${String((e as Error).message ?? e).slice(0, 120)}`); }
    }
    if (!corpo.so_teste) {
      await fetch(`${base()}/vm_achados?coletado_em=lt.${new Date(Date.now() - 30 * 864e5).toISOString()}`,
        { method: "DELETE", headers: cab({ Prefer: "return=minimal" }) });                  // mantém 30 dias
      await pgPost("vm_coletas", [{ coletor: "radar-fontes", situacao: falhas ? (falhas < fontes.length ? "parcial" : "erro") : "ok",
        novos, detalhe: { notas, ...resumo }, erro: null }], "return=minimal");
    }
    Object.assign(resumo, { lidos: novos, notas });
    return Response.json(resumo, { status: 200 });
  } catch (e) {
    resumo.erro = String((e as Error).message ?? e);
    try { if (!corpo.so_teste) await pgPost("vm_coletas", [{ coletor: "radar-fontes", situacao: "erro", novos: 0, detalhe: { notas }, erro: resumo.erro }], "return=minimal"); } catch (_) { /* sem registro */ }
    return Response.json(resumo, { status: 500 });
  }
}

Deno.serve(tratar);
