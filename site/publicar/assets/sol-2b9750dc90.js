
/* ===== v113 — DRE GERENCIAL EM CASCATA (margem de contribuição), sobre o motor de competência de sempre ===== */
var DRE113_GRUPOS = [
  ['receita', 'Receita bruta'],
  ['deducao', 'Deduções e impostos sobre a receita'],
  ['custo_variavel', 'Custos variáveis'],
  ['despesa_fixa', 'Despesas fixas'],
  ['outros', 'Resultado financeiro e outros']
];
function dre113Norm(t){ return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function dre113Sugerir(cat, ehReceita){
  const c = ' ' + dre113Norm(cat).replace(/[^a-z0-9]+/g, ' ') + ' ';
  if(ehReceita) return /( juro| rendiment| aplicac| financeir| dividend)/.test(c) ? 'outros' : 'receita';
  if(/( das | simples| iss | issqn| pis | cofins| icms| ipi | imposto| tribut| darf| deduc| devoluc)/.test(c)) return 'deducao';
  if(/( insumo| materia prima| material| mercadoria| comiss| frete| embalage| custo| cmv | cpv | revenda)/.test(c)) return 'custo_variavel';
  if(/( juro| tarifa| iof | multa| banc| financeir| emprestim| financiament)/.test(c)) return 'outros';
  return 'despesa_fixa';
}
function dre113Grupo(cat, ehReceita){
  const g = (state.dreGrupos || {})[cat];
  return g && DRE113_GRUPOS.some(x => x[0] === g) ? {g: g, sug: false} : {g: dre113Sugerir(cat, ehReceita), sug: true};
}
function dre113Calcular(dre){
  const net = {receita: 0, deducao: 0, custo_variavel: 0, despesa_fixa: 0, outros: 0};
  (dre.linhas || []).forEach(l => {
    const ehReceita = l.receita > 0 && !(l.despesa > 0);
    const g = dre113Grupo(l.categoria, ehReceita).g;
    net[g] += (l.receita || 0) - (l.despesa || 0);
  });
  const rb = net.receita, rl = rb + net.deducao, mc = rl + net.custo_variavel, ro = mc + net.despesa_fixa, liq = ro + net.outros;
  return {net: net, linhas: [
    {rot: '(+) Receita bruta', v: rb, tipo: 'sub'},
    {rot: '(−) Deduções e impostos sobre a receita', v: net.deducao},
    {rot: '(=) Receita líquida', v: rl, tipo: 'sub'},
    {rot: '(−) Custos variáveis', v: net.custo_variavel},
    {rot: '(=) Margem de contribuição', v: mc, tipo: 'sub'},
    {rot: '(−) Despesas fixas', v: net.despesa_fixa},
    {rot: '(=) Resultado operacional', v: ro, tipo: 'sub'},
    {rot: '(±) Resultado financeiro e outros', v: net.outros},
    {rot: '(=) Resultado líquido do período', v: liq, tipo: 'final'}
  ], rb: rb, liq: liq};
}
function dre113Pct(v, rb){ return rb > 0 ? (v / rb * 100).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + '%' : '—'; }
function dre113Render(){
  const caixa = document.getElementById('dre113-cascata'), corpo = document.getElementById('dre113-classif-corpo');
  if(!caixa || !corpo) return;
  const dre = window.__ultimoDRE; if(!dre) return;
  if(!state.dreGrupos) state.dreGrupos = {};
  if(!dre.linhas.length){ caixa.innerHTML = ''; }
  else {
    const c = dre113Calcular(dre);
    caixa.innerHTML = '<table class="dre113" aria-label="DRE gerencial em cascata">'
      + c.linhas.map(l => '<tr class="' + (l.tipo || '') + '"><td>' + l.rot + '</td><td class="num ' + (l.tipo ? '' : (l.v < 0 ? 'neg' : (l.v > 0 ? 'pos' : ''))) + '">'
        + formatarMoedaOuOculto(l.v) + '</td><td class="pct">' + dre113Pct(l.v, c.rb) + '</td></tr>').join('')
      + '</table><p style="font-size:11px; color:var(--ink-soft); margin:2px 0 0;">% = análise vertical (sobre a receita bruta). '
      + 'Cada categoria entra no degrau marcado em "Classificação das categorias na DRE"'
      + (dre.linhas.some(l => dre113Grupo(l.categoria, l.receita > 0 && !(l.despesa > 0)).sug) ? ' — há categorias com degrau só sugerido: confira abaixo.' : '.') + '</p>';
  }
  /* classificação: todas as categorias em uso (qualquer período), receitas e despesas */
  const todas = calcularDRE({}).linhas;
  if(!todas.length){ corpo.innerHTML = '<div class="empty">Nenhuma categoria em uso ainda.</div>'; return; }
  corpo.innerHTML = '<table class="dre113-classif"><tbody>' + todas.map(l => {
      const ehReceita = l.receita > 0 && !(l.despesa > 0), gr = dre113Grupo(l.categoria, ehReceita);
      return '<tr><td>' + escHtml(l.categoria) + ' <span class="dre113-sug">' + (ehReceita ? 'receita' : 'despesa') + '</span></td><td>'
        + '<select data-dre113-cat="' + escHtml(l.categoria) + '">' + DRE113_GRUPOS.map(g => '<option value="' + g[0] + '"' + (g[0] === gr.g ? ' selected' : '') + '>' + g[1] + '</option>').join('')
        + '</select>' + (gr.sug ? '<span class="dre113-sug">sugerido</span>' : '') + '</td></tr>';
    }).join('') + '</tbody></table>';
  corpo.querySelectorAll('[data-dre113-cat]').forEach(sel => sel.addEventListener('change', () => {
    state.dreGrupos[sel.getAttribute('data-dre113-cat')] = sel.value;
    salvarEstado(); renderDRE();
  }));
}
function dre113LinhasCSV(dre){
  const c = dre113Calcular(dre);
  return [[], ['DRE gerencial em cascata', 'Valor', '% da receita bruta']].concat(c.linhas.map(l => [l.rot, l.v, dre113Pct(l.v, c.rb)]))
    .concat([[], ['Categoria', 'Degrau na DRE']], dre.linhas.map(l => {
      const gr = dre113Grupo(l.categoria, l.receita > 0 && !(l.despesa > 0));
      return [l.categoria, (DRE113_GRUPOS.find(g => g[0] === gr.g) || [])[1] + (gr.sug ? ' (sugerido)' : '')];
    }));
}
(function(){
  if(typeof renderDRE !== 'function') return;
  const original = renderDRE;
  renderDRE = function(){ const r = original.apply(this, arguments); try{ dre113Render(); }catch(e){ console.warn('[v113]', e); } return r; };
})();
