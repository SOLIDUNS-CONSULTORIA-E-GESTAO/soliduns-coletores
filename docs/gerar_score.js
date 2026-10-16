// Proposta de metodologia — Score Exponencial SOLIDUNS (Radar de Ações Exponenciais) — v0.1 para aprovação
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
  HeadingLevel, BorderStyle, LevelFormat, Footer, Header, PageNumber, TabStopType } = require('docx');

const OURO = 'C9A227', PRETO = '111111', CINZA = '555555', CLARO = 'F4F1E6';
const FONTE = 'Calibri';
const logo = fs.readFileSync('/home/claude/v120/pac128/assets/soliduns-logo-dbbcf92044.png');

// {x} -> "x" em negrito (elemento matemático); **x** -> negrito
function runs(t, base = {}) {
  const out = [];
  t.split(/(\{[^}]+\}|\*\*[^*]+\*\*)/).forEach(p => {
    if (!p) return;
    if (p.startsWith('{')) out.push(new TextRun({ text: '"' + p.slice(1, -1) + '"', bold: true, ...base }));
    else if (p.startsWith('**')) out.push(new TextRun({ text: p.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: p, ...base }));
  });
  return out;
}
const P = (t, o = {}) => new Paragraph({ children: runs(t), alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 300 }, ...o });
const H1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], keepNext: true, keepLines: true, pageBreakBefore: true });
const H2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)], keepNext: true, keepLines: true });
const H3 = t => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)], keepNext: true, keepLines: true });
const B = (t, nivel = 0) => new Paragraph({ numbering: { reference: 'marcas', level: nivel }, children: runs(t), alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 280 } });
const N = (t, ref = 'numeros') => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 280 } });
// fórmula + leitura matemática + frase simples (sempre juntas na mesma página)
function F(formula, leitura, simples) {
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, keepLines: true, spacing: { before: 120, after: 80 },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: CLARO },
      children: [new TextRun({ text: formula, font: 'Cambria Math', size: 24 })] }),
    new Paragraph({ keepNext: true, keepLines: true, alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 276 },
      children: [new TextRun({ text: 'Leitura: ', bold: true, color: CINZA, size: 20 }), ...runs(leitura, { size: 20, color: CINZA })] }),
    new Paragraph({ keepLines: true, alignment: AlignmentType.JUSTIFIED, spacing: { after: 160, line: 276 },
      children: [new TextRun({ text: 'Em linguagem simples: ', bold: true, color: CINZA, size: 20 }), ...runs(simples, { size: 20, color: CINZA, italics: true })] }),
  ];
}
const borda = { style: BorderStyle.SINGLE, size: 4, color: 'BFB8A3' };
function tabela(cab, linhas, larguras) {
  const total = larguras.reduce((a, b) => a + b, 0);
  const cel = (t, i, topo) => new TableCell({ width: { size: larguras[i], type: WidthType.DXA },
    shading: topo ? { type: ShadingType.CLEAR, color: 'auto', fill: PRETO } : undefined,
    borders: { top: borda, bottom: borda, left: borda, right: borda }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: runs(String(t), topo ? { bold: true, color: 'FFFFFF', size: 19 } : { size: 19 }) , keepNext: true })] });
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: larguras,
    rows: [new TableRow({ tableHeader: true, cantSplit: true, children: cab.map((c, i) => cel(c, i, true)) }),
      ...linhas.map(l => new TableRow({ cantSplit: true, children: l.map((c, i) => cel(c, i, false)) }))] });
}
const espaco = () => new Paragraph({ children: [], spacing: { after: 80 } });

// ------------------------------------------------------------------ conteúdo
const capa = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1400, after: 400 },
    children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 170, height: 174 } })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'SCORE EXPONENCIAL', bold: true, size: 52, color: PRETO, font: FONTE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'Radar de Ações Exponenciais · Fusion Analysis SOLIDUNS', size: 26, color: OURO })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Proposta de metodologia — versão 0.1', size: 24, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Documento para aprovação do Dr. Thiago Viegas', size: 22, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Brasília, 16 de outubro de 2026', size: 22, color: CINZA })] }),
];

const corpo = [
  H1('1. Objetivo'),
  P('O **Score Exponencial** é uma nota de 0 a 100 que ordena as ações da bolsa brasileira pela combinação de quatro forças: o preço em tendência, empresas sólidas, crescimento que acelera e sinais que concordam entre si, com risco controlado.'),
  P('A nota serve para **ordenar e filtrar**. Ela não é recomendação de compra ou venda e a tela do Radar continua mostrando esse aviso. O objetivo de desenho é aumentar a chance de as ações do topo do ranking terem desempenho melhor que o Ibovespa nos 6 meses seguintes, e medir isso com transparência (capítulo 8).'),
  H2('Princípios'),
  B('**Só dados oficiais e verificáveis:** preços da B3, demonstrações entregues à CVM e índices da B3. Nada calculado na página do assinante.'),
  B('**Sem olhar o futuro:** cada dado entra no cálculo só a partir da data em que ficou público (por exemplo, o balanço entra na data de entrega à CVM, não na data de fechamento do trimestre).'),
  B('**Comparação justa:** cada indicador vira uma posição relativa (percentil) entre as ações elegíveis do dia; indicadores de valor e de endividamento são comparados dentro do mesmo setor.'),
  B('**Pesos definidos antes do teste:** os pesos desta proposta são fixados agora e só mudam numa nova versão da metodologia, com o teste histórico refeito. Isso evita ajustar a nota ao passado.'),
  B('**Versão registrada:** cada ranking publicado grava a versão da metodologia (coluna metodologia_versao, já prevista no banco).'),

  H1('2. Visão geral'),
  P('O Score é formado por quatro pilares. Cada pilar reúne de três a cinco subitens. Cada subitem recebe uma nota de 0 a 100 e o pilar é a média ponderada dos seus subitens.'),
  espaco(),
  tabela(['Pilar', 'Peso', 'O que mede', 'Subitens'], [
    ['1. Momentum técnico', '30%', 'Se o preço está em tendência de alta e mais forte que o mercado', '5'],
    ['2. Fundamentos', '30%', 'Rentabilidade, qualidade do lucro, solidez e preço justo frente ao setor', '4'],
    ['3. Aceleração', '20%', 'Se o crescimento de receita e de lucro está acelerando (o lado "exponencial")', '4'],
    ['4. Confluência e risco', '20%', 'Se os sinais concordam e se o risco e a liquidez são aceitáveis', '4 + alertas'],
  ], [2300, 900, 4300, 1500]),
  espaco(),
  P('Na tela do Radar, os nomes atuais dos quadros (Momentum técnico, Fundamentos, Confluência e Score Exponencial) continuam. A única mudança visual prevista é mostrar o pilar **Aceleração** junto com os outros três. É um ajuste pequeno, que entra numa versão futura do site.'),
  H2('Fórmula geral'),
  ...F('S = 0,30·M + 0,30·F + 0,20·A + 0,20·C − Pen',
    '{S} é igual a {0,30} vezes {M}, mais {0,30} vezes {F}, mais {0,20} vezes {A}, mais {0,20} vezes {C}, menos {Pen}; onde {M}, {F}, {A} e {C} são as notas de 0 a 100 dos pilares Momentum, Fundamentos, Aceleração e Confluência, e {Pen} é a soma das penalidades por alertas. O resultado é limitado ao intervalo de {0} a {100}.',
    'a nota final é a soma ponderada das quatro notas de pilar, com desconto quando a empresa tem algum sinal de alerta.'),
  ...F('Pilar = Σ wₖ · sₖ ,  com Σ wₖ = 1',
    'o {Pilar} é igual à soma, para cada subitem {k}, do peso {wₖ} vezes a nota {sₖ}; a soma de todos os pesos {wₖ} é igual a {1}.',
    'dentro de cada pilar, cada subitem pesa de acordo com a sua importância, e os pesos somam 100%.'),
  H2('Faixas de leitura'),
  tabela(['Faixa', 'Nome na tela', 'Leitura'], [
    ['80 a 100', 'Exponencial', 'Os quatro pilares fortes ao mesmo tempo'],
    ['60 a 79', 'Forte', 'Maioria dos pilares acima da média'],
    ['40 a 59', 'Neutro', 'Sinais mistos'],
    ['0 a 39', 'Fraco', 'Pilares abaixo da média ou alertas'],
  ], [1700, 2000, 5300]),

  H1('3. Normalização'),
  P('Os indicadores têm escalas diferentes (porcentagem, múltiplos, dias). Para somá-los, cada um vira uma **nota de posição**: a porcentagem de ações elegíveis que ficaram abaixo dela naquele dia.'),
  ...F('xₖ* = min(max(xₖ, q₁), q₉₉)',
    'o valor ajustado {xₖ*} é igual ao mínimo entre o máximo de {xₖ} e {q₁}, e {q₉₉}; onde {q₁} e {q₉₉} são os percentis {1} e {99} do indicador entre as ações do dia.',
    'valores extremos (erros de dado, saltos isolados) são aparados nas pontas para não distorcer a nota.'),
  ...F('sₖ = 100 · (posição de xₖ* − 1) / (N − 1)',
    'a nota {sₖ} é igual a {100} vezes a posição de {xₖ*} na ordem crescente menos {1}, dividido por {N} menos {1}; onde {N} é o número de ações elegíveis com o dado.',
    'a ação com o melhor valor do dia recebe 100, a pior recebe 0, e as outras ficam no meio, na ordem.'),
  P('Nos indicadores em que **menor é melhor** (endividamento, valuation, volatilidade, queda máxima), a ordem é invertida antes da nota. Valuation e endividamento são comparados **dentro do setor** da B3, porque um banco e uma varejista não têm múltiplos comparáveis.'),
  H2('Dados faltantes'),
  B('**Redistribuição:** se faltar um subitem, o peso dele é dividido entre os outros subitens do mesmo pilar.'),
  B('**Mínimo de dados:** a ação só recebe Score se tiver pelo menos 70% do peso total com dado. Abaixo disso, aparece como "dados insuficientes".'),

  H1('4. Pilar 1 — Momentum técnico'),
  P('Peso **30%** no Score. Mede se o preço está em tendência de alta e mais forte que o mercado. É o fator com mais evidência acadêmica de persistência no médio prazo (Jegadeesh e Titman, 1993; George e Hwang, 2004).'),
  tabela(['Subitem', 'Peso no pilar', 'Fonte'], [
    ['1.1 Momentum de 12 meses sem o último mês', '35%', 'B3 COTAHIST (fechamento ajustado)'],
    ['1.2 Força relativa contra o Ibovespa (6 meses)', '20%', 'B3 COTAHIST e B3 Índices'],
    ['1.3 Tendência pela média de 200 pregões', '20%', 'B3 COTAHIST'],
    ['1.4 Proximidade da máxima de 52 semanas', '15%', 'B3 COTAHIST'],
    ['1.5 Confirmação pelo volume', '10%', 'B3 COTAHIST (volume financeiro)'],
  ], [4800, 1500, 2700]),
  H3('1.1 Momentum de 12 meses sem o último mês'),
  ...F('R₁₂₋₁ = Pₜ₋₂₁ / Pₜ₋₂₅₂ − 1',
    '{R₁₂₋₁} é igual ao preço {P} no pregão {t − 21} dividido pelo preço {P} no pregão {t − 252}, menos {1}; onde {t} é o pregão de hoje.',
    'quanto a ação subiu nos últimos 12 meses, sem contar o último mês (o último mês costuma devolver parte da alta e atrapalha a leitura).'),
  H3('1.2 Força relativa contra o Ibovespa'),
  ...F('FR = (1 + Rₐ,₁₂₆) / (1 + R_IBOV,₁₂₆) − 1',
    '{FR} é igual a {1} mais o retorno da ação {Rₐ} em {126} pregões, dividido por {1} mais o retorno do Ibovespa {R_IBOV} nos mesmos {126} pregões, menos {1}.',
    'quanto a ação andou melhor ou pior que o Ibovespa nos últimos 6 meses.'),
  H3('1.3 Tendência pela média de 200 pregões'),
  ...F('T = 0,7 · (Pₜ / MM₂₀₀ − 1) + 0,3 · (MM₂₀₀,ₜ / MM₂₀₀,ₜ₋₂₁ − 1)',
    '{T} é igual a {0,7} vezes o preço de hoje {Pₜ} dividido pela média móvel de {200} pregões {MM₂₀₀}, menos {1}; mais {0,3} vezes a média {MM₂₀₀} de hoje dividida pela média {MM₂₀₀} de {21} pregões atrás, menos {1}.',
    'premia a ação que está acima da sua média longa e cuja média longa está subindo.'),
  H3('1.4 Proximidade da máxima de 52 semanas'),
  ...F('M52 = Pₜ / máx(Pₜ₋₂₅₁ … Pₜ)',
    '{M52} é igual ao preço de hoje {Pₜ} dividido pelo maior preço {máx} entre os pregões {t − 251} e {t}.',
    'quanto mais perto da máxima do último ano, melhor; ações perto da máxima tendem a continuar subindo mais do que se espera.'),
  H3('1.5 Confirmação pelo volume'),
  ...F('V = média(Vol, 21) / média(Vol, 126)',
    '{V} é igual à média do volume financeiro {Vol} dos últimos {21} pregões dividida pela média do volume {Vol} dos últimos {126} pregões.',
    'alta com volume crescente é mais confiável do que alta com pouco negócio.'),

  H1('5. Pilar 2 — Fundamentos'),
  P('Peso **30%** no Score. Mede se a empresa ganha dinheiro de forma sólida e se o preço da ação é razoável frente ao setor. Dados das demonstrações entregues à CVM (DFP anual e ITR trimestral, dados abertos), sempre nos últimos 12 meses.'),
  tabela(['Subitem', 'Peso no pilar', 'Fonte'], [
    ['2.1 Rentabilidade (ROE e ROIC)', '30%', 'CVM DFP/ITR'],
    ['2.2 Qualidade do lucro (margem e caixa)', '20%', 'CVM DFP/ITR'],
    ['2.3 Solidez financeira', '25%', 'CVM DFP/ITR'],
    ['2.4 Preço relativo ao setor', '25%', 'CVM DFP/ITR, B3 COTAHIST e setor B3'],
  ], [4800, 1500, 2700]),
  H3('2.1 Rentabilidade'),
  ...F('ROE = LL₁₂ / PL̄   e   ROIC = EBIT₁₂ · (1 − 0,34) / (PL̄ + DL̄)',
    '{ROE} é igual ao lucro líquido dos últimos 12 meses {LL₁₂} dividido pelo patrimônio líquido médio {PL̄}; {ROIC} é igual ao {EBIT₁₂} vezes {1} menos {0,34}, dividido pela soma do patrimônio líquido médio {PL̄} com a dívida líquida média {DL̄}. A nota do subitem é a média das notas de {ROE} e de {ROIC}.',
    'quanto a empresa lucra sobre o dinheiro dos sócios e sobre todo o capital que usa, já descontado o imposto.'),
  H3('2.2 Qualidade do lucro'),
  ...F('Q = 0,5 · nota(Margem EBITDA) + 0,5 · nota(FCO₁₂ / LL₁₂)',
    '{Q} é igual a {0,5} vezes a nota da margem {EBITDA}, mais {0,5} vezes a nota da razão entre o fluxo de caixa operacional {FCO₁₂} e o lucro líquido {LL₁₂}, ambos dos últimos 12 meses.',
    'lucro bom é lucro que vira caixa; a empresa que lucra no papel mas não gera caixa perde pontos.'),
  H3('2.3 Solidez financeira'),
  ...F('Sol = 0,6 · nota_inv(DL / EBITDA₁₂) + 0,4 · nota(EBIT₁₂ / DF₁₂)',
    '{Sol} é igual a {0,6} vezes a nota invertida da dívida líquida {DL} dividida pelo {EBITDA₁₂}, mais {0,4} vezes a nota do {EBIT₁₂} dividido pelas despesas financeiras {DF₁₂}.',
    'empresa pouco endividada e que paga os juros com folga recebe nota alta. Para bancos e seguradoras, que têm balanço diferente, este subitem usa o índice de Basileia ou é redistribuído.'),
  H3('2.4 Preço relativo ao setor'),
  ...F('Val = 0,5 · nota_inv(EV / EBITDA₁₂) + 0,5 · nota_inv(P / L)',
    '{Val} é igual a {0,5} vezes a nota invertida de {EV} sobre {EBITDA₁₂}, mais {0,5} vezes a nota invertida do preço sobre o lucro {P / L}; as duas notas são calculadas entre as empresas do mesmo setor da B3.',
    'entre empresas parecidas, a que custa menos pelo que lucra ganha mais pontos. Lucro negativo recebe a nota mais baixa no P/L.'),

  H1('6. Pilar 3 — Aceleração'),
  P('Peso **20%** no Score. É o pilar que dá o sentido de **exponencial**: não basta crescer, o crescimento precisa estar ganhando velocidade. Dados trimestrais da CVM (ITR), sempre comparando 12 meses com os 12 meses anteriores, para tirar o efeito das estações do ano.'),
  tabela(['Subitem', 'Peso no pilar', 'Fonte'], [
    ['3.1 Crescimento da receita', '30%', 'CVM ITR'],
    ['3.2 Aceleração da receita', '30%', 'CVM ITR'],
    ['3.3 Crescimento do lucro operacional', '20%', 'CVM ITR'],
    ['3.4 Alavancagem operacional', '20%', 'CVM ITR'],
  ], [4800, 1500, 2700]),
  H3('3.1 Crescimento da receita'),
  ...F('g = Rec₁₂(q) / Rec₁₂(q − 4) − 1',
    '{g} é igual à receita dos últimos 12 meses {Rec₁₂} no trimestre {q} dividida pela receita dos 12 meses {Rec₁₂} quatro trimestres antes {q − 4}, menos {1}.',
    'quanto a receita cresceu em um ano.'),
  H3('3.2 Aceleração da receita'),
  ...F('Δg = g(q) − g(q − 1)',
    '{Δg} é igual ao crescimento {g} no trimestre {q} menos o crescimento {g} no trimestre anterior {q − 1}.',
    'se o crescimento deste trimestre foi maior que o do anterior, a empresa está acelerando; é a "segunda derivada" do negócio.'),
  H3('3.3 Crescimento do lucro operacional'),
  ...F('gₑ = EBIT₁₂(q) / EBIT₁₂(q − 4) − 1',
    '{gₑ} é igual ao {EBIT₁₂} no trimestre {q} dividido pelo {EBIT₁₂} quatro trimestres antes {q − 4}, menos {1}. Quando o {EBIT₁₂} anterior é negativo ou próximo de zero, o subitem é redistribuído.',
    'quanto o lucro da operação cresceu em um ano.'),
  H3('3.4 Alavancagem operacional'),
  ...F('AO = gₑ / g   (só quando g > 0)',
    '{AO} é igual a {gₑ} dividido por {g}, calculado apenas quando {g} é maior que {0}.',
    'se o lucro cresce mais rápido que a receita, cada real a mais vendido sobra mais no caixa: sinal de negócio que ganha escala.'),

  H1('7. Pilar 4 — Confluência e risco'),
  P('Peso **20%** no Score. Mede se os sinais apontam na mesma direção e se o risco e a liquidez permitem que o investidor entre e saia da posição. Inclui os **alertas**, que descontam pontos da nota final.'),
  tabela(['Subitem', 'Peso no pilar', 'Fonte'], [
    ['4.1 Concordância entre os pilares', '35%', 'Cálculo do próprio Score'],
    ['4.2 Volatilidade (quanto menor, melhor)', '25%', 'B3 COTAHIST'],
    ['4.3 Queda máxima em 12 meses (quanto menor, melhor)', '20%', 'B3 COTAHIST'],
    ['4.4 Liquidez', '20%', 'B3 COTAHIST (volume financeiro)'],
  ], [4800, 1500, 2700]),
  H3('4.1 Concordância entre os pilares'),
  ...F('Conc = 100 − 2 · dp(M, F, A)',
    '{Conc} é igual a {100} menos {2} vezes o desvio-padrão {dp} das notas dos pilares {M}, {F} e {A}; o resultado é limitado entre {0} e {100}.',
    'quando os três pilares dão notas parecidas, os sinais concordam e a nota é alta; quando um diz "ótimo" e outro diz "fraco", a nota cai.'),
  H3('4.2 Volatilidade'),
  ...F('σ = dp(rᵢ, 63) · √252',
    '{σ} é igual ao desvio-padrão {dp} dos retornos diários {rᵢ} dos últimos {63} pregões, vezes a raiz quadrada de {252}.',
    'mede o quanto o preço sacode; ações que sacodem menos para o mesmo ganho recebem nota maior.'),
  H3('4.3 Queda máxima em 12 meses'),
  ...F('QM = máx (1 − Pᵢ / máx(P₀ … Pᵢ)) ,  i em 252 pregões',
    '{QM} é igual ao maior valor, ao longo dos últimos {252} pregões, de {1} menos o preço {Pᵢ} dividido pelo maior preço já alcançado até o pregão {i}.',
    'a maior queda que a ação teve, do pico até o fundo, no último ano.'),
  H3('4.4 Liquidez'),
  ...F('L = log₁₀(média(VolFin, 63))',
    '{L} é igual ao logaritmo na base {10} da média do volume financeiro {VolFin} dos últimos {63} pregões.',
    'ações muito negociadas são mais fáceis de comprar e vender sem mexer no preço; o logaritmo evita que as gigantes dominem a nota.'),
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Alertas (penalidades)')], keepNext: true, pageBreakBefore: true }),
  P('Os alertas são lidos dos documentos da CVM e descontam pontos da nota final. Cada alerta vem escrito na coluna **sinais** do ranking, para o assinante ver o motivo.'),
  tabela(['Alerta', 'Desconto', 'Fonte'], [
    ['Pedido de recuperação judicial ou extrajudicial', 'retira do ranking', 'CVM (fato relevante)'],
    ['Parecer do auditor com ressalva ou abstenção', '− 15 pontos', 'CVM DFP'],
    ['Demonstração reapresentada nos últimos 12 meses', '− 10 pontos', 'CVM DFP/ITR'],
    ['Atraso na entrega do ITR ou da DFP', '− 10 pontos', 'CVM (data de entrega)'],
    ['Patrimônio líquido negativo', '− 20 pontos', 'CVM DFP/ITR'],
  ], [4800, 1700, 2500]),

  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('8. Confiabilidade')], keepNext: true, spacing: { before: 400 } }),
  P('Nenhuma nota garante resultado. O que dá para fazer é **medir, com dados do passado, se a nota funcionaria**, e só publicar se ela passar nos critérios abaixo. O teste é feito antes da primeira publicação e refeito a cada nova versão.'),
  H2('Como o teste é feito'),
  N('**Reconstrução mês a mês:** o Score é recalculado no último pregão de cada mês, de janeiro de 2016 até hoje, usando só o que era público em cada data.'),
  N('**Comparação com o futuro de cada data:** a nota de cada mês é comparada com o retorno de cada ação nos 3, 6 e 12 meses seguintes.'),
  N('**Período guardado:** os últimos 24 meses ficam fora do ajuste e servem só para conferir o resultado final.'),
  N('**Custos incluídos:** o teste desconta 0,30% por troca de ação na carteira do topo, para o resultado não ficar otimista demais.'),
  H2('Medidas e critérios de aprovação'),
  ...F('IC = correlação de postos (Sᵢ, Retᵢ,₆ₘ)',
    'o {IC} é a correlação de Spearman entre os postos do Score {Sᵢ} de cada ação {i} numa data e os postos do retorno {Retᵢ,₆ₘ} da mesma ação nos {6} meses seguintes; calcula-se um {IC} por mês e depois a média.',
    'mede se as ações com nota maior de fato andaram melhor depois; 0 é sorte pura, valores acima de 0,05 são considerados bons em estudos de fatores.'),
  tabela(['Medida', 'Critério para publicar'], [
    ['IC médio de 6 meses', 'maior que 0,04, com estatística t maior que 2'],
    ['Quintil do topo contra o Ibovespa', 'à frente em pelo menos 55% das janelas de 6 meses'],
    ['Diferença entre o quintil do topo e o de baixo', 'positiva no período guardado'],
    ['Troca mensal da carteira do topo', 'abaixo de 40%'],
  ], [4300, 4700]),
  P('Se algum critério falhar, a tela segue com "Ranking em calibração" e a proposta volta com os resultados para revisão dos pesos (nova versão).'),

  H1('9. Dados e rotina'),
  H2('Fontes'),
  B('**Preços:** B3 COTAHIST. O banco já tem o histórico recente; para o teste desde 2016 é preciso baixar os arquivos anuais da B3 (públicos).'),
  B('**Ibovespa:** B3 Índices, já coletado pelo robô de fechamento.'),
  B('**Demonstrações:** CVM, Portal de Dados Abertos (DFP e ITR, com a data de entrega de cada documento).'),
  B('**Alertas:** CVM, consulta de documentos e fatos relevantes, já coletados pelo robô da CVM.'),
  B('**Setor:** classificação setorial da B3.'),
  H2('Universo de ações'),
  B('**Liquidez mínima:** volume financeiro médio de 63 pregões acima de R$ 1 milhão por dia.'),
  B('**Histórico mínimo:** pelo menos 252 pregões negociados.'),
  B('**Uma classe por empresa:** quando a empresa tem ON e PN, entra só a mais líquida, para a mesma empresa não ocupar duas posições.'),
  H2('Rotina'),
  B('**Preços e Momentum:** todo dia útil, depois do robô da B3 (22h20).'),
  B('**Fundamentos e Aceleração:** quando a CVM recebe um novo ITR ou DFP.'),
  B('**Publicação:** ranking novo toda segunda-feira às 07h00, com a prévia para o administrador desde domingo.'),
  H2('Mercado americano'),
  P('A mesma estrutura vale para os EUA, com preços de uma fonte a definir e demonstrações da SEC (EDGAR, dados públicos). Essa parte entra numa segunda etapa, depois da versão brasileira aprovada.'),

  H1('10. Decisões para aprovar'),
  P('Para começar a programar o robô do Score, preciso da sua aprovação nestes pontos:'),
  N('**Pesos dos pilares:** 30% Momentum, 30% Fundamentos, 20% Aceleração e 20% Confluência e risco.', 'numeros2'),
  N('**Pilar Aceleração:** entrar como quarto pilar na tela, ao lado dos outros três.', 'numeros2'),
  N('**Horizonte do teste:** 6 meses como horizonte principal (3 e 12 meses como conferência).', 'numeros2'),
  N('**Universo:** liquidez mínima de R$ 1 milhão por dia e uma classe de ação por empresa.', 'numeros2'),
  N('**Publicação:** semanal, às segundas-feiras, só depois de o teste histórico passar nos critérios do capítulo 8.', 'numeros2'),
  P('Com a aprovação, a ordem do trabalho é: baixar o histórico de preços e das demonstrações da CVM, programar o cálculo, rodar o teste histórico e trazer o relatório de resultados antes de qualquer publicação.'),
];

const doc = new Document({
  creator: 'SOLIDUNS', title: 'Score Exponencial — proposta de metodologia v0.1',
  styles: {
    default: { document: { run: { font: FONTE, size: 22, color: '222222' } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, color: PRETO, font: FONTE }, paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: OURO, space: 6 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, color: OURO, font: FONTE }, paragraph: { spacing: { before: 260, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, color: PRETO, font: FONTE }, paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 2 } },
    ] },
  numbering: { config: [
    { reference: 'marcas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
      { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 900, hanging: 270 } } } }] },
    { reference: 'numeros2', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
    { reference: 'numeros', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
  ] },
  sections: [
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1450, right: 1450 } } }, children: capa },
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1450, right: 1450 } } },
      headers: { default: new Header({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: OURO, space: 4 } },
        children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 26, height: 27 } }),
          new TextRun({ text: '   SOLIDUNS · Score Exponencial', size: 17, color: CINZA }), new TextRun({ text: '\tProposta v0.1 — para aprovação', size: 17, color: CINZA })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Página ', size: 17, color: CINZA }), new TextRun({ children: [PageNumber.CURRENT], size: 17, color: CINZA }),
          new TextRun({ text: '  ·  Uso interno. Não é recomendação de investimento.', size: 17, color: CINZA })] })] }) },
      children: corpo.map((x, i) => (i === 0 && x instanceof Paragraph) ? x : x) },
  ],
});
// o primeiro H1 do corpo não precisa de quebra (já começa em seção nova)
Packer.toBuffer(doc).then(b => { fs.writeFileSync('/home/claude/v131/score/Score_Exponencial_proposta_v0.1.docx', b); console.log('ok', b.length); });
