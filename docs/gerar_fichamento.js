// Estudo das ações exponenciais — fichamento dos livros e matriz de hipóteses — 22/10/2026
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
  HeadingLevel, BorderStyle, LevelFormat, Footer, Header, PageNumber, TabStopType } = require('docx');

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
const H1 = (t, quebra = false) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], keepNext: true, keepLines: true, pageBreakBefore: Q(t, quebra), spacing: Q(t, quebra) ? undefined : { before: 360 } });
const H2 = (t, quebra = false) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)], keepNext: true, keepLines: true, pageBreakBefore: Q(t, quebra) });
const H3 = (t, quebra = false) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)], keepNext: true, keepLines: true, pageBreakBefore: Q(t, quebra) });
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
function tabela(cab, linhas, larguras) {
  const total = larguras.reduce((a, b) => a + b, 0);
  const cel = (t, i, topo, ultima = false) => new TableCell({ width: { size: larguras[i], type: WidthType.DXA },
    shading: topo ? { type: ShadingType.CLEAR, color: 'auto', fill: PRETO } : undefined,
    borders: { top: borda, bottom: borda, left: borda, right: borda }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: runs(String(t), topo ? { bold: true, color: 'FFFFFF', size: 19 } : { size: 19 }) , keepNext: !ultima })] });
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: larguras,
    rows: [new TableRow({ tableHeader: true, cantSplit: true, children: cab.map((c, i) => cel(c, i, true)) }),
      ...linhas.map((l, j) => new TableRow({ cantSplit: true, children: l.map((c, i) => cel(c, i, false, j === linhas.length - 1)) }))] });
}
const espaco = () => new Paragraph({ children: [], spacing: { after: 80 } });

// ------------------------------------------------------------------ conteúdo v0.2 — arquitetura e fundamentação
const R = t => new Paragraph({ children: runs(t, { size: 19 }), alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 250 }, indent: { left: 360, hanging: 360 } });

const M = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const QUEBRAS = new Set(process.argv[4] && fs.existsSync(process.argv[4]) ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : []);
const Q = (t, q) => q || QUEBRAS.has(t);
const limpa = s => String(s ?? '').replace(/[{}]/g, '');
// tabela de 2 colunas: rótulo | conteúdo (conteúdo pode ser lista → um parágrafo por item)
function ficha(linhas) {
  const L = [1900, 7100];
  const cel = (conteudo, i, rotulo, ultima) => new TableCell({ width: { size: L[i], type: WidthType.DXA },
    shading: rotulo ? { type: ShadingType.CLEAR, color: 'auto', fill: CLARO } : undefined,
    borders: { top: borda, bottom: borda, left: borda, right: borda }, margins: { top: 50, bottom: 50, left: 100, right: 100 },
    children: (Array.isArray(conteudo) ? conteudo : [conteudo]).map(t => new Paragraph({ keepNext: !ultima,
      children: runs(limpa(t), rotulo ? { bold: true, size: 18, color: '333333' } : { size: 18 }), spacing: { after: 30 } })) });
  return new Table({ width: { size: 9000, type: WidthType.DXA }, columnWidths: L,
    rows: linhas.map(([r, c], j) => new TableRow({ cantSplit: true, children: [cel(r, 0, true, j === linhas.length - 1), cel(c, 1, false, j === linhas.length - 1)] })) });
}
const refAut = a => `**${a.autor}** — ${limpa(a.ref)}`;
const PK = (t, o = {}) => P(t, { keepNext: true, keepLines: true, ...o });

const temas = [...new Set(M.hipoteses.map(h => h.tema))];
const capa = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1400, after: 400 },
    children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 170, height: 174 } })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'AÇÕES EXPONENCIAIS', bold: true, size: 52, color: PRETO, font: FONTE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'Fichamento dos livros e matriz de hipóteses', size: 26, color: OURO })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Phelps · Fisher · Lynch · O\'Neil · Mayer', size: 24, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Radar de Ações Exponenciais · SOLIDUNS', size: 22, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Brasília, 22 de outubro de 2026', size: 22, color: CINZA })] }),
];
const D = M.definicoes;
const corpo = [
  H1('1. Como ler'),
  P('Este documento reúne o que cinco autores clássicos dizem sobre as ações que multiplicaram de valor. Cada livro foi lido por inteiro e fichado.'),
  P(`Foram **${601} fichas**. Elas viraram **${M.hipoteses.length} hipóteses**, **${M.evitar.length} sinais de evitar**, **${M.divergencias.length} divergências** entre autores e **${M.gestao.length} regras de gestão**.`),
  P('Atenção: nada aqui é conclusão. São **hipóteses**. Cada uma será testada com dados reais, comparando as vencedoras com um grupo de controle.'),
  H2('Definições do estudo'),
  B(`**Vencedora:** ${limpa(D.vencedora)}`),
  B(`**Início da alta (t0):** ${limpa(D.t0)}`),
  B(`**Grupo de controle:** ${limpa(D.controle)}`),
  B(`**Limite:** ${limpa(D.aviso)}`),
  H2('Como cada hipótese está apresentada'),
  P('Cada ficha de hipótese traz:'),
  B('**Enunciado:** a frase que o teste vai confirmar ou derrubar.'),
  B('**Autores:** quem apoia e quem contradiz, com capítulo e página da edição usada.'),
  B('**Números:** os limites que cada autor cita.'),
  B('**Medida:** como o robô calcula a característica, sempre na data de início da alta.'),
  B('**Dados e viabilidade:** de onde vem o dado e se dá para medir em escala com fontes públicas.'),

  H1('2. Os estudos dos autores'),
  P('Antes das hipóteses, o que cada autor realmente estudou. Nenhum dos cinco usou grupo de controle. Por isso as conclusões deles são pontos de partida.'),
  ...M.estudos.flatMap(e => [
    H2(e.autor),
    PK(`*${limpa(e.livro)}*`.replace(/\*/g, '')),
    ficha([
      ['Amostra', limpa(e.amostra?.quantidade)],
      ['Período', limpa(e.amostra?.periodo)],
      ['Fonte dos dados', limpa(e.amostra?.fonte_dados)],
      ['Método', limpa(e.metodo)],
      ['Limites', (e.limites || []).map(limpa)],
    ]),
  ]),

  H1('3. Resumo da matriz'),
  P('As hipóteses abaixo estão em ordem de código. **Autores** é quantos dos cinco apoiam. **Viabilidade** diz se dá para medir com dados públicos.'),
  espaco(),
  tabela(['Código', 'Hipótese', 'Autores', 'Viabilidade'],
    M.hipoteses.map(h => [h.codigo, limpa(h.titulo), String(h.convergencia), h.viabilidade]), [1000, 5400, 1200, 1400]),

  H1('4. As hipóteses'),
  P('As hipóteses estão agrupadas por tema. A ordem dentro de cada tema segue o código.'),
  ...temas.flatMap((t, i) => [
    H2(t, i > 0 && false),
    ...M.hipoteses.filter(h => h.tema === t).flatMap(h => [
      H3(`${h.codigo} · ${limpa(h.titulo)}`),
      PK(limpa(h.enunciado)),
      ficha([
        ['Apoiam', h.autores_apoiam.map(refAut)],
        ...(h.autores_contra?.length ? [['Contradizem', h.autores_contra.map(refAut)]] : []),
        ['Números', (h.numeros || []).length ? h.numeros : ['Os autores não dão limite numérico.']],
        ['Medida', limpa(h.medida)],
        ['Dados', `${(h.dados || []).join(', ')} · viabilidade ${h.viabilidade} · tipo ${h.tipo}`],
      ]),
      espaco(),
    ]),
  ]),

  H1('5. O que evitar'),
  P('Sinais que os autores mandam evitar. No estudo, eles são testados no sentido contrário: devem aparecer **menos** nas vencedoras.'),
  ...M.evitar.flatMap(h => [
    H3(`${h.codigo} · ${limpa(h.titulo)}`),
    PK(limpa(h.enunciado)),
    ficha([
      ['Autores', h.autores_apoiam.map(refAut)],
      ...((h.numeros || []).length ? [['Números', h.numeros]] : []),
      ['Medida', limpa(h.medida)],
      ['Dados', (h.dados || []).join(', ')],
    ]),
    espaco(),
  ]),

  H1('6. Onde os autores divergem'),
  P('Os pontos abaixo dividem os autores. O teste com grupo de controle é o que decide entre eles.'),
  ...M.divergencias.flatMap(d => [
    H3(limpa(d.tema)),
    ficha([
      ...d.posicoes.map(p => [p.autor, `${limpa(p.posicao)} (${limpa(p.ref)})`]),
      ['Como o teste resolve', limpa(d.como_o_teste_resolve)],
    ]),
    espaco(),
  ]),

  H1('7. Regras de gestão'),
  P('Estas regras não escolhem ações. Elas dizem quando comprar mais, segurar ou vender. Entram no robô, não no teste de seleção.'),
  ...M.gestao.flatMap(g => [
    H3(limpa(g.titulo)),
    ficha([
      ['Regra', limpa(g.regra)],
      ['Autores', Array.isArray(g.autores) ? g.autores.map(a => typeof a === 'string' ? a : refAut(a)) : limpa(g.autores)],
      ...((g.numeros || []).length ? [['Números', g.numeros]] : []),
    ]),
    espaco(),
  ]),

  H1('8. Próximos passos'),
  P('A matriz segue para o teste, nesta ordem:'),
  N('**Escolha das hipóteses do primeiro teste:** as de viabilidade alta, que dão para medir com cotações da B3 e balanços da CVM.', 'numeros'),
  N('**Lista das vencedoras:** todas as ações da B3 que subiram 10 vezes ou mais em até 10 anos, desde 1996, incluindo as que saíram da bolsa.', 'numeros'),
  N('**Grupo de controle:** ações do mesmo setor, tamanho e data que não subiram.', 'numeros'),
  N('**Comparação:** para cada hipótese, quanto a característica aumenta a chance de uma ação virar vencedora.', 'numeros'),
  N('**Validação:** o que funcionar até 2019 é testado de 2020 em diante, sem tocar nos 36 meses guardados do Score.', 'numeros'),
  N('**Score v1.1:** as hipóteses aprovadas entram no Score como nova versão, contadas no controle de excesso de testes.', 'numeros'),

  H1('9. Livros fichados'),
  P('Edições usadas nas referências de capítulo e página:'),
  R('FISHER, Philip A. **Common Stocks and Uncommon Profits and Other Writings**. Hoboken: Wiley, 2003. Inclui Common Stocks and Uncommon Profits (1958), Conservative Investors Sleep Well (1975) e Developing an Investment Philosophy (1980).'),
  R('LYNCH, Peter; ROTHCHILD, John. **One Up on Wall Street**: how to use what you already know to make money in the market. New York: Simon & Schuster, 2000. Primeira edição em 1989.'),
  R('MAYER, Christopher W. **100 Baggers**: stocks that return 100-to-1 and how to find them. Baltimore: Laissez Faire Books; Agora Financial, 2015.'),
  R("O'NEIL, William J. **How to Make Money in Stocks**: a winning system in good times and bad. 4. ed. New York: McGraw-Hill, 2009."),
  R('PHELPS, Thomas William. **100 to 1 in the Stock Market**: a distinguished security analyst tells how to make more of your investment opportunities. Brattleboro: Echo Point Books & Media, 2014. Primeira edição em 1972. Referências por capítulo (edição sem paginação).'),
];
const doc = new Document({
  creator: 'SOLIDUNS', title: 'Ações exponenciais — fichamento e matriz de hipóteses',
  styles: {
    default: { document: { run: { font: FONTE, size: 22, color: '222222' } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, color: PRETO, font: FONTE }, paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: OURO, space: 6 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, color: OURO, font: FONTE }, paragraph: { spacing: { before: 260, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, color: PRETO, font: FONTE }, paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 2 } },
    ] },
  numbering: { config: ['numeros', 'numeros2'].map(r => ({ reference: r, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] }))
    .concat([{ reference: 'marcas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }]) },
  sections: [
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1450, right: 1450 } } }, children: capa },
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1450, right: 1450 } } },
      headers: { default: new Header({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: OURO, space: 4 } },
        children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 26, height: 27 } }),
          new TextRun({ text: '   SOLIDUNS · Ações exponenciais', size: 17, color: CINZA }), new TextRun({ text: '\tFichamento e matriz de hipóteses', size: 17, color: CINZA })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Página ', size: 17, color: CINZA }), new TextRun({ children: [PageNumber.CURRENT], size: 17, color: CINZA }),
          new TextRun({ text: '  ·  Uso interno. Não é recomendação de investimento.', size: 17, color: CINZA })] })] }) },
      children: corpo },
  ],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(process.argv[3], b); console.log('ok', b.length); });
