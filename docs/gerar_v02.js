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

// ------------------------------------------------------------------ conteúdo v0.2 — arquitetura e fundamentação
const R = t => new Paragraph({ children: runs(t, { size: 19 }), alignment: AlignmentType.JUSTIFIED, spacing: { after: 90, line: 260 }, indent: { left: 360, hanging: 360 } });

const capa = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1400, after: 400 },
    children: [new ImageRun({ data: logo, type: 'png', transformation: { width: 170, height: 174 } })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'SCORE EXPONENCIAL', bold: true, size: 52, color: PRETO, font: FONTE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'Arquitetura da metodologia e fundamentação', size: 26, color: OURO })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Versão 0.2 — rascunho para discussão (conclusão pendente)', size: 24, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Radar de Ações Exponenciais · SOLIDUNS', size: 22, color: CINZA })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Brasília, 16 de outubro de 2026', size: 22, color: CINZA })] }),
];

const corpo = [
  H1('1. O que muda'),
  P('A versão 0.1 apresentou os pilares e as fórmulas. Esta versão 0.2 faz duas coisas que faltavam:'),
  B('**Arquitetura:** organiza a metodologia em camadas, da coleta do dado até a publicação, para que cada decisão tenha um lugar e possa ser testada sozinha.'),
  B('**Fundamentação:** liga cada pilar, cada subitem e cada etapa do teste histórico a livros e artigos publicados. A lista completa está no capítulo 7, no padrão ABNT.'),
  P('A conclusão da metodologia continua **pendente**. Este documento serve para escolher o desenho antes de qualquer cálculo.'),
  H2('O que a literatura ensina antes de começar'),
  B('**Os fatores existem, mas encolhem:** anomalias publicadas rendem, em média, 26% menos fora da amostra original e 58% menos depois da publicação (McLean; Pontiff, 2016). O Score deve ser avaliado contra essa expectativa realista, e não contra o resultado dos artigos.'),
  B('**Muitos fatores não se replicam:** boa parte das anomalias perde significância com dados atualizados e custos realistas (Hou; Xue; Zhang, 2020; Novy-Marx; Velikov, 2016).'),
  B('**Crescimento passado prevê pouco o crescimento futuro:** o crescimento de lucro tem baixa persistência (Chan; Karceski; Lakonishok, 2003). Por isso o pilar de crescimento é redesenhado como **momento fundamental** (capítulo 3).'),
  B('**Combinar fatores ajuda:** valor e momentum têm correlação negativa entre si, e a combinação é mais estável do que cada um isolado (Asness; Moskowitz; Pedersen, 2013).'),
  B('**No Brasil há evidência de momentum:** carteiras de vencedores superaram as de perdedores em todas as 64 comparações de 2009 a 2018, com custos (Civiletti; Campani; Roquete, 2020). A qualidade das empresas também é persistente no Brasil (Bortoluzzo; Pistili; Bortoluzzo, 2021).'),

  H1('2. Arquitetura em sete camadas'),
  P('Cada camada recebe o resultado da anterior e entrega um produto bem definido. Isso permite trocar ou testar uma camada sem mexer nas outras.'),
  espaco(),
  tabela(['Camada', 'O que faz', 'Principal cuidado'], [
    ['1. Dados no tempo certo', 'Preços, proventos, demonstrações e setor, cada um com a data em que ficou público', 'Nada do futuro; incluir empresas que saíram da bolsa'],
    ['2. Universo', 'Escolhe quais ações entram no dia', 'Liquidez mínima e uma classe por empresa'],
    ['3. Sinais', 'Calcula os subitens de cada pilar', 'Cada sinal com fundamento publicado'],
    ['4. Tratamento', 'Apara extremos, padroniza e compara dentro do setor', 'Mesma escala para todos os sinais'],
    ['5. Combinação', 'Junta sinais em pilares e pilares no Score', 'Pesos fixados antes do teste'],
    ['6. Risco e regime', 'Reduz o peso do momentum em mercado turbulento e aplica alertas', 'Proteção contra quedas bruscas do fator'],
    ['7. Saída e governança', 'Ranking, faixas, versão e acompanhamento', 'Registro de cada versão e de cada teste feito'],
  ], [2300, 3700, 3000]),
  H2('Camada 1 — Dados no tempo certo'),
  B('**Data de publicação:** a demonstração da CVM entra no cálculo só a partir da data de entrega, que consta nos dados abertos.'),
  B('**Viés de sobrevivência:** o histórico precisa incluir as empresas que deixaram a bolsa (falência, fechamento de capital, incorporação). Sem elas, o teste fica otimista.'),
  B('**Proventos e desdobramentos:** os preços são ajustados por dividendos, juros sobre capital e grupamentos, para o retorno medido ser o retorno do acionista.'),
  H2('Camada 2 — Universo'),
  B('**Liquidez:** volume financeiro médio de 63 pregões acima de um piso, combinado com o índice de iliquidez de Amihud (2002), que mede quanto o preço anda para cada real negociado.'),
  B('**Histórico mínimo:** 252 pregões, porque o sinal de 12 meses precisa de um ano inteiro.'),
  B('**Uma classe por empresa:** a mais líquida entre ON, PN e units.'),
  B('**Setores especiais:** bancos e seguradoras usam indicadores próprios no pilar de fundamentos, porque o balanço deles não tem EBITDA nem dívida líquida no mesmo sentido.'),
  H2('Camadas 4 e 5 — Tratamento e combinação'),
  P('A versão 0.1 usava percentis. A proposta agora é a nota padronizada robusta, que preserva a distância entre as ações (o percentil trata a 1ª e a 2ª colocadas como vizinhas, mesmo quando uma é muito melhor).'),
  ...F('zᵢ = (xᵢ − mediana(x)) / (1,4826 · MAD(x))',
    'a nota padronizada {zᵢ} da ação {i} é igual ao valor {xᵢ} menos a {mediana} de {x} entre as ações do setor, dividido por {1,4826} vezes o desvio absoluto mediano {MAD} de {x}; o resultado é limitado entre {−3} e {3}.',
    'mostra quantas "unidades de dispersão" a ação está acima ou abaixo da ação típica do seu setor, sem se deixar levar por valores extremos.'),
  P('Os pesos dos pilares começam **iguais**, de 25% cada. A literatura mostra que pesos iguais costumam superar pesos otimizados fora da amostra, porque a otimização aprende o ruído do passado (DeMiguel; Garlappi; Uppal, 2009). Pesos diferentes só entram numa versão futura, se o teste fora da amostra mostrar ganho claro.'),
  ...F('Score = 50 + (50 / 3) · média(zM, zF, zA, zC)',
    'o {Score} é igual a {50} mais {50} dividido por {3}, vezes a média das notas padronizadas dos quatro pilares {zM}, {zF}, {zA} e {zC}; o resultado é limitado entre {0} e {100}.',
    'uma ação na média de todos os pilares fica com 50; cada ponto de vantagem consistente sobe a nota.'),
  H2('Camada 6 — Risco e regime'),
  B('**Quedas bruscas do momentum:** o fator momentum tem colapsos raros e fortes, quase sempre na saída de mercados em queda (Daniel; Moskowitz, 2016). No Brasil isso apareceu em 2008 e 2009.'),
  B('**Ajuste pela volatilidade:** reduzir o peso do pilar Momentum quando a volatilidade recente do próprio fator sobe melhora o resultado e corta as piores perdas (Barroso; Santa-Clara, 2015).'),
  B('**Alertas contábeis:** risco de insolvência (Altman, 1968; Campbell; Hilscher; Szilagyi, 2008) e sinais de manipulação de resultado (Beneish, 1999) entram como descontos na nota, e não como pilar.'),

  H1('3. Fundamentação dos pilares'),
  P('Cada subitem abaixo tem pelo menos uma referência publicada. Os pilares foram revistos em relação à versão 0.1 conforme a literatura.'),
  H2('Pilar 1 — Momentum de preço'),
  tabela(['Subitem', 'Evidência', 'Referências'], [
    ['Retorno de 12 meses sem o último mês', 'Vencedores dos últimos 3 a 12 meses continuam vencendo por meses; o último mês reverte', 'Jegadeesh; Titman (1993); Carhart (1997)'],
    ['Retorno de 7 a 12 meses atrás', 'A parte intermediária do passado explica boa parte do efeito', 'Novy-Marx (2012)'],
    ['Distância da máxima de 52 semanas', 'Ações perto da máxima do ano tendem a seguir subindo', 'George; Hwang (2004)'],
    ['Qualidade do caminho', 'Altas feitas de muitos dias pequenos persistem mais que altas de poucos saltos', 'Da; Gurun; Warachka (2014); Gray; Vogel (2016)'],
    ['Tendência pela média móvel', 'Regras de médias móveis têm poder de previsão', 'Brock; Lakonishok; LeBaron (1992)'],
    ['Volume', 'O volume indica em que fase do ciclo o momentum está', 'Lee; Swaminathan (2000)'],
  ], [2700, 4000, 2300]),
  H2('Pilar 2 — Qualidade e valor'),
  tabela(['Subitem', 'Evidência', 'Referências'], [
    ['Escore de saúde financeira (9 testes)', 'Separa vencedoras de perdedoras entre as ações baratas', 'Piotroski (2000)'],
    ['Rentabilidade bruta sobre o ativo', 'Prevê retornos tanto quanto o valor, com sinal oposto', 'Novy-Marx (2013)'],
    ['Qualidade ampla (rentável, crescente, segura)', 'Empresas de qualidade rendem mais ajustado ao risco; no Brasil, a qualidade é persistente', 'Asness; Frazzini; Pedersen (2019); Bortoluzzo et al. (2021)'],
    ['Lucro que vira caixa', 'Lucros muito apoiados em ajustes contábeis tendem a cair', 'Sloan (1996)'],
    ['Preço sobre o lucro operacional (EV/EBIT)', 'O múltiplo da empresa inteira prevê retornos melhor que outros múltiplos', 'Loughran; Wellman (2011); Greenblatt (2006); Gray; Carlisle (2012)'],
  ], [2700, 4000, 2300]),
  H2('Pilar 3 — Momento fundamental'),
  P('A versão 0.1 media o crescimento e a aceleração da receita. Como o crescimento passado se repete pouco (Chan; Karceski; Lakonishok, 2003), a proposta agora é medir **surpresas e melhoras recentes nos resultados**, que têm evidência de continuidade.'),
  tabela(['Subitem', 'Evidência', 'Referências'], [
    ['Surpresa de lucro padronizada', 'O preço continua reagindo por semanas a lucros acima do esperado', 'Bernard; Thomas (1989); Chan; Jegadeesh; Lakonishok (1996)'],
    ['Melhora do lucro contra o mesmo trimestre do ano anterior', 'O momentum de preço é em boa parte momentum de resultado', 'Novy-Marx (2015)'],
    ['Escore de crescimento saudável (8 testes)', 'Separa vencedoras de perdedoras entre as ações de crescimento', 'Mohanram (2005)'],
    ['Alavancagem operacional', 'Sinais contábeis de margem e eficiência ajudam a prever lucros', 'Lev; Thiagarajan (1993)'],
  ], [2700, 4000, 2300]),
  ...F('SUE = (LPAₜ − LPAₜ₋₄) / dp(LPAₜ − LPAₜ₋₄; 8 trimestres)',
    'a surpresa padronizada {SUE} é igual ao lucro por ação do trimestre {LPAₜ} menos o lucro por ação do mesmo trimestre do ano anterior {LPAₜ₋₄}, dividido pelo desvio-padrão {dp} dessa diferença nos últimos {8} trimestres.',
    'mede o quanto o lucro do trimestre surpreendeu, comparado com o tamanho normal das variações daquela empresa.'),
  H2('Pilar 4 — Risco e confluência'),
  tabela(['Subitem', 'Evidência', 'Referências'], [
    ['Baixa volatilidade', 'Ações menos voláteis renderam mais ajustado ao risco do que a teoria previa', 'Ang et al. (2006); Baker; Bradley; Wurgler (2011)'],
    ['Beta baixo', 'Carteiras de beta baixo superam as de beta alto ajustado ao risco', 'Frazzini; Pedersen (2014)'],
    ['Liquidez', 'Ações ilíquidas exigem prêmio e são caras de negociar', 'Amihud (2002)'],
    ['Concordância entre pilares', 'Sinais diferentes que apontam juntos dão carteiras mais estáveis', 'Asness; Moskowitz; Pedersen (2013)'],
  ], [2700, 4000, 2300]),

  H1('4. Arquitetura do teste histórico'),
  P('O teste histórico (backtest) é a parte que mais engana quando mal feito. A literatura recente trata o excesso de testes como o principal risco: com tentativas suficientes, sempre aparece uma estratégia que "funcionou" por acaso (Bailey et al., 2014).'),
  H2('Desenho'),
  N('**Período e frequência:** de 2006 até hoje, com o Score recalculado no último pregão de cada mês, só com o que era público na data.', 'numeros'),
  N('**Carteiras sobrepostas:** carteiras por quintil, mantidas por 1, 3, 6 e 12 meses, com várias carteiras abertas ao mesmo tempo, como em Jegadeesh e Titman (1993).', 'numeros'),
  N('**Período guardado:** os últimos 36 meses ficam fora de qualquer escolha e servem só para a conferência final.', 'numeros'),
  N('**Custos:** corretagem, emolumentos e o spread de compra e venda, que pesa mais nas ações menos líquidas (Novy-Marx; Velikov, 2016).', 'numeros'),
  H2('Medidas'),
  B('**Regressões em seção transversal:** a cada mês, o retorno seguinte das ações é explicado pelo Score; a média dos coeficientes no tempo mostra o poder de previsão (Fama; MacBeth, 1973), com erros corrigidos para dependência no tempo (Newey; West, 1987).'),
  B('**Alfa contra os fatores brasileiros:** o retorno do quintil do topo menos o do quintil de baixo é comparado aos fatores de mercado, tamanho, valor, momentum e liquidez publicados pelo NEFIN-USP. Assim se vê se o Score acrescenta algo além dos fatores conhecidos (Carhart, 1997).'),
  ...F('rₚ,ₜ − r_f,ₜ = α + β·MKTₜ + s·SMBₜ + h·HMLₜ + w·WMLₜ + l·IMLₜ + εₜ',
    'o retorno da carteira {rₚ,ₜ} menos a taxa livre de risco {r_f,ₜ} no mês {t} é igual a {α} mais {β} vezes o fator de mercado {MKTₜ}, mais {s} vezes o fator tamanho {SMBₜ}, mais {h} vezes o fator valor {HMLₜ}, mais {w} vezes o fator momentum {WMLₜ}, mais {l} vezes o fator iliquidez {IMLₜ}, mais o erro {εₜ}.',
    'separa quanto do ganho vem de fatores já conhecidos e quanto é contribuição própria do Score, que é o alfa.'),
  H2('Controles contra o excesso de testes'),
  B('**Registro prévio:** o desenho, os pesos e os critérios são gravados antes do primeiro teste. Cada variação testada depois é contada.'),
  B('**Exigência maior de significância:** com centenas de fatores já testados no mundo, a estatística t mínima recomendada é 3, e não 2 (Harvey; Liu; Zhu, 2016).'),
  B('**Índice de Sharpe deflacionado:** desconta do Sharpe a sorte esperada pelo número de tentativas (Bailey; López de Prado, 2014).'),
  B('**Probabilidade de sobreajuste:** mede, por validação cruzada combinatória, a chance de a melhor variação no passado ficar abaixo da mediana no futuro (Bailey et al., 2017; López de Prado, 2018).'),
  B('**Comparação de variações:** quando várias versões forem comparadas, usa-se o teste de realidade de White (2000) ou o de Hansen (2005), que levam em conta o fato de terem sido testadas juntas.'),
  ...F('IC = (1 / T) · Σₜ ρₜ(Sᵢ,ₜ ; Retᵢ,ₜ₊₁)',
    'o coeficiente de informação {IC} é igual a {1} dividido por {T} vezes a soma, em cada mês {t}, da correlação de postos {ρₜ} entre o Score {Sᵢ,ₜ} de cada ação {i} e o retorno {Retᵢ,ₜ₊₁} dessa ação no período seguinte; {T} é o número de meses.',
    'em média, mostra se a ordem do ranking acerta a ordem dos retornos que vieram depois (Grinold; Kahn, 2000).'),

  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('5. Critérios propostos')], keepNext: true, spacing: { before: 480 } }),
  P('Os critérios abaixo substituem os da versão 0.1 e ficam mais rígidos, conforme a literatura sobre excesso de testes.'),
  tabela(['Medida', 'Critério para publicar'], [
    ['Estatística t do Score (Fama-MacBeth)', 'maior ou igual a 3'],
    ['Alfa do quintil do topo menos o de baixo', 'positivo, com t ≥ 2, contra os 5 fatores do NEFIN'],
    ['Sharpe deflacionado', 'probabilidade acima de 95%'],
    ['Probabilidade de sobreajuste', 'abaixo de 20%'],
    ['Período guardado (36 meses)', 'quintil do topo à frente do Ibovespa depois dos custos'],
  ], [4500, 4500]),
  P('Mesmo aprovado, o Score segue sendo acompanhado: se o coeficiente de informação dos últimos 12 meses ficar negativo, a tela volta para "Ranking em calibração" até a revisão.'),

  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('6. Decisões para a próxima rodada')], keepNext: true, spacing: { before: 480 } }),
  P('Para fechar a versão 1.0, é preciso decidir:'),
  N('**Pesos iguais (25% cada)** no começo, como recomenda a literatura, ou os pesos da versão 0.1.', 'numeros2'),
  N('**Pilar 3:** trocar crescimento e aceleração por momento fundamental (surpresa de lucro e escore de crescimento saudável).', 'numeros2'),
  N('**Ajuste do momentum pela volatilidade:** usar ou não na camada 6.', 'numeros2'),
  N('**Fontes de dados extras:** histórico de preços desde 2006 e fatores do NEFIN-USP, ambos públicos.', 'numeros2'),
  N('**Critérios do capítulo 5:** aprovar como estão ou ajustar.', 'numeros2'),

  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('7. Referências')], keepNext: true, spacing: { before: 480 } }),
  P('Lista no padrão ABNT (NBR 6023). Artigos e livros citados nesta versão.'),
  R('ALTMAN, E. I. Financial ratios, discriminant analysis and the prediction of corporate bankruptcy. **The Journal of Finance**, v. 23, n. 4, p. 589-609, 1968.'),
  R('AMIHUD, Y. Illiquidity and stock returns: cross-section and time-series effects. **Journal of Financial Markets**, v. 5, n. 1, p. 31-56, 2002.'),
  R('ANG, A.; HODRICK, R. J.; XING, Y.; ZHANG, X. The cross-section of volatility and expected returns. **The Journal of Finance**, v. 61, n. 1, p. 259-299, 2006.'),
  R('ASNESS, C. S.; FRAZZINI, A.; PEDERSEN, L. H. Quality minus junk. **Review of Accounting Studies**, v. 24, n. 1, p. 34-112, 2019.'),
  R('ASNESS, C. S.; MOSKOWITZ, T. J.; PEDERSEN, L. H. Value and momentum everywhere. **The Journal of Finance**, v. 68, n. 3, p. 929-985, 2013.'),
  R('BAILEY, D. H.; BORWEIN, J. M.; LÓPEZ DE PRADO, M.; ZHU, Q. J. Pseudo-mathematics and financial charlatanism: the effects of backtest overfitting on out-of-sample performance. **Notices of the American Mathematical Society**, v. 61, n. 5, p. 458-471, 2014.'),
  R('BAILEY, D. H.; BORWEIN, J. M.; LÓPEZ DE PRADO, M.; ZHU, Q. J. The probability of backtest overfitting. **Journal of Computational Finance**, v. 20, n. 4, p. 39-69, 2017.'),
  R('BAILEY, D. H.; LÓPEZ DE PRADO, M. The deflated Sharpe ratio: correcting for selection bias, backtest overfitting and non-normality. **The Journal of Portfolio Management**, v. 40, n. 5, p. 94-107, 2014.'),
  R('BAKER, M.; BRADLEY, B.; WURGLER, J. Benchmarks as limits to arbitrage: understanding the low-volatility anomaly. **Financial Analysts Journal**, v. 67, n. 1, p. 40-54, 2011.'),
  R('BARROSO, P.; SANTA-CLARA, P. Momentum has its moments. **Journal of Financial Economics**, v. 116, n. 1, p. 111-120, 2015.'),
  R('BENEISH, M. D. The detection of earnings manipulation. **Financial Analysts Journal**, v. 55, n. 5, p. 24-36, 1999.'),
  R('BERNARD, V. L.; THOMAS, J. K. Post-earnings-announcement drift: delayed price response or risk premium? **Journal of Accounting Research**, v. 27, suplemento, p. 1-36, 1989.'),
  R('BORTOLUZZO, A. B.; PISTILI, G. N.; BORTOLUZZO, M. M. Analyzing the quality factor for Brazil. **Revista Brasileira de Finanças**, v. 19, n. 3, 2021.'),
  R('BROCK, W.; LAKONISHOK, J.; LEBARON, B. Simple technical trading rules and the stochastic properties of stock returns. **The Journal of Finance**, v. 47, n. 5, p. 1731-1764, 1992.'),
  R('CAMPBELL, J. Y.; HILSCHER, J.; SZILAGYI, J. In search of distress risk. **The Journal of Finance**, v. 63, n. 6, p. 2899-2939, 2008.'),
  R('CARHART, M. M. On persistence in mutual fund performance. **The Journal of Finance**, v. 52, n. 1, p. 57-82, 1997.'),
  R('CHAN, L. K. C.; JEGADEESH, N.; LAKONISHOK, J. Momentum strategies. **The Journal of Finance**, v. 51, n. 5, p. 1681-1713, 1996.'),
  R('CHAN, L. K. C.; KARCESKI, J.; LAKONISHOK, J. The level and persistence of growth rates. **The Journal of Finance**, v. 58, n. 2, p. 643-684, 2003.'),
  R('CIVILETTI, F.; CAMPANI, C. H.; ROQUETE, R. Carteiras igualmente ponderadas e "efeito momentum": uma combinação interessante para investidores não sofisticados? **Brazilian Business Review**, v. 17, n. 5, p. 507-522, 2020.'),
  R('DA, Z.; GURUN, U. G.; WARACHKA, M. Frog in the pan: continuous information and momentum. **The Review of Financial Studies**, v. 27, n. 7, p. 2171-2218, 2014.'),
  R('DANIEL, K.; MOSKOWITZ, T. J. Momentum crashes. **Journal of Financial Economics**, v. 122, n. 2, p. 221-247, 2016.'),
  R('DEMIGUEL, V.; GARLAPPI, L.; UPPAL, R. Optimal versus naive diversification: how inefficient is the 1/N portfolio strategy? **The Review of Financial Studies**, v. 22, n. 5, p. 1915-1953, 2009.'),
  R('FAMA, E. F.; MACBETH, J. D. Risk, return, and equilibrium: empirical tests. **Journal of Political Economy**, v. 81, n. 3, p. 607-636, 1973.'),
  R('FRAZZINI, A.; PEDERSEN, L. H. Betting against beta. **Journal of Financial Economics**, v. 111, n. 1, p. 1-25, 2014.'),
  R('GEORGE, T. J.; HWANG, C.-Y. The 52-week high and momentum investing. **The Journal of Finance**, v. 59, n. 5, p. 2145-2176, 2004.'),
  R('GRAY, W. R.; CARLISLE, T. E. **Quantitative value**: a practitioner\'s guide to automating intelligent investment and eliminating behavioral errors. Hoboken: Wiley, 2012.'),
  R('GRAY, W. R.; VOGEL, J. R. **Quantitative momentum**: a practitioner\'s guide to building a momentum-based stock selection system. Hoboken: Wiley, 2016.'),
  R('GREENBLATT, J. **The little book that beats the market**. Hoboken: Wiley, 2006.'),
  R('GRINOLD, R. C.; KAHN, R. N. **Active portfolio management**: a quantitative approach for producing superior returns and controlling risk. 2. ed. New York: McGraw-Hill, 2000.'),
  R('HANSEN, P. R. A test for superior predictive ability. **Journal of Business & Economic Statistics**, v. 23, n. 4, p. 365-380, 2005.'),
  R('HARVEY, C. R.; LIU, Y.; ZHU, H. … and the cross-section of expected returns. **The Review of Financial Studies**, v. 29, n. 1, p. 5-68, 2016.'),
  R('HOU, K.; XUE, C.; ZHANG, L. Replicating anomalies. **The Review of Financial Studies**, v. 33, n. 5, p. 2019-2133, 2020.'),
  R('JEGADEESH, N.; TITMAN, S. Returns to buying winners and selling losers: implications for stock market efficiency. **The Journal of Finance**, v. 48, n. 1, p. 65-91, 1993.'),
  R('LEE, C. M. C.; SWAMINATHAN, B. Price momentum and trading volume. **The Journal of Finance**, v. 55, n. 5, p. 2017-2069, 2000.'),
  R('LEV, B.; THIAGARAJAN, S. R. Fundamental information analysis. **Journal of Accounting Research**, v. 31, n. 2, p. 190-215, 1993.'),
  R('LÓPEZ DE PRADO, M. **Advances in financial machine learning**. Hoboken: Wiley, 2018.'),
  R('LOUGHRAN, T.; WELLMAN, J. W. New evidence on the relation between the enterprise multiple and average stock returns. **Journal of Financial and Quantitative Analysis**, v. 46, n. 6, p. 1629-1650, 2011.'),
  R('McLEAN, R. D.; PONTIFF, J. Does academic research destroy stock return predictability? **The Journal of Finance**, v. 71, n. 1, p. 5-32, 2016.'),
  R('MOHANRAM, P. S. Separating winners from losers among low book-to-market stocks using financial statement analysis. **Review of Accounting Studies**, v. 10, n. 2, p. 133-170, 2005.'),
  R('NEFIN — CENTRO BRASILEIRO DE PESQUISA EM ECONOMIA FINANCEIRA DA USP. **Fatores de risco** (mercado, tamanho, valor, momentum e iliquidez). São Paulo: USP. Disponível em: https://nefin.com.br/. Acesso em: 16 out. 2026.'),
  R('NEWEY, W. K.; WEST, K. D. A simple, positive semi-definite, heteroskedasticity and autocorrelation consistent covariance matrix. **Econometrica**, v. 55, n. 3, p. 703-708, 1987.'),
  R('NOVY-MARX, R. Is momentum really momentum? **Journal of Financial Economics**, v. 103, n. 3, p. 429-453, 2012.'),
  R('NOVY-MARX, R. The other side of value: the gross profitability premium. **Journal of Financial Economics**, v. 108, n. 1, p. 1-28, 2013.'),
  R('NOVY-MARX, R. **Fundamentally, momentum is fundamental momentum**. Cambridge: National Bureau of Economic Research, 2015. (NBER Working Paper, 20984).'),
  R('NOVY-MARX, R.; VELIKOV, M. A taxonomy of anomalies and their trading costs. **The Review of Financial Studies**, v. 29, n. 1, p. 104-147, 2016.'),
  R('PIOTROSKI, J. D. Value investing: the use of historical financial statement information to separate winners from losers. **Journal of Accounting Research**, v. 38, suplemento, p. 1-41, 2000.'),
  R('SLOAN, R. G. Do stock prices fully reflect information in accruals and cash flows about future earnings? **The Accounting Review**, v. 71, n. 3, p. 289-315, 1996.'),
  R('WHITE, H. A reality check for data snooping. **Econometrica**, v. 68, n. 5, p. 1097-1126, 2000.'),
];
const doc = new Document({
  creator: 'SOLIDUNS', title: 'Score Exponencial — arquitetura e fundamentação v0.2',
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
          new TextRun({ text: '   SOLIDUNS · Score Exponencial', size: 17, color: CINZA }), new TextRun({ text: '\tArquitetura v0.2 — rascunho', size: 17, color: CINZA })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Página ', size: 17, color: CINZA }), new TextRun({ children: [PageNumber.CURRENT], size: 17, color: CINZA }),
          new TextRun({ text: '  ·  Uso interno. Não é recomendação de investimento.', size: 17, color: CINZA })] })] }) },
      children: corpo.map((x, i) => (i === 0 && x instanceof Paragraph) ? x : x) },
  ],
});
// o primeiro H1 do corpo não precisa de quebra (já começa em seção nova)
Packer.toBuffer(doc).then(b => { fs.writeFileSync('/home/claude/v131/score/Score_Exponencial_arquitetura_v0.2.docx', b); console.log('ok', b.length); });
