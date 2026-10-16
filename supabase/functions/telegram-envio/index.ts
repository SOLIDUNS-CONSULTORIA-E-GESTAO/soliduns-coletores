// telegram-envio v1.0 — Valor e Mercado: envia o link de cada matéria publicada aos grupos e ao canal do Telegram.
// Decisão do Thiago (16/10/2026 09h04): "quero inserir o robô nos grupos e publicar". Opção B: Manchete, Scanner e artigos do CMS.
//
// Dois tipos de chamada:
//   1. pg_cron a cada 5 min (Authorization: Bearer <COLETOR_TOKEN>): procura o que foi publicado nas últimas 12 h e ainda não foi
//      enviado a cada destino ativo; manda título + linha fina + link. Corpo {"acao":"configurar","webhook_url":"…"} liga o aviso
//      do Telegram (setWebhook); {"acao":"teste"} só mostra o que seria enviado.
//   2. Aviso do Telegram (cabeçalho X-Telegram-Bot-Api-Secret-Token): o robô entrou ou saiu de um grupo/canal. Só vale se quem
//      adicionou for o Thiago (TELEGRAM_DONO_ID); se outra pessoa adicionar, o robô sai do grupo.
// Variáveis: TELEGRAM_TOKEN, TELEGRAM_DONO_ID, COLETOR_TOKEN (manuais); SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (automáticas).
// Nenhuma chave neste arquivo. A mensagem nunca menciona IA.

export const VERSAO = "1.0";
const SITE = "https://soliduns.com.br/noticias/";
const JANELA_H = 12;

type Tg = (metodo: string, dados: Record<string, unknown>) => Promise<{ ok: boolean; result?: unknown; error_code?: number; description?: string; parameters?: { migrate_to_chat_id?: number; retry_after?: number } }>;
export type Item = { chave: string; tipo: "manchete" | "scanner" | "artigo"; chapeu: string; titulo: string; linha: string; link: string };
type Destino = { chat_id: string; nome: string | null };

// ------------------------------------------------------------------ texto
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const limpo = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/[*_`#]+/g, "").replace(/\s+/g, " ").trim();
export function corta(s: string, n: number): string {
  if (s.length <= n) return s;
  const t = s.slice(0, n), p = t.lastIndexOf(" ");
  return (p > n * 0.6 ? t.slice(0, p) : t).replace(/[,;:.\s]+$/, "") + "…";
}
function primeiraFrase(paras: unknown): string {
  const lista = Array.isArray(paras) ? paras : [];
  for (const p of lista) {
    const t = limpo(typeof p === "string" ? p : (p as { texto?: string })?.texto);
    if (t) return (t.match(/^.+?[.!?](\s|$)/) ?? [t])[0].trim();
  }
  return "";
}
const ROTULO = { manchete: "Manchete do dia", scanner: "Scanner do Dia", artigo: "Artigo" } as const;
export function mensagem(it: Item): string {
  const topo = `<b>VALOR E MERCADO</b> · ${esc(it.chapeu || ROTULO[it.tipo])}`;
  const linha = it.linha ? `\n${esc(corta(it.linha, 280))}` : "";
  return `${topo}\n\n<b>${esc(corta(it.titulo, 160))}</b>${linha}\n\n<a href="${esc(it.link)}">Leia no jornal</a>`;
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
  if (!r.ok) throw new Error(`leitura falhou (${r.status}) em ${caminho.split("?")[0]}`);
  return await r.json();
}
async function pgEscreve(metodo: string, caminho: string, corpo: unknown, prefer = "return=minimal"): Promise<void> {
  const r = await fetch(`${base()}/${caminho}`, { method: metodo, body: JSON.stringify(corpo), headers: cab({ Prefer: prefer }) });
  if (!r.ok) throw new Error(`gravação em ${caminho.split("?")[0]} falhou (${r.status}): ${(await r.text()).slice(0, 200)}`);
}

// ------------------------------------------------------------------ o que foi publicado
export function itensDe(edicoes: { data: string; conteudo: Record<string, unknown> }[],
                        scanners: { id: number; data_ref: string; texto_aprovado: Record<string, unknown> }[],
                        artigos: { id: number; chapeu: string | null; titulo: string; linha_fina: string | null; corpo: unknown }[]): Item[] {
  const out: Item[] = [];
  for (const e of edicoes) {
    const m = (e.conteudo?.manchete ?? {}) as Record<string, unknown>;
    const titulo = limpo(m.titulo);
    if (!titulo) continue;
    out.push({ chave: `manchete:${e.data}`, tipo: "manchete", chapeu: limpo(m.chapeu) || ROTULO.manchete, titulo,
      linha: limpo(m.linha_fina) || primeiraFrase(m.corpo ?? m.paragrafos), link: SITE });
  }
  for (const s of scanners) {
    const t = s.texto_aprovado ?? {};
    const titulo = limpo(t.titulo);
    if (!titulo) continue;
    out.push({ chave: `scanner:${s.id}`, tipo: "scanner", chapeu: ROTULO.scanner, titulo,
      linha: limpo(t.linha_fina) || primeiraFrase(t.paragrafos), link: `${SITE}?scanner=${s.data_ref}` });
  }
  for (const a of artigos) {
    const titulo = limpo(a.titulo);
    if (!titulo) continue;
    const paras = (Array.isArray(a.corpo) ? a.corpo : []).filter((b) => (b as { tipo?: string })?.tipo === "paragrafo");
    out.push({ chave: `artigo:${a.id}`, tipo: "artigo", chapeu: limpo(a.chapeu) || ROTULO.artigo, titulo,
      linha: limpo(a.linha_fina) || primeiraFrase(paras), link: `${SITE}?artigo=${a.id}` });
  }
  return out;
}
async function publicados(): Promise<Item[]> {
  const desde = new Date(Date.now() - JANELA_H * 3600e3).toISOString();
  const hojeBr = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const [ed, sc, ar] = await Promise.all([
    pgGet<{ data: string; conteudo: Record<string, unknown> }[]>(
      `vm_edicoes?select=data,conteudo&publicado=is.true&data=eq.${hojeBr}&gerado_em=gte.${encodeURIComponent(desde)}`),
    pgGet<{ id: number; data_ref: string; texto_aprovado: Record<string, unknown> }[]>(
      `vm_materias?select=id,data_ref,texto_aprovado&tipo=eq.scanner&situacao=eq.publicada&aprovado_em=gte.${encodeURIComponent(desde)}&order=aprovado_em.asc`),
    pgGet<{ id: number; chapeu: string | null; titulo: string; linha_fina: string | null; corpo: unknown }[]>(
      `vm_artigos?select=id,chapeu,titulo,linha_fina,corpo&situacao=eq.publicado&publicado_em=gte.${encodeURIComponent(desde)}&order=publicado_em.asc`),
  ]);
  return itensDe(ed, sc, ar);
}

// ------------------------------------------------------------------ Telegram
function telegram(): Tg {
  const token = Deno.env.get("TELEGRAM_TOKEN") ?? "";
  return async (metodo, dados) => {
    const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
    try { return await r.json(); } catch (_) { return { ok: false, error_code: r.status, description: `HTTP ${r.status}` }; }
  };
}
export async function segredoWebhook(token: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vm-webhook:${token}`));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// envia o que falta; devolve resumo. Erros de um destino não param os outros.
export async function enviar(tg: Tg, itens: Item[], destinos: Destino[], jaFeitos: Set<string>,
                             grava: (linha: Record<string, unknown>) => Promise<void>,
                             desliga: (chat: string, novo?: string) => Promise<void>) {
  const notas: string[] = [];
  let enviados = 0, falhas = 0;
  for (const it of itens) {
    for (const d of destinos) {
      if (jaFeitos.has(`${it.chave}|${d.chat_id}`)) continue;
      const corpo = { chat_id: d.chat_id, text: mensagem(it), parse_mode: "HTML",
        link_preview_options: { url: it.link, prefer_large_media: true } };
      let r = await tg("sendMessage", corpo);
      if (!r.ok && r.parameters?.migrate_to_chat_id) {               // grupo virou supergrupo: novo número
        const novo = String(r.parameters.migrate_to_chat_id);
        await desliga(d.chat_id, novo);
        d.chat_id = novo;
        r = await tg("sendMessage", { ...corpo, chat_id: novo });
      }
      if (!r.ok && r.error_code === 429) { notas.push(`limite do Telegram; tenta de novo em ${r.parameters?.retry_after ?? "?"} s`); return { enviados, falhas, notas }; }
      if (r.ok) enviados++; else falhas++;
      await grava({ item: it.chave, chat_id: d.chat_id, ok: r.ok,
        mensagem_id: r.ok ? (r.result as { message_id?: number })?.message_id ?? null : null,
        erro: r.ok ? null : `${r.error_code ?? ""} ${r.description ?? ""}`.trim().slice(0, 300) });
      if (!r.ok && (r.error_code === 403 || /chat not found/i.test(r.description ?? ""))) {
        await desliga(d.chat_id);                                     // robô removido ou grupo apagado
        notas.push(`${d.nome ?? d.chat_id}: robô sem acesso — destino desligado`);
      }
      await espera(1100);                                              // abaixo do limite de 1 mensagem/s por conversa
    }
  }
  return { enviados, falhas, notas };
}

// aviso do Telegram: robô entrou/saiu de um grupo ou canal
export async function tratarAviso(tg: Tg, upd: Record<string, unknown>, dono: string,
                                  salva: (d: Record<string, unknown>) => Promise<void>, apaga: (chat: string) => Promise<void>) {
  const m = upd.my_chat_member as { chat?: { id: number; title?: string; username?: string; type?: string };
    from?: { id: number }; new_chat_member?: { status?: string } } | undefined;
  if (!m?.chat) return "ignorado";
  const chat = String(m.chat.id), st = m.new_chat_member?.status ?? "";
  if (st === "member" || st === "administrator") {
    if (String(m.from?.id ?? "") !== dono) {
      await tg("leaveChat", { chat_id: chat });
      return "adicionado por outra pessoa — robô saiu";
    }
    await salva({ chat_id: chat, nome: m.chat.title ?? m.chat.username ?? null, tipo: m.chat.type ?? null, ativo: true,
      adicionado_por: String(m.from?.id ?? ""), atualizado_em: new Date().toISOString() });
    if (m.chat.username) await apaga(`@${m.chat.username}`);         // o canal cadastrado pelo endereço vira o número oficial
    return "destino ligado";
  }
  if (st === "left" || st === "kicked" || st === "restricted") {
    await salva({ chat_id: chat, nome: m.chat.title ?? null, tipo: m.chat.type ?? null, ativo: false, atualizado_em: new Date().toISOString() });
    return "destino desligado";
  }
  return "ignorado";
}

// ------------------------------------------------------------------ handler
export async function tratar(req: Request): Promise<Response> {
  const tokenTg = Deno.env.get("TELEGRAM_TOKEN"), dono = Deno.env.get("TELEGRAM_DONO_ID") ?? "";
  if (!tokenTg || !dono) return Response.json({ erro: "faltam TELEGRAM_TOKEN ou TELEGRAM_DONO_ID nos Secrets" }, { status: 500 });
  const tg = telegram();
  const salva = (d: Record<string, unknown>) => pgEscreve("POST", "vm_telegram_destinos?on_conflict=chat_id", [d], "resolution=merge-duplicates,return=minimal");
  let numeroNovo = "";
  const apaga = async (chat: string) => {                          // @endereço -> número: leva junto o registro do que já foi enviado
    if (numeroNovo) await pgEscreve("PATCH", `vm_telegram_envios?chat_id=eq.${encodeURIComponent(chat)}`, { chat_id: numeroNovo });
    await pgEscreve("DELETE", `vm_telegram_destinos?chat_id=eq.${encodeURIComponent(chat)}`, undefined);
  };

  // 1. aviso do Telegram
  const sec = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (sec !== null) {
    if (sec !== await segredoWebhook(tokenTg)) return new Response("não autorizado", { status: 401 });
    try {
      const upd = await req.json();
      numeroNovo = String((upd as { my_chat_member?: { chat?: { id?: number } } })?.my_chat_member?.chat?.id ?? "");
      await tratarAviso(tg, upd, dono, salva, apaga);
    } catch (_) { /* o Telegram não precisa saber */ }
    return new Response("ok");
  }

  // 2. chamada do agendador
  const token = Deno.env.get("COLETOR_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) return Response.json({ erro: "não autorizado" }, { status: 401 });
  let corpo: { acao?: string; webhook_url?: string } = {};
  try { corpo = await req.json(); } catch (_) { /* vazio */ }
  const resumo: Record<string, unknown> = { versao: VERSAO };
  try {
    if (corpo.acao === "configurar") {
      if (!/^https:\/\//.test(corpo.webhook_url ?? "")) return Response.json({ erro: "webhook_url inválida" }, { status: 400 });
      const eu = await tg("getMe", {});
      const w = await tg("setWebhook", { url: corpo.webhook_url, secret_token: await segredoWebhook(tokenTg),
        allowed_updates: ["my_chat_member"], drop_pending_updates: false });
      return Response.json({ ...resumo, robo: (eu.result as { username?: string })?.username ?? null,
        webhook: w.ok ? "ligado" : `falhou: ${w.description ?? ""}` }, { status: eu.ok && w.ok ? 200 : 502 });
    }
    const [itens, destinos, feitos] = await Promise.all([
      publicados(),
      pgGet<Destino[]>("vm_telegram_destinos?select=chat_id,nome&ativo=is.true"),
      pgGet<{ item: string; chat_id: string }[]>(
        `vm_telegram_envios?select=item,chat_id&or=(ok.is.true,tentativas.gte.3)&enviado_em=gte.${encodeURIComponent(new Date(Date.now() - 48 * 3600e3).toISOString())}`),
    ]);
    Object.assign(resumo, { publicados: itens.map((i) => i.chave), destinos: destinos.map((d) => d.nome ?? d.chat_id) });
    if (corpo.acao === "teste") return Response.json({ ...resumo, exemplo: itens[0] ? mensagem(itens[0]) : null });
    const grava = (l: Record<string, unknown>) => pgEscreve("POST", "rpc/vm_telegram_registrar", { p: l });
    const desliga = async (chat: string, novo?: string) => {
      if (novo) await pgEscreve("PATCH", `vm_telegram_destinos?chat_id=eq.${encodeURIComponent(chat)}`, { chat_id: novo });
      else await pgEscreve("PATCH", `vm_telegram_destinos?chat_id=eq.${encodeURIComponent(chat)}`, { ativo: false });
    };
    const r = await enviar(tg, itens, destinos, new Set(feitos.map((f) => `${f.item}|${f.chat_id}`)), grava, desliga);
    Object.assign(resumo, r);
    return Response.json(resumo, { status: r.falhas && !r.enviados ? 502 : 200 });
  } catch (e) {
    resumo.erro = String((e as Error).message ?? e);
    return Response.json(resumo, { status: 500 });
  }
}

Deno.serve(tratar);
