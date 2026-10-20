// SOLIDUNS · Valor e Mercado — Edge Function do Netlify "previa-artigo" — v1.1 (20/10/2026)
// Pedido do Thiago (19/10 01h06): o link https://soliduns.com.br/noticias/?artigo=N compartilhado no WhatsApp/Telegram deve
// mostrar a foto, o título e a linha fina DAQUELE artigo. O WhatsApp não roda o código do site; ele lê só o HTML da resposta.
// Aqui: com ?artigo=N, o Netlify busca a página de prévia montada no banco (public.vm_previa, SQL 163) e a entrega como HTML.
// (O Supabase entrega HTML como texto puro — por isso a página passa pelo Netlify.) Sem ?artigo, ou se o banco falhar,
// segue a página fixa /noticias/ de sempre. A chave abaixo é a PÚBLICA do site (a mesma do código do jornal), não é segredo.
const SUPA = "https://evcsniicnrlrtzpdmeza.supabase.co";
const CHAVE_PUBLICA = "sb_publishable_ueRLfhNKU3NH1716UGqtow_NdAB7KNR";

type Ctx = { next: () => Promise<Response> };

export default async function previa(req: Request, context: Ctx): Promise<Response> {
  // v1.1 (20/10/2026): /noticias/ sem artigo = prévia da MANCHETE do dia (SQL 175: vm_previa com p_artigo = 0).
  // Outros endereços do jornal (?scanner=…, ?d=…) seguem para a página fixa de sempre.
  const q = new URL(req.url).searchParams;
  const extras = [...q.keys()].filter((k) => !["artigo", "v", "t", "utm_source", "utm_medium", "utm_campaign", "fbclid", "conferencia"].includes(k));
  if (extras.length) return context.next();
  const id = q.has("artigo") ? (q.get("artigo") ?? "") : "0";
  if (!/^\d{1,9}$/.test(id)) return context.next();
  try {
    const r = await fetch(`${SUPA}/rest/v1/rpc/vm_previa?p_artigo=${id}`, {
      headers: { apikey: CHAVE_PUBLICA, accept: "*/*" }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return context.next();
    const html = await r.text();
    if (!html.startsWith("<!doctype html>") || !html.includes('property="og:image"')) return context.next();
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
  } catch {
    return context.next();
  }
}

export const config = { path: ["/noticias", "/noticias/"] };
