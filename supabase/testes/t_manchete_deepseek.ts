// testes da manchete-do-dia v1.2 — fluxo DeepSeek (Sonnet apura às 05h, DeepSeek V4 Pro escreve às 07h, publica 07h15) (rodar: deno run -A t_manchete.ts [paridade.json gerado pelo robô Python])
(Deno as unknown as { serve: unknown }).serve = () => {};
Deno.env.set("SUPABASE_URL", "https://sb.test"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_teste");
Deno.env.set("ANTHROPIC_API_KEY", "chave-teste"); Deno.env.set("COLETOR_TOKEN", "tok"); Deno.env.set("UNSPLASH_ACCESS_KEY", "un-teste");
Deno.env.set("ANTHROPIC_URL", "https://api.test/v1"); Deno.env.set("DEEPSEEK_API_KEY", "ds-teste"); Deno.env.set("DEEPSEEK_URL", "https://ds.test"); Deno.env.set("UNSPLASH_URL", "https://un.test");
const m = await import("../functions/manchete-do-dia/index.ts");
let falhas = 0; const ok = (c: boolean, n: string) => { console.log((c ? "OK  " : "FALHOU ") + n); if (!c) falhas++; };
type O = Record<string, any>;

// ---------------------------------------------------------------- 1. paridade com o robô Python v1.4
const par = Deno.args[0] ? JSON.parse(await Deno.readTextFile(Deno.args[0])) : null;
if (par) {
  ok(JSON.stringify(par.casos_txt.map(m.semFormulas)) === JSON.stringify(par.txt), "semFormulas igual ao Python");
  ok(JSON.stringify(par.casos_hora.map(m.horaNorm)) === JSON.stringify(par.hora), "horaNorm igual ao Python: " + JSON.stringify(par.casos_hora.map(m.horaNorm)));
  ok(JSON.stringify(par.casos_cons.map(m.consensoNorm)) === JSON.stringify(par.cons), "consensoNorm igual ao Python");
  ok(JSON.stringify(par.casos_vei.map(m.citacoesDeVeiculos)) === JSON.stringify(par.vei), "citações de veículos iguais ao Python: " + JSON.stringify(par.casos_vei.map(m.citacoesDeVeiculos)));
  const l = m.limpar(structuredClone(par.ed_in), par.urls);
  ok(JSON.stringify(l.ed) === JSON.stringify(par.limpo), "limpar() igual ao Python");
  ok(JSON.stringify(l.fontes) === JSON.stringify(par.fontes), "fontes conferidas iguais ao Python: " + JSON.stringify(l.fontes));
  ok(JSON.stringify(m.problemas(l.ed, l.fontes, l.dataRef, "2026-10-16")) === JSON.stringify(par.probl), "problemas() igual ao Python");
  ok(m.instrucoes("2026-10-16") === par.instr, "instruções idênticas às do Python");
}

// ---------------------------------------------------------------- 2. simulador (PostgREST + Anthropic lote + Unsplash)
const db: { exec: O[]; ed: O[] } = { exec: [], ed: [] };
const lotes: O[] = []; const ds: O[] = []; const dsResp: string[] = [];                      // pedidos recebidos
const respostas: O[] = [];                  // fila de resultados: {pendente:true} | {result:{...}}
let consultas = 0, avisoUnsplash = 0;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
function filtra(rows: O[], q: URLSearchParams) {
  return rows.filter((r) => [...q.entries()].every(([k, v]) => {
    if (["select", "order", "limit", "on_conflict"].includes(k)) return true;
    if (v.startsWith("eq.")) return String(r[k]) === v.slice(3);
    if (v === "is.true") return r[k] === true;
    return true;
  }));
}
m.usarFetch((async (u: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(u)), metodo = init?.method ?? "GET";
  const corpo = init?.body ? JSON.parse(String(init.body)) : null;
  if (url.host === "sb.test") {
    const tab = url.pathname.split("/").pop()!, rows = tab === "vm_edicoes" ? db.ed : db.exec;
    if (metodo === "GET") {
      let l = filtra(rows, url.searchParams);
      if (url.searchParams.get("order") === "data.desc") l = [...l].sort((a, b) => a.data < b.data ? 1 : -1);
      return json(structuredClone(l));
    }
    for (const linha of corpo) {
      const chaves = (url.searchParams.get("on_conflict") ?? "data").split(",");
      const i = rows.findIndex((r) => chaves.every((k) => r[k] === linha[k]));
      if (i >= 0) rows[i] = { ...rows[i], ...structuredClone(linha) }; else rows.push(structuredClone(linha));
    }
    return new Response(null, { status: 201 });
  }
  if (url.host === "api.test") {
    if ((init?.headers as O)?.["x-api-key"] !== "chave-teste") return json({ error: "x" }, 401);
    if (metodo === "POST" && url.pathname === "/v1/messages/batches") { lotes.push(corpo); return json({ id: "lote" + lotes.length, processing_status: "in_progress" }); }
    if (url.pathname.startsWith("/v1/messages/batches/") && !url.pathname.endsWith("/results")) {
      consultas++;
      const r = respostas[0];
      if (!r || r.pendente) { if (r) respostas.shift(); return json({ id: "x", processing_status: "in_progress", results_url: null }); }
      return json({ id: "x", processing_status: "ended", results_url: `https://api.test${url.pathname}/results` });
    }
    if (url.pathname.endsWith("/results")) { const r = respostas.shift(); return new Response(JSON.stringify({ custom_id: "c", result: r!.result }) + "\n"); }
  }
  if (url.host === "ds.test") { ds.push(corpo); return json({ choices: [{ message: { content: dsResp.shift() ?? "{}" } }], usage: { prompt_tokens: 12000, completion_tokens: 3000 } }); }
  if (url.host === "un.test") {
    if (url.pathname === "/search/photos") return json({ results: [
      { id: "usada", width: 4000, height: 3000, urls: { raw: "https://images.unsplash.com/usada?ixid=1" }, user: { name: "X" }, links: {} },
      { id: "vertical", width: 2000, height: 3000, urls: { raw: "https://images.unsplash.com/v?ixid=1" }, user: { name: "Y" }, links: {} },
      { id: "boa", width: 4000, height: 2500, color: "#334", alt_description: "trading screen", urls: { raw: "https://images.unsplash.com/boa?ixid=1" },
        user: { name: "Ana Foto", links: { html: "https://unsplash.com/@ana" } }, links: { html: "https://unsplash.com/photos/boa", download_location: "https://un.test/photos/boa/download" } }] });
    if (url.pathname === "/photos/boa/download") { avisoUnsplash++; return json({}); }
  }
  return json({ erro: "inesperado " + url }, 404);
}) as typeof fetch);

const BUSCA = { type: "web_search_tool_result", content: [
  { type: "web_search_result", url: "https://www.bcb.gov.br/copom?utm_source=x", title: "Copom" },
  { type: "web_search_result", url: "https://www.ibge.gov.br/ipca/", title: "IPCA" },
  { type: "web_search_result", url: "https://b3.com.br/ibov", title: "Ibovespa" }] };
const EDICAO = (paras = 3) => ({ data_referencia: "2026-10-16",
  manchete: { cartola: "política monetária", titulo: "Copom mantém Selic em 15,00% e sinaliza pausa longa", linha_fina: "Curva de juros recua 12 pontos-base",
    corpo: ["Primeiro parágrafo com dado de 15,00%.", "Segundo parágrafo.", "Terceiro parágrafo.", "Quarto parágrafo."].slice(0, paras),
    foto_busca: "central bank building", foto_alternativa: "stock exchange" },
  scanner: { pos_fechamento: [{ titulo: "a", texto: "A" }, { titulo: "b", texto: "B" }, { titulo: "c", texto: "C" }],
    agenda: [{ hora: "10:00", evento: "IPCA-15", consenso: "0,30%" }, { hora: "09h", evento: "Fala do BC", consenso: "Sem consenso" }],
    semana: [{ quando: "Seg (19/10)", texto: "X" }, { quando: "Ter (20/10)", texto: "Y" }, { quando: "Qua (21/10)", texto: "Z" }] },
  fontes: [{ url: "https://bcb.gov.br/copom" }, { url: "https://www.ibge.gov.br/ipca" }, { url: "https://b3.com.br/ibov/" }, { url: "https://inventado.com/x" }] });
const sucesso = (content: O[], stop = "tool_use") => ({ result: { type: "succeeded", message: { content, stop_reason: stop,
  usage: { input_tokens: 100000, output_tokens: 8000, server_tool_use: { web_search_requests: 6 } } } } });
const entrega = (e: O) => ({ type: "tool_use", name: "entregar_edicao", input: e });
const brt = (h: string, d = "2026-10-16") => new Date(`${d}T${h}:00-03:00`);
const exec = (modo = "producao") => db.exec.find((e) => e.modo === modo)!;

// ---------------------------------------------------------------- 3. dia normal
db.ed.push({ data: "2026-10-15", publicado: true, conteudo: { manchete: { foto: { id: "usada" } } } });   // foto de ontem não repete
const deHoje = () => db.ed.filter((e) => e.data === "2026-10-16");
ok((await m.passo("", brt("04:55"))).etapa === "fora do horário", "04h55: fora do horário, nada acontece");
ok(lotes.length === 0 && db.exec.length === 0, "nenhum pedido antes das 05h00");

const FATOS = Array.from({ length: 30 }, (_, i) => ({ data: "16/10", hora: "08h00", fato: `Fato ${i} do dia.`, url: ["https://www.bcb.gov.br/copom", "https://www.ibge.gov.br/ipca/", "https://b3.com.br/ibov"][i % 3] }));
const apuracao = (n: number) => ({ type: "tool_use", name: "entregar_apuracao", input: { data_referencia: "2026-10-16", secoes: [{ secao: "Candidatas a manchete", fatos: FATOS.slice(0, n) }] } });
let r = await m.passo("", brt("05:00"));
const p1 = lotes[0].requests[0].params;
ok(r.etapa === "aguardando" && p1.tools[1].name === "entregar_apuracao" && p1.system.includes("apurador sênior") && p1.model === "claude-sonnet-5-5", "05h00: o Sonnet APURA (busca + entregar_apuracao)");
respostas.push(sucesso([BUSCA, apuracao(10)]));
r = await m.passo("", brt("05:05"));
ok(lotes.length === 2 && lotes[1].requests[0].params.messages.at(-1).content.includes("10 fatos"), "apuração fraca (10): pede complemento");
respostas.push(sucesso([BUSCA, apuracao(30)]));
r = await m.passo("", brt("05:10"));
ok(r.etapa === "apurada" && ds.length === 0, "05h10: apuração pronta (30 fatos); DeepSeek ainda não");
r = await m.passo("", brt("06:55"));
ok(r.etapa === "apurada" && ds.length === 0, "06h55: espera o horário fora do pico");
dsResp.push(JSON.stringify(EDICAO(2)));
r = await m.passo("", brt("07:00"));
ok(ds.length === 1 && ds[0].model === "deepseek-v4-pro" && ds[0].response_format.type === "json_object", "07h00: DeepSeek V4 Pro escreve (JSON)");
ok(ds[0].messages[0].content.includes("[APURAÇÃO DE HOJE]") && ds[0].messages[0].content.includes("Fato 7 do dia") && !ds[0].messages[0].content.includes("Use a ferramenta de busca"), "o prompt traz a apuração e proíbe inventar");
ok(r.etapa === "apurada" && exec().rodada === 1, "texto com 2 parágrafos reprovado: corrige no próximo passo");
dsResp.push(JSON.stringify(EDICAO(4)));
r = await m.passo("", brt("07:05"));
ok(r.etapa === "pronta" && ds.length === 2 && ds[1].messages[1].content.includes("3 a 4 parágrafos"), "07h05: correção aprovada, edição pronta");
ok(exec().fontes.length === 3 && exec().edicao.manchete.cartola === "POLÍTICA MONETÁRIA", "fontes só da apuração; cartola normalizada");
r = await m.passo("", brt("07:10"));
ok(r.etapa === "pronta" && deHoje().length === 0, "07h10: ainda não publica");
r = await m.passo("", brt("07:15"));
ok(r.etapa === "publicada" && deHoje()[0]?.modelo === "deepseek-v4-pro", "07h15: PUBLICADA (redator DeepSeek V4 Pro)");
// DeepSeek falha duas vezes: não publica (reserva do GitHub às 08h00)
db.exec = []; db.ed = []; lotes.length = 0; ds.length = 0;
await m.passo("", brt("05:00", "2026-10-19"));
respostas.push(sucesso([BUSCA, { ...apuracao(30), input: { data_referencia: "2026-10-19", secoes: [{ secao: "x", fatos: FATOS }] } }]));
await m.passo("", brt("05:05", "2026-10-19"));
dsResp.push("sem json"); dsResp.push("de novo sem json");
await m.passo("", brt("07:00", "2026-10-19")); r = await m.passo("", brt("07:05", "2026-10-19"));
ok(r.etapa === "nova" && db.ed.length === 0, "DeepSeek falhou 2 vezes: NÃO publica o texto dela e passa para o Claude (v1.4)");
r = await m.passo("", brt("07:10", "2026-10-19"));
{ const ul = lotes.at(-1)?.requests?.[0]?.params ?? {}; const msg = JSON.stringify(ul.messages ?? []);
  ok(r.etapa === "aguardando" && (ul.tools ?? []).some((t: Record<string, unknown>) => t.name === "entregar_edicao") && msg.includes("apuração abaixo"),
     "v1.4: 07h10 o Claude recebe a apuração de hoje e escreve (ferramenta entregar_edicao)"); }
// teste à mão: a DeepSeek escreve na hora, sem esperar 07h00
db.exec = []; lotes.length = 0; ds.length = 0;
await m.passo("teste", brt("15:00", "2026-10-20"));
respostas.push(sucesso([BUSCA, { ...apuracao(30), input: { data_referencia: "2026-10-20", secoes: [{ secao: "x", fatos: FATOS }] } }]));
await m.passo("continuar_teste", brt("15:05", "2026-10-20"));
dsResp.push(JSON.stringify({ ...EDICAO(4), data_referencia: "2026-10-20" }));
r = await m.passo("continuar_teste", brt("15:10", "2026-10-20"));
ok(r.etapa === "pronta" && ds.length === 1 && db.ed.length === 0, "teste: escreve na hora e NÃO publica");
console.log(falhas ? `FALHAS: ${falhas}` : "TUDO OK"); if (falhas) Deno.exit(1);
