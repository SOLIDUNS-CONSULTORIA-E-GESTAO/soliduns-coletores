
/* ===== v123: RADAR DE AÇÕES EXPONENCIAIS (Mercado financeiro > Ações, BR e EUA) =====
   Ranking lido do banco (RPC radar_exponencial_publico, SQL 140). Nada é calculado nem inventado na página. */
var _rx = {mercado: 'br', dados: null, ord: 'posicao', asc: true};
function rxCaixa(chaveMenu, mercado){
  _rx.mercado = mercado === 'us' ? 'us' : 'br';
  relEsconder();
  const caixa = document.getElementById('mf-analises-pub');
  document.getElementById('mf-conteudo-padrao').style.display = 'none';
  document.getElementById('mf-painel-implantacao').style.display = 'none';
  caixa.style.display = 'block';
  relAlternarScreener(false);
  mfGravarRota((_rx.mercado === 'us' ? 'eua/' : '') + 'radar');
  marcarItemAtivoMF(chaveMenu || (_rx.mercado === 'us' ? 'acoes-us' : 'acoes'));
  fecharTodosDropdownsMF();
  setTituloPagina('Radar de Ações Exponenciais', 'Radar de Ações Exponenciais SOLIDUNS — ações com potencial de crescimento acelerado, pela confluência de momentum técnico e fundamentos.');
  return caixa;
}
function rxMetodoHtml(){
  return '<div class="rx-pilares">'
    + '<div class="rx-pilar"><h4>1 · Momentum técnico</h4><p>Tendência e aceleração do preço: posição em relação às médias móveis, taxa de variação, força relativa ao índice de referência, volume acima da média e rompimento de máximas.</p><span class="rx-peso">Pilar principal do radar</span></div>'
    + '<div class="rx-pilar"><h4>2 · Fundamentos</h4><p>Qualidade do negócio que sustenta o movimento: crescimento de receita e lucro, rentabilidade (ROE e ROIC), margens, endividamento e geração de caixa.</p><span class="rx-peso">Filtro de qualidade</span></div>'
    + '<div class="rx-pilar"><h4>3 · Confluência</h4><p>Entram no ranking só as ações em que os sinais técnicos e fundamentalistas apontam na mesma direção, ao mesmo tempo.</p><span class="rx-peso">Fusion Analysis SOLIDUNS</span></div>'
    + '<div class="rx-pilar"><h4>4 · Score Exponencial</h4><p>Nota de 0 a 100 que combina os três pilares e ordena o ranking. Pesos e critérios definidos pela metodologia própria da SOLIDUNS.</p><span class="rx-peso">Ranking atualizado após o fechamento</span></div>'
    + '</div>';
}
function rxNum(v, c){ return (v === null || v === undefined || v === '' || isNaN(Number(v))) ? '—' : Number(v).toLocaleString('pt-BR', {minimumFractionDigits: c, maximumFractionDigits: c}); }
function rxData(d){ if(!d) return ''; const p = String(d).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(d); }
function rxScoreHtml(v){
  if(v === null || v === undefined || isNaN(Number(v))) return '—';
  const n = Math.max(0, Math.min(100, Number(v)));
  return '<span class="rx-score"><b>' + rxNum(n, 0) + '</b><i><span style="width:' + n + '%"></span></i></span>';
}
async function rxMostrar(chaveMenu, mercado){
  const caixa = rxCaixa(chaveMenu, mercado);
  const nomeMercado = _rx.mercado === 'us' ? 'Mercado americano' : 'Mercado brasileiro';
  caixa.innerHTML = '<div class="rel-topo"><h2>Radar de Ações Exponenciais <span class="ra-selo rx-selo">RADAR</span> · ' + nomeMercado + '</h2></div>'
    + '<p class="rx-lead">Scanner de ações com potencial de crescimento acelerado. O radar cruza indicadores técnicos, sobretudo de momentum, com bons fundamentos e ranqueia as ações pelo <b>Score Exponencial SOLIDUNS</b>.</p>'
    + rxMetodoHtml() + '<div id="rx-ranking"><p class="prova-nota">Carregando o ranking…</p></div>';
  _rx.dados = null; _rx.ord = 'posicao'; _rx.asc = true;
  let r = null, erro = '';
  try{ r = await raRpc('radar_exponencial_publico', {p_mercado: _rx.mercado}); }
  catch(e){ erro = String((e && e.message) || e); }
  if(_rx.mercado !== (mercado === 'us' ? 'us' : 'br')) return;
  _rx.dados = (r && Array.isArray(r.itens)) ? r : {itens: [], data_ref: null};
  rxDesenhar(erro);
}
function rxDesenhar(erro){
  const alvo = document.getElementById('rx-ranking'); if(!alvo) return;
  const d = _rx.dados || {itens: []};
  if(!d.itens.length){
    const semFuncao = /radar_exponencial_publico|could not find|PGRST202|404/i.test(erro || '');
    alvo.innerHTML = '<div class="rx-vazio"><h3>Ranking em calibração</h3><p>A metodologia do Score Exponencial está em definição. '
      + 'Quando o primeiro ranking do ' + (_rx.mercado === 'us' ? 'mercado americano' : 'mercado brasileiro') + ' for publicado, ele aparece aqui, com a data-base e os sinais de cada ação.</p></div>'
      + ((erro && !semFuncao) ? '<p class="prova-nota" style="margin-top:10px;">' + escHtml(erro) + '</p>' : '');
    return;
  }
  const setores = [...new Set(d.itens.map(x => x.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  alvo.innerHTML = (d.previa ? '<div class="rx-previa">PRÉVIA — visível só para administradores (ranking ainda não publicado)</div>' : '')
    + '<div class="rx-barra"><input type="search" id="rx-busca" placeholder="Buscar ação ou empresa" aria-label="Buscar ação ou empresa">'
    + '<select id="rx-setor" aria-label="Setor"><option value="">Todos os setores</option>' + setores.map(s => '<option>' + escHtml(s) + '</option>').join('') + '</select>'
    + '<select id="rx-min" aria-label="Score mínimo"><option value="0">Qualquer Score</option><option value="50">Score 50+</option><option value="70">Score 70+</option><option value="85">Score 85+</option></select></div>'
    + '<p class="rx-info" id="rx-info"></p><div class="rx-tabela-wrap"><table class="rx-tabela"><thead><tr>'
    + [['posicao', '#'], ['ticker', 'Ação'], ['nome', 'Empresa'], ['setor', 'Setor'], ['preco', 'Preço'], ['nota_momentum', 'Momentum'], ['nota_fundamentos', 'Fundamentos'], ['score', 'Score'], ['', 'Sinais']]
        .map(c => '<th' + (c[0] ? ' data-rx-ord="' + c[0] + '"' : '') + '>' + c[1] + '</th>').join('')
    + '</tr></thead><tbody id="rx-corpo"></tbody></table></div>';
  ['rx-busca', 'rx-setor', 'rx-min'].forEach(id => document.getElementById(id).addEventListener('input', rxFiltrar));
  alvo.querySelectorAll('[data-rx-ord]').forEach(th => th.addEventListener('click', () => {
    const k = th.getAttribute('data-rx-ord'); if(_rx.ord === k) _rx.asc = !_rx.asc; else { _rx.ord = k; _rx.asc = (k === 'posicao' || k === 'ticker' || k === 'nome' || k === 'setor'); }
    rxFiltrar();
  }));
  rxFiltrar();
}
function rxFiltrar(){
  const d = _rx.dados || {itens: []}, corpo = document.getElementById('rx-corpo'); if(!corpo) return;
  const sem = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = sem((document.getElementById('rx-busca') || {}).value), setor = (document.getElementById('rx-setor') || {}).value || '';
  const min = Number((document.getElementById('rx-min') || {}).value || 0);
  let itens = d.itens.filter(x => (!q || sem(x.ticker + ' ' + x.nome).indexOf(q) >= 0) && (!setor || x.setor === setor) && (Number(x.score) || 0) >= min);
  const k = _rx.ord, s = _rx.asc ? 1 : -1;
  itens = itens.slice().sort((a, b) => { const va = a[k], vb = b[k];
    if(typeof va === 'number' || typeof vb === 'number') return ((Number(va) || 0) - (Number(vb) || 0)) * s;
    return String(va || '').localeCompare(String(vb || ''), 'pt-BR') * s; });
  const moeda = _rx.mercado === 'us' ? 'US$ ' : 'R$ ';
  corpo.innerHTML = itens.map(x => '<tr><td class="rx-num">' + rxNum(x.posicao, 0) + '</td><td class="rx-tk">' + escHtml(x.ticker || '') + '</td><td>' + escHtml(x.nome || '') + '</td>'
      + '<td>' + escHtml(x.setor || '') + '</td><td class="rx-num">' + (x.preco === null || x.preco === undefined ? '—' : moeda + rxNum(x.preco, 2)) + '</td>'
      + '<td class="rx-num">' + rxNum(x.nota_momentum, 0) + '</td><td class="rx-num">' + rxNum(x.nota_fundamentos, 0) + '</td><td>' + rxScoreHtml(x.score) + '</td>'
      + '<td>' + (Array.isArray(x.sinais) ? x.sinais.map(t => '<span class="rx-sinal">' + escHtml(t) + '</span>').join('') : '') + '</td></tr>').join('')
    || '<tr><td colspan="9" class="prova-nota">Nenhuma ação com esses filtros.</td></tr>';
  const info = document.getElementById('rx-info');
  if(info) info.textContent = itens.length + ' de ' + d.itens.length + ' ações' + (d.data_ref ? ' · data-base ' + rxData(d.data_ref) : '')
    + (d.metodologia_versao ? ' · metodologia ' + d.metodologia_versao : '');
}

/* ===== v134 — imagem padrão LEILÃO, alertas por e-mail só para quem ativar, intertítulos na manchete (patch134lei) ===== */
function leiPadraoV134(h){
  const ini = h.indexOf('<div class="leilao-card-foto');
  const fim = ini >= 0 ? h.indexOf('>', ini) : -1;
  if(fim < 0) return h;
  const abre = h.slice(ini, fim);
  if(abre.indexOf('vei-tem-foto') >= 0 || abre.indexOf('lei-tem-padrao') >= 0) return h;
  const resto = h.slice(fim + 1, fim + 1 + 1500);
  const m = /(?:aria-label|alt)="([^"]{1,120})"/.exec(resto);
  const origem = m ? m[1] : '';
  return h.slice(0, ini) + abre.replace('class="leilao-card-foto', 'class="leilao-card-foto lei-tem-padrao') + '>'
    + '<img class="lei-foto-padrao" src="leilao-padrao.jpg" alt="" loading="lazy" decoding="async">'
    + (origem ? '<span class="lei-padrao-origem">' + origem + '</span>' : '')
    + h.slice(fim + 1);
}
if(typeof radarCartao === 'function'){ const _radarCartaoV134 = radarCartao; radarCartao = function(l){ const h = _radarCartaoV134(l); return l && l.leiloeiro_fonte ? leiPadraoV134(h) : h; }; }   /* v135: só leiloeiros */
if(typeof veiCartao === 'function'){ const _veiCartaoV134 = veiCartao; veiCartao = function(l){ const h = _veiCartaoV134(l); return l && l.fonte === 'leiloeiro' ? leiPadraoV134(h) : h; }; }   /* v135: só leiloeiros */

/* alertas por e-mail: a escolha fica gravada para a pessoa (SQL 155) */
async function leiEmailStatusV134(){
  try{ const j = await vmRpcAuth('leiloes_alertas_email_status', {}); return typeof j === 'boolean' ? j : null; }catch(e){ return null; }
}
async function leiEmailDefinirV134(ativo){
  try{ const j = await vmRpcAuth('leiloes_alertas_email_definir', {p_ativo: !!ativo}); return typeof j === 'boolean' ? j : null; }catch(e){ return null; }
}
if(typeof perfMontar === 'function'){
  const _perfMontarV134 = perfMontar;
  perfMontar = function(){
    _perfMontarV134();
    const cx = document.getElementById('perf-email'), lb = cx && cx.closest('label');
    const b = lb && lb.querySelector('b'); if(b) b.textContent = 'Receber alertas por e-mail';
    const btn = document.querySelector('#perf-form .perf-btn[type="submit"]'); if(btn) btn.textContent = 'Salvar perfil';
  };
}
if(typeof perfCarregar === 'function'){
  const _perfCarregarV134 = perfCarregar;
  perfCarregar = async function(){
    const [f, st] = await Promise.all([_perfCarregarV134(), leiEmailStatusV134()]);
    if(st !== null) f.email = st && f.email !== false;   /* SQL 155 rodada: vale o que a pessoa ativou */
    return f;
  };
}
if(typeof perfSalvar === 'function'){
  const _perfSalvarV134 = perfSalvar;
  perfSalvar = async function(ev){
    if(ev) ev.preventDefault();
    const quer = !!(document.getElementById('perf-email') || {}).checked;
    await _perfSalvarV134(null);
    const r = await leiEmailDefinirV134(quer);
    const msg = document.getElementById('perf-toast');
    if(r === null && quer && msg && !/erro/.test(msg.className)) msg.textContent += ' (Não consegui gravar a escolha do e-mail agora: tente salvar de novo.)';
  };
  const fm = document.getElementById('perf-form');
  if(fm){ fm.removeEventListener('submit', _perfSalvarV134); fm.addEventListener('submit', perfSalvar); }
}

/* manchete de capa: parágrafo que começa com "## " vira intertítulo */
if(typeof vmDesenhar === 'function'){
  const _vmDesenharV134 = vmDesenhar;
  vmDesenhar = function(d){
    _vmDesenharV134(d);
    const m = d && d.conteudo && d.conteudo.manchete, el = document.getElementById('vm-texto');
    if(!m || !el || !(m.corpo || []).some(p => /^\s*##\s/.test(String(p || '')))) return;
    el.innerHTML = (m.corpo || []).filter(Boolean).map(p => /^\s*##\s/.test(String(p))
      ? '<h2 class="vm-art-inter">' + escHtml(String(p).replace(/^\s*##\s+/, '').trim()) + '</h2>' : '<p>' + vmTxt(p) + '</p>').join('');
    if(typeof _vmArt !== 'undefined' && _vmArt.ban !== undefined) vmPubNoTexto(el);
  };
}
(function v134Estilo(){
  const st = document.createElement('style');
  st.textContent = '.leilao-card-foto.lei-tem-padrao{position:relative;overflow:hidden;}'
    + '.leilao-card-foto .lei-foto-padrao{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 42%;display:block;z-index:1;background:#141611;}'
    + '.leilao-card-foto.lei-tem-padrao .lei-selo-desconto,.leilao-card-foto.lei-tem-padrao .vei-fav,.leilao-card-foto.lei-tem-padrao .vgal-qtd,.leilao-card-foto.lei-tem-padrao .lei-radar-marca{z-index:3;}'
    + '.leilao-card-foto .lei-padrao-origem{position:absolute;left:8px;top:8px;z-index:2;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
    + 'font:600 10.5px/1.2 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#f2ecd8;background:rgba(0,0,0,.62);padding:3px 7px;border-radius:3px;}'
    + '.leilao-card-foto .lei-foto-padrao-simples{width:100%;height:100%;object-fit:cover;display:block;}'
    + '#tela-noticias .vm-texto h2.vm-art-inter{font:500 1.5rem/1.3 "Newsreader",Georgia,serif;color:var(--vm-tinta);margin:1.8rem 0 .7rem;text-align:left;}';
  document.head.appendChild(st);
})();

/* ===== v136 — perfil EDITOR DO JORNAL: botão Redação e lista de editores na Equipe (patch136lei, SQL 160) ===== */
var _vmEditorV136 = {email: null, ok: null, prom: null};
function vmEmailSessaoV136(){
  return ((typeof sessaoAtual !== 'undefined' && sessaoAtual && (sessaoAtual.email || (sessaoAtual.user && sessaoAtual.user.email))) || '').trim().toLowerCase();
}
function vmRedacaoBotaoV136(){
  const nav = document.getElementById('vm-nav-redacao');
  if(!nav) return;
  const logado = typeof sessaoAtual !== 'undefined' && sessaoAtual && !sessaoAtual.modoLocal;
  if(!logado){ nav.hidden = true; return; }
  if(typeof ehAdminSistema === 'function' && ehAdminSistema()){ nav.hidden = false; return; }
  const em = vmEmailSessaoV136();
  if(_vmEditorV136.email === em && _vmEditorV136.ok !== null){ nav.hidden = !_vmEditorV136.ok; return; }
  nav.hidden = true;
  if(_vmEditorV136.prom && _vmEditorV136.email === em) return;
  _vmEditorV136.email = em; _vmEditorV136.ok = null;
  _vmEditorV136.prom = vmRpcAuth('vm_eh_editor', {}).then(j => j === true).catch(() => false).then(ok => {
    if(_vmEditorV136.email !== em) return;
    _vmEditorV136.ok = ok; _vmEditorV136.prom = null;
    const n = document.getElementById('vm-nav-redacao'); if(n) n.hidden = !ok;
  });
}
if(typeof vmCarregarScanner === 'function'){
  const _vmCarregarScannerV136 = vmCarregarScanner;
  vmCarregarScanner = function(){ _vmCarregarScannerV136.apply(this, arguments); vmRedacaoBotaoV136(); };
}

/* Equipe: lista de editores (só administrador-mestre; o banco confere de novo) */
function eqEditoresDesenharV136(l){
  const box = document.getElementById('eq-editores-lista');
  if(!box) return;
  if(!Array.isArray(l) || !l.length){ box.innerHTML = '<div class="leilao-ficha-sub">Nenhum editor cadastrado. Os administradores-mestre já têm acesso à Redação.</div>'; return; }
  box.innerHTML = '<table class="equipe-tabela" style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;">Nome</th><th style="text-align:left;">E-mail</th><th style="text-align:left;">Desde</th><th></th></tr></thead><tbody>'
    + l.map(e => '<tr><td>' + escHtml(e.nome || '—') + '</td><td>' + escHtml(e.email) + '</td><td>'
      + escHtml(e.criado_em ? new Date(e.criado_em).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}) : '') + '</td>'
      + '<td style="text-align:right;"><button type="button" class="btn-leilao-admin" data-eq-editor-retirar="' + escHtml(e.email) + '">Retirar</button></td></tr>').join('')
    + '</tbody></table>';
}
function eqEditoresMsgV136(t, erro){
  const m = document.getElementById('eq-editores-msg');
  if(m){ m.textContent = t || ''; m.style.color = erro ? '#e57373' : ''; }
}
function eqEditoresErroV136(e){
  const m = String((e && e.message) || e || '');
  if(/EMAIL_INVALIDO/.test(m)) return 'E-mail inválido.';
  if(/SEM_PERMISSAO/.test(m)) return 'Só os administradores-mestre podem mexer na lista de editores.';
  if(/404|vm_editores|migration 138/.test(m)) return 'Rode a SQL 160 no Supabase para ativar os editores do jornal.';
  return m || 'Não foi possível concluir.';
}
async function eqEditoresCarregarV136(){
  const sec = document.getElementById('eq-editores-secao');
  if(!sec) return;
  if(!(typeof ehAdminSistema === 'function' && ehAdminSistema())){ sec.style.display = 'none'; return; }
  sec.style.display = '';
  try{ eqEditoresDesenharV136(await vmRpcAuth('vm_editores_listar', {})); eqEditoresMsgV136(''); }
  catch(e){ eqEditoresDesenharV136([]); eqEditoresMsgV136(eqEditoresErroV136(e), true); }
}
if(typeof renderizarListaEquipe === 'function'){
  const _renderizarListaEquipeV136 = renderizarListaEquipe;
  renderizarListaEquipe = function(){ const r = _renderizarListaEquipeV136.apply(this, arguments); eqEditoresCarregarV136(); return r; };
}
(function v136Ligar(){
  const f = document.getElementById('eq-editores-form');
  if(f) f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const em = document.getElementById('eq-editor-email'), nm = document.getElementById('eq-editor-nome');
    const email = (em.value || '').trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ eqEditoresMsgV136('Escreva um e-mail válido.', true); return; }
    eqEditoresMsgV136('Incluindo…');
    try{
      eqEditoresDesenharV136(await vmRpcAuth('vm_editores_incluir', {p_email: email, p_nome: (nm.value || '').trim() || null}));
      em.value = ''; nm.value = '';
      eqEditoresMsgV136(email + ' agora é editor do jornal. A pessoa vê o botão Redação no próximo acesso ao jornal.');
    }catch(e){ eqEditoresMsgV136(eqEditoresErroV136(e), true); }
  });
  const box = document.getElementById('eq-editores-lista');
  if(box) box.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-eq-editor-retirar]'); if(!b) return;
    const email = b.getAttribute('data-eq-editor-retirar');
    b.disabled = true; eqEditoresMsgV136('Retirando…');
    try{ eqEditoresDesenharV136(await vmRpcAuth('vm_editores_retirar', {p_email: email})); eqEditoresMsgV136(email + ' não é mais editor do jornal.'); }
    catch(e){ b.disabled = false; eqEditoresMsgV136(eqEditoresErroV136(e), true); }
  });
})();
