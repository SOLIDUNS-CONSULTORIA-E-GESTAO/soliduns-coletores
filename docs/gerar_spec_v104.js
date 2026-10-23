// Score Exponencial SOLIDUNS — Especificação operacional dos subitens v1.0.4 — 22/10/2026
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
  HeadingLevel, BorderStyle, LevelFormat, Footer, Header, PageNumber, TabStopType } = require('docx');

const QUE = new Set(fs.existsSync(__dirname + '/score_v104_quebras.json') ? JSON.parse(fs.readFileSync(__dirname + '/score_v104_quebras.json', 'utf8')) : []);
const OURO = 'C9A227', PRETO = '111111', CINZA = '555555', CLARO = 'F4F1E6';
const FONTE = 'Calibri';
const logo = fs.readFileSync('' + __dirname + '/../site/publicar/assets/soliduns-logo-dbbcf92044.png');

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
const H1 = (t, quebra = true) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], keepNext: true, keepLines: true, pageBreakBefore: quebra || QUE.has(t), spacing: quebra ? undefined : { before: 360 } });
const H2 = (t, quebra = false) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)], keepNext: true, keepLines: true, pageBreakBefore: quebra || QUE.has(t) });
const H3 = t => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)], keepNext: true, keepLines: true, pageBreakBefore: QUE.has(t) });
const B = (t, nivel = 0) => new Paragraph({ numbering: { reference: 'marcas', level: nivel }, children: runs(t), alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 280 } });
const N = (t, ref = 'numeros') => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 280 } });
// fórmula + leitura matemática + frase simples (sempre juntas na mesma página)
function F(formula, leitura, simples) {
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, keepLines: true, spacing: { before: 120, after: 80 },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: CLARO },
      children: formula.split('\n').map((t, i) => new TextRun({ text: t, font: 'Cambria Math', size: 24, break: i ? 1 : 0 })) }),
    new Paragraph({ keepNext: true, keepLines: true, alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 276 },
      children: [new TextRun({ text: 'Leitura: ', bold: true, color: CINZA, size: 20 }), ...runs(leitura, { size: 20, color: CINZA })] }),
    new Paragraph({ keepLines: true, alignment: AlignmentType.JUSTIFIED, spacing: { after: 160, line: 276 },
      children: [new TextRun({ text: 'Em linguagem simples: ', bold: true, color: CINZA, size: 20 }), ...runs(simples, { size: 20, color: CINZA, italics: true })] }),
  ];
}
const borda = { style: BorderStyle.SINGLE, size: 4, color: 'BFB8A3' };
function tabela(cab, linhas, larguras, junta = true) {
  const total = larguras.reduce((a, b) => a + b, 0);
  const cel = (t, i, topo, ultima = false) => new TableCell({ width: { size: larguras[i], type: WidthType.DXA },
    shading: topo ? { type: ShadingType.CLEAR, color: 'auto', fill: PRETO } : undefined,
    borders: { top: borda, bottom: borda, left: borda, right: borda }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: runs(String(t), topo ? { bold: true, color: 'FFFFFF', size: 19 } : { size: 19 }) , keepNext: topo || (junta && !ultima) })] });
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: larguras,
    rows: [new TableRow({ tableHeader: true, cantSplit: true, children: cab.map((c, i) => cel(c, i, true)) }),
      ...linhas.map((l, j) => new TableRow({ cantSplit: true, children: l.map((c, i) => cel(c, i, false, j === linhas.length - 1)) }))] });
}
const espaco = () => new Paragraph({ children: [], spacing: { after: 80 } });

// ------------------------------------------------------------------ conteúdo v0.2 — arquitetura e fundamentação
const R = t => new Paragraph({ children: runs(t, { size: 19 }), alignment: AlignmentType.JUSTIFIED, spacing: { after: 40, line: 240 }, indent: { left: 360, hanging: 360 } });

const D = JSON.parse(fs.readFileSync(process.argv[3] || (__dirname + '/score_v104_dados.json'), 'utf8'));
const pc = x => (x * 100).toFixed(0) + '%';
const br = (x, c = 2) => Number(x).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });

const capa = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1400, after: 400 },
    children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 170, height: 174 } })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'SCORE EXPONENCIAL', bold: true, size: 52, color: PRETO, font: FONTE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'Especificação operacional dos 22 subitens', size: 26, color: OURO })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Versão 1.0.4 — aprovada em 22 de outubro de 2026', size: 24, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Radar de Ações Exponenciais · SOLIDUNS', size: 22, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Brasília, 22 de outubro de 2026', size: 22, color: CINZA })] }),
];

const c = [];
// ------------------------------------------------------------------ 1
c.push(H1('1. O que este documento fixa', false));
c.push(P('A metodologia v1.0.3 diz **o que** cada subitem mede e de onde vem. Este documento diz **como** cada um é calculado: a fórmula exata, as contas da CVM usadas e o que fazer quando falta dado.'));
c.push(P('Tudo aqui fica congelado antes do primeiro teste. Este documento faz parte da metodologia v1.0.4. Nenhum teste de desempenho foi rodado: as conferências abaixo só verificam se as contas estão certas.'));
c.push(H2('Decisões aprovadas em 22/10/2026'));
c.push(P('Quase tudo é detalhe de cálculo, sem escolha de mérito. Oito pontos foram decididos pelo Dr. Thiago Viegas:'));
c.push(N('**Crescimento implícito (Molodovsky) — variante B.** Na fórmula registrada, o dividendo cai quando o crescimento sobe: D = E · (1 − g/R). Em ' + pc(D.molo.r_menor_k) + ' dos casos a rentabilidade R fica abaixo da taxa exigida k. Aí crescer destrói valor, e o crescimento implícito vai para o teto de 60% em ' + pc(D.molo.teto_a) + ' dos casos: o subitem perde a capacidade de separar as ações. Decisão: nas fases 1 e 2, usar a distribuição observada da empresa, D = p · E. No teto, ficam só ' + pc(D.molo.teto_b) + ' dos casos.', 'numeros'));
c.push(N('**Concordância entre pilares:** número de pilares, entre Momentum, Qualidade e valor e Momento fundamental, com nota positiva (0 a 3).', 'numeros'));
c.push(N('**Escore de Mohanram com 6 dos 8 testes:** a CVM não traz gasto com pesquisa e desenvolvimento nem com propaganda.', 'numeros'));
c.push(N('**Reapresentações:** os dados abertos da CVM guardam só a última versão de cada documento. Decisão: manter a regra registrada, em que a versão guardada só vale a partir da própria entrega. Aceitar a versão nova desde a primeira entrega aumentaria a cobertura em só ' + br(D.reap.ganho_pp, 1) + ' ponto percentual e traria risco de usar números corrigidos antes da hora (como nos casos de fraude).', 'numeros'));
c.push(N('**Quantidade de ações:** de 2020 em diante, a composição do capital das DFP e ITR; antes, o capital integralizado do Formulário de Referência (FRE). ' + D.escala + ' empresas declaram a composição em milhares de ações, sem avisar; a escala é conferida pelo FRE.', 'numeros'));
c.push(N('**Dados mínimos:** balanço com até 15 meses; surpresa de lucro com pelo menos 4 das 8 diferenças; Piotroski com pelo menos 7 dos 9 testes; Mohanram com pelo menos 4 dos 6.', 'numeros'));
c.push(N('**Lucro do trimestre pela coluna do trimestre:** a DRE do ITR traz o trimestre e o acumulado do ano. O motor usa a coluna do trimestre, porque há erros no acumulado nos dados abertos (exemplo real: Magazine Luiza, 3º trimestre de 2023, acumulado zerado).', 'numeros'));
c.push(N('**Financeiras:** bancos, seguradoras e demais financeiras usam só ROE, crescimento implícito e surpresa de lucro, além dos subitens de preço e risco. Os demais subitens entram com nota zero.', 'numeros'));

// ------------------------------------------------------------------ 2
c.push(H1('2. Regras comuns'));
c.push(H2('O dia do cálculo'));
c.push(B('**Dia t:** último pregão de cada mês.'));
c.push(B('**Fotografia:** para cada período, a última versão da DFP ou do ITR entregue à CVM até o dia t.'));
c.push(B('**Balanço-base:** o período mais recente com lucro de 12 meses calculável, com no máximo 15 meses até o dia t.'));
c.push(B('**Demonstração:** consolidada; se não houver, a individual.'));
c.push(H2('Trimestre e 12 meses'));
c.push(...F('X₁₂ₘ(t) = Xq(t) + Xq(t − 1) + Xq(t − 2) + Xq(t − 3)',
  'o valor {X₁₂ₘ} em 12 meses no trimestre {t} é a soma dos valores trimestrais {Xq} dos 4 últimos trimestres.',
  'receita, lucro e caixa sempre olham para os últimos 12 meses, sem esperar o balanço anual.'));
c.push(B('**Trimestre (Xq):** na DRE do ITR, a coluna do próprio trimestre. Nos demais casos, o acumulado do ano menos os trimestres anteriores do mesmo exercício.'));
c.push(B('**4º trimestre:** valor anual da DFP menos os três primeiros trimestres.'));
c.push(B('**Sem os 4 trimestres:** vale o anual, se o período for o fim do exercício; senão, o período fica sem dado.'));
c.push(H2('Contas usadas'));
c.push(tabela(['Sigla', 'Conta', 'Código CVM'], [
  ['AT', 'Ativo total', '1'], ['AC', 'Ativo circulante', '1.01'], ['Cx', 'Caixa e equivalentes + aplicações financeiras', '1.01.01 + 1.01.02'],
  ['CR', 'Contas a receber (curto prazo)', '1.01.03'], ['Imob', 'Imobilizado', '1.02.03'], ['PC', 'Passivo circulante', '2.01'],
  ['PNC', 'Passivo não circulante', '2.02'], ['EmpCP / EmpLP', 'Empréstimos e financiamentos de curto e de longo prazo', '2.01.04 / 2.02.01'],
  ['PL', 'Patrimônio líquido (pela descrição; bancos usam 2.08)', '2.03'], ['Min', 'Participação dos não controladores', '2.03.09'],
  ['RL + LA', 'Reservas de lucros + lucros ou prejuízos acumulados', '2.03.04 + 2.03.05'],
  ['Rec / LB', 'Receita líquida / lucro bruto', '3.01 / 3.03'], ['SGA', 'Despesas com vendas + gerais e administrativas', '−(3.04.01 + 3.04.02)'],
  ['EBIT', 'Resultado antes do resultado financeiro e dos tributos', '3.05'],
  ['LL / Lc', 'Lucro do período / atribuído à controladora (pela descrição)', '3.11 / 3.11.01'],
  ['CFO', 'Caixa líquido das atividades operacionais', '6.01'], ['Dep', 'Depreciação, amortização e exaustão (DFC)', 'linhas de 6.01.01'],
  ['Capex', 'Aquisição de imobilizado e intangível', 'linhas de 6.02'], ['Div', 'Dividendos e juros sobre capital próprio pagos', 'linhas de 6.03'],
], [1500, 5000, 2500]));
c.push(H2('Valor de mercado e valor da firma'));
c.push(...F('VM(t) = Q_ON · P_ON(t) · c_ON + Q_PN · P_PN(t) · c_PN',
  'o valor de mercado {VM} no dia {t} é a quantidade de ações ordinárias {Q_ON}, sem as de tesouraria, vezes o preço de fechamento da ordinária {P_ON}, vezes a correção {c_ON}; mais o mesmo para as preferenciais {PN}.',
  'cada classe vale a sua quantidade de ações vezes o seu preço. Se uma classe não tem negócio no mês, usa-se o preço da outra.'));
c.push(...F('c = [F(d) / A(d)] / [F(t) / A(t)]',
  'a correção {c} é o fechamento {F} dividido pelo preço ajustado {A} na data {d} da quantidade de ações, dividido pelo mesmo quociente no dia {t}.',
  'se houve desdobramento ou grupamento entre a data da quantidade e o dia do cálculo, a quantidade é corrigida na mesma proporção.'));
c.push(...F('EV = VM + EmpCP + EmpLP − Cx + Min',
  'o valor da firma {EV} é o valor de mercado {VM} mais os empréstimos de curto {EmpCP} e de longo prazo {EmpLP}, menos o caixa e as aplicações {Cx}, mais a participação dos não controladores {Min}.',
  'é o preço da empresa inteira: ações mais dívida, descontado o caixa.'));
c.push(H2('Sem dado e sinal'));
c.push(B('**Sem dado:** subitem sem dado entra com nota zero, a nota da ação típica (regra da v1.0.3).'));
c.push(B('**Sinal:** quando valor menor é melhor (volatilidade, beta, iliquidez, accruals, escore M, giro), o subitem entra com o sinal trocado. A tabela do capítulo 7 resume.'));

// ------------------------------------------------------------------ 3 Pilar 1
c.push(H1('3. Pilar 1 — Momentum de preço', false));
c.push(P('{I} é o índice de retorno total (proventos reinvestidos) e {A} é o preço ajustado por desdobramentos e grupamentos. Os índices são lidos no fim de cada mês.'));
c.push(H3('1. Retorno de 12 meses sem o último'));
c.push(...F('r₁₂₋₁ = I(t − 1) / I(t − 12) − 1', 'o retorno {r₁₂₋₁} é o índice {I} um mês atrás dividido pelo índice 12 meses atrás, menos {1}.', 'quanto a ação rendeu no último ano, sem contar o mês mais recente.'));
c.push(H3('2. Retorno de 7 a 12 meses atrás'));
c.push(...F('r₇₋₁₂ = I(t − 7) / I(t − 12) − 1', 'o retorno {r₇₋₁₂} é o índice {I} 7 meses atrás dividido pelo índice 12 meses atrás, menos {1}.', 'o pedaço mais antigo do último ano.'));
c.push(H3('3. Distância da máxima de 52 semanas'));
c.push(...F('Máx = A(t) / máx[A(t − 251), …, A(t)]', 'a distância {Máx} é o preço ajustado de hoje {A(t)} dividido pelo maior preço ajustado dos últimos {252} pregões.', 'vale 1 quando a ação está na máxima do ano.'));
c.push(H3('4. Qualidade do caminho'));
c.push(...F('Cam = sinal(r₁₂₋₁) · (%altas − %quedas)', 'a qualidade do caminho {Cam} é o sinal do retorno {r₁₂₋₁} vezes a fração de pregões de alta {%altas} menos a fração de pregões de queda {%quedas}, de 12 meses a 1 mês atrás (pelo menos 100 pregões).', 'uma alta feita de muitos dias de alta vale mais que uma alta feita de poucos saltos.'));
c.push(H3('5. Tendência pela média móvel'));
c.push(...F('MM = A(t) / média[A, últimos 200 pregões] − 1', 'a tendência {MM} é o preço ajustado de hoje dividido pela média dos últimos {200} pregões negociados, menos {1}.', 'positivo quando a ação está acima da sua média de 200 pregões.'));
c.push(H3('6. Volume (giro)'));
c.push(...F('Giro = [Σ Vol(últimos 252 pregões) / 252] / VM(t);   subitem = −Giro', 'o {Giro} é o volume financeiro médio diário de todas as classes da empresa nos últimos {252} pregões, dividido pelo valor de mercado {VM}; o subitem usa o sinal trocado.', 'entre ações parecidas, as menos negociadas tendem a estar no começo do ciclo do momentum. Há dado de 2010 em diante.'));

// ------------------------------------------------------------------ 4 Pilar 2
c.push(H1('4. Pilar 2 — Qualidade e valor', false));
c.push(P('Índices com "−12" usam os 12 meses ou o balanço de um ano antes, na mesma fotografia.'));
c.push(H3('7. Escore de Piotroski (9 testes)'));
c.push(...F('F = Σ Fₙ  (n = 1 a 9);  com 7 ou 8 testes disponíveis: F = soma · 9 / n', 'o escore {F} é a soma dos 9 testes {Fₙ}, cada um valendo {1} ou {0}; se só {7} ou {8} testes têm dado, a soma é reescalada para {9}.', 'nove perguntas de sim ou não sobre lucro, caixa, dívida e eficiência.'));
c.push(tabela(['Teste', 'Vale 1 quando'], [
  ['F1 Lucro', 'ROA = LL₁₂ₘ / AT(−12) > 0'], ['F2 Caixa', 'CFO₁₂ₘ > 0'], ['F3 Melhora do ROA', 'ROA > ROA de um ano antes'],
  ['F4 Lucro com caixa', 'CFO₁₂ₘ / AT(−12) > ROA'], ['F5 Dívida', 'EmpLP / AT médio não subiu em 12 meses'],
  ['F6 Liquidez', 'AC / PC subiu em 12 meses'], ['F7 Sem emissão', 'quantidade de ações (corrigida) até 1% maior que 12 meses antes'],
  ['F8 Margem', 'LB / Rec subiu em 12 meses'], ['F9 Giro do ativo', 'Rec₁₂ₘ / AT(−12) subiu em 12 meses'],
], [2800, 6200]));
c.push(H3('8. Rentabilidade bruta sobre o ativo'));
c.push(...F('GP/A = LB₁₂ₘ / AT', 'a rentabilidade bruta {GP/A} é o lucro bruto de 12 meses {LB₁₂ₘ} dividido pelo ativo total {AT}.', 'quanto a empresa gera de lucro bruto para cada real de ativo.'));
c.push(H3('9. Qualidade ampla (QMJ simplificado)', ));
c.push(...F('QMJ = média[Rentabilidade, Crescimento, Segurança]', 'a qualidade {QMJ} é a média de três notas padronizadas no setor e no mês.', 'empresa rentável, que melhora e com pouca dívida.'));
c.push(B('**Rentabilidade:** média das notas de ROE = Lc₁₂ₘ / (PL − Min), ROA = LL₁₂ₘ / AT, CFOA = CFO₁₂ₘ / AT, margem bruta = LB / Rec e GP/A.'));
c.push(B('**Crescimento:** nota de [LB₁₂ₘ − LB₁₂ₘ(−36)] / AT(−36), a melhora do lucro bruto em 3 anos.'));
c.push(B('**Segurança:** nota de −(EmpCP + EmpLP) / AT.'));
c.push(B('**Financeiras:** QMJ = nota do ROE.'));
c.push(H3('10. Lucro que vira caixa (accruals)'));
c.push(...F('Acc = (LL₁₂ₘ − CFO₁₂ₘ) / média[AT, AT(−12)];   subitem = −Acc', 'os {accruals} são o lucro de 12 meses menos o caixa das operações, divididos pelo ativo médio; o subitem usa o sinal trocado.', 'lucro sem caixa correspondente é sinal de alerta.'));
c.push(H3('11. Lucro operacional sobre o valor da firma'));
c.push(...F('EBIT/EV = EBIT₁₂ₘ / EV  (EV > 0)', 'o rendimento operacional é o {EBIT} de 12 meses dividido pelo valor da firma {EV}.', 'é o inverso do múltiplo EV/EBIT: quanto maior, mais barata a empresa.'));
c.push(H3('12. Crescimento implícito no preço (Folga) — variante B'));
c.push(...F('Dₛ = p · Eₛ, se s ≤ 30;   fase 3: E₃₀ · (1 + π) · (1 − π / R) / (k − π)', 'o dividendo {Dₛ} das fases 1 e 2 é a distribuição observada {p} vezes o lucro {Eₛ}; a fase 3 não muda.', 'o preço é comparado com o caminho de lucro, sem supor que a empresa mude a sua política de dividendos.'));
c.push(...F('V(g*) = VM / E₀;   Folga = R · (1 − p) − g*', 'o crescimento implícito {g*} faz o valor {V} igualar o valor de mercado {VM} dividido pelo lucro normal {E₀}; a {Folga} é o crescimento sustentável {R(1 − p)} menos {g*}.', 'positivo quando a empresa consegue crescer, com os próprios recursos, mais do que o preço exige.'));
c.push(tabela(['Parâmetro', 'Cálculo'], [
  ['E₀ (lucro normal)', 'média de Lc₁₂ₘ hoje, um ano antes e dois anos antes'],
  ['R (rentabilidade)', 'média dos três ROE (Lc₁₂ₘ / PL da controladora no fim de cada período), limitada entre 5% e 40%'],
  ['p (distribuição)', 'Σ Div₁₂ₘ / Σ Lc₁₂ₘ nos três períodos, limitada entre 0 e 1'],
  ['π e k', 'Focus do IPCA do ano seguinte; k = juro real da NTN-B mais longa + π + 4 p.p. (registrado)'],
  ['g*', 'bisseção entre −20% e 60%; acima do teto, 60%; E₀ ≤ 0: sem dado'],
], [2400, 6600]));

// ------------------------------------------------------------------ 5 Pilar 3
c.push(H1('5. Pilar 3 — Momento fundamental', false));
c.push(P('{Lq} é o lucro trimestral atribuído à controladora.'));
c.push(H3('13. Surpresa de lucro padronizada'));
c.push(...F('SUE = ΔLq(t) / dp[ΔLq(t), …, ΔLq(t − 7)];   ΔLq(t) = Lq(t) − Lq(t − 4)', 'a surpresa {SUE} é a variação do lucro do trimestre contra o mesmo trimestre do ano anterior {ΔLq}, dividida pelo desvio-padrão {dp} dessa variação nos últimos {8} trimestres (pelo menos {4}).', 'mede se o lucro surpreendeu, comparado com o tamanho normal das variações da empresa.'));
c.push(B('**Por ação:** como numerador e denominador usam a mesma quantidade de ações, o resultado é igual ao do lucro por ação, sem distorção por desdobramento.'));
c.push(H3('14. Melhora do lucro contra o mesmo trimestre do ano anterior'));
c.push(...F('ΔL/A = [Lq(t) − Lq(t − 4)] / AT(−12)', 'a melhora {ΔL/A} é a variação do lucro trimestral contra o mesmo trimestre do ano anterior, dividida pelo ativo de um ano antes.', 'o tamanho da melhora do lucro, em proporção ao tamanho da empresa.'));
c.push(H3('15. Escore de crescimento saudável (Mohanram, 6 testes)'));
c.push(...F('G = Σ Gₙ · 6 / n  (n ≥ 4 testes com dado)', 'o escore {G} é a soma dos testes disponíveis {Gₙ}, reescalada para {6}.', 'seis perguntas de sim ou não que separam o crescimento sólido do crescimento frágil.'));
c.push(tabela(['Teste', 'Vale 1 quando (mediana do setor no mês)'], [
  ['G1 Rentabilidade', 'LL₁₂ₘ / AT médio acima da mediana'], ['G2 Caixa', 'CFO₁₂ₘ / AT médio acima da mediana'],
  ['G3 Caixa acima do lucro', 'CFO₁₂ₘ > LL₁₂ₘ'], ['G4 Lucro estável', 'variância do ROA trimestral (até 16 trimestres, mínimo 8) abaixo da mediana'],
  ['G5 Vendas estáveis', 'variância do crescimento da receita trimestral contra o ano anterior (até 16, mínimo 6) abaixo da mediana'],
  ['G6 Investimento', 'Capex₁₂ₘ / AT(−12) acima da mediana'],
], [2800, 6200]));
c.push(B('**Fora:** pesquisa e desenvolvimento e propaganda (testes 6 e 8 do artigo), que a CVM não traz.'));
c.push(H3('16. Alavancagem operacional (Lev; Thiagarajan)'));
c.push(...F('LT = −{[SGA₁₂ₘ / SGA₁₂ₘ(−12) − 1] − [Rec₁₂ₘ / Rec₁₂ₘ(−12) − 1]}', 'o sinal {LT} é menos a diferença entre o crescimento das despesas de vendas, gerais e administrativas {SGA} e o crescimento da receita {Rec}.', 'despesas crescendo mais que as vendas é mau sinal.'));

// ------------------------------------------------------------------ 6 Pilar 4
c.push(H1('6. Pilar 4 — Risco e confluência', false));
c.push(H3('17. Baixa volatilidade'));
c.push(...F('σ = dp[r(t − 251), …, r(t)] · raiz(252);   subitem = −σ', 'a volatilidade {σ} é o desvio-padrão dos retornos diários {r} dos últimos {252} pregões (pelo menos {150}), anualizado; o subitem usa o sinal trocado.', 'ações que oscilam menos ganham nota maior.'));
c.push(H3('18. Beta baixo'));
c.push(...F('β = cov(rᵢ − r_f, R_m − r_f) / var(R_m − r_f);   subitem = −β', 'o {β} é a covariância entre o retorno da ação acima da taxa livre {rᵢ − r_f} e o retorno do mercado acima da taxa livre {R_m − r_f} do NEFIN, dividida pela variância deste, em {252} pregões (pelo menos {150}).', 'mede quanto a ação amplia os movimentos do mercado.'));
c.push(H3('19. Liquidez (Amihud)'));
c.push(...F('ILLIQ = média[|r| / Vol (R$ milhões)], 63 pregões;   subitem = −ILLIQ', 'a iliquidez {ILLIQ} é a média do retorno absoluto {|r|} dividido pelo volume financeiro {Vol} em milhões de reais, nos últimos {63} pregões.', 'quanto o preço anda para cada milhão negociado.'));
c.push(H3('20. Concordância entre pilares'));
c.push(...F('Conc = nº de pilares com nota positiva entre z_M, z_F e z_A', 'a concordância {Conc} conta quantas das notas dos pilares Momentum {z_M}, Qualidade e valor {z_F} e Momento fundamental {z_A} são maiores que zero; vai de {0} a {3}.', 'premia a ação em que os sinais apontam juntos para cima.'));
c.push(H3('21. Risco de insolvência (EM Score)'));
c.push(...F('EM = 6,56 · X₁ + 3,26 · X₂ + 6,72 · X₃ + 1,05 · X₄ + 3,25', 'como na v1.0.1, com {X₁} = (AC − PC) / AT; {X₂} = (RL + LA) / AT; {X₃} = EBIT₁₂ₘ / AT; {X₄} = PL / (PC + PNC).', 'quanto maior, menor o risco de falência.'));
c.push(H3('22. Indício de manipulação (escore M de Beneish)'));
c.push(...F('M = −4,840 + 0,920·DSRI + 0,528·GMI + 0,404·AQI + 0,892·SGI\n+ 0,115·DEPI − 0,172·SGAI + 4,679·TATA − 0,327·LVGI;   subitem = −M', 'o escore {M} soma os oito índices com os pesos de Beneish (1999); o subitem usa o sinal trocado.', 'quanto maior o M, maior o indício de lucro inflado.'));
c.push(tabela(['Índice', 'Cálculo (hoje contra 12 meses antes)'], [
  ['DSRI', '(CR / Rec₁₂ₘ) ÷ (CR / Rec₁₂ₘ) de 12 meses antes'], ['GMI', 'margem bruta de 12 meses antes ÷ margem bruta de hoje'],
  ['AQI', '[1 − (AC + Imob) / AT] ÷ o mesmo de 12 meses antes'], ['SGI', 'Rec₁₂ₘ ÷ Rec₁₂ₘ de 12 meses antes'],
  ['DEPI', 'taxa de depreciação Dep / (Dep + Imob) de 12 meses antes ÷ a de hoje'], ['SGAI', '(SGA / Rec) ÷ o mesmo de 12 meses antes'],
  ['LVGI', '[(PC + EmpLP) / AT] ÷ o mesmo de 12 meses antes'], ['TATA', '(LL₁₂ₘ − CFO₁₂ₘ) / AT'],
], [1500, 7500]));
c.push(B('**Denominador zero ou sem dado:** o índice vale 1 (neutro), exceto TATA; sem TATA ou sem receita, o escore fica sem dado.'));

// ------------------------------------------------------------------ 7 sinais
c.push(H1('7. Resumo: direção de cada subitem', false));
c.push(tabela(['Nº', 'Subitem', 'Entra no Score como', 'Financeiras'], [
  ['1', 'Retorno 12−1', 'maior é melhor', 'sim'], ['2', 'Retorno 7−12', 'maior é melhor', 'sim'], ['3', 'Distância da máxima', 'maior é melhor', 'sim'],
  ['4', 'Qualidade do caminho', 'maior é melhor', 'sim'], ['5', 'Média móvel', 'maior é melhor', 'sim'], ['6', 'Giro', 'sinal trocado', 'sim'],
  ['7', 'Piotroski', 'maior é melhor', 'não'], ['8', 'GP/A', 'maior é melhor', 'não'], ['9', 'QMJ', 'maior é melhor', 'só ROE'],
  ['10', 'Accruals', 'sinal trocado', 'não'], ['11', 'EBIT/EV', 'maior é melhor', 'não'], ['12', 'Folga', 'maior é melhor', 'sim'],
  ['13', 'SUE', 'maior é melhor', 'sim'], ['14', 'ΔL/A', 'maior é melhor', 'não'], ['15', 'Mohanram', 'maior é melhor', 'não'],
  ['16', 'Lev; Thiagarajan', 'maior é melhor', 'não'], ['17', 'Volatilidade', 'sinal trocado', 'sim'], ['18', 'Beta', 'sinal trocado', 'sim'],
  ['19', 'Amihud', 'sinal trocado', 'sim'], ['20', 'Concordância', 'maior é melhor', 'sim'], ['21', 'EM Score', 'maior é melhor', 'não'],
  ['22', 'Escore M', 'sinal trocado', 'não'],
], [700, 3300, 3000, 2000]));

// ------------------------------------------------------------------ 8 conferência
c.push(H1('8. Conferência à mão'));
c.push(P('Cada número abaixo foi calculado duas vezes: pelo motor e por um cálculo separado, feito direto das contas da DFP de 2024 e dos ITR da CVM, com os preços da B3 de 31/03/2025. Fotografia de março de 2025 (DFP de 2024 já entregue).'));
c.push(H2('Contra o que as empresas divulgaram'));
c.push(tabela(['Empresa', 'Número divulgado', 'Motor'], D.publicados, [2200, 4300, 2500]));
c.push(H2('Motor contra o cálculo separado'));
c.push(tabela(['Ação', 'Item', 'Cálculo separado', 'Motor'], D.conferencia, [1100, 3900, 2000, 2000], false));
c.push(P('Todas as diferenças são zero (até a última casa).'));
c.push(B('**Piotroski, conferido teste a teste:** os 8 testes contábeis dão 3 (Petrobras), 6 (WEG) e 8 (Magazine Luiza). O teste 7, sem emissão de ações, vale 1, 1 e 0: o Magazine Luiza aumentou o capital em R$ 1,25 bi em 2024. Total: 4, 7 e 8, iguais ao motor.'));
c.push(H2('Crescimento implícito: cálculo separado'));
c.push(tabela(['Mês', 'Ação', 'VM / E₀', 'R', 'p', 'k', 'g* fórmula A', 'g* variante B'], D.molo.linhas, [900, 900, 1000, 900, 900, 900, 1250, 1250]));
c.push(P('A Petrobras de junho de 2019 mostra o problema da fórmula registrada: R limitado a 5% e abaixo de k, e o g* vai ao teto de 60%. Na variante B, o g* fica em ' + D.molo.petr2019_b + '.'));

// ------------------------------------------------------------------ 9 cobertura
c.push(H1('9. Cobertura', false));
c.push(P('Percentual das ações elegíveis com o subitem, em dezembro de cada ano. As financeiras ficam sem os subitens que não se aplicam a elas.'));
c.push(tabela(['Ano', 'Ações', 'Piotroski', 'GP/A', 'EBIT/EV', 'Folga B', 'SUE', 'Mohanram', 'EM', 'Escore M', 'Giro'], D.cobertura,
  [700, 700, 900, 800, 900, 900, 700, 1000, 700, 900, 700]));
c.push(B('**2011 a 2013:** ainda sem trimestres e exercícios suficientes (a Folga precisa de 3 anos). O Score completo começa em 2013, como registrado.'));
c.push(H2('Limitações conhecidas'));
c.push(B('**Só a última versão:** os dados abertos da CVM guardam só a última versão de cada documento. Com a regra conservadora, o período fica sem dado entre a primeira entrega e a reapresentação (' + D.reap.lag30 + ' das entregas guardadas chegaram mais de 30 dias depois da primeira).'));
c.push(B('**Ligação B3 → CVM:** 91% dos papéis negociados de 2011 em diante; os sem ligação são, na maioria, empresas incorporadas ou renomeadas entre 2011 e 2015.'));
c.push(B('**Tesouraria antes de 2020:** o FRE não traz a posição em tesouraria no mesmo formato; antes de 2020, ela não é descontada (em geral, menos de 2% das ações).'));
c.push(B('**Risco sacado:** algumas varejistas classificam o pagamento a fornecedores por convênio como financiamento, o que infla o caixa operacional (exemplo: Magazine Luiza 2024). A nota padronizada, limitada a ±3, reduz o efeito.'));
c.push(B('**Arrendamentos:** a dívida do EV e da segurança usa só empréstimos e financiamentos; arrendamentos (IFRS 16) ficam de fora.'));


const doc = new Document({
  creator: 'SOLIDUNS', title: 'Score Exponencial — especificação operacional v1.0.4',
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
  numbering: { config: ['numeros', 'numeros2', 'numeros3'].map(r => ({ reference: r, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] }))
    .concat([{ reference: 'marcas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
      { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 900, hanging: 270 } } } }] }]) },
  sections: [
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1450, right: 1450 } } }, children: capa },
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1450, right: 1450 } } },
      headers: { default: new Header({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: OURO, space: 4 } },
        children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 26, height: 27 } }),
          new TextRun({ text: '   SOLIDUNS · Score Exponencial', size: 17, color: CINZA }), new TextRun({ text: '\tEspecificação operacional v1.0.4', size: 17, color: CINZA })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Página ', size: 17, color: CINZA }), new TextRun({ children: [PageNumber.CURRENT], size: 17, color: CINZA }),
          new TextRun({ text: '  ·  Uso interno. Não é recomendação de investimento.', size: 17, color: CINZA })] })] }) },
      children: c },
  ],
});
const saida = process.argv[2] || 'Score_Exponencial_especificacao_v1.0.4.docx';
Packer.toBuffer(doc).then(b => { fs.writeFileSync(saida, b); console.log('ok', b.length); });
