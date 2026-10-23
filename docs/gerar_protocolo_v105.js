// Score Exponencial SOLIDUNS — Protocolo do teste histórico v1.0.5 — 23/10/2026
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
  HeadingLevel, BorderStyle, LevelFormat, Footer, Header, PageNumber, TabStopType } = require('docx');

const QUE = new Set(fs.existsSync(__dirname + '/score_v105_quebras.json') ? JSON.parse(fs.readFileSync(__dirname + '/score_v105_quebras.json', 'utf8')) : []);
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


const capa = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1400, after: 400 },
    children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 170, height: 174 } })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'SCORE EXPONENCIAL', bold: true, size: 52, color: PRETO, font: FONTE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'Protocolo do teste histórico', size: 26, color: OURO })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Versão 1.0.5 — aprovada em 22 de outubro de 2026', size: 24, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Radar de Ações Exponenciais · SOLIDUNS', size: 22, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Brasília, 23 de outubro de 2026', size: 22, color: CINZA })] }),
];

const c = [];
c.push(H1('1. O que este documento fixa', false));
c.push(P('O teste histórico do Score roda **uma única vez**. Por isso, cada detalhe do cálculo precisa estar decidido antes da rodada.'));
c.push(P('Este protocolo completa o capítulo 6 da metodologia. Ele fixa os períodos, os custos, as carteiras e as fórmulas das medidas.'));
c.push(P('**Nenhum resultado do Score foi calculado.** A máquina do teste foi conferida só com dois placebos, que não usam o Score (capítulo 7).'));
c.push(H2('Decisões aprovadas em 22/10/2026'));
c.push(N('**Setor pequeno (etapa 3 do motor):** quando um setor tem menos de 5 ações com dado num subitem, a nota é calculada contra todas as ações do mês.', 'numeros'));
c.push(N('**Períodos:** período principal com carteiras formadas de jan/2013 a jul/2023 (retornos de fev/2013 a ago/2023, 127 meses); período guardado com os 36 meses seguintes (retornos de set/2023 a ago/2026).', 'numeros'));
c.push(N('**Ação que sai da bolsa:** rende até o último pregão; no resto do mês, rende a taxa livre de risco.', 'numeros'));
c.push(N('**Pesos iguais** dentro de cada carteira, como em Jegadeesh e Titman (1993).', 'numeros'));
c.push(N('**Carteira dos critérios:** quintil do topo refeito todo mês (prazo de 1 mês). Os prazos de 3, 6 e 12 meses aparecem no relatório.', 'numeros'));
c.push(N('**Custos por faixa de liquidez** (capítulo 3), em vez de um estimador estatístico do spread.', 'numeros'));
c.push(N('**Ibovespa:** o fundo de índice BOVA11, que segue o Ibovespa e pode ser comprado.', 'numeros'));
c.push(N('**Sharpe deflacionado:** carteira do Radar, depois dos custos, acima da taxa livre de risco (CDI do NEFIN), contando 21 tentativas.', 'numeros'));
c.push(N('**Família de 21 carteiras** para o Sharpe deflacionado, a probabilidade de sobreajuste e o teste SPA.', 'numeros'));
c.push(N('**Erros-padrão:** Newey-West com 4 defasagens (regra 4·(T/100)^(2/9), com T = 127).', 'numeros'));
c.push(N('**Rodada única:** o código fica fixado num registro do repositório antes da rodada. O resultado é publicado inteiro, passe ou não.', 'numeros'));

c.push(H1('2. Períodos e dados', false));
c.push(tabela(['Item', 'Definição'], [
  ['Formação das carteiras', 'último pregão de cada mês, com o Score calculado só com dados públicos na data'],
  ['Período principal', 'formação de jan/2013 a jul/2023; retornos de fev/2013 a ago/2023 (127 meses)'],
  ['Período guardado', 'formação de ago/2023 a jul/2026; retornos de set/2023 a ago/2026 (36 meses)'],
  ['Último mês', 'ago/2026: último mês com os fatores do NEFIN completos'],
  ['Pilar Momentum sozinho', 'de jan/2007 em diante, só descritivo (fora dos critérios)'],
  ['Ibovespa', 'BOVA11 (COTAHIST da B3); conferido com a série 7 do Banco Central de 2009 a 2019: correlação mensal de 0,996'],
  ['Taxa livre e fatores', 'NEFIN-USP: taxa livre diária e mensal; fatores mensais de mercado, tamanho, valor, momentum e iliquidez'],
], [2600, 6400]));

c.push(H1('3. Retornos e custos', false));
c.push(H2('Retorno do mês'));
c.push(...F('rᵢ,ₜ₊₁ = Iᵢ(fim de t + 1) / Iᵢ(fim de t) − 1',
  'o retorno {rᵢ,ₜ₊₁} da ação {i} no mês seguinte à formação {t} é o índice de retorno total {Iᵢ} no último pregão do mês {t + 1}, dividido pelo índice no último pregão do mês {t}, menos {1}.',
  'quanto a ação rendeu no mês, com os proventos reinvestidos.'));
c.push(B('**Saída da bolsa no mês:** do último pregão até o fim do mês, o dinheiro rende a taxa livre de risco.'));
c.push(H2('Custo de cada negociação'));
c.push(...F('cᵢ = corretagem + emolumentos + s/2 = 0,05% + 0,03% + s/2',
  'o custo {cᵢ} de comprar ou vender a ação {i} é a corretagem ({0,05%}), mais os emolumentos da B3 ({0,03%}), mais metade do spread {s} entre compra e venda.',
  'cada compra e cada venda pagam a corretora, a bolsa e a diferença entre o preço de compra e o de venda.'));
c.push(tabela(['Volume médio diário da ação (63 pregões)', 'Meio spread (s/2)', 'Custo por lado'], [
  ['R$ 100 milhões ou mais', '0,05%', '0,13%'], ['de R$ 20 a 100 milhões', '0,15%', '0,23%'],
  ['de R$ 5 a 20 milhões', '0,30%', '0,38%'], ['de R$ 1 a 5 milhões', '0,50%', '0,58%'],
], [4200, 2400, 2400]));
c.push(B('**Por que faixas:** o estimador de Abdi e Ranaldo (2017), testado com os preços máximo e mínimo da B3, foi instável. Deu zero para quase todas as ações em trimestres inteiros e cerca de 0,25% de meio spread para a PETR4, dez vezes o real.'));
c.push(B('**Faixas conservadoras:** o meio spread real das ações mais negociadas é de cerca de um centavo de preço. As faixas pesam mais que isso, como pede Novy-Marx e Velikov (2016).'));
c.push(H2('Giro e retorno líquido'));
c.push(...F('Custoₜ = Σᵢ |wᵢ,ₜ − w̃ᵢ,ₜ| · cᵢ;   Líquidoₜ = Brutoₜ − Custoₜ',
  'o custo {Custoₜ} do mês é a soma, em todas as ações {i}, da diferença entre o peso desejado {wᵢ,ₜ} e o peso que a ação tinha depois do mês anterior {w̃ᵢ,ₜ}, vezes o custo {cᵢ}; o retorno líquido é o bruto menos o custo.',
  'só paga custo o que é de fato comprado ou vendido na troca da carteira.'));

c.push(H1('4. Carteiras', false));
c.push(H2('Quintis sobrepostos'));
c.push(...F('wᵢ,ₜ = (1/K) · Σₖ₌₀ᴷ⁻¹ 1[i ∈ Qₜ₋ₖ] / nₜ₋ₖ',
  'o peso {wᵢ,ₜ} da ação {i} é a média, nas {K} carteiras formadas nos últimos {K} meses, do peso igual que ela tem em cada uma; {1[i ∈ Qₜ₋ₖ]} vale {1} se a ação estava no quintil formado {k} meses antes, e {nₜ₋ₖ} é o número de ações daquele quintil.',
  'com prazo de 3 meses, por exemplo, um terço do dinheiro segue cada uma das três últimas carteiras.'));
c.push(B('**Quintis:** as ações do mês são ordenadas pelo Score e divididas em cinco grupos de mesmo tamanho.'));
c.push(B('**Prazos:** 1, 3, 6 e 12 meses (Jegadeesh; Titman, 1993).'));
c.push(H2('Carteira do Radar'));
c.push(B('**Entra:** ação entre os 20% melhores do Score do mês.'));
c.push(B('**Fica:** enquanto estiver entre os 40% melhores.'));
c.push(B('**Pesos:** iguais, refeitos todo mês.'));

c.push(H1('5. Medidas', false));
c.push(H2('Poder de previsão'));
c.push(...F('rᵢ,ₜ₊₁ = aₜ + bₜ · Scoreᵢ,ₜ + eᵢ,ₜ;   t = média(bₜ) / EP_NW',
  'em cada mês {t}, o retorno {rᵢ,ₜ₊₁} é regredido no Score {Scoreᵢ,ₜ}; a estatística {t} é a média dos coeficientes {bₜ} dividida pelo erro-padrão de Newey-West {EP_NW}.',
  'mede se, mês a mês, ações com Score maior renderam mais depois.'));
c.push(B('**Coeficiente de informação:** média mensal da correlação de postos entre o Score e o retorno do mês seguinte, com a mesma correção.'));
c.push(B('**Alfa:** regressão mensal do quintil do topo menos o de baixo (1 mês, bruto) nos 5 fatores do NEFIN, como no capítulo 6 da metodologia.'));
c.push(H2('Sharpe deflacionado'));
c.push(...F('PSD = Φ[(SR − SR₀) · raiz(T − 1) / raiz(1 − γ₃ · SR + (γ₄ − 1)/4 · SR²)]',
  'a probabilidade {PSD} é a normal acumulada {Φ} da diferença entre o Sharpe mensal da carteira {SR} e o Sharpe esperado pela sorte {SR₀}, vezes a raiz quadrada de {T − 1}, dividida por um termo que corrige a assimetria {γ₃} e a curtose {γ₄} dos retornos.',
  'é a chance de o Sharpe da carteira não ser fruto de sorte, dado o número de tentativas.'));
c.push(...F('SR₀ = raiz(V) · [(1 − γ) · Φ⁻¹(1 − 1/N) + γ · Φ⁻¹(1 − 1/(N·e))]',
  'o Sharpe esperado pela sorte {SR₀} usa a variância {V} dos Sharpes das {N = 21} carteiras da família e a constante de Euler-Mascheroni {γ ≈ 0,5772}.',
  'quanto mais carteiras são olhadas, e quanto mais elas diferem, maior o Sharpe que a sorte sozinha produziria.'));
c.push(H2('Família de 21 carteiras'));
c.push(B('**Composição:** 5 sinais (Score e cada um dos 4 pilares sozinho) × 4 prazos, quintil do topo, depois dos custos; mais a carteira do Radar.'));
c.push(B('**Sobreajuste (CSCV):** o período principal é dividido em 16 blocos. Em cada uma das 12.870 combinações de 8 blocos, escolhe-se a melhor carteira dentro da amostra e vê-se a sua posição fora dela. A probabilidade de sobreajuste é a fração em que ela fica abaixo da mediana (Bailey et al., 2017).'));
c.push(B('**SPA de Hansen (2005):** confere se alguma carteira da família bate o Ibovespa, descontada a busca entre as 21. Reamostragem estacionária com 2.000 repetições e blocos médios de 6 meses. Fica no relatório; não é critério.'));

c.push(H1('6. Critérios', false));
c.push(tabela(['Medida', 'Critério', 'Período e carteira'], [
  ['Estatística t do Score (Fama-MacBeth)', 't ≥ 3', 'principal; todas as ações elegíveis'],
  ['Alfa contra os 5 fatores do NEFIN', 'positivo, com t ≥ 2', 'principal; quintil 5 − quintil 1, 1 mês, bruto'],
  ['Sharpe deflacionado', 'acima de 95%', 'principal; Radar líquido acima do CDI, N = 21'],
  ['Probabilidade de sobreajuste', 'abaixo de 20%', 'principal; família de 21 carteiras'],
  ['Período guardado', 'quintil do topo à frente do Ibovespa', '36 meses; quintil do topo, 1 mês, líquido, contra o BOVA11'],
], [3000, 2400, 3600]));
c.push(P('O ranking só vai para os assinantes se passar em **todos**. Também saem no relatório, sem decidir nada: os prazos de 3, 6 e 12 meses, o Pilar Momentum desde 2007, os custos em dobro e a conferência do EM Score.'));

c.push(H1('7. Conferência da máquina: placebos', false));
c.push(P('Antes do teste do Score, a mesma máquina rodou com dois placebos:'));
c.push(B('**Aleatório:** notas sorteadas. Um teste correto não pode achar poder de previsão.'));
c.push(B('**Oráculo:** nota igual ao retorno do mês seguinte mais ruído. Um teste correto precisa achar poder enorme.'));
c.push(tabela(['Medida', 'Aleatório', 'Oráculo'], [
  ['t de Fama-MacBeth', '0,67', '32,08'], ['Coeficiente de informação', '0,009 (t 1,30)', '0,504 (t 94,8)'],
  ['Alfa Q5 − Q1', '0,12% ao mês (t 0,71)', '13,37% ao mês (t 31,9)'], ['Sharpe deflacionado', '9,2%', '97,7%'],
  ['Probabilidade de sobreajuste', '20,4%', '0,0%'], ['SPA de Hansen (valor p)', '0,68', '0,00'],
  ['Período guardado: quintil do topo × Ibovespa', '−19,2% × 55,6%', '905,9% × 55,6%'],
  ['Conclusão', 'não passou', 'passou em todos'],
], [3800, 2600, 2600]));
c.push(P('A máquina se comporta como deve nos dois extremos.'));
c.push(H2('Pontos de atenção'));
c.push(B('**Pesos iguais contra o Ibovespa no período guardado:** o placebo mostrou um fato de mercado, sem relação com o Score. De set/2023 a ago/2026, a média simples das ações elegíveis subiu 12,8% antes dos custos. No mesmo período, o BOVA11 subiu 55,6%, puxado pelas maiores empresas. Com pesos iguais, o critério 5 fica mais difícil.'));
c.push(B('**Recomendação:** manter os pesos iguais. Trocar a regra agora seria escolher olhando os dados guardados, que é justamente o que o registro prévio evita.'));
c.push(B('**Sharpe deflacionado exigente:** como as 21 carteiras diferem por construção (prazos de 1 a 12 meses), o Sharpe esperado pela sorte sobe. Até o oráculo ficou perto do limite (97,7%).'));
c.push(B('**Conferência do EM Score já vista:** numa rodada de depuração, a conferência do EM Score rodou com os dados reais. Doze meses antes de recuperações judiciais e falências, 6 de 7 empresas estavam na zona de perigo. Ela não usa o Score nem os retornos e não muda nenhuma regra.'));

const doc = new Document({
  creator: 'SOLIDUNS', title: 'Score Exponencial — protocolo do teste histórico v1.0.5',
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
          new TextRun({ text: '   SOLIDUNS · Score Exponencial', size: 17, color: CINZA }), new TextRun({ text: '\tProtocolo do teste v1.0.5', size: 17, color: CINZA })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Página ', size: 17, color: CINZA }), new TextRun({ children: [PageNumber.CURRENT], size: 17, color: CINZA }),
          new TextRun({ text: '  ·  Uso interno. Não é recomendação de investimento.', size: 17, color: CINZA })] })] }) },
      children: c },
  ],
});
const saida = process.argv[2] || 'Score_Exponencial_protocolo_teste_v1.0.5.docx';
Packer.toBuffer(doc).then(b => { fs.writeFileSync(saida, b); console.log('ok', b.length); });
