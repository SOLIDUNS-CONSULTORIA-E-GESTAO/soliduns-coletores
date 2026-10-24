/* ===== v178: ALVOS SOLIDUNS — botão "Baixar PDF / imprimir" (24/10/2026) =====
   Gera o PDF da lista que está na tela (mesmos filtros, cenário e ordem), no padrão dos PDFs da plataforma:
   capa escura com o logo, resumo e aviso importante; depois a tabela completa e "Como ler os alvos".
   O PDF sai pelo "Salvar como PDF" da janela de impressão do navegador (computador, iPhone e Android).
   Não altera nada no banco nem no cálculo: só lê _al (v171). */

/* a mesma lista da tabela da tela (filtros + ordem do v171) */
function alpItens(){
  const todos = (_al.dados && _al.dados.acoes) || [];
  const q = alSem(_al.busca);
  let itens = todos.filter(x => (!q || alSem(x.ticker + ' ' + x.empresa).indexOf(q) >= 0) && (!_al.setor || x.setor === _al.setor)
    && (!_al.soLimpas || x.limpa) && (!_al.ganhoMin || alV(x).ganho >= _al.ganhoMin));
  const k = _al.ord, s = _al.asc ? 1 : -1;
  return itens.slice().sort((a, b) => {
    if(k === 'posicao'){ return (alV(b).ganho - alV(a).ganho) * s; }
    const va = alValor(a, k), vb = alValor(b, k);
    if(typeof va === 'number' || typeof vb === 'number'){
      if(va === null || va === undefined || isNaN(va)) return 1; if(vb === null || vb === undefined || isNaN(vb)) return -1;
      return (Number(va) - Number(vb)) * s; }
    return String(va || '').localeCompare(String(vb || ''), 'pt-BR') * s; });
}

function alpFiltrosTexto(e){
  const nd = e.candidato_d || 'D';
  const col = (AL_COLS.find(c => c[0] === _al.ord) || ['', 'Posição'])[1];
  const p = ['Cenário: ' + (_al.cen === 'D' ? 'vitória de ' + nd + ' (D)' : 'só técnico (sem eleição)'),
             'ganho mínimo até o alvo 2: ' + (_al.ganhoMin ? alPct(_al.ganhoMin, 0) + ' ou mais' : 'todos'),
             'setor: ' + (_al.setor || 'todos'),
             'ações com alertas: ' + (_al.soLimpas ? 'escondidas' : 'incluídas'),
             'ordem: ' + (_al.ord === 'posicao' ? 'maior ganho até o alvo 2' : col + (_al.asc ? ' (crescente)' : ' (decrescente)'))];
  if(_al.busca) p.splice(3, 0, 'busca: "' + _al.busca + '"');
  return p.join(' · ');
}

function alImprimir(){
  const d = _al.dados; if(!d || !d.execucao) return;
  const e = d.execucao, todos = d.acoes || [], itens = alpItens();
  ['rel-impressao', 'rel-impressao-estilo'].forEach(id => { const el = document.getElementById(id); if(el) el.remove(); });
  const logo = (document.querySelector('.spine-logo img') || {}).src || new URL('logo-soliduns.png', location.href).href;
  const hoje = new Date().toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'});
  const nd = e.candidato_d || 'D', res = e.resultado === 'D' || e.resultado === 'E';
  const nDest = itens.filter(alDestaque).length;
  const caixa = (rot, val, peq) => '<div class="rp-caixa"><span>' + rot + '</span><b' + (peq ? ' class="alp-peq"' : '') + '>' + val + '</b></div>';
  const capa = '<section class="rp-capa">'
    + '<img class="rp-logo" src="' + logo + '" alt="SOLIDUNS">'
    + '<h1 class="rp-titulo">ALVOS SOLIDUNS</h1><div class="rp-filete"></div>'
    + '<h2 class="rp-empresa alp-capa-sub">Entrada, stop e preço-alvo das ações da B3</h2>'
    + '<p class="rp-sub">B3 · Brasil · pregão de referência ' + alData(e.data_referencia) + ' · gerado em ' + hoje
    + (d.previa ? ' · PRÉVIA, ainda não publicada para os assinantes' : '') + '</p>'
    + '<div class="rp-caixas">'
    + caixa('AÇÕES NA LISTA', alNum(itens.length, 0) + (itens.length !== todos.length ? ' de ' + alNum(todos.length, 0) : ''))
    + caixa('EM DESTAQUE', alNum(nDest, 0))
    + (res ? caixa('RESULTADO DA ELEIÇÃO', escHtml(e.resultado === 'D' ? nd : (e.candidato_e || 'E')), true)
           : caixa('CHANCE DO CENÁRIO D', alPct(e.p_d, 0)))
    + caixa('CDS BRASIL 5 ANOS', alNum(e.cds_pb, 0) + ' pb')
    + '</div>'
    + '<div class="rp-aviso"><b>Aviso importante</b><p>Esta lista tem caráter exclusivamente educacional e informativo. Foi gerada automaticamente pela plataforma SOLIDUNS '
    + 'com dados públicos da B3 (cotações diárias) e da CVM (demonstrações financeiras), sem análise individual e sem garantia de exatidão ou completude. '
    + 'Os preços de entrada, stop e alvos são estimativas a partir de indicadores técnicos e da reação estimada ao cenário eleitoral; não são promessa de resultado. '
    + 'Não constitui recomendação de investimento, oferta nem solicitação de compra ou venda de valores mobiliários. '
    + 'Decisões de investimento devem considerar os objetivos e o perfil de risco de cada investidor; rentabilidade passada não garante rentabilidade futura.</p></div>'
    + '</section>';
  /* larguras em mm (somam 190 mm, a largura útil da folha A4) */
  const LARG = {posicao: 5, ticker: 13, empresa: 23, setor: 23, preco: 10, ent_ideal: 11, ent_max: 11, stop: 10, alvo1: 10, alvo2: 10, ganho: 12, ganhoAtual: 12, rr: 11, alertas: 29};
  const cols = '<colgroup>' + AL_COLS.map(c => '<col style="width:' + (LARG[c[0]] || 10) + 'mm">').join('') + '</colgroup>';
  const th = AL_COLS.map(c => '<th' + (c[2] ? ' class="alp-dir"' : '') + '>' + escHtml(c[1]) + '</th>').join('');
  const linhas = itens.map((x, i) => {
    const v = alV(x), al = x.alertas || [];
    return '<tr class="' + (alDestaque(x) ? 'alp-verde' : (x.limpa ? '' : 'alp-restrita')) + '">'
      + '<td class="alp-dir">' + (i + 1) + '</td><td><b>' + escHtml(x.ticker) + '</b></td><td>' + escHtml(x.empresa || '') + '</td><td>' + escHtml(x.setor || '') + '</td>'
      + '<td class="alp-dir">' + alRs(x.preco) + '</td><td class="alp-dir">' + alRs(x.ent_ideal) + '</td><td class="alp-dir">' + alRs(x.ent_max) + '</td>'
      + '<td class="alp-dir">' + alRs(x.stop) + '</td><td class="alp-dir">' + alRs(x.alvo1) + '</td><td class="alp-dir"><b>' + alRs(v.alvo2) + '</b></td>'
      + '<td class="alp-dir"><b>' + alPct(v.ganho, 1, true) + '</b></td><td class="alp-dir">' + alPct(v.ganhoAtual, 1, true) + '</td>'
      + '<td class="alp-dir">' + alNum(v.rr, 1) + '</td><td>' + (al.length ? al.map(a => escHtml(a)).join('; ') : '—') + '</td></tr>';
  }).join('') || '<tr><td colspan="' + AL_COLS.length + '">Nenhuma ação com esses filtros.</td></tr>';
  const ler = document.createElement('div'); ler.innerHTML = alComoLerHtml(e);
  const lerUl = ler.querySelector('ul'), lerP = ler.querySelector('p');
  const corpo = '<div class="alp-folha">'
    + '<h2 class="alp-tit">Alvos SOLIDUNS · pregão de ' + alData(e.data_referencia) + '</h2>'
    + '<p class="alp-filtros">' + escHtml(alpFiltrosTexto(e)) + '</p>'
    + '<p class="alp-legenda"><span class="alp-q alp-verde"></span>Em verde: ganho de ' + alPct(alLimite(), 0) + ' ou mais até o alvo 2, sem alertas. '
    + '<span class="alp-q alp-restrita"></span>Em cinza: ação com alertas. Preços em R$.</p>'
    + '<table class="alp-tabela">' + cols + '<thead><tr>' + th + '</tr></thead><tbody>' + linhas + '</tbody></table>'
    + '<section class="alp-ler"><h3>Como ler os alvos</h3>' + (lerUl ? '<ul>' + lerUl.innerHTML + '</ul>' : '') + (lerP ? '<p>' + lerP.innerHTML + '</p>' : '') + '</section>'
    + '</div>';
  const div = document.createElement('div');
  div.id = 'rel-impressao';
  div.innerHTML = capa + corpo;
  document.body.appendChild(div);
  const est = document.createElement('style');
  est.id = 'rel-impressao-estilo';
  est.textContent = '@page{size:A4 portrait; margin:20mm 0 16mm 0;'
    + '@top-left{content:"SOLIDUNS · Alvos SOLIDUNS"; font:700 9pt Arial,Helvetica,sans-serif; color:#111; vertical-align:bottom; padding-bottom:2.5mm; margin-left:10mm; border-bottom:1.3pt solid #F2C80A;}'
    + '@top-center{content:""; border-bottom:1.3pt solid #F2C80A;} @top-right{content:""; margin-right:10mm; border-bottom:1.3pt solid #F2C80A;}'
    + '@bottom-left{content:"SOLIDUNS Consultoria e Gestão · material educacional · ver aviso importante na página 1"; font:7.5pt Arial,Helvetica,sans-serif; color:#666; margin-left:10mm;}'
    + '@bottom-right{content:"Página " counter(page); font:7.5pt Arial,Helvetica,sans-serif; color:#666; margin-right:10mm;}}'
    + '@page:first{margin:0; @top-left{content:none; border:none;} @top-center{content:none; border:none;} @top-right{content:none; border:none;} @bottom-left{content:none;} @bottom-right{content:none;}}'
    + '@media print{ body > *:not(#rel-impressao){display:none !important;} #rel-impressao{display:block !important;} html, body{background:#fff !important; margin:0 !important;} }'
    + '#rel-impressao .alp-capa-sub{font-size:16pt;white-space:nowrap;} #rel-impressao .rp-caixa b.alp-peq{font-size:11pt;}'
    + '#rel-impressao .alp-folha{padding:0 10mm;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    + '#rel-impressao .alp-folha *{text-align:left;}'
    + '#rel-impressao .alp-tit{font-size:13pt;margin:0 0 1.5mm;color:#111;}'
    + '#rel-impressao .alp-filtros{font-size:7.4pt;color:#444;margin:0 0 1.5mm;}'
    + '#rel-impressao .alp-legenda{font-size:7.5pt;color:#444;margin:0 0 3mm;}'
    + '#rel-impressao .alp-q{display:inline-block;width:3mm;height:3mm;border:0.2mm solid #999;vertical-align:-0.4mm;margin:0 1.5mm 0 0;}'
    + '#rel-impressao .alp-tabela{width:100%;table-layout:fixed;border-collapse:collapse;font-size:6.6pt;line-height:1.25;}'
    + '#rel-impressao .alp-tabela thead{display:table-header-group;}'
    + '#rel-impressao .alp-tabela th{background:#0F181F;color:#F2C80A;font-weight:700;font-size:6.4pt;letter-spacing:0;text-transform:none;padding:1.6mm 1mm;vertical-align:bottom;white-space:normal !important;overflow-wrap:normal;word-break:normal;hyphens:none;line-height:1.2;}'
    + '#rel-impressao .alp-tabela td{padding:1.2mm 1mm;border-bottom:0.2mm solid #ccc;color:#111;vertical-align:top;}'
    + '#rel-impressao .alp-tabela tr{break-inside:avoid;page-break-inside:avoid;}'
    + '#rel-impressao .alp-tabela .alp-dir{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}'
    + '#rel-impressao .alp-tabela td:nth-child(14){color:#8a5a00;}'
    + '#rel-impressao .alp-verde, #rel-impressao .alp-tabela tr.alp-verde td{background:#e3f3e4;}'
    + '#rel-impressao .alp-restrita, #rel-impressao .alp-tabela tr.alp-restrita td{background:#f2f2f2;color:#555;}'
    + '#rel-impressao .alp-ler{margin-top:6mm;break-inside:avoid;page-break-inside:avoid;}'
    + '#rel-impressao .alp-ler h3{font-size:10pt;margin:0 0 2mm;color:#8a6d00;}'
    + '#rel-impressao .alp-ler ul{margin:0;padding-left:5mm;font-size:8pt;line-height:1.45;color:#222;}'
    + '#rel-impressao .alp-ler li{margin:0 0 1mm;} #rel-impressao .alp-ler p{font-size:7.5pt;color:#555;margin:2mm 0 0;}';
  document.head.appendChild(est);
  const titulo = document.title;
  document.title = 'Alvos SOLIDUNS ' + alData(e.data_referencia).replace(/\//g, '-');
  const limpar = () => { div.remove(); est.remove(); document.title = titulo; window.removeEventListener('afterprint', limpar); };
  window.addEventListener('afterprint', limpar);
  const img = div.querySelector('.rp-logo');
  const pronto = (img && img.decode) ? img.decode().catch(() => {}) : Promise.resolve();
  Promise.race([pronto, new Promise(r => setTimeout(r, 2500))]).then(() => setTimeout(() => window.print(), 60));
}

/* botão no fim da barra de filtros (some quando ainda não há lista) */
if(typeof alDesenhar === 'function'){
  const _alDesenharV178 = alDesenhar;
  alDesenhar = function(){
    const r = _alDesenharV178.apply(this, arguments);
    const f = document.querySelector('#al-conteudo .al-filtros');
    if(f && !document.getElementById('al-imprimir')){
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cpro-btn al-pdf-btn'; b.id = 'al-imprimir'; b.textContent = 'Baixar PDF / imprimir';
      b.addEventListener('click', alImprimir);
      f.appendChild(b);
    }
    return r;
  };
}

(function v178Estilo(){
  const st = document.createElement('style');
  st.textContent = '.al-filtros .al-pdf-btn{margin-left:auto;white-space:nowrap;align-self:flex-end;}'
    + '@media (max-width:640px){.al-filtros .al-pdf-btn{margin-left:0;flex:1 1 100%;}}';
  document.head.appendChild(st);
})();
