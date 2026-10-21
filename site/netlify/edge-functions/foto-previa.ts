// SOLIDUNS · Valor e Mercado — Edge Function do Netlify "foto-previa" — v1.0 (21/10/2026)
// Foto da prévia do WhatsApp/Telegram num endereço simples: /noticias/foto/<endereço da foto em base64url>.jpg
// Devolve a foto reduzida (JPEG 1200x630, qualidade 70) pelo serviço de imagens do Netlify. Só aceita fotos do próprio
// armazenamento do jornal (Supabase), do Unsplash e do site — não é um repasse aberto para qualquer endereço.
const PERMITIDAS = [/^https:\/\/evcsniicnrlrtzpdmeza\.supabase\.co\/storage\/v1\/object\/public\//, /^https:\/\/images\.unsplash\.com\//, /^https:\/\/soliduns\.com\.br\//];

export function deB64url(t: string): string {
  const b = t.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((t.length + 3) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
}

export default async function fotoPrevia(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const m = u.pathname.match(/^\/noticias\/foto\/([A-Za-z0-9_-]{10,2000})\.jpg$/);
  if (!m) return new Response("não encontrado", { status: 404 });
  let origem = "";
  try { origem = deB64url(m[1]); } catch { return new Response("endereço inválido", { status: 400 }); }
  if (!PERMITIDAS.some((r) => r.test(origem))) return new Response("origem não permitida", { status: 403 });
  const alvo = new URL("/.netlify/images", u.origin);
  alvo.search = new URLSearchParams({ url: origem, w: "1200", h: "630", fit: "cover", fm: "jpg", q: "70" }).toString();
  try {
    const r = await fetch(alvo, { signal: AbortSignal.timeout(8000) });
    if (!r.ok || !(r.headers.get("content-type") || "").startsWith("image/")) {
      return Response.redirect(new URL("/og-valor-e-mercado.jpg", u.origin), 302);   // sem foto: imagem padrão do jornal
    }
    return new Response(r.body, { status: 200, headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } });
  } catch {
    return Response.redirect(new URL("/og-valor-e-mercado.jpg", u.origin), 302);
  }
}

export const config = { path: "/noticias/foto/*" };
