/* ===== v179: ALVOS SOLIDUNS — botão "Baixar PDF / imprimir" no topo, ao lado do título (24/10/2026) =====
   Pedido do Thiago: "INSIRA O BOTÃO MAIS VISÍVEL POSSÍVEL". O botão da v178 sai do fim dos filtros e vai para a
   linha do título "Alvos SOLIDUNS", maior, com ícone de download. Mesma função alImprimir (v178). */
if(typeof alDesenhar === 'function'){
  const _alDesenharV179 = alDesenhar;
  alDesenhar = function(){
    const r = _alDesenharV179.apply(this, arguments);
    const b = document.getElementById('al-imprimir');
    const caixa = document.getElementById('al-conteudo');
    const topo = caixa && caixa.parentElement && caixa.parentElement.querySelector('.rel-topo');
    if(b && topo){
      topo.classList.add('al-topo');
      b.className = 'cpro-btn al-pdf-topo';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/></svg><span>Baixar PDF / imprimir</span>';
      b.title = 'Baixar a lista em PDF ou imprimir';
      const velho = topo.querySelector('.al-pdf-topo');
      if(velho && velho !== b) velho.remove();
      topo.appendChild(b);
    }
    return r;
  };
}

(function v179Estilo(){
  const st = document.createElement('style');
  st.textContent = '.rel-topo.al-topo{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;}'
    + '.al-topo .al-pdf-topo{display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:700;padding:11px 20px;white-space:nowrap;'
    + 'box-shadow:0 0 0 3px rgba(242,200,10,.18);}'
    + '.al-topo .al-pdf-topo svg{flex:none;}'
    + '@media (max-width:640px){.al-topo .al-pdf-topo{flex:1 1 100%;justify-content:center;padding:13px 16px;margin:4px 0 14px;}}';
  document.head.appendChild(st);
})();
