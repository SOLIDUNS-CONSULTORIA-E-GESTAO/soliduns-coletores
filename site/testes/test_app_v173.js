// Teste da v173 (a plataforma como app no celular): perfil iPhone 14 do Playwright (tela, toque e identificação do
// Safari do iPhone), modo Safari e modo app (tela cheia), service worker sem conexão, Android (Instalar) e computador.
// O teste liga e desliga o próprio servidor (porta 8174) para simular a falta de conexão. Guardar guardar a v172 em /tmp/index_v172.html. Rodar: node test_app_v173.js pasta
const { chromium, devices } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8174';
const { spawn } = require('child_process');
let servidor = null;
const ligar = () => { servidor = spawn('python3', ['-m', 'http.server', '8174'], { cwd: '/home/claude/soliduns-coletores/site/publicar', stdio: 'ignore' }); return new Promise(r => setTimeout(r, 900)); };
const desligar = () => new Promise(r => { servidor.on('exit', r); servidor.kill(); });
const OUT = process.argv[2] || '.';
const PUB = '/home/claude/soliduns-coletores/site/publicar';
let falhas = 0;
const ok = (c, n) => { console.log((c ? 'OK  ' : 'FALHOU ') + n); if (!c) falhas++; };
const SESSAO = { access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600e3, email: 'a@b.com', nome: 'Assinante Teste', user: { id: '22222222-2222-2222-2222-222222222222', email: 'a@b.com' } };

async function abrir(browser, o) {
  o = Object.assign({ perfil: devices['iPhone 14'], app: false, logado: true, rota: '#/' }, o || {});
  const ctx = await browser.newContext({ ...o.perfil });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  if (o.logado) await page.addInitScript(x => { try { localStorage.setItem('gestao-fiscal-auth-session', x); } catch (e) {} }, JSON.stringify(SESSAO));
  if (o.app) await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  await ctx.route('https://evcsniicnrlrtzpdmeza.supabase.co/**', r => { const u = new URL(r.request().url());
    if (u.pathname === '/rest/v1/acessos') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ status: 'aprovado', perfil: 'usuario', nome: 'Assinante Teste' }]) });
    if (/cpf/i.test(u.search)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[{"cpf":"52998224725"}]' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: u.pathname.startsWith('/rest/v1/rpc/') ? 'null' : '[]' }); });
  await ctx.route(/^https:\/\/(?!evcsniicnrlrtzpdmeza).*/, r => r.abort());
  await page.goto(BASE + '/index.html' + o.rota);
  await page.waitForTimeout(1200);
  return { ctx, page, erros };
}
const tamanho = f => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

(async () => {
  await ligar();
  const browser = await chromium.launch();
  const original = fs.readFileSync('/tmp/index_v172.html', 'utf8'), novo = fs.readFileSync(PUB + '/index.html', 'utf8');
  const cabs = s => [...s.matchAll(/<header class="landing-header">[\s\S]*?<\/header>/g)].map(m => m[0]);
  ok(cabs(original).length > 3 && JSON.stringify(cabs(original)) === JSON.stringify(cabs(novo)), 'cabeçalhos e logo do site idênticos aos da v172');
  ok(fs.readFileSync(PUB + '/logo-soliduns.png').equals(fs.readFileSync('/home/claude/soliduns-coletores/site/publicar/logo-soliduns.png')) && /<link rel="icon" type="image\/png" href="\/logo-soliduns.png">/.test(novo), 'logo e ícone da aba do navegador inalterados');
  const fonte = fs.readFileSync('/home/claude/soliduns-coletores/site/fontes/v173_app.js', 'utf8') + fs.readFileSync(PUB + '/sw.js', 'utf8');
  ok(!/\bIA\b|intelig[êe]ncia artificial|telegram/i.test(fonte), 'nada de IA nem de Telegram no código novo');

  // manifest e arquivos do app
  const man = JSON.parse(fs.readFileSync(PUB + '/manifest.webmanifest', 'utf8'));
  ok(man.display === 'standalone' && man.start_url === '/?app=1' && man.icons.length === 3, 'manifest: tela cheia, endereço de início e 3 ícones');
  ok(man.icons.every(i => { const [w, h] = tamanho(PUB + i.src); return i.sizes === w + 'x' + h; }) && tamanho(PUB + '/app/icone-180.png').join('x') === '180x180', 'ícones com os tamanhos declarados (180, 192, 512)');
  const telas = [...novo.matchAll(/apple-touch-startup-image" href="([^"]+)" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\)/g)];
  ok(telas.length === 11 && telas.every(t => { const [w, h] = tamanho(PUB + t[1]); return w === t[2] * t[4] && h === t[3] * t[4]; }), '11 telas de abertura do iPhone, cada uma no tamanho exato da tela');

  // iPhone no Safari
  let s = await abrir(browser, { logado: false });
  ok(/maximum-scale=1/.test(await s.page.getAttribute('meta[name="viewport"]', 'content')), 'iPhone: sem zoom automático ao tocar num campo');
  ok(await s.page.evaluate(() => document.documentElement.classList.contains('modo-ios') && !document.documentElement.classList.contains('modo-app')), 'iPhone no Safari: reconhecido, fora do modo app');
  ok(!(await s.page.isVisible('#dica-esc')), 'dica "ESC volta" escondida na tela de toque');
  ok(await s.page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!r)), 'service worker registrado');
  await s.page.waitForSelector('#app-aviso', { timeout: 6000 }).catch(() => {});
  const aviso = (await s.page.textContent('#app-aviso').catch(() => '')) || '';
  ok(/Instale o app SOLIDUNS no iPhone/.test(aviso) && /Adicionar à Tela de Início/.test(aviso), 'aviso de instalação no iPhone: ' + aviso.replace(/\s+/g, ' ').slice(0, 120));
  await s.page.screenshot({ path: OUT + '/v173_aviso_iphone.png' });
  await s.page.click('#app-aviso .app-nao');
  ok(!(await s.page.$('#app-aviso')), '"Agora não" fecha o aviso');
  await s.page.reload(); await s.page.waitForTimeout(5000);
  ok(!(await s.page.$('#app-aviso')), 'o aviso não volta depois de "Agora não"');
  // sem conexão: a página principal guardada abre; outra página mostra o aviso
  await desligar();                                   // sem servidor = sem conexão (o service worker não acha a rede)
  await s.page.reload().catch(() => {}); await s.page.waitForTimeout(800);
  ok(/SOLIDUNS/.test(await s.page.title()) && await s.page.$('#mf-barra') !== null, 'sem conexão: a plataforma abre a cópia guardada');
  await s.page.goto(BASE + '/noticias/').catch(() => {}); await s.page.waitForTimeout(500);
  ok(/Sem conexão com a internet/.test(await s.page.textContent('body').catch(() => '')), 'sem conexão em outra página: aviso "Sem conexão com a internet"');
  await s.page.screenshot({ path: OUT + '/v173_sem_conexao.png' });
  await ligar();
  await s.ctx.close();

  // iPhone no modo app (aberto pela tela inicial)
  s = await abrir(browser, { app: true, rota: '#/investimentos' });
  ok(await s.page.evaluate(() => document.documentElement.classList.contains('modo-app')), 'modo app reconhecido');
  await s.page.waitForTimeout(4500);
  ok(!(await s.page.$('#app-aviso')), 'no modo app não aparece o aviso de instalação');
  ok(await s.page.isVisible('.app-voltar'), 'botão Voltar visível no modo app fora da página inicial');
  await s.page.evaluate(() => { location.hash = '#/investimentos/mercado-financeiro'; }); await s.page.waitForTimeout(1200);
  await s.page.screenshot({ path: OUT + '/v173_modo_app.png' });
  await s.page.click('.app-voltar'); await s.page.waitForTimeout(1000);
  ok(/^#\/investimentos\/?$/.test(await s.page.evaluate(() => location.hash)), 'Voltar retorna à tela anterior: ' + await s.page.evaluate(() => location.hash));
  await s.page.click('.app-voltar'); await s.page.waitForTimeout(1000);
  ok(['#/', ''].includes(await s.page.evaluate(() => location.hash)) && !(await s.page.isVisible('.app-voltar')), 'na página inicial o botão Voltar some');
  ok(s.erros.length === 0, 'sem erros na página' + (s.erros.length ? ': ' + s.erros.slice(0, 2).join(' / ') : ''));
  await s.ctx.close();

  // Android (Chrome): botão Instalar
  s = await abrir(browser, { perfil: devices['Pixel 7'], logado: false });
  ok(!/maximum-scale/.test(await s.page.getAttribute('meta[name="viewport"]', 'content')), 'Android: zoom normal (regra só do iPhone)');
  await s.page.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__pediu = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  await s.page.waitForTimeout(300);
  ok(/Instalar/.test(await s.page.textContent('#app-aviso').catch(() => '')), 'Android: aviso com o botão Instalar');
  await s.page.click('#app-aviso .app-sim'); await s.page.waitForTimeout(300);
  ok(await s.page.evaluate(() => window.__pediu === true) && !(await s.page.$('#app-aviso')), 'Android: "Instalar" abre a instalação do Chrome');
  await s.ctx.close();

  // computador: nada muda
  s = await abrir(browser, { perfil: { viewport: { width: 1400, height: 900 } }, logado: false });
  await s.page.waitForTimeout(4200);
  ok(!(await s.page.$('#app-aviso')) && !/maximum-scale/.test(await s.page.getAttribute('meta[name="viewport"]', 'content')) && await s.page.isVisible('#dica-esc'),
     'computador: sem aviso, zoom normal e dica "ESC volta" mantida');
  await s.ctx.close();

  // todas as áreas no iPhone: sem rolagem para os lados
  s = await abrir(browser, { logado: true });
  const rotas = ['#/', '#/educacao', '#/investimentos', '#/investimentos/mercado-financeiro', '#/investimentos/mercado-financeiro/opcoes', '#/leilao', '#/leilao-veiculos',
    '#/mercado-imobiliario', '#/avaliacao-imoveis', '#/gestao-financeira', '#/gestao-fiscal', '#/calculadoras', '#/investimentos/empresas'];
  const largas = [];
  for (const r of rotas) { await s.page.evaluate(h => { location.hash = h; }, r); await s.page.waitForTimeout(700);
    const w = await s.page.evaluate(() => document.documentElement.scrollWidth); if (w > 392) largas.push(r + ' ' + w); }
  ok(largas.length === 0, 'iPhone: nenhuma das ' + rotas.length + ' áreas rola para os lados' + (largas.length ? ' — ' + largas.join(', ') : ''));
  await s.ctx.close();

  await browser.close();
  await desligar();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
})();
