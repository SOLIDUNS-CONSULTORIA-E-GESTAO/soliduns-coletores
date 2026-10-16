// testes da telegram-envio v1.0 (rodar: deno run -A t_telegram.ts)
(Deno as unknown as { serve: unknown }).serve = () => {};
const m = await import("../functions/telegram-envio/index.ts");
let falhas = 0; const ok = (c: boolean, n: string) => { console.log((c ? "OK  " : "FALHOU ") + n); if (!c) falhas++; };

const itens = m.itensDe(
  [{ data: "2026-10-16", conteudo: { manchete: { titulo: "Ibovespa <b>sobe</b> com **Copom**", corpo: ["Primeira frase aqui. Segunda.", "x"] } } }],
  [{ id: 9, data_ref: "2026-10-16", texto_aprovado: { titulo: "Scanner & mercado", linha_fina: "Agenda cheia" } }],
  [{ id: 3, chapeu: null, titulo: "Artigo", linha_fina: null, corpo: [{ tipo: "intertitulo", texto: "T" }, { tipo: "paragrafo", texto: "Abre o texto. Depois." }] },
   { id: 4, chapeu: null, titulo: "  ", linha_fina: null, corpo: [] }]);
ok(itens.length === 3, "3 itens (artigo sem título ignorado)");
ok(itens[0].titulo === "Ibovespa sobe com Copom" && itens[0].linha === "Primeira frase aqui.", "manchete limpa e 1ª frase");
ok(itens[1].link === "https://soliduns.com.br/noticias/?scanner=2026-10-16", "link do Scanner");
ok(itens[2].link.endsWith("?artigo=3") && itens[2].linha === "Abre o texto.", "artigo: link e 1º parágrafo");
const msg = m.mensagem(itens[1]);
ok(msg.includes("Scanner &amp; mercado") && msg.includes("SCANNER DO DIA"), "mensagem HTML escapada");
// layouts diferentes (v1.1)
const comFoto = m.itensDe([{ data: "2026-10-16", conteudo: { manchete: { cartola: "JUROS", titulo: "T", linha_fina: "L",
  foto: { src: "https://images.pexels.com/a.jpg", src_grande: "https://images.pexels.com/a2.jpg", fotografo: "Ana", fonte: "Pexels" } } } }], [], [])[0];
const e1 = m.envio(comFoto, "-1");
ok(e1.metodo === "sendPhoto" && e1.dados.photo === "https://images.pexels.com/a2.jpg", "manchete vai com foto grande");
ok(String(e1.dados.caption).startsWith("📰 <b>MANCHETE DO DIA</b> · sexta, 16/10") && String(e1.dados.caption).includes("Foto: Ana / Pexels"), "manchete: faixa, data e crédito");
ok((e1.dados.reply_markup as any).inline_keyboard[0][0].text === "📰 Ler a manchete", "botão da manchete");
const sc = m.itensDe([], [{ id: 1, data_ref: "2026-10-16", texto_aprovado: { titulo: "Tit" } }], [],
  { "2026-10-16": m.agendaCurta([{ hora: "09h30", evento: "CPI dos EUA", regiao: "us" }, { hora: "Dia todo", evento: "x", regiao: "br" },
    { hora: "08h25", evento: "Boletim Focus", regiao: "br" }, { hora: "09h30", evento: "CPI dos EUA", regiao: "us" }]) })[0];
const e2 = m.envio(sc, "-1");
ok(e2.metodo === "sendMessage" && (e2.dados.link_preview_options as any).is_disabled === true, "scanner sem prévia de link");
ok(String(e2.dados.text).includes("🇧🇷 <b>08h25</b> — Boletim Focus\n🇺🇸 <b>09h30</b> — CPI dos EUA") && !String(e2.dados.text).includes("Dia todo"), "scanner: agenda em ordem, sem repetição");
ok((e2.dados.reply_markup as any).inline_keyboard[0][0].text === "📊 Abrir o Scanner", "botão do Scanner");
const ar = m.itensDe([], [], [{ id: 5, chapeu: null, titulo: "Art", linha_fina: "LF", corpo: [], editoria: "Mercados", autor: "Dr. Thiago Viegas", publicado_em: "2026-10-16T13:00:00Z" }])[0];
const e3 = m.envio(ar, "-1");
ok(String(e3.dados.text).startsWith("✍️ <b>ARTIGO</b> · Mercados") && String(e3.dados.text).includes("Por Dr. Thiago Viegas"), "artigo: faixa e assinatura");
ok(new Set([e1, e2, e3].map((e) => String(e.dados.text ?? e.dados.caption).slice(0, 4))).size === 3, "3 cabeçalhos diferentes");
ok(!/\bIA\b|intelig[eê]ncia artificial|gerad/i.test(msg + m.mensagem(itens[0])), "sem menção a IA");
ok(m.corta("a ".repeat(300), 100).length <= 101, "corte com reticências");

// envio: 2 destinos, um já feito, um que migra, um bloqueado
const chamadas: Record<string, unknown>[] = []; const gravados: Record<string, unknown>[] = []; const desl: string[] = [];
const tg = async (met: string, d: Record<string, unknown>) => {
  chamadas.push({ met, ...d });
  if (d.chat_id === "-1") return { ok: false, error_code: 400, description: "migrated", parameters: { migrate_to_chat_id: -100777 } };
  if (d.chat_id === "-2") return { ok: false, error_code: 403, description: "bot was kicked" };
  return { ok: true, result: { message_id: 42 } };
};
const r = await m.enviar(tg, [itens[0]], [{ chat_id: "@canal", nome: "canal" }, { chat_id: "-1", nome: "g1" }, { chat_id: "-2", nome: "g2" }],
  new Set(["manchete:2026-10-16|@canal"]), async (l) => { gravados.push(l); }, async (c, n) => { desl.push(c + "->" + (n ?? "off")); });
ok(r.enviados === 1 && r.falhas === 1, "1 enviado (migrado) e 1 falha");
ok(!chamadas.some((c) => c.chat_id === "@canal"), "não repete o que já foi");
ok(gravados.some((g) => g.chat_id === "-100777" && g.ok), "grava no número novo do supergrupo");
ok(desl.includes("-1->-100777") && desl.includes("-2->off"), "atualiza migrado e desliga bloqueado");

// avisos do Telegram
const salvos: Record<string, unknown>[] = []; const apagados: string[] = []; const saiu: unknown[] = [];
const tg2 = async (met: string, d: Record<string, unknown>) => { if (met === "leaveChat") saiu.push(d.chat_id); return { ok: true }; };
const av = (from: number, st: string, user?: string) => ({ my_chat_member: { chat: { id: -100555, title: "Grupo", type: "supergroup", username: user }, from: { id: from }, new_chat_member: { status: st } } });
ok(await m.tratarAviso(tg2, av(111, "member"), "111", async (d) => { salvos.push(d); }, async (c) => { apagados.push(c); }) === "destino ligado", "dono adiciona: liga");
ok(await m.tratarAviso(tg2, av(999, "member"), "111", async (d) => { salvos.push(d); }, async () => {}) === "adicionado por outra pessoa — robô saiu" && saiu.length === 1, "estranho adiciona: sai");
ok(await m.tratarAviso(tg2, av(111, "administrator", "valoremercadojornal"), "111", async (d) => { salvos.push(d); }, async (c) => { apagados.push(c); }) === "destino ligado" && apagados.includes("@valoremercadojornal"), "canal: troca @endereço pelo número");
ok(await m.tratarAviso(tg2, av(111, "kicked"), "111", async (d) => { salvos.push(d); }, async () => {}) === "destino desligado" && salvos.at(-1)?.ativo === false, "removido: desliga");
ok((await m.segredoWebhook("abc")).length === 48 && /^[0-9a-f]+$/.test(await m.segredoWebhook("abc")), "segredo do aviso válido");

// handler: sem segredo correto -> 401
Deno.env.set("TELEGRAM_TOKEN", "t"); Deno.env.set("TELEGRAM_DONO_ID", "111"); Deno.env.set("COLETOR_TOKEN", "c");
ok((await m.tratar(new Request("http://x", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "errado" }, body: "{}" }))).status === 401, "aviso falso recusado");
ok((await m.tratar(new Request("http://x", { method: "POST", body: "{}" }))).status === 401, "agendador sem token recusado");
console.log(falhas ? `${falhas} FALHAS` : "TODOS OK"); Deno.exit(falhas ? 1 : 0);
