/* ===== v170: COTAÇÕES DE FECHAMENTO DO MERCADO AMERICANO — MESMO LAYOUT DO BRASILEIRO (SQL 185) =====
   Espelha a seção do mercado brasileiro (v18 + v169) em Mercado financeiro › Ações › Mercado americano:
   título com a data do pregão, caixa "Pregão", filtro de liquidez (US$ 5 milhões no dia), contagem, altas, baixas e
   mais negociadas com "Ver todos", tabela completa com busca e ordenação, e rodapé com a fonte.
   Dados: RPCs cotacoes_us_pregoes e cotacoes_us_pregao (fechamento diário de NYSE e Nasdaq da Massive, guardado por
   1 ano). Sem o SQL 185, a seção continua como antes. */
(function(){
  if(typeof renderizarCotacoes !== 'function' || window.__cotUSV170) return;
  const S = window.__cotUSV170 = {tentou: false, falhou: false, carregando: false, dados: null, ultimo: null, escolhida: null,
                                  datas: null, erro: '', soLiq: true, ordem: {campo: 'ticker', dir: 1}};
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const LIQ = 5000000;
  if(!document.getElementById('eod-sel-estilo-v169')){
    const st = document.createElement('style'); st.id = 'eod-sel-estilo-v169';
    st.textContent = '.cotacoes-eod-pregao{display:flex; align-items:center; gap:8px; font-size:12.5px; color:var(--text);}'
      + '.cotacoes-eod-pregao select{background:var(--bg-elev, #111); color:var(--text); border:1px solid var(--line); border-radius:6px;'
      + ' padding:6px 28px 6px 10px; font:inherit; font-size:12.5px; cursor:pointer; min-width:170px;}'
      + '.cotacoes-eod-pregao .eod-sel-aviso{font-size:11.5px; color:var(--ink-soft);}'
      + '.cotacoes-eod-esq{display:flex; flex-wrap:wrap; align-items:center; gap:8px 22px;}';
    document.head.appendChild(st);
  }
  const esc = t => (typeof escaparHtml === 'function') ? escaparHtml(String(t == null ? '' : t)) : String(t == null ? '' : t).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const dataBR = iso => { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; };
  const rotulo = iso => dataBR(iso) + ' (' + DIAS[new Date(String(iso).slice(0, 10) + 'T12:00:00Z').getUTCDay()] + ')';
  const usd = v => 'US$ ' + Number(v || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const usdVol = v => (typeof formatarVolumeUSD === 'function') ? formatarVolumeUSD(v) : usd(v);
  const link = (t, r) => (typeof tkLinkV108 === 'function') ? tkLinkV108(t, 'us', r) : r;
  const caixa = () => document.querySelector('#mercado-us-conteudo .cotacoes-box:not(#relatorios-acoes-us)');

  async function rpc(nome, corpo){
    if(typeof sessaoAtual === 'undefined' || !sessaoAtual || sessaoAtual.modoLocal) throw new Error('sem sessão');
    const token = (typeof contaTokenValido === 'function') ? await contaTokenValido() : sessaoAtual.access_token;
    if(!token) throw new Error('sem sessão');
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + nome, {method: 'POST',
      headers: {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json'},
      body: JSON.stringify(corpo || {})});
    const j = await r.json().catch(() => null);
    if(r.status === 404){ const e = new Error('sem a função'); e.semFuncao = true; throw e; }
    if(!r.ok) throw new Error('Não foi possível ler o pregão escolhido.');
    return j;
  }

  async function iniciar(){
    S.tentou = true; S.carregando = true;
    try{
      const j = await rpc('cotacoes_us_pregao', {p_data: null});
      if(!j || !Array.isArray(j.todas) || !j.todas.length){ S.falhou = true; S.carregando = false; return; }
      S.dados = j; S.ultimo = String(j.data).slice(0, 10); S.carregando = false;
      renderizarCotacoes('us');
      try{ const d = await rpc('cotacoes_us_pregoes', {p_limite: 260}); S.datas = Array.isArray(d) ? d.map(x => String(x).slice(0, 10)) : []; }
      catch(e){ S.datas = []; }
      desenharControles();
    }catch(e){ S.falhou = true; S.carregando = false; }
  }

  async function escolher(iso){
    document.querySelectorAll('.cotacoes-lista[data-mercado="us"]').forEach(c => c.setAttribute('data-expandido', '0'));
    S.carregando = true; S.erro = ''; desenharControles();
    try{
      const j = await rpc('cotacoes_us_pregao', {p_data: iso});
      if(!j || !Array.isArray(j.todas) || !j.todas.length) throw new Error('Sem cotações gravadas para esse pregão.');
      S.dados = j; S.escolhida = String(j.data).slice(0, 10) === S.ultimo ? null : String(j.data).slice(0, 10);
    }catch(e){ S.erro = String((e && e.message) || e); }
    S.carregando = false;
    desenhar();
  }

  function linhas(){
    const base = {};
    (window.__baseRealUS || []).forEach(a => { if(a && a.ticker) base[a.ticker] = a; });
    return (S.dados.todas || []).map(x => ({mercado: 'us', ticker: String(x.ticker || ''),
      nome: String(x.nome || (base[x.ticker] && base[x.ticker].nome) || x.ticker || ''),
      setor: String(x.setor || (base[x.ticker] && base[x.ticker].setor) || ''),
      preco: Number(x.preco) || 0, variacao_pct: Number(x.variacao_pct) || 0, volume_fin: Number(x.volume_fin) || 0}));
  }

  function desenharControles(){
    const box = caixa(); if(!box || !S.dados) return;
    let ctl = document.getElementById('cotacoes-us-controles');
    if(!ctl){
      ctl = document.createElement('div'); ctl.id = 'cotacoes-us-controles'; ctl.className = 'cotacoes-eod-controles';
      ctl.innerHTML = '<div class="cotacoes-eod-esq"><label class="cotacoes-eod-pregao" for="cotacoes-us-data">Pregão '
        + '<select id="cotacoes-us-data" aria-label="Data do pregão"></select><span class="eod-sel-aviso" id="cotacoes-us-data-aviso"></span></label>'
        + '<label class="cotacoes-eod-toggle"><input type="checkbox" id="cotacoes-us-so-liquidas" checked> '
        + 'Somente ações com liquidez (volume financeiro de pelo menos US$ 5 milhões no dia)</label></div>'
        + '<span class="cotacoes-eod-contagem" id="cotacoes-us-contagem"></span>';
      box.insertBefore(ctl, box.querySelector('.cotacoes-colunas'));
      ctl.querySelector('#cotacoes-us-so-liquidas').addEventListener('change', function(){
        S.soLiq = this.checked;
        document.querySelectorAll('.cotacoes-lista[data-mercado="us"]').forEach(c => c.setAttribute('data-expandido', '0'));
        desenhar();
      });
      ctl.querySelector('#cotacoes-us-data').addEventListener('change', function(){ escolher(this.value); });
    }
    ctl.style.display = '';
    const sel = document.getElementById('cotacoes-us-data');
    const datas = [S.ultimo].concat((S.datas || []).filter(x => x < S.ultimo));
    const atual = S.escolhida || S.ultimo;
    const html = datas.map(x => '<option value="' + x + '"' + (x === atual ? ' selected' : '') + '>' + rotulo(x) + (x === S.ultimo ? ' · último' : '') + '</option>').join('');
    if(sel.getAttribute('data-html') !== html){ sel.innerHTML = html; sel.setAttribute('data-html', html); }
    sel.value = atual; sel.disabled = !!S.carregando;
    document.getElementById('cotacoes-us-so-liquidas').checked = S.soLiq;
    const aviso = document.getElementById('cotacoes-us-data-aviso');
    if(aviso) aviso.textContent = S.carregando ? 'Carregando…' : (S.datas === null ? 'Carregando datas…' : (S.erro || ''));
  }

  function itemVolume(c){
    const cor = c.variacao_pct >= 0 ? 'var(--teal)' : 'var(--rust)';
    return '<div class="cotacoes-item"><div class="cotacoes-item-topo"><b>' + link(c.ticker, esc(c.ticker)) + '</b><span>' + usdVol(c.volume_fin) + '</span></div>'
      + '<div class="cotacoes-item-baixo"><span>' + esc(c.nome) + '</span><span style="color:' + cor + ';">' + (c.variacao_pct >= 0 ? '+' : '') + c.variacao_pct.toFixed(2) + '%</span></div></div>';
  }
  function itemAltaBaixa(c){
    const cor = c.variacao_pct >= 0 ? 'var(--teal)' : 'var(--rust)';
    return '<div class="cotacoes-item"><div class="cotacoes-item-topo"><b>' + link(c.ticker, esc(c.ticker)) + '</b><span style="color:' + cor + ';">' + (c.variacao_pct >= 0 ? '+' : '') + c.variacao_pct.toFixed(2) + '%</span></div>'
      + '<div class="cotacoes-item-baixo"><span>' + esc(c.nome) + '</span><span>' + usd(c.preco) + '</span></div></div>';
  }

  function desenhar(){
    const box = caixa(); if(!box || !S.dados) return;
    const data = String(S.dados.data).slice(0, 10);
    const h1 = box.querySelector('.page-head h1'); if(h1){ h1.id = 'cotacoes-us-titulo'; h1.textContent = 'Cotações de fechamento — pregão de ' + dataBR(data); }
    const filtro = box.querySelector('.cotacoes-filtro'); if(filtro) filtro.style.display = 'none';
    const h3 = box.querySelectorAll('.cotacoes-coluna h3'); if(h3[2]) h3[2].textContent = 'Mais negociadas';
    const todas = linhas();
    const liquidas = todas.filter(c => c.volume_fin >= LIQ);
    const universo = S.soLiq ? liquidas : todas;
    const grupos = {
      alta: universo.filter(c => c.variacao_pct > 0).sort((a, b) => b.variacao_pct - a.variacao_pct),
      baixa: universo.filter(c => c.variacao_pct < 0).sort((a, b) => a.variacao_pct - b.variacao_pct),
      dividendo: universo.slice().sort((a, b) => b.volume_fin - a.volume_fin)
    };
    desenharControles();
    const cont = document.getElementById('cotacoes-us-contagem');
    if(cont) cont.textContent = todas.length + ' ações negociadas no pregão · ' + liquidas.length + ' com liquidez';
    ['alta', 'baixa', 'dividendo'].forEach(tipo => {
      const container = box.querySelector('.cotacoes-lista[data-mercado="us"][data-tipo="' + tipo + '"]');
      const btn = box.querySelector('.cotacoes-vertodos[data-mercado="us"][data-tipo="' + tipo + '"]');
      if(!container || !btn) return;
      const lista = grupos[tipo];
      const expandido = container.getAttribute('data-expandido') === '1';
      const visiveis = expandido ? lista : lista.slice(0, 3);
      container.classList.toggle('cotacoes-lista-rolagem', expandido);
      container.innerHTML = visiveis.length ? visiveis.map(c => tipo === 'dividendo' ? itemVolume(c) : itemAltaBaixa(c)).join('')
        : '<p class="cotacoes-vazio">' + (tipo === 'alta' ? 'Nenhuma ação líquida fechou em alta.' : tipo === 'baixa' ? 'Nenhuma ação líquida fechou em baixa.' : 'Sem dados.') + '</p>';
      btn.style.display = lista.length > 3 ? 'block' : 'none';
      btn.textContent = expandido ? 'Ver menos' : ('Ver todos (' + lista.length + ')');
    });
    tabela(todas, data);
    const rod = document.getElementById('cotacoes-us-rodape');
    if(rod) rod.textContent = 'Fechamento de NYSE e Nasdaq no pregão de ' + dataBR(data) + '. Fonte: ' + (S.dados.fonte || 'Massive')
      + '. Variação contra o pregão anterior do mesmo papel, ajustada por desdobramentos e grupamentos. Liquidez = volume financeiro de pelo menos '
      + 'US$ 5 milhões no dia (' + liquidas.length + ' ações nesse pregão). Valores em US$. Informação educativa, não é recomendação de investimento.';
  }

  function tabela(todas, data){
    const box = caixa(); if(!box) return;
    let sec = document.getElementById('cotacoes-us-tabela');
    if(!sec){
      sec = document.createElement('div'); sec.id = 'cotacoes-us-tabela'; sec.className = 'cotacoes-eod-tabela';
      sec.innerHTML = '<div class="cotacoes-eod-tabela-topo"><h3 id="cotacoes-us-tabela-titulo"></h3>'
        + '<input type="search" id="cotacoes-us-busca" placeholder="Buscar por código, empresa ou setor" aria-label="Buscar ação"></div>'
        + '<div class="cotacoes-eod-tabela-wrap"><table><thead><tr>'
        + '<th data-campo="ticker">Ação</th><th data-campo="nome">Empresa</th><th data-campo="setor">Setor</th>'
        + '<th data-campo="preco" class="num">Fechamento</th><th data-campo="variacao_pct" class="num">Variação</th>'
        + '<th data-campo="volume_fin" class="num">Volume financeiro</th></tr></thead><tbody></tbody></table></div>'
        + '<p class="cotacoes-eod-tabela-rodape" id="cotacoes-us-tabela-rodape"></p>';
      box.insertBefore(sec, document.getElementById('cotacoes-us-rodape'));
      sec.querySelector('#cotacoes-us-busca').addEventListener('input', () => tabela(linhas(), String(S.dados.data).slice(0, 10)));
      sec.querySelectorAll('th[data-campo]').forEach(th => {
        th.tabIndex = 0;
        const ordenar = () => {
          const campo = th.getAttribute('data-campo'), o = S.ordem;
          S.ordem = {campo, dir: o.campo === campo ? -o.dir : (['preco', 'variacao_pct', 'volume_fin'].includes(campo) ? -1 : 1)};
          tabela(linhas(), String(S.dados.data).slice(0, 10));
        };
        th.addEventListener('click', ordenar);
        th.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); ordenar(); } });
      });
    }
    sec.style.display = '';
    const termo = (document.getElementById('cotacoes-us-busca').value || '').trim().toLowerCase();
    let ls = S.soLiq ? todas.filter(c => c.volume_fin >= LIQ) : todas.slice();
    if(termo) ls = ls.filter(c => c.ticker.toLowerCase().includes(termo) || c.nome.toLowerCase().includes(termo) || c.setor.toLowerCase().includes(termo));
    const {campo, dir} = S.ordem;
    ls.sort((a, b) => { const x = a[campo], y = b[campo]; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')) * dir; });
    document.getElementById('cotacoes-us-tabela-titulo').textContent = (S.soLiq ? 'Ações com liquidez' : 'Todas as ações da NYSE e da Nasdaq') + ' — fechamento de ' + dataBR(data);
    sec.querySelectorAll('th[data-campo]').forEach(th => {
      const ativo = th.getAttribute('data-campo') === campo;
      th.setAttribute('aria-sort', ativo ? (dir > 0 ? 'ascending' : 'descending') : 'none');
      th.classList.toggle('ordenado', ativo);
    });
    const mostrar = ls.slice(0, 2000);
    sec.querySelector('tbody').innerHTML = mostrar.length ? mostrar.map(c => {
      const cor = c.variacao_pct > 0 ? 'var(--teal)' : (c.variacao_pct < 0 ? 'var(--rust)' : 'var(--ink-soft)');
      return '<tr><td class="tk">' + link(c.ticker, esc(c.ticker)) + '</td><td>' + esc(c.nome) + '</td><td>' + esc(c.setor || '—') + '</td>'
        + '<td class="num">' + usd(c.preco) + '</td><td class="num" style="color:' + cor + ';">' + (c.variacao_pct > 0 ? '+' : '') + c.variacao_pct.toFixed(2).replace('.', ',') + '%</td>'
        + '<td class="num">' + usdVol(c.volume_fin) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="vazio">Nenhuma ação encontrada.</td></tr>';
    document.getElementById('cotacoes-us-tabela-rodape').textContent = ls.length + ' ações' + (ls.length > mostrar.length ? ' (mostrando as primeiras ' + mostrar.length + ')' : ' exibidas')
      + '. Clique no título de uma coluna para ordenar.';
  }

  const original = renderizarCotacoes;
  renderizarCotacoes = function(mercado){
    if(mercado === 'us'){
      if(S.dados){ desenhar(); return; }
      if(!S.tentou && typeof sessaoAtual !== 'undefined' && sessaoAtual && sessaoAtual.access_token
         && (typeof areaLiberada !== 'function' || areaLiberada('mercado_financeiro'))) iniciar();
    }
    return original.apply(this, arguments);
  };
})();
