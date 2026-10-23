/* ===== v168: RADAR DE AÇÕES EXPONENCIAIS com o Score Exponencial v1.0.5 (SQL 183) =====
   Substitui a descrição antiga (3 pilares) pelos 4 pilares registrados e mostra "Ranking em calibração" enquanto o Score
   não passar nos critérios de publicação. O administrador vê a prévia mensal e o acompanhamento em tempo real.
   Ranking lido do banco (RPC radar_exponencial_publico). Nada é calculado nem inventado na página. */
(function(){
  if(document.getElementById('rx-estilo-v168')) return;
  const st = document.createElement('style'); st.id = 'rx-estilo-v168';
  st.textContent = '.rx-calib{margin:0 0 18px; padding:14px 16px; border:1px solid var(--line); border-left:3px solid var(--gold); border-radius:var(--radius);}'
    + '.rx-calib h3{margin:0 0 6px; font-size:15px; color:var(--gold);}'
    + '.rx-calib p{margin:0 0 6px; font-size:13px; line-height:1.6; color:var(--ink-soft);}'
    + '.rx-calib ul{margin:4px 0 0 18px; padding:0; font-size:13px; line-height:1.6; color:var(--ink-soft);}'
    + '.rx-barra label.rx-so-carteira{display:inline-flex; align-items:center; gap:8px; flex:0 0 auto; width:auto; font-size:13px; color:var(--ink-soft); white-space:nowrap; cursor:pointer;}'
    + '.rx-barra label.rx-so-carteira input{width:16px !important; height:16px; min-width:0; flex:0 0 auto; margin:0; padding:0; accent-color:var(--gold);}'
    + '.rx-cart{color:var(--gold); font-weight:700;}'
    + '.rx-acomp{margin-top:22px;} .rx-acomp h3{font-size:14px; margin:0 0 8px; color:var(--gold);}'
    + '.rx-pos{color:#4caf7d;} .rx-neg{color:#e06c6c;}';
  document.head.appendChild(st);
})();

function rxMetodoHtml(){
  return '<div class="rx-pilares">'
    + '<div class="rx-pilar"><h4>1 · Momentum de preço</h4><p>Retorno dos últimos 12 meses sem o último, distância da máxima de 52 semanas, tendência pela média de 200 pregões, qualidade do caminho e volume.</p><span class="rx-peso">25%, menos quando o momentum fica instável</span></div>'
    + '<div class="rx-pilar"><h4>2 · Qualidade e valor</h4><p>Saúde financeira (Piotroski), rentabilidade bruta, qualidade ampla, lucro que vira caixa, lucro operacional sobre o valor da empresa e o crescimento que o preço já cobra.</p><span class="rx-peso">Divide o restante em partes iguais</span></div>'
    + '<div class="rx-pilar"><h4>3 · Momento fundamental</h4><p>Surpresa do lucro no trimestre, melhora contra o mesmo trimestre do ano anterior, crescimento saudável e controle das despesas.</p><span class="rx-peso">Divide o restante em partes iguais</span></div>'
    + '<div class="rx-pilar"><h4>4 · Risco e confluência</h4><p>Volatilidade, beta, liquidez, risco de crédito (EM Score), alerta contábil (escore M) e concordância entre os pilares.</p><span class="rx-peso">Divide o restante em partes iguais</span></div>'
    + '</div>';
}

function rxCalibracaoHtml(){
  if(_rx.mercado === 'us'){
    return '<div class="rx-calib"><h3>Ranking em calibração</h3><p>O Score Exponencial do mercado americano ainda não tem metodologia registrada. '
      + 'O ranking aparece aqui quando a metodologia for aprovada e testada.</p></div>';
  }
  return '<div class="rx-calib"><h3>Ranking em calibração</h3>'
    + '<p>O Score Exponencial passou por um teste histórico de 2013 a 2026, feito uma única vez, com todas as regras fixadas antes do teste. '
    + 'Ele ainda não cumpriu todos os critérios exigidos para ser publicado:</p>'
    + '<ul><li><b>Força estatística:</b> a ordem do Score acertou na média, mas sem a força mínima exigida.</li>'
    + '<li><b>Período final do teste:</b> as ações mais bem avaliadas subiram 34,6% em 36 meses, menos que o Ibovespa (55,6%).</li></ul>'
    + '<p>Enquanto isso, o ranking é calculado no fim de cada mês e acompanhado em tempo real. Quando cumprir os critérios, ele aparece aqui.</p></div>';
}

async function rxMostrar(chaveMenu, mercado){
  const caixa = rxCaixa(chaveMenu, mercado);
  const nomeMercado = _rx.mercado === 'us' ? 'Mercado americano' : 'Mercado brasileiro';
  caixa.innerHTML = '<div class="rel-topo"><h2>Radar de Ações Exponenciais <span class="ra-selo rx-selo">RADAR</span> · ' + nomeMercado + '</h2></div>'
    + '<p class="rx-lead">Ranking das ações pelo <b>Score Exponencial SOLIDUNS</b>: nota de 0 a 100 que combina quatro pilares. '
    + 'É calculado no último pregão de cada mês, só com informações públicas na data, e comparado dentro de cada setor.</p>'
    + rxMetodoHtml() + '<div id="rx-ranking"><p class="prova-nota">Carregando o ranking…</p></div>';
  _rx.dados = null; _rx.ord = 'posicao'; _rx.asc = true;
  let r = null, erro = '';
  try{ r = await raRpc('radar_exponencial_publico', {p_mercado: _rx.mercado}); }
  catch(e){ erro = String((e && e.message) || e); }
  if(_rx.mercado !== (mercado === 'us' ? 'us' : 'br')) return;
  _rx.dados = (r && Array.isArray(r.itens)) ? r : {itens: [], data_ref: null, calibracao: true};
  rxDesenhar(erro);
}

function rxDesenhar(erro){
  const alvo = document.getElementById('rx-ranking'); if(!alvo) return;
  const d = _rx.dados || {itens: []};
  const calib = d.calibracao !== false;
  if(!d.itens.length){
    const semFuncao = /radar_exponencial_publico|could not find|PGRST202|404/i.test(erro || '');
    alvo.innerHTML = rxCalibracaoHtml() + ((erro && !semFuncao) ? '<p class="prova-nota" style="margin-top:10px;">' + escHtml(erro) + '</p>' : '');
    return;
  }
  const setores = [...new Set(d.itens.map(x => x.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  alvo.innerHTML = (d.previa ? '<div class="rx-previa">PRÉVIA — visível só para administradores (ranking ainda não publicado)</div>' : '')
    + (calib ? rxCalibracaoHtml() : '')
    + '<div class="rx-barra"><input type="search" id="rx-busca" placeholder="Buscar ação ou empresa" aria-label="Buscar ação ou empresa">'
    + '<select id="rx-setor" aria-label="Setor"><option value="">Todos os setores</option>' + setores.map(s => '<option>' + escHtml(s) + '</option>').join('') + '</select>'
    + '<select id="rx-min" aria-label="Score mínimo"><option value="0">Qualquer Score</option><option value="50">Score 50+</option><option value="60">Score 60+</option><option value="70">Score 70+</option></select>'
    + '<label class="rx-so-carteira"><input type="checkbox" id="rx-cart"> Só a carteira do Radar</label></div>'
    + '<p class="rx-info" id="rx-info"></p><div class="rx-tabela-wrap"><table class="rx-tabela"><thead><tr>'
    + [['posicao', '#'], ['ticker', 'Ação'], ['nome', 'Empresa'], ['setor', 'Setor'], ['preco', 'Preço'], ['nota_momentum', 'Momentum'],
       ['nota_qualidade', 'Qualidade e valor'], ['nota_momento', 'Momento fundamental'], ['nota_risco', 'Risco e confluência'], ['score', 'Score'], ['', 'Sinais']]
        .map(c => '<th' + (c[0] ? ' data-rx-ord="' + c[0] + '"' : '') + '>' + c[1] + '</th>').join('')
    + '</tr></thead><tbody id="rx-corpo"></tbody></table></div>'
    + rxAcompanhamentoHtml(d.acompanhamento);
  ['rx-busca', 'rx-setor', 'rx-min', 'rx-cart'].forEach(id => { const el = document.getElementById(id); if(el){ el.addEventListener('input', rxFiltrar); el.addEventListener('change', rxFiltrar); } });
  alvo.querySelectorAll('[data-rx-ord]').forEach(th => th.addEventListener('click', () => {
    const k = th.getAttribute('data-rx-ord'); if(_rx.ord === k) _rx.asc = !_rx.asc; else { _rx.ord = k; _rx.asc = (k === 'posicao' || k === 'ticker' || k === 'nome' || k === 'setor'); }
    rxFiltrar();
  }));
  rxFiltrar();
}

function rxPct(v){
  if(v === null || v === undefined || isNaN(Number(v))) return '—';
  const n = Number(v) * 100;
  return '<span class="' + (n >= 0 ? 'rx-pos' : 'rx-neg') + '">' + (n >= 0 ? '+' : '') + n.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '%</span>';
}
function rxMes(m){ const p = String(m || '').split('-'); return p.length === 2 ? p[1] + '/' + p[0] : String(m || ''); }

function rxAcompanhamentoHtml(lista){
  if(!Array.isArray(lista)) return '';
  if(!lista.length){
    return '<div class="rx-acomp"><h3>Acompanhamento em tempo real</h3><p class="prova-nota">A carteira do Radar formada no fim de outubro de 2026 é a primeira acompanhada ao vivo. '
      + 'O primeiro resultado aparece depois do fechamento de novembro.</p></div>';
  }
  let acR = 1, acI = 1;
  const linhas = lista.map(x => {
    acR *= 1 + Number(x.retorno_liquido || 0); acI *= 1 + Number(x.ibovespa || 0);
    return '<tr><td>' + rxMes(x.mes_retorno) + '</td><td class="rx-num">' + rxNum(x.n_acoes, 0) + '</td><td class="rx-num">' + rxPct(x.retorno_liquido) + '</td>'
      + '<td class="rx-num">' + rxPct(x.ibovespa) + '</td><td class="rx-num">' + rxPct(acR - 1) + '</td><td class="rx-num">' + rxPct(acI - 1) + '</td></tr>';
  }).join('');
  return '<div class="rx-acomp"><h3>Acompanhamento em tempo real</h3>'
    + '<p class="prova-nota">Carteira do Radar (entra entre os 20% melhores do Score, sai abaixo dos 40%), pesos iguais, depois dos custos, contra o Ibovespa (BOVA11). Visível só para administradores.</p>'
    + '<div class="rx-tabela-wrap"><table class="rx-tabela"><thead><tr><th>Mês</th><th>Ações</th><th>Radar</th><th>Ibovespa</th><th>Radar acumulado</th><th>Ibovespa acumulado</th></tr></thead><tbody>'
    + linhas + '</tbody></table></div></div>';
}

function rxFiltrar(){
  const d = _rx.dados || {itens: []}, corpo = document.getElementById('rx-corpo'); if(!corpo) return;
  const sem = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = sem((document.getElementById('rx-busca') || {}).value), setor = (document.getElementById('rx-setor') || {}).value || '';
  const min = Number((document.getElementById('rx-min') || {}).value || 0);
  const soCart = !!(document.getElementById('rx-cart') || {}).checked;
  let itens = d.itens.filter(x => (!q || sem(x.ticker + ' ' + x.nome).indexOf(q) >= 0) && (!setor || x.setor === setor)
    && (Number(x.score) || 0) >= min && (!soCart || x.carteira));
  const k = _rx.ord, s = _rx.asc ? 1 : -1;
  itens = itens.slice().sort((a, b) => { const va = a[k], vb = b[k];
    if(typeof va === 'number' || typeof vb === 'number') return ((Number(va) || 0) - (Number(vb) || 0)) * s;
    return String(va || '').localeCompare(String(vb || ''), 'pt-BR') * s; });
  const moeda = _rx.mercado === 'us' ? 'US$ ' : 'R$ ';
  const qual = x => x.nota_qualidade !== undefined && x.nota_qualidade !== null ? x.nota_qualidade : x.nota_fundamentos;
  corpo.innerHTML = itens.map(x => '<tr><td class="rx-num">' + rxNum(x.posicao, 0) + '</td><td class="rx-tk">' + escHtml(x.ticker || '')
      + (x.carteira ? ' <span class="rx-cart" title="Carteira do Radar">●</span>' : '') + '</td><td>' + escHtml(x.nome || '') + '</td>'
      + '<td>' + escHtml(x.setor || '') + '</td><td class="rx-num">' + (x.preco === null || x.preco === undefined ? '—' : moeda + rxNum(x.preco, 2)) + '</td>'
      + '<td class="rx-num">' + rxNum(x.nota_momentum, 0) + '</td><td class="rx-num">' + rxNum(qual(x), 0) + '</td>'
      + '<td class="rx-num">' + rxNum(x.nota_momento, 0) + '</td><td class="rx-num">' + rxNum(x.nota_risco, 0) + '</td><td>' + rxScoreHtml(x.score) + '</td>'
      + '<td>' + (Array.isArray(x.sinais) ? x.sinais.map(t => '<span class="rx-sinal">' + escHtml(t) + '</span>').join('') : '') + '</td></tr>').join('')
    || '<tr><td colspan="11" class="prova-nota">Nenhuma ação com esses filtros.</td></tr>';
  const info = document.getElementById('rx-info');
  const nCart = d.itens.filter(x => x.carteira).length;
  if(info) info.textContent = itens.length + ' de ' + d.itens.length + ' ações' + (nCart ? ' · ' + nCart + ' na carteira do Radar (●)' : '')
    + (d.data_ref ? ' · data-base ' + rxData(d.data_ref) : '') + (d.metodologia_versao ? ' · metodologia ' + d.metodologia_versao : '');
}
