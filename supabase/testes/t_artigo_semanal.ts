// testes do artigo-semanal v1.0 (rodar: deno run -A t_artigo_semanal.ts)
(Deno as unknown as { serve: unknown }).serve = () => {};
Deno.env.set("SUPABASE_URL", "https://sb.test"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_teste");
Deno.env.set("ANTHROPIC_API_KEY", "chave-teste"); Deno.env.set("COLETOR_TOKEN", "tok"); Deno.env.set("UNSPLASH_ACCESS_KEY", "un-teste");
Deno.env.set("ANTHROPIC_URL", "https://api.test/v1"); Deno.env.set("UNSPLASH_URL", "https://un.test");
const m = await import("../functions/artigo-semanal/index.ts");
let falhas = 0; const ok = (c: boolean, n: string) => { console.log((c ? "OK  " : "FALHOU ") + n); if (!c) falhas++; };
type O = Record<string, any>;
const PAUTA = { id: "petrobras", nome: "x", chapeu: "PETRÓLEO & PETROBRAS", editoria: "Empresas", tickers: ["PETR3", "PETR4"], tema: "tema",
  dia_escrever: 0, hora_escrever: 17 * 60, dias_publicar: 1, hora_publicar: 7 * 60, foto_busca: "oil refinery", tags: ["Petrobras"], ativa: true };

// 1. datas
ok(m.publicarEm("2026-10-18", 1, 420) === "2026-10-19T10:00:00.000Z", "segunda 07h00 de Brasília = 10h00 UTC");
ok(m.agoraBrt(new Date("2026-10-18T20:05:00Z")).dia === 0, "domingo em Brasília");

// 2. conferência
const par = (n: number) => Array.from({ length: n }, (_, i) => `Frase ${i} sobre PETR4 e PETR3 com Brent a US$ 74,10 no dia 15 de outubro e produção de 2,9 milhões de barris por dia na quarta-feira.`).join(" ");
const corpoBom = [{ tipo: "paragrafo", texto: par(5) }, { tipo: "paragrafo", texto: par(4) },
  { tipo: "intertitulo", texto: "A companhia na semana" }, { tipo: "paragrafo", texto: par(5) }, { tipo: "paragrafo", texto: par(4) },
  { tipo: "intertitulo", texto: "Petróleo no mundo" }, { tipo: "paragrafo", texto: par(5) }, { tipo: "paragrafo", texto: par(4) },
  { tipo: "intertitulo", texto: "Brasil" }, { tipo: "paragrafo", texto: par(4) }, { tipo: "intertitulo", texto: "O que acompanhar" }, { tipo: "paragrafo", texto: par(4) }];
const urls: O = {}; for (let i = 0; i < 6; i++) urls[`fonte.test/${i}`] = [`https://fonte.test/${i}`, `Fonte ${i}`];
const entrega = { data_referencia: "2026-10-18", chapeu: "petróleo & petrobras", titulo: "Petrobras corta diesel e Brent recua 3,20% na semana",
  linha_fina: "Estatal reduz preço nas refinarias a partir de terça (20), enquanto a OPEP+ mantém cortes e os estoques americanos sobem pela terceira semana seguida",
  corpo: corpoBom, foto_busca: "oil platform offshore", fontes: Object.values(urls).map((u: any) => ({ url: u[0] })) };
const lim = m.limpar(structuredClone(entrega), urls, PAUTA);
const pr = m.problemas(lim.a, lim.fontes, lim.dataRef, "2026-10-18", PAUTA);
ok(pr.length === 0, "artigo bom passa: " + JSON.stringify(pr));
ok(lim.a.chapeu === "PETRÓLEO & PETROBRAS", "chapéu em caixa alta");
const ruim = structuredClone(entrega); ruim.titulo = "Segundo a Reuters, Petrobras recomendamos compra."; ruim.corpo = corpoBom.slice(0, 5); ruim.fontes = [{ url: "https://inventada.test/x" }];
const lr = m.limpar(ruim, urls, PAUTA); const pr2 = m.problemas(lr.a, lr.fontes, lr.dataRef, "2026-10-18", PAUTA);
ok(pr2.some((e: string) => e.includes("corpo com")), "corpo curto barrado");
ok(pr2.some((e: string) => e.includes("recomendação")), "recomendação barrada");
ok(pr2.some((e: string) => e.includes("título e linha fina")), "veículo no título barrado");
ok(pr2.some((e: string) => e.includes("menos de 5 fontes")), "fonte inventada não conta");

// 3. linha da Redação
const x = m.nova(PAUTA, "2026-10-18", "producao");
const la = m.linhaArtigo({ ...lim.a, foto: { src: "https://img.test/a.jpg", alt: "refinaria", fotografo: "Fulano", origem: "Unsplash" } }, lim.fontes, PAUTA, x);
ok(la.situacao === "agendado" && la.publicar_em === "2026-10-19T10:00:00.000Z", "produção: AGENDADO para segunda 07h00");
ok(la.corpo.every((b: O) => Array.isArray(b.conteudo) && b.conteudo[0].texto && Object.keys(b).every((k) => ["tipo", "conteudo"].includes(k))), "corpo no formato da Redação");
ok(la.autor === "Redação Valor e Mercado" && la.lugar === "artigos" && la.editoria === "Empresas", "autor, lugar e editoria");
const lt = m.linhaArtigo(lim.a, lim.fontes, PAUTA, m.nova(PAUTA, "2026-10-18", "teste"));
ok(lt.situacao === "rascunho" && !("publicar_em" in lt), "teste: RASCUNHO, sem data de publicação");

// 4. fluxo completo simulado: domingo 17h05 -> pedido; lote pronto -> conferência -> foto -> grava agendado
const banco: O = { exec: [] as O[], artigos: [] as O[] }; const pedidos: O[] = [];
m.usarFetch(async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url), metodo = init?.method ?? "GET", corpo = init?.body ? JSON.parse(String(init.body)) : null;
  const J = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s });
  if (u.startsWith("https://sb.test/rest/v1/vm_pautas_semanais")) return J([PAUTA]);
  if (u.startsWith("https://sb.test/rest/v1/vm_artigo_semanal_execucoes")) {
    if (metodo === "POST") { const l = corpo[0]; banco.exec = banco.exec.filter((e: O) => !(e.pauta === l.pauta && e.semana === l.semana && e.modo === l.modo)); banco.exec.push(l); return J(null, 201); }
    const modo = /modo=eq\.(\w+)/.exec(u)?.[1]; return J(banco.exec.filter((e: O) => !modo || e.modo === modo));
  }
  if (u.startsWith("https://sb.test/rest/v1/cotacoes")) return J([{ codigo: "PETR4", data_ref: "2026-10-09", fechamento: 30 }, { codigo: "PETR4", data_ref: "2026-10-16", fechamento: 31.5 }]);
  if (u.startsWith("https://sb.test/rest/v1/rpc/emissor_noticias_dossie")) return J({ emissor: [{ data: "2026-10-15", categoria: "Fato relevante", titulo: "Reajuste do diesel" }], imprensa: [] });
  if (u.startsWith("https://sb.test/rest/v1/vm_artigos")) { banco.artigos.push(corpo[0]); return J([{ id: 77 }], 201); }
  if (u === "https://api.test/v1/messages/batches" && metodo === "POST") { pedidos.push(corpo); return J({ id: "lote1" }); }
  if (u === "https://api.test/v1/messages/batches/lote1") return J({ processing_status: "ended", results_url: "https://api.test/res" });
  if (u === "https://api.test/res") return new Response(JSON.stringify({ result: { type: "succeeded", message: { stop_reason: "tool_use", usage: { input_tokens: 50000, output_tokens: 6000, server_tool_use: { web_search_requests: 12 } },
    content: [{ type: "web_search_tool_result", content: Object.values(urls).map((v: any) => ({ url: v[0], title: v[1] })) }, { type: "tool_use", name: "entregar_artigo", input: entrega }] } } }));
  if (u.startsWith("https://un.test/search/photos")) return J({ results: [{ id: "f1", urls: { raw: "https://images.test/f1" }, alt_description: "oil platform", user: { name: "Ana", links: { html: "https://unsplash.com/@ana" } }, links: { html: "https://unsplash.com/photos/f1" } }] });
  return J({ erro: "não previsto " + u }, 404);
});
const r0 = await m.passo("", undefined, new Date("2026-10-18T15:00:00Z"));   // domingo 12h: antes do horário
ok(JSON.stringify(r0).includes("nada a fazer"), "domingo 12h: nada a fazer");
await m.passo("", undefined, new Date("2026-10-18T20:05:00Z"));              // domingo 17h05: manda o pedido
ok(pedidos.length === 1 && pedidos[0].requests[0].params.system.includes("PETR4: fechou R$ 31,50") && pedidos[0].requests[0].params.system.includes("Reajuste do diesel"),
   "pedido com dados da casa (fechamento e documento da CVM)");
ok(pedidos[0].requests[0].params.model === "claude-sonnet-5-5", "modelo Sonnet");
await m.passo("", undefined, new Date("2026-10-18T20:10:00Z"));              // lote pronto
const ex = banco.exec.find((e: O) => e.modo === "producao");
ok(ex.etapa === "agendada" && ex.artigo_id === 77, "gravado na Redação e agendado: " + ex.etapa + " / " + JSON.stringify(ex.registro.slice(-3)));
ok(banco.artigos[0]?.situacao === "agendado" && banco.artigos[0]?.foto?.origem === "Unsplash" && banco.artigos[0]?.publicar_em === "2026-10-19T10:00:00.000Z", "artigo agendado com foto");
const r3 = await m.passo("", undefined, new Date("2026-10-18T20:15:00Z"));
ok(pedidos.length === 1, "não repete na mesma semana");
const r4 = await m.passo("", undefined, new Date("2026-10-19T20:15:00Z"));   // segunda: fora do dia da pauta
ok(pedidos.length === 1, "segunda-feira: não começa outro");
await m.passo("teste", "petrobras", new Date("2026-10-20T15:00:00Z"));       // teste a qualquer hora
ok(pedidos.length === 2, "teste pedido à mão começa na hora");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTODOS OS TESTES OK");
if (falhas) Deno.exit(1);
