
/* ===== v171: ALVOS SOLIDUNS — entrada, stop e alvos de todas as ações líquidas da B3 (Mercado financeiro > Ações, BR) =====
   Lida do banco (RPC alvos_publico, SQL 186), gravada pelo robô selecao/robo_selecao.py (módulo alvos.py).
   Nada é calculado na página além da formatação e da leitura em texto dos indicadores. Login obrigatório.
   Administrador-mestre: vê a prévia mais recente e publica/retira (RPC alvos_publicar). */
var _al = {dados: null, ord: 'posicao', asc: true, cen: 'D', ganhoMin: 0, setor: '', busca: '', soLimpas: false, aberto: null};
var AL_ROTA = 'alvos-soliduns';

function alNum(v, c){ return (v === null || v === undefined || v === '' || isNaN(Number(v))) ? '—' : Number(v).toLocaleString('pt-BR', {minimumFractionDigits: c, maximumFractionDigits: c}); }
function alRs(v){ if(v === null || v === undefined || isNaN(Number(v))) return '—'; const n = Number(v); return alNum(n, n < 2 ? 3 : 2); }
function alPct(v, c, sinal){
  if(v === null || v === undefined || isNaN(Number(v))) return '—';
  const n = Number(v) * 100, t = alNum(Math.abs(n), c === undefined ? 1 : c) + '%';
  if(!sinal) return (n < 0 ? '−' : '') + t;
  return (n > 0.0499 ? '+' : (n < -0.0499 ? '−' : '')) + t;
}
function alCor(v){ const n = Number(v); return (isNaN(n) || Math.abs(n) < 0.0005) ? '' : (n > 0 ? ' al-pos' : ' al-neg'); }
function alData(d){ if(!d) return ''; const p = String(d).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(d); }
function alDataHora(d){
  if(!d) return '';
  try{ return new Date(d).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}); }
  catch(e){ return alData(d); }
}
function alSem(t){ return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

/* valores do cenário escolhido: D (eleição) ou T (só técnico) */
function alV(x){
  const d = _al.cen === 'D';
  return {alvo2: d ? x.alvo2_d : x.alvo2_n, ganho: d ? x.ganho_d : x.ganho_n,
          ganhoAtual: (d ? x.alvo2_d : x.alvo2_n) / x.preco - 1, rr: d ? x.rr_d : x.rr_n};
}
function alDestaque(x){ return x.limpa && alV(x).ganho >= alLimite(); }
function alLimite(){ const e = (_al.dados || {}).execucao || {}; return Number(e.ganho_destaque) || 0.20; }

function alCaixa(){
  relEsconder();
  const caixa = document.getElementById('mf-analises-pub');
  document.getElementById('mf-conteudo-padrao').style.display = 'none';
  document.getElementById('mf-painel-implantacao').style.display = 'none';
  caixa.style.display = 'block';
  relAlternarScreener(false);
  mfGravarRota(AL_ROTA);
  marcarItemAtivoMF('acoes');
  fecharTodosDropdownsMF();
  setTituloPagina('Alvos SOLIDUNS', 'Alvos SOLIDUNS — preço de entrada, stop e preço-alvo de todas as ações líquidas da B3, com indicadores técnicos e o efeito do cenário eleitoral.');
  return caixa;
}

async function alMostrar(){
  const caixa = alCaixa();
  caixa.innerHTML = '<div class="rel-topo"><h2>Alvos SOLIDUNS <span class="ra-selo al-selo">ALVOS</span></h2></div>'
    + '<p class="al-subtit">Entrada, stop e preço-alvo de todas as ações da B3</p>'
    + '<p class="rx-lead">Para cada ação negociada com liquidez na B3, a SOLIDUNS calcula o <b>preço de entrada</b>, o <b>stop</b> e dois <b>preços-alvo</b>, '
    + 'a partir dos indicadores técnicos do gráfico e da reação estimada do preço ao cenário eleitoral, pelo mesmo método da Carteira SOLIDUNS.</p>'
    + '<div id="al-conteudo"><p class="prova-nota">Carregando os alvos…</p></div>';
  _al.dados = null; _al.aberto = null;
  let r = null, erro = '';
  try{ r = await raRpc('alvos_publico', {}); }
  catch(e){ erro = String((e && e.message) || e); }
  if(!document.getElementById('al-conteudo')) return;
  _al.dados = (r && typeof r === 'object') ? r : null;
  alDesenhar(erro);
}

function alAdminHtml(d){
  if(!d.admin) return '';
  const e = d.execucao;
  const linha = d.previa
    ? '<div class="rx-previa al-admin"><span>PRÉVIA — visível só para administradores. Execução de ' + alDataHora(e.executado_em)
      + (d.ultima_publicada ? '. Os assinantes veem a lista publicada de ' + alData(d.ultima_publicada) + '.' : '. Ainda não há lista publicada para os assinantes.')
      + '</span><button type="button" class="btn-leilao-admin" data-al-publicar="1">Publicar para assinantes</button></div>'
    : '<div class="al-publicada"><span>Publicada para os assinantes' + (e.publicado_em ? ' em ' + alDataHora(e.publicado_em) : '') + '.</span>'
      + '<button type="button" class="btn-leilao-admin" data-al-publicar="0">Retirar publicação</button></div>';
  const av = Array.isArray(e.avisos) && e.avisos.length
    ? '<details class="al-det al-avisos"><summary>Avisos da execução (' + e.avisos.length + ') — só administradores</summary><ul>'
      + e.avisos.map(a => '<li>' + escHtml(a) + '</li>').join('') + '</ul></details>' : '';
  return linha + '<p class="prova-nota" id="al-admin-msg"></p>' + av;
}

function alCardsHtml(d){
  const e = d.execucao, ac = d.acoes || [];
  const nd = e.candidato_d || 'D', res = e.resultado === 'D' || e.resultado === 'E';
  const card = (rot, val, sub) => '<div class="al-card"><span>' + rot + '</span><b>' + val + '</b>' + (sub ? '<i>' + sub + '</i>' : '') + '</div>';
  const lim = alLimite();
  const nDest = ac.filter(x => x.limpa && Number(x.ganho_d) >= lim).length;
  return '<div class="al-cards">'
    + card('Pregão de referência', alData(e.data_referencia), 'preços de fechamento')
    + card('Ações analisadas', alNum(e.n_acoes || ac.length, 0), 'volume médio de R$ 2 milhões/dia ou mais')
    + card('Em destaque', alNum(nDest, 0), 'ganho até o alvo 2 de ' + alPct(lim, 0) + ' ou mais, sem alertas')
    + (res ? card('Resultado da eleição', escHtml(e.resultado === 'D' ? nd : (e.candidato_e || 'E')), 'cenário confirmado')
           : card('Chance do cenário D', alPct(e.p_d, 0), escHtml(nd) + ', pelas pesquisas'))
    + card('CDS Brasil 5 anos', alNum(e.cds_pb, 0) + ' pb', res ? 'risco-país usado' : ('se D: ' + alNum(e.cds_d_pb, 0) + ' · se E: ' + alNum(e.cds_e_pb, 0)))
    + '</div>';
}

function alFiltrosHtml(d){
  const e = d.execucao, nd = e.candidato_d || 'D';
  const setores = [...new Set((d.acoes || []).map(x => x.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const opt = (v, t, sel) => '<option value="' + v + '"' + (sel ? ' selected' : '') + '>' + t + '</option>';
  return '<div class="al-filtros">'
    + '<label>Cenário<select id="al-cen">' + opt('D', 'Vitória de ' + escHtml(nd) + ' (D)', _al.cen === 'D') + opt('T', 'Só técnico (sem eleição)', _al.cen === 'T') + '</select></label>'
    + '<label>Ganho mínimo até o alvo 2<select id="al-ganho">' + [0, 0.10, 0.15, 0.20, 0.30].map(g => opt(g, g ? alPct(g, 0) + ' ou mais' : 'Todos', _al.ganhoMin === g)).join('') + '</select></label>'
    + '<label>Setor<select id="al-setor">' + opt('', 'Todos os setores', !_al.setor) + setores.map(s => opt(escHtml(s), escHtml(s), _al.setor === s)).join('') + '</select></label>'
    + '<label class="al-busca">Buscar<input type="search" id="al-busca" placeholder="Ação ou empresa" value="' + escHtml(_al.busca) + '"></label>'
    + '<label class="al-check"><input type="checkbox" id="al-limpas"' + (_al.soLimpas ? ' checked' : '') + '> Esconder ações com alertas</label>'
    + '</div>';
}

function alDesenhar(erro){
  const alvo = document.getElementById('al-conteudo'); if(!alvo) return;
  const d = _al.dados;
  if(!d || !d.execucao){
    const semFuncao = /alvos_publico|could not find|PGRST202|404/i.test(erro || '');
    const admin = (d && d.admin) || (typeof ehAdminSistema === 'function' && ehAdminSistema());
    alvo.innerHTML = '<div class="rx-vazio"><h3>Alvos em preparação</h3><p>A lista aparece aqui depois do fechamento do pregão, '
      + 'com a entrada, o stop e os preços-alvo de cada ação.</p></div>'
      + (admin && semFuncao ? '<p class="prova-nota" style="margin-top:10px;">Administrador: rode a SQL 186 no Supabase (supabase/migrations/186_alvos_soliduns.sql).</p>' : '')
      + ((erro && !semFuncao) ? '<p class="prova-nota" style="margin-top:10px;">' + escHtml(erro) + '</p>' : '');
    return;
  }
  alvo.innerHTML = alAdminHtml(d) + alCardsHtml(d) + alFiltrosHtml(d)
    + '<p class="rx-info" id="al-info"></p><div id="al-detalhe-box"></div>'
    + '<div class="rx-tabela-wrap"><table class="rx-tabela al-tabela"><thead><tr id="al-cab"></tr></thead><tbody id="al-corpo"></tbody></table></div>'
    + alComoLerHtml(d.execucao);
  alvo.querySelectorAll('[data-al-publicar]').forEach(b => b.addEventListener('click', () => alPublicar(b.getAttribute('data-al-publicar') === '1', b)));
  const liga = (id, ev, fn) => { const el = document.getElementById(id); if(el) el.addEventListener(ev, fn); };
  liga('al-cen', 'change', ev => { _al.cen = ev.target.value; alTabela(); });
  liga('al-ganho', 'change', ev => { _al.ganhoMin = Number(ev.target.value); alTabela(); });
  liga('al-setor', 'change', ev => { _al.setor = ev.target.value; alTabela(); });
  liga('al-busca', 'input', ev => { _al.busca = ev.target.value; alTabela(); });
  liga('al-limpas', 'change', ev => { _al.soLimpas = ev.target.checked; alTabela(); });
  alTabela();
}

var AL_COLS = [
  ['posicao', '#', 1], ['ticker', 'Ação', 0], ['empresa', 'Empresa', 0], ['setor', 'Setor', 0], ['preco', 'Preço', 1],
  ['ent_ideal', 'Entrada ideal', 1], ['ent_max', 'Entrada máxima', 1], ['stop', 'Stop', 1], ['alvo1', 'Alvo 1', 1],
  ['alvo2', 'Alvo 2', 1], ['ganho', 'Ganho até o alvo 2', 1], ['ganhoAtual', 'Do preço atual', 1], ['rr', 'Ganho / risco', 1], ['alertas', 'Alertas', 0]];

function alValor(x, k){
  const v = alV(x);
  if(k in v) return v[k];
  if(k === 'alertas') return (x.alertas || []).length;
  return x[k];
}

function alTabela(){
  const corpo = document.getElementById('al-corpo'), cab = document.getElementById('al-cab'); if(!corpo) return;
  const todos = (_al.dados && _al.dados.acoes) || [];
  const q = alSem(_al.busca);
  let itens = todos.filter(x => (!q || alSem(x.ticker + ' ' + x.empresa).indexOf(q) >= 0) && (!_al.setor || x.setor === _al.setor)
    && (!_al.soLimpas || x.limpa) && (!_al.ganhoMin || alV(x).ganho >= _al.ganhoMin));
  const k = _al.ord, s = _al.asc ? 1 : -1;
  itens = itens.slice().sort((a, b) => {
    if(k === 'posicao'){ return (alV(b).ganho - alV(a).ganho) * s; }
    const va = alValor(a, k), vb = alValor(b, k);
    if(typeof va === 'number' || typeof vb === 'number'){
      if(va === null || va === undefined || isNaN(va)) return 1; if(vb === null || vb === undefined || isNaN(vb)) return -1;
      return (Number(va) - Number(vb)) * s; }
    return String(va || '').localeCompare(String(vb || ''), 'pt-BR') * s; });
  cab.innerHTML = AL_COLS.map(c => '<th data-al-ord="' + c[0] + '"' + (c[2] ? ' class="al-dir"' : '') + '>' + c[1]
    + (_al.ord === c[0] ? (_al.asc ? ' ▲' : ' ▼') : '') + '</th>').join('');
  cab.querySelectorAll('[data-al-ord]').forEach(th => th.addEventListener('click', () => {
    const c = th.getAttribute('data-al-ord');
    if(_al.ord === c) _al.asc = !_al.asc; else { _al.ord = c; _al.asc = (c === 'ticker' || c === 'empresa' || c === 'setor' || c === 'posicao'); }
    alTabela();
  }));
  corpo.innerHTML = itens.map((x, i) => {
    const v = alV(x), dest = alDestaque(x), al = x.alertas || [];
    return '<tr class="al-linha' + (dest ? ' al-verde' : '') + (x.limpa ? '' : ' al-restrita') + (_al.aberto === x.ticker ? ' al-aberta' : '') + '" data-al-tk="' + escHtml(x.ticker) + '" tabindex="0">'
      + '<td class="rx-num">' + (i + 1) + '</td><td class="rx-tk">' + escHtml(x.ticker) + '</td>'
      + '<td>' + escHtml(x.empresa || '') + '</td><td>' + escHtml(x.setor || '') + '</td>'
      + '<td class="rx-num">' + alRs(x.preco) + '</td><td class="rx-num">' + alRs(x.ent_ideal) + '</td><td class="rx-num">' + alRs(x.ent_max) + '</td>'
      + '<td class="rx-num al-neg">' + alRs(x.stop) + '</td><td class="rx-num">' + alRs(x.alvo1) + '</td><td class="rx-num"><b>' + alRs(v.alvo2) + '</b></td>'
      + '<td class="rx-num' + alCor(v.ganho) + '"><b>' + alPct(v.ganho, 1, true) + '</b></td><td class="rx-num' + alCor(v.ganhoAtual) + '">' + alPct(v.ganhoAtual, 1, true) + '</td>'
      + '<td class="rx-num">' + alNum(v.rr, 1) + '</td>'
      + '<td class="al-alertas">' + (al.length ? '<span class="al-qtd" title="' + escHtml(al.join(' · ')) + '">' + al.length + ' ' + (al.length > 1 ? 'alertas' : 'alerta') + '</span>' : '<span class="al-ok">sem alertas</span>') + '</td></tr>';
  }).join('') || '<tr><td colspan="' + AL_COLS.length + '" class="prova-nota">Nenhuma ação com esses filtros.</td></tr>';
  const box = document.getElementById('al-detalhe-box'), sel = todos.find(x => x.ticker === _al.aberto);
  if(box) box.innerHTML = sel ? alDetalheHtml(sel) : '';
  if(box) box.querySelectorAll('[data-al-fechar]').forEach(b => b.addEventListener('click', () => { _al.aberto = null; alTabela(); }));
  corpo.querySelectorAll('.al-linha').forEach(tr => {
    const abre = () => { const t = tr.getAttribute('data-al-tk'); _al.aberto = (_al.aberto === t ? null : t); alTabela();
      if(_al.aberto){ const det = document.getElementById('al-detalhe-box'); if(det && det.scrollIntoView) det.scrollIntoView({block: 'start', behavior: 'smooth'}); } };
    tr.addEventListener('click', abre);
    tr.addEventListener('keydown', ev => { if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); abre(); } });
  });
  const info = document.getElementById('al-info');
  const nDest = itens.filter(alDestaque).length;
  if(info) info.innerHTML = itens.length + ' de ' + todos.length + ' ações · <span class="al-verde-txt">' + nDest + ' em verde</span> (ganho de '
    + alPct(alLimite(), 0) + ' ou mais até o alvo 2, sem alertas) · clique numa ação para ver o gráfico e a leitura dos indicadores';
}

/* ---------- detalhe: gráfico + indicadores + leitura ---------- */
function alGrafico(x){
  const s = Array.isArray(x.serie) ? x.serie : [];
  if(s.length < 2) return '<p class="prova-nota">Série de preços indisponível.</p>';
  const v = alV(x);
  const W = 860, H = 300, ml = 8, mr = 120, mt = 14, mb = 24;
  const niveis = [['Alvo 2', v.alvo2, '#d9b310', '6 3'], ['Alvo 1', x.alvo1, '#d9b310', '2 3'], ['Entrada', x.ent_ideal, '#4caf50', ''], ['Stop', x.stop, '#e57373', '6 3']]
    .filter(n => n[1] !== null && n[1] !== undefined && !isNaN(n[1]));
  const vals = s.flatMap(p => [p[1], p[2], p[3], p[4]]).concat(niveis.map(n => Number(n[1]))).filter(n => n !== null && !isNaN(n));
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const X = i => ml + (W - ml - mr) * i / (s.length - 1), Y = val => mt + (H - mt - mb) * (1 - (val - lo) / (hi - lo));
  const linha = (j, cor, larg) => '<polyline fill="none" stroke="' + cor + '" stroke-width="' + larg + '" stroke-linejoin="round" points="'
    + s.map((p, i) => (p[j] === null ? '' : X(i).toFixed(1) + ',' + Y(p[j]).toFixed(1))).filter(Boolean).join(' ') + '"/>';
  const grade = [0, 0.25, 0.5, 0.75, 1].map(f => { const val = lo + (hi - lo) * f, y = Y(val);
    return '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" class="al-grade"/>'
      + '<text x="' + (W - mr + 4) + '" y="' + (y + 3).toFixed(1) + '" class="al-eixo">' + alRs(val) + '</text>'; }).join('');
  /* rótulos dos níveis sem sobreposição */
  const rot = niveis.map(n => ({n, y: Y(Number(n[1]))})).sort((a, b) => a.y - b.y);
  for(let i = 1; i < rot.length; i++) if(rot[i].y - rot[i - 1].y < 12) rot[i].y = rot[i - 1].y + 12;
  const lin = niveis.map(n => '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(Number(n[1])).toFixed(1) + '" y2="' + Y(Number(n[1])).toFixed(1)
    + '" stroke="' + n[2] + '" stroke-width="1.2"' + (n[3] ? ' stroke-dasharray="' + n[3] + '"' : '') + '/>').join('')
    + rot.map(r => '<text x="' + (W - mr + 50) + '" y="' + (r.y + 3).toFixed(1) + '" fill="' + r.n[2] + '" class="al-rot">' + r.n[0] + ' ' + alRs(r.n[1]) + '</text>').join('');
  const meses = []; let ult = '';
  s.forEach((p, i) => { const m = String(p[0]).slice(0, 7); if(m !== ult){ ult = m; if(i > 4) meses.push([i, p[0]]); } });
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const eixoX = meses.map(m => '<text x="' + X(m[0]).toFixed(1) + '" y="' + (H - 6) + '" class="al-eixo" text-anchor="middle">' + nomes[Number(String(m[1]).slice(5, 7)) - 1] + '/' + String(m[1]).slice(2, 4) + '</text>').join('');
  return '<div class="al-graf"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico de preço de ' + escHtml(x.ticker) + ' com médias móveis e níveis">'
    + grade + linha(4, '#d55181', 1.2) + linha(3, '#c98500', 1.2) + linha(2, '#3987e5', 1.2) + linha(1, '#e8e6df', 2) + lin + eixoX + '</svg>'
    + '<div class="al-legenda"><span><i style="background:#e8e6df"></i>Fechamento</span><span><i style="background:#3987e5"></i>MME 21</span>'
    + '<span><i style="background:#c98500"></i>MME 50</span><span><i style="background:#d55181"></i>MME 200</span></div></div>';
}

function alLeitura(x){
  const L = [], p = x.preco;
  const acima = ['mme9', 'mme21', 'mme50', 'mme200'].filter(k => p > x[k]).length;
  if(acima === 4) L.push(['Tendência', 'de alta: o preço está acima das médias de 9, 21, 50 e 200 dias.']);
  else if(p < x.mme200 && p > x.mme21) L.push(['Tendência', 'de baixa no longo prazo (abaixo da média de 200 dias), com recuperação de curto prazo (acima da média de 21 dias).']);
  else if(p < x.mme200) L.push(['Tendência', 'de baixa: o preço está abaixo da média de 200 dias.']);
  else if(p < x.mme21) L.push(['Tendência', 'de alta no longo prazo, mas em correção: o preço está abaixo da média de 21 dias.']);
  else L.push(['Tendência', 'de alta, com o preço acima das médias de 21 e 200 dias.']);
  const adx = Number(x.adx);
  L.push(['Força', 'ADX em ' + alNum(adx, 0) + (adx >= 40 ? ' (tendência muito forte)' : adx >= 25 ? ' (tendência firme)' : ' (tendência fraca ou lateral)')
    + ', com DI+ em ' + alNum(x.di_mais, 0) + ' e DI− em ' + alNum(x.di_menos, 0) + '.']);
  const ifr = Number(x.ifr), est = Number(x.estoc_k);
  L.push(['Momento', 'IFR em ' + alNum(ifr, 0) + (ifr >= 70 ? ' (sobrecompra)' : ifr <= 30 ? ' (sobrevenda)' : '') + '; estocástico em ' + alNum(est, 0)
    + (est >= 80 ? ' (sobrecompra)' : est <= 20 ? ' (sobrevenda)' : '') + '; MACD ' + (x.macd > x.sinal ? 'acima' : 'abaixo') + ' da linha de sinal.']);
  const dist = p / x.mme21 - 1;
  if(Math.abs(dist) > 0.07) L.push(['Distância da média', 'o preço está ' + alPct(Math.abs(dist), 0) + (dist > 0 ? ' acima' : ' abaixo') + ' da média de 21 dias'
    + (dist > 0 ? ': risco maior de correção; prefira a entrada ideal.' : '.')]);
  L.push(['Volume', 'nos últimos 5 pregões, ' + (x.vol_rel >= 1 ? alPct(x.vol_rel - 1, 0) + ' acima' : alPct(1 - x.vol_rel, 0) + ' abaixo') + ' da média de 60 pregões.']);
  return L;
}

function alDetalheHtml(x){
  const v = alV(x), e = (_al.dados || {}).execucao || {};
  const nd = e.candidato_d || 'D', ne = e.candidato_e || 'E', res = e.resultado === 'D' || e.resultado === 'E';
  const ind = [['Médias móveis (9 · 21 · 50 · 200)', alRs(x.mme9) + ' · ' + alRs(x.mme21) + ' · ' + alRs(x.mme50) + ' · ' + alRs(x.mme200)],
    ['IFR (14)', alNum(x.ifr, 1)], ['MACD / sinal', alNum(x.macd, 2) + ' / ' + alNum(x.sinal, 2)],
    ['Bandas de Bollinger', alRs(x.bb_inf) + ' – ' + alRs(x.bb_sup)], ['Estocástico %K / %D', alNum(x.estoc_k, 0) + ' / ' + alNum(x.estoc_d, 0)],
    ['ADX (DI+ / DI−)', alNum(x.adx, 0) + ' (' + alNum(x.di_mais, 0) + ' / ' + alNum(x.di_menos, 0) + ')'], ['ATR (14)', 'R$ ' + alRs(x.atr) + ' por dia'],
    ['Pivô semanal (S2 · S1 · P · R1 · R2)', [x.s2, x.s1, x.pivo, x.r1, x.r2].map(alRs).join(' · ')],
    ['Mínima e máxima de 12 meses', alRs(x.min252) + ' – ' + alRs(x.max252)],
    ['Variação', '5 dias ' + alPct(x.ret_5d, 1, true) + ' · 21 dias ' + alPct(x.ret_21d, 1, true) + ' · no ano ' + alPct(x.ret_ano, 1, true)]];
  const niv = [['Entrada ideal', 'R$ ' + alRs(x.ent_ideal)], ['Entrada máxima', 'R$ ' + alRs(x.ent_max)],
    ['Stop', 'R$ ' + alRs(x.stop) + ' (' + alPct(x.perda, 1, true) + ')'], ['Alvo 1', 'R$ ' + alRs(x.alvo1) + ' (' + alPct(x.ganho1, 1, true) + ')'],
    ['Alvo 2 ' + (_al.cen === 'D' ? '(cenário D)' : '(técnico)'), 'R$ ' + alRs(v.alvo2) + ' (' + alPct(v.ganho, 1, true) + ')'],
    ['Ganho / risco', alNum(v.rr, 1)]]
    .concat(res ? [] : [['Reação estimada à eleição', 'se ' + escHtml(nd) + ': ' + alPct(x.choque_d, 1, true) + ' · se ' + escHtml(ne) + ': ' + alPct(x.choque_e, 1, true)],
      ['Preço estimado se ' + escHtml(ne) + ' vencer', 'R$ ' + alRs(x.preco_e)]]);
  const tab = rows => '<table class="al-mini">' + rows.map(r => '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>').join('') + '</table>';
  const al = x.alertas || [];
  return '<div class="al-detalhe"><button type="button" class="al-fechar" data-al-fechar="1" aria-label="Fechar">×</button><div class="al-det-topo"><h3>' + escHtml(x.empresa || x.ticker) + ' <span class="rx-tk">' + escHtml(x.ticker) + '</span></h3>'
    + '<span class="prova-nota">' + escHtml(x.setor || '') + ' · reação ao cenário: ' + (x.origem_choque === 'robô' ? 'calculada pelo robô da Carteira SOLIDUNS' : 'estimada pelo grupo setorial') + '</span></div>'
    + alGrafico(x)
    + '<div class="al-det-grade"><div><h4>Níveis</h4>' + tab(niv) + '</div><div><h4>Indicadores</h4>' + tab(ind) + '</div></div>'
    + '<h4>Leitura dos indicadores</h4><ul class="al-leitura">' + alLeitura(x).map(l => '<li><b>' + l[0] + ':</b> ' + l[1] + '</li>').join('') + '</ul>'
    + (al.length ? '<h4>Alertas</h4><ul class="al-leitura al-lista-alertas">' + al.map(a => '<li>' + escHtml(a.charAt(0).toUpperCase() + a.slice(1)) + '.</li>').join('') + '</ul>' : '')
    + '</div>';
}

function alComoLerHtml(e){
  const nd = (e && e.candidato_d) || 'D';
  return '<details class="al-det al-ler"><summary>Como ler os alvos</summary><ul>'
    + '<li><b>Entrada ideal:</b> preço de compra num recuo, entre o suporte do pivô semanal e a média de 9 dias. <b>Entrada máxima:</b> 1% acima do último fechamento.</li>'
    + '<li><b>Stop:</b> abaixo do menor entre o segundo suporte do pivô e a média de 21 dias, menos uma volatilidade diária (ATR).</li>'
    + '<li><b>Alvo 1:</b> primeira resistência acima do preço. <b>Alvo 2:</b> no cenário D, o preço depois da reação estimada à vitória de ' + escHtml(nd)
    + ', ajustado à resistência mais próxima; no cenário técnico, a resistência seguinte ao alvo 1.</li>'
    + '<li><b>Ganho até o alvo 2:</b> medido a partir da entrada ideal. <b>Do preço atual:</b> o mesmo ganho, comprando pelo último fechamento.</li>'
    + '<li><b>Ganho / risco:</b> ganho até o alvo 2 dividido pela perda até o stop. Acima de 1,5 indica boa assimetria.</li>'
    + '<li><b>Em verde:</b> ganho até o alvo 2 de ' + alPct(alLimite(), 0) + ' ou mais e nenhum alerta grave (setor fora das listas, prejuízo, patrimônio negativo, recuperação judicial, ganho/risco abaixo de 1, cotação abaixo de R$ 1).</li>'
    + '<li><b>Reação ao cenário:</b> mesmo método da Carteira SOLIDUNS: custo de capital pelo risco-país de cada cenário e sensibilidade medida nos pregões com pesquisas eleitorais.</li>'
    + '</ul><p class="prova-nota">Dados públicos da B3 (cotações diárias) e da CVM (demonstrações financeiras). '
    + 'Material de caráter educacional: não constitui recomendação de compra ou venda de valores mobiliários. Rentabilidade passada não garante rentabilidade futura.</p></details>';
}

async function alPublicar(publicar, botao){
  const d = _al.dados; if(!d || !d.execucao) return;
  const msg = document.getElementById('al-admin-msg');
  if(botao) botao.disabled = true;
  if(msg){ msg.textContent = publicar ? 'Publicando…' : 'Retirando…'; msg.style.color = ''; }
  try{
    const r = await raRpc('alvos_publicar', {p_execucao_id: d.execucao.id, p_publicar: !!publicar});
    _al.dados = r; alDesenhar('');
    const m2 = document.getElementById('al-admin-msg');
    if(m2) m2.textContent = publicar ? 'Lista publicada: os assinantes já veem esta execução.' : 'Publicação retirada: os assinantes voltam a ver a publicação anterior (se houver).';
  }catch(e){
    if(botao) botao.disabled = false;
    const t = String((e && e.message) || e);
    if(msg){ msg.textContent = /SEM_PERMISSAO/.test(t) ? 'Só os administradores-mestre podem publicar.' : t; msg.style.color = '#e57373'; }
  }
}

/* rota #/investimentos/mercado-financeiro/alvos-soliduns e item do menu */
if(typeof MF_SUBROTAS !== 'undefined' && MF_SUBROTAS.indexOf(AL_ROTA) === -1) MF_SUBROTAS.push(AL_ROTA);
if(typeof mfAbrirSubrota === 'function'){
  const _mfAbrirSubrotaV171 = mfAbrirSubrota;
  mfAbrirSubrota = function(sub){
    if(sub === AL_ROTA){
      const sel = document.getElementById('mercado-acoes');
      if(sel && sel.value !== 'br'){ sel.value = 'br'; sel.dispatchEvent(new Event('change')); }
      alMostrar(); return;
    }
    return _mfAbrirSubrotaV171.apply(this, arguments);
  };
}
document.addEventListener('click', ev => {
  const a = ev.target && ev.target.closest && ev.target.closest('[data-acao="' + AL_ROTA + '"]');
  if(!a) return;
  ev.preventDefault(); ev.stopPropagation();
  alMostrar();
}, true);

(function v171Estilo(){
  const st = document.createElement('style');
  st.textContent = '.al-selo{background:rgba(76,175,80,.14);color:#6fbf73;border-color:rgba(76,175,80,.45);}'
    + '.al-subtit{margin:-4px 0 8px;font-size:15px;letter-spacing:.04em;color:var(--gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left !important;}'
    + '.al-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:0 0 14px;}'
    + '.al-card{border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;background:rgba(255,255,255,.02);}'
    + '.al-card span{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);text-align:left !important;}'
    + '.al-card b{display:block;font-size:20px;margin:4px 0 2px;color:var(--gold);font-variant-numeric:tabular-nums;}'
    + '.al-card i{display:block;font-style:normal;font-size:11.5px;color:var(--ink-soft);text-align:left !important;}'
    + '.al-filtros{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end;margin:4px 0 8px;}'
    + '.al-filtros label{display:flex;flex-direction:column;gap:4px;font-size:11.5px;letter-spacing:.04em;color:var(--ink-soft);}'
    + '.al-filtros select,.al-filtros input[type=search]{background:transparent;color:inherit;border:1px solid var(--line);border-radius:var(--radius);padding:7px 10px;font:inherit;font-size:13px;min-width:150px;}'
    + '.al-filtros select option{background:#10171f;color:#e8e6df;}'
    + '.al-filtros .al-check{flex-direction:row;align-items:center;gap:6px;font-size:13px;padding-bottom:8px;}'
    + '.al-tabela th{cursor:pointer;white-space:nowrap;} .al-tabela th.al-dir{text-align:right;}'
    + '.al-linha{cursor:pointer;} .al-linha:hover td{background:rgba(255,255,255,.04);} .al-linha:focus{outline:1px solid var(--gold);outline-offset:-1px;}'
    + '.al-verde td{background:rgba(76,175,80,.12);} .al-verde td.rx-tk,.al-verde td b{color:#7fd083;}'
    + '.al-restrita td{color:var(--ink-soft);} .al-aberta td{background:rgba(217,179,16,.10);}'
    + '.al-pos{color:#6fbf73;} .al-neg{color:#e57373;} .al-restrita .al-pos{color:#8fae90;}'
    + '.al-verde-txt{color:#6fbf73;font-weight:600;}'
    + '.al-alertas{white-space:nowrap;font-size:12px;} .al-qtd{color:#e0a458;border-bottom:1px dotted #e0a458;} .al-ok{color:var(--ink-soft);}'
    + '.al-detalhe{position:relative;padding:14px 16px 16px;border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:var(--radius);margin:0 0 14px;background:rgba(255,255,255,.015);scroll-margin-top:90px;}'
    + '#al-detalhe-box{scroll-margin-top:90px;}'
    + '.al-fechar{position:absolute;top:8px;right:10px;background:transparent;border:1px solid var(--line);color:inherit;border-radius:var(--radius);width:30px;height:30px;font-size:18px;line-height:1;cursor:pointer;}'
    + '.al-det-topo{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;margin:0 0 8px;} .al-det-topo h3{margin:0;font-size:17px;}'
    + '.al-graf svg{width:100%;height:auto;display:block;} .al-grade{stroke:rgba(255,255,255,.07);stroke-width:1;}'
    + '.al-eixo{fill:var(--ink-soft,#9aa3ab);font-size:11px;} .al-rot{font-size:11px;font-weight:600;}'
    + '.al-legenda{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--ink-soft);margin:4px 0 10px;}'
    + '.al-legenda i{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle;}'
    + '.al-det-grade{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:16px;}'
    + '.al-detalhe h4{margin:12px 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);}'
    + '.al-mini{width:100%;border-collapse:collapse;font-size:12.5px;} .al-mini th{text-align:left;font-weight:500;color:var(--ink-soft);padding:4px 8px 4px 0;vertical-align:top;border:0 !important;text-transform:none !important;letter-spacing:0 !important;font-size:12.5px !important;background:transparent !important;}'
    + '.al-mini td{text-align:right;padding:4px 0;font-variant-numeric:tabular-nums;} .al-mini tr+tr{border-top:1px solid var(--line);}'
    + '.al-leitura{margin:4px 0 0 18px;padding:0;font-size:13px;line-height:1.6;} .al-leitura li{text-align:left !important;margin:0 0 3px;}'
    + '.al-lista-alertas li{color:#e0a458;}'
    + '.al-det{border:1px solid var(--line);border-radius:var(--radius);padding:10px 14px;margin:16px 0 0;} .al-avisos{margin:0 0 14px;}'
    + '.al-det summary{cursor:pointer;font-size:13.5px;color:var(--gold);}'
    + '.al-det ul{margin:10px 0 6px 18px;padding:0;font-size:13px;line-height:1.6;color:var(--ink-soft);} .al-det li{text-align:left !important;margin:0 0 4px;}'
    + '.al-admin,.al-publicada{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;}'
    + '.al-publicada{border:1px solid var(--line);border-radius:var(--radius);padding:8px 12px;font-size:12.5px;margin:0 0 12px;color:var(--ink-soft);}'
    + '@media (max-width:1100px){.al-cards{grid-template-columns:repeat(3,minmax(0,1fr));}}'
    + '@media (max-width:760px){.al-det-grade{grid-template-columns:1fr;}}'
    + '@media (max-width:640px){.al-cards{grid-template-columns:1fr 1fr;} .al-filtros label{flex:1 1 140px;}}'
    + '@media (max-width:420px){.al-cards{grid-template-columns:1fr;}}';
  document.head.appendChild(st);
})();
