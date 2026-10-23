/* ===== v169: COTAÇÕES DE FECHAMENTO — ESCOLHA DA DATA DO PREGÃO (SQL 184) =====
   Caixa de seleção "Pregão" na seção Cotações de fechamento (Mercado financeiro › Ações › Mercado brasileiro).
   O pregão mais recente continua vindo do resumo de sempre (cotacoes_eod). Os pregões anteriores vêm das Séries
   Históricas da B3 (cotacoes_br_hist, RPC cotacoes_br_pregao): maiores altas, baixas, mais negociadas e a tabela
   completa do dia escolhido, com a variação contra o pregão anterior ajustada por desdobramentos e grupamentos. */
(function(){
  if(typeof renderizarCotacoesEOD !== 'function' || window.__eodSelV169) return;
  window.__eodSelV169 = {datas: null, escolhida: null, ultimo: null, carregando: false, erro: ''};
  const S = window.__eodSelV169;
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  if(!document.getElementById('eod-sel-estilo-v169')){
    const st = document.createElement('style'); st.id = 'eod-sel-estilo-v169';
    st.textContent = '.cotacoes-eod-pregao{display:flex; align-items:center; gap:8px; font-size:12.5px; color:var(--text);}'
      + '.cotacoes-eod-pregao select{background:var(--bg-elev, #111); color:var(--text); border:1px solid var(--line); border-radius:6px;'
      + ' padding:6px 28px 6px 10px; font:inherit; font-size:12.5px; cursor:pointer; min-width:170px;}'
      + '.cotacoes-eod-pregao select:focus{outline:1px solid var(--gold); border-color:var(--gold);}'
      + '.cotacoes-eod-pregao .eod-sel-aviso{font-size:11.5px; color:var(--ink-soft);}'
      + '.cotacoes-eod-esq{display:flex; flex-wrap:wrap; align-items:center; gap:8px 22px;}';
    document.head.appendChild(st);
  }

  /* data do pregão do resumo mais recente: a mesma regra da v18 (coleta antes das 18h ou no fim de semana = dia útil anterior) */
  function pregaoDoResumo(d){
    const data = new Date(d.capturado_em);
    const p = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'})
      .formatToParts(data).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
    const dia = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
    if(+p.hour < 18) dia.setUTCDate(dia.getUTCDate() - 1);
    while(dia.getUTCDay() === 0 || dia.getUTCDay() === 6) dia.setUTCDate(dia.getUTCDate() - 1);
    return dia.toISOString().slice(0, 10);
  }
  const rotulo = iso => { const d = new Date(iso + 'T12:00:00Z'); const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0] + ' (' + DIAS[d.getUTCDay()] + ')'; };

  async function rpc(nome, corpo){
    if(typeof sessaoAtual === 'undefined' || !sessaoAtual || sessaoAtual.modoLocal) throw new Error('Entre na sua conta para ver os pregões anteriores.');
    const token = (typeof contaTokenValido === 'function') ? await contaTokenValido() : sessaoAtual.access_token;
    if(!token) throw new Error('Sua sessão expirou. Saia e entre de novo.');
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + nome, {method: 'POST',
      headers: {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json'},
      body: JSON.stringify(corpo || {})});
    const j = await r.json().catch(() => null);
    if(r.status === 404) throw new Error('Os pregões anteriores ainda não estão disponíveis.');
    if(!r.ok) throw new Error('Não foi possível ler o pregão escolhido.');
    return j;
  }

  async function carregarDatas(){
    if(S.datas || S.carregandoDatas) return;
    S.carregandoDatas = true;
    try{ const j = await rpc('cotacoes_br_pregoes', {p_limite: 260}); S.datas = Array.isArray(j) ? j.map(x => String(x).slice(0, 10)) : []; S.erro = ''; }
    catch(e){ S.datas = []; S.erro = String((e && e.message) || e); }
    S.carregandoDatas = false;
    montar();
  }

  function montar(){
    const ctl = document.getElementById('cotacoes-br-controles');
    if(!ctl || !S.ultimo) return;
    let esq = ctl.querySelector('.cotacoes-eod-esq');
    if(!esq){
      esq = document.createElement('div'); esq.className = 'cotacoes-eod-esq';
      const toggle = ctl.querySelector('.cotacoes-eod-toggle');
      ctl.insertBefore(esq, ctl.firstChild);
      esq.innerHTML = '<label class="cotacoes-eod-pregao" for="cotacoes-br-data">Pregão '
        + '<select id="cotacoes-br-data" aria-label="Data do pregão"></select><span class="eod-sel-aviso" id="cotacoes-br-data-aviso"></span></label>';
      if(toggle) esq.appendChild(toggle);
      esq.querySelector('select').addEventListener('change', function(){ escolher(this.value); });
    }
    const sel = document.getElementById('cotacoes-br-data');
    const ultimo = pregaoDoResumo(S.ultimo);
    const datas = [ultimo].concat((S.datas || []).filter(x => x < ultimo));
    const atual = S.escolhida || ultimo;
    const html = datas.map(x => '<option value="' + x + '"' + (x === atual ? ' selected' : '') + '>' + rotulo(x) + (x === ultimo ? ' · último' : '') + '</option>').join('');
    if(sel.getAttribute('data-html') !== html){ sel.innerHTML = html; sel.setAttribute('data-html', html); }
    sel.value = atual;
    sel.disabled = !!S.carregando;
    const aviso = document.getElementById('cotacoes-br-data-aviso');
    if(aviso) aviso.textContent = S.carregando ? 'Carregando…' : (S.datas === null ? 'Carregando datas…' : (S.erro || ''));
  }

  async function escolher(iso){
    const ultimo = S.ultimo ? pregaoDoResumo(S.ultimo) : null;
    document.querySelectorAll('.cotacoes-lista[data-mercado="br"]').forEach(c => c.setAttribute('data-expandido', '0'));
    if(!iso || iso === ultimo){
      S.escolhida = null; window.__cotacoesEOD = S.ultimo; renderizarCotacoes('br'); return;
    }
    S.carregando = true; S.erro = ''; montar();
    try{
      const j = await rpc('cotacoes_br_pregao', {p_data: iso});
      const todas = (j && Array.isArray(j.todas)) ? j.todas : [];
      if(!todas.length) throw new Error('Sem cotações gravadas para esse pregão.');
      S.escolhida = String(j.data).slice(0, 10);
      const nomes = {};                                   /* nome da empresa: o mesmo do resumo mais recente */
      ((S.ultimo && S.ultimo.todas) || []).forEach(x => { if(x && x.ticker && x.nome) nomes[x.ticker] = x.nome; });
      window.__cotacoesEOD = {__historico: true, capturado_em: S.escolhida + 'T21:00:00-03:00', todas: todas.map(x => Object.assign({nome: nomes[x.ticker] || ''}, x)),
        fonte: j.fonte || 'B3 — Séries Históricas (COTAHIST)', ativos_liquidos: todas.filter(x => Number(x.volume_fin) >= 5000000).length};
      S.carregando = false;
      renderizarCotacoes('br');
    }catch(e){
      S.carregando = false; S.erro = String((e && e.message) || e); S.escolhida = null;
      window.__cotacoesEOD = S.ultimo; renderizarCotacoes('br');
    }
  }

  const original = renderizarCotacoesEOD;
  renderizarCotacoesEOD = function(){
    const d = window.__cotacoesEOD;
    if(d && !d.__historico){ S.ultimo = d; S.escolhida = null; }
    const r = original.apply(this, arguments);
    if(d && d.__historico){
      const rod = document.getElementById('cotacoes-br-rodape');
      const br = rotulo(S.escolhida).slice(0, 10);
      if(rod) rod.textContent = 'Fechamento do pregão de ' + br + '. Fonte: ' + d.fonte + '. Variação contra o pregão anterior do mesmo papel, '
        + 'ajustada por desdobramentos e grupamentos. Liquidez = volume financeiro de pelo menos R$ 5 milhões no dia ('
        + d.ativos_liquidos + ' ações nesse pregão). Informação educativa, não é recomendação de investimento.';
    }
    montar();
    carregarDatas();
    return r;
  };
})();
