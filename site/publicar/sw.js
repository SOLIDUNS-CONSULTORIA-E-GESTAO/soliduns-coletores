/* SOLIDUNS — service worker do app (v173, 23/10/2026).
   Regras, de propósito conservadoras para nunca prender uma versão velha do site:
   - página principal: sempre da internet primeiro; a cópia guardada só aparece sem conexão;
   - arquivos /assets/sol-*.js e .css (o nome muda a cada versão): guardados depois da 1ª leitura;
   - ícones do app: guardados;
   - todo o resto (banco de dados, notícias, fontes, outros sites): passa direto, sem guardar nada. */
const VERSAO = 'soliduns-app-v173';
const SEM_REDE = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>SOLIDUNS — sem conexão</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#e8e4d8;'
  + 'font-family:-apple-system,system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}img{width:96px;height:96px;margin-bottom:18px}'
  + 'h1{font-size:19px;margin:0 0 8px;color:#f0c419}p{font-size:15px;line-height:1.5;margin:0 0 20px;color:#b9b3a3}button{font:inherit;font-weight:600;'
  + 'background:#f0c419;color:#000;border:0;border-radius:8px;padding:12px 22px}</style></head><body><div><img src="/app/icone-192.png" alt="">'
  + '<h1>Sem conexão com a internet</h1><p>A SOLIDUNS precisa de internet para mostrar os dados atualizados.<br>Confira o Wi-Fi ou os dados móveis.</p>'
  + '<button onclick="location.reload()">Tentar de novo</button></div></body></html>';

/* guarda no máximo 60 arquivos: os mais antigos saem primeiro (versões velhas do site) */
function aparar(c){
  return c.keys().then(ks => { const extra = ks.filter(k => new URL(k.url).pathname.indexOf('/assets/') === 0).length - 60;
    return extra > 0 ? Promise.all(ks.filter(k => new URL(k.url).pathname.indexOf('/assets/') === 0).slice(0, extra).map(k => c.delete(k))) : null; });
}
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(['/app/icone-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.indexOf('soliduns-app-') === 0 && k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;
  const principal = req.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html');
  if(principal){
    e.respondWith(fetch(req).then(r => {
      if(r && r.ok){ const copia = r.clone(); caches.open(VERSAO).then(c => c.put('/', copia)); }
      return r;
    }).catch(() => caches.match('/').then(c => c || new Response(SEM_REDE, {headers: {'Content-Type': 'text/html; charset=utf-8'}}))));
    return;
  }
  if(req.mode === 'navigate'){
    e.respondWith(fetch(req).catch(() => new Response(SEM_REDE, {headers: {'Content-Type': 'text/html; charset=utf-8'}})));
    return;
  }
  if(/^\/assets\/sol-[0-9a-f]{10}\.(js|css)$/.test(url.pathname) || url.pathname.indexOf('/app/') === 0){
    e.respondWith(caches.open(VERSAO).then(c => c.match(req).then(g => g || fetch(req).then(r => {
      if(r && r.ok) c.put(req, r.clone()).then(() => aparar(c));
      return r;
    }))));
  }
});
