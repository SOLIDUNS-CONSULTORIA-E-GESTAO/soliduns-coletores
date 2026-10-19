
/* ===== v114 — PÁGINA DO ATIVO ESTILO INVESTING.COM (cabeçalho, abas, widgets, análise técnica) ===== */
var AT = {aba: 'geral'};
var AT_ABAS = [['geral', 'Geral'], ['grafico', 'Gráfico'], ['noticias', 'Notícias e análises'], ['financas', 'Finanças / DRE'], ['tecnica', 'Análise técnica']];
var AT_SECOES = {'Pontos de atenção': 'geral', 'Indicadores × mediana do setor': 'geral', 'Desempenho vs. índice': 'geral', 'Comparação com o setor': 'geral',
  'Preço e volume': 'grafico', 'Resultado e balanço': 'financas', 'Evolução anual': 'financas', 'Balanço e resultado': 'financas', 'Proventos dos últimos 12 meses': 'financas'};
var AT_SINAL = {fa: ['COMPRA FORTE', 'trend--strong-buy'], a: ['COMPRA', 'trend--buy'], n: ['NEUTRO', 'trend--neutral'],   /* v116 */
                b: ['VENDA', 'trend--sell'], fb: ['VENDA FORTE', 'trend--strong-sell']};
function atN(v){ return (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v); }
function atF(v, c){ return v === null || v === undefined || !isFinite(v) ? '—' : Number(v).toLocaleString('pt-BR', {minimumFractionDigits: c === undefined ? 2 : c, maximumFractionDigits: c === undefined ? 2 : c}); }
function atMoeda(d){ return d.mercado === 'us' ? 'US$' : 'R$'; }
function atSerie(d){ return (typeof giSerieV110 === 'function' ? giSerieV110(d) : (d.precos || []).map(x => ({d: String(x.d).slice(0, 10), p: atN(x.p), o: atN(x.o), h: atN(x.h), l: atN(x.l), v: atN(x.v)}))).filter(x => x.p !== null); }
/* ---------- situação do pregão (horário regular; feriados não considerados) ---------- */
function atSessao(mercado){
  const tz = mercado === 'us' ? 'America/New_York' : 'America/Sao_Paulo';
  const p = new Intl.DateTimeFormat('en-US', {timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date())
    .reduce((o, x) => { o[x.type] = x.value; return o; }, {});
  const min = Number(p.hour) * 60 + Number(p.minute), util = !['Sat', 'Sun'].includes(p.weekday);
  const aberto = util && (mercado === 'us' ? (min >= 570 && min < 960) : (min >= 600 && min < 1020));
  return {aberto: aberto, txt: (mercado === 'us' ? 'NYSE/Nasdaq' : 'B3') + (aberto ? ': pregão aberto agora (horário regular)' : ': pregão fechado')};
}
/* ---------- indicadores técnicos ---------- */
function atWilder(v, n){ const out = new Array(v.length).fill(null); if(v.length < n) return out;
  let s = 0; for(let i = 0; i < n; i++) s += v[i]; let a = s / n; out[n - 1] = a;
  for(let i = n; i < v.length; i++){ a = (a * (n - 1) + v[i]) / n; out[i] = a; } return out; }
function atTecnica(d){
  let s = atSerie(d);
  { let k = s.length; while(k > 0 && (s[k - 1].h === null || s[k - 1].l === null)) k--;   /* v115: até o último pregão completo */
    if(k >= 2 && s.length - k <= 5 && s.slice(0, k).every(x => x.h !== null && x.l !== null)) s = s.slice(0, k); }
  const n = s.length, c = s.map(x => x.p), ult = c[n - 1];
  const temHL = n > 0 && s.every(x => x.h !== null && x.l !== null);
  const H = s.map(x => x.h), L = s.map(x => x.l);
  const sinal = (k) => AT_SINAL[k];
  /* médias móveis */
  const mms = [5, 10, 20, 50, 100, 200].map(p => {
    const sm = n >= p ? giSMA(c, p)[n - 1] : null, em = n >= p ? giEMA(c, p)[n - 1] : null;
    const sg = v => v === null ? null : (ult > v * 1.0005 ? 'a' : (ult < v * 0.9995 ? 'b' : 'n'));
    return {p: p, sma: sm, ema: em, ss: sg(sm), se: sg(em), falta: Math.max(0, p - n)};
  });
  /* osciladores */
  const osc = [];
  const rsi = n >= 15 ? giRSI(c, 14)[n - 1] : null;
  osc.push({nome: 'RSI (14)', v: rsi, s: rsi === null ? null : (rsi < 30 ? 'a' : rsi > 70 ? 'b' : 'n'), obs: rsi === null ? '' : (rsi < 30 ? 'sobrevendido' : rsi > 70 ? 'sobrecomprado' : ''), falta: Math.max(0, 15 - n)});
  let st = null, stD = null;
  if(temHL && n >= 16){ const k = []; for(let i = 13; i < n; i++){ const hh = Math.max.apply(null, H.slice(i - 13, i + 1)), ll = Math.min.apply(null, L.slice(i - 13, i + 1)); k.push(hh === ll ? 50 : (c[i] - ll) / (hh - ll) * 100); }
    const kk = giSMA(k, 3); st = kk[kk.length - 1]; stD = giSMA(kk.filter(x => x !== null), 3).pop(); }
  osc.push({nome: 'Estocástico (14, 3)', v: st, s: st === null ? null : (st < 20 ? 'a' : st > 80 ? 'b' : 'n'), obs: st === null ? '' : (st < 20 ? 'sobrevendido' : st > 80 ? 'sobrecomprado' : ''), falta: Math.max(0, 16 - n), hl: true});
  let macd = null, macdSin = null;
  if(n >= 35){ const e12 = giEMA(c, 12), e26 = giEMA(c, 26), m = []; for(let i = 25; i < n; i++) m.push(e12[i] - e26[i]);
    const sg = giEMA(m, 9); macd = m[m.length - 1]; macdSin = sg[sg.length - 1]; }
  osc.push({nome: 'MACD (12, 26, 9)', v: macd, s: macd === null ? null : (macd > macdSin ? 'a' : macd < macdSin ? 'b' : 'n'), obs: macd === null ? '' : 'sinal ' + atF(macdSin), falta: Math.max(0, 35 - n)});
  let adx = null, pdi = null, mdi = null, atr = null;
  if(temHL && n >= 15){
    const tr = [0], pdm = [0], mdm = [0];
    for(let i = 1; i < n; i++){ tr.push(Math.max(H[i] - L[i], Math.abs(H[i] - c[i - 1]), Math.abs(L[i] - c[i - 1])));
      const up = H[i] - H[i - 1], dn = L[i - 1] - L[i]; pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0); }
    const atrS = atWilder(tr.slice(1), 14); atr = atrS[atrS.length - 1];
    if(n >= 29){ const tS = atWilder(tr.slice(1), 14), pS = atWilder(pdm.slice(1), 14), mS = atWilder(mdm.slice(1), 14), dx = [];
      for(let i = 13; i < tS.length; i++){ const p = 100 * pS[i] / tS[i], m = 100 * mS[i] / tS[i]; dx.push(p + m === 0 ? 0 : 100 * Math.abs(p - m) / (p + m)); pdi = p; mdi = m; }
      const ad = atWilder(dx, 14); adx = ad[ad.length - 1]; }
  }
  osc.push({nome: 'ADX (14)', v: adx, s: adx === null ? null : (adx > 25 ? (pdi > mdi ? 'a' : 'b') : 'n'), obs: adx === null ? '' : (adx > 25 ? 'tendência forte' : 'sem tendência definida'), falta: Math.max(0, 29 - n), hl: true});
  osc.push({nome: 'ATR (14)', v: atr, s: atr === null ? null : 'n', obs: atr === null ? '' : 'volatilidade: ' + atF(atr / ult * 100, 1) + '% do preço', falta: Math.max(0, 15 - n), hl: true});
  let cci = null;
  if(temHL && n >= 20){ const tp = s.map(x => (x.h + x.l + x.p) / 3), m = giSMA(tp, 20)[n - 1]; let md = 0; for(let i = n - 20; i < n; i++) md += Math.abs(tp[i] - m); md /= 20;
    cci = md === 0 ? 0 : (tp[n - 1] - m) / (0.015 * md); }
  osc.push({nome: 'CCI (20)', v: cci, s: cci === null ? null : (cci > 100 ? 'a' : cci < -100 ? 'b' : 'n'), obs: '', falta: Math.max(0, 20 - n), hl: true});
  osc.forEach(o => { if(o.hl && !temHL) o.semHL = true; });
  /* pivôs (último pregão) */
  let piv = null;
  if(temHL && n >= 1){ const h = H[n - 1], l = L[n - 1], cc = c[n - 1], P = (h + l + cc) / 3, r = h - l;
    piv = {
      'Clássicos': {S3: l - 2 * (h - P), S2: P - r, S1: 2 * P - h, P: P, R1: 2 * P - l, R2: P + r, R3: h + 2 * (P - l)},
      'Fibonacci': {S3: P - r, S2: P - 0.618 * r, S1: P - 0.382 * r, P: P, R1: P + 0.382 * r, R2: P + 0.618 * r, R3: P + r},
      'Camarilla': {S3: cc - r * 1.1 / 4, S2: cc - r * 1.1 / 6, S1: cc - r * 1.1 / 12, P: P, R1: cc + r * 1.1 / 12, R2: cc + r * 1.1 / 6, R3: cc + r * 1.1 / 4}}; }
  /* resumo */
  const cont = (l) => l.reduce((o, k) => { if(k){ o[k] = (o[k] || 0) + 1; o.t++; } return o; }, {a: 0, b: 0, n: 0, t: 0});
  const cm = cont(mms.reduce((l, m) => l.concat([m.ss, m.se]), [])), co = cont(osc.map(o => o.s));
  /* mínimo de indicadores para dar parecer: médias 4 sinais; osciladores 2; resumo geral 6, com ao menos 1 oscilador */
  const resumo = (x, min) => { if(x.t < min) return null; const sc = (x.a - x.b) / x.t; return {sc: sc, k: sc >= 0.5 ? 'fa' : sc >= 0.1 ? 'a' : sc <= -0.5 ? 'fb' : sc <= -0.1 ? 'b' : 'n', t: x.t, a: x.a, b: x.b, n: x.n}; };
  const tot = {a: cm.a + co.a, b: cm.b + co.b, n: cm.n + co.n, t: cm.t + co.t};
  return {n: n, temHL: temHL, mms: mms, osc: osc, piv: piv, rm: resumo(cm, 4), ro: resumo(co, 2), r: co.t >= 1 ? resumo(tot, 6) : null, ult: ult, data: n ? s[n - 1].d : null};
}
function atSinalHtml(k, falta, semHL){
  if(semHL) return '<span class="at-sinal nd">precisa de máxima e mínima</span>';
  if(!k) return '<span class="at-sinal nd">' + (falta ? 'faltam ' + falta + ' pregões' : '—') + '</span>';
  return '<span class="at-sinal ' + AT_SINAL[k][1] + '">' + AT_SINAL[k][0] + '</span>';
}
function atGaugeSvg(r){
  const ang = r ? Math.max(-1, Math.min(1, r.sc)) * 90 : 0, cores = ['#e2793f', '#e9a23b', '#8a877f', '#7fbf9a', '#3ecb99'];
  const arco = (a0, a1, cor) => { const p = a => [100 + 80 * Math.cos((a - 90) * Math.PI / 180), 100 + 80 * Math.sin((a - 90) * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1); return '<path d="M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' A80 80 0 0 1 ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + '" stroke="' + cor + '" stroke-width="16" fill="none"/>'; };
  let g = ''; for(let i = 0; i < 5; i++) g += arco(-90 + i * 36 + 1, -90 + (i + 1) * 36 - 1, cores[i]);
  const nx = 100 + 70 * Math.cos((ang - 90) * Math.PI / 180), ny = 100 + 70 * Math.sin((ang - 90) * Math.PI / 180);
  g += r ? '<line x1="100" y1="100" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) + '" stroke="#f2ecd8" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="100" r="6" fill="#f2ecd8"/>' : '';
  g += '<text x="18" y="118" font-size="10" fill="#a89f88">VENDA FORTE</text><text x="182" y="118" font-size="10" fill="#a89f88" text-anchor="end">COMPRA FORTE</text>';
  return '<svg class="at-gauge" viewBox="0 0 200 122" role="img" aria-label="Velocímetro de análise técnica">' + g + '</svg>'
    + '<p class="at-gauge-rot ' + (r ? 'at-sinal ' + AT_SINAL[r.k][1] : 'at-sinal nd') + '">' + (r ? AT_SINAL[r.k][0] : 'Dados insuficientes') + '</p>';
}
/* ---------- widgets fundamentalistas ---------- */
function atSaude(d){
  const i = d.indicadores || {}, fin = !!(d.financeira || i.financeira), crit = [];
  const add = (rot, v, ok) => crit.push({rot: rot, ok: v === null ? null : ok(v)});
  add('Lucro nos últimos 12 meses', atN(i.margem_liquida) !== null ? atN(i.margem_liquida) : atN(i.lpa), v => v > 0);
  add('ROE de pelo menos 10%', atN(i.roe), v => v >= 10);
  if(!fin){ add('Dívida líquida até 3× o EBIT', atN(i.div_liq_ebit), v => v <= 3);
            add('Liquidez corrente de pelo menos 1', atN(i.liq_corrente), v => v >= 1); }
  else crit.push({rot: 'Dívida e liquidez: não se aplicam a banco', ok: undefined});
  add('Lucro crescendo em 5 anos', atN(i.cagr_lucros) !== null ? atN(i.cagr_lucros) : atN(i.cagr_receitas), v => v > 0);
  const val = crit.filter(c => c.ok === true || c.ok === false), sim = val.filter(c => c.ok).length;
  return {crit: crit, nota: val.length >= 3 ? Math.max(1, Math.round(sim / val.length * 5)) : null, sim: sim, n: val.length};
}
function atPrecoJusto(d){
  const i = d.indicadores || {}, preco = atN(i.preco) !== null ? atN(i.preco) : (atSerie(d).slice(-1)[0] || {}).p, lpa = atN(i.lpa), vpa = atN(i.vpa), dy = atN(i.dy);
  const graham = lpa > 0 && vpa > 0 ? Math.sqrt(22.5 * lpa * vpa) : null;
  const dpa = dy > 0 && preco ? dy / 100 * preco : null, bazin = dpa ? dpa / 0.06 : null;
  return {preco: preco, graham: graham, bazin: bazin, pg: graham && preco ? (graham / preco - 1) * 100 : null, pb: bazin && preco ? (bazin / preco - 1) * 100 : null};
}
function atLateralHtml(d, tec){
  const sa = atSaude(d), pj = atPrecoJusto(d), m = atMoeda(d);
  const est = sa.nota ? '<div class="at-estrelas" aria-label="' + sa.nota + ' de 5">' + '★★★★★'.slice(0, sa.nota) + '<span class="off">' + '★★★★★'.slice(sa.nota) + '</span></div>'
    : '<p class="at-mini">Dados insuficientes (menos de 3 critérios com dado).</p>';
  const pot = v => v === null ? '' : ' <span class="at-sinal ' + (v >= 0 ? 'alta' : 'baixa') + '">(' + (v >= 0 ? '+' : '') + atF(v, 1) + '%)</span>';
  return '<div><h4>Saúde financeira</h4>' + est + '<ul class="at-crit">'
    + sa.crit.map(c => '<li><span class="' + (c.ok === true ? 's' : c.ok === false ? 'n' : 'x') + '">' + (c.ok === true ? '✓' : c.ok === false ? '✗' : '–') + '</span> ' + c.rot + (c.ok === null ? ' <span class="x">(sem dado)</span>' : '') + '</li>').join('')
    + '</ul><p class="at-mini">Critérios SOLIDUNS sobre o último balanço. Não é recomendação.</p></div>'
    + '<div><h4>Preço justo (fórmulas clássicas)</h4>'
    + '<div class="at-pj"><span>Cotação</span><b>' + m + ' ' + atF(pj.preco) + '</b></div>'
    + '<div class="at-pj"><span title="√(22,5 × LPA × VPA)">Graham</span><b>' + (pj.graham ? m + ' ' + atF(pj.graham) + pot(pj.pg) : '—') + '</b></div>'
    + '<div class="at-pj"><span title="dividendo por ação ÷ 6%">Bazin</span><b>' + (pj.bazin ? m + ' ' + atF(pj.bazin) + pot(pj.pb) : '—') + '</b></div>'
    + '<p class="at-mini">Graham = √(22,5 × LPA × VPA), só com lucro e patrimônio positivos. Bazin = dividendo por ação dos últimos 12 meses ÷ 6%. '
    + 'Estimativas por fórmula, não são preço-alvo nem recomendação.</p></div>'
    + '<div><h4>Análise técnica</h4>' + atGaugeSvg(tec.r)
    + '<p class="at-mini">' + (tec.r ? tec.r.a + ' compra · ' + tec.r.n + ' neutro · ' + tec.r.b + ' venda, de ' + tec.r.t + ' indicadores calculados' : 'Com ' + tec.n + ' pregões guardados ainda não há indicadores suficientes')
    + ' (diário, até ' + (tec.data ? rgDMA(tec.data) : '—') + ').</p></div>';
}
function atTecnicaHtml(d, tec){
  const m = atMoeda(d), res = (r, rot) => '<span>' + rot + ': ' + (r ? atSinalHtml(r.k) + ' (' + r.a + ' compra · ' + r.n + ' neutro · ' + r.b + ' venda)' : '<span class="at-sinal nd">dados insuficientes</span>') + '</span>';
  let h = '<div class="at-resumo">' + res(tec.r, 'Resumo') + res(tec.rm, 'Médias móveis') + res(tec.ro, 'Osciladores') + '</div>'
    + '<p class="prova-nota" style="margin-top:0;">Leitura automática de indicadores técnicos sobre os fechamentos diários guardados pela SOLIDUNS (' + tec.n + ' pregões, até '
    + (tec.data ? rgDMA(tec.data) : '—') + ').</p>';
  h += '<h4 class="rel-h4">Médias móveis</h4><div class="rel-tabela-wrap"><table class="at-tab"><thead><tr><th>Período</th><th class="num">Simples (SMA)</th><th>Sinal</th><th class="num">Exponencial (EMA)</th><th>Sinal</th></tr></thead><tbody>'
    + tec.mms.map(x => '<tr><td>MA ' + x.p + '</td><td class="num">' + (x.sma === null ? '—' : atF(x.sma)) + '</td><td>' + atSinalHtml(x.ss, x.falta) + '</td><td class="num">'
      + (x.ema === null ? '—' : atF(x.ema)) + '</td><td>' + atSinalHtml(x.se, x.falta) + '</td></tr>').join('') + '</tbody></table></div>'
    + '<p class="prova-nota" style="margin-top:-8px;">Sinal: cotação acima da média = alta; abaixo = baixa.</p>';
  h += '<h4 class="rel-h4">Osciladores</h4><div class="rel-tabela-wrap"><table class="at-tab"><thead><tr><th>Indicador</th><th class="num">Valor</th><th>Leitura</th><th></th></tr></thead><tbody>'
    + tec.osc.map(o => '<tr><td>' + o.nome + '</td><td class="num">' + (o.v === null ? '—' : atF(o.v)) + '</td><td>' + atSinalHtml(o.s, o.falta, o.semHL) + '</td><td style="font-size:11.5px; color:var(--ink-soft);">' + (o.obs || '') + '</td></tr>').join('')
    + '</tbody></table></div>';
  h += '<h4 class="rel-h4">Pontos de pivô (último pregão)</h4>';
  if(!tec.piv) h += '<p class="prova-nota">Os pivôs usam a máxima, a mínima e o fechamento do último pregão. ' + (d.mercado === 'us' ? 'Sem esses dados para este papel.' : 'No Brasil a SOLIDUNS guarda só o fechamento diário; os pivôs aparecem quando a máxima e a mínima forem coletadas.') + '</p>';
  else h += '<div class="rel-tabela-wrap"><table class="at-tab"><thead><tr><th>Método</th>' + ['S3', 'S2', 'S1', 'Pivô', 'R1', 'R2', 'R3'].map(x => '<th class="num">' + x + '</th>').join('') + '</tr></thead><tbody>'
    + Object.keys(tec.piv).map(k => '<tr><td>' + k + '</td>' + ['S3', 'S2', 'S1', 'P', 'R1', 'R2', 'R3'].map(n => '<td class="num">' + atF(tec.piv[k][n]) + '</td>').join('') + '</tr>').join('')
    + '</tbody></table></div><p class="prova-nota" style="margin-top:-8px;">Valores em ' + m + '. S = suporte; R = resistência.</p>';
  return h;
}
/* ---------- cabeçalho ---------- */
function atFaixaHtml(rot, min, max, v, m, nd){
  if(nd) return '<div class="at-faixa"><span>' + rot + '</span><div class="at-faixa-nd">' + nd + '</div></div>';
  const pos = max > min ? Math.max(0, Math.min(100, (v - min) / (max - min) * 100)) : 50;
  return '<div class="at-faixa"><span>' + rot + '</span><div class="at-faixa-trilho"><div class="at-faixa-marca" style="left:' + pos.toFixed(1) + '%;"></div></div>'
    + '<div class="at-faixa-num"><span>' + m + ' ' + atF(min) + '</span><span>' + m + ' ' + atF(max) + '</span></div></div>';
}
function atTopoHtml(d){
  const i = d.indicadores || {}, f = d.fundamentos || {}, s = atSerie(d), n = s.length, m = atMoeda(d), us = d.mercado === 'us';
  const ult = s[n - 1] || null, ant = s[n - 2] || null;
  const preco = atN(i.preco) !== null ? atN(i.preco) : (ult ? ult.p : null);
  let dv = null, dp = null;
  if(ult && ant){ dv = ult.p - ant.p; dp = (ult.p / ant.p - 1) * 100; }
  else if(atN(i.variacao_pct) !== null && preco){ dp = atN(i.variacao_pct); dv = preco - preco / (1 + dp / 100); }
  const ses = atSessao(d.mercado), dataF = ult ? rgDMA(ult.d) : (i.dt_preco ? relDataBR(i.dt_preco) : '—');
  const uhl = s.slice().reverse().find(x => x.h !== null && x.l !== null);   /* v115: último pregão com máxima e mínima */
  const dia = uhl ? atFaixaHtml('Faixa do dia (' + rgDMA(uhl.d) + ')', uhl.l, uhl.h, uhl.p, m)
    : atFaixaHtml('Faixa do dia', 0, 0, 0, m, us ? 'Sem máxima/mínima para este papel.' : 'No Brasil a SOLIDUNS guarda só o fechamento diário.');
  let ano = '';
  if(n >= 2){ const fim = rgData(s[n - 1].d), ini = new Date(fim.getTime() - 365 * 864e5).toISOString().slice(0, 10), j = s.filter(x => x.d >= ini);
    const lo = Math.min.apply(null, j.map(x => x.l !== null ? x.l : x.p)), hi = Math.max.apply(null, j.map(x => x.h !== null ? x.h : x.p));
    const cheio = rgData(s[0].d) <= new Date(fim.getTime() - 360 * 864e5);
    ano = atFaixaHtml(cheio ? 'Faixa de 52 semanas' : 'Faixa do período guardado (desde ' + rgDMA(j[0].d) + ', ' + j.length + ' pregões — 52 semanas quando houver 1 ano)', lo, hi, preco || ult.p, m); }
  else ano = atFaixaHtml('Faixa de 52 semanas', 0, 0, 0, m, 'Histórico de preços ainda curto.');
  const sub = (us ? (i.bolsa || f.bolsa || 'NYSE / Nasdaq') : 'B3') + ' · ' + escHtml(relSetorPT(d.setor) || '—') + (d.financeira ? ' · instituição financeira' : '');
  return '<div class="at-topo"><div><div class="at-id"><span class="at-tk">' + escHtml(d.ticker) + '</span><h2>' + escHtml(i.nome || f.empresa || d.ticker) + '</h2><span class="at-sub">' + sub + '</span></div>'
    + '<div class="at-cot"><b class="at-preco">' + (preco === null ? '—' : m + ' ' + atF(preco)) + '</b>'
    + (dp === null ? '' : '<span class="at-var ' + (dp >= 0 ? 'pos' : 'neg') + '">' + (dv >= 0 ? '+' : '') + atF(dv) + ' (' + (dp >= 0 ? '+' : '') + atF(dp) + '%)</span>')
    + '<div class="at-sessao' + (ses.aberto ? ' aberto' : '') + '"><i></i>' + ses.txt + ' · preço = último fechamento coletado (' + dataF + '), não é tempo real</div></div>'
    + '<div class="at-acoes">' + fvBotao(us ? 'us' : 'br', d.ticker) + '<button type="button" class="btn-leilao-secundario" data-at-carteira>+ Minha carteira</button></div></div>'
    + '<div>' + dia + ano + '</div></div>';
}
/* ---------- montagem: redistribui o relatório já desenhado nas abas ---------- */
function atMontarV114(caixa, d){
  const rel = caixa && caixa.querySelector('.rel-relatorio');
  if(!rel || rel.dataset.at || !d) return;
  rel.dataset.at = '1';
  const tec = atTecnica(d);
  const paineis = {}; AT_ABAS.forEach(a => { const p = document.createElement('div'); p.className = 'at-painel'; p.setAttribute('role', 'tabpanel'); p.dataset.aba = a[0]; paineis[a[0]] = p; });
  let atual = 'topo';
  const filhos = Array.from(rel.children), aviso = rel.querySelector('.rel-aviso-topicos');
  filhos.forEach(el => {
    if(el === aviso) return;
    if(el.matches('h3.rel-h3')) atual = AT_SECOES[el.textContent.trim()] || 'geral';
    if(atual === 'topo'){
      if(el.classList.contains('rel-cab')){ el.style.display = 'none'; return; }
      if(el.classList.contains('prova-info')){ paineis.geral.appendChild(el); return; }
      return;                                                   /* aviso de análise (ra-aviso-rel) fica no topo */
    }
    paineis[atual].appendChild(el);
  });
  paineis.tecnica.innerHTML = atTecnicaHtml(d, tec);
  paineis.noticias.innerHTML = '<p class="prova-nota">Carregando manchetes…</p>';
  const topo = document.createElement('div'); topo.innerHTML = atTopoHtml(d);
  const grade = document.createElement('div'); grade.className = 'at-grade';
  const principal = document.createElement('div'); principal.className = 'at-principal';
  const nav = document.createElement('div'); nav.className = 'at-abas'; nav.setAttribute('role', 'tablist');
  nav.innerHTML = AT_ABAS.map(a => '<button type="button" class="at-aba" role="tab" data-at-aba="' + a[0] + '">' + a[1] + '</button>').join('');
  principal.appendChild(nav); AT_ABAS.forEach(a => principal.appendChild(paineis[a[0]]));
  const lat = document.createElement('aside'); lat.className = 'at-lateral'; lat.innerHTML = atLateralHtml(d, tec);
  grade.appendChild(principal); grade.appendChild(lat);
  const ra = rel.querySelector('.ra-aviso-rel');
  rel.insertBefore(topo.firstElementChild, rel.firstChild);
  rel.insertBefore(grade, aviso || null);
  if(ra) rel.insertBefore(ra, grade);
  const mostrar = aba => {
    AT.aba = aba;
    nav.querySelectorAll('[data-at-aba]').forEach(b => { const on = b.dataset.atAba === aba; b.classList.toggle('ativa', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    AT_ABAS.forEach(a => { paineis[a[0]].hidden = a[0] !== aba; });
    if(aba === 'grafico' && GI && GI.g && GI.g.main){ setTimeout(() => { try{ const el = rel.querySelector('.gi-main'); if(el) GI.g.main.applyOptions({width: el.clientWidth}); }catch(e){} }, 30); }
  };
  nav.querySelectorAll('[data-at-aba]').forEach(b => b.addEventListener('click', () => mostrar(b.dataset.atAba)));
  mostrar(AT_ABAS.some(a => a[0] === AT.aba) ? AT.aba : 'geral');
  if(typeof fvLigar === 'function') fvLigar(rel);
  const bc = rel.querySelector('[data-at-carteira]');
  if(bc) bc.addEventListener('click', () => atCarteira(d));
  atNoticias(paineis.noticias, d);
}
function atCarteira(d){
  mfMostrarCarteira();
  setTimeout(() => {
    const tipo = document.getElementById('ct-tipo'), tk = document.getElementById('ct-tk'), q = document.getElementById('ct-q');
    if(tipo){ tipo.value = d.mercado === 'us' ? 'acao_us' : 'acao_br'; tipo.dispatchEvent(new Event('change')); }
    if(tk) tk.value = String(d.ticker).toUpperCase();
    if(q) q.focus();
    if(typeof ctAviso === 'function') ctAviso('Informe a quantidade (e o preço médio, se quiser) e clique em "Adicionar / atualizar".', true);
  }, 80);
}
async function atNoticias(painel, d){
  const reg = d.mercado === 'us' ? 'us' : 'br', i = d.indicadores || {}, f = d.fundamentos || {};
  const sem = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fora = new Set(['brasileiro', 'brasileira', 'participacoes', 'holding', 'corporation', 'company', 'incorporated', 'group', 'companhia', 'industria', 'comercio', 'servicos', 'sociedade', 'anonima', 'technologies', 'international']);
  const termos = new Set([sem(d.ticker)]);
  if(reg === 'br') termos.add(sem(String(d.ticker).replace(/\d+$/, '')));
  sem(i.nome || f.empresa || '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 5 && !fora.has(w)).slice(0, 2).forEach(w => termos.add(w));
  let ra = null; try{ if(typeof raDisponiveis === 'function') [ra] = await raDisponiveis(reg, [String(d.ticker).toUpperCase()]); }catch(e){}
  let itens = [];
  try{ if(!_ix.noticias[reg]) _ix.noticias[reg] = await relRpc('noticias_lista', {p_regiao: reg}); itens = ((_ix.noticias[reg] || {}).itens) || []; }catch(e){ itens = null; }
  if(!painel.isConnected) return;
  const lista = (itens || []).filter(x => { const t = ' ' + sem(x.t).replace(/[^a-z0-9]+/g, ' ') + ' '; return [...termos].some(w => w && t.indexOf(' ' + w + ' ') >= 0); }).slice(0, 25);
  let h = '<h4 class="rel-h4">Relatório de Análise SOLIDUNS</h4>'
    + (ra ? '<p><span class="ra-selo">ANÁLISE</span> Data-base ' + raData(ra.data_base) + '. <a href="#" data-at-ra>Abrir o relatório de análise &rarr;</a></p>' : '<p class="prova-nota">Ainda não há Relatório de Análise SOLIDUNS desta empresa.</p>')
    + '<h4 class="rel-h4">Manchetes que citam ' + escHtml(d.ticker) + '</h4>';
  if(itens === null) h += '<p class="prova-nota">Não foi possível carregar as manchetes agora.</p>';
  else if(!lista.length) h += '<p class="prova-nota">Nenhuma manchete recente cita ' + escHtml(d.ticker) + ' (busca por: ' + [...termos].map(escHtml).join(', ') + '). Veja todas na página <a href="#/noticias' + (d.mercado === 'us' ? '/eua' : '') + '">Notícias</a>.</p>';
  else h += '<ul class="nt-ul">' + lista.map(x => { const dt = x.d ? new Date(x.d) : null;
      return '<li class="nt-item"><span class="nt-hora">' + (dt ? dt.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}) : '') + '</span><span class="ip-selo nt-src">' + escHtml(x.f) + '</span>'
        + '<a class="nt-link" href="' + escHtml(x.l) + '" target="_blank" rel="noopener noreferrer">' + escHtml(x.t) + '</a></li>'; }).join('') + '</ul>'
    + '<p class="rel-aviso">Manchetes de fontes públicas, escolhidas automaticamente pelo nome e pelo código do ativo. A SOLIDUNS não escreve nem confere essas notícias.</p>';
  painel.innerHTML = h;
  const a = painel.querySelector('[data-at-ra]'); if(a) a.addEventListener('click', ev => { ev.preventDefault(); raPagina(null, reg, ra.acao, null); });
}
/* liga: depois que o relatório da TELA é montado (o PDF usa relHtml à parte e não muda) */
(function(){
  if(typeof relAbrir !== 'function') return;
  const original = relAbrir;
  relAbrir = async function(ticker){
    const r = await original.apply(this, arguments);
    try{ atMontarV114(document.getElementById('rel-conteudo'), _relAtual); }catch(e){ console.warn('[v114] página do ativo:', e); }
    return r;
  };
})();
