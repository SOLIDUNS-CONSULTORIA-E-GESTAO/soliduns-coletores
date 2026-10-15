// SOLIDUNS · Valor e Mercado — Edge Function "cvm-documentos" — v1.1 (15/10/2026)
// v1.1: descarta os formulários da SEC americana (6-K, 8-K, 424B2, FWP, N-CEN…) que emissores estrangeiros de BDR reapresentam
//       à CVM como "Comunicado ao Mercado" — no 1º teste foram ~90% dos documentos e não são notícia para o leitor brasileiro.
//
// Plano de correção das fontes, item 3 (decisão do Thiago, 15/10 16h12: "as duas vias"): FATOS RELEVANTES, COMUNICADOS AO
// MERCADO e AVISOS AOS ACIONISTAS das companhias abertas, gravados em public.vm_achados (camada livre, com crédito à CVM)
// para o Scanner do Dia e o radar do jornal.
//   1. Consulta pública de documentos da CVM (Empresas.NET — a mesma consulta que o site da CVM usa; sem API documentada):
//      documentos entregues HOJE e ONTEM. Se a CVM passar a exigir captcha ou mudar o formato, a via falha sem gravar
//      nada errado e o robô usa a via 2.
//   2. Portal de Dados Abertos da CVM (base IPE, licença ODbL, atualizada pela CVM uma vez por semana) — reserva.
// Guarda só os DADOS DO PROTOCOLO (empresa, categoria, espécie, assunto, data e hora de entrega, link do documento):
// o texto do documento não é copiado. Cada via só roda com a fonte CONFERIDA À MÃO (fontes_noticia.verificada_em).
//
// Chamada: pg_cron a cada 30 min, 8h–19h30 de Brasília (dias úteis), via pg_net com "Authorization: Bearer <COLETOR_TOKEN>".
// Corpo opcional: {"so_teste": true} (lê e mostra, não grava) · {"dias": 3} · {"via": "dados_abertos"} (força a reserva).
// Variáveis: COLETOR_TOKEN (manual); SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (automáticas). Nenhuma chave neste arquivo.

import { unzipSync } from "npm:fflate@0.8.2";

const VERSAO = "1.1";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const ENET_BASES = (Deno.env.get("VM_ENET_BASES") ?? "https://www.rad.cvm.gov.br/ENETWeb/frmConsultaExternaCVM.aspx,https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx").split(",");
const IPE_BASE = Deno.env.get("VM_IPE_BASE") ?? "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS";
const CATALOGO = { enet: "https://www.rad.cvm.gov.br/ENET", dados: "https://dados.cvm.gov.br" };
export const CATEGORIAS = ["fato relevante", "comunicado ao mercado", "aviso aos acionistas"];
const MAX_POR_EXECUCAO = 300;

export type Doc = { codigo_cvm: string; empresa: string; categoria: string; tipo: string; especie: string; assunto: string;
  entregue_em: string | null; link: string; protocolo: string };

// ------------------------------------------------------------------ utilidades
const iso = (d: Date) => d.toISOString().slice(0, 10);
const somaDias = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
export function hojeBrasilia(agora = new Date()): Date { return new Date(iso(new Date(agora.getTime() - 3 * 3600e3)) + "T00:00:00Z"); }
const dmy = (d: Date) => `${iso(d).slice(8, 10)}/${iso(d).slice(5, 7)}/${iso(d).slice(0, 4)}`;
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const relevante = (categoria: string) => CATEGORIAS.includes(semAcento(categoria));
// formulário da SEC reapresentado por emissor estrangeiro (BDR): assunto/espécie = só o código do formulário
const FORMS_SEC = /^(\d{1,2}-[A-Z]{1,2}\d?|N-[A-Z0-9-]+|[SF]-\d+[A-Z]?|424[A-Z]\d*|FWP|ARS|CORRESP|UPLOAD|DEF\s?[A-Z0-9]+|DEFA\d+[A-Z]|DEFM\d+[A-Z]|PRE\s?\d+[A-Z]|SC\s?(TO|13[DEG])[A-Z0-9-]*|SC\s?14D9|10-[KQ]\d*|20-F|40-F|11-K|13F[A-Z-]*|POS\s?AM|S-8\s?POS|425|144|EFFECT|497[A-Z]?|N-\d+[A-Z]*)(\/A)?$/i;
export const formularioSec = (d: { assunto: string; especie: string }) =>
  [d.assunto, d.especie].some((x) => FORMS_SEC.test(String(x ?? "").trim()));
const limpar = (s: string) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// "15/10/2026 18:42" (horário de Brasília) -> ISO em UTC
export function dataHoraBR(s: string): string | null {
  const m = String(s ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], (m[4] ? +m[4] : 12) + 3, m[5] ? +m[5] : 0)).toISOString();
}
const linkDoc = (seq: string, ver: string, prot: string) =>
  `https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&numSequencia=${seq}&numVersao=${ver}&numProtocolo=${prot}&descTipo=IPE&CodigoInstituicao=1`;

// ------------------------------------------------------------------ via 1: consulta pública (Empresas.NET)
// resposta: {"d": {"dados": "reg1&*reg2…", "temErro": false, …}}; campos de cada registro separados por "$&":
// 0 código CVM · 1 empresa · 2 categoria · 3 tipo · 4 espécie/assunto (<spanOrder>) · 5 data ref. · 6 entrega (dd/mm/aaaa hh:mm) ·
// … · 10 ações (OpenDownloadDocumentos('seq','ver','protocolo',…)) · 11 assunto (quando existe)
export function lerEnet(dados: string): Doc[] {
  const out: Doc[] = [];
  for (const reg of String(dados ?? "").split("&*")) {
    const f = reg.split("$&");
    if (f.length < 11) continue;
    const dl = f[10].match(/OpenDownloadDocumentos\('(\d+)','(\d+)','(\d+)'/);
    if (!dl) continue;
    const esp = limpar(f[4]), assunto = limpar(f[11] ?? "") || esp;
    out.push({ codigo_cvm: limpar(f[0]), empresa: limpar(f[1]), categoria: limpar(f[2]), tipo: limpar(f[3]), especie: esp, assunto,
      entregue_em: dataHoraBR(f[6]), link: linkDoc(dl[1], dl[2], dl[3]), protocolo: dl[3] });
  }
  return out;
}
async function viaEnet(hoje: Date, dias: number): Promise<Doc[]> {
  const corpo = { dataDe: dmy(somaDias(hoje, -(dias - 1))), dataAte: dmy(hoje), empresa: "", setorAtividade: "-1", categoriaEmissor: "-1",
    situacaoEmissor: "-1", tipoParticipante: "-1", dataReferencia: "", categoria: "IPE_-1_-1_-1", periodo: "2", horaIni: "", horaFim: "",
    palavraChave: "", ultimaDtRef: "false", tipoEmpresa: "0", token: "", versaoCaptcha: "" };
  let ultimo = "";
  for (const base of ENET_BASES) {
    try {
      const pagina = await fetch(base, { headers: { "User-Agent": UA } });
      const cookie = (pagina.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=)/).map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
      await pagina.body?.cancel();
      const r = await fetch(base + "/ListarDocumentos", { method: "POST", body: JSON.stringify(corpo), headers: {
        "User-Agent": UA, "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest",
        Referer: base, Origin: "https://www.rad.cvm.gov.br", ...(cookie ? { Cookie: cookie } : {}) } });
      if (!r.ok) { ultimo = `${base.includes("ENETWeb") ? "ENETWeb" : "ENET"} HTTP ${r.status}`; continue; }
      const j = await r.json() as { d?: { dados?: string; temErro?: boolean; msgErro?: string; expirouSessao?: boolean } };
      if (!j?.d || j.d.temErro || j.d.expirouSessao) { ultimo = `consulta recusada: ${String(j?.d?.msgErro ?? "sem dados").slice(0, 120)}`; continue; }
      const docs = lerEnet(j.d.dados ?? "");
      if (!docs.length && String(j.d.dados ?? "").length > 50) { ultimo = "formato da resposta mudou (nenhuma linha reconhecida)"; continue; }
      return docs;
    } catch (e) { ultimo = String((e as Error).message ?? e).slice(0, 120); }
  }
  throw new Error(ultimo || "consulta indisponível");
}

// ------------------------------------------------------------------ via 2: dados abertos (base IPE, semanal)
export function lerCsvIpe(texto: string): Doc[] {
  const linhas = texto.split(/\r?\n/).filter(Boolean);
  if (!linhas.length) return [];
  const cab = linhas[0].split(";").map((c) => c.trim());
  const col = (n: string) => cab.indexOf(n);
  const out: Doc[] = [];
  for (const l of linhas.slice(1)) {
    const f = l.split(";"), g = (n: string) => (col(n) >= 0 ? (f[col(n)] ?? "").trim() : "");
    const link = g("Link_Download");
    const prot = (link.match(/numProtocolo=(\d+)/) ?? [])[1] ?? g("Protocolo_Entrega");
    if (!/^https?:\/\//.test(link)) continue;
    const ent = g("Data_Entrega");
    out.push({ codigo_cvm: g("Codigo_CVM"), empresa: g("Nome_Companhia"), categoria: g("Categoria"), tipo: g("Tipo"), especie: g("Especie"),
      assunto: g("Assunto") || g("Especie"), entregue_em: /^\d{4}-\d{2}-\d{2}/.test(ent) ? new Date(ent.slice(0, 10) + "T15:00:00Z").toISOString() : null,
      link, protocolo: prot });
  }
  return out;
}
async function viaDadosAbertos(hoje: Date, dias: number): Promise<Doc[]> {
  const ano = hoje.getUTCFullYear();
  const r = await fetch(`${IPE_BASE}/ipe_cia_aberta_${ano}.zip`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`dados abertos HTTP ${r.status}`);
  const arquivos = unzipSync(new Uint8Array(await r.arrayBuffer()));
  const nome = Object.keys(arquivos).find((n) => /\.csv$/i.test(n));
  if (!nome) throw new Error("dados abertos: ZIP sem CSV");
  const corte = iso(somaDias(hoje, -(dias - 1)));
  return lerCsvIpe(new TextDecoder("latin1").decode(arquivos[nome])).filter((d) => d.entregue_em && d.entregue_em.slice(0, 10) >= corte);
}

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

export function paraAchado(d: Doc, fonte: { id: number; nome: string }) {
  const cat = d.categoria || "Documento";
  const assunto = d.assunto && semAcento(d.assunto) !== semAcento(cat) ? d.assunto : d.especie;
  return { fonte_id: fonte.id, fonte_nome: "CVM", camada: "livre",
    titulo: `${d.empresa} — ${cat}${assunto ? ": " + assunto : ""}`.slice(0, 300), link: d.link,
    resumo: [cat, d.tipo, d.especie, assunto ? `assunto: ${assunto}` : "", d.codigo_cvm ? `código CVM ${d.codigo_cvm}` : ""]
      .filter((x, i, a) => x && a.indexOf(x) === i).join(" · ").slice(0, 600) + " (protocolo de entrega na CVM; o texto está no documento)",
    publicado_em: d.entregue_em };
}

// ------------------------------------------------------------------ handler
export async function tratar(req: Request): Promise<Response> {
  const token = Deno.env.get("COLETOR_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) return Response.json({ erro: "não autorizado" }, { status: 401 });
  let corpo: { so_teste?: boolean; dias?: number; via?: string } = {};
  try { corpo = await req.json(); } catch (_) { /* vazio */ }
  const hoje = hojeBrasilia(), dias = Math.max(1, Math.min(10, Number(corpo.dias) || 2));
  const resumo: Record<string, unknown> = { versao: VERSAO, dias }, notas: string[] = [];
  try {
    const cat = await pgGet<{ id: number; nome: string; url: string; verificada_em: string | null; situacao: string }[]>(
      `fontes_noticia?select=id,nome,url,verificada_em,situacao&url=in.(${encodeURIComponent(`"${CATALOGO.enet}","${CATALOGO.dados}"`)})`);
    const fonteDe = (u: string) => cat.find((c) => c.url === u);
    const ok = (u: string) => { const f = fonteDe(u); return !!(f && f.verificada_em && f.situacao === "ativa"); };
    let docs: Doc[] = [], via = "";
    if (corpo.via !== "dados_abertos" && ok(CATALOGO.enet)) {
      try { docs = await viaEnet(hoje, dias); via = "consulta_do_dia"; notas.push(`consulta do dia: ${docs.length} documentos`); }
      catch (e) { notas.push(`consulta do dia falhou: ${String((e as Error).message ?? e)}`); }
    } else if (corpo.via !== "dados_abertos") notas.push("consulta do dia: aguardando conferência manual (verificada_em)");
    if (!via && ok(CATALOGO.dados)) {
      try { docs = await viaDadosAbertos(hoje, dias); via = "dados_abertos"; notas.push(`dados abertos (semanal): ${docs.length} documentos`); }
      catch (e) { notas.push(`dados abertos falhou: ${String((e as Error).message ?? e)}`); }
    } else if (!via) notas.push("dados abertos: aguardando conferência manual (verificada_em)");
    const fonte = fonteDe(via === "dados_abertos" ? CATALOGO.dados : CATALOGO.enet);
    const rel = docs.filter((d) => relevante(d.categoria)), estrangeiros = rel.filter(formularioSec).length;
    const sel = rel.filter((d) => !formularioSec(d)).slice(0, MAX_POR_EXECUCAO);
    Object.assign(resumo, { via: via || "nenhuma", lidos: docs.length, descartados_sec_estrangeiros: estrangeiros, relevantes: sel.length,
      por_categoria: Object.fromEntries(CATEGORIAS.map((c) => [c, sel.filter((d) => semAcento(d.categoria) === c).length])) });
    if (corpo.so_teste) resumo.amostra = sel.slice(0, 15).map((d) => `${d.entregue_em ?? ""} ${d.empresa} — ${d.categoria}: ${d.assunto}`);
    else {
      if (sel.length && fonte) await pgPost("vm_achados?on_conflict=link", sel.map((d) => paraAchado(d, fonte)), "resolution=ignore-duplicates,return=minimal");
      await pgPost("vm_coletas", [{ coletor: "cvm-documentos", situacao: via ? "ok" : "erro", novos: sel.length, detalhe: { notas, ...resumo },
        erro: via ? null : notas.join(" | ").slice(0, 500) }], "return=minimal");
    }
    Object.assign(resumo, { notas });
    return Response.json(resumo, { status: via ? 200 : 502 });
  } catch (e) {
    resumo.erro = String((e as Error).message ?? e);
    try { if (!corpo.so_teste) await pgPost("vm_coletas", [{ coletor: "cvm-documentos", situacao: "erro", novos: 0, detalhe: { notas }, erro: resumo.erro }], "return=minimal"); } catch (_) { /* sem registro */ }
    return Response.json(resumo, { status: 500 });
  }
}

Deno.serve(tratar);
