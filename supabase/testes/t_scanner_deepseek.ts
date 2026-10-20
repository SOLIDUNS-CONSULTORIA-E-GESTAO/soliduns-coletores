// teste do scanner-do-dia v2.3: DeepSeek V4 Pro escreve; se falhar, o Claude assume (rodar: deno run -A t_scanner_deepseek.ts)
(Deno as unknown as { serve: unknown }).serve = () => {};
Deno.env.set("SUPABASE_URL", "https://sb.test"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "sb_x"); Deno.env.set("ANTHROPIC_API_KEY", "k");
Deno.env.set("DEEPSEEK_API_KEY", "ds"); Deno.env.set("VM_SCANNER_REDATOR", "deepseek"); Deno.env.set("DEEPSEEK_URL", "https://ds.test"); Deno.env.set("VM_ANTHROPIC_URL", "https://api.test/v1/messages");
const s = await import("../functions/scanner-do-dia/index.ts");
let falhas = 0; const ok = (c: boolean, n: string) => { console.log((c ? "OK  " : "FALHOU ") + n); if (!c) falhas++; };
const pedidos: any[] = []; let dsStatus = 200;
globalThis.fetch = (async (u: string, init?: RequestInit) => {
  const b = JSON.parse(String(init?.body ?? "{}")); pedidos.push({ u: String(u), b });
  if (String(u).startsWith("https://ds.test")) return new Response(dsStatus === 200 ? JSON.stringify({ choices: [{ message: { content: '{"chapeu":"Scanner","titulo":"T"}' }, finish_reason: "stop" }], usage: { prompt_tokens: 9000, completion_tokens: 1500 } }) : "erro", { status: dsStatus });
  return new Response(JSON.stringify({ content: [{ type: "text", text: '{"chapeu":"Scanner","titulo":"C"}' }], usage: { input_tokens: 9000, output_tokens: 1500 }, stop_reason: "end_turn" }), { status: 200 });
}) as typeof fetch;
let r = await s.chamar([{ role: "user", content: "contexto" }]);
ok(r.modelo === "deepseek-v4-pro" && pedidos[0].u === "https://ds.test/chat/completions" && pedidos[0].b.messages[0].role === "system" && pedidos[0].b.messages[0].content === s.SISTEMA, "DeepSeek V4 Pro com o prompt de sistema EXATO do Scanner");
ok(pedidos[0].b.response_format.type === "json_object" && r.texto.includes("Scanner"), "resposta em JSON");
ok(Math.abs(s.precoDe(r.modelo).ent - 0.66) < 1e-9, "custo registrado pelo preço da DeepSeek fora do pico");
dsStatus = 500; pedidos.length = 0;
r = await s.chamar([{ role: "user", content: "contexto" }]);
ok(r.modelo.startsWith("claude") && pedidos.length === 2, "DeepSeek fora do ar: o Claude assume na hora");
Deno.env.set("VM_SCANNER_REDATOR", "claude"); pedidos.length = 0;
r = await s.chamar([{ role: "user", content: "contexto" }]);
ok(r.modelo.startsWith("claude") && pedidos.length === 1, "VM_SCANNER_REDATOR=claude volta ao Claude");
console.log(falhas ? `FALHAS: ${falhas}` : "TUDO OK"); if (falhas) Deno.exit(1);
