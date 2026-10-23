/* ===== v173: SOLIDUNS NO CELULAR COMO APP (iPhone pelo Safari: "Adicionar à Tela de Início"; Android pelo Chrome) =====
   Sem loja de aplicativos e sem conta de desenvolvedor da Apple: o próprio site vira app, com ícone na tela inicial,
   tela de abertura e abertura em tela cheia (manifest.webmanifest, ícones e telas em /app/, service worker /sw.js).
   Este módulo:
     1. registra o service worker (a página vem sempre da internet; a cópia guardada só aparece sem conexão);
     2. no iPhone e no iPad, não deixa o Safari dar zoom sozinho ao tocar num campo (o zoom com os dedos continua);
     3. mostra, uma vez, como instalar o app (iPhone: Compartilhar › Adicionar à Tela de Início; Android: botão Instalar);
     4. no modo app (sem a barra do Safari), põe um botão Voltar no canto de baixo e marca <html class="modo-app">;
     5. telas de toque: áreas de toque maiores nos botões pequenos e sem a dica "ESC volta" (é de teclado).
   Cabeçalho e logo do site: intocados. */
(function(){
  if(window.__appV173) return;
  window.__appV173 = true;
  const ua = navigator.userAgent || '';
  const ios = /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const app = window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const toque = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const raiz = document.documentElement;
  if(app) raiz.classList.add('modo-app');
  if(ios) raiz.classList.add('modo-ios');
  if(toque) raiz.classList.add('modo-toque');

  /* 1. service worker */
  if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', {scope: '/'}).catch(() => {}); });
  }

  /* 2. sem zoom automático ao tocar num campo (iPhone/iPad): o iOS respeita maximum-scale só para o zoom automático */
  if(ios){
    const vp = document.querySelector('meta[name="viewport"]');
    if(vp && !/maximum-scale/.test(vp.content)) vp.setAttribute('content', vp.content + ', maximum-scale=1');
  }

  /* 5. estilos de toque e do modo app */
  const st = document.createElement('style'); st.id = 'app-estilo-v173';
  st.textContent = ''
    + 'html{-webkit-text-size-adjust:100%; text-size-adjust:100%;}'
    + 'html.modo-toque a, html.modo-toque button, html.modo-toque select, html.modo-toque label{touch-action:manipulation;}'
    + 'html.modo-toque #dica-esc{display:none !important;}'
    + 'html.modo-toque .screener-help{min-width:30px; min-height:30px;}'
    + 'html.modo-toque .voltar-link{padding-top:10px; padding-bottom:10px;}'
    + 'html.modo-toque .leilao-limpar-filtros{padding-top:9px; padding-bottom:9px;}'
    + 'html.modo-toque .cotacoes-item a.tk-rel{display:inline-block; padding:6px 0;}'
    + 'html.modo-toque .cotacoes-vertodos{padding-top:10px; padding-bottom:10px;}'
    + '.app-aviso{position:fixed; left:12px; right:12px; bottom:calc(12px + env(safe-area-inset-bottom, 0px)); z-index:10050; background:#111109;'
    + ' border:1px solid var(--gold, #f0c419); border-radius:12px; padding:14px 14px 12px; box-shadow:0 10px 30px rgba(0,0,0,.6); color:var(--text, #e8e4d8);'
    + ' font-size:14px; line-height:1.45; max-width:520px; margin:0 auto; display:flex; gap:12px; align-items:flex-start; text-align:left;}'
    + '.app-aviso img{width:46px; height:46px; border-radius:10px; flex:0 0 auto;}'
    + '.app-aviso b{display:block; color:var(--gold, #f0c419); font-size:14.5px; margin-bottom:3px;}'
    + '.app-aviso .app-compartilhar{display:inline-block; width:15px; height:18px; vertical-align:-3px; margin:0 2px;}'
    + '.app-aviso .app-acoes{display:flex; gap:8px; margin-top:10px;}'
    + '.app-aviso button{font:inherit; font-size:13.5px; font-weight:600; border-radius:8px; padding:9px 14px; cursor:pointer;}'
    + '.app-aviso .app-sim{background:var(--gold, #f0c419); color:#000; border:0;}'
    + '.app-aviso .app-nao{background:transparent; color:var(--text, #e8e4d8); border:1px solid var(--line, #333);}'
    + '.app-voltar{position:fixed; left:14px; bottom:calc(14px + env(safe-area-inset-bottom, 0px)); z-index:10040; width:46px; height:46px; border-radius:50%;'
    + ' background:rgba(17,17,9,.92); border:1px solid var(--gold, #f0c419); color:var(--gold, #f0c419); font-size:24px; line-height:1; display:none;'
    + ' align-items:center; justify-content:center; box-shadow:0 6px 18px rgba(0,0,0,.5); padding:0 3px 2px 0; cursor:pointer;}'
    + 'html.modo-app .app-voltar.visivel{display:flex;}';
  document.head.appendChild(st);

  /* 3. como instalar (uma vez; "Agora não" esconde por 30 dias) */
  const CHAVE = 'sol-app-aviso-v173';
  const ler = () => { try{ return Number(localStorage.getItem(CHAVE) || 0); }catch(e){ return 0; } };
  const adiar = () => { try{ localStorage.setItem(CHAVE, String(Date.now())); }catch(e){} };
  const recente = () => Date.now() - ler() < 30 * 86400000;
  const navegadorEmbutido = /CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|Line\/|WhatsApp|GSA\//.test(ua);
  const ICONE_COMPARTILHAR = '<svg class="app-compartilhar" viewBox="0 0 15 18" aria-label="Compartilhar"><path d="M7.5 1v10M4 4.5L7.5 1 11 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M5 7.5H2.5v9h10v-9H10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  function aviso(html, acoes){
    if(document.getElementById('app-aviso')) return;
    const d = document.createElement('div'); d.id = 'app-aviso'; d.className = 'app-aviso'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Instalar o app SOLIDUNS');
    d.innerHTML = '<img src="/app/icone-180.png" alt=""><div>' + html + '<div class="app-acoes">' + acoes + '</div></div>';
    document.body.appendChild(d);
    d.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if(!b) return;
      if(b.classList.contains('app-nao')){ adiar(); d.remove(); }
    });
    return d;
  }
  if(!app && !recente()){
    if(ios && /Safari/.test(ua) && !navegadorEmbutido){
      setTimeout(() => aviso('<b>Instale o app SOLIDUNS no ' + (/iPad/.test(ua) || !/iPhone|iPod/.test(ua) ? 'iPad' : 'iPhone') + '</b>'
        + 'Toque em ' + ICONE_COMPARTILHAR + ' <b style="display:inline; color:inherit;">Compartilhar</b>, na barra do Safari, e depois em '
        + '<b style="display:inline; color:inherit;">Adicionar à Tela de Início</b>.', '<button type="button" class="app-nao">Agora não</button>'), 4000);
    }
    window.addEventListener('beforeinstallprompt', ev => {   /* Android (Chrome): instalação com um toque */
      ev.preventDefault();
      const pedido = ev;
      const d = aviso('<b>Instale o app SOLIDUNS</b>Abra a plataforma direto da tela inicial, em tela cheia.',
                      '<button type="button" class="app-sim">Instalar</button><button type="button" class="app-nao">Agora não</button>');
      if(d) d.querySelector('.app-sim').addEventListener('click', () => { pedido.prompt(); pedido.userChoice.finally(() => { adiar(); d.remove(); }); });
    });
  }

  /* 4. botão Voltar no modo app (no app não há a barra do Safari) */
  if(app){
    let passos = 0;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'app-voltar'; b.setAttribute('aria-label', 'Voltar'); b.innerHTML = '&#8249;';
    const atualizar = () => { const h = location.hash || ''; b.classList.toggle('visivel', !(h === '' || h === '#' || h === '#/')); };
    window.addEventListener('hashchange', () => { passos++; atualizar(); });
    b.addEventListener('click', () => {
      if(passos > 0){ passos = Math.max(0, passos - 2); history.back(); }
      else location.hash = '#/';
    });
    const pronto = () => { document.body.appendChild(b); atualizar(); };
    if(document.body) pronto(); else document.addEventListener('DOMContentLoaded', pronto);
  }
})();
