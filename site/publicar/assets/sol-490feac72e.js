
/* ===== v106 — FLUXO E PARTICIPAÇÃO DOS INVESTIDORES NA B3 (SQL 124; robô coletar_fluxo_b3) ===== */
var FX_TIPOS = {estrangeiro: 'Investidor estrangeiro', institucional: 'Institucional', pessoa_fisica: 'Pessoa física',
                inst_financeira: 'Instituições financeiras', outros: 'Outros'};
var _fx = {painel: null};
if(typeof IX_TELAS !== 'undefined') IX_TELAS.push('mf-fluxo-b3');
if(typeof MF_SUBROTAS !== 'undefined' && MF_SUBROTAS.indexOf('fluxo-b3') < 0) MF_SUBROTAS.push('fluxo-b3');   /* link direto não cai no 404 */
function fxReais(v){
  const n = Number(v), a = Math.abs(n);
  if(!isFinite(n)) return '—';
  const s = n < 0 ? '−' : '';
  if(a >= 1e9) return s + 'R$ ' + (a / 1e9).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' bi';
  if(a >= 1e6) return s + 'R$ ' + (a / 1e6).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' mi';
  return s + formatBRL(a);
}
function fxSaldo(v){
  const n = Number(v);
  return '<b class="' + (n >= 0 ? 'fx-pos' : 'fx-neg') + '">' + (n > 0 ? '+' : '') + fxReais(n).replace(/^−/, '−') + '</b>';
}
function fxData(d){ return d ? String(d).slice(8, 10) + '/' + String(d).slice(5, 7) + '/' + String(d).slice(0, 4) : '—'; }
function fxMes(d){
  if(!d) return '—';
  const dt = new Date(String(d).slice(0, 10) + 'T12:00:00Z');
  return dt.toLocaleDateString('pt-BR', {month: 'long', year: 'numeric', timeZone: 'UTC'});
}
function mfMostrarFluxoB3(chave){
  if(!ixAbrir('mf-fluxo-b3', chave || 'outros', 'fluxo-b3', 'Fluxo de investidores (B3)', false)) return;
  const caixa = document.getElementById('mf-fluxo-b3');
  if(!caixa.dataset.montado){
    caixa.innerHTML = '<div class="rel-topo"><h2>Fluxo de investidores na B3</h2>'
      + '<p class="prova-nota" style="margin-top:0;">Quem está comprando e quem está vendendo ações na bolsa: participação de cada tipo de investidor '
      + 'no volume negociado e o saldo (compras − vendas) acumulado no mês. Números oficiais da B3, publicados com 2 dias úteis de atraso.</p></div>'
      + '<div id="fx-corpo"><p class="prova-nota">Carregando…</p></div>';
    caixa.dataset.montado = '1';
  }
  fxCarregar().then(fxDesenhar);
}
async function fxCarregar(){
  if(_fx.painel && !_fx.painel.erro) return _fx.painel;
  try{ _fx.painel = await relRpc('mercado_fluxo_painel'); }catch(e){ _fx.painel = {erro: e}; }
  return _fx.painel;
}
function fxDesenhar(){
  const corpo = document.getElementById('fx-corpo'), pn = _fx.painel;
  if(!corpo) return;
  if(!pn){ corpo.innerHTML = '<p class="prova-nota">Carregando…</p>'; return; }
  if(pn.erro){ ixErro(corpo, pn.erro, 'SQL 124'); return; }
  const mes = Array.isArray(pn.mes) ? pn.mes : [];
  if(!mes.length){
    corpo.innerHTML = '<div class="placeholder-area">Em implantação: os números aparecem assim que o robô ler o primeiro '
      + 'Boletim Diário do Mercado da B3 (todo dia útil, às 9h). Nenhum número de exemplo é exibido.</div>';
    return;
  }
  const x0 = mes[0];
  let html = '<p class="prova-nota" style="margin:0 0 4px;"><b>Acumulado de ' + escHtml(fxMes(x0.data)) + ' até ' + fxData(x0.ate) + '</b>'
    + ' · fonte: ' + escHtml(x0.fonte || 'B3 — Boletim Diário do Mercado (BDI)') + '</p><div class="fx-grid">';
  mes.forEach(x => {
    const p = Number(x.participacao);
    html += '<div class="fx-card" data-fx-tipo="' + escHtml(x.tipo) + '"><div class="fx-nome">' + escHtml(FX_TIPOS[x.tipo] || x.tipo) + '</div>'
      + '<div class="fx-part">' + (isFinite(p) ? p.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + '%' : '—') + '</div>'
      + '<div style="font-size:11px; color:var(--ink-soft);">do volume negociado</div>'
      + '<div class="fx-barra"><span style="width:' + (isFinite(p) ? Math.min(100, Math.max(0, p)) : 0) + '%"></span></div>'
      + '<div class="fx-linha"><span>Compras</span><b>' + fxReais(x.compras) + '</b></div>'
      + '<div class="fx-linha"><span>Vendas</span><b>' + fxReais(x.vendas) + '</b></div>'
      + '<div class="fx-linha"><span>Saldo</span>' + fxSaldo(x.saldo) + '</div></div>';
  });
  html += '</div>';
  const hist = Array.isArray(pn.historico) ? pn.historico : [];
  const meses = [...new Set(hist.map(h => String(h.data).slice(0, 10)))].sort().reverse();
  if(meses.length > 1){
    const ordem = mes.map(x => x.tipo);
    html += '<h3 style="margin:18px 0 6px;">Saldo mês a mês</h3><div style="overflow-x:auto;"><table class="fx-tabela"><thead><tr><th>Mês</th>'
      + ordem.map(t => '<th>' + escHtml(FX_TIPOS[t] || t) + '</th>').join('') + '</tr></thead><tbody>'
      + meses.map(m => '<tr><td>' + escHtml(fxMes(m)) + '</td>' + ordem.map(t => {
          const h = hist.find(y => String(y.data).slice(0, 10) === m && y.tipo === t);
          return '<td>' + (h ? fxSaldo(h.saldo) : '—') + '</td>';
        }).join('') + '</tr>').join('') + '</tbody></table></div>';
  }
  html += '<p class="prova-nota" style="margin-top:12px;">Saldo positivo = o grupo comprou mais do que vendeu no período. '
    + 'Participação = (compras + vendas do grupo) ÷ (compras + vendas de todos). Dados objetivos da B3; não é recomendação de investimento.</p>';
  corpo.innerHTML = html;
}
/* ===== v106 — Gestão > Empresas: CÓDIGO AUTOMÁTICO (EMP-001, EMP-002…) quando o campo fica vazio ===== */
function empProximoCodigoV106(){
  let max = 0;
  (state.empresas || []).forEach(e => { const m = /^EMP-(\d{1,6})$/i.exec(String(e.codigo || '').trim()); if(m) max = Math.max(max, Number(m[1])); });
  return 'EMP-' + String(max + 1).padStart(3, '0');
}
function empCodigoDicaV106(){
  const c = document.getElementById('emp-codigo');
  if(c) c.placeholder = 'Automático: ' + empProximoCodigoV106() + ' (ou digite o seu)';
}
var _salvarEmpresaV106 = salvarEmpresa;
salvarEmpresa = function(){
  const campo = document.getElementById('emp-codigo');
  const editando = document.getElementById('emp-editing-id').value;
  const e = editando ? (state.empresas || []).find(x => x.id === editando) : null;
  if(campo && !campo.value.trim() && document.getElementById('emp-nome').value.trim() && !(e && e.codigo)) campo.value = empProximoCodigoV106();
  _salvarEmpresaV106.apply(this, arguments);
  empCodigoDicaV106();
};
function empGerarCodigosV106(){
  const sem = (state.empresas || []).filter(e => !String(e.codigo || '').trim());
  if(!sem.length) return;
  if(!confirm('Gerar código automático (' + empProximoCodigoV106() + ' em diante) para ' + sem.length + ' empresa(s) sem código?')) return;
  sem.forEach(e => { e.codigo = empProximoCodigoV106(); });
  salvarEstado();
  renderTudo();
}
var _renderEmpresasV106 = renderEmpresas;
renderEmpresas = function(){
  _renderEmpresasV106.apply(this, arguments);
  empCodigoDicaV106();
  const info = document.getElementById('emp-busca-info');
  if(!info) return;
  let el = document.getElementById('emp-sem-codigo');
  if(!el){
    info.insertAdjacentHTML('afterend', '<div id="emp-sem-codigo" style="font-size:12px; margin-top:4px;"></div>');
    el = document.getElementById('emp-sem-codigo');
    el.addEventListener('click', ev => { if(ev.target.closest('#emp-gerar-codigos')){ ev.preventDefault(); empGerarCodigosV106(); } });
  }
  const n = (state.empresas || []).filter(e => !String(e.codigo || '').trim()).length;
  el.innerHTML = n ? n + ' empresa(s) sem código. <a href="#" id="emp-gerar-codigos">Gerar códigos automáticos</a>' : '';
};

var _mfAbrirSubrotaV106 = mfAbrirSubrota;
mfAbrirSubrota = function(sub){
  if(sub === 'fluxo-b3'){ mfMostrarFluxoB3('outros'); return; }
  return _mfAbrirSubrotaV106.apply(this, arguments);
};
