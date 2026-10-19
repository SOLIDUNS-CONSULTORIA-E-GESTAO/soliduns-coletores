// SOLIDUNS · Valor e Mercado — Edge Function "scanner-do-dia" — v1.9 (15/10/2026)
//
// v1.1 (decisões do Thiago, 14/10 15h43): PUBLICA AUTOMATICAMENTE, sem revisão (a verificação fica só como registro;
//       VM_REVISAO_HUMANA=1 volta a gravar como rascunho) e usa a agenda do dia (public.vm_agenda) no contexto.
//
// ETAPA 3 do plano de fontes (Prompts 14 a 17): escreve o "Scanner do Dia" como RASCUNHO para aprovação humana.
//   1. Monta o contexto do dia SÓ com a base própria: public.cotacoes (indicadores de fechamento e maiores variações
//      da B3) e public.vm_achados (radar: camada livre com o resumo do feed; camada pauta só com o título).
//   2. Chama a API da Anthropic (modelo em VM_MODELO; padrão Sonnet), SEM busca na web, com a instrução de sistema
//      IGUAL ao prompt-sistema-agente.txt, versão 1.0 (texto abaixo da linha de "=", conferido pelo sha256).
//   3. Verificação automática (Prompt 15): números sem referência, referência inexistente, valor que não bate com o
//      registro, lacunas entre colchetes, vocabulário vetado, data futura. Reprovado também vai para a fila, com os
//      pontos destacados: quem decide é o editor.
//   4. Grava em public.vm_materias com situação "rascunho", o modelo, a versão do prompt, o contexto e o custo. NUNCA publica.
//
// Chamada: pg_cron às 6h45 de Brasília (dias úteis) e o botão "Gerar agora"/"Gerar de novo" da redação, via pg_net.
// Corpo opcional: {"so_teste": true} (não grava) · {"devolvida": <id>, "instrucao": "..."} (nova geração pedida pelo editor).
// Variáveis: COLETOR_TOKEN (manual) · ANTHROPIC_API_KEY (manual) · VM_MODELO (opcional) ·
//            SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (automáticas). Nenhuma chave neste arquivo.

const VERSAO = "2.6";   // v2.6 (19/10/2026, "RESERVA CLAUDE NO SCANNER"): texto da DeepSeek reprovado na conferência → o Claude reescreve e vai ao ar a melhor versão. v2.5:   // v2.5 (19/10/2026): DeepSeek com limite maior (32 mil) e, se a resposta vier cortada ou vazia, o Claude assume. v2.4:   // v2.4 (19/10/2026): agenda de INDICADORES (SQL 168): no texto só os de impacto ALTO (até 5); segunda-feira traz a semana. A planilha completa sai do banco, abaixo do texto. v2.3:   // v2.3 (18/10/2026): REDATOR DeepSeek V4 Pro (decisão do Thiago: escrever fora do pico, às 07h00 em dias úteis); o Claude fica de reserva.
// O Scanner não pesquisa na web: escreve só com a base própria (agenda, cotações, radar). Por isso a DeepSeek pode escrevê-lo sozinha.
const REVISAO_HUMANA = Deno.env.get("VM_REVISAO_HUMANA") === "1";
const PROMPT_VERSAO = "1.2";   // v2.0: revisão do plano editorial (Thiago, 15/10 20h55)
const PROMPT_SHA256 = "0da9531d533eff373240b7a089b89f2dc25c8403d94992c29e9298b0ffbc995d";
// prompt-sistema-agente.txt, versão 1.0 — texto EXATO abaixo da linha de "=" (sem alterações)
export const SISTEMA = "Você escreve para o Valor e Mercado, portal brasileiro de economia e mercado financeiro. Escreve em português do Brasil, para profissionais de finanças, empresários e investidores informados.\n\n**Material.** Você só pode afirmar o que estiver no contexto fornecido nesta mensagem. Não use conhecimento próprio sobre o assunto. Se um dado necessário não estiver no contexto, escreva a lacuna entre colchetes, assim: [verificar valor]. Nunca estime, nunca complete, nunca suponha.\n\n**Estrutura.** Produza: chapéu com uma palavra, título, linha fina, texto em parágrafos e lista de referências. Título com verbo no presente, voz ativa, sem ponto final, até 70 caracteres. Linha fina de 140 a 200 caracteres, acrescentando informação e nunca repetindo o título. Primeiro parágrafo de 35 a 50 palavras abrindo pela agenda do dia: comece exatamente com a frase de \"abertura_do_dia\" do contexto e siga com os eventos de maior peso e seus horários; se a agenda estiver vazia, abra pelo fato de maior peso, sem fórmula de abertura. Parágrafos seguintes com duas a quatro frases cada, em ordem decrescente de importância.\n\n**Números.** Vírgula decimal e ponto de milhar. Câmbio com quatro casas, percentual com duas, pontos de índice sem decimal. Variação sempre com sinal. Diferença entre taxas se expressa em pontos percentuais, nunca em por cento. Toda variação declara a base de comparação. Índice de bolsa se expressa em pontos, jamais em reais. Horário no formato 18h30.\n\n**Atribuição.** Atribua a origem só quando ela acrescenta informação: dado oficial (B3, Banco Central, IBGE, Tesouro, CVM, Fed) e decisão ou declaração de autoridade, no máximo uma vez por parágrafo e sem repetir a mesma fórmula. Nunca apresente a agenda, o contexto ou o próprio jornal como origem (proibido: \"segundo a agenda do dia\", \"de acordo com a agenda\", \"conforme os dados\"). Não cite jornais, agências de notícias ou outros veículos de imprensa no texto: o crédito das fontes fica na lista de referências. Cada número do texto precisa constar na lista de referências, ligado ao identificador do registro que o originou no contexto.\n\n**Proibições, sem exceção.** Não atribua causa a movimento de mercado, a menos que a causa esteja declarada no próprio documento; use \"em sessão marcada por\" ou \"no mesmo dia em que\". Não faça previsão; pode relatar previsão de terceiro, com atribuição. Não recomende compra, venda ou alocação. Não use primeira pessoa. Não invente declaração nem atribua fala a ninguém. Não escreva \"fontes de mercado\", \"pessoas próximas\" ou \"apurou o Valor e Mercado\". Não reproduza texto de terceiros.\n\n**Voz.** Escreva como o repórter que apurou os fatos. Nunca mencione o material recebido, o contexto, instruções ou falta de informação, e não use expressões típicas de texto automatizado: \"com base nos dados\", \"com base nas informações\", \"dados fornecidos\", \"informações disponíveis\", \"vale ressaltar\", \"vale destacar\", \"é importante notar\", \"cabe destacar\", \"em resumo\", \"em suma\", \"em conclusão\", \"neste cenário\", \"nesse contexto\".\n\n**Formatação.** Texto corrido, sem nenhuma marcação: nada de asteriscos, negrito, itálico, títulos internos, listas, marcadores, numeração de itens, emojis ou quebras de linha dentro do parágrafo. Cada parágrafo é um único bloco de texto com frases completas. Caixa alta só em siglas e códigos de negociação (IPCA, PETR4). Espaço simples entre palavras.\n\n**Vocabulário vetado.** disparar, despencar, desabar, derreter, euforia, pânico, sangria, massacre, festa, no radar dos investidores, o mercado precifica, em meio a, cenário desafiador, diante das incertezas.\n\n**Saída.** Responda apenas com um objeto JSON, sem texto antes ou depois, sem marcação de código, contendo: chapeu, titulo, linha_fina, paragrafos (lista de textos), editoria_sugerida, tags (lista) e referencias (lista de objetos com o número citado e o identificador do registro de origem).";

const MODELO = Deno.env.get("VM_MODELO") || "claude-sonnet-5-5";
const RESERVA = "claude-sonnet-4-5";
const ANTHROPIC_URL = Deno.env.get("VM_ANTHROPIC_URL") ?? "https://api.anthropic.com/v1/messages";   // troca só em teste
const PRECO_ENT = 3.0, PRECO_SAI = 15.0;    // US$ por milhão de tokens (estimativa para o registro de custo)
const INDICADORES = ["SELIC", "CDI", "IPCA", "USD", "EUR", "IBOV", "BOVA11"];   // v1.8: IBOV em pontos (B3); BOVA11 só se faltar o índice
const VOLUME_MIN = 50e6;                    // maiores variações: só papéis com R$ 50 milhões ou mais negociados
const VETADAS = ["disparar", "dispara", "disparou", "despencar", "despenca", "despencou", "desabar", "desaba", "desabou",
  "derreter", "derrete", "derreteu", "euforia", "pânico", "sangria", "massacre", "festa", "no radar dos investidores",
  "o mercado precifica", "em meio a", "cenário desafiador", "diante das incertezas",
  // v2.0 (plano editorial, 15/10): atribuição redundante e marcas de texto automatizado
  "segundo a agenda", "de acordo com a agenda", "conforme a agenda", "contexto fornecido", "dados fornecidos", "informações fornecidas",
  "informações disponíveis", "com base nos dados", "com base nas informações", "vale ressaltar", "vale destacar", "é importante notar",
  "cabe destacar", "em suma", "em resumo", "em conclusão"];
// v2.0: aberturas do Scanner (Thiago, 15/10: "Hoje a agenda do dia começa com…", "Por hoje na agenda, teremos…" e variações)
export const ABERTURAS = ["Hoje a agenda do dia começa com", "Por hoje na agenda, teremos", "A agenda de hoje abre com", "Para hoje, a agenda reserva",
  "O dia começa, na agenda, com", "Na agenda de hoje, o primeiro destaque é", "Logo cedo, a agenda traz", "A agenda {desta_dia} começa com"];
export function aberturaDoDia(hoje: Date): string {
  const n = Math.floor(hoje.getTime() / 864e5);
  return ABERTURAS[((n % ABERTURAS.length) + ABERTURAS.length) % ABERTURAS.length].replace("{desta_dia}", (hoje.getUTCDay() % 6 === 0 ? "deste " : "desta ") + DIAS[hoje.getUTCDay()]);
}
// v2.0: rede de segurança — tira a atribuição à agenda/contexto se o texto vier com ela ("Segundo a agenda do dia, ...")
export function semFormulasVetadas(s: unknown): string {
  return String(s ?? "").replace(/\*\*|__/g, "").replace(/^\s*([-•*]|\d+[.)])\s+/, "").replace(/\s+/g, " ")   // v2.2: sem marcação
    .replace(/(^|[.!?]\s+)(segundo|de acordo com|conforme)\s+(a|o)\s+(agenda|contexto|calend[aá]rio)(\s+(do dia|de hoje|oficial))?\s*,\s*(\S)/gi,
      (_m, ini: string, _a, _b, _c, _d, _e, letra: string) => ini + letra.toUpperCase())
    .replace(/,\s*(segundo|de acordo com|conforme)\s+(a|o)\s+(agenda|contexto)(\s+(do dia|de hoje))?(?=[,.;])/gi, "")
    .trim();
}
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

type Registro = Record<string, unknown> & { id: string };
export type Contexto = { data_de_hoje: string; abertura_do_dia?: string; agenda_do_dia: Registro[]; indicadores: Registro[]; maiores_variacoes_b3: Registro[];
  fontes_oficiais_livres: Registro[]; assuntos_em_pauta: Registro[]; observacao: string; agenda_da_semana?: Registro[] };

const iso = (d: Date) => d.toISOString().slice(0, 10);
export function hojeBrasilia(agora = new Date()): Date { return new Date(iso(new Date(agora.getTime() - 3 * 3600e3)) + "T00:00:00Z"); }
const extenso = (d: Date) => `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;

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
  if (!r.ok) throw new Error(`leitura falhou (${r.status}) em ${caminho.split("?")[0]} — rodou as migrations 137 e 138?`);
  return await r.json();
}
async function pgPost(tabela: string, linhas: unknown[], prefer = "return=minimal"): Promise<unknown> {
  const r = await fetch(`${base()}/${tabela}`, { method: "POST", body: JSON.stringify(linhas), headers: cab({ Prefer: prefer }) });
  if (!r.ok) throw new Error(`gravação em ${tabela} falhou (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return prefer.includes("representation") ? await r.json() : null;
}

// ------------------------------------------------------------------ contexto do dia
type Cot = { id: number; fonte: string; codigo: string; descricao: string | null; data_ref: string; fechamento: number;
  unidade: string; url_fonte: string; volume?: number | null; codbdi?: string | null };
type Ag = { id: number; data_ref?: string; hora: string; regiao: string; categoria: string; evento: string; consenso: string | null; fonte: string; url: string; origem: string;
  tipo?: string; pais?: string | null; grupo?: string | null; indicador?: string | null; instituicao?: string | null; impacto?: string | null; referencia?: string | null; anterior?: string | null };
type Ach = { id: number; fonte_nome: string; camada: string; titulo: string; resumo: string | null; link: string; publicado_em: string | null };

const VAZIAS = new Set(["para", "pelo", "pela", "com", "dos", "das", "nos", "nas", "que", "uma", "the", "and", "for", "eua", "brasil", "banco", "central", "dados", "divulga", "divulgacao", "indice", "taxa", "mensal", "relatorio", "reuniao", "setembro", "outubro", "agosto"]);
function palavras(t: string): Set<string> {
  return new Set(t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !VAZIAS.has(w)));
}
const SIGLAS = ["ppi", "cpi", "pce", "payroll", "jolts", "focus", "copom", "fomc", "ipca", "pib", "pmc", "pms", "pim", "pnad", "caged", "ibc"];
export function mesmoEvento(oficial: string, web: string): boolean {
  const a = palavras(oficial), b = palavras(web);
  if (SIGLAS.some((s) => a.has(s) && b.has(s))) return true;
  const comuns = [...a].filter((w) => b.has(w)).length;
  return comuns >= 2 && comuns / Math.min(a.size, b.size) >= 0.5;
}

export async function montarContexto(hoje: Date): Promise<{ ctx: Contexto; urls: Record<string, { fonte: string; url: string }> }> {
  const urls: Record<string, { fonte: string; url: string }> = {};
  const indicadores: Registro[] = [];
  for (const cod of INDICADORES) {
    if (cod === "BOVA11" && indicadores.some((i) => i.codigo === "IBOV")) continue;   // v1.8: com o índice em pontos, o BOVA11 sai
    const fonte = cod === "BOVA11" ? "&fonte=eq.B3%20COTAHIST" : cod === "IBOV" ? "&fonte=eq.B3%20%C3%8Dndices" : "";
    const ls = await pgGet<Cot[]>(`cotacoes?select=id,fonte,codigo,descricao,data_ref,fechamento,unidade,url_fonte&codigo=eq.${cod}${fonte}` +
      `&data_ref=lte.${iso(hoje)}&order=data_ref.desc&limit=2`);
    for (const c of ls) {
      const id = `cot:${c.id}`;
      indicadores.push({ id, codigo: c.codigo, descricao: cod === "BOVA11" ? "BOVA11, fundo de índice que replica o Ibovespa (preço da cota, em reais)" : c.descricao,
        data_de_referencia: c.data_ref, valor: c.fechamento, unidade: c.unidade, fonte: c.fonte });
      urls[id] = { fonte: c.fonte, url: c.url_fonte };
    }
  }
  // v1.8: expectativas do Boletim Focus (mediana mais recente de cada série: IPCA, Selic, PIB e dólar, ano corrente e seguinte)
  const focus = await pgGet<Cot[]>(`cotacoes?select=id,fonte,codigo,descricao,data_ref,fechamento,unidade,url_fonte&fonte=eq.BCB%20Focus` +
    `&data_ref=lte.${iso(hoje)}&order=data_ref.desc&limit=60`);
  const vistosFocus = new Set<string>();
  for (const c of focus) {
    if (vistosFocus.has(c.codigo)) continue;
    vistosFocus.add(c.codigo);
    const id = `cot:${c.id}`;
    indicadores.push({ id, codigo: c.codigo, descricao: (c.descricao || c.codigo) + " — Boletim Focus (expectativa de mercado, não é dado realizado)",
      data_de_referencia: c.data_ref, valor: c.fechamento, unidade: c.unidade, fonte: "Banco Central (Boletim Focus)" });
    urls[id] = { fonte: "Banco Central (Boletim Focus)", url: c.url_fonte };
  }
  const variacoes: Registro[] = [];
  const d1 = (await pgGet<{ data_ref: string }[]>(`cotacoes?select=data_ref&fonte=eq.B3%20COTAHIST&data_ref=lte.${iso(hoje)}&order=data_ref.desc&limit=1`))[0]?.data_ref;
  const d0 = d1 ? (await pgGet<{ data_ref: string }[]>(`cotacoes?select=data_ref&fonte=eq.B3%20COTAHIST&data_ref=lt.${d1}&order=data_ref.desc&limit=1`))[0]?.data_ref : undefined;
  if (d1 && d0) {
    const sel = "select=id,codigo,fechamento,volume,url_fonte,fonte&fonte=eq.B3%20COTAHIST&codbdi=eq.02";
    const hojeB3 = await pgGet<Cot[]>(`cotacoes?${sel}&data_ref=eq.${d1}&volume=gte.${VOLUME_MIN}&limit=2000`);
    const antes = new Map((await pgGet<Cot[]>(`cotacoes?${sel}&data_ref=eq.${d0}&limit=5000`)).map((c) => [c.codigo, c]));
    const comVar = hojeB3.flatMap((c) => {
      const a = antes.get(c.codigo);
      return a && a.fechamento > 0 ? [{ c, a, v: Math.round((c.fechamento / a.fechamento - 1) * 10000) / 100 }] : [];
    }).sort((x, y) => y.v - x.v);
    const escolhidos = [...comVar.slice(0, 5), ...comVar.slice(-5).reverse()].filter((x, i, arr) => arr.findIndex((y) => y.c.id === x.c.id) === i);
    for (const { c, a, v } of escolhidos) {
      const id = `cot:${c.id}`;
      variacoes.push({ id, ticker: c.codigo, pregao: d1, fechamento_reais: c.fechamento, pregao_anterior: d0,
        fechamento_anterior_reais: a.fechamento, variacao_percentual: v, volume_financeiro_reais: c.volume, fonte: "B3 COTAHIST" });
      urls[id] = { fonte: "B3 COTAHIST", url: c.url_fonte };
    }
  }
  const agenda: Registro[] = [];
  // v2.4: com a SQL 168, a agenda traz os indicadores (impacto vem da lista mestre); sem ela, cai na consulta antiga
  const segunda = hoje.getUTCDay() === 1, sexta = iso(new Date(hoje.getTime() + 4 * 864e5));
  let ags: Ag[], semana: Ag[] = [];
  try {
    const todos = await pgGet<Ag[]>(`vm_agenda?select=id,data_ref,hora,regiao,categoria,evento,consenso,fonte,url,origem,tipo,pais,grupo,indicador,instituicao,impacto,referencia,anterior` +
      `&data_ref=gte.${iso(hoje)}&data_ref=lte.${segunda ? sexta : iso(hoje)}&order=data_ref,hora&limit=200`);
    ags = todos.filter((a) => a.data_ref === iso(hoje)).slice(0, 90);
    semana = todos.filter((a) => a.data_ref !== iso(hoje) && a.tipo === "indicador" && a.impacto !== "baixo").slice(0, 60);
  } catch (_) {
    ags = await pgGet<Ag[]>(`vm_agenda?select=id,hora,regiao,categoria,evento,consenso,fonte,url,origem&data_ref=eq.${iso(hoje)}&order=hora&limit=80`);
  }
  // v1.7: o item da pesquisa na web só sai quando é O MESMO evento de um item oficial (mesmo horário e assunto parecido),
  // e não qualquer evento do mesmo horário (ex.: PPI oficial às 9h30 não apaga as vendas no varejo das 9h30)
  const oficiais = ags.filter((a) => a.origem === "calendario_oficial");
  const repetido = (a: Ag) => oficiais.some((o) => o.hora === a.hora && mesmoEvento(o.evento, a.evento));
  for (const a of ags) {
    if (a.origem === "pesquisa_web" && repetido(a)) continue;   // calendário oficial tem prioridade
    const id = `ag:${a.id}`;
    agenda.push(a.tipo === "indicador"
      ? { id, tipo: "indicador", hora_brasilia: a.hora, pais: a.pais, indicador: a.indicador ?? a.evento, instituicao: a.instituicao, impacto: a.impacto,
          referencia: a.referencia, consenso: a.consenso, anterior: a.anterior, fonte: a.fonte }
      : { id, hora_brasilia: a.hora, regiao: a.regiao, categoria: a.categoria, evento: a.evento, consenso: a.consenso, fonte: a.fonte });
    urls[id] = { fonte: a.fonte, url: a.url };
  }
  const agendaSemana: Registro[] = semana.map((a) => {
    const id = `ag:${a.id}`; urls[id] = { fonte: a.fonte, url: a.url };
    return { id, data: a.data_ref, hora_brasilia: a.hora, pais: a.pais, indicador: a.indicador ?? a.evento, instituicao: a.instituicao, impacto: a.impacto,
             referencia: a.referencia, consenso: a.consenso, anterior: a.anterior, fonte: a.fonte };
  });
  const desde = new Date(Date.now() - 30 * 3600e3).toISOString();
  const achados = await pgGet<Ach[]>(`vm_achados?select=id,fonte_nome,camada,titulo,resumo,link,publicado_em&coletado_em=gte.${desde}` +
    `&order=publicado_em.desc.nullslast&limit=200`);
  const livres: Registro[] = [], pauta: Registro[] = [];
  for (const a of achados) {
    const id = `ach:${a.id}`;
    urls[id] = { fonte: a.fonte_nome, url: a.link };
    // v1.9: a CVM (fatos relevantes e comunicados) tem até 15 vagas; as demais fontes livres, até 20 — uma não sufoca a outra
    const ehCvm = a.fonte_nome === "CVM", nCvm = livres.filter((x) => x.fonte === "CVM").length;
    if (a.camada === "livre" && (ehCvm ? nCvm < 15 : livres.length - nCvm < 20)) livres.push({ id, fonte: a.fonte_nome, titulo: a.titulo, resumo: a.resumo, publicado_em: a.publicado_em, link: a.link });
    else if (a.camada === "pauta" && pauta.length < 30) pauta.push({ id, fonte: a.fonte_nome, assunto: a.titulo, publicado_em: a.publicado_em });
  }
  return { urls, ctx: { data_de_hoje: iso(hoje), abertura_do_dia: aberturaDoDia(hoje), agenda_do_dia: agenda, ...(agendaSemana.length ? { agenda_da_semana: agendaSemana } : {}),
    indicadores, maiores_variacoes_b3: variacoes, fontes_oficiais_livres: livres, assuntos_em_pauta: pauta,
    observacao: "'agenda_do_dia' traz os eventos previstos para hoje, com horário de Brasília e fonte. Indicadores e cotações são de FECHAMENTO. 'fontes_oficiais_livres' trazem só o resumo publicado pela própria fonte (uso com crédito). " +
      "'assuntos_em_pauta' trazem só o assunto: o texto desses veículos não está no contexto e não pode ser reproduzido nem resumido." } };
}

export function pedido(hoje: Date, ctx: Contexto, anterior?: unknown, instrucao?: string): string {
  return `Escreva o "Scanner do Dia" do Valor e Mercado para ${extenso(hoje)}: a análise que abre a coluna "O que move o dia" na home. ` +
    "Reúna, em ordem decrescente de importância: o que está previsto para hoje na agenda do dia (Brasil e Estados Unidos, com horário de Brasília e consenso quando houver), " +
    "o que os indicadores de fechamento mais recentes mostram, as maiores variações da bolsa no último pregão e o que as fontes oficiais publicaram nas últimas 24 horas. " +
    "Use o chapéu \"Scanner\". " +
    // v2.4 (Thiago, 19/10): indicadores de maior impacto no texto; os demais ficam na planilha da agenda, montada abaixo do texto
    "INDICADORES ECONÔMICOS: na agenda, os itens com tipo \"indicador\" trazem o campo \"impacto\". No texto, trate SOMENTE os de impacto \"alto\" (no máximo cinco), " +
    "com horário, instituição, período de referência, consenso e resultado anterior quando houver. Não enumere os de impacto \"medio\" ou \"baixo\": " +
    "a agenda completa de indicadores já aparece numa planilha logo abaixo do texto. Se não houver indicador de impacto alto hoje, não mencione a planilha nem a ausência; siga com os demais assuntos. " +
    (ctx.agenda_da_semana?.length ? "HOJE É SEGUNDA-FEIRA: \"agenda_da_semana\" traz os indicadores de terça a sexta. Dedique o segundo parágrafo aos destaques de impacto alto da semana, com o dia de cada um. " : "") +
    "Entregue a edição chamando a ferramenta \"entregar_edicao\" uma única vez, com o objeto JSON pedido. " +
    "Os identificadores das referências são o campo \"id\" de cada registro do contexto. " +
    "Itens de \"assuntos_em_pauta\" servem só para indicar temas: não os cite, não atribua nada aos veículos e não reproduza nem resuma o texto deles; escreva sobre um desses temas apenas se houver registro oficial ou livre no contexto que o sustente." +
    (instrucao ? `\n\nINSTRUÇÃO DO EDITOR PARA ESTA NOVA VERSÃO: ${instrucao}\n\nVERSÃO ANTERIOR (devolvida pelo editor):\n${JSON.stringify(anterior)}` : "") +
    `\n\nCONTEXTO:\n${JSON.stringify(ctx)}`;
}

// ------------------------------------------------------------------ Anthropic
// v1.2: a edição é entregue por uma ferramenta obrigatória (entregar_edicao), com os mesmos campos que o prompt pede.
const TXT = { type: "string" };
const ENTREGA = {
  name: "entregar_edicao",
  description: "Entrega o objeto JSON pedido: chapeu, titulo, linha_fina, paragrafos, editoria_sugerida, tags e referencias.",
  input_schema: { type: "object", required: ["chapeu", "titulo", "linha_fina", "paragrafos", "referencias"],
    properties: { chapeu: TXT, titulo: TXT, linha_fina: TXT, paragrafos: { type: "array", items: TXT }, editoria_sugerida: TXT,
      tags: { type: "array", items: TXT },
      referencias: { type: "array", items: { type: "object", required: ["numero", "identificador"], properties: { numero: TXT, identificador: TXT } } } } },
};
const DS_URL = Deno.env.get("DEEPSEEK_URL") || "https://api.deepseek.com";
const DS_MODELO = Deno.env.get("VM_SCANNER_DEEPSEEK_MODELO") || "deepseek-v4-pro";
export const usaDeepSeek = () => !!Deno.env.get("DEEPSEEK_API_KEY") && (Deno.env.get("VM_SCANNER_REDATOR") ?? "deepseek") === "deepseek";
export const precoDe = (modelo: string) => modelo.startsWith("deepseek") ? { ent: 0.66, sai: 1.98 } : { ent: PRECO_ENT, sai: PRECO_SAI };
async function chamarDeepSeek(mensagens: unknown[]): Promise<{ texto: string; modelo: string; ent: number; sai: number; diag: string }> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 120000);
  try {
    const r = await fetch(`${DS_URL}/chat/completions`, { method: "POST", signal: ctl.signal,
      headers: { Authorization: `Bearer ${Deno.env.get("DEEPSEEK_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: DS_MODELO, messages: [{ role: "system", content: SISTEMA }, ...(mensagens as unknown[])],
        response_format: { type: "json_object" }, max_tokens: 32000, temperature: 0.4 }) });   // v2.5: o raciocínio da V4 Pro conta no limite
    if (!r.ok) throw new Error(`DeepSeek ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json(), texto = String(j.choices?.[0]?.message?.content ?? "");
    // v2.5: resposta cortada ou vazia não serve — o Claude de reserva assume na hora
    if (j.choices?.[0]?.finish_reason === "length" || !texto.includes("{")) throw new Error(`resposta incompleta (finish=${j.choices?.[0]?.finish_reason}, ${texto.length} caracteres)`);
    return { texto, modelo: DS_MODELO, ent: Number(j.usage?.prompt_tokens ?? 0), sai: Number(j.usage?.completion_tokens ?? 0),
      diag: `deepseek finish=${j.choices?.[0]?.finish_reason}; início="${texto.slice(0, 120)}"` };
  } finally { clearTimeout(t); }
}
export async function chamar(mensagens: unknown[], soClaude = false): Promise<{ texto: string; modelo: string; ent: number; sai: number; diag: string }> {
  let avisoDs = "";
  if (usaDeepSeek() && !soClaude) {
    try { return await chamarDeepSeek(mensagens); }
    catch (e) { avisoDs = `DeepSeek falhou (${String((e as Error).message ?? e).slice(0, 150)}) — usando o Claude de reserva`; console.warn(avisoDs); }
  }
  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) throw new Error("Defina ANTHROPIC_API_KEY nos segredos das Edge Functions.");
  let ultimo = "";
  for (const modelo of [MODELO, RESERVA].filter((m, i, a) => a.indexOf(m) === i)) {
    for (let t = 0; t < 3; t++) {
      const r = await fetch(ANTHROPIC_URL, { method: "POST", headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: modelo, max_tokens: 16000, system: SISTEMA, messages: mensagens,
          tools: [ENTREGA], tool_choice: { type: "auto" } }) });
      const corpo = await r.text();
      if (r.ok) {
        const j = JSON.parse(corpo);
        const blocos = (j.content ?? []) as { type: string; name?: string; input?: unknown; text?: string }[];
        const ferramenta = blocos.find((b) => b.type === "tool_use" && b.name === "entregar_edicao");
        const texto = ferramenta ? JSON.stringify(ferramenta.input ?? {}) : blocos.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
        const diag = `stop_reason=${j.stop_reason}; blocos=${blocos.map((b) => b.type).join(",") || "nenhum"}; início="${texto.slice(0, 120)}"`;
        return { texto, modelo, ent: j.usage?.input_tokens ?? 0, sai: j.usage?.output_tokens ?? 0, diag };
      }
      ultimo = (ultimo ? ultimo + " | " : "") + `${modelo} ${r.status}: ${corpo.slice(0, 300)}`;
      if (r.status === 404 || corpo.includes("not_found_error")) break;                                 // modelo inexistente: tenta o reserva
      if (r.status === 400) throw new Error(`Pedido recusado pela Anthropic (${ultimo})`);
      if (r.status === 401 || r.status === 403) throw new Error(`Chave da Anthropic recusada (${r.status}).`);
      if ([429, 500, 502, 503, 529].includes(r.status)) { await new Promise((ok) => setTimeout(ok, 8000 * (t + 1))); continue; }
      throw new Error(`Erro da Anthropic ${ultimo}`);
    }
  }
  throw new Error(`Nenhum modelo respondeu (${ultimo}).`);
}
const MANTER_LACUNAS = Deno.env.get("VM_MANTER_LACUNAS") === "1";
export function semLacunas(pars: unknown): string[] {
  if (!Array.isArray(pars)) return [];
  return pars.map((p) => String(p).split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú"“(])/).filter((f) => !/\[[^\]]{2,120}\]/.test(f)).join(" ").trim())
    .filter((p) => p.length > 0);
}
export function extrairJson(t: string): Record<string, unknown> {
  let s = (t ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const i = s.indexOf("{"), f = s.lastIndexOf("}");
  if (i < 0 || f <= i) throw new Error("resposta sem JSON");
  s = s.slice(i, f + 1);
  const j = JSON.parse(s);
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("JSON não é um objeto");
  return normalizar(j);
}
// v1.6: referências em qualquer formato viram lista de { numero, identificador }
export function refsComoLista(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => typeof x === "string"
    ? { numero: (x.match(/[-+]?\d[\d.,]*/) ?? [""])[0], identificador: (x.match(/\b[a-z]+:\d+\b/i) ?? [""])[0] } : x);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const dentro = Object.values(o).find(Array.isArray);
    if (dentro && Object.keys(o).length === 1) return refsComoLista(dentro);
    return Object.entries(o).map(([k, val]) => /^[a-z]+:\d+$/i.test(k) ? { numero: String(val), identificador: k } : { numero: k, identificador: String(val) });
  }
  if (typeof v === "string") return refsComoLista(v.split(/\n|;/).map((x) => x.trim()).filter(Boolean));
  return v;
}
// v1.5: o modelo às vezes manda listas como texto (JSON dentro de texto, ou parágrafos separados por linha em branco)
export function normalizar(g: Record<string, unknown>): Record<string, unknown> {
  const lista = (v: unknown, separar: boolean): unknown[] | unknown => {
    if (Array.isArray(v) || typeof v !== "string") return v;
    const t = v.trim();
    if (t.startsWith("[")) { try { const a = JSON.parse(t); if (Array.isArray(a)) return a; } catch (_) { /* segue */ } }
    return separar ? t.split(/\n\s*\n|\n/).map((x) => x.trim()).filter(Boolean) : v;
  };
  const out: Record<string, unknown> = { ...g };
  out.paragrafos = lista(g.paragrafos ?? g["parágrafos"] ?? g.texto ?? g.corpo, true);
  out.referencias = refsComoLista(lista(g.referencias ?? g["referências"], false));
  out.tags = lista(g.tags, false);
  if (typeof out.tags === "string") out.tags = String(out.tags).split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  if (!out.linha_fina && g["linha-fina"]) out.linha_fina = g["linha-fina"];
  if (!out.chapeu && g["chapéu"]) out.chapeu = g["chapéu"];
  return out;
}

// ------------------------------------------------------------------ verificação automática (Prompt 15)
export type Checagem = { checagem: string; ok: boolean; bloqueia: boolean; detalhe: string[] };
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const numBr = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));
function decimais(s: string) { const p = s.split(","); return p.length > 1 ? p[1].length : 0; }
// números do texto, sem datas (14/10, 2026), horários (18h30) e ordinais
export function numerosDoTexto(t: string): string[] {
  const limpo = t.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ")
    .replace(new RegExp(`\\b\\d{1,2}(º)? de (${MESES.join("|")})\\b`, "gi"), " ").replace(/\b\d{1,2}h\d{0,2}\b/gi, " ")
    .replace(/\b\d+[ºª]/g, " ").replace(/\b\d+ (horas|dias|meses|anos)\b/gi, " ").replace(/\bbase 252\b/gi, " ").replace(/\((\d{1,2})\)/g, " ");
  return (limpo.match(/(?<![\w.,])[-+−]?\d{1,3}(?:\.\d{3})+(?:,\d+)?|(?<![\w.,])[-+−]?\d+(?:,\d+)?/g) ?? [])
    .map((x) => x.replace(/^[+−-]/, "")).filter((x) => !/^(19|20)\d{2}$/.test(x));
}
function valoresDoRegistro(r: Registro | undefined): number[] {
  if (!r) return [];
  return Object.values(r).flatMap((v) => typeof v === "number" ? [v] : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? [parseFloat(v)] : []);
}
export function verificar(g: Record<string, unknown>, ctx: Contexto, hoje: Date): Checagem[] {
  const ch: Checagem[] = [];
  const pars = Array.isArray(g.paragrafos) ? (g.paragrafos as unknown[]).map(String) : [];
  const refs = Array.isArray(g.referencias) ? g.referencias as Record<string, unknown>[] : [];
  const faltam = ["chapeu", "titulo", "linha_fina"].filter((k) => !String(g[k] ?? "").trim());
  ch.push({ checagem: "campos", ok: !faltam.length && pars.length > 0 && Array.isArray(g.referencias), bloqueia: true,
    detalhe: [...faltam.map((k) => `campo vazio: ${k}`), ...(pars.length ? [] : ["sem parágrafos"])] });
  const registros = new Map<string, Registro>([...ctx.agenda_do_dia, ...ctx.indicadores, ...ctx.maiores_variacoes_b3, ...ctx.fontes_oficiais_livres, ...ctx.assuntos_em_pauta].map((r) => [r.id, r]));
  const idRef = (r: Record<string, unknown>) => String(r.identificador ?? r.id ?? r.registro ?? r.id_registro ?? "").trim();
  const numBruto = (r: Record<string, unknown>) => String(r.numero ?? r["número"] ?? r.valor ?? "").trim();
  // v1.4: o agente às vezes anota a referência ("+0,69% (cálculo sobre cot:890 e cot:889)"): vale o primeiro número
  const numRef = (r: Record<string, unknown>) => (numBruto(r).replace(/\b[a-z]+:\d+\b/gi, " ").match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/) ?? [""])[0];
  const idsDaRef = (r: Record<string, unknown>) => [...new Set([idRef(r), ...(numBruto(r).match(/\b[a-z]+:\d+\b/gi) ?? [])])];
  const inexistentes = refs.filter((r) => !registros.has(idRef(r))).map((r) => `${numRef(r)} → "${idRef(r)}" não existe no contexto`);
  ch.push({ checagem: "referencias_existem", ok: !inexistentes.length, bloqueia: true, detalhe: inexistentes });
  const divergentes: string[] = [];
  // v2.1: o agente às vezes dá uma referência por registro para a mesma variação ("0,69" -> cot:890 e "0,69" -> cot:889)
  const idsPorNumero = new Map<string, string[]>();
  for (const r of refs) { const n = numRef(r); if (n) idsPorNumero.set(n, [...(idsPorNumero.get(n) ?? []), ...idsDaRef(r)]); }
  for (const r of refs) {
    const reg = registros.get(idRef(r)), n = numRef(r);
    if (!reg || !n) continue;
    const v = numBr(n), d = decimais(n), vals = valoresDoRegistro(reg);
    // v1.4: variação calculada entre dois registros citados (ex.: PTAX de hoje sobre a de ontem) também confere
    const outros = [...new Set([...idsDaRef(r), ...(idsPorNumero.get(n) ?? [])])].map((i) => registros.get(i)).filter(Boolean).flatMap((x) => valoresDoRegistro(x));
    for (const a of outros) for (const b of outros) if (a !== b && b) vals.push((a / b - 1) * 100, a - b);
    // compara em módulo (queda "de 5,00%" = −5) e aceita escala de mil, milhão e bilhão (R$ 900 milhões = 900000000)
    const bate = (x: number) => [1, 1e3, 1e6, 1e9].some((k) => Math.abs(Math.round(Math.abs(x) / k * 10 ** d) / 10 ** d - Math.abs(v)) < 0.5 / 10 ** d + 1e-9);
    if (Number.isFinite(v) && vals.length && !vals.some(bate))
      divergentes.push(`${numRef(r)} não confere com o registro ${idRef(r)} (${vals.join(" / ")})`);
  }
  ch.push({ checagem: "valores_conferem", ok: !divergentes.length, bloqueia: true, detalhe: divergentes });
  // v2.1: abertura do Scanner (plano editorial 1.2) — registro; a correção é pedida uma vez na geração
  const ab = String(ctx.abertura_do_dia ?? "");
  const abOk = !ab || !ctx.agenda_do_dia.length || String(pars[0] ?? "").trim().startsWith(ab);
  ch.push({ checagem: "abertura", ok: abOk, bloqueia: false, detalhe: abOk ? [] : [`o primeiro parágrafo não começa com "${ab}"`] });
  const texto = [g.titulo, g.linha_fina, ...pars].map(String).join(" \n ");
  const citados = new Set(refs.map((r) => numRef(r)));
  const semRef = [...new Set(numerosDoTexto(texto))].filter((n) => !citados.has(n));
  ch.push({ checagem: "numeros_com_referencia", ok: !semRef.length, bloqueia: true, detalhe: semRef.map((n) => `${n} sem referência`) });
  const lacunas = texto.match(/\[[^\]]{2,80}\]/g) ?? [];
  ch.push({ checagem: "lacunas", ok: !lacunas.length, bloqueia: true, detalhe: lacunas.map((l) => `lacuna a preencher: ${l}`) });
  const t = ` ${semAcento(texto)} `;
  const vet = VETADAS.filter((p) => new RegExp(`[^a-z]${semAcento(p)}[^a-z]`).test(t));
  ch.push({ checagem: "vocabulario_vetado", ok: !vet.length, bloqueia: true, detalhe: vet.map((p) => `vetado: "${p}"`) });
  const futuras = (texto.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) ?? []).filter((d) => { const [dd, mm, aa] = d.split("/"); return `${aa}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}` > iso(hoje); });
  ch.push({ checagem: "datas", ok: !futuras.length, bloqueia: true, detalhe: futuras.map((d) => `data posterior a hoje: ${d}`) });
  const tit = String(g.titulo ?? ""), lf = String(g.linha_fina ?? "");
  const forma = [...(tit.length > 70 ? [`título com ${tit.length} caracteres (máx. 70)`] : []), ...(/\.\s*$/.test(tit) ? ["título termina em ponto"] : []),
    ...((lf.length < 140 || lf.length > 200) ? [`linha fina com ${lf.length} caracteres (140 a 200)`] : [])];
  ch.push({ checagem: "forma", ok: !forma.length, bloqueia: false, detalhe: forma });
  return ch;
}

// ------------------------------------------------------------------ handler
export async function tratar(req: Request): Promise<Response> {
  const token = Deno.env.get("COLETOR_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) return Response.json({ erro: "não autorizado" }, { status: 401 });
  let corpo: { so_teste?: boolean; devolvida?: number; instrucao?: string } = {};
  try { corpo = await req.json(); } catch (_) { /* vazio */ }
  const hoje = hojeBrasilia(), resumo: Record<string, unknown> = { versao: VERSAO, prompt_versao: PROMPT_VERSAO }, t0 = Date.now();
  try {
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SISTEMA))))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    if (sha !== PROMPT_SHA256) throw new Error("o texto do prompt de sistema foi alterado (sha256 não confere)");
    let anterior: unknown;
    if (corpo.devolvida) anterior = (await pgGet<{ gerado: unknown }[]>(`vm_materias?select=gerado&id=eq.${Number(corpo.devolvida)}`))[0]?.gerado;
    const { ctx, urls } = await montarContexto(hoje);
    resumo.contexto = { agenda: ctx.agenda_do_dia.length, indicadores: ctx.indicadores.length, variacoes: ctx.maiores_variacoes_b3.length,
      livres: ctx.fontes_oficiais_livres.length, pauta: ctx.assuntos_em_pauta.length };
    if (!ctx.indicadores.length && !ctx.fontes_oficiais_livres.length && !ctx.agenda_do_dia.length) throw new Error("contexto vazio: sem agenda, indicadores nem achados para escrever");
    const msgs: { role: string; content: string }[] = [{ role: "user", content: pedido(hoje, ctx, anterior, corpo.instrucao) }];
    let r = await chamar(msgs), ent = r.ent, sai = r.sai, gerado: Record<string, unknown>, custoAcum = 0;
    const somaCusto = (x: { modelo: string; ent: number; sai: number }) => { const p = precoDe(x.modelo); custoAcum += x.ent / 1e6 * p.ent + x.sai / 1e6 * p.sai; };
    somaCusto(r);
    try { gerado = extrairJson(r.texto); } catch (_) {
      const d1 = r.diag;
      r = await chamar(msgs); ent += r.ent; sai += r.sai; somaCusto(r);   // segunda tentativa, do zero
      try { gerado = extrairJson(r.texto); } catch (e2) {
        throw new Error(`resposta sem JSON (1ª: ${d1} | 2ª: ${r.diag}) ${String((e2 as Error).message ?? e2).slice(0, 80)}`);
      }
    }
    // v2.1: se o Scanner não abriu pela agenda com a abertura do dia, pede UMA reescrita (o plano editorial exige)
    const ab = String(ctx.abertura_do_dia ?? "");
    const comeca = (g: Record<string, unknown>) => String((Array.isArray(g.paragrafos) ? g.paragrafos[0] : "") ?? "").trim().startsWith(ab);
    if (ab && ctx.agenda_do_dia.length && !comeca(gerado)) {
      const ped = pedido(hoje, ctx, gerado, `O primeiro parágrafo precisa começar exatamente com "${ab}" e tratar da agenda do dia. Reescreva a edição inteira com essa abertura, mantendo todas as demais regras.` + (corpo.instrucao ? ` ${corpo.instrucao}` : ""));
      try {
        const r2 = await chamar([{ role: "user", content: ped }]); ent += r2.ent; sai += r2.sai; somaCusto(r2);
        const g2 = extrairJson(r2.texto);
        if (comeca(g2)) { gerado = g2; r = r2; resumo.reescrita_abertura = "ok"; } else resumo.reescrita_abertura = "sem efeito";
      } catch (e) { resumo.reescrita_abertura = `falhou: ${String((e as Error).message ?? e).slice(0, 80)}`; }
    }
    let verificacoes = verificar(gerado, ctx, hoje);
    const falhas = (v: { ok: boolean; bloqueia: boolean }[]) => v.filter((c) => !c.ok && c.bloqueia).length;
    // v2.6: texto da DeepSeek reprovado → o Claude reescreve (se houver tempo no limite de 150 s da função) e fica a melhor versão
    if (falhas(verificacoes) && r.modelo.startsWith("deepseek") && Date.now() - t0 < 80000) {
      try {
        const rc = await chamar(msgs, true); ent += rc.ent; sai += rc.sai; somaCusto(rc);
        const gc = extrairJson(rc.texto), vc = verificar(gc, ctx, hoje);
        resumo.reserva_claude = { reprovacoes_deepseek: verificacoes.filter((c) => !c.ok && c.bloqueia).map((c) => c.checagem), falhas_claude: falhas(vc) };
        if (falhas(vc) <= falhas(verificacoes)) { gerado = gc; verificacoes = vc; r = rc; (resumo.reserva_claude as Record<string, unknown>).usada = true; }
      } catch (e) { resumo.reserva_claude = `falhou: ${String((e as Error).message ?? e).slice(0, 100)}`; }
    } else if (falhas(verificacoes) && r.modelo.startsWith("deepseek")) resumo.reserva_claude = "sem tempo no limite da função";
    const ok = verificacoes.every((c) => c.ok || !c.bloqueia);
    const refs = Array.isArray(gerado.referencias) ? gerado.referencias as Record<string, unknown>[] : [];
    const vistos = new Set<string>(), fontes: { id: string; fonte: string; url: string }[] = [];
    for (const x of refs) {
      const id = String(x.identificador ?? x.id ?? x.registro ?? x.id_registro ?? "").trim(), u = urls[id];
      if (u && !vistos.has(u.url)) { vistos.add(u.url); fontes.push({ id, ...u }); }
    }
    const custo = Math.round(custoAcum * 10000) / 10000;   // v2.6: soma cada chamada pelo preço do seu modelo
    const auto = !REVISAO_HUMANA;   // v1.1: publicação automática (decisão do Thiago); a verificação fica só como registro
    // v1.4: na publicação automática, a frase com lacuna ("[verificar ...]") não vai para a página; o original fica em "gerado"
    const pars0 = auto && !MANTER_LACUNAS ? semLacunas(gerado.paragrafos) : gerado.paragrafos;
    const texto = { chapeu: gerado.chapeu ?? "Scanner", titulo: auto ? semFormulasVetadas(gerado.titulo) : gerado.titulo,
      linha_fina: auto ? semFormulasVetadas(gerado.linha_fina) : gerado.linha_fina,
      paragrafos: auto && Array.isArray(pars0) ? pars0.map(semFormulasVetadas).filter(Boolean) : pars0 };
    const linha = { tipo: "scanner", data_ref: iso(hoje), situacao: auto ? "publicada" : "rascunho", gerado, fontes, contexto: ctx, verificacoes, verificacao_ok: ok,
      publicacao_automatica: auto, texto_aprovado: auto ? texto : null, aprovado_em: auto ? new Date().toISOString() : null,
      aprovador_nome: auto ? "Publicação automática" : null, editado: auto ? false : null,
      gerado_por_ia: true, modelo: r.modelo, prompt_versao: PROMPT_VERSAO, prompt_sha256: sha, instrucao_extra: corpo.instrucao ?? null,
      origem_id: corpo.devolvida ? Number(corpo.devolvida) : null, tokens_entrada: ent, tokens_saida: sai, custo_usd: custo };
    Object.assign(resumo, { titulo: gerado.titulo, publicado: auto, verificacao_ok: ok, reprovacoes: verificacoes.filter((c) => !c.ok && c.bloqueia).map((c) => c.checagem),
      modelo: r.modelo, custo_usd: custo });
    if (corpo.so_teste) { resumo.rascunho = { gerado, verificacoes, fontes }; return Response.json(resumo); }
    const camposOk = Array.isArray(gerado.paragrafos) && (gerado.paragrafos as unknown[]).length > 0 && String(gerado.titulo ?? "").trim();
    if (auto && !camposOk) throw new Error(`o agente não entregou título e parágrafos: nada publicado (campos recebidos: ${Object.entries(gerado).map(([k, v]) => `${k}=${Array.isArray(v) ? "lista" + (v as unknown[]).length : typeof v}`).join(", ")})`);
    if (auto) {                      // o Scanner publicado antes, no mesmo dia, passa a "substituído"
      const r = await fetch(`${base()}/vm_materias?tipo=eq.scanner&data_ref=eq.${iso(hoje)}&situacao=eq.publicada`,
        { method: "PATCH", body: JSON.stringify({ situacao: "substituida" }), headers: cab({ Prefer: "return=minimal" }) });
      if (!r.ok) throw new Error(`não foi possível substituir o Scanner anterior (${r.status})`);
    }
    const gravada = await pgPost("vm_materias", [linha], "return=representation") as { id: number }[];
    resumo.id = gravada?.[0]?.id;
    await pgPost("vm_coletas", [{ coletor: "scanner-do-dia", situacao: "ok", novos: 1, detalhe: resumo, erro: null }]);
    return Response.json(resumo);
  } catch (e) {
    resumo.erro = String((e as Error).message ?? e);
    try { if (!corpo.so_teste) await pgPost("vm_coletas", [{ coletor: "scanner-do-dia", situacao: "erro", novos: 0, detalhe: null, erro: resumo.erro }]); } catch (_) { /* sem registro */ }
    return Response.json(resumo, { status: 500 });
  }
}

Deno.serve(tratar);
