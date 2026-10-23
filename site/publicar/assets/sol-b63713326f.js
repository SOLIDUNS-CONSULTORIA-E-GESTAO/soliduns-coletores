/* ===== v172: ABA OPÇÕES — análise de opções de ações da B3 (Mercado financeiro, mercado brasileiro) — SQL 187 =====
   Menu: Opções do dia · Grade de opções · Simulador de estratégias · Calculadora de opções · Tudo sobre opções.
   Opções do dia: mesmo layout das Cotações de fechamento (escolha do pregão, filtro de liquidez, maiores altas, baixas,
   mais negociadas e tabela completa com busca e ordenação), com calls e puts, ativo-objeto, vencimento, exercício,
   volatilidade implícita, delta e posição em aberto. Dados: RPCs opcoes_br_pregoes e opcoes_br_pregao (coletor
   coletor/coletar_opcoes_b3.py, Séries Históricas e arquivos públicos da B3). Calculadora: Black-Scholes na página.
   Login obrigatório (área Mercado financeiro). */
(function(){
  if(window.__opV172) return;
  const OP = window.__opV172 = {datas: null, cache: {}, dados: null, ultimo: null, carregando: false, erro: '',
    tipo: '', ativo: '', soLiq: true, busca: '', ordem: {campo: 'volume', dir: -1}, expandido: {}};
  const LIQ = 100000;
  const ROTAS = {'opcoes': 'dia', 'opcoes/grade': 'grade', 'opcoes/simulador': 'simulador', 'opcoes/calculadora': 'calculadora', 'opcoes/tudo-sobre': 'tudo'};
  const ACOES = {'opcoes-do-dia': 'dia', 'opcoes-grade': 'grade', 'opcoes-simulador': 'simulador', 'opcoes-calculadora': 'calculadora', 'opcoes-tudo-sobre': 'tudo'};
  const ROTA_DE = {dia: 'opcoes', grade: 'opcoes/grade', simulador: 'opcoes/simulador', calculadora: 'opcoes/calculadora', tudo: 'opcoes/tudo-sobre'};
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  /* posições de cada opção na lista do banco (SQL 187) */
  const I = {cod: 0, tipo: 1, est: 2, k: 3, venc: 4, ab: 5, mx: 6, mn: 7, f: 8, neg: 9, q: 10, vol: 11, fa: 12, vi: 13, dl: 14, oi: 15, du: 16};

  if(!document.getElementById('op-estilo-v172')){
    const st = document.createElement('style'); st.id = 'op-estilo-v172';
    st.textContent = ''
      + '.op-pagina .page-head h1{font-size:18px;}'
      + '.op-lead{font-size:13px; color:var(--ink-soft); margin:0 0 16px; max-width:900px; line-height:1.55;}'
      + '.op-ctl{display:flex; flex-wrap:wrap; align-items:center; gap:10px 20px; margin:0 0 14px;}'
      + '.op-ctl label{display:flex; align-items:center; gap:8px; font-size:12.5px; color:var(--text);}'
      + '.op-ctl select{background:var(--bg-elev, #111); color:var(--text); border:1px solid var(--line); border-radius:6px; padding:6px 26px 6px 10px; font:inherit; font-size:12.5px; cursor:pointer; max-width:230px;}'
      + '.op-ctl select:focus{outline:1px solid var(--gold); border-color:var(--gold);}'
      + '.op-ctl .op-aviso{font-size:11.5px; color:var(--ink-soft);}'
      + '.op-resumo{display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin:0 0 18px;}'
      + '.op-resumo div{border:1px solid var(--line); border-radius:var(--radius, 8px); padding:10px 12px;}'
      + '.op-resumo span{display:block; font-size:11px; color:var(--ink-soft); text-transform:uppercase; letter-spacing:.03em;}'
      + '.op-resumo b{display:block; font-size:16px; color:var(--text); margin-top:4px;}'
      + '.op-resumo i{display:block; font-style:normal; font-size:11px; color:var(--ink-soft); margin-top:2px;}'
      + '.op-tag{display:inline-block; font-size:10px; font-weight:700; letter-spacing:.04em; padding:1px 5px; border-radius:4px; margin-left:6px; vertical-align:1px;}'
      + '.op-tag-c{background:rgba(64,190,160,.14); color:var(--teal);}.op-tag-p{background:rgba(220,110,80,.14); color:var(--rust);}'
      + '.op-cod{background:none; border:0; padding:0; font:inherit; font-weight:700; color:var(--gold); text-decoration:underline; text-underline-offset:3px; cursor:pointer;}'
      + '.op-sit{font-size:11px; color:var(--ink-soft); white-space:nowrap;}'
      + '.op-tabela td, .op-tabela th{white-space:nowrap;}'
      + '.op-embreve{display:inline-block; font-size:9.5px; font-weight:700; letter-spacing:.05em; color:var(--ink-soft); border:1px solid var(--line); border-radius:4px; padding:0 4px; margin-left:6px; vertical-align:1px;}'
      + '.op-calc{display:grid; grid-template-columns:minmax(260px, 360px) 1fr; gap:22px; align-items:start;}'
      + '@media (max-width:760px){.op-calc{grid-template-columns:1fr;}}'
      + '.op-form{border:1px solid var(--line); border-radius:var(--radius, 8px); padding:14px; display:grid; gap:11px;}'
      + '.op-form label{display:grid; gap:4px; font-size:12px; color:var(--ink-soft);}'
      + '.op-form input, .op-form select{background:#161611; border:1px solid var(--line); color:var(--text); border-radius:6px; padding:8px 10px; font:inherit; font-size:13px;}'
      + '.op-form input:focus, .op-form select:focus{outline:none; border-color:var(--gold);}'
      + '.op-form .op-modo{display:flex; flex-wrap:wrap; gap:8px 18px; align-items:center;}'
      + '.op-form .op-modo label{display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text); cursor:pointer;}'
      + '.op-form input[type=radio]{width:auto; padding:0; margin:0; accent-color:var(--gold);}'
      + '.op-res{display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:10px;}'
      + '.op-res div{border:1px solid var(--line); border-radius:var(--radius, 8px); padding:11px 13px;}'
      + '.op-res span{display:block; font-size:11px; color:var(--ink-soft); text-transform:uppercase; letter-spacing:.03em;}'
      + '.op-res b{display:block; font-size:17px; color:var(--text); margin:4px 0 3px;}'
      + '.op-res i{display:block; font-style:normal; font-size:11.5px; color:var(--ink-soft); line-height:1.45;}'
      + '.op-res .op-destaque{border-color:var(--gold);}'
      + '.op-breve ul{margin:8px 0 0 18px; padding:0; font-size:13px; line-height:1.7; color:var(--text);}';
    document.head.appendChild(st);
  }

  /* ---------- utilidades ---------- */
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const num = (v, c) => (v === null || v === undefined || isNaN(Number(v))) ? '—' : Number(v).toLocaleString('pt-BR', {minimumFractionDigits: c, maximumFractionDigits: c});
  const rs = v => (v === null || v === undefined) ? '—' : 'R$ ' + num(v, 2);
  const vol = v => { const n = Number(v) || 0; return n >= 1e9 ? 'R$ ' + num(n / 1e9, 2) + ' bi' : n >= 1e6 ? 'R$ ' + num(n / 1e6, 1) + ' mi' : n >= 1e3 ? 'R$ ' + num(n / 1e3, 0) + ' mil' : 'R$ ' + num(n, 0); };
  const pct = (v, c) => (v === null || v === undefined || isNaN(v)) ? '—' : (v > 0 ? '+' : '') + num(v, c === undefined ? 2 : c) + '%';
  const dataBR = iso => { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; };
  const rotulo = iso => dataBR(iso) + ' (' + DIAS[new Date(String(iso).slice(0, 10) + 'T12:00:00Z').getUTCDay()] + ')';
  const variacao = x => (x[I.fa] > 0 && x[I.f] > 0) ? (x[I.f] / x[I.fa] - 1) * 100 : null;
  const cor = v => v > 0 ? 'var(--teal)' : (v < 0 ? 'var(--rust)' : 'var(--ink-soft)');
  const tag = t => t === 'C' ? '<span class="op-tag op-tag-c">CALL</span>' : '<span class="op-tag op-tag-p">PUT</span>';
  function situacao(x, S){
    if(!(S > 0) || !(x[I.k] > 0)) return '—';
    const m = S / x[I.k] - 1;
    if(Math.abs(m) <= 0.02) return 'No dinheiro';
    return (x[I.tipo] === 'C' ? m > 0 : m < 0) ? 'Dentro do dinheiro' : 'Fora do dinheiro';
  }

  async function rpc(nome, corpo){
    if(typeof sessaoAtual === 'undefined' || !sessaoAtual || sessaoAtual.modoLocal) throw new Error('Entre na sua conta para ver as opções.');
    const token = (typeof contaTokenValido === 'function') ? await contaTokenValido() : sessaoAtual.access_token;
    if(!token) throw new Error('Sua sessão expirou. Saia e entre de novo.');
    let r;
    try{
      r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + nome, {method: 'POST',
        headers: {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: JSON.stringify(corpo || {})});
    }catch(e){ throw new Error('Sem conexão com o servidor.'); }
    const j = await r.json().catch(() => null);
    if(r.status === 404) throw new Error('As opções ainda não estão disponíveis.');
    if(!r.ok) throw new Error('Não foi possível ler as opções do pregão.');
    return j;
  }

  /* ---------- caixa da página (mesmo lugar das demais telas do Mercado financeiro) ---------- */
  function caixa(tela){
    if(typeof relEsconder === 'function') relEsconder();
    const c = document.getElementById('mf-analises-pub');
    document.getElementById('mf-conteudo-padrao').style.display = 'none';
    const imp = document.getElementById('mf-painel-implantacao'); if(imp) imp.style.display = 'none';
    c.style.display = 'block';
    if(typeof relAlternarScreener === 'function') relAlternarScreener(false);
    if(typeof mfGravarRota === 'function') mfGravarRota(ROTA_DE[tela]);
    if(typeof marcarItemAtivoMF === 'function') marcarItemAtivoMF('opcoes');
    if(typeof fecharTodosDropdownsMF === 'function') fecharTodosDropdownsMF();
    const tit = {dia: 'Opções do dia', grade: 'Grade de opções', simulador: 'Simulador de estratégias', calculadora: 'Calculadora de opções', tudo: 'Tudo sobre opções'}[tela];
    if(typeof setTituloPagina === 'function') setTituloPagina(tit, tit + ' — opções de ações da B3 (calls e puts): prêmios, volatilidade implícita, delta e posição em aberto.');
    return c;
  }

  function mostrar(tela){
    const sel = document.getElementById('mercado-acoes');
    if(sel && sel.value !== 'br'){ sel.value = 'br'; sel.dispatchEvent(new Event('change')); }
    if(typeof areaLiberada === 'function' && !areaLiberada('mercado_financeiro')){
      if(typeof mfMostrarBloqueio === 'function') mfMostrarBloqueio('opcoes', 'mercado_financeiro');
      return;
    }
    if(tela === 'dia') return telaDia();
    if(tela === 'calculadora') return telaCalculadora();
    return telaEmBreve(tela);
  }
  window.opMostrar = mostrar;

  /* ===================================================================== OPÇÕES DO DIA */
  async function telaDia(){
    const c = caixa('dia');
    c.innerHTML = '<section class="cotacoes-box op-pagina" id="op-dia">'
      + '<div class="page-head" style="margin-bottom:8px;"><div><h1 id="op-titulo">Opções do dia</h1></div></div>'
      + '<p class="op-lead">Todas as opções de ações e de fundos de índice negociadas na B3 no pregão: opções de compra (<b>calls</b>) e de venda (<b>puts</b>), '
      + 'com o prêmio de fechamento, a variação, o volume, a <b>volatilidade implícita</b>, o <b>delta</b> e a quantidade em aberto.</p>'
      + '<div id="op-dia-corpo"><p class="prova-nota">Carregando as opções…</p></div></section>';
    OP.expandido = {};
    try{
      if(!OP.ultimo){
        const j = await rpc('opcoes_br_pregao', {p_data: null});
        if(!j || !j.data || !Array.isArray(j.ativos) || !j.ativos.length) throw new Error('Ainda não há opções gravadas.');
        OP.ultimo = String(j.data).slice(0, 10); OP.cache[OP.ultimo] = j; OP.dados = j;
      }else if(!OP.dados){ OP.dados = OP.cache[OP.ultimo]; }
    }catch(e){
      const corpo = document.getElementById('op-dia-corpo');
      if(corpo) corpo.innerHTML = '<p class="prova-nota">' + esc((e && e.message) || e) + '</p>';
      return;
    }
    desenharDia();
    if(OP.datas === null){
      try{ const d = await rpc('opcoes_br_pregoes', {p_limite: 260}); OP.datas = Array.isArray(d) ? d.map(x => String(x).slice(0, 10)) : []; }
      catch(e){ OP.datas = []; }
      controles();
    }
  }

  async function escolherData(iso){
    OP.expandido = {};
    if(OP.cache[iso]){ OP.dados = OP.cache[iso]; desenharDia(); return; }
    OP.carregando = true; OP.erro = ''; controles();
    try{
      const j = await rpc('opcoes_br_pregao', {p_data: iso});
      if(!j || !Array.isArray(j.ativos) || !j.ativos.length) throw new Error('Sem opções gravadas para esse pregão.');
      OP.cache[String(j.data).slice(0, 10)] = j; OP.dados = j;
    }catch(e){ OP.erro = String((e && e.message) || e); }
    OP.carregando = false;
    desenharDia();
  }

  /* lista plana [item, ativo, preço do ativo] com os filtros de tipo e ativo-objeto */
  function linhas(soLiq){
    const out = [];
    (OP.dados.ativos || []).forEach(a => {
      if(OP.ativo && a.ativo !== OP.ativo) return;
      (a.itens || []).forEach(x => {
        if(OP.tipo && x[I.tipo] !== OP.tipo) return;
        if(soLiq && !(x[I.vol] >= LIQ)) return;
        out.push({x, ativo: a.ativo, S: Number(a.preco)});
      });
    });
    return out;
  }

  function controles(){
    const box = document.getElementById('op-ctl'); if(!box || !OP.dados) return;
    const sel = document.getElementById('op-data');
    const datas = [OP.ultimo].concat((OP.datas || []).filter(x => x < OP.ultimo));
    const atual = String(OP.dados.data).slice(0, 10);
    const html = datas.map(x => '<option value="' + x + '"' + (x === atual ? ' selected' : '') + '>' + rotulo(x) + (x === OP.ultimo ? ' · último' : '') + '</option>').join('');
    if(sel.getAttribute('data-html') !== html){ sel.innerHTML = html; sel.setAttribute('data-html', html); }
    sel.value = atual; sel.disabled = !!OP.carregando;
    const av = document.getElementById('op-data-aviso');
    if(av) av.textContent = OP.carregando ? 'Carregando…' : (OP.datas === null ? 'Carregando datas…' : (OP.erro || ''));
  }

  function desenharDia(){
    const corpo = document.getElementById('op-dia-corpo'); if(!corpo || !OP.dados) return;
    const d = OP.dados, data = String(d.data).slice(0, 10);
    document.getElementById('op-titulo').textContent = 'Opções — pregão de ' + dataBR(data);
    if(OP.ativo && !(d.ativos || []).some(a => a.ativo === OP.ativo)) OP.ativo = '';
    if(!document.getElementById('op-ctl')){
      corpo.innerHTML = '<div class="op-ctl cotacoes-eod-controles" id="op-ctl">'
        + '<label for="op-data">Pregão <select id="op-data" aria-label="Data do pregão"></select><span class="op-aviso" id="op-data-aviso"></span></label>'
        + '<label for="op-tipo">Tipo <select id="op-tipo"><option value="">Calls e puts</option><option value="C">Só calls (opções de compra)</option><option value="P">Só puts (opções de venda)</option></select></label>'
        + '<label for="op-ativo">Ativo-objeto <select id="op-ativo"></select></label>'
        + '<label class="cotacoes-eod-toggle"><input type="checkbox" id="op-so-liquidas" checked> Somente opções com liquidez (volume de pelo menos R$ 100 mil no dia)</label>'
        + '<span class="cotacoes-eod-contagem" id="op-contagem"></span></div>'
        + '<div class="op-resumo" id="op-resumo"></div>'
        + '<div class="cotacoes-colunas">'
        + ['alta', 'baixa', 'volume'].map(t => '<div class="cotacoes-coluna"><h3>' + {alta: 'Maiores altas', baixa: 'Maiores baixas', volume: 'Mais negociadas'}[t] + '</h3>'
          + '<div class="cotacoes-lista" id="op-lista-' + t + '"></div><button type="button" class="cotacoes-vertodos" data-op-ver="' + t + '">Ver todos</button></div>').join('')
        + '</div>'
        + '<div class="cotacoes-eod-tabela op-tabela" id="op-tabela"><div class="cotacoes-eod-tabela-topo"><h3 id="op-tabela-titulo"></h3>'
        + '<input type="search" id="op-busca" placeholder="Buscar por código da opção ou do ativo" aria-label="Buscar opção"></div>'
        + '<div class="cotacoes-eod-tabela-wrap"><table><thead><tr>'
        + '<th data-campo="cod">Opção</th><th data-campo="ativo">Ativo</th><th data-campo="venc">Vencimento</th>'
        + '<th data-campo="k" class="num">Exercício</th><th data-campo="S" class="num">Preço do ativo</th><th data-campo="sit">Situação</th>'
        + '<th data-campo="f" class="num">Prêmio</th><th data-campo="var" class="num">Variação</th><th data-campo="neg" class="num">Negócios</th>'
        + '<th data-campo="volume" class="num">Volume</th><th data-campo="vi" class="num">Vol. implícita</th><th data-campo="dl" class="num">Delta</th>'
        + '<th data-campo="oi" class="num">Em aberto</th></tr></thead><tbody></tbody></table></div>'
        + '<p class="cotacoes-eod-tabela-rodape" id="op-tabela-rodape"></p></div>'
        + '<p class="screener-rodape-aviso" id="op-rodape"></p>';
      document.getElementById('op-data').addEventListener('change', function(){ escolherData(this.value); });
      document.getElementById('op-tipo').addEventListener('change', function(){ OP.tipo = this.value; OP.expandido = {}; desenharDia(); });
      document.getElementById('op-ativo').addEventListener('change', function(){ OP.ativo = this.value; OP.expandido = {}; desenharDia(); });
      document.getElementById('op-so-liquidas').addEventListener('change', function(){ OP.soLiq = this.checked; OP.expandido = {}; desenharDia(); });
      document.getElementById('op-busca').addEventListener('input', function(){ OP.busca = this.value; tabela(); });
      corpo.querySelectorAll('[data-op-ver]').forEach(b => b.addEventListener('click', function(){
        const t = this.getAttribute('data-op-ver'); OP.expandido[t] = !OP.expandido[t]; listas();
      }));
      corpo.querySelectorAll('#op-tabela th[data-campo]').forEach(th => {
        th.tabIndex = 0;
        const ordenar = () => {
          const campo = th.getAttribute('data-campo'), o = OP.ordem;
          OP.ordem = {campo, dir: o.campo === campo ? -o.dir : (['cod', 'ativo', 'venc', 'sit'].includes(campo) ? 1 : -1)};
          tabela();
        };
        th.addEventListener('click', ordenar);
        th.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); ordenar(); } });
      });
      corpo.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('[data-op-calc]');
        if(!b) return;
        e.preventDefault();
        abrirNaCalculadora(b.getAttribute('data-op-calc'));
      });
    }
    document.getElementById('op-tipo').value = OP.tipo;
    document.getElementById('op-so-liquidas').checked = OP.soLiq;
    const selA = document.getElementById('op-ativo');
    selA.innerHTML = '<option value="">Todos os ativos (' + (d.ativos || []).length + ')</option>'
      + (d.ativos || []).map(a => '<option value="' + esc(a.ativo) + '">' + esc(a.ativo) + ' — ' + num(a.n, 0) + ' opç' + (a.n === 1 ? 'ão' : 'ões') + '</option>').join('');
    selA.value = OP.ativo;
    controles();
    const todas = linhas(false), liq = todas.filter(o => o.x[I.vol] >= LIQ);
    document.getElementById('op-contagem').textContent = num(todas.length, 0) + ' opções negociadas · ' + num(liq.length, 0) + ' com liquidez';
    resumo(todas);
    listas();
    tabela();
    const sel = d.selic !== null && d.selic !== undefined ? num(Number(d.selic) * 100, 2) + '% ao ano' : 'sem dado';
    document.getElementById('op-rodape').textContent = 'Fechamento do pregão de ' + dataBR(data) + '. Fonte: B3 (Séries Históricas, cadastro de instrumentos e posições em aberto) '
      + 'e Banco Central (Selic de ' + sel + '). Volatilidade implícita e delta calculados pela SOLIDUNS pelo modelo de Black-Scholes, com o prazo em dias úteis '
      + 'até o vencimento e sem dividendos. Variação contra o último fechamento da mesma opção nos 10 pregões anteriores. Opções de índice ficam de fora. '
      + 'Liquidez = volume de pelo menos R$ 100 mil no dia. Informação educativa, não é recomendação de investimento.';
  }

  function resumo(todas){
    let vc = 0, vp = 0, nc = 0, np = 0;
    todas.forEach(o => { if(o.x[I.tipo] === 'C'){ vc += o.x[I.vol]; nc++; } else { vp += o.x[I.vol]; np++; } });
    const card = (r, v, s) => '<div><span>' + r + '</span><b>' + v + '</b><i>' + s + '</i></div>';
    const top = (OP.dados.ativos || []).slice(0, 3).map(a => a.ativo).join(', ');
    document.getElementById('op-resumo').innerHTML =
        card('Volume em calls', vol(vc), num(nc, 0) + ' opções de compra')
      + card('Volume em puts', vol(vp), num(np, 0) + ' opções de venda')
      + card('Puts ÷ calls', vc > 0 ? num(vp / vc, 2) : '—', 'pelo volume; acima de 1 = mais proteção')
      + card(OP.ativo ? 'Preço do ativo' : 'Ativos mais negociados', OP.ativo ? rs((OP.dados.ativos.find(a => a.ativo === OP.ativo) || {}).preco) : esc(top || '—'),
             OP.ativo ? 'fechamento de ' + esc(OP.ativo) : 'em volume de opções');
  }

  function itemHtml(o, tipoLista){
    const x = o.x, v = variacao(x);
    const topo = tipoLista === 'volume' ? vol(x[I.vol]) : pct(v);
    const corTopo = tipoLista === 'volume' ? 'var(--text)' : cor(v);
    return '<div class="cotacoes-item"><div class="cotacoes-item-topo"><b><button type="button" class="op-cod" data-op-calc="' + esc(x[I.cod]) + '" title="Abrir na calculadora">'
      + esc(x[I.cod]) + '</button>' + tag(x[I.tipo]) + '</b><span style="color:' + corTopo + ';">' + topo + '</span></div>'
      + '<div class="cotacoes-item-baixo"><span>' + esc(o.ativo) + ' · exercício ' + num(x[I.k], 2) + ' · vence ' + dataBR(x[I.venc]).slice(0, 5) + '</span>'
      + '<span>' + (tipoLista === 'volume' ? '<span style="color:' + cor(v) + ';">' + pct(v) + '</span>' : rs(x[I.f])) + '</span></div></div>';
  }

  function listas(){
    const uni = linhas(OP.soLiq);
    const g = {
      alta: uni.filter(o => variacao(o.x) > 0).sort((a, b) => variacao(b.x) - variacao(a.x)),
      baixa: uni.filter(o => variacao(o.x) < 0).sort((a, b) => variacao(a.x) - variacao(b.x)),
      volume: uni.slice().sort((a, b) => b.x[I.vol] - a.x[I.vol])
    };
    ['alta', 'baixa', 'volume'].forEach(t => {
      const cont = document.getElementById('op-lista-' + t), btn = document.querySelector('[data-op-ver="' + t + '"]');
      if(!cont || !btn) return;
      const lista = g[t], exp = !!OP.expandido[t];
      const vis = exp ? lista.slice(0, 300) : lista.slice(0, 3);
      cont.classList.toggle('cotacoes-lista-rolagem', exp);
      cont.innerHTML = vis.length ? vis.map(o => itemHtml(o, t)).join('')
        : '<p class="cotacoes-vazio">' + (t === 'alta' ? 'Nenhuma opção com liquidez fechou em alta.' : t === 'baixa' ? 'Nenhuma opção com liquidez fechou em baixa.' : 'Sem dados.') + '</p>';
      btn.style.display = lista.length > 3 ? 'block' : 'none';
      btn.textContent = exp ? 'Ver menos' : ('Ver todos (' + num(lista.length, 0) + ')');
    });
  }

  function valorCampo(o, campo){
    const x = o.x;
    switch(campo){
      case 'cod': return x[I.cod]; case 'ativo': return o.ativo; case 'venc': return x[I.venc]; case 'k': return x[I.k];
      case 'S': return o.S; case 'sit': return situacao(x, o.S); case 'f': return x[I.f];
      case 'var': { const v = variacao(x); return v === null ? -Infinity : v; }
      case 'neg': return x[I.neg]; case 'volume': return x[I.vol];
      case 'vi': return x[I.vi] === null ? -Infinity : x[I.vi]; case 'dl': return x[I.dl] === null ? -Infinity : x[I.dl];
      case 'oi': return x[I.oi] === null ? -Infinity : x[I.oi];
    }
    return 0;
  }

  function tabela(){
    const sec = document.getElementById('op-tabela'); if(!sec || !OP.dados) return;
    const termo = (OP.busca || '').trim().toUpperCase();
    let ls = linhas(OP.soLiq);
    if(termo) ls = ls.filter(o => o.x[I.cod].indexOf(termo) >= 0 || o.ativo.indexOf(termo) >= 0);
    const {campo, dir} = OP.ordem;
    ls.sort((a, b) => { const p = valorCampo(a, campo), q = valorCampo(b, campo);
      return (typeof p === 'number' && typeof q === 'number' ? (p === q ? 0 : (p < q ? -1 : 1)) : String(p).localeCompare(String(q), 'pt-BR')) * dir; });
    const rot = (OP.tipo === 'C' ? 'Calls' : OP.tipo === 'P' ? 'Puts' : 'Opções') + (OP.ativo ? ' de ' + OP.ativo : '') + (OP.soLiq ? ' com liquidez' : '');
    document.getElementById('op-tabela-titulo').textContent = rot + ' — fechamento de ' + dataBR(OP.dados.data);
    sec.querySelectorAll('th[data-campo]').forEach(th => {
      const ativo = th.getAttribute('data-campo') === campo;
      th.setAttribute('aria-sort', ativo ? (dir > 0 ? 'ascending' : 'descending') : 'none');
      th.classList.toggle('ordenado', ativo);
    });
    const LIM = 1500, mostrar = ls.slice(0, LIM);
    sec.querySelector('tbody').innerHTML = mostrar.length ? mostrar.map(o => {
      const x = o.x, v = variacao(x);
      return '<tr><td class="tk"><button type="button" class="op-cod" data-op-calc="' + esc(x[I.cod]) + '" title="Abrir na calculadora">' + esc(x[I.cod]) + '</button>' + tag(x[I.tipo]) + '</td>'
        + '<td>' + esc(o.ativo) + '</td><td>' + dataBR(x[I.venc]) + ' <span class="op-sit">(' + x[I.du] + ' d.u.)</span></td>'
        + '<td class="num">' + num(x[I.k], 2) + '</td><td class="num">' + num(o.S, 2) + '</td><td><span class="op-sit">' + situacao(x, o.S) + '</span></td>'
        + '<td class="num">' + num(x[I.f], 2) + '</td><td class="num" style="color:' + cor(v) + ';">' + (v === null ? '—' : pct(v).replace('.', ',')) + '</td>'
        + '<td class="num">' + num(x[I.neg], 0) + '</td><td class="num">' + vol(x[I.vol]) + '</td>'
        + '<td class="num">' + (x[I.vi] === null ? '—' : num(x[I.vi] * 100, 1) + '%') + '</td>'
        + '<td class="num">' + (x[I.dl] === null ? '—' : num(x[I.dl], 2)) + '</td>'
        + '<td class="num">' + (x[I.oi] === null || x[I.oi] === undefined ? '—' : num(x[I.oi], 0)) + '</td></tr>';
    }).join('') : '<tr><td colspan="13" class="vazio">Nenhuma opção encontrada.</td></tr>';
    document.getElementById('op-tabela-rodape').textContent = num(ls.length, 0) + ' opções' + (ls.length > LIM ? ' (mostrando as primeiras ' + num(LIM, 0) + '; use a busca ou os filtros)' : ' exibidas')
      + '. Clique no título de uma coluna para ordenar e no código da opção para abrir na calculadora.';
  }

  /* ===================================================================== CALCULADORA (Black-Scholes) */
  const Nn = x => 0.5 * (1 + erf(x / Math.SQRT2));
  const nd = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  function erf(x){   /* Abramowitz e Stegun 7.1.26, erro < 1,5e-7 */
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function bs(tipo, S, K, T, r, v){
    const raiz = Math.sqrt(T), d1 = (Math.log(S / K) + (r + v * v / 2) * T) / (v * raiz), d2 = d1 - v * raiz, desc = Math.exp(-r * T);
    const c = tipo === 'C';
    return {
      preco: c ? S * Nn(d1) - K * desc * Nn(d2) : K * desc * Nn(-d2) - S * Nn(-d1),
      delta: c ? Nn(d1) : Nn(d1) - 1,
      gama: nd(d1) / (S * v * raiz),
      vega: S * nd(d1) * raiz / 100,
      theta: ((-S * nd(d1) * v / (2 * raiz)) + (c ? -r * K * desc * Nn(d2) : r * K * desc * Nn(-d2))) / 252,
      rho: (c ? K * T * desc * Nn(d2) : -K * T * desc * Nn(-d2)) / 100,
      prob: c ? Nn(d2) : Nn(-d2)
    };
  }
  function viDoPremio(tipo, premio, S, K, T, r){
    let lo = 1e-4, hi = 5;
    if(!(premio > 0) || bs(tipo, S, K, T, r, lo).preco >= premio || bs(tipo, S, K, T, r, hi).preco < premio) return null;
    for(let i = 0; i < 80; i++){ const m = (lo + hi) / 2; if(bs(tipo, S, K, T, r, m).preco < premio) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  OP.calc = OP.calc || {tipo: 'C', S: 30, K: 32, du: 21, selic: 14.9, vol: 35, premio: '', modo: 'vol', codigo: ''};

  function abrirNaCalculadora(codigo){
    const d = OP.dados; if(!d) return;
    for(const a of d.ativos || []){
      const x = (a.itens || []).find(y => y[I.cod] === codigo);
      if(x){
        OP.calc = {tipo: x[I.tipo], S: Number(a.preco), K: x[I.k], du: Math.max(1, x[I.du] || 1), selic: d.selic !== null && d.selic !== undefined ? Number(d.selic) * 100 : OP.calc.selic,
                   vol: x[I.vi] !== null ? x[I.vi] * 100 : OP.calc.vol, premio: x[I.f], modo: 'premio',
                   codigo: x[I.cod] + ' (' + a.ativo + ', pregão de ' + dataBR(d.data) + ')'};
        break;
      }
    }
    telaCalculadora();
  }

  function telaCalculadora(){
    const c = caixa('calculadora'), k = OP.calc;
    const campo = (id, rot, val, passo, ajuda) => '<label for="' + id + '">' + rot + '<input id="' + id + '" type="number" inputmode="decimal" step="' + passo + '" value="' + esc(val) + '">' + (ajuda ? '<span class="op-sit">' + ajuda + '</span>' : '') + '</label>';
    c.innerHTML = '<section class="cotacoes-box op-pagina" id="op-calculadora">'
      + '<div class="page-head" style="margin-bottom:8px;"><div><h1>Calculadora de opções</h1></div></div>'
      + '<p class="op-lead">Calcula o <b>preço justo</b> de uma call ou de uma put pelo modelo de Black-Scholes e as <b>gregas</b>, que mostram como o prêmio reage '
      + 'ao preço da ação, ao tempo e à volatilidade. Também faz o caminho inverso: a partir do prêmio do mercado, acha a <b>volatilidade implícita</b>.</p>'
      + (k.codigo ? '<p class="prova-nota" id="op-calc-origem">Dados de ' + esc(k.codigo) + '. Altere à vontade.</p>' : '')
      + '<div class="op-calc"><form class="op-form" id="op-form" onsubmit="return false">'
      + '<label for="op-c-tipo">Tipo<select id="op-c-tipo"><option value="C"' + (k.tipo === 'C' ? ' selected' : '') + '>Call (opção de compra)</option><option value="P"' + (k.tipo === 'P' ? ' selected' : '') + '>Put (opção de venda)</option></select></label>'
      + campo('op-c-s', 'Preço da ação (R$)', k.S, '0.01') + campo('op-c-k', 'Preço de exercício (R$)', k.K, '0.01')
      + campo('op-c-du', 'Dias úteis até o vencimento', k.du, '1') + campo('op-c-selic', 'Selic (% ao ano)', num(k.selic, 2).replace(/\./g, '').replace(',', '.'), '0.01', 'taxa livre de risco')
      + '<div class="op-modo"><label><input type="radio" name="op-c-modo" value="vol"' + (k.modo === 'vol' ? ' checked' : '') + '> Informar a volatilidade</label>'
      + '<label><input type="radio" name="op-c-modo" value="premio"' + (k.modo === 'premio' ? ' checked' : '') + '> Informar o prêmio</label></div>'
      + campo('op-c-vol', 'Volatilidade (% ao ano)', num(k.vol, 1).replace(/\./g, '').replace(',', '.'), '0.1')
      + campo('op-c-premio', 'Prêmio do mercado (R$)', k.premio, '0.01')
      + '</form><div><div class="op-res" id="op-c-res"></div><p class="prova-nota" id="op-c-nota"></p></div></div>'
      + '<p class="screener-rodape-aviso">Modelo de Black-Scholes: opção europeia, sem dividendos, taxa contínua igual a ln(1 + Selic) e prazo em dias úteis ÷ 252. '
      + 'Para calls americanas de ações que pagam dividendos, o valor real pode ser um pouco maior. Informação educativa, não é recomendação de investimento.</p></section>';
    const form = document.getElementById('op-form');
    form.addEventListener('input', calcular);
    form.addEventListener('change', calcular);
    calcular();
  }

  function calcular(){
    const g = id => { const el = document.getElementById(id); return el ? Number(String(el.value).replace(',', '.')) : NaN; };
    const tipo = document.getElementById('op-c-tipo').value;
    const modo = (document.querySelector('input[name="op-c-modo"]:checked') || {}).value || 'vol';
    const S = g('op-c-s'), K = g('op-c-k'), du = g('op-c-du'), selic = g('op-c-selic') / 100;
    document.getElementById('op-c-vol').closest('label').style.display = modo === 'vol' ? '' : 'none';
    document.getElementById('op-c-premio').closest('label').style.display = modo === 'premio' ? '' : 'none';
    const res = document.getElementById('op-c-res'), nota = document.getElementById('op-c-nota');
    OP.calc = Object.assign(OP.calc, {tipo, S, K, du, selic: selic * 100, modo, vol: g('op-c-vol'), premio: g('op-c-premio')});
    if(!(S > 0 && K > 0 && du >= 1 && selic > -1)){ res.innerHTML = ''; nota.textContent = 'Preencha preço da ação, exercício e prazo (pelo menos 1 dia útil).'; return; }
    const T = du / 252, r = Math.log(1 + selic);
    let v = g('op-c-vol') / 100, premio = g('op-c-premio');
    if(modo === 'premio'){
      v = viDoPremio(tipo, premio, S, K, T, r);
      if(v === null){ res.innerHTML = ''; nota.textContent = 'Esse prêmio está abaixo do valor mínimo da opção (ou acima do máximo): não há volatilidade que o explique.'; return; }
    }
    if(!(v > 0)){ res.innerHTML = ''; nota.textContent = 'Informe a volatilidade (maior que zero).'; return; }
    const b = bs(tipo, S, K, T, r, v);
    const intr = Math.max(0, tipo === 'C' ? S - K : K - S);
    const ref = modo === 'premio' ? premio : b.preco;
    const equil = tipo === 'C' ? K + ref : K - ref;
    const card = (rot, val, txt, dest) => '<div' + (dest ? ' class="op-destaque"' : '') + '><span>' + rot + '</span><b>' + val + '</b><i>' + txt + '</i></div>';
    res.innerHTML =
        (modo === 'premio'
          ? card('Volatilidade implícita', num(v * 100, 1) + '% ao ano', 'A oscilação anual que o mercado está embutindo no prêmio de ' + rs(premio) + '.', true)
          : card('Preço justo', rs(b.preco), 'Prêmio teórico da ' + (tipo === 'C' ? 'call' : 'put') + ' com volatilidade de ' + num(v * 100, 1) + '% ao ano.', true))
      + card('Delta', num(b.delta, 3), 'O prêmio muda cerca de ' + rs(Math.abs(b.delta)) + ' a cada R$ 1,00 de alta da ação' + (b.delta < 0 ? ' (no sentido contrário)' : '') + '.')
      + card('Gama', num(b.gama, 4), 'Quanto o delta muda a cada R$ 1,00 de variação da ação.')
      + card('Theta', rs(b.theta), 'Quanto o prêmio perde, em média, a cada dia útil que passa, se nada mais mudar.')
      + card('Vega', rs(b.vega), 'Quanto o prêmio muda a cada 1 ponto percentual de alta na volatilidade.')
      + card('Rô', rs(b.rho), 'Quanto o prêmio muda a cada 1 ponto percentual de alta na Selic.')
      + card('Probabilidade de exercício', num(b.prob * 100, 1) + '%', 'Chance, pelo modelo, de a opção terminar dentro do dinheiro no vencimento.')
      + card('Valor intrínseco', rs(intr), 'Quanto a opção valeria se vencesse hoje.')
      + card('Valor extrínseco', rs(Math.max(0, ref - intr)), 'A parte do prêmio que paga o tempo e a incerteza; vai a zero no vencimento.')
      + card('Ponto de equilíbrio', rs(equil), 'Preço da ação no vencimento em que o comprador da opção empata (exercício ' + (tipo === 'C' ? '+' : '−') + ' prêmio).');
    nota.textContent = 'Prazo de ' + num(du, 0) + (du === 1 ? ' dia útil' : ' dias úteis') + ' (' + num(T, 3) + ' ano) e taxa contínua de ' + num(r * 100, 2) + '% ao ano.';
  }

  /* ===================================================================== EM BREVE */
  function telaEmBreve(tela){
    const c = caixa(tela);
    const info = {
      grade: ['Grade de opções', 'Escolha uma ação e veja todas as calls e puts, por vencimento e preço de exercício, lado a lado.',
              ['Prêmio, variação e volume de cada série', 'Volatilidade implícita e gregas', 'Quantidade em aberto, inclusive das séries sem negócio no dia', 'Probabilidade de exercício e ponto de equilíbrio']],
      simulador: ['Simulador de estratégias', 'Monte uma estratégia com opções e veja o resultado no vencimento.',
              ['Venda coberta, trava de alta e trava de baixa', 'Financiamento e proteção com put', 'Gráfico de lucro e prejuízo no vencimento', 'Custo, ganho máximo, perda máxima e pontos de equilíbrio']],
      tudo: ['Tudo sobre opções', 'Guia completo, em linguagem simples, para quem está começando.',
              ['O que são calls e puts, exercício e vencimento', 'Opção americana e europeia', 'Volatilidade implícita e gregas', 'Riscos, margem e tributação']]
    }[tela];
    c.innerHTML = '<section class="cotacoes-box op-pagina op-breve"><div class="page-head" style="margin-bottom:8px;"><div><h1>' + info[0] + ' <span class="op-embreve">EM BREVE</span></h1></div></div>'
      + '<p class="op-lead">' + info[1] + '</p><p class="prova-nota" style="margin:0;">O que vai ter:</p><ul>' + info[2].map(t => '<li>' + t + '</li>').join('') + '</ul>'
      + '<p class="prova-nota">Enquanto isso, veja as <a href="#" data-op-ir="dia">Opções do dia</a> ou use a <a href="#" data-op-ir="calculadora">Calculadora de opções</a>.</p></section>';
    c.querySelectorAll('[data-op-ir]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); mostrar(a.getAttribute('data-op-ir')); }));
  }

  /* ===================================================================== menu e rotas */
  document.addEventListener('click', ev => {
    const a = ev.target && ev.target.closest && ev.target.closest('.mf-link[data-acao^="opcoes-"]');
    if(!a || !ACOES[a.getAttribute('data-acao')]) return;
    ev.preventDefault(); ev.stopPropagation();
    mostrar(ACOES[a.getAttribute('data-acao')]);
  }, true);
  if(typeof MF_SUBROTAS !== 'undefined') Object.keys(ROTAS).forEach(r => { if(MF_SUBROTAS.indexOf(r) === -1) MF_SUBROTAS.push(r); });
  if(typeof mfAbrirSubrota === 'function'){
    const anterior = mfAbrirSubrota;
    mfAbrirSubrota = function(sub){
      if(ROTAS[sub]) return mostrar(ROTAS[sub]);
      return anterior.apply(this, arguments);
    };
  }
})();
