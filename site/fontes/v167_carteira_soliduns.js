
/* ===== v167: CARTEIRA SOLIDUNS — risco Brasil e risco político (Mercado financeiro > Ações, BR) =====
   Lida do banco (RPC selecao_carteira_publico, SQL 182), gravada pelo robô selecao/robo_selecao.py.
   Nada é calculado nem inventado na página: só formatação. Login obrigatório (o banco confere).
   Administrador-mestre: vê a prévia mais recente e publica/retira (RPC selecao_publicar). */
var _sc = {dados: null, aba: 0, ord: 'posicao', asc: true, carregando: false};
var SC_ROTA = 'carteira-soliduns';

function scNum(v, c){ return (v === null || v === undefined || v === '' || isNaN(Number(v))) ? '—' : Number(v).toLocaleString('pt-BR', {minimumFractionDigits: c, maximumFractionDigits: c}); }
function scPct(v, c, sinal){
  if(v === null || v === undefined || isNaN(Number(v))) return '—';
  const n = Number(v) * 100, t = scNum(Math.abs(n), c === undefined ? 1 : c) + '%';
  if(!sinal) return (n < 0 ? '−' : '') + t;
  return (n > 0.0499 ? '+' : (n < -0.0499 ? '−' : '')) + t;
}
function scPp(v){   /* diferença de taxas, em pontos percentuais ao ano */
  if(v === null || v === undefined || isNaN(Number(v))) return '—';
  const n = Number(v) * 100;
  return (n > 0.049 ? '+' : (n < -0.049 ? '−' : '')) + scNum(Math.abs(n), 1) + ' p.p.';
}
function scCor(v){ const n = Number(v); return (isNaN(n) || Math.abs(n) < 0.0005) ? '' : (n > 0 ? ' sc-pos' : ' sc-neg'); }
function scData(d){ if(!d) return ''; const p = String(d).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(d); }
function scDataHora(d){
  if(!d) return '';
  try{ return new Date(d).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}); }
  catch(e){ return scData(d); }
}

function scCaixa(){
  relEsconder();
  const caixa = document.getElementById('mf-analises-pub');
  document.getElementById('mf-conteudo-padrao').style.display = 'none';
  document.getElementById('mf-painel-implantacao').style.display = 'none';
  caixa.style.display = 'block';
  relAlternarScreener(false);
  mfGravarRota(SC_ROTA);
  marcarItemAtivoMF('acoes');
  fecharTodosDropdownsMF();
  setTituloPagina('Carteira SOLIDUNS', 'Carteira SOLIDUNS de ações brasileiras — custo de capital sob risco Brasil, risco político, crescimento do setor, governança corporativa e margem bruta.');
  return caixa;
}

function scFatoresHtml(){
  const f = [
    ['1 · Risco Brasil', 'O CDS de 5 anos vira custo de capital de cada ação, conforme o quanto a empresa depende do país.'],
    ['2 · Risco político', 'Cada resultado eleitoral muda o risco Brasil. A carteira é avaliada nos dois cenários, com a probabilidade das pesquisas.'],
    ['3 · Crescimento do setor', 'Receita esperada do setor em cada cenário, pela inflação, pelo PIB e pelos juros.'],
    ['4 · Governança', 'Índice SOLIDUNS de 0 a 100: segmento de listagem, tag along, conselho, free float, controle e histórico na CVM.'],
    ['5 · Margem bruta', 'Nível e estabilidade da margem, comparados aos concorrentes do mesmo setor.'],
  ];
  return '<div class="sc-fatores">' + f.map(x => '<div class="rx-pilar"><h4>' + x[0] + '</h4><p>' + x[1] + '</p></div>').join('') + '</div>';
}

async function scMostrar(){
  const caixa = scCaixa();
  caixa.innerHTML = '<div class="rel-topo"><h2>Carteira SOLIDUNS <span class="ra-selo sc-selo">CARTEIRA</span></h2></div>'
    + '<p class="sc-subtit">Risco Brasil e risco político</p>'
    + '<p class="rx-lead">Carteira de ações brasileiras montada pelo método SOLIDUNS de cinco fatores. O ponto de partida é o <b>risco Brasil</b>, '
    + 'principal determinante do custo de capital e, portanto, da taxa de retorno exigida sobre o investimento.</p>'
    + scFatoresHtml() + '<div id="sc-conteudo"><p class="prova-nota">Carregando a carteira…</p></div>';
  _sc.dados = null; _sc.aba = 0; _sc.ord = 'posicao'; _sc.asc = true;
  let r = null, erro = '';
  try{ r = await raRpc('selecao_carteira_publico', {}); }
  catch(e){ erro = String((e && e.message) || e); }
  if(!document.getElementById('sc-conteudo')) return;   /* a pessoa já saiu da página */
  _sc.dados = (r && typeof r === 'object') ? r : null;
  scDesenhar(erro);
}

function scCenarioHtml(e){
  const nd = e.candidato_d || 'D', ne = e.candidato_e || 'E';
  const pd = Number(e.p_d);
  const card = (rot, val, sub) => '<div class="sc-card"><span>' + rot + '</span><b>' + val + '</b>' + (sub ? '<i>' + sub + '</i>' : '') + '</div>';
  const res = e.resultado === 'D' || e.resultado === 'E';
  return '<div class="sc-cards">'
    + card('Data-base', scData(e.data_referencia), 'pregão de referência')
    + (res ? card('Resultado da eleição', escHtml(e.resultado === 'D' ? nd : ne), 'cenário ' + e.resultado + ' confirmado')
           : card('Chance do cenário D', scPct(pd, 0), escHtml(nd) + ', pelas pesquisas'))
    + card('CDS Brasil 5 anos', scNum(e.cds_pb, 0) + ' pb', res ? 'risco-país usado' : ('se D: ' + scNum(e.cds_d_pb, 0) + ' · se E: ' + scNum(e.cds_e_pb, 0)))
    + card('Custo de capital', scPct(e.ke_medio, 1), 'ação média, ao ano')
    + card('Selic', scNum(e.selic, 2) + '%', 'meta do Copom')
    + '</div>'
    + (res ? '' : '<p class="sc-legenda">Cenário <b>D</b>: vitória de ' + escHtml(nd) + '. Cenário <b>E</b>: vitória de ' + escHtml(ne)
      + '. Prêmio político estimado no CDS: ' + scNum(e.delta_pb, 0) + ' pontos-base.</p>');
}

function scAdminHtml(d){
  if(!d.admin) return '';
  const e = d.execucao;
  const linha = d.previa
    ? '<div class="rx-previa sc-admin"><span>PRÉVIA — visível só para administradores. Execução de ' + scDataHora(e.executado_em)
      + (d.ultima_publicada ? '. Os assinantes veem a carteira publicada de ' + scData(d.ultima_publicada) + '.' : '. Ainda não há carteira publicada para os assinantes.')
      + '</span><button type="button" class="btn-leilao-admin" data-sc-publicar="1">Publicar para assinantes</button></div>'
    : '<div class="sc-publicada"><span>Publicada para os assinantes' + (e.publicado_em ? ' em ' + scDataHora(e.publicado_em) : '') + '.</span>'
      + '<button type="button" class="btn-leilao-admin" data-sc-publicar="0">Retirar publicação</button></div>';
  const av = Array.isArray(e.avisos) && e.avisos.length
    ? '<details class="sc-avisos"><summary>Avisos da execução (' + e.avisos.length + ') — só administradores</summary><ul>'
      + e.avisos.map(a => '<li>' + escHtml(a) + '</li>').join('') + '</ul></details>' : '';
  return linha + '<p class="prova-nota" id="sc-admin-msg"></p>' + av;
}

function scRotuloAba(rot, e){
  const nd = e.candidato_d || 'D', ne = e.candidato_e || 'E';
  if(rot === 'Atual') return 'Carteira atual';
  if(rot === 'Se vencer D') return 'Se vencer ' + nd + ' (D)';
  if(rot === 'Se vencer E') return 'Se vencer ' + ne + ' (E)';
  if(rot === 'Resultado D') return 'Carteira com ' + nd + ' eleito';
  if(rot === 'Resultado E') return 'Carteira com ' + ne + ' eleito';
  return rot;
}

function scDesenhar(erro){
  const alvo = document.getElementById('sc-conteudo'); if(!alvo) return;
  const d = _sc.dados;
  if(!d || !d.execucao){
    const semFuncao = /selecao_carteira_publico|could not find|PGRST202|404/i.test(erro || '');
    const admin = (d && d.admin) || (typeof ehAdminSistema === 'function' && ehAdminSistema());
    alvo.innerHTML = '<div class="rx-vazio"><h3>Carteira em preparação</h3><p>A primeira carteira aparece aqui depois do fechamento do pregão, '
      + 'com a data-base, os pesos de cada ação e a avaliação nos dois cenários eleitorais.</p></div>'
      + (admin && semFuncao ? '<p class="prova-nota" style="margin-top:10px;">Administrador: rode a SQL 182 no Supabase (supabase/migrations/182_selecao_carteira.sql).</p>' : '')
      + ((erro && !semFuncao) ? '<p class="prova-nota" style="margin-top:10px;">' + escHtml(erro) + '</p>' : '');
    return;
  }
  const e = d.execucao;
  const ordem = ['Atual', 'Se vencer D', 'Se vencer E', 'Resultado D', 'Resultado E'];
  const abas = [...new Set((d.carteiras || []).map(c => c.carteira))].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));
  if(_sc.aba >= abas.length) _sc.aba = 0;
  alvo.innerHTML = scAdminHtml(d) + scCenarioHtml(e)
    + '<h3 class="sc-tit">Carteira</h3>'
    + (abas.length > 1 ? '<div class="sc-abas" role="tablist">' + abas.map((a, i) => '<button type="button" role="tab" class="sc-aba' + (i === _sc.aba ? ' ativa' : '')
        + '" aria-selected="' + (i === _sc.aba) + '" data-sc-aba="' + i + '">' + escHtml(scRotuloAba(a, e)) + '</button>').join('') + '</div>' : '')
    + '<div id="sc-carteira"></div>'
    + '<details class="sc-ranking" id="sc-ranking"><summary>Ranking completo · ' + scNum((d.ranking || []).length, 0) + ' ações elegíveis</summary><div id="sc-ranking-corpo"></div></details>'
    + scComoLerHtml();
  alvo.querySelectorAll('[data-sc-aba]').forEach(b => b.addEventListener('click', () => { _sc.aba = Number(b.getAttribute('data-sc-aba')); scDesenhar(''); }));
  alvo.querySelectorAll('[data-sc-publicar]').forEach(b => b.addEventListener('click', () => scPublicar(b.getAttribute('data-sc-publicar') === '1', b)));
  const det = document.getElementById('sc-ranking');
  det.addEventListener('toggle', () => { if(det.open && !document.getElementById('sc-rk-corpo')) scRankingMontar(); });
  scCarteiraDesenhar(abas[_sc.aba], e);
}

function scCarteiraDesenhar(rotulo, e){
  const box = document.getElementById('sc-carteira'); if(!box) return;
  const d = _sc.dados;
  const itens = (d.carteiras || []).filter(c => c.carteira === rotulo).sort((a, b) => (Number(b.peso) || 0) - (Number(a.peso) || 0));
  const res = (Array.isArray(e.resumos) ? e.resumos : []).find(r => r && r.rotulo === rotulo) || {};
  const pmax = Math.max(0.0001, ...itens.map(x => Number(x.peso) || 0));
  const pos = rotulo === 'Atual' || rotulo === 'Resultado D' || rotulo === 'Resultado E';
  const resultado = e.resultado === 'D' || e.resultado === 'E';
  const resumo = '<p class="rx-info">' + itens.length + ' ações'
    + (res.igov_medio !== undefined ? ' · governança média ' + scNum(res.igov_medio, 0) : '')
    + (!resultado && res.choque_D !== undefined ? ' · reação imediata estimada: <span class="' + scCor(res.choque_D).trim() + '">' + scPct(res.choque_D, 1, true)
      + '</span> se D, <span class="' + scCor(res.choque_E).trim() + '">' + scPct(res.choque_E, 1, true) + '</span> se E' : '')
    + (res.restricoes_ok === false ? ' · <b class="sc-neg">limites não atendidos nesta execução</b>' : '') + '</p>';
  const cab = [['#', 1], ['Ação', 0], ['Empresa', 0], ['Setor', 0], ['Peso', 0], ['Escore', 1], ['P/L', 1], ['Excesso*', 1]]
    .concat(resultado ? [] : [['Se D', 1], ['Se E', 1]]).concat([['Governança', 1]]);
  box.innerHTML = resumo + '<div class="rx-tabela-wrap"><table class="rx-tabela sc-tabela"><thead><tr>'
    + cab.map(c => '<th' + (c[1] ? ' class="sc-dir"' : '') + '>' + c[0] + '</th>').join('') + '</tr></thead><tbody>'
    + (itens.map((x, i) => '<tr><td class="rx-num">' + (i + 1) + '</td><td class="rx-tk">' + escHtml(x.ticker || '') + '</td>'
        + '<td>' + escHtml(x.empresa || '') + (x.estatal ? ' <span class="rx-sinal" title="Controle estatal">estatal</span>' : '') + '</td>'
        + '<td>' + escHtml(x.setor || '') + '</td>'
        + '<td><span class="sc-peso"><b>' + scPct(x.peso, 1) + '</b><i><span style="width:' + Math.round(100 * (Number(x.peso) || 0) / pmax) + '%"></span></i></span></td>'
        + '<td class="rx-num">' + scNum(x.escore, 2) + '</td><td class="rx-num">' + scNum(x.pl, 1) + '</td>'
        + '<td class="rx-num' + scCor(x.excesso_rel) + '">' + scPp(x.excesso_rel) + '</td>'
        + (resultado ? '' : '<td class="rx-num' + scCor(x.choque_d) + '">' + scPct(x.choque_d, 1, true) + '</td><td class="rx-num' + scCor(x.choque_e) + '">' + scPct(x.choque_e, 1, true) + '</td>')
        + '<td class="rx-num">' + scNum(x.igov, 0) + '</td></tr>').join('')
      || '<tr><td colspan="' + cab.length + '" class="prova-nota">Nenhuma ação nesta carteira.</td></tr>')
    + '</tbody></table></div>'
    + (pos ? '' : '<p class="sc-legenda">Carteira pronta para o caso de vitória do candidato indicado, para executar depois da apuração. '
        + 'O potencial de cada ação já desconta a reação esperada do preço ao resultado.</p>');
}

function scRankingMontar(){
  const box = document.getElementById('sc-ranking-corpo'); if(!box) return;
  const itens = (_sc.dados && _sc.dados.ranking) || [];
  const setores = [...new Set(itens.map(x => x.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const col = [['posicao', '#'], ['ticker', 'Ação'], ['empresa', 'Empresa'], ['setor', 'Setor'], ['escore', 'Escore'], ['excesso_rel', 'Excesso*'],
    ['g_esperado', 'Cresc. setor'], ['igov', 'Governança'], ['mb_media', 'Margem bruta'], ['gamma', 'Sensib. política'], ['pl', 'P/L']];
  box.innerHTML = '<div class="rx-barra"><input type="search" id="sc-rk-busca" placeholder="Buscar ação ou empresa" aria-label="Buscar ação ou empresa">'
    + '<select id="sc-rk-setor" aria-label="Setor"><option value="">Todos os setores</option>' + setores.map(s => '<option>' + escHtml(s) + '</option>').join('') + '</select></div>'
    + '<p class="rx-info" id="sc-rk-info"></p><div class="rx-tabela-wrap"><table class="rx-tabela"><thead><tr>'
    + col.map(c => '<th data-sc-ord="' + c[0] + '">' + c[1] + '</th>').join('') + '</tr></thead><tbody id="sc-rk-corpo"></tbody></table></div>';
  ['sc-rk-busca', 'sc-rk-setor'].forEach(id => document.getElementById(id).addEventListener('input', scRankingFiltrar));
  box.querySelectorAll('[data-sc-ord]').forEach(th => th.addEventListener('click', () => {
    const k = th.getAttribute('data-sc-ord'); if(_sc.ord === k) _sc.asc = !_sc.asc; else { _sc.ord = k; _sc.asc = (k === 'posicao' || k === 'ticker' || k === 'empresa' || k === 'setor'); }
    scRankingFiltrar();
  }));
  scRankingFiltrar();
}
function scRankingFiltrar(){
  const corpo = document.getElementById('sc-rk-corpo'); if(!corpo) return;
  const todos = (_sc.dados && _sc.dados.ranking) || [];
  const sem = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = sem((document.getElementById('sc-rk-busca') || {}).value), setor = (document.getElementById('sc-rk-setor') || {}).value || '';
  let itens = todos.filter(x => (!q || sem(x.ticker + ' ' + x.empresa).indexOf(q) >= 0) && (!setor || x.setor === setor));
  const k = _sc.ord, s = _sc.asc ? 1 : -1;
  itens = itens.slice().sort((a, b) => { const va = a[k], vb = b[k];
    if(typeof va === 'number' || typeof vb === 'number'){
      if(va === null || va === undefined) return 1; if(vb === null || vb === undefined) return -1;
      return (Number(va) - Number(vb)) * s; }
    return String(va || '').localeCompare(String(vb || ''), 'pt-BR') * s; });
  corpo.innerHTML = itens.map(x => '<tr><td class="rx-num">' + scNum(x.posicao, 0) + '</td><td class="rx-tk">' + escHtml(x.ticker || '') + '</td>'
      + '<td>' + escHtml(x.empresa || '') + (x.estatal ? ' <span class="rx-sinal">estatal</span>' : '') + '</td><td>' + escHtml(x.setor || '') + '</td>'
      + '<td class="rx-num">' + scNum(x.escore, 2) + '</td><td class="rx-num' + scCor(x.excesso_rel) + '">' + scPp(x.excesso_rel) + '</td>'
      + '<td class="rx-num">' + scPct(x.g_esperado, 1) + '</td><td class="rx-num">' + scNum(x.igov, 0) + '</td>'
      + '<td class="rx-num">' + scPct(x.mb_media, 1) + '</td><td class="rx-num">' + scNum(x.gamma, 2) + '</td><td class="rx-num">' + scNum(x.pl, 1) + '</td></tr>').join('')
    || '<tr><td colspan="11" class="prova-nota">Nenhuma ação com esses filtros.</td></tr>';
  const info = document.getElementById('sc-rk-info');
  if(info) info.textContent = itens.length + ' de ' + todos.length + ' ações · clique no título da coluna para ordenar';
}

function scComoLerHtml(){
  return '<details class="sc-ler"><summary>Como ler a carteira</summary><ul>'
    + '<li><b>Peso:</b> fatia da carteira em cada ação. Fica entre 3% e 10% por ação, até 25% por setor e até 20% em estatais.</li>'
    + '<li><b>Escore:</b> nota que soma os cinco fatores, cada um comparado à média das ações elegíveis. Quanto maior, melhor.</li>'
    + '<li><b>Excesso*:</b> quanto o preço de hoje rende ao ano acima (ou abaixo) do custo de capital exigido, comparado à ação mediana.</li>'
    + '<li><b>Se D / Se E:</b> reação imediata estimada do preço a cada resultado da eleição. A carteira não pode cair mais de 10% em nenhum dos dois.</li>'
    + '<li><b>Governança:</b> Índice SOLIDUNS de 0 a 100.</li>'
    + '<li><b>Sensibilidade política:</b> quanto a ação sobe quando a chance do cenário D aumenta, medido nos pregões com pesquisas.</li>'
    + '</ul><p class="prova-nota">Dados públicos da CVM, da B3, do Banco Central e do Tesouro Nacional; risco-país pelo CDS de 5 anos. '
    + 'Material de caráter metodológico e educacional: não constitui recomendação de compra ou venda de valores mobiliários. '
    + 'Rentabilidade passada não garante rentabilidade futura.</p></details>';
}

async function scPublicar(publicar, botao){
  const d = _sc.dados; if(!d || !d.execucao) return;
  const msg = document.getElementById('sc-admin-msg');
  if(botao) botao.disabled = true;
  if(msg){ msg.textContent = publicar ? 'Publicando…' : 'Retirando…'; msg.style.color = ''; }
  try{
    const r = await raRpc('selecao_publicar', {p_execucao_id: d.execucao.id, p_publicar: !!publicar});
    _sc.dados = r; scDesenhar('');
    const m2 = document.getElementById('sc-admin-msg');
    if(m2) m2.textContent = publicar ? 'Carteira publicada: os assinantes já veem esta execução.' : 'Publicação retirada: os assinantes voltam a ver a publicação anterior (se houver).';
  }catch(e){
    if(botao) botao.disabled = false;
    const t = String((e && e.message) || e);
    if(msg){ msg.textContent = /SEM_PERMISSAO/.test(t) ? 'Só os administradores-mestre podem publicar.' : t; msg.style.color = '#e57373'; }
  }
}

/* rota #/investimentos/mercado-financeiro/carteira-soliduns e item do menu */
if(typeof MF_SUBROTAS !== 'undefined' && MF_SUBROTAS.indexOf(SC_ROTA) === -1) MF_SUBROTAS.push(SC_ROTA);   /* endereço direto (como o v106) */
if(typeof mfAbrirSubrota === 'function'){
  const _mfAbrirSubrotaV167 = mfAbrirSubrota;
  mfAbrirSubrota = function(sub){
    if(sub === SC_ROTA){
      const sel = document.getElementById('mercado-acoes');
      if(sel && sel.value !== 'br'){ sel.value = 'br'; sel.dispatchEvent(new Event('change')); }
      scMostrar(); return;
    }
    return _mfAbrirSubrotaV167.apply(this, arguments);
  };
}
document.addEventListener('click', ev => {
  const a = ev.target && ev.target.closest && ev.target.closest('[data-acao="' + SC_ROTA + '"]');
  if(!a) return;
  ev.preventDefault(); ev.stopPropagation();
  scMostrar();
}, true);

(function v167Estilo(){
  const st = document.createElement('style');
  st.textContent = '.sc-fatores{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:0 0 20px;}'
    + '.sc-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:0 0 8px;}'
    + '.sc-card{border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;background:rgba(255,255,255,.02);}'
    + '.sc-card span{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);text-align:left !important;}'
    + '.sc-card b{display:block;font-size:20px;margin:4px 0 2px;color:var(--gold);font-variant-numeric:tabular-nums;}'
    + '.sc-card i{display:block;font-style:normal;font-size:11.5px;color:var(--ink-soft);text-align:left !important;}'
    + '.sc-legenda{font-size:12.5px;color:var(--ink-soft);margin:6px 0 14px;text-align:left !important;}'
    + '.sc-subtit{margin:-4px 0 8px;font-size:15px;letter-spacing:.04em;color:var(--gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left !important;}'
    + '.sc-tit{margin:18px 0 8px;font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);}'
    + '.sc-abas{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;}'
    + '.sc-aba{background:transparent;color:inherit;border:1px solid var(--line);border-radius:var(--radius);padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;}'
    + '.sc-aba.ativa{border-color:var(--gold);color:var(--gold);}'
    + '.sc-tabela th.sc-dir{text-align:right;}'
    + '.sc-peso{display:inline-flex;align-items:center;gap:8px;min-width:110px;}'
    + '.sc-peso b{min-width:42px;text-align:right;font-variant-numeric:tabular-nums;}'
    + '.sc-peso i{display:block;height:6px;flex:1;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;}'
    + '.sc-peso i span{display:block;height:100%;background:var(--gold);}'
    + '.sc-pos{color:#6fbf73;} .sc-neg{color:#e57373;}'
    + '.sc-ranking,.sc-ler,.sc-avisos{border:1px solid var(--line);border-radius:var(--radius);padding:10px 14px;margin:16px 0 0;}'
    + '.sc-avisos{margin:0 0 14px;}'
    + '.sc-ranking summary,.sc-ler summary,.sc-avisos summary{cursor:pointer;font-size:13.5px;color:var(--gold);}'
    + '.sc-ranking[open] summary{margin-bottom:10px;}'
    + '.sc-ler ul,.sc-avisos ul{margin:10px 0 6px 18px;padding:0;font-size:13px;line-height:1.6;color:var(--ink-soft);}'
    + '.sc-ler li,.sc-avisos li{text-align:left !important;margin:0 0 4px;}'
    + '.sc-admin,.sc-publicada{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;}'
    + '.sc-publicada{border:1px solid var(--line);border-radius:var(--radius);padding:8px 12px;font-size:12.5px;margin:0 0 12px;color:var(--ink-soft);}'
    + '@media (max-width:1100px){.sc-fatores,.sc-cards{grid-template-columns:repeat(3,minmax(0,1fr));}}'
    + '@media (max-width:640px){.sc-fatores,.sc-cards{grid-template-columns:1fr 1fr;}}'
    + '@media (max-width:420px){.sc-fatores,.sc-cards{grid-template-columns:1fr;}}';
  document.head.appendChild(st);
})();
