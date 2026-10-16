// SOLIDUNS · Valor e Mercado — Edge Function "calendario-oficial" — v1.3 (15/10/2026)
//
// Plano de correção das fontes, item 1 (pedido do Thiago, 15/10 12h25): a agenda do dia passa a vir, em primeiro lugar,
// dos CALENDÁRIOS OFICIAIS do catálogo (public.fontes_noticia), gravados em public.vm_agenda com origem = 'calendario_oficial'.
// O Scanner do Dia já dá prioridade a essa origem; a pesquisa na web (agenda-do-dia) fica só como complemento.
//
// Fontes (cada uma só roda depois de CONFERIDA À MÃO: fontes_noticia.verificada_em preenchida — regra do Thiago):
//   - IBGE — calendário de divulgações (API servicodados, v3)            -> pilar 6 (IPCA, PIB, PMC, PMS, PIM, PNAD…)
//   - BLS — calendário de divulgações (arquivo iCal oficial bls.ics)       -> pilar 3 (CPI, PPI, payroll, JOLTS…)
//   - Federal Reserve — calendário do FOMC (datas publicadas pelo Fed)    -> pilar 3 (decisão, entrevista, ata)
//   - Banco Central — Copom (calendário oficial; ata na terça seguinte)   -> pilar 3
//   - Banco Central — Boletim Focus (segundas, 8h25; feriado: dia útil seguinte) -> pilar 3
// Horários sempre em Brasília (UTC−3). Horário de Nova York convertido com o horário de verão americano.
// Grava hoje e os próximos dias (padrão 7) — idempotente (chave única). Registra a execução em public.vm_coletas.
//
// Chamada: pg_cron às 6h05 de Brasília (dias úteis), antes da agenda (6h15) e do Scanner (6h45), via pg_net com
// "Authorization: Bearer <COLETOR_TOKEN>". Corpo opcional: {"so_teste": true} (lê e mostra, não grava) · {"dias": 10}.
// Variáveis: COLETOR_TOKEN (manual); SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (automáticas). Nenhuma chave neste arquivo.

const VERSAO = "1.3";
const UA = "SOLIDUNS Valor e Mercado/1.0 (+https://soliduns.com.br; calendário de divulgações para agenda jornalística)";
const IBGE_API = Deno.env.get("VM_IBGE_URL") ?? "https://servicodados.ibge.gov.br/api/v3/calendario/";
const BLS_ICS = Deno.env.get("VM_BLS_URL") ?? "https://www.bls.gov/schedule/news_release/bls.ics";

// endereço da fonte no catálogo (fontes_noticia.url) -> chave interna
const CATALOGO: Record<string, string> = {
  ibge: "https://servicodados.ibge.gov.br/api/v3",
  bls: "https://www.bls.gov",
  fed: "https://www.federalreserve.gov",
  copom: "https://www.bcb.gov.br/controleinflacao/copom",
  focus: "https://www.bcb.gov.br/publicacoes/focus",
};

// Federal Reserve — https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm (conferido em 15/10/2026)
// [1º dia, 2º dia (decisão)]; ATAS_FOMC: datas de publicação das atas que o Fed já lista
export const FOMC: [string, string][] = [
  ["2026-01-27", "2026-01-28"], ["2026-03-17", "2026-03-18"], ["2026-04-28", "2026-04-29"], ["2026-06-16", "2026-06-17"],
  ["2026-07-28", "2026-07-29"], ["2026-09-15", "2026-09-16"], ["2026-10-27", "2026-10-28"], ["2026-12-08", "2026-12-09"],
  ["2027-01-26", "2027-01-27"], ["2027-03-16", "2027-03-17"], ["2027-04-27", "2027-04-28"], ["2027-06-08", "2027-06-09"],
  ["2027-07-27", "2027-07-28"], ["2027-09-14", "2027-09-15"], ["2027-10-26", "2027-10-27"], ["2027-12-07", "2027-12-08"],
];
export const ATAS_FOMC = ["2026-02-18", "2026-04-08", "2026-05-20", "2026-07-08", "2026-08-19", "2026-10-07"];
const FOMC_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

// Banco Central — Copom: calendário de 2026 (Comunicado BCB nº 43.383, de 24/06/2025) e de 2027 (divulgado em 23/06/2026)
// [1º dia, 2º dia (decisão, comunicado às 18h30)]; a ata sai na terça-feira seguinte, às 8h00
export const COPOM: [string, string][] = [
  ["2026-01-27", "2026-01-28"], ["2026-03-17", "2026-03-18"], ["2026-04-28", "2026-04-29"], ["2026-06-16", "2026-06-17"],
  ["2026-08-04", "2026-08-05"], ["2026-09-15", "2026-09-16"], ["2026-11-03", "2026-11-04"], ["2026-12-08", "2026-12-09"],
  ["2027-01-26", "2027-01-27"], ["2027-03-16", "2027-03-17"], ["2027-04-27", "2027-04-28"], ["2027-06-15", "2027-06-16"],
  ["2027-08-03", "2027-08-04"], ["2027-09-21", "2027-09-22"], ["2027-10-26", "2027-10-27"], ["2027-12-07", "2027-12-08"],
];
const COPOM_URL = "https://www.bcb.gov.br/controleinflacao/copom";
const FOCUS_URL = "https://www.bcb.gov.br/publicacoes/focus";

export type Item = { data_ref: string; hora: string; regiao: string; categoria: string; evento: string; consenso: string | null;
  fonte: string; url: string; origem: string; chave: string };

// ------------------------------------------------------------------ datas e fusos
const iso = (d: Date) => d.toISOString().slice(0, 10);
const somaDias = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
export function hojeBrasilia(agora = new Date()): Date { return new Date(iso(new Date(agora.getTime() - 3 * 3600e3)) + "T00:00:00Z"); }
function pascoa(a: number): Date {
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((8 * c + 13) / 25);
  const h = (19 * b + c - e - g + 15) % 30, i = Math.floor(d / 4), k = d % 4, l = (32 + 2 * f + 2 * i - h - k) % 7;
  const m = Math.floor((b + 11 * h + 19 * l) / 433), n = Math.floor((h + l - 7 * m + 90) / 25);
  return new Date(Date.UTC(a, n - 1, (h + l - 7 * m + 33 * n + 19) % 32));
}
export function diaUtilBR(d: Date): boolean {                      // dias úteis (mesmo calendário do coletor de fechamento)
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) return false;
  const a = d.getUTCFullYear(), p = pascoa(a);
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];
  if (a >= 2024) fixos.push("11-20");
  const moveis = [-48, -47, -2, 60].map((n) => iso(somaDias(p, n)));
  return !(fixos.includes(iso(d).slice(5)) || moveis.includes(iso(d)));
}
function nDomingo(ano: number, mes: number, n: number): number {   // dia do mês do n-ésimo domingo (mes 0-11)
  const primeiro = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
  return 1 + ((7 - primeiro) % 7) + 7 * (n - 1);
}
// diferença Nova York -> UTC em horas (EDT = 4, EST = 5) para um horário local de Nova York
export function offsetNY(data: string, hh: number): number {
  const [a, m, d] = data.split("-").map(Number);
  const ini = Date.UTC(a, 2, nDomingo(a, 2, 2), 2), fim = Date.UTC(a, 10, nDomingo(a, 10, 1), 2);
  const t = Date.UTC(a, m - 1, d, hh);
  return t >= ini && t < fim ? 4 : 5;
}
const hh = (h: number, m: number) => `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
// horário de Nova York -> {data, hora} de Brasília (UTC−3)
export function nyParaBrasilia(data: string, h: number, m: number): { data: string; hora: string } {
  const [a, mes, d] = data.split("-").map(Number);
  const utc = Date.UTC(a, mes - 1, d, h + offsetNY(data, h), m);
  const br = new Date(utc - 3 * 3600e3);
  return { data: iso(br), hora: hh(br.getUTCHours(), br.getUTCMinutes()) };
}
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function item(data_ref: string, hora: string, regiao: string, categoria: string, evento: string, fonte: string, url: string): Item {
  return { data_ref, hora, regiao, categoria, evento, consenso: null, fonte, url, origem: "calendario_oficial",
    chave: `${data_ref}|calendario_oficial|${hora}|${semAcento(evento).replace(/[^a-z0-9]+/g, " ").trim().slice(0, 160)}` };
}

// ------------------------------------------------------------------ Banco Central e Federal Reserve (calendários publicados)
export function copomItens(dias: string[]): Item[] {
  const out: Item[] = [];
  for (const [d1, d2] of COPOM) {
    if (dias.includes(d1)) out.push(item(d1, "Dia todo", "br", "Banco Central", "Copom: primeiro dia da reunião de política monetária", "Banco Central do Brasil", COPOM_URL));
    if (dias.includes(d2)) out.push(item(d2, "18h30", "br", "Banco Central", "Copom: decisão sobre a taxa Selic (comunicado)", "Banco Central do Brasil", COPOM_URL));
    const ata = iso(somaDias(new Date(d2 + "T00:00:00Z"), 6));               // terça-feira seguinte
    if (dias.includes(ata)) out.push(item(ata, "08h00", "br", "Banco Central", "Copom: ata da reunião", "Banco Central do Brasil", COPOM_URL));
  }
  return out;
}
export function focusItens(dias: string[]): Item[] {
  const out: Item[] = [];
  for (const dia of dias) {
    const d = new Date(dia + "T00:00:00Z");
    // segunda-feira útil; se a segunda for feriado, o primeiro dia útil seguinte da mesma semana
    let seg = somaDias(d, -((d.getUTCDay() + 6) % 7));
    while (!diaUtilBR(seg) && seg.getUTCDay() !== 6) seg = somaDias(seg, 1);
    if (iso(seg) === dia) out.push(item(dia, "08h25", "br", "Banco Central", "Boletim Focus: expectativas de mercado (Banco Central)", "Banco Central do Brasil", FOCUS_URL));
  }
  return out;
}
export function fomcItens(dias: string[]): Item[] {
  const out: Item[] = [];
  for (const [d1, d2] of FOMC) {
    if (dias.includes(d1)) out.push(item(d1, "Dia todo", "us", "Federal Reserve", "FOMC: primeiro dia da reunião do Federal Reserve", "Federal Reserve", FOMC_URL));
    const dec = nyParaBrasilia(d2, 14, 0), ent = nyParaBrasilia(d2, 14, 30);
    if (dias.includes(dec.data)) out.push(item(dec.data, dec.hora, "us", "Federal Reserve", "FOMC: decisão de juros do Federal Reserve", "Federal Reserve", FOMC_URL));
    if (dias.includes(ent.data)) out.push(item(ent.data, ent.hora, "us", "Federal Reserve", "FOMC: entrevista do presidente do Federal Reserve", "Federal Reserve", FOMC_URL));
  }
  for (const a of ATAS_FOMC) {
    const t = nyParaBrasilia(a, 14, 0);
    if (dias.includes(t.data)) out.push(item(t.data, t.hora, "us", "Federal Reserve", "FOMC: ata da reunião anterior", "Federal Reserve", FOMC_URL));
  }
  return out;
}

// ------------------------------------------------------------------ BLS (arquivo iCal oficial)
const BLS_PT: [RegExp, string][] = [
  [/^employment situation/i, "Payroll: relatório de emprego dos EUA (BLS)"],
  [/^consumer price index/i, "CPI: inflação ao consumidor dos EUA (BLS)"],
  [/^producer price index/i, "PPI: inflação ao produtor dos EUA (BLS)"],
  [/^job openings and labor turnover/i, "JOLTS: vagas de emprego nos EUA (BLS)"],
  [/^employment cost index/i, "Índice de custo do emprego dos EUA (BLS)"],
  [/^productivity and costs/i, "Produtividade e custos do trabalho nos EUA (BLS)"],
  [/^u\.s\. import and export price/i, "Preços de importação e exportação dos EUA (BLS)"],
  [/^real earnings/i, "Salários reais nos EUA (BLS)"],
  [/^state employment and unemployment/i, "Emprego e desemprego por estado nos EUA (BLS)"],
];
const BLS_RELEVANTES = /employment situation|consumer price index|producer price index|job openings|employment cost index|productivity and costs|import and export price|real earnings/i;
export function lerICS(texto: string): { inicio: string; resumo: string; url: string }[] {
  const linhas = texto.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: { inicio: string; resumo: string; url: string }[] = [];
  let ev: Record<string, string> | null = null;
  for (const l of linhas) {
    if (l === "BEGIN:VEVENT") { ev = {}; continue; }
    if (l === "END:VEVENT") { if (ev && ev.DTSTART && ev.SUMMARY) out.push({ inicio: ev.DTSTART, resumo: ev.SUMMARY.replace(/\\,/g, ",").replace(/\\;/g, ";"), url: ev.URL || "" }); ev = null; continue; }
    if (!ev) continue;
    const m = l.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
    if (!m) continue;
    const nome = m[1];
    if (nome === "DTSTART") ev.DTSTART = (m[2].match(/TZID=([^;:]+)/)?.[1] ?? "") + "|" + m[3].trim();
    else if (nome === "SUMMARY" || nome === "URL") ev[nome] = m[3].trim();
  }
  return out;
}
export function blsItens(eventos: { inicio: string; resumo: string; url: string }[], dias: string[]): Item[] {
  const out: Item[] = [];
  for (const e of eventos) {
    if (!BLS_RELEVANTES.test(e.resumo)) continue;
    const [tz, v] = e.inicio.split("|");
    const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) continue;
    const data = `${m[1]}-${m[2]}-${m[3]}`;
    let alvo: { data: string; hora: string };
    if (!m[4]) alvo = { data, hora: "A definir" };
    else if (m[7]) { const br = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 3 * 3600e3); alvo = { data: iso(br), hora: hh(br.getUTCHours(), br.getUTCMinutes()) }; }
    else if (/new_york|eastern|us-east/i.test(tz) || !tz) alvo = nyParaBrasilia(data, +m[4], +m[5]);
    else continue;
    if (!dias.includes(alvo.data)) continue;
    const pt = BLS_PT.find(([re]) => re.test(e.resumo));
    const ref = (e.resumo.match(/\bfor ([A-Z][a-z]+ \d{4}|[A-Z][a-z]+ Quarter \d{4}|\w+ \d{4})/) ?? [])[1];
    out.push(item(alvo.data, alvo.hora, "us", "Agenda EUA", (pt ? pt[1] : e.resumo + " (BLS)") + (ref ? ` — referência: ${ref}` : ""), "Bureau of Labor Statistics",
      /^https:\/\//.test(e.url) ? e.url : "https://www.bls.gov/schedule/news_release/"));
  }
  return out;
}

// ------------------------------------------------------------------ IBGE (API do calendário)
const DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/;
export function ibgeItens(json: unknown, dias: string[]): { itens: Item[]; lidos: number } {
  const lista = Array.isArray(json) ? json : ((json as Record<string, unknown>)?.items ?? (json as Record<string, unknown>)?.itens ?? []) as unknown[];
  const out: Item[] = [];
  for (const x of (Array.isArray(lista) ? lista : []) as Record<string, unknown>[]) {
    const dataTxt = String(x.data_divulgacao ?? x.dataDivulgacao ?? x.data ?? Object.values(x).find((v) => typeof v === "string" && DATA_BR.test(v)) ?? "");
    const m = dataTxt.match(DATA_BR);
    if (!m) continue;
    const data = `${m[3]}-${m[2]}-${m[1]}`;
    if (!dias.includes(data)) continue;
    const nome = String(x.nome_produto ?? x.produto ?? x.titulo ?? x.nome_pesquisa ?? x.titulo_release ?? "").trim();
    if (!nome) continue;
    const tipo = String(x.tipo_release ?? x.nome_tipo_release ?? "").trim();
    const url = [x.link_produto, x.url_produto, x.link, x.url].map((u) => String(u ?? "")).find((u) => /^https:\/\//.test(u)) ?? "https://www.ibge.gov.br/calendario-indicadores-novoportal.html";
    // v1.3: a API do IBGE grava 12:00:00 em quase todas as divulgações (horário padrão, não o real; o IPCA-15 sai às 09h00):
    // 12h00 exato vira "A definir" para o Scanner não publicar horário errado
    const horaReal = m[4] && !(m[4] === "12" && m[5] === "00") && !(m[4] === "00" && m[5] === "00");
    out.push(item(data, horaReal ? hh(+m[4], +m[5]) : "A definir", "br", "Governo e Congresso",
      `IBGE: ${nome}` + (tipo && !/divulga/i.test(tipo) ? ` (${tipo})` : ""), "IBGE", url));
  }
  return { itens: out, lidos: Array.isArray(lista) ? lista.length : 0 };
}
// v1.2: a API v3 do IBGE filtra com de/ate em MM-DD-YYYY (conferido 16/10: ddMMyyyy é ignorado). O 400 vinha do servidor
// do IBGE recusando a rede das Edge Functions; o banco (pg_net) é aceito -> o banco busca (vm_ibge_buscar, SQL 153) e a função lê.
export const mdA = (d: string) => { const [a, m, dd] = d.split("-"); return `${m}-${dd}-${a}`; };

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
async function pgPost(tabela: string, linhas: unknown[], prefer: string): Promise<void> {
  const r = await fetch(`${base()}/${tabela}`, { method: "POST", body: JSON.stringify(linhas), headers: cab({ Prefer: prefer }) });
  if (!r.ok) throw new Error(`gravação em ${tabela.split("?")[0]} falhou (${r.status}): ${(await r.text()).slice(0, 200)}`);
}

// ------------------------------------------------------------------ handler
export async function tratar(req: Request): Promise<Response> {
  const token = Deno.env.get("COLETOR_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) return Response.json({ erro: "não autorizado" }, { status: 401 });
  let corpo: { so_teste?: boolean; dias?: number } = {};
  try { corpo = await req.json(); } catch (_) { /* vazio */ }
  const hoje = hojeBrasilia(), n = Math.max(1, Math.min(31, Number(corpo.dias) || 7));
  const dias = Array.from({ length: n }, (_, i) => iso(somaDias(hoje, i)));
  const resumo: Record<string, unknown> = { versao: VERSAO, de: dias[0], ate: dias[n - 1] }, notas: string[] = [];
  const itens: Item[] = [];
  let falhas = 0;
  try {
    const urls = Object.values(CATALOGO).map((u) => `"${u}"`).join(",");
    const cat = await pgGet<{ url: string; verificada_em: string | null; situacao: string }[]>(
      `fontes_noticia?select=url,verificada_em,situacao&url=in.(${encodeURIComponent(urls)})`);
    const ok = (k: string) => { const f = cat.find((c) => c.url === CATALOGO[k]); return !!(f && f.verificada_em && f.situacao === "ativa"); };
    const pendentes = Object.keys(CATALOGO).filter((k) => !ok(k));
    if (pendentes.length) notas.push(`aguardando conferência manual (verificada_em): ${pendentes.join(", ")}`);
    if (ok("copom")) { const x = copomItens(dias); itens.push(...x); notas.push(`Copom: ${x.length}`); }
    if (ok("focus")) { const x = focusItens(dias); itens.push(...x); notas.push(`Focus: ${x.length}`); }
    if (ok("fed")) { const x = fomcItens(dias); itens.push(...x); notas.push(`FOMC: ${x.length}`); }
    if (ok("bls")) {
      try {
        const r = await fetch(BLS_ICS, { headers: { "User-Agent": UA, Accept: "text/calendar, text/plain, */*" } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const ev = lerICS(await r.text()), x = blsItens(ev, dias);
        itens.push(...x); notas.push(`BLS: ${x.length} (de ${ev.length} eventos no calendário)`);
      } catch (e) { falhas++; notas.push(`BLS: ${String((e as Error).message ?? e).slice(0, 120)}`); }
    }
    if (ok("ibge")) {
      try {
        let x = { itens: [] as Item[], lidos: 0 }, ultimoErro = "";
        // 1º: a resposta que o banco já buscou (vm_ibge_resposta); 2º: busca direta (reserva)
        try {
          const rb = await fetch(`${base()}/rpc/vm_ibge_resposta`, { method: "POST", headers: cab(), body: "{}" });
          const jb = rb.ok ? await rb.json() : null;
          if (jb && (Array.isArray(jb) || Array.isArray(jb.items))) {
            if (corpo.so_teste && !resumo.ibge_exemplo) resumo.ibge_exemplo = JSON.stringify((Array.isArray(jb) ? jb : jb.items)[0] ?? jb).slice(0, 600);
            x = ibgeItens(jb, dias); notas.push("IBGE: lido pelo banco");
          }
        } catch (_) { /* segue para a busca direta */ }
        for (const q of x.lidos ? [] : [`?qtd=100&de=${mdA(dias[0])}&ate=${mdA(dias[n - 1])}`]) {
          const r = await fetch(IBGE_API + q, { headers: { "User-Agent": UA, Accept: "application/json" } });
          if (!r.ok) { ultimoErro = `HTTP ${r.status}`; continue; }
          const j = await r.json();
          if (corpo.so_teste && !resumo.ibge_exemplo) resumo.ibge_exemplo = JSON.stringify((Array.isArray(j) ? j : j?.items ?? [])[0] ?? j).slice(0, 600);
          x = ibgeItens(j, dias);
          if (x.itens.length) break;
        }
        if (!x.lidos && ultimoErro) throw new Error(ultimoErro);
        itens.push(...x.itens); notas.push(`IBGE: ${x.itens.length} (de ${x.lidos} lidos)`);
      } catch (e) { falhas++; notas.push(`IBGE: ${String((e as Error).message ?? e).slice(0, 120)}`); }
    }
    const unicos = [...new Map(itens.map((i) => [i.chave, i])).values()];
    resumo.itens = unicos.length;
    resumo.por_dia = Object.fromEntries(dias.map((d) => [d, unicos.filter((i) => i.data_ref === d).length]));
    if (corpo.so_teste) { resumo.amostra = unicos.slice(0, 40).map((i) => `${i.data_ref} ${i.hora} [${i.categoria}] ${i.evento}`); }
    else {
      if (unicos.length) await pgPost("vm_agenda?on_conflict=chave", unicos, "resolution=merge-duplicates,return=minimal");
      await pgPost("vm_coletas", [{ coletor: "calendario-oficial", situacao: falhas ? "parcial" : "ok", novos: unicos.length, detalhe: { notas, ...resumo }, erro: null }], "return=minimal");
    }
    Object.assign(resumo, { notas });
    return Response.json(resumo);
  } catch (e) {
    resumo.erro = String((e as Error).message ?? e);
    try { if (!corpo.so_teste) await pgPost("vm_coletas", [{ coletor: "calendario-oficial", situacao: "erro", novos: 0, detalhe: { notas }, erro: resumo.erro }], "return=minimal"); } catch (_) { /* sem registro */ }
    return Response.json(resumo, { status: 500 });
  }
}

Deno.serve(tratar);
