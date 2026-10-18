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
const G = { ...base, periodo: "dia", dias_semana: [1, 2, 3, 4, 5], id: "apuracao-diaria", nome: "Apuração ampla", chapeu: "APURAÇÃO", editoria: "Economia", tema: "orientação geral", tipo: "apuracao", hora_escrever: 7 * 60, hora_publicar: 0, buscas: 60 };
const J1 = { ...base, periodo: "dia", dias_semana: [1, 2, 3, 4, 5], dias_publicar: 0, id: "juros-dia", nome: "Juros", chapeu: "JUROS & INFLAÇÃO", editoria: "Política Econômica", tema: "Selic e IPCA", grupo: "apuracao-diaria",
  hora_escrever: 7 * 60 + 5, hora_publicar: 9 * 60, exigir: ["Selic"], perfil: "especializado em política monetária", area: "juros e inflação", fontes_primarias: "Banco Central, IBGE",
  regras: "- Cite a decisão do Copom quando houver.", foto_exemplos: "\"central bank building\"", numeros: "pontos-base" };
const J2 = { ...base, periodo: "dia", dias_semana: [1, 2, 3, 4, 5], dias_publicar: 0, id: "cambio-dia", nome: "Câmbio", chapeu: "CÂMBIO", editoria: "Mercados", tema: "dólar", grupo: "apuracao-diaria", hora_escrever: 7 * 60 + 5, hora_publicar: 11 * 60, exigir: ["dólar"] };
const pautas = [J1, J2, G];
const urls = Array.from({ length: 6 }, (_, i) => ({ url: `https://fonte.test/${i}`, title: `F${i}` }));
const fatos = (t: string, n: number) => Array.from({ length: n }, (_, i) => ({ data: "15/10", fato: `${t} fato ${i}.`, url: `https://fonte.test/${i % 6}` }));
let nJuros = 20, nCambio = 14; let DIA = "2026-10-26";
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
    content: [{ type: "web_search_tool_result", content: urls }, { type: "tool_use", name: "entregar_apuracao_ampla", input: { data_referencia: DIA,
      pautas: [{ pauta: "juros-dia", secoes: [{ secao: "Seção A", fatos: fatos("Selic", nJuros) }] }, { pauta: "cambio-dia", secoes: [{ secao: "Seção A", fatos: fatos("dólar", nCambio) }] }] } }] } } }));
  if (u === "https://ds.test/chat/completions") { ds.push(corpo); const t = corpo.messages[0].content.includes("Selic fato") ? "Selic" : "dólar";
    return J({ choices: [{ message: { content: JSON.stringify(artigoDs(t, DIA)) } }], usage: { prompt_tokens: 9000, completion_tokens: 3000 } }); }
  if (u.startsWith("https://un.test")) return J({ results: [] });
  return J({ erro: "não previsto " + u }, 404);
});

const T = (h: string, d = DIA) => new Date(`${d}T${h}:00-03:00`);
await m.passo("", undefined, T("07:00", "2026-10-24"));          // sábado
ok(lotes.length === 0, "sábado: nada");
await m.passo("", undefined, T("06:55"));
ok(lotes.length === 0, "segunda 06h55: nada");
await m.passo("", undefined, T("07:00"));
const sys = lotes[0]?.requests[0].params.system ?? "";
ok(lotes.length === 1 && sys.includes("APURAÇÃO AMPLA DO DIA") && sys.includes("últimas 24 horas") && sys.includes("15 a 40"), "segunda 07h00: apuração ampla DO DIA");
await m.passo("", undefined, T("07:05"));
await m.passo("", undefined, T("07:10")); await m.passo("", undefined, T("07:15"));
ok(ds.length === 2 && bd.artigos.length === 2, "2 artigos do dia escritos e gravados (14 fatos no câmbio bastam: mínimo 10)");
const aj = bd.artigos.find((a: O) => a.editoria === "Política Econômica");
ok(aj?.publicar_em === "2026-10-26T12:00:00.000Z", "publicado no MESMO dia às 09h: " + aj?.publicar_em);
ok(ds[0].messages[0].content.includes("ARTIGO DO DIA") && ds[0].messages[0].content.includes("publicado hoje"), "prompt do redator: artigo do dia");
DIA = "2026-10-27";
await m.passo("", undefined, T("07:00"));
ok(lotes.length === 2, "terça 07h00: nova apuração (a de segunda não bloqueia)");
await m.passo("", undefined, T("07:05")); await m.passo("", undefined, T("07:10")); await m.passo("", undefined, T("07:15"));
ok(bd.artigos.length === 4 && bd.artigos.filter((a: O) => String(a.publicar_em).startsWith("2026-10-27")).length === 2, "terça: mais 2 artigos para terça");
await m.passo("", undefined, T("09:00"));
ok(lotes.length === 2 && ds.length === 4, "não repete no mesmo dia");
console.log(falhas ? `FALHAS: ${falhas}` : "TUDO OK"); if (falhas) Deno.exit(1);
