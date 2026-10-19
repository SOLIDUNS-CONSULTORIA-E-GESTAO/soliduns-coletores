
/* ===== v117 — Leilão de automóveis: filtro por leiloeiro; comissão e edital na ficha (SQL 131) ===== */
(function(){
  if(typeof veiConsulta !== 'function') return;
  async function veiLeiloeirosV117(){
    const sel = veiEl('vei-f-leiloeiro'); if(!sel) return;
    const atual = sel.value, cont = {};
    try{
      for(let pag = 0; pag < 10; pag++){
        const r = await veiRest('veiculos_leiloes?select=leiloeiro&situacao=eq.ativo&leiloeiro=not.is.null&order=id.asc&limit=1000&offset=' + pag * 1000);
        const linhas = Array.isArray(r) ? r : (r && Array.isArray(r.dados) ? r.dados : []);
        linhas.forEach(x => { const k = String(x.leiloeiro || '').trim(); if(k) cont[k] = (cont[k] || 0) + 1; });
        if(linhas.length < 1000) break;
      }
    }catch(e){}
    const pares = Object.keys(cont).sort(veiCompara).map(k => [k, k + veiConta(cont[k])]);
    veiOpcoes(sel, pares, 'Todos os leiloeiros', true);
    if(atual && cont[atual]) sel.value = atual;
  }
  const baseOrig = veiCarregarBase;
  veiCarregarBase = async function(){ await baseOrig(); veiLeiloeirosV117(); };
  const filtOrig = veiFiltrosAtuais;
  veiFiltrosAtuais = function(){ const f = filtOrig(); const el = veiEl('vei-f-leiloeiro'); f.leiloeiro = el ? el.value : ''; return f; };
  const consOrig = veiConsulta;
  veiConsulta = function(f){
    let q = consOrig(f);
    if(f && f.leiloeiro) q = q.replace('situacao=eq.ativo', 'situacao=eq.ativo&leiloeiro=eq.' + encodeURIComponent(f.leiloeiro));
    return q;
  };
  if(typeof veiAplicar === 'function'){
    const aplOrig = veiAplicar;
    veiAplicar = async function(f){ await aplOrig(f); const el = veiEl('vei-f-leiloeiro'); if(el) el.value = (f && f.leiloeiro) || ''; };
  }
  if(typeof VEI_CAMPO_IDS === 'object') VEI_CAMPO_IDS.leiloeiro = ['vei-f-leiloeiro'];
  const el = veiEl('vei-f-leiloeiro'); if(el) el.addEventListener('change', () => veiAgendar());
  const fichaOrig = veiFicha;
  veiFicha = function(id){
    fichaOrig(id);
    const l = (_vei.itens || []).find(x => x.id === id), box = veiEl('vei-ficha-conteudo');
    if(!l || !box) return;
    const grid = box.querySelector('.leilao-ficha-grid'), extra = [];
    const item = (rot, val) => '<div class="leilao-ficha-item"><span>' + rot + '</span><b>' + val + '</b></div>';
    if(Number(l.comissao_pct) > 0) extra.push(item('Comissão do leiloeiro', String(l.comissao_pct).replace('.', ',') + '% sobre o lance'));
    if(grid && extra.length) grid.insertAdjacentHTML('beforeend', extra.join(''));
    if(/^https:\/\//i.test(l.link_edital || '') && l.link_edital !== l.url)
      box.insertAdjacentHTML('beforeend', '<a class="vei-btn" href="' + escHtml(l.link_edital) + '" target="_blank" rel="noopener noreferrer" style="margin-left:8px;">Abrir o edital ↗</a>');
  };
})();
