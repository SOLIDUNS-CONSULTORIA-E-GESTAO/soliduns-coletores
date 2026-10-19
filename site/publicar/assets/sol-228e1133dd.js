
/* ===== v110 — GRÁFICO INTERATIVO COM INDICADORES (Lightweight Charts 4.2.3, cópia local, Apache 2.0) =====
   Só na TELA do relatório. O PDF continua com o SVG da v51. Sem a biblioteca, fica o SVG. */
var GI_LIB = 'vendor/lightweight-charts-4.2.3.standalone.production.js';
var GI_IND = {
  sma: {rot: 'Média móvel simples — SMA (14)', min: 14, cor: '#f2ecd8'},   /* creme: não se confunde com o preço (dourado) */
  ema: {rot: 'Média móvel exponencial — EMA (14)', min: 14, cor: '#3f9bf0'},
  bb:  {rot: 'Bandas de Bollinger (20; 2 desvios)', min: 20, cor: '#b98cf5'},
  rsi: {rot: 'Índice de força relativa — RSI (14)', min: 15, cor: '#e2793f'},
  vol: {rot: 'Volume financeiro', min: 1, cor: '#8a877f'}
};
var GI = {per: '1A', modo: 'linha', ind: {sma: true, ema: false, bb: false, rsi: false, vol: true}, carregando: null, g: null};
(function(){ try{ const x = JSON.parse(localStorage.getItem('solidunsGraficoV110') || 'null');
  if(x && typeof x === 'object'){ if(x.per) GI.per = x.per; if(x.modo) GI.modo = x.modo; if(x.ind) Object.assign(GI.ind, x.ind); } }catch(e){} })();
function giGuardarV110(){ try{ localStorage.setItem('solidunsGraficoV110', JSON.stringify({per: GI.per, modo: GI.modo, ind: GI.ind})); }catch(e){} }
function giCarregarLibV110(){
  if(window.LightweightCharts && window.LightweightCharts.createChart) return Promise.resolve(true);
  if(GI.carregando) return GI.carregando;
  GI.carregando = new Promise(function(res){
    const sc = document.createElement('script'); sc.src = GI_LIB; sc.async = true;
    sc.onload = function(){ res(!!(window.LightweightCharts && window.LightweightCharts.createChart)); };
    sc.onerror = function(){ GI.carregando = null; sc.remove(); res(false); };
    document.head.appendChild(sc);
  });
  return GI.carregando;
}
/* ---------- cálculo dos indicadores (sobre os fechamentos guardados) ---------- */
function giSMA(v, n){ const out = []; let soma = 0;
  for(let i = 0; i < v.length; i++){ soma += v[i]; if(i >= n) soma -= v[i - n]; out.push(i >= n - 1 ? soma / n : null); } return out; }
function giEMA(v, n){ const out = new Array(v.length).fill(null); if(v.length < n) return out;
  const k = 2 / (n + 1); let e = 0; for(let i = 0; i < n; i++) e += v[i]; e /= n; out[n - 1] = e;
  for(let i = n; i < v.length; i++){ e = v[i] * k + e * (1 - k); out[i] = e; } return out; }
function giBollinger(v, n, k){ const m = giSMA(v, n), sup = [], inf = [];
  for(let i = 0; i < v.length; i++){
    if(m[i] === null){ sup.push(null); inf.push(null); continue; }
    let q = 0; for(let j = i - n + 1; j <= i; j++) q += (v[j] - m[i]) * (v[j] - m[i]);
    const dp = Math.sqrt(q / n); sup.push(m[i] + k * dp); inf.push(m[i] - k * dp);
  } return {meio: m, sup: sup, inf: inf}; }
function giRSI(v, n){ const out = new Array(v.length).fill(null); if(v.length < n + 1) return out;
  let g = 0, p = 0; for(let i = 1; i <= n; i++){ const d = v[i] - v[i - 1]; if(d > 0) g += d; else p -= d; }
  g /= n; p /= n; const r = () => p === 0 ? 100 : 100 - 100 / (1 + g / p); out[n] = r();
  for(let i = n + 1; i < v.length; i++){ const d = v[i] - v[i - 1];
    g = (g * (n - 1) + (d > 0 ? d : 0)) / n; p = (p * (n - 1) + (d < 0 ? -d : 0)) / n; out[i] = r(); }
  return out; }
/* ---------- dados ---------- */
function giSerieV110(d){
  const vistos = {};
  rgSerie(d).forEach(x => { if(/^\d{4}-\d{2}-\d{2}$/.test(x.d) && x.p !== null) vistos[x.d] = x; });
  return Object.keys(vistos).sort().map(k => vistos[k]);
}
function giCoresV110(){
  const cs = getComputedStyle(document.documentElement), v = (n, p) => (cs.getPropertyValue(n) || '').trim() || p;
  return {texto: v('--ink-soft', '#a89f88'), linha: v('--line', '#2e2a1e'), ouro: v('--gold', '#eec617'),
          sobe: v('--teal', '#3ecb99'), desce: v('--rust', '#e2793f')};
}
function giFmtV110(v, c){ return (v === null || v === undefined || !isFinite(v)) ? '—'
  : Number(v).toLocaleString('pt-BR', {minimumFractionDigits: c === undefined ? 2 : c, maximumFractionDigits: c === undefined ? 2 : c}); }
function giDestruirV110(){
  const g = GI.g; GI.g = null; if(!g) return;
  try{ if(g.ro) g.ro.disconnect(); }catch(e){}
  try{ g.main.remove(); }catch(e){}
  try{ if(g.rsi) g.rsi.remove(); }catch(e){}
}
/* ---------- montagem ---------- */
function giMontarV110(raiz){
  if(!raiz || (raiz.closest && raiz.closest('#rel-impressao'))) return;
  const bloco = raiz.querySelector('.rg-preco'); if(!bloco || !_relAtual) return;
  const d = _relAtual, serie = giSerieV110(d);
  if(serie.length < 2) return;                                  /* a nota do SVG ("o gráfico aparece a partir de…") fica */
  giCarregarLibV110().then(function(ok){
    if(!ok || !document.body.contains(bloco) || _relAtual !== d) return;
    try{ giDesenharV110(bloco, d, serie); }
    catch(e){ console.warn('[v110] gráfico interativo indisponível; fica o gráfico simples:', e && e.message); giDestruirV110(); rgRedesenharPreco(raiz); }
  });
}
function giDesenharV110(bloco, d, serie){
  giDestruirV110();
  const LC = window.LightweightCharts, cor = giCoresV110(), n = serie.length;
  const ohlc = serie.some(x => x.o !== null && x.h !== null && x.l !== null);
  if(!ohlc) GI.modo = 'linha';
  const temVol = serie.some(x => x.v !== null && x.v > 0);
  const moeda = d.mercado === 'us' ? 'US$' : 'R$';
  const bt = (attr, v, rot, ativo) => '<button type="button" class="rg-bt' + (ativo ? ' ativo' : '') + '" ' + attr + '="' + v + '">' + rot + '</button>';
  const itens = Object.keys(GI_IND).map(k => {
    const ind = GI_IND[k], falta = k === 'vol' ? (temVol ? 0 : 1) : Math.max(0, ind.min - n);
    const sub = k === 'vol' ? (temVol ? '' : 'sem volume para este papel')
              : (falta ? 'precisa de ' + ind.min + ' pregões — faltam ' + falta : '');
    return (k === 'rsi' || k === 'vol' ? '<hr>' : '') + '<label class="' + (falta ? 'gi-off' : '') + '"><input type="checkbox" data-gi-ind="' + k + '"'
      + (GI.ind[k] && !falta ? ' checked' : '') + (falta ? ' disabled' : '') + '><span class="gi-cor" style="background:' + ind.cor + ';"></span>'
      + '<span>' + ind.rot + (sub ? '<small>' + sub + '</small>' : '') + '</span></label>';
  }).join('');
  bloco.classList.add('gi-ativo');
  bloco.innerHTML = '<div class="gi-barra">'
    + ['1M', '3M', '6M', '1A', 'Tudo'].map(p => bt('data-gi-per', p, p, GI.per === p)).join('')
    + (ohlc ? '<span class="rg-sep"></span>' + bt('data-gi-modo', 'linha', 'Linha', GI.modo === 'linha') + bt('data-gi-modo', 'candles', 'Candles', GI.modo === 'candles') : '')
    + '<span class="rg-sep"></span><div class="gi-dd"><button type="button" class="rg-bt" data-gi-menu aria-haspopup="true" aria-expanded="false">Indicadores ▾</button>'
    + '<div class="gi-dd-menu" hidden role="menu">' + itens + '</div></div>'
    + bt('data-gi-acao', 'reset', 'Resetar zoom', false) + bt('data-gi-acao', 'png', 'Exportar imagem', false)
    + '</div><div class="gi-legenda" aria-live="off"></div><div class="gi-main"></div>'
    + '<p class="gi-rot-rsi" hidden>RSI (14) — acima de 70: sobrecomprado · abaixo de 30: sobrevendido</p><div class="gi-rsi" hidden></div>'
    + '<p class="prova-nota rg-nota gi-nota"></p>';

  const elMain = bloco.querySelector('.gi-main'), elRsi = bloco.querySelector('.gi-rsi');
  const fmtPreco = v => giFmtV110(v);
  const base = {
    layout: {background: {type: 'solid', color: 'transparent'}, textColor: cor.texto, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11},
    grid: {vertLines: {color: cor.linha}, horzLines: {color: cor.linha}},
    crosshair: {mode: LC.CrosshairMode.Normal},
    rightPriceScale: {borderColor: cor.linha},
    timeScale: {borderColor: cor.linha, timeVisible: false, rightOffset: 2},
    localization: {locale: 'pt-BR', priceFormatter: fmtPreco, dateFormat: 'dd/MM/yyyy'},
    handleScale: {axisPressedMouseMove: true}, handleScroll: true
  };
  const main = LC.createChart(elMain, Object.assign({}, base, {width: elMain.clientWidth || 600, height: elMain.clientHeight || 400}));
  const t = serie.map(x => x.d), fech = serie.map(x => x.p);
  const s = {};
  if(GI.modo === 'candles'){
    s.preco = main.addCandlestickSeries({upColor: cor.sobe, downColor: cor.desce, borderVisible: false, wickUpColor: cor.sobe, wickDownColor: cor.desce, priceLineVisible: true});
    s.preco.setData(serie.map(x => (x.o !== null && x.h !== null && x.l !== null)
      ? {time: x.d, open: x.o, high: x.h, low: x.l, close: x.p} : {time: x.d, open: x.p, high: x.p, low: x.p, close: x.p}));
  } else {
    s.preco = main.addAreaSeries({lineColor: cor.ouro, topColor: 'rgba(238,198,23,.22)', bottomColor: 'rgba(238,198,23,0)', lineWidth: 2});
    s.preco.setData(serie.map(x => ({time: x.d, value: x.p})));
  }
  const linhaSerie = (vals, c, estilo, larg) => {
    const ls = main.addLineSeries({color: c, lineWidth: larg || 2, lineStyle: estilo || 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false});
    ls.setData(vals.map((v, i) => v === null ? null : {time: t[i], value: v}).filter(Boolean)); return ls; };
  const val = {};
  if(n >= GI_IND.sma.min){ val.sma = giSMA(fech, 14); s.sma = linhaSerie(val.sma, GI_IND.sma.cor); }
  if(n >= GI_IND.ema.min){ val.ema = giEMA(fech, 14); s.ema = linhaSerie(val.ema, GI_IND.ema.cor); }
  if(n >= GI_IND.bb.min){ val.bb = giBollinger(fech, 20, 2);
    s.bbSup = linhaSerie(val.bb.sup, GI_IND.bb.cor, 0, 1); s.bbMeio = linhaSerie(val.bb.meio, GI_IND.bb.cor, 2, 1); s.bbInf = linhaSerie(val.bb.inf, GI_IND.bb.cor, 0, 1); }
  if(temVol){
    s.vol = main.addHistogramSeries({priceScaleId: 'vol', priceFormat: {type: 'volume'}, lastValueVisible: false, priceLineVisible: false});
    main.priceScale('vol').applyOptions({scaleMargins: {top: 0.82, bottom: 0}});
    s.vol.setData(serie.filter(x => x.v !== null).map((x, i, arr) => {
      const ant = serie[serie.indexOf(x) - 1]; const sobe = !ant || x.p >= ant.p;
      return {time: x.d, value: x.v, color: sobe ? 'rgba(62,203,153,.45)' : 'rgba(226,121,63,.45)'}; }));
  }
  main.priceScale('right').applyOptions({scaleMargins: {top: 0.08, bottom: temVol ? 0.22 : 0.08}});
  let rsi = null, sRsi = null;
  if(n >= GI_IND.rsi.min){
    val.rsi = giRSI(fech, 14);
    rsi = LC.createChart(elRsi, Object.assign({}, base, {width: elMain.clientWidth || 600, height: 120,
      localization: {locale: 'pt-BR', priceFormatter: v => giFmtV110(v, 0), dateFormat: 'dd/MM/yyyy'}}));
    sRsi = rsi.addLineSeries({color: GI_IND.rsi.cor, lineWidth: 2, priceLineVisible: false});
    sRsi.setData(val.rsi.map((v, i) => v === null ? null : {time: t[i], value: v}).filter(Boolean));
    [70, 30].forEach(nv => sRsi.createPriceLine({price: nv, color: cor.texto, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: ''}));
    rsi.priceScale('right').applyOptions({autoScale: false, scaleMargins: {top: 0.1, bottom: 0.1}});
    sRsi.applyOptions({autoscaleInfoProvider: () => ({priceRange: {minValue: 0, maxValue: 100}})});
    let sincronizando = false;                                    /* mesmo zoom nos dois painéis */
    main.timeScale().subscribeVisibleLogicalRangeChange(r => { if(sincronizando || !r) return; sincronizando = true; rsi.timeScale().setVisibleLogicalRange(r); sincronizando = false; });
    rsi.timeScale().subscribeVisibleLogicalRangeChange(r => { if(sincronizando || !r) return; sincronizando = true; main.timeScale().setVisibleLogicalRange(r); sincronizando = false; });
  }
  GI.g = {main: main, rsi: rsi, s: s, sRsi: sRsi, d: d, serie: serie, val: val, bloco: bloco};

  /* visibilidade dos indicadores */
  const aplicar = () => {
    const vis = (ser, k) => { if(ser) ser.applyOptions({visible: !!GI.ind[k]}); };
    vis(s.sma, 'sma'); vis(s.ema, 'ema'); vis(s.bbSup, 'bb'); vis(s.bbMeio, 'bb'); vis(s.bbInf, 'bb'); vis(s.vol, 'vol');
    const mostraRsi = !!(rsi && GI.ind.rsi);
    elRsi.hidden = !mostraRsi; bloco.querySelector('.gi-rot-rsi').hidden = !mostraRsi;
    if(mostraRsi) rsi.applyOptions({width: elMain.clientWidth});
  };
  /* período */
  const periodo = () => {
    const ts = main.timeScale();
    if(GI.per === 'Tudo'){ ts.fitContent(); return; }
    const dias = {'1M': 31, '3M': 92, '6M': 183, '1A': 366}[GI.per] || 366;
    const fim = rgData(t[n - 1]), ini = new Date(fim.getTime() - dias * 864e5).toISOString().slice(0, 10);
    const de = t.find(x => x >= ini) || t[0];
    if(de === t[0]) ts.fitContent(); else ts.setVisibleRange({from: de, to: t[n - 1]});
  };
  /* legenda (valores sob o cursor; sem cursor: o último pregão) */
  const leg = bloco.querySelector('.gi-legenda');
  const legenda = i => {
    if(i === null || i === undefined || i < 0 || i >= n) i = n - 1;
    const x = serie[i], ant = serie[i - 1], varp = ant ? (x.p / ant.p - 1) * 100 : null, partes = [];
    partes.push('<b>' + rgDMA(x.d) + '</b>');
    if(GI.modo === 'candles' && x.o !== null) partes.push('A ' + giFmtV110(x.o) + ' · Máx ' + giFmtV110(x.h) + ' · Mín ' + giFmtV110(x.l) + ' · F ' + giFmtV110(x.p));
    else partes.push(moeda + ' ' + giFmtV110(x.p));
    if(varp !== null) partes.push('<span style="color:' + (varp >= 0 ? cor.sobe : cor.desce) + ';">' + (varp >= 0 ? '+' : '') + giFmtV110(varp) + '%</span>');
    const p = (k, rot, v, c) => { if(GI.ind[k] && v !== null && v !== undefined) partes.push('<span style="color:' + GI_IND[k].cor + ';">' + rot + ' ' + giFmtV110(v, c) + '</span>'); };
    if(val.sma) p('sma', 'SMA', val.sma[i]);
    if(val.ema) p('ema', 'EMA', val.ema[i]);
    if(val.bb && val.bb.sup[i] !== null && GI.ind.bb) partes.push('<span style="color:' + GI_IND.bb.cor + ';">BB ' + giFmtV110(val.bb.inf[i]) + ' – ' + giFmtV110(val.bb.sup[i]) + '</span>');
    if(val.rsi) p('rsi', 'RSI', val.rsi[i], 1);
    if(GI.ind.vol && x.v !== null) partes.push('Vol ' + rgCurto(x.v));
    leg.innerHTML = partes.join('');
  };
  const idx = {}; t.forEach((x, i) => { idx[x] = i; });
  const aoMover = p => { const tm = p && p.time; const chave = !tm ? null : (typeof tm === 'string' ? tm
      : (tm.year ? tm.year + '-' + String(tm.month).padStart(2, '0') + '-' + String(tm.day).padStart(2, '0') : null));
    legenda(chave && idx[chave] !== undefined ? idx[chave] : null); };
  main.subscribeCrosshairMove(aoMover); if(rsi) rsi.subscribeCrosshairMove(aoMover);
  /* nota */
  const faltam = Object.keys(GI_IND).filter(k => k !== 'vol' && n < GI_IND[k].min);
  bloco.querySelector('.gi-nota').innerHTML = n + ' pregões guardados (' + rgDMA(t[0]) + ' a ' + rgDMA(t[n - 1]) + '). '
    + 'Role a roda do mouse (ou faça pinça) para dar zoom e arraste para navegar. '
    + 'Indicadores calculados pela SOLIDUNS sobre os fechamentos guardados'
    + (faltam.length ? '; ' + faltam.map(k => GI_IND[k].rot.split(' — ').pop().split(' (')[0] + ' ' + GI_IND[k].rot.match(/\(([^)]*)\)/)[0]).join(', ')
       + ' aparece' + (faltam.length > 1 ? 'm' : '') + ' quando o histórico tiver pregões suficientes' : '')
    + '. Informação educativa, não é recomendação de investimento.';

  /* eventos da barra */
  bloco.querySelectorAll('[data-gi-per]').forEach(b => b.addEventListener('click', () => {
    GI.per = b.getAttribute('data-gi-per'); giGuardarV110();
    bloco.querySelectorAll('[data-gi-per]').forEach(o => o.classList.toggle('ativo', o === b)); periodo(); }));
  bloco.querySelectorAll('[data-gi-modo]').forEach(b => b.addEventListener('click', () => {
    if(GI.modo === b.getAttribute('data-gi-modo')) return;
    GI.modo = b.getAttribute('data-gi-modo'); giGuardarV110(); giDesenharV110(bloco, d, serie); }));
  const menuBt = bloco.querySelector('[data-gi-menu]'), menu = bloco.querySelector('.gi-dd-menu');
  menuBt.addEventListener('click', ev => { ev.stopPropagation(); menu.hidden = !menu.hidden; menuBt.setAttribute('aria-expanded', String(!menu.hidden)); });
  menu.addEventListener('click', ev => ev.stopPropagation());
  if(!window.__giFecharMenuV110){ window.__giFecharMenuV110 = true;
    document.addEventListener('click', () => document.querySelectorAll('.gi-dd-menu').forEach(m => { m.hidden = true; })); }
  menu.querySelectorAll('[data-gi-ind]').forEach(c => c.addEventListener('change', () => {
    GI.ind[c.getAttribute('data-gi-ind')] = c.checked; giGuardarV110(); aplicar(); legenda(null); }));
  bloco.querySelector('[data-gi-acao="reset"]').addEventListener('click', () => {
    main.priceScale('right').applyOptions({autoScale: true}); periodo(); });
  bloco.querySelector('[data-gi-acao="png"]').addEventListener('click', () => giExportarV110());
  /* largura acompanha a tela */
  if(window.ResizeObserver){
    GI.g.ro = new ResizeObserver(() => { const w = elMain.clientWidth; if(!w) return;
      main.applyOptions({width: w, height: elMain.clientHeight || 400}); if(rsi && !elRsi.hidden) rsi.applyOptions({width: w}); });
    GI.g.ro.observe(elMain);
  }
  aplicar(); periodo(); legenda(null);
}
/* ---------- exportar imagem (PNG com cabeçalho SOLIDUNS) ---------- */
function giExportarV110(){
  const g = GI.g; if(!g) return;
  const c1 = g.main.takeScreenshot(), c2 = (g.rsi && !g.bloco.querySelector('.gi-rsi').hidden) ? g.rsi.takeScreenshot() : null;
  const esc = c1.width / (g.bloco.querySelector('.gi-main').clientWidth || c1.width);   /* telas de alta densidade */
  const topo = Math.round(46 * esc), rod = Math.round(26 * esc), w = c1.width, h = topo + c1.height + (c2 ? c2.height + 8 : 0) + rod;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d');
  x.fillStyle = '#0d0d0c'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#eec617'; x.font = 'bold ' + Math.round(15 * esc) + 'px Arial'; x.fillText('SOLIDUNS', 12 * esc, 20 * esc);
  const i = g.d.indicadores || {}, f = g.d.fundamentos || {};
  x.fillStyle = '#f2ecd8'; x.font = Math.round(12 * esc) + 'px Arial';
  x.fillText((g.d.ticker || '') + ' — ' + (i.nome || f.empresa || '') + ' · preço e volume', 12 * esc, 38 * esc);
  x.drawImage(c1, 0, topo);
  if(c2) x.drawImage(c2, 0, topo + c1.height + 8);
  x.fillStyle = '#a89f88'; x.font = Math.round(10 * esc) + 'px Arial';
  const ult = g.serie[g.serie.length - 1].d;
  x.fillText('Fechamentos guardados pela SOLIDUNS até ' + rgDMA(ult) + '. Informação educativa, não é recomendação de investimento.', 12 * esc, h - Math.round(9 * esc));
  const a = document.createElement('a'); a.download = 'SOLIDUNS_' + (g.d.ticker || 'grafico') + '_' + ult + '.png';
  a.href = cv.toDataURL('image/png'); document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 300);
}
/* ---------- liga no relatório: depois de desenhar (abrir) e ao redesenhar ---------- */
(function(){
  if(typeof rgLigar !== 'function') return;
  const original = rgLigar;
  rgLigar = function(raiz){ original.apply(this, arguments); try{ giMontarV110(raiz); }catch(e){} };
})();
