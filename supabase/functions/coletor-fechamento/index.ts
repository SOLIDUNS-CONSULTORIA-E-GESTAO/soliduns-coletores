// SOLIDUNS · Valor e Mercado — Edge Function "coletor-fechamento" — v1.4 (15/10/2026)
//
// v1.4 (plano de correção das fontes, item 2 — 15/10): IBOVESPA EM PONTOS (B3, estatísticas de índices) e BOLETIM FOCUS
//       (BCB Olinda, medianas anuais de IPCA, Selic, PIB e câmbio). Cada fonte nova só roda depois de conferida à mão
//       (fontes_noticia.verificada_em). A meta Selic (decisões do Copom) já vem do SGS 432.
//
// v1.3: o SGS é pedido por INTERVALO DE DATAS até hoje (antes: "últimos 10", que na meta Selic eram todos futuros).
//
// v1.2: nada com data futura — a meta Selic do SGS (série 432) vem preenchida até a próxima reunião do Copom.
//
// v1.1: todas as linhas vão ao banco com o MESMO conjunto de campos (o PostgREST recusa lote misto: PGRST102)
//       e a série do SGS que vier ilegível é baixada de novo (até 3 tentativas).
//
// ETAPA 2 do plano de fontes: indicadores de FECHAMENTO para o quadro do jornal.
//   - B3 COTAHIST (arquivo público diário, posição fixa de 245 bytes): mercado à vista (TPMERC 010),
//     ações/units (CODBDI 02), FIIs (12) e ETFs/fundos (14) — abertura, máxima, mínima, fechamento, volume.
//   - Banco Central, API SGS: SELIC (meta, série 432), CDI (anualizado, 4389) e IPCA (variação mensal, 433).
//   - Banco Central, API Olinda: PTAX de FECHAMENTO do dólar e do euro (só boletim "Fechamento").
// Grava em public.cotacoes (migration 137) com a fonte, o endereço baixado e a hora da coleta.
// APENAS fechamento: nunca tempo real nem com atraso.
//
// Chamada: pg_cron às 18h30 de Brasília (dias úteis), via pg_net, com "Authorization: Bearer <COLETOR_TOKEN>".
// À mão (teste): POST com corpo {"so_teste": true} (lê e confere, não grava) ou {"data": "2026-10-13"} (força um pregão).
//
// Variáveis de ambiente:
//   COLETOR_TOKEN               — senha da chamada (a mesma do segredo vm_coletor_token no Vault). Configurar à mão.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — o Supabase já fornece às Edge Functions; nada a configurar.
// Nenhuma chave fica neste arquivo.

import { unzipSync } from "npm:fflate@0.8.2";

const VERSAO = "1.4";
const B3_BASE = Deno.env.get("VM_B3_BASE") ?? "https://bvmf.bmfbovespa.com.br/InstDados/SerHist";      // troca só em teste
const SGS_BASE = Deno.env.get("VM_SGS_BASE") ?? "https://api.bcb.gov.br/dados/serie";                   // troca só em teste
const OLINDA_BASE = Deno.env.get("VM_OLINDA_BASE") ?? "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata"; // idem
const CODBDI_OK = new Set(["02", "12", "14"]);
const SGS = [
  { codigo: "SELIC", serie: 432, descricao: "Meta da taxa Selic (Copom)", unidade: "% a.a.", dias: 15 },
  { codigo: "CDI", serie: 4389, descricao: "CDI anualizado (base 252)", unidade: "% a.a.", dias: 15 },
  { codigo: "IPCA", serie: 433, descricao: "IPCA, variação mensal (IBGE)", unidade: "% no mês", dias: 400 },
];
const MOEDAS = [
  { codigo: "USD", descricao: "Dólar PTAX venda, boletim de fechamento", unidade: "R$ por US$" },
  { codigo: "EUR", descricao: "Euro PTAX venda, boletim de fechamento", unidade: "R$ por €" },
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

export type Linha = {
  fonte: string; url_fonte: string; codigo: string; descricao?: string | null; data_ref: string;
  abertura?: number | null; maxima?: number | null; minima?: number | null; fechamento: number;
  volume?: number | null; negocios?: number | null; codbdi?: string | null; unidade: string; coletado_em: string;
};

// ------------------------------------------------------------------ calendário da B3
function pascoa(a: number): Date {
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((8 * c + 13) / 25);
  const h = (19 * b + c - e - g + 15) % 30, i = Math.floor(d / 4), k = d % 4, l = (32 + 2 * f + 2 * i - h - k) % 7;
  const m = Math.floor((b + 11 * h + 19 * l) / 433), n = Math.floor((h + l - 7 * m + 90) / 25);
  return new Date(Date.UTC(a, n - 1, (h + l - 7 * m + 33 * n + 19) % 32));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const somaDias = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
export function semPregao(d: Date): boolean {
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) return true;
  const a = d.getUTCFullYear(), p = pascoa(a);
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-24", "12-25", "12-31"];
  if (a >= 2024) fixos.push("11-20");
  const moveis = [-48, -47, -2, 60].map((n) => iso(somaDias(p, n)));
  return fixos.includes(iso(d).slice(5)) || moveis.includes(iso(d));
}
export function hojeBrasilia(agora = new Date()): Date {
  return new Date(iso(new Date(agora.getTime() - 3 * 3600e3)) + "T00:00:00Z");
}

// ------------------------------------------------------------------ COTAHIST
export function lerCotahist(texto: string, url: string, coletado: string): Linha[] {
  const out: Linha[] = [];
  for (const l of texto.split(/\r?\n/)) {
    if (l.length < 245 || l.slice(0, 2) !== "01" || l.slice(24, 27) !== "010") continue;
    const codbdi = l.slice(10, 12);
    if (!CODBDI_OK.has(codbdi)) continue;
    const fat = parseInt(l.slice(210, 217), 10) || 1;
    const p = (a: number, b: number) => Math.round((parseInt(l.slice(a, b), 10) / 100 / fat) * 1e6) / 1e6;
    const data = `${l.slice(2, 6)}-${l.slice(6, 8)}-${l.slice(8, 10)}`;
    const r: Linha = {
      fonte: "B3 COTAHIST", url_fonte: url, codigo: l.slice(12, 24).trim(), descricao: l.slice(27, 39).trim() || null,
      data_ref: data, abertura: p(56, 69), maxima: p(69, 82), minima: p(82, 95), fechamento: p(108, 121),
      volume: parseInt(l.slice(170, 188), 10) / 100, negocios: parseInt(l.slice(147, 152), 10), codbdi,
      unidade: "R$", coletado_em: coletado,
    };
    if (!r.codigo || !(r.fechamento > 0) || Number.isNaN(r.volume) || isNaN(Date.parse(data))) continue;
    out.push(r);
  }
  return out;
}

async function baixar(url: string, tentativas = 3): Promise<Response | null> {
  for (let t = 0; t < tentativas; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "*/*" } });
      if (r.ok || r.status === 404) return r;
    } catch (_) { /* rede: tenta de novo */ }
    await new Promise((ok) => setTimeout(ok, 3000 * (t + 1)));
  }
  return null;
}

async function coletarB3(datas: string[], coletado: string): Promise<{ linhas: Linha[]; nota: string[] }> {
  const linhas: Linha[] = [], nota: string[] = [];
  for (const d of datas) {
    const ddmmaaaa = d.slice(8, 10) + d.slice(5, 7) + d.slice(0, 4);
    const url = `${B3_BASE}/COTAHIST_D${ddmmaaaa}.ZIP`;
    const r = await baixar(url);
    if (!r) { nota.push(`${d}: B3 não respondeu`); continue; }
    if (r.status === 404) { nota.push(`${d}: arquivo ainda não publicado`); continue; }
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) { nota.push(`${d}: resposta não é ZIP`); continue; }
    const arquivos = unzipSync(bytes);
    const nome = Object.keys(arquivos)[0];
    const texto = new TextDecoder("latin1").decode(arquivos[nome]);
    const ls = lerCotahist(texto, url, coletado).filter((x) => x.data_ref === d);
    nota.push(`${d}: ${ls.length} papéis`);
    linhas.push(...ls);
  }
  return { linhas, nota };
}

// ------------------------------------------------------------------ Banco Central
const brParaIso = (s: string) => `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)}`;

async function coletarSGS(coletado: string, hoje: Date): Promise<{ linhas: Linha[]; nota: string[] }> {
  const linhas: Linha[] = [], nota: string[] = [];
  for (const s of SGS) {
    const dmy = (d: Date) => `${iso(d).slice(8, 10)}/${iso(d).slice(5, 7)}/${iso(d).slice(0, 4)}`;
    const url = `${SGS_BASE}/bcdata.sgs.${s.serie}/dados?formato=json&dataInicial=${dmy(somaDias(hoje, -s.dias))}&dataFinal=${dmy(hoje)}`;
    let dados: { data: string; valor: string }[] | null = null, ultimo = "rede";
    for (let t = 0; t < 3 && dados === null; t++) {              // v1.1: o SGS às vezes devolve página de erro
      if (t) await new Promise((ok) => setTimeout(ok, 4000 * t));
      const r = await baixar(url);
      if (!r || !r.ok) { ultimo = String(r?.status ?? "rede"); continue; }
      try { const j = await r.json(); if (Array.isArray(j)) dados = j; else ultimo = "resposta ilegível"; }
      catch (_) { ultimo = "resposta ilegível"; }
    }
    if (dados === null) { nota.push(`${s.codigo}: ${ultimo} (3 tentativas)`); continue; }
    let n = 0;
    for (const x of dados) {
      const v = parseFloat(String(x.valor).replace(",", "."));
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(x.data) || !Number.isFinite(v)) continue;
      if (brParaIso(x.data) > iso(hoje)) continue;          // v1.2: só até hoje (a meta Selic vem com dias futuros)
      linhas.push({ fonte: "BCB SGS", url_fonte: url, codigo: s.codigo, descricao: s.descricao, data_ref: brParaIso(x.data),
        fechamento: v, unidade: s.unidade, coletado_em: coletado });
      n++;
    }
    nota.push(`${s.codigo}: ${n}`);
  }
  return { linhas, nota };
}

const mdy = (d: Date) => `${iso(d).slice(5, 7)}-${iso(d).slice(8, 10)}-${iso(d).slice(0, 4)}`;

async function coletarPTAX(hoje: Date, coletado: string): Promise<{ linhas: Linha[]; nota: string[] }> {
  const linhas: Linha[] = [], nota: string[] = [];
  for (const m of MOEDAS) {
    const url = `${OLINDA_BASE}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
      `?@moeda=%27${m.codigo}%27&@dataInicial=%27${mdy(somaDias(hoje, -10))}%27&@dataFinalCotacao=%27${mdy(hoje)}%27&$top=100&$format=json`;
    const r = await baixar(url);
    if (!r || !r.ok) { nota.push(`${m.codigo}: sem resposta (${r?.status ?? "rede"})`); continue; }
    let j: { value?: { cotacaoVenda: number; dataHoraCotacao: string; tipoBoletim: string }[] } = {};
    try { j = await r.json(); } catch (_) { nota.push(`${m.codigo}: resposta ilegível`); continue; }
    let n = 0;
    for (const x of j.value ?? []) {
      if (x.tipoBoletim !== "Fechamento" || !(x.cotacaoVenda > 0)) continue;
      if (String(x.dataHoraCotacao).slice(0, 10) > iso(hoje)) continue;   // só o boletim de FECHAMENTO
      linhas.push({ fonte: "BCB Olinda", url_fonte: url, codigo: m.codigo, descricao: m.descricao,
        data_ref: String(x.dataHoraCotacao).slice(0, 10), fechamento: x.cotacaoVenda, unidade: m.unidade, coletado_em: coletado });
      n++;
    }
    nota.push(`${m.codigo}: ${n}`);
  }
  return { linhas, nota };
}

// ------------------------------------------------------------------ v1.4: Ibovespa em pontos (B3) e Boletim Focus (BCB)
const B3_INDICES = Deno.env.get("VM_B3_INDICES") ?? "https://sistemaswebb3-listados.b3.com.br/indexStatisticsProxy/IndexCall/GetPortfolioDay";
const B3_INDICES_PAG = "https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-amplos/ibovespa.htm";
const FOCUS_BASE = Deno.env.get("VM_FOCUS_BASE") ?? "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata";
export const CATALOGO_NOVAS = { ibov: "https://www.b3.com.br/pt_br/market-data-e-indices/indices", focus: "https://www.bcb.gov.br/publicacoes/focus" };
const numBr = (s: unknown) => { const t = String(s ?? "").trim(); if (!t) return NaN; return parseFloat(t.replace(/\./g, "").replace(",", ".")); };

// estatística diária do índice: results[{day, rateValue1..rateValue12}] — o valor de fechamento de cada dia de cada mês
export function lerIndiceAno(j: unknown, ano: number, ate: string): { data: string; valor: number }[] {
  const out: { data: string; valor: number }[] = [];
  for (const r of ((j as { results?: Record<string, unknown>[] })?.results ?? [])) {
    const dia = Number(r.day);
    if (!(dia >= 1 && dia <= 31)) continue;
    for (let m = 1; m <= 12; m++) {
      const v = numBr(r[`rateValue${m}`]);
      if (!Number.isFinite(v) || v <= 0) continue;
      const data = `${ano}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      if (data <= ate) out.push({ data, valor: v });
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

async function coletarIbov(hoje: Date, coletado: string): Promise<{ linhas: Linha[]; nota: string[] }> {
  const linhas: Linha[] = [], nota: string[] = [], ano = hoje.getUTCFullYear();
  const param = btoa(JSON.stringify({ index: "IBOV", language: "pt-br", year: String(ano) }));
  const url = `${B3_INDICES}/${param}`;
  const r = await baixar(url);
  if (!r || !r.ok) return { linhas, nota: [`IBOV: sem resposta (${r?.status ?? "rede"})`] };
  let j: unknown; try { j = await r.json(); } catch (_) { return { linhas, nota: ["IBOV: resposta ilegível"] }; }
  const dias = lerIndiceAno(j, ano, iso(hoje)).slice(-15);          // os últimos 15 pregões do ano (o resto já está gravado)
  for (const d of dias) linhas.push({ fonte: "B3 Índices", url_fonte: B3_INDICES_PAG, codigo: "IBOV", descricao: "Ibovespa (pontos, fechamento)",
    data_ref: d.data, fechamento: d.valor, unidade: "pontos", coletado_em: coletado });
  nota.push(`IBOV: ${linhas.length}` + (dias.length ? ` (último ${dias[dias.length - 1].data}: ${dias[dias.length - 1].valor})` : ""));
  return { linhas, nota };
}

const FOCUS_IND: { nome: string; codigo: string; unidade: string; desc: string }[] = [
  { nome: "IPCA", codigo: "IPCA", unidade: "%", desc: "IPCA no ano (mediana do Focus)" },
  { nome: "Selic", codigo: "SELIC", unidade: "% a.a.", desc: "Selic no fim do ano (mediana do Focus)" },
  { nome: "PIB Total", codigo: "PIB", unidade: "%", desc: "PIB no ano (mediana do Focus)" },
  { nome: "Câmbio", codigo: "CAMBIO", unidade: "R$ por US$", desc: "Dólar no fim do ano (mediana do Focus)" },
];
export function lerFocus(j: unknown, codigo: string, anos: string[]): { ano: string; data: string; mediana: number }[] {
  const out: { ano: string; data: string; mediana: number }[] = [];
  for (const x of ((j as { value?: Record<string, unknown>[] })?.value ?? [])) {
    const ano = String(x.DataReferencia ?? ""), data = String(x.Data ?? "").slice(0, 10), med = Number(x.Mediana);
    if (!anos.includes(ano) || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(med)) continue;
    if (x.baseCalculo !== undefined && Number(x.baseCalculo) !== 0) continue;
    out.push({ ano, data, mediana: med });
  }
  return out;
}
async function coletarFocus(hoje: Date, coletado: string): Promise<{ linhas: Linha[]; nota: string[] }> {
  const linhas: Linha[] = [], nota: string[] = [], a = hoje.getUTCFullYear(), anos = [String(a), String(a + 1)];
  for (const f of FOCUS_IND) {
    const filtro = `Indicador eq '${f.nome}' and baseCalculo eq 0 and (DataReferencia eq '${anos[0]}' or DataReferencia eq '${anos[1]}')`;
    const url = `${FOCUS_BASE}/ExpectativasMercadoAnuais?$top=12&$filter=${encodeURIComponent(filtro)}&$orderby=${encodeURIComponent("Data desc")}` +
      `&$select=Indicador,Data,DataReferencia,Mediana,baseCalculo&$format=json`;
    const r = await baixar(url);
    if (!r || !r.ok) { nota.push(`Focus ${f.codigo}: sem resposta (${r?.status ?? "rede"})`); continue; }
    let j: unknown; try { j = await r.json(); } catch (_) { nota.push(`Focus ${f.codigo}: resposta ilegível`); continue; }
    const ls = lerFocus(j, f.codigo, anos);
    for (const x of ls) linhas.push({ fonte: "BCB Focus", url_fonte: "https://www.bcb.gov.br/publicacoes/focus", codigo: `FOCUS_${f.codigo}_${x.ano}`,
      descricao: f.desc.replace("no ano", `em ${x.ano}`).replace("no fim do ano", `no fim de ${x.ano}`), data_ref: x.data, fechamento: x.mediana,
      unidade: f.unidade, coletado_em: coletado });
    nota.push(`Focus ${f.codigo}: ${ls.length}`);
  }
  return { linhas, nota };
}
async function fontesConferidas(): Promise<Set<string>> {
  const urls = Object.values(CATALOGO_NOVAS).map((u) => `"${u}"`).join(",");
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/fontes_noticia?select=url,verificada_em,situacao&url=in.(${encodeURIComponent(urls)})`, { headers: cabecalhos() });
  if (!r.ok) return new Set();
  const j = await r.json() as { url: string; verificada_em: string | null; situacao: string }[];
  return new Set(Object.entries(CATALOGO_NOVAS).filter(([, u]) => j.some((x) => x.url === u && x.verificada_em && x.situacao === "ativa")).map(([k]) => k));
}

// ------------------------------------------------------------------ Supabase (PostgREST)
function cabecalhos(): Record<string, string> {
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const h: Record<string, string> = { apikey: chave, "Content-Type": "application/json" };
  if (!chave.startsWith("sb_")) h.Authorization = `Bearer ${chave}`;
  return h;
}

async function ultimoPregaoGravado(): Promise<string | null> {
  const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1/cotacoes?select=data_ref&fonte=eq.B3%20COTAHIST&order=data_ref.desc&limit=1`;
  const r = await fetch(url, { headers: cabecalhos() });
  if (!r.ok) throw new Error(`leitura de cotacoes falhou (${r.status}) — rodou a migration 137?`);
  const j = await r.json();
  return j[0]?.data_ref ?? null;
}

const CAMPOS = ["fonte", "url_fonte", "codigo", "descricao", "data_ref", "abertura", "maxima", "minima", "fechamento",
  "volume", "negocios", "codbdi", "unidade", "coletado_em"] as const;
export function uniformizar(linhas: Linha[]): Record<string, unknown>[] {   // v1.1: mesmo conjunto de campos em todas
  return linhas.map((l) => Object.fromEntries(CAMPOS.map((k) => [k, (l as Record<string, unknown>)[k] ?? null])));
}

async function gravar(linhas: Linha[]): Promise<number> {
  const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1/cotacoes?on_conflict=fonte,codigo,data_ref`;
  const unicas = new Map<string, Linha>();
  for (const l of linhas) unicas.set(`${l.fonte}|${l.codigo}|${l.data_ref}`, l);   // sem repetição no mesmo lote
  linhas = [...unicas.values()];
  let n = 0;
  for (let i = 0; i < linhas.length; i += 1000) {
    const lote = uniformizar(linhas.slice(i, i + 1000));
    const r = await fetch(url, { method: "POST", body: JSON.stringify(lote),
      headers: { ...cabecalhos(), Prefer: "resolution=merge-duplicates,return=minimal" } });
    if (!r.ok) throw new Error(`gravação falhou (${r.status}): ${(await r.text()).slice(0, 200)}`);
    n += lote.length;
  }
  return n;
}

// pregões a buscar: do dia seguinte ao último gravado até hoje (no máximo os 5 últimos pregões)
export function pregoesPendentes(hoje: Date, ultimo: string | null): string[] {
  const lista: string[] = [];
  for (let d = hoje; lista.length < 5; d = somaDias(d, -1)) {
    if (ultimo && iso(d) <= ultimo) break;
    if (!semPregao(d)) lista.unshift(iso(d));
    if (!ultimo && lista.length >= 2) break;            // primeira execução: hoje e o pregão anterior
  }
  return lista;
}

// ------------------------------------------------------------------ handler
export async function tratar(req: Request): Promise<Response> {
  const token = Deno.env.get("COLETOR_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }
  let corpo: { so_teste?: boolean; data?: string } = {};
  try { corpo = await req.json(); } catch (_) { /* corpo vazio */ }
  const coletado = new Date().toISOString(), hoje = hojeBrasilia();
  const resumo: Record<string, unknown> = { versao: VERSAO, coletado_em: coletado };
  const todas: Linha[] = [];
  try {
    const datas = corpo.data && /^\d{4}-\d{2}-\d{2}$/.test(corpo.data) ? [corpo.data]
      : pregoesPendentes(hoje, corpo.so_teste ? null : await ultimoPregaoGravado());
    const b3 = await coletarB3(datas, coletado);
    const sgs = await coletarSGS(coletado, hoje);
    const ptax = await coletarPTAX(hoje, coletado);
    todas.push(...b3.linhas, ...sgs.linhas, ...ptax.linhas);
    const conferidas = await fontesConferidas();                                   // v1.4
    const ibov = conferidas.has("ibov") ? await coletarIbov(hoje, coletado) : { linhas: [], nota: ["IBOV: aguardando conferência manual (verificada_em)"] };
    const focus = conferidas.has("focus") ? await coletarFocus(hoje, coletado) : { linhas: [], nota: ["Focus: aguardando conferência manual (verificada_em)"] };
    todas.push(...ibov.linhas, ...focus.linhas);
    Object.assign(resumo, { b3: b3.nota, sgs: sgs.nota, ptax: ptax.nota, ibov: ibov.nota, focus: focus.nota, linhas: todas.length });
    if (!corpo.so_teste && todas.length) resumo.gravadas = await gravar(todas);
    if (corpo.so_teste) resumo.amostra = todas.filter((x) => ["BOVA11", "PETR4", "SELIC", "CDI", "IPCA", "USD", "EUR", "IBOV"].includes(x.codigo) || x.codigo.startsWith("FOCUS_")).slice(-24);
    return Response.json(resumo, { status: todas.length ? 200 : 502 });
  } catch (e) {
    resumo.erro = String((e as Error).message ?? e);
    return Response.json(resumo, { status: 500 });
  }
}

Deno.serve(tratar);
