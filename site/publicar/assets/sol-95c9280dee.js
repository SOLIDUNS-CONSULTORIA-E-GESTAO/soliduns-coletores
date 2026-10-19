
/* ===== v108 — TICKERS CLICÁVEIS → RELATÓRIO DO ATIVO (Brasil e EUA) =====
   Endereço oficial: #/investimentos/mercado-financeiro/relatorios?ticker=PETR4&mercado=BR (ou EUA). */
/* clique: mesmo endereço do atual (ex.: voltou e clicou de novo no mesmo ticker) também abre */
document.addEventListener('click', function(ev){
  const a = ev.target.closest && ev.target.closest('a.tk-rel');
  if(!a || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button !== 0) return;   /* Ctrl+clique: nova aba */
  ev.preventDefault();
  const alvo = a.getAttribute('href');
  if(window.location.hash === alvo) roteador(); else window.location.hash = alvo;
});
/* roteador: devolve true quando abriu (ou bloqueou) o relatório pedido no endereço */
function tkRotaV108(sub, query){
  if(sub !== 'relatorios' && sub !== 'eua/relatorios') return false;
  let p; try{ p = new URLSearchParams(query || ''); }catch(e){ return false; }
  const t = tkLimparV108(p.get('ticker'));
  if(!t) return false;
  const mp = String(p.get('mercado') || '').toUpperCase();
  const us = mp === 'EUA' || mp === 'US' || (mp !== 'BR' && sub === 'eua/relatorios');
  mfAbrirSubrota(us ? 'eua/relatorios' : 'relatorios');
  const tela = document.getElementById('mf-relatorio');
  if(!tela || tela.style.display === 'none') return true;   /* sem acesso: a tela de bloqueio já apareceu */
  const vb = document.getElementById('rel-voltar-busca');
  if(vb){ vb.textContent = '← Voltar às cotações'; vb.dataset.origem = 'cotacoes'; vb.style.display = 'inline-block'; }
  relAbrir(t);
  history.replaceState(null, '', tkEnderecoV108(t, us ? 'us' : 'br'));
  setTimeout(function(){ tela.scrollIntoView({behavior: 'smooth', block: 'start'}); }, 60);
  return true;
}
function tkVoltarCotacoesV108(){
  relEsconder(); relAlternarScreener(true);
  document.getElementById('mf-painel-implantacao').style.display = 'none';
  document.getElementById('mf-conteudo-padrao').style.display = 'block';
  marcarItemAtivoMF('acoes');
  setTituloPagina('Mercado financeiro', 'Cotações');
  const us = document.getElementById('mercado-acoes').value === 'us';
  history.replaceState(null, '', MF_BASE + (us ? '/eua' : ''));
  setTimeout(function(){
    const c = document.querySelector('.cotacoes-lista[data-mercado="' + (us ? 'us' : 'br') + '"]');
    if(c) c.scrollIntoView({behavior: 'smooth', block: 'center'});
  }, 60);
}
/* relatório aberto pela busca/lista da própria tela (ou pela Busca avançada): o endereço passa a ter o ticker */
(function(){
  if(typeof relAbrir !== 'function') return;
  const original = relAbrir;
  relAbrir = async function(ticker){
    const r = await original.apply(this, arguments);
    try{
      const caminho = (window.location.hash || '').split('?')[0];
      const t = tkLimparV108(ticker);
      if(t && (caminho === MF_BASE + '/relatorios' || caminho === MF_BASE + '/eua/relatorios'))
        history.replaceState(null, '', tkEnderecoV108(t, _relMercado === 'us' ? 'us' : 'br'));
    }catch(e){}
    return r;
  };
})();
