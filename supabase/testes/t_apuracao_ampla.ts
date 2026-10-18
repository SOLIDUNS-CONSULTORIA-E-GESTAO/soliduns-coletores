// testes da APURAÇÃO AMPLA (artigo-semanal v1.4): 1 apuração do Sonnet para várias pautas; a DeepSeek escreve 1 artigo por pauta
(Deno as unknown as { serve: unknown }).serve = () => {};
Deno.env.set("SUPABASE_URL", "https://sb.test"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_teste");
Deno.env.set("ANTHROPIC_API_KEY", "k"); Deno.env.set("COLETOR_TOKEN", "tok"); Deno.env.set("ANTHROPIC_URL", "https://api.test/v1");
Deno.env.set("DEEPSEEK_URL", "https://ds.test"); Deno.env.set("DEEPSEEK_API_KEY", "ds"); Deno.env.set("UNSPLASH_URL", "https://un.test");
const m = await import("../functions/artigo-semanal/index.ts");
let falhas = 0; const ok = (c: boolean, n: string) => { console.log((c ? "OK  " : "FALHOU ") + n); if (!c) falhas++; };
type O = Record<string, any>;
const base = { tickers: [] as string[], dia_escrever: 0, dias_publicar: 1, foto_busca: "x", tags: ["t"], ativa: true, redator: "deepseek",
  estrutura: "abertura | Seção A | Seção B | O que acompanhar", palavras_min: 100, palavras_max: 2000, fontes_min: 3 };
const G = { ...base, id: "apuracao-semanal", nome: "Apuração ampla", chapeu: "APURAÇÃO", editoria: "Economia", tema: "orientação geral", tipo: "apuracao", hora_escrever: 16 * 60, hora_publicar: 0, buscas: 60 };
const J1 = { ...base, id: "juros-inflacao", nome: "Juros", chapeu: "JUROS & INFLAÇÃO", editoria: "Política Econômica", tema: "Selic e IPCA", grupo: "apuracao-semanal",
  hora_escrever: 16 * 60 + 5, hora_publicar: 9 * 60, exigir: ["Selic"], perfil: "especializado em política monetária", area: "juros e inflação", fontes_primarias: "Banco Central, IBGE",
  regras: "- Cite a decisão do Copom quando houver.", foto_exemplos: "\"central bank building\"", numeros: "pontos-base" };
const J2 = { ...base, id: "cambio", nome: "Câmbio", chapeu: "CÂMBIO", editoria: "Mercados", tema: "dólar", grupo: "apuracao-semanal", hora_escrever: 16 * 60 + 5, hora_publicar: 11 * 60, exigir: ["dólar"] };
const pautas = [J1, J2, G];
const urls = Array.from({ length: 6 }, (_, i) => ({ url: `https://fonte.test/${i}`, title: `F${i}` }));
const fatos = (t: string, n: number) => Array.from({ length: n }, (_, i) => ({ data: "15/10", fato: `${t} fato ${i}.`, url: `https://fonte.test/${i % 6}` }));
let nJuros = 20, nCambio = 3;
const par = (t: string) => Array.from({ length: 4 }, (_, i) => `Frase ${i} sobre ${t} com dado de 15 de outubro de 2026.`).join(" ");
const artigoDs = (t: string, hoje: string) => ({ data_referencia: hoje, chapeu: "x", titulo: `Título da semana sobre ${t} com o fato principal`,
  linha_fina: "Linha fina com os dados complementares cruciais da semana, sem repetir o título e com tamanho suficiente para a conferência automática do jornal aceitar",
  corpo: [{ tipo: "paragrafo", texto: par(t) }, { tipo: "intertitulo", texto: "Seção A" }, { tipo: "paragrafo", texto: par(t) }, { tipo: "paragrafo", texto: par(t) },
    { tipo: "intertitulo", texto: "Seção B" }, { tipo: "paragrafo", texto: par(t) }, { tipo: "paragrafo", texto: par(t) }, { tipo: "intertitulo", texto: "O que acompanhar" }, { tipo: "paragrafo", texto: par(t) }],
  foto_busca: "x", fontes: urls.slice(0, 4).map((u) => ({ url: u.url })) });
const bd: O = { exec: [] as O[], artigos: [] as O[] }; const lotes: O[] = []; const ds: O[] = []; let nLote = 0;
m.usarFetch(async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url), metodo = init?.method ?? "GET", corpo = init?.body ? JSON.parse(String(init.body)) : null;
  const J = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s });
  if (u.startsWith("https://sb.test/rest/v1/vm_pautas_semanais")) return J(structuredClone(pautas));
  if (u.startsWith("https://sb.test/rest/v1/vm_artigo_semanal_execucoes")) {
    if (metodo === "POST") { const l = corpo[0]; bd.exec = bd.exec.filter((e: O) => !(e.pauta === l.pauta && e.semana === l.semana && e.modo === l.modo)); bd.exec.push(structuredClone(l)); return J(null, 201); }
    const q = new URL(u).searchParams; let l = bd.exec;
    for (const k of ["pauta", "modo", "semana"]) { const v = q.get(k); if (v?.startsWith("eq.")) l = l.filter((e: O) => e[k] === v.slice(3)); if (v?.startsWith("gte.")) l = l.filter((e: O) => e[k] >= v.slice(4)); }
    return J(structuredClone(l));
  }
  if (u.startsWith("https://sb.test/rest/v1/cotacoes")) return J([]);
  if (u.startsWith("https://sb.test/rest/v1/rpc/")) return J(null);
  if (u.startsWith("https://sb.test/rest/v1/vm_artigos")) { bd.artigos.push(corpo[0]); return J([{ id: 100 + bd.artigos.length }], 201); }
  if (u === "https://api.test/v1/messages/batches" && metodo === "POST") { lotes.push(corpo); nLote++; return J({ id: "L" + nLote }); }
  if (u.startsWith("https://api.test/v1/messages/batches/L")) return J({ processing_status: "ended", results_url: "https://api.test/res" });
  if (u === "https://api.test/res") return new Response(JSON.stringify({ result: { type: "succeeded", message: { stop_reason: "tool_use", usage: { input_tokens: 100000, output_tokens: 15000, server_tool_use: { web_search_requests: 55 } },
    content: [{ type: "web_search_tool_result", content: urls }, { type: "tool_use", name: "entregar_apuracao_ampla", input: { data_referencia: "2026-10-25",
      pautas: [{ pauta: "juros-inflacao", secoes: [{ secao: "Seção A", fatos: fatos("Selic", nJuros) }] }, { pauta: "cambio", secoes: [{ secao: "Seção A", fatos: fatos("dólar", nCambio) }] }] } }] } } }));
  if (u === "https://ds.test/chat/completions") { ds.push(corpo); const t = corpo.messages[0].content.includes("Selic fato") ? "Selic" : "dólar";
    return J({ choices: [{ message: { content: JSON.stringify(artigoDs(t, "2026-10-25")) } }], usage: { prompt_tokens: 9000, completion_tokens: 3000 } }); }
  if (u.startsWith("https://un.test")) return J({ results: [] });
  return J({ erro: "não previsto " + u }, 404);
});
const T = (h: string) => new Date(`2026-10-25T${h}:00-03:00`);   // domingo 25/10
await m.passo("", undefined, T("15:00"));
ok(lotes.length === 0 && bd.exec.length === 0, "antes das 16h: nada");
await m.passo("", undefined, T("16:10"));
const g1 = bd.exec.find((e: O) => e.pauta === "apuracao-semanal");
ok(lotes.length === 1 && g1?.etapa === "aguardando", "16h10: UMA apuração ampla enviada");
const sys = lotes[0].requests[0].params.system;
ok(sys.includes('PAUTA "juros-inflacao"') && sys.includes('PAUTA "cambio"') && sys.includes("Banco Central, IBGE") && !sys.includes('PAUTA "apuracao-semanal"'), "o pedido traz as 2 pautas do grupo com suas fontes");
ok(lotes[0].requests[0].params.tools.some((t: O) => t.name === "entregar_apuracao_ampla" ) && lotes[0].requests[0].params.tools[0].max_uses === 60, "ferramenta da apuração ampla e 60 buscas");
ok(bd.exec.filter((e: O) => e.etapa === "esperando").length === 2, "as 2 pautas esperam a apuração");
// 1ª resposta: câmbio fraco (3 fatos) -> pede complemento uma vez
await m.passo("", undefined, T("16:15"));
ok(lotes.length === 2 && lotes[1].requests[0].params.messages.at(-1).content.includes("cambio (3)"), "câmbio fraco: pede complemento da apuração");
nCambio = 18;
await m.passo("", undefined, T("16:20"));
const g2 = bd.exec.find((e: O) => e.pauta === "apuracao-semanal");
ok(g2.etapa === "concluida" && g2.artigo.por_pauta["cambio"][0].fatos.length === 18, "apuração ampla concluída: " + g2.registro.at(-1));
ok(bd.exec.filter((e: O) => e.etapa === "apurada").length === 2 && ds.length === 0, "as 2 pautas recebem seus fatos (ainda sem DeepSeek)");
await m.passo("", undefined, T("16:25"));
ok(ds.length === 1, "1 texto da DeepSeek por passo (limite de 150 s)");
await m.passo("", undefined, T("16:30"));
ok(ds.length === 2 && bd.artigos.length === 2, "2 artigos escritos e gravados");
const aj = bd.artigos.find((a: O) => a.editoria === "Política Econômica"), ac = bd.artigos.find((a: O) => a.editoria === "Mercados");
ok(aj?.situacao === "agendado" && aj.publicar_em === "2026-10-26T12:00:00.000Z" && ac?.publicar_em === "2026-10-26T14:00:00.000Z", "agendados: juros seg 09h, câmbio seg 11h");
const pj = ds.find((d: O) => d.messages[0].content.includes("Selic fato"));
ok(pj.messages[0].content.includes("especializado em política monetária") && !pj.messages[0].content.includes("dólar fato") && pj.messages[0].content.includes("Cite a decisão do Copom"), "cada artigo recebe só os seus fatos e o seu perfil");
ok(!pj.messages[0].content.includes("energia e petróleo"), "perfil de petróleo não vaza para juros");
const custoTotal = lotes.length;
await m.passo("", undefined, T("17:00"));
ok(lotes.length === custoTotal && ds.length === 2, "não repete na mesma semana");
// sem perfil -> petróleo (Petrobras continua igual)
const sp = m.instrucoes({ ...base, id: "petrobras", nome: "p", chapeu: "P", editoria: "Empresas", tema: "t", hora_escrever: 1, hora_publicar: 1 } as any, "2026-10-25", "-");
ok(sp.includes("especializado em energia e petróleo") && sp.includes("efeito observado no Brent"), "pauta sem perfil continua com o perfil de petróleo");
// apuração que falha -> pautas falham
bd.exec = []; nJuros = 2; nCambio = 2;
await m.passo("teste", "apuracao-semanal", T("18:00"));
ok(bd.exec.filter((e: O) => e.modo === "teste").length === 3, "teste do grupo cria a apuração e as 2 pautas");
await m.passo("", undefined, T("18:05")); await m.passo("", undefined, T("18:10")); await m.passo("", undefined, T("18:15"));
ok(bd.exec.filter((e: O) => e.modo === "teste" && e.etapa === "falhou").length === 3, "apuração fraca duas vezes: apuração e pautas falham, nada é publicado");
console.log(falhas ? `FALHAS: ${falhas}` : "TUDO OK"); if (falhas) Deno.exit(1);
