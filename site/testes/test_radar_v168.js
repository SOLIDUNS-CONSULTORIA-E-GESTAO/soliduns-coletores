// Teste da v168 (Radar de Ações Exponenciais, Score v1.0.5): página real + função SQL real (migrations 140 e 183, banco t183).
// Preparar: Postgres local (socket /tmp, porta 54329) com o banco t183 = stub_146 + 140 + 183 + ranking gravado pelo
// coletor/score_publicar.py (--json) e duas linhas de acompanhamento. Servir publicar/ em http://localhost:8168 e guardar
// a v167 em /tmp/index_v167.html. Rodar: node test_radar_v168.js pasta_das_capturas
const { chromium } = require('playwright');
const { Client } = require('pg');
const fs = require('fs');
const SUPA = 'https://evcsniicnrlrtzpdmeza.supabase.co';
const BASE = 'http://localhost:8168/index.html';
const OUT = process.argv[2] || '.';
let falhas = 0;
const ok = (c, n) => { console.log((c ? 'OK  ' : 'FALHOU ') + n); if (!c) falhas++; };
const ADMIN = { uid: '11111111-1111-1111-1111-111111111111', email: 'dr.thiago.viegas@gmail.com', nome: 'Dr. Thiago Viegas', editor: true };
const ASSIN = { uid: '22222222-2222-2222-2222-222222222222', email: 'assinante@exemplo.com', nome: 'Assinante Teste', editor: false };

async function abrir(browser, quem, largura) {
  const ctx = await browser.newContext({ viewport: { width: largura || 1400, height: 950 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  const db = new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 't183' });
  await db.connect();
  await db.query(`select set_config('t.uid', $1, false), set_config('t.editor', $2, false)`, [quem.uid, quem.editor ? 'sim' : 'nao']);
  const sessao = { access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600e3, email: quem.email, nome: quem.nome, user: { id: quem.uid, email: quem.email } };
  await page.addInitScript(s => localStorage.setItem('gestao-fiscal-auth-session', s), JSON.stringify(sessao));
  const chamadas = [];
  await page.route(SUPA + '/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/rest/v1/rpc/radar_exponencial_publico') {
      const corpo = req.postData() ? JSON.parse(req.postData()) : {};
      chamadas.push(corpo.p_mercado);
      try { const r = await db.query('select public.radar_exponencial_publico($1) r', [corpo.p_mercado]);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].r) }); }
      catch (e) { return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }); }
    }
    if (url.pathname.startsWith('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'tok2', refresh_token: 'r2', expires_in: 3600 }) });
    if (/cpf/i.test(url.search)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ cpf: '52998224725' }]) });
    if (url.pathname === '/rest/v1/acessos') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ status: 'aprovado', perfil: 'usuario', nome: quem.nome }]) });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  return { ctx, page, erros, db, chamadas };
}

(async () => {
  const browser = await chromium.launch();
  const original = fs.readFileSync('/tmp/index_v167.html', 'utf8'), novo = fs.readFileSync('/home/claude/soliduns-coletores/site/publicar/index.html', 'utf8');
  const cabs = s => [...s.matchAll(/<header class="landing-header">[\s\S]*?<\/header>/g)].map(m => m[0]);
  ok(cabs(original).length > 3 && JSON.stringify(cabs(original)) === JSON.stringify(cabs(novo)), 'cabeçalhos e logo do site idênticos aos da v167');
  const fonte = fs.readFileSync('/home/claude/soliduns-coletores/site/fontes/v168_radar_exponencial.js', 'utf8');
  ok(!/\bIA\b|intelig[êe]ncia artificial|telegram/i.test(fonte), 'nada de IA nem de Telegram no código novo');

  // 1. administrador: prévia com o ranking, aviso de calibração e acompanhamento
  let s = await abrir(browser, ADMIN);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro/radar'); await s.page.waitForSelector('#rx-corpo tr', { timeout: 10000 }).catch(() => {});
  ok(await s.page.evaluate(() => document.querySelectorAll('.rx-pilar h4').length === 4 && /Qualidade e valor/.test(document.querySelector('.rx-pilares').textContent)), 'quatro pilares da metodologia v1.0.5');
  ok(await s.page.isVisible('.rx-previa') && await s.page.isVisible('.rx-calib'), 'administrador vê PRÉVIA e o aviso "Ranking em calibração"');
  const n = await s.page.$$eval('#rx-corpo tr', t => t.length);
  ok(n === 154, 'ranking completo com 154 ações (' + n + ')');
  const cab = await s.page.$$eval('.rx-tabela thead th', t => t.map(x => x.textContent));
  ok(cab.includes('Qualidade e valor') && cab.includes('Momento fundamental') && cab.includes('Risco e confluência'), 'colunas dos 4 pilares');
  const sc = await s.page.$$eval('#rx-corpo tr td:nth-child(10) b', t => t.map(x => Number(x.textContent)));
  ok(sc.every((v, i) => i === 0 || v <= sc[i - 1]), 'ordem decrescente de Score');
  await s.page.check('#rx-cart'); await s.page.waitForTimeout(200);
  const nc = await s.page.$$eval('#rx-corpo tr', t => t.length);
  ok(nc === 45, 'filtro "Só a carteira do Radar": 45 ações (' + nc + ')');
  ok(/45 na carteira do Radar/.test(await s.page.textContent('#rx-info')) && /metodologia 1\.0\.5/.test(await s.page.textContent('#rx-info')), 'linha de informação: ' + await s.page.textContent('#rx-info'));
  await s.page.uncheck('#rx-cart'); await s.page.fill('#rx-busca', 'itau'); await s.page.waitForTimeout(200);
  const busca = await s.page.$$eval('#rx-corpo tr .rx-tk', t => t.map(x => x.textContent));
  ok(busca.length >= 1 && busca.every(t => /ITUB|ITSA/.test(t)), 'busca sem acento acha Itaú: ' + busca.join(','));
  await s.page.fill('#rx-busca', '');
  const ac = await s.page.$$eval('.rx-acomp tbody tr', t => t.map(x => x.textContent));
  ok(ac.length === 2 && /11\/2026/.test(ac[0]) && /\+2,00%/.test(ac[0]), 'acompanhamento em tempo real: ' + ac.join(' | '));
  await s.page.screenshot({ path: OUT + '/v168_admin.png', fullPage: false });
  ok(s.erros.filter(e => /rx|radar|v168/i.test(e)).length === 0, 'sem erros do módulo novo' + (s.erros.length ? ' (outros erros da página: ' + s.erros.length + ')' : ''));
  await s.db.end(); await s.ctx.close();

  // 2. assinante: nada publicado → só "Ranking em calibração", sem tabela e sem acompanhamento
  s = await abrir(browser, ASSIN);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro/radar'); await s.page.waitForSelector('.rx-calib', { timeout: 10000 }).catch(() => {});
  ok(await s.page.isVisible('.rx-calib') && !(await s.page.$('#rx-corpo')) && !(await s.page.$('.rx-acomp')) && !(await s.page.$('.rx-previa')), 'assinante vê só "Ranking em calibração"');
  ok(/34,6%/.test(await s.page.textContent('.rx-calib')) && /55,6%/.test(await s.page.textContent('.rx-calib')), 'aviso traz o resultado do teste');
  await s.page.screenshot({ path: OUT + '/v168_assinante.png', fullPage: false });
  await s.db.end(); await s.ctx.close();

  // 3. mercado americano
  s = await abrir(browser, ADMIN);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro/eua/radar'); await s.page.waitForSelector('.rx-calib', { timeout: 10000 }).catch(() => {});
  ok(/mercado americano ainda não tem metodologia/.test(await s.page.textContent('.rx-calib') || ''), 'mercado americano: calibração sem metodologia');
  await s.db.end(); await s.ctx.close();

  // 4. celular
  s = await abrir(browser, ADMIN, 390);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro/radar'); await s.page.waitForSelector('#rx-corpo tr', { timeout: 10000 }).catch(() => {});
  const larg = await s.page.evaluate(() => document.documentElement.scrollWidth);
  ok(larg <= 392, 'celular (390 px): sem rolagem horizontal da página (' + larg + ' px)');
  await s.page.screenshot({ path: OUT + '/v168_celular.png', fullPage: false });
  await s.db.end(); await s.ctx.close();

  await browser.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
})();
