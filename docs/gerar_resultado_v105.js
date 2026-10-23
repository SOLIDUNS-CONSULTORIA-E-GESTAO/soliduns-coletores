// Score Exponencial SOLIDUNS — Resultado do teste histórico (rodada única, protocolo v1.0.5) — 23/10/2026
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
  HeadingLevel, BorderStyle, LevelFormat, Footer, Header, PageNumber, TabStopType } = require('docx');

const QUE = new Set(fs.existsSync(__dirname + '/score_resultado_quebras.json') ? JSON.parse(fs.readFileSync(__dirname + '/score_resultado_quebras.json', 'utf8')) : []);
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


const curva = fs.readFileSync(__dirname + '/teste_curva_v105.png');

const capa = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1400, after: 400 },
    children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 170, height: 174 } })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'SCORE EXPONENCIAL', bold: true, size: 52, color: PRETO, font: FONTE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'Resultado do teste histórico', size: 26, color: OURO })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Rodada única — protocolo v1.0.5', size: 24, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Radar de Ações Exponenciais · SOLIDUNS', size: 22, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Brasília, 23 de outubro de 2026', size: 22, color: CINZA })] }),
];

const c = [];
c.push(H1('1. Resultado', false));
c.push(P('O teste rodou uma única vez, em 23/10/2026, com o código fixado no registro 5bce944 do repositório. **O Score não passou nos critérios para publicar.** Passou em 1 dos 5.'));
c.push(tabela(['Critério', 'Exigido', 'Resultado', 'Passou'], [
  ['Estatística t do Score (Fama-MacBeth)', 't ≥ 3', 't = 1,07', 'não'],
  ['Alfa Q5 − Q1 contra 5 fatores', 'positivo, t ≥ 2', '0,59% ao mês; t = 1,40', 'não'],
  ['Sharpe deflacionado (Radar sobre o CDI)', 'acima de 95%', '36,9%', 'não'],
  ['Probabilidade de sobreajuste', 'abaixo de 20%', '13,6%', 'sim'],
  ['Período guardado (quintil do topo × Ibovespa)', 'à frente', '+34,6% × +55,6%', 'não'],
], [3600, 1700, 2500, 1200]));
c.push(P('Pela metodologia, a tela do Radar continua com **"Ranking em calibração"**.'));
c.push(H2('R$ 1 investido em janeiro de 2013'));
c.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [new ImageRun({ data: curva, type: 'png', transformation: { width: 600, height: 280 } })] }));
c.push(P('Retornos depois dos custos, com pesos iguais. A faixa clara é o período guardado (set/2023 a ago/2026).'));

c.push(H1('2. O que os números mostram'));
c.push(H2('O Score ordena, mas pouco'));
c.push(tabela(['Carteira (período principal)', 'Bruto ao mês', 'Custo', 'Líquido ao mês', 'Giro mensal'], [
  ['Quintil do topo (1 mês)', '0,90%', '0,15%', '0,75%', '26%'], ['Quintil de baixo (1 mês)', '0,51%', '0,19%', '0,31%', '28%'],
  ['Radar (faixa 20%/40%)', '0,95%', '0,08%', '0,87%', '13%'], ['Ibovespa (BOVA11)', '0,73%', '—', '0,73%', '—'],
], [3400, 1400, 1100, 1700, 1400]));
c.push(B('**A ordem acerta na média:** o quintil do topo rendeu 0,39 ponto ao mês a mais que o de baixo. O coeficiente de informação foi de 0,042, com t = 2,70.'));
c.push(B('**Mas não com a força exigida:** a regressão de Fama-MacBeth deu t = 1,07, longe do mínimo de 3. O alfa de 0,59% ao mês não chegou a t = 2.'));
c.push(B('**O Radar ficou à frente do Ibovespa:** 0,87% contra 0,73% ao mês no período principal, já descontados os custos. Mas o próprio Ibovespa rendeu perto do CDI de 2013 a 2023, e o Sharpe do Radar sobre o CDI ficou perto de zero.'));
c.push(H2('O período guardado'));
c.push(B('**Quintil do topo:** +34,6% em 36 meses, depois dos custos. Radar: +35,5%.'));
c.push(B('**Ibovespa:** +55,6%, puxado pelas maiores empresas.'));
c.push(B('**Ação típica do universo:** +12,8% antes dos custos (média simples). O Score escolheu bem dentro do universo, mas perdeu para o índice das grandes.'));
c.push(H2('Outras conferências (fora dos critérios)'));
c.push(B('**Custos em dobro:** o Radar cai de 0,87% para 0,79% ao mês. A conclusão não muda.'));
c.push(B('**Prazos de 3, 6 e 12 meses:** mesma ordem dos quintis, com custos menores.'));
c.push(B('**Pilar Momentum sozinho, de 2007 em diante:** t = 2,44; coeficiente de informação 0,051, com t = 4,44.'));
c.push(B('**Cargas nos fatores:** o quintil do topo menos o de baixo pende para empresas grandes e de crescimento (cargas negativas em tamanho e valor).'));
c.push(B('**EM Score:** 12 meses antes de recuperações judiciais e falências, 6 de 7 empresas estavam na zona de perigo.'));
c.push(B('**Teste SPA de Hansen:** nenhuma das 21 carteiras bateu o Ibovespa com folga estatística (valor p = 0,23).'));

c.push(H1('3. O que a metodologia manda fazer', false));
c.push(B('**Não publicar:** o ranking não vai para os assinantes. A tela segue "Ranking em calibração".'));
c.push(B('**O período guardado foi usado:** ele não serve mais para conferir uma versão nova. Uma conferência nova só pode vir de meses que ainda não aconteceram.'));
c.push(B('**Revisão conta como tentativa:** qualquer mudança vira versão nova. O número de tentativas sobe e o Sharpe deflacionado fica mais exigente.'));
c.push(H2('Caminhos possíveis'));
c.push(N('**Acompanhar em tempo real (recomendado):** manter a v1.0.5 sem mudanças e calcular o Score todo mês daqui em diante. Esses meses são uma conferência limpa, sem nenhuma escolha feita olhando para eles. Reavaliar com 24 a 36 meses de dados novos.', 'numeros'));
c.push(N('**Revisar agora como v1.1:** por exemplo, pesos pelo valor de mercado, para competir com o Ibovespa nas mesmas condições. Toda revisão escolhida depois de ver o resultado tem risco de se ajustar ao passado, e conta como tentativa.', 'numeros'));
c.push(N('**Usar o Score só como ferramenta interna:** ordenar ações para os Relatórios de Análise, sem promessa de desempenho ao assinante.', 'numeros'));

const doc = new Document({
  creator: 'SOLIDUNS', title: 'Score Exponencial — resultado do teste histórico (v1.0.5)',
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
          new TextRun({ text: '   SOLIDUNS · Score Exponencial', size: 17, color: CINZA }), new TextRun({ text: '\tResultado do teste — v1.0.5', size: 17, color: CINZA })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Página ', size: 17, color: CINZA }), new TextRun({ children: [PageNumber.CURRENT], size: 17, color: CINZA }),
          new TextRun({ text: '  ·  Uso interno. Não é recomendação de investimento.', size: 17, color: CINZA })] })] }) },
      children: c },
  ],
});
const saida = process.argv[2] || 'Score_Exponencial_resultado_teste_v1.0.5.docx';
Packer.toBuffer(doc).then(b => { fs.writeFileSync(saida, b); console.log('ok', b.length); });
