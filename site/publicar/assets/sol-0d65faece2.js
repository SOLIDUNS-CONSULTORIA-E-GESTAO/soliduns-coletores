/* ===== v174: CORREÇÕES DE LAYOUT PARA CELULAR E TABLET (diagnóstico de 23/10/2026, aprovado pelo Thiago às 21h38) =====
   Só arrumação visual; nenhum texto, logo, botão, regra, login, permissão ou dado muda.
   A. Equipe: no celular, cada linha das tabelas vira um cartão (rótulo + valor), sem perder colunas nem botões.
   B. Barra do topo no celular: quando os botões da direita não cabem, "+ Novo registro" fica só "+" (o nome continua
      para leitores de tela) e "Equipe" e "Sair" passam para dentro do menu ☰.
   C. Barra do topo em tablet e telas médias: quando o menu (Educação, Investimentos…) não cabe na largura, ele vai
      para o ☰, como no celular. A decisão é pela largura que o conteúdo realmente precisa: onde cabe, nada muda.
   D. Mercado financeiro: a tabela da carteira rola dentro do próprio quadro; o subtítulo do Alvos SOLIDUNS reduz a
      fonte até caber numa linha (e só quebra a linha abaixo de 11 px).
   E. Equipe: botões das tabelas com área de toque maior. */
(function(){
  if(window.__layoutV174) return;
  window.__layoutV174 = true;

  const st = document.createElement('style'); st.id = 'layout-estilo-v174';
  st.textContent = ''
    /* C. menu do topo dentro do ☰ (mesmas regras que o site já usa até 760 px) */
    + '.topbar.topo-compacto .topbar-nav{display:none; position:absolute; top:56px; left:0; right:0; flex-direction:column; background:#000000;'
    + ' border-bottom:1px solid var(--line); z-index:205; max-height:calc(100vh - 56px); overflow-y:auto;}'
    + '.topbar.topo-compacto .topbar-nav.aberto{display:flex;}'
    + '.topbar.topo-compacto .topbar-item{height:48px; border-bottom:1px solid var(--line); border-left:3px solid transparent;}'
    + '.topbar.topo-compacto .topbar-item.active{border-bottom-color:var(--line); border-left-color:var(--gold);}'
    + '.topbar.topo-compacto .topbar-item-wrap{flex-direction:column;}'
    + '.topbar.topo-compacto .topbar-submenu{position:static; border:none; box-shadow:none; width:100%;}'
    + '.topbar.topo-compacto .topbar-burger{display:flex; align-items:center; justify-content:center;}'
    + '.topbar.topo-compacto{justify-content:space-between;}'
    /* B. botões da direita compactos; Equipe e Sair dentro do ☰ */
    + '.topbar .topo-extra{display:none !important;}'
    + '.topbar.topo-mini{gap:8px; padding-left:10px; padding-right:10px;}'
    + '.topbar.topo-mini .topbar-right{gap:7px;}'
    + '.topbar.topo-mini .topbar-right > .topbar-sair{display:none !important;}'
    + '.topbar.topo-mini .topbar-nav .topo-extra.topo-extra-visivel{display:flex !important; color:var(--gold);}'
    + '.topbar.topo-mini .topbar-user, .topbar.topo-mini .topbar-conta-seta{display:none;}'
    + '.topbar.topo-mini .topbar-conta{padding:3px;}'
    + '.topbar.topo-mini #btn-novo-registro{font-size:0 !important; padding:7px 12px !important; line-height:1; min-width:38px; min-height:34px;}'
    + '.topbar.topo-mini #btn-novo-registro::before{content:"+"; font-size:19px; font-weight:700;}'
    /* A + E. Equipe: tabelas em cartões no celular */
    + '@media (max-width:760px){'
    + ' #equipe-overlay table.leilao-admin-table, #equipe-overlay table.leilao-admin-table tbody{display:block; width:100%;}'
    + ' #equipe-overlay table.leilao-admin-table thead{display:none;}'
    + ' #equipe-overlay table.leilao-admin-table tr{display:block; border:1px solid var(--line); border-radius:var(--radius, 8px); padding:8px 12px; margin:0 0 10px; background:rgba(255,255,255,.015);}'
    + ' #equipe-overlay table.leilao-admin-table td{display:block; position:relative; padding:8px 0 8px 40%; min-height:20px; border-bottom:1px dashed var(--line);'
    + '  text-align:right; overflow-wrap:break-word; word-break:normal; white-space:normal;}'
    + ' #equipe-overlay table.leilao-admin-table td:last-child{border-bottom:none;}'
    + ' #equipe-overlay table.leilao-admin-table td[data-rotulo]::before{content:attr(data-rotulo); position:absolute; left:0; top:9px; width:37%; text-align:left;'
    + '  font-size:11px; font-weight:600; letter-spacing:.03em; text-transform:uppercase; color:var(--ink-soft); white-space:normal;}'
    + ' #equipe-overlay table.leilao-admin-table td:not([data-rotulo]), #equipe-overlay table.leilao-admin-table td[colspan]{padding-left:0; text-align:left;}'
    + ' #equipe-overlay table.leilao-admin-table td.acoes{padding-left:0; text-align:left; display:flex; flex-wrap:wrap; gap:8px;}'
    + ' #equipe-overlay table.leilao-admin-table td.acoes::before{display:none;}'
    + ' #equipe-overlay table.leilao-admin-table button, #equipe-overlay .cpf-ver{min-height:36px; padding:8px 12px !important; border:1px solid var(--line) !important; border-radius:6px;}'
    + ' #equipe-overlay .leilao-ficha-box{overflow-x:hidden;}'
    + ' #mercado-br-conteudo > table.leilao-admin-table{display:block; max-width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;}'
    /* Gestão no celular: filtros e formulários que empurravam a página para o lado */
    + ' #main-app .toolbar .filters{flex-wrap:wrap; max-width:100%; min-width:0;}'
    + ' #main-app .toolbar .filters > *{min-width:0; max-width:100%;}'
    + ' #main-app .field-row, #main-app .leilao-form-grid{grid-template-columns:1fr;}'
    + ' #main-app .field-row > *, #main-app .leilao-form-grid > *{min-width:0;}'
    + ' .cert-chips{flex-wrap:wrap;}'
    + '}'
    + '#main-app .split > *, #main-app .cc-colunas > *{min-width:0;}'   /* colunas não crescem além da tela por causa de uma tabela larga */
    /* tabela mais larga que o quadro (tablet e telas médias): rola dentro do próprio quadro */
    + 'table.tab-rola{display:block; max-width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;}';
  document.head.appendChild(st);

  /* ---------------- B e C: barra do topo que se adapta à largura que o conteúdo precisa ---------------- */
  const limite = () => Math.min(window.innerWidth, (window.screen && screen.width) || window.innerWidth);
  function precisa(h){
    /* largura que a barra precisa para mostrar tudo numa linha (independe da página estar "afastada" no celular) */
    const s = getComputedStyle(h);
    const filhos = [...h.children].filter(c => { const cs = getComputedStyle(c); return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed'; });
    const gap = parseFloat(s.columnGap || s.gap) || 0;
    let total = parseFloat(s.paddingLeft) + parseFloat(s.paddingRight) + gap * Math.max(0, filhos.length - 1);
    filhos.forEach(c => { total += c.classList.contains('topbar-nav') ? c.scrollWidth : c.getBoundingClientRect().width; });
    return total;
  }
  function extras(h){
    const nav = h.querySelector('.topbar-nav'); if(!nav) return;
    h.querySelectorAll('.topbar-right > .topbar-sair').forEach(orig => {
      if(!orig.id) return;
      let c = nav.querySelector('.topo-extra[data-de="' + orig.id + '"]');
      if(!c){
        c = document.createElement('button'); c.type = 'button'; c.className = 'topbar-item topo-extra'; c.setAttribute('data-de', orig.id);
        c.addEventListener('click', ev => { ev.preventDefault(); nav.classList.remove('aberto'); orig.click(); });
        nav.appendChild(c);
      }
      c.textContent = orig.textContent.trim();
      c.classList.toggle('topo-extra-visivel', orig.style.display !== 'none');
    });
  }
  let ocupado = false;
  function ajustar(){
    ocupado = false;
    document.querySelectorAll('header.topbar').forEach(h => {
      if(!h.offsetParent && getComputedStyle(h).position !== 'fixed' && h.getBoundingClientRect().width === 0) return;   /* barra escondida */
      extras(h);
      const L = limite();
      const eraC = h.classList.contains('topo-compacto'), eraM = h.classList.contains('topo-mini');
      h.classList.remove('topo-compacto', 'topo-mini');
      let c = false, m = false;
      if(precisa(h) > L + 1){
        h.classList.add('topo-compacto'); c = true;
        if(precisa(h) > L + 1){ h.classList.add('topo-mini'); m = true; }
      }
      if(!c && eraC){ const nav = h.querySelector('.topbar-nav'); if(nav) nav.classList.remove('aberto'); }
      if(c !== eraC || m !== eraM) h.setAttribute('data-topo', m ? 'mini' : c ? 'compacto' : 'normal');
    });
    ajustarSubtitulos();
  }
  const agendar = () => { if(!ocupado){ ocupado = true; requestAnimationFrame(ajustar); } };
  window.addEventListener('resize', agendar);
  window.addEventListener('orientationchange', agendar);
  window.addEventListener('hashchange', () => setTimeout(agendar, 60));
  window.addEventListener('load', agendar);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(agendar);
  const obs = new MutationObserver(agendar);
  document.querySelectorAll('header.topbar').forEach(h => {
    obs.observe(h.querySelector('.topbar-right') || h, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class']});
  });
  /* as barras aparecem e somem ao trocar de tela (login, Gestão, painéis) */
  ['tela-dashboard', 'main-app'].forEach(id => { const el = document.getElementById(id); if(el) obs.observe(el, {attributes: true, attributeFilter: ['style', 'class']}); });
  obs.observe(document.body, {attributes: true, attributeFilter: ['class', 'style']});
  agendar();

  /* ---------------- C: tabela que não cabe no quadro rola dentro dele (acima de 760 px; abaixo, o site já faz isso) ---------------- */
  function rolarTabelas(){
    if(window.innerWidth <= 760){ document.querySelectorAll('table.tab-rola').forEach(t => t.classList.remove('tab-rola')); return; }
    document.querySelectorAll('#main-app table, #equipe-overlay table.leilao-admin-table').forEach(t => {
      if(!t.offsetParent) return;
      t.classList.remove('tab-rola');
      const pai = t.parentElement; if(!pai) return;
      if(t.getBoundingClientRect().width > pai.clientWidth + 1) t.classList.add('tab-rola');
    });
  }
  let tTab = null;
  const agendarTab = () => { clearTimeout(tTab); tTab = setTimeout(rolarTabelas, 150); };
  window.addEventListener('resize', agendarTab);
  window.addEventListener('hashchange', () => setTimeout(agendarTab, 120));
  ['main-app', 'equipe-overlay'].forEach(id => { const el = document.getElementById(id); if(el) new MutationObserver(agendarTab).observe(el, {subtree: true, childList: true, attributes: true, attributeFilter: ['style']}); });
  agendarTab();

  /* ---------------- A: rótulos das colunas nas tabelas da Equipe (para os cartões do celular) ---------------- */
  function rotular(raiz){
    raiz.querySelectorAll('table.leilao-admin-table').forEach(t => {
      const ths = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim());
      if(!ths.length) return;
      t.querySelectorAll('tbody tr').forEach(tr => {
        let col = 0;
        [...tr.children].forEach(td => {
          const r = ths[col] || '';
          if(r && !td.hasAttribute('colspan')){ if(td.getAttribute('data-rotulo') !== r) td.setAttribute('data-rotulo', r); }
          else if(td.hasAttribute('data-rotulo')) td.removeAttribute('data-rotulo');
          col += Number(td.getAttribute('colspan') || 1);
        });
      });
    });
  }
  const eq = document.getElementById('equipe-overlay');
  if(eq){
    let agendadoEq = false;
    const obsEq = new MutationObserver(() => { if(!agendadoEq){ agendadoEq = true; requestAnimationFrame(() => { agendadoEq = false; rotular(eq); }); } });
    obsEq.observe(eq, {subtree: true, childList: true});
    rotular(eq);
  }

  /* ---------------- D: subtítulo do Alvos SOLIDUNS numa linha só (fonte menor no celular) ---------------- */
  function ajustarSubtitulos(){
    document.querySelectorAll('.al-subtit').forEach(p => {
      p.style.fontSize = ''; p.style.whiteSpace = '';
      if(p.clientWidth === 0) return;
      let f = parseFloat(getComputedStyle(p).fontSize);
      while(p.scrollWidth > p.clientWidth + 1 && f > 11){ f -= 0.5; p.style.fontSize = f + 'px'; }
      if(p.scrollWidth > p.clientWidth + 1){ p.style.whiteSpace = 'normal'; p.style.overflow = 'visible'; }
    });
  }
  const mfPub = document.getElementById('mf-analises-pub');
  if(mfPub) new MutationObserver(() => requestAnimationFrame(ajustarSubtitulos)).observe(mfPub, {childList: true});
})();
