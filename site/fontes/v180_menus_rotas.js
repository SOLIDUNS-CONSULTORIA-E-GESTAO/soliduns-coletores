/* ===== v180: MENUS E ROTAS — correções da auditoria de 24/10/2026 (aprovadas pelo Thiago: "APROVADO - SIGA") =====
   A. "Serviços" nas páginas de serviço vira o mesmo botão com lista das outras páginas (a faixa dos 5 serviços continua).
   B. Logado, recarregar ou abrir link direto de Nosso Time, Serviços, páginas executivas, Início e Contato mantém a página.
   C. O endereço #/contato desce até o Contato (e #/inicio vai ao topo).
   D. "Nosso Time": título da aba e destaque no menu certos.
   E. Equipe aberta por link direto: "← Voltar" volta para a plataforma (sem tela preta) e o endereço acompanha.
   F. Lista "Investimentos" da Gestão com os 6 itens do hub (entram Leilão de automóveis e Avaliação de imóveis).
   G. Sem login, link da plataforma abre a tela "Entrar" e, depois do login, vai para a página pedida.
   H. Endereço inexistente, logado, sempre mostra "Página não encontrada" (antes, aberto direto, levava para Educação).
   I. "← Voltar" das páginas de serviço volta para a página de onde a pessoa veio.
   J. Notícias aberta pelo Mercado financeiro não prende mais o "Voltar" do navegador.
   K. "Busca avançada" de Ações (Brasil e EUA) com endereço próprio.
   Cabeçalho e logo: nenhum texto, logo ou cor muda; só o "Serviços" das páginas de serviço passa a abrir a lista. */
(function(){
  const caminho = () => (location.hash || '').replace(/^#\/?/, '').split('?')[0];
  const SERVICOS = [['consultoria', 'Consultoria financeira'], ['ativos', 'Avaliação e gestão de ativos'], ['educacao-financeira', 'Educação financeira'],
                    ['educacao-tributaria', 'Educação tributária'], ['caixa', 'Gestão de caixa e empresas']];
  const PUBLICAS_LOGADO = ['inicio', 'contato', 'equipe'].concat(SERVICOS.map(s => 'servicos/' + s[0]), ['executivo/consultoria', 'executivo/ativos', 'executivo/educacao']);
  const RE_PLATAFORMA = /^(educacao|investimentos|acoes|mercado-financeiro|empresas|leilao|leilao-veiculos|leilao-automoveis|leilao-de-automoveis|mercado-imobiliario|avaliacao-imoveis|avaliacao|avaliacao-de-imoveis|laudos|gestao-financeira|gestao-fiscal|gestao-fiscal-e-financeira|calculadoras|admin)(\/|$)/;

  /* ---------- B. rotas públicas que continuam valendo com a sessão aberta (lista usada no login/recarga) ---------- */
  if(typeof ROTAS_SO_DESLOGADO !== 'undefined') PUBLICAS_LOGADO.forEach(r => { if(ROTAS_SO_DESLOGADO.indexOf(r) === -1) ROTAS_SO_DESLOGADO.push(r); });

  /* mesma regra do login (entrarNoApp) para saber se um endereço existe */
  function rotaConhecida(c){
    return !c || c === 'educacao' || ROTAS_SO_DESLOGADO.indexOf(c) !== -1 || (typeof VM_SC_RE !== 'undefined' && VM_SC_RE.test(c)) || c.indexOf('educacao/') === 0
      || !!ROTAS[c] || !!ROTAS_REDIRECT[c] || /^(gestao-financeira|gestao-fiscal)\/[a-z0-9-]+$/.test(c)
      || /^investimentos\/mercado-financeiro\/[A-Za-z0-9.,\/-]+$/.test(c) || c === 'login' || c === 'inicio' || c === 'contato'
      || c.indexOf('servicos/') === 0 || c.indexOf('executivo/') === 0 || /^noticias(\/|$)/.test(c);
  }

  /* ---------- C, D, G: troca de tela ---------- */
  const DESTINO = 'sol-destino-apos-login';
  if(typeof mostrarTela === 'function'){
    const _mostrarTela = mostrarTela;
    mostrarTela = function(nome){
      const c = caminho();
      if(nome === 'landing' && !sessaoAtual && RE_PLATAFORMA.test(c)){   /* G */
        try{ sessionStorage.setItem(DESTINO, JSON.stringify({h: '#/' + c, t: Date.now()})); }catch(e){}
        const r = _mostrarTela.call(this, 'auth');
        if(typeof preencherEmailLembrado === 'function') preencherEmailLembrado();
        const m = document.getElementById('login-msg');
        if(m){ m.textContent = 'Entre com sua conta para abrir esta página.'; m.className = 'auth-msg'; }
        return r;
      }
      const r = _mostrarTela.apply(this, arguments);
      if(nome === 'landing' && (c === 'contato' || c === 'inicio')){   /* C */
        window.__scrollPendente = c;
        if(typeof aplicarScrollPendente === 'function') aplicarScrollPendente();
      }
      if(nome === 'equipe'){   /* D */
        if(typeof setTituloPagina === 'function') setTituloPagina('Nosso Time');
        document.querySelectorAll('#tela-equipe .landing-nav a[data-anchor]').forEach(a => a.classList.toggle('landing-ativo', a.getAttribute('data-anchor') === 'equipe'));
      }
      return r;
    };
  }

  /* ---------- G e H: login / recarga com a sessão aberta ---------- */
  if(typeof entrarNoApp === 'function'){
    const _entrar = entrarNoApp;
    entrarNoApp = async function(){
      let destino = null;
      try{ const d = JSON.parse(sessionStorage.getItem(DESTINO) || 'null'); sessionStorage.removeItem(DESTINO);
        if(d && d.h && Date.now() - d.t < 30 * 60e3) destino = d.h; }catch(e){}   /* vale por 30 minutos */
      const c1 = caminho();
      if(destino && (c1 === '' || c1 === 'login' || c1 === 'educacao')) history.replaceState(null, '', destino);   /* G */
      const h0 = location.hash, c0 = caminho();
      const inexistente = !!c0 && !rotaConhecida(c0);
      if(inexistente) history.replaceState(null, '', '#/educacao');   /* H: entra sem criar entrada no histórico */
      const r = await _entrar.apply(this, arguments);
      if(inexistente){ history.replaceState(null, '', h0); roteador(); }
      return r;
    };
  }
  /* se o login terminou antes deste arquivo carregar (rede rápida), corrige do mesmo jeito */
  try{
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    const inicial = nav && nav.name && nav.name.indexOf('#') >= 0 ? nav.name.slice(nav.name.indexOf('#')) : '';
    const ci = inicial.replace(/^#\/?/, '').split('?')[0];
    if(sessaoAtual && ci && caminho() === 'educacao' && ci !== 'educacao' && (PUBLICAS_LOGADO.indexOf(ci) !== -1 || !rotaConhecida(ci))){
      history.replaceState(null, '', inicial); roteador();
    }
  }catch(e){}

  /* sem login a primeira tela pode ter sido desenhada antes deste arquivo carregar: aplica C, D e G agora */
  try{
    const vis = id => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none'; };
    const c = caminho();
    if(!sessaoAtual && vis('tela-landing') && (RE_PLATAFORMA.test(c) || c === 'contato' || c === 'inicio')) mostrarTela('landing');
    else if(!sessaoAtual && vis('tela-equipe')) mostrarTela('equipe');
  }catch(e){}

  /* ---------- A. "Serviços" com lista nas páginas de serviço ---------- */
  const rot = document.querySelector('#landing-nav-servico .landing-nav-servicos-label');
  if(rot){
    const wrap = document.createElement('div');
    wrap.className = 'landing-nav-item-wrap';
    wrap.innerHTML = '<button type="button" class="landing-nav-servicos landing-ativo" id="landing-btn-servicos-servico" aria-haspopup="true" aria-expanded="false">Serviços <span>&#9662;</span></button>'
      + '<div class="landing-dropdown" id="landing-dropdown-servicos-servico">' + SERVICOS.map(s => '<a href="#/servicos/' + s[0] + '">' + s[1] + '</a>').join('') + '</div>';
    rot.replaceWith(wrap);
    const bt = wrap.querySelector('button'), dd = wrap.querySelector('.landing-dropdown');
    const fechar = () => { dd.classList.remove('aberto'); bt.setAttribute('aria-expanded', 'false'); };
    bt.addEventListener('click', e => { e.stopPropagation(); const ab = dd.classList.toggle('aberto'); bt.setAttribute('aria-expanded', ab ? 'true' : 'false'); });
    dd.addEventListener('click', e => e.stopPropagation());
    dd.querySelectorAll('a').forEach(a => a.addEventListener('click', fechar));
    document.addEventListener('click', fechar);
    document.addEventListener('keydown', e => { if(e.key === 'Escape') fechar(); });
    window.addEventListener('hashchange', fechar);
  }

  /* ---------- rastreio da página anterior (E e I) ---------- */
  let origemServico = null, origemEquipe = null;
  const LANDING = /^#?\/?(inicio|contato)?$/;
  window.addEventListener('hashchange', ev => {
    const novo = location.hash, velho = ev.oldURL && ev.oldURL.indexOf('#') >= 0 ? ev.oldURL.slice(ev.oldURL.indexOf('#')) : '';
    if(novo.indexOf('#/servicos/') === 0 && velho.indexOf('#/servicos/') !== 0) origemServico = LANDING.test(velho) ? null : velho;
    if(novo === '#/admin/equipe' && velho !== '#/admin/equipe') origemEquipe = velho || null;
  });

  /* ---------- I. "← Voltar" da página de serviço ---------- */
  const voltar = document.getElementById('servico-voltar');
  if(voltar) voltar.addEventListener('click', e => {
    if(!origemServico) return;   /* veio da página inicial (ou do link direto): continua voltando aos cartões de serviços */
    e.stopImmediatePropagation();
    const alvo = origemServico; origemServico = null; window.__origemServico = null;
    location.hash = alvo;
  }, true);

  /* ---------- E. Equipe por link direto ---------- */
  if(typeof abrirEquipe === 'function'){
    const _abrirEquipe = abrirEquipe;
    abrirEquipe = function(){
      const vis = id => { const el = document.getElementById(id); return el && getComputedStyle(el).display !== 'none'; };
      if(sessaoAtual && !['tela-dashboard', 'main-app', 'tela-landing', 'tela-quem-somos', 'tela-equipe', 'tela-servico', 'tela-executivo', 'tela-noticias'].some(vis)){
        mostrarTela('dashboard'); mostrarPainelDash('educacao'); marcarRotaAtivaGlobal('educacao');
      }
      return _abrirEquipe.apply(this, arguments);
    };
  }
  const fecharEq = document.getElementById('equipe-fechar');
  if(fecharEq) fecharEq.addEventListener('click', () => {
    if(location.hash !== '#/admin/equipe') return;
    if(origemEquipe){ origemEquipe = null; history.back(); }
    else { history.replaceState(null, '', '#/educacao'); roteador(); }
  });

  /* ---------- F. lista Investimentos da Gestão com os 6 itens ---------- */
  const sub = document.getElementById('submenu-investimentos');
  if(sub && !sub.querySelector('[data-destino="leilao-veiculos"]')){
    const novo = (destino, texto) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-destino', destino); b.textContent = texto;
      b.addEventListener('click', () => voltarAoDashboardDoFiscal(destino)); return b; };
    const leilao = sub.querySelector('[data-destino="leilao"]'), imob = sub.querySelector('[data-destino="mercado-imobiliario"]');
    if(leilao) leilao.after(novo('leilao-veiculos', 'Leilão de automóveis'));
    if(imob) imob.after(novo('avaliacao-imoveis', 'Avaliação de imóveis'));
  }

  /* ---------- J e K: Mercado financeiro ---------- */
  if(typeof MF_SUBROTAS !== 'undefined') ['busca', 'eua/busca'].forEach(s => { if(MF_SUBROTAS.indexOf(s) === -1) MF_SUBROTAS.push(s); });
  if(typeof mfAbrirSubrota === 'function'){
    const _mfAbrir = mfAbrirSubrota;
    mfAbrirSubrota = function(s){
      if(s === 'noticias' || s === 'eua/noticias'){   /* J: troca sem criar entrada no histórico */
        history.replaceState(null, '', s === 'noticias' ? '#/noticias' : '#/noticias/eua'); roteador(); return;
      }
      if(s === 'busca'){ mfMostrarBuscaAvancadaAcoes(); mfGravarRota('busca'); return; }   /* K */
      if(s === 'eua/busca'){ mfMostrarBuscaInternacional(); mfGravarRota('eua/busca'); return; }
      return _mfAbrir.apply(this, arguments);
    };
  }
  document.querySelectorAll('.mf-link[data-acao="busca-acoes"], .mf-link[data-acao="busca-internacional"]').forEach(a => {
    a.addEventListener('click', () => setTimeout(() => mfGravarRota(a.getAttribute('data-acao') === 'busca-acoes' ? 'busca' : 'eua/busca'), 0));
  });
})();
