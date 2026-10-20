// testes da manchete-do-dia v1.0 (rodar: deno run -A t_manchete.ts [paridade.json gerado pelo robô Python])
(Deno as unknown as { serve: unknown }).serve = () => {};
Deno.env.set("SUPABASE_URL", "https://sb.test"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_teste");
Deno.env.set("ANTHROPIC_API_KEY", "chave-teste"); Deno.env.set("COLETOR_TOKEN", "tok"); Deno.env.set("UNSPLASH_ACCESS_KEY", "un-teste");
Deno.env.set("ANTHROPIC_URL", "https://api.test/v1"); Deno.env.set("UNSPLASH_URL", "https://un.test");
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
const lotes: O[] = [];                      // pedidos recebidos
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
let r = await m.passo("", brt("05:00"));
ok(r.etapa === "aguardando" && lotes.length === 1, "05h00: pedido em lote enviado");
const p1 = lotes[0].requests[0].params;
ok(p1.model === "claude-sonnet-5-5" && p1.max_tokens === 16000, "modelo e limite iguais ao robô do GitHub");
ok(p1.tools[0].type === "web_search_20250305" && p1.tools[0].max_uses === 8 && p1.tools[1].name === "entregar_edicao", "busca na web (8, opção B) + ferramenta de entrega");
ok(p1.system.includes("sexta-feira, 16 de outubro de 2026 (2026-10-16)"), "instruções com a data de hoje");
respostas.push({ pendente: true });
r = await m.passo("", brt("05:05"));
ok(r.etapa === "aguardando" && lotes.length === 1, "05h05: lote ainda processando, só espera");
respostas.push(sucesso([BUSCA, { type: "server_tool_use", name: "web_search", input: { query: "copom" } }], "pause_turn"));
r = await m.passo("", brt("05:10"));
const p2 = lotes[1]?.requests[0].params;
ok(lotes.length === 2 && p2.messages.length === 2 && p2.messages[1].role === "assistant" && p2.messages[1].content[0].type === "web_search_tool_result",
  "pause_turn: a conversa continua com o que já foi buscado");
respostas.push(sucesso([{ type: "text", text: "" }, entrega(EDICAO(4))]));
r = await m.passo("", brt("05:15"));
ok(r.etapa === "pronta", "05h15: conferência OK, edição pronta (ainda não publicada): " + r.ultimo);
ok(deHoje().length === 0, "nada gravado em vm_edicoes antes das 07h15");
const x = exec();
ok(x.edicao.manchete.foto?.id === "boa" && x.edicao.manchete.foto.fotografo === "Ana Foto" && avisoUnsplash === 1, "foto do Unsplash: pula usada e vertical, avisa o uso");
ok(x.edicao.manchete.foto.pagina_url.includes("utm_source=soliduns_valor_e_mercado"), "crédito da foto com utm");
ok(x.fontes.length === 3 && !JSON.stringify(x.fontes).includes("inventado"), "só fontes que a busca devolveu (link inventado cai)");
ok(x.edicao.scanner.agenda[0].hora === "09h00" && x.edicao.scanner.agenda[0].consenso === "", "agenda em ordem e consenso vazio normalizado");
ok(x.mensagens.length === 0, "conversa apagada ao terminar");
r = await m.passo("", brt("07:10"));
ok(r.etapa === "pronta" && deHoje().length === 0, "07h10: espera o horário");
r = await m.passo("", brt("07:15"));
const pub = deHoje()[0];
ok(r.etapa === "publicada" && deHoje().length === 1 && pub.publicado === true, "07h15: PUBLICADA em vm_edicoes");
ok(pub.custo_usd > 0 && pub.custo_usd < 1 && pub.modelo === "claude-sonnet-5-5", "custo (metade, lote) e modelo gravados: US$ " + pub.custo_usd);
ok(pub.conteudo.manchete.cartola === "POLÍTICA MONETÁRIA" && pub.conteudo.manchete.foto.id === "boa", "cartola em caixa alta e foto gravada");
r = await m.passo("", brt("07:20"));
ok(r.etapa === "publicada" && lotes.length === 2, "07h20: já publicada, nada a fazer");
const sit = await m.passo("situacao", brt("07:25"));
ok(sit.execucoes[0].registro.some((l: string) => l.includes("PUBLICADA")), "situação mostra o registro do dia");

// ---------------------------------------------------------------- 4. correção e desistência
db.exec = []; db.ed = []; lotes.length = 0;
await m.passo("", brt("05:00", "2026-10-19"));
respostas.push(sucesso([BUSCA, entrega({ ...EDICAO(2), data_referencia: "2026-10-19" })]));
r = await m.passo("", brt("05:05", "2026-10-19"));
const pc = lotes[1].requests[0].params;
ok(r.etapa === "aguardando" && pc.messages.length === 1 && pc.messages[0].content.includes("3 a 4 parágrafos") && pc.tools.length === 1,
  "falhou na conferência: UMA correção, conversa curta, sem busca");
respostas.push(sucesso([entrega({ ...EDICAO(2), data_referencia: "2026-10-19" })]));
r = await m.passo("", brt("05:10", "2026-10-19"));
ok(r.etapa === "falhou" && lotes.length === 2, "falhou de novo: NÃO publica e não insiste");
r = await m.passo("", brt("07:15", "2026-10-19"));
ok(db.ed.length === 0 && r.etapa === "falhou", "capa segue com a edição anterior; reserva do GitHub às 08h00");
// correção que precisa de fontes libera 4 buscas
db.exec = []; lotes.length = 0;
await m.passo("", brt("05:00", "2026-10-20"));
respostas.push(sucesso([entrega({ ...EDICAO(3), data_referencia: "2026-10-20" })]));
await m.passo("", brt("05:05", "2026-10-20"));
ok(lotes[1].requests[0].params.tools[0].max_uses === 4, "faltaram fontes: correção pode fazer 4 buscas");
respostas.push(sucesso([BUSCA, entrega({ ...EDICAO(3), data_referencia: "2026-10-20" })]));
r = await m.passo("", brt("05:10", "2026-10-20"));
ok(r.etapa === "pronta", "corrigida na 2ª rodada: pronta");

// ---------------------------------------------------------------- 5. erros do lote
db.exec = []; lotes.length = 0;
await m.passo("", brt("05:00", "2026-10-21"));
respostas.push({ result: { type: "errored", error: { type: "error", error: { type: "not_found_error", message: "model: claude-sonnet-5-5" } } } });
await m.passo("", brt("05:05", "2026-10-21"));
ok(lotes[1].requests[0].params.model === "claude-sonnet-4-5", "modelo inexistente: troca para a reserva");
respostas.push({ result: { type: "errored", error: { type: "error", error: { type: "overloaded_error", message: "" } } } });
await m.passo("", brt("05:10", "2026-10-21"));
ok(lotes.length === 3 && exec().reenvios === 1, "sobrecarga: manda de novo");
respostas.push({ result: { type: "expired" } });
await m.passo("", brt("05:15", "2026-10-21"));
ok(lotes.length === 4 && exec().reenvios === 2, "lote expirado: manda de novo");
// robô do GitHub publicou antes
db.ed.push({ data: "2026-10-21", publicado: true, conteudo: {} });
r = await m.passo("", brt("07:40", "2026-10-21"));
ok(r.etapa === "substituida" && lotes.length === 4, "edição já publicada pelo GitHub: para e não manda mais nada");
ok(db.ed[0].conteudo && JSON.stringify(db.ed[0].conteudo) === "{}", "não sobrescreve a edição publicada");

// ---------------------------------------------------------------- 6. teste (nunca publica) e autorização
db.exec = []; db.ed = []; lotes.length = 0;
r = await m.passo("teste", brt("17:50", "2026-10-16"));
ok(r.modo === "teste" && r.etapa === "aguardando", "teste começa a qualquer hora");
ok((await m.passo("", brt("17:55", "2026-10-16"))).etapa === "fora do horário", "produção continua fora do horário");
respostas.push(sucesso([BUSCA, entrega(EDICAO(3))]));
r = await m.passo("continuar_teste", brt("17:55", "2026-10-16"));
ok(r.etapa === "pronta" && db.ed.length === 0, "teste fica pronto e NÃO publica");
ok((await m.passo("continuar_teste", brt("18:00", "2026-10-16"))).etapa === "pronta" && lotes.length === 1, "teste terminado não manda mais pedidos");
const neg = await m.tratar(new Request("https://f.test", { method: "POST", headers: { Authorization: "Bearer errado" }, body: "{}" }));
ok(neg.status === 401, "sem o token do coletor: 401");
const fonte = await Deno.readTextFile(new URL("../functions/manchete-do-dia/index.ts", import.meta.url));
ok(!/sk-ant-|eyJhbGci|sb_secret_[A-Za-z0-9]{10}/.test(fonte), "nenhuma chave no código");

console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
Deno.exit(falhas ? 1 : 0);
