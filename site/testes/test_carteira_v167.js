// Teste da v167 (Carteira SOLIDUNS): página real + funções SQL reais da migration 182 (banco local t182).
// Preparar: Postgres local (socket /tmp, porta 54329) com o banco t182 = supabase/testes/stub_146_supabase.sql + public.eh_admin()
// (lê a configuração t.admin) + migration 182 + uma execução gravada pelo robô (selecao/robo_selecao.py --gravar).
// Servir a pasta publicar/ em http://localhost:8167 e guardar a v166 em /tmp/index_v166.html (comparação do cabeçalho).
// Rodar: node test_carteira_v167.js pasta_das_capturas
const { chromium } = require('playwright');
const { Client } = require('pg');
const SUPA = 'https://evcsniicnrlrtzpdmeza.supabase.co';
const BASE = 'http://localhost:8167/index.html';
const OUT = process.argv[2] || '.';
let falhas = 0;
const ok = (c, n) => { console.log((c ? 'OK  ' : 'FALHOU ') + n); if (!c) falhas++; };
const ADMIN = { uid: '11111111-1111-1111-1111-111111111111', email: 'dr.thiago.viegas@gmail.com', nome: 'Dr. Thiago Viegas', admin: true };
const ASSIN = { uid: '22222222-2222-2222-2222-222222222222', email: 'assinante@exemplo.com', nome: 'Assinante Teste', admin: false };

async function abrir(browser, quem, largura) {
  const ctx = await browser.newContext({ viewport: { width: largura || 1400, height: 950 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  const db = new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 't182' });
  await db.connect();
  await db.query(`select set_config('t.uid', $1, false), set_config('t.admin', $2, false)`, [quem.uid, quem.admin ? 'sim' : 'nao']);
  const sessao = { access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600e3, email: quem.email, nome: quem.nome, user: { id: quem.uid, email: quem.email } };
  await page.addInitScript(s => localStorage.setItem('gestao-fiscal-auth-session', s), JSON.stringify(sessao));
  const chamadas = [];
  await page.route(SUPA + '/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname.startsWith('/rest/v1/rpc/selecao_')) {
      const nome = url.pathname.split('/').pop(), corpo = req.postData() ? JSON.parse(req.postData()) : {};
      chamadas.push(nome);
      try {
        const r = nome === 'selecao_publicar'
          ? await db.query('select public.selecao_publicar($1::bigint, $2::boolean) r', [corpo.p_execucao_id, corpo.p_publicar])
          : await db.query('select public.selecao_carteira_publico() r');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].r) });
      } catch (e) { return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }); }
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
  const original = require('fs').readFileSync('/tmp/index_v166.html', 'utf8'), novo = require('fs').readFileSync('/home/claude/soliduns-coletores/site/publicar/index.html', 'utf8');
  const cabs = s => [...s.matchAll(/<header class="landing-header">[\s\S]*?<\/header>/g)].map(m => m[0]);
  ok(cabs(original).length > 3 && JSON.stringify(cabs(original)) === JSON.stringify(cabs(novo)), 'cabeçalhos e logo do site idênticos aos da v166');
  ok(!/\bIA\b|intelig[êe]ncia artificial/i.test(require('fs').readFileSync('/home/claude/soliduns-coletores/site/fontes/v167_carteira_soliduns.js', 'utf8')), 'nada de IA no código novo');

  // 1. administrador: prévia, publicar
  await (async () => {
    const { db } = { db: new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 't182' }) };
    await db.connect(); await db.query('update selecao_execucoes set publicado = false, publicado_em = null, publicado_por = null'); await db.end();
  })();
  let s = await abrir(browser, ADMIN);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro'); await s.page.waitForTimeout(2500);
  const menu = await s.page.evaluate(() => { const a = document.querySelector('[data-mercado="br"] [data-acao="carteira-soliduns"]'); return !!a && !document.querySelector('[data-mercado="us"] [data-acao="carteira-soliduns"]'); });
  ok(menu, 'item Carteira SOLIDUNS só no menu Ações do mercado brasileiro');
  await s.page.evaluate(() => document.querySelector('[data-mercado="br"] [data-acao="carteira-soliduns"]').click());
  await s.page.waitForSelector('#sc-carteira table', { timeout: 8000 }).catch(() => {});
  ok(await s.page.evaluate(() => location.hash.endsWith('/carteira-soliduns')), 'endereço da página: ' + await s.page.evaluate(() => location.hash));
  ok(await s.page.evaluate(() => document.title.startsWith('Carteira SOLIDUNS')), 'título da aba');
  const linhas = await s.page.$$eval('#sc-carteira tbody tr', t => t.length);
  ok(linhas === 15, 'carteira atual com 15 ações (' + linhas + ')');
  const pesos = await s.page.$$eval('#sc-carteira tbody tr td:nth-child(5) b', t => t.map(x => parseFloat(x.textContent.replace(',', '.'))));
  ok(Math.abs(pesos.reduce((a, b) => a + b, 0) - 100) < 0.6, 'pesos somam 100% (' + pesos.reduce((a, b) => a + b, 0).toFixed(1) + ')');
  ok(await s.page.isVisible('[data-sc-publicar="1"]'), 'administrador vê PRÉVIA e botão Publicar');
  ok(await s.page.isVisible('.sc-avisos'), 'administrador vê os avisos da execução');
  const abas = await s.page.$$eval('.sc-aba', t => t.map(x => x.textContent));
  ok(abas.length === 3 && /Flávio Bolsonaro \(D\)/.test(abas[1]) && /Lula \(E\)/.test(abas[2]), 'três abas: ' + abas.join(' | '));
  await s.page.screenshot({ path: OUT + '/v167_admin_previa.png', fullPage: false });
  await s.page.click('.sc-aba[data-sc-aba="1"]'); await s.page.waitForTimeout(300);
  ok(await s.page.$$eval('#sc-carteira tbody tr', t => t.length) === 15 && await s.page.isVisible('.sc-aba.ativa[data-sc-aba="1"]'), 'aba "Se vencer D" troca a tabela');
  await s.page.click('#sc-ranking summary'); await s.page.waitForSelector('#sc-rk-corpo tr');
  const nrk = await s.page.$$eval('#sc-rk-corpo tr', t => t.length);
  ok(nrk === 84, 'ranking completo com 84 ações (' + nrk + ')');
  await s.page.fill('#sc-rk-busca', 'itau'); await s.page.waitForTimeout(200);
  const busca = await s.page.$$eval('#sc-rk-corpo tr .rx-tk', t => t.map(x => x.textContent));
  ok(busca.length >= 2 && busca.every(t => /ITUB|ITSA/.test(t)), 'busca sem acento acha Itaú: ' + busca.join(','));
  await s.page.fill('#sc-rk-busca', ''); await s.page.click('#sc-ranking th[data-sc-ord="igov"]'); await s.page.waitForTimeout(200);
  const ig = await s.page.$$eval('#sc-rk-corpo tr td:nth-child(8)', t => t.slice(0, 5).map(x => Number(x.textContent)));
  ok(ig.every((v, i) => i === 0 || v <= ig[i - 1]), '1º clique em Governança ordena do maior para o menor: ' + ig.join(','));
  await s.page.click('#sc-ranking th[data-sc-ord="igov"]'); await s.page.waitForTimeout(150);
  const ig2 = await s.page.$$eval('#sc-rk-corpo tr td:nth-child(8)', t => t.slice(0, 5).map(x => Number(x.textContent)));
  ok(ig2.every((v, i) => i === 0 || v >= ig2[i - 1]), '2º clique inverte a ordem: ' + ig2.join(','));
  await s.page.screenshot({ path: OUT + '/v167_admin_ranking.png', fullPage: false });
  await s.page.click('[data-sc-publicar="1"]'); await s.page.waitForSelector('[data-sc-publicar="0"]', { timeout: 5000 }).catch(() => {});
  ok(await s.page.isVisible('[data-sc-publicar="0"]') && /publicada/i.test(await s.page.textContent('#sc-admin-msg')), 'publicar: vira "Publicada" com botão Retirar');
  const pub = (await s.db.query('select publicado, publicado_por from selecao_execucoes')).rows[0];
  ok(pub.publicado === true && pub.publicado_por === 'dr.thiago.viegas@gmail.com', 'banco: publicada por ' + pub.publicado_por);
  ok(s.erros.filter(e => /^sc|selecao|carteira|v167/i.test(e)).length === 0, 'sem erros do módulo novo' + (s.erros.length ? ' (outros erros da página: ' + s.erros.length + ')' : ''));
  if (s.erros.length) console.log('   erros da página:', s.erros.slice(0, 5).map(e => e.slice(0, 120)));
  await s.db.end(); await s.ctx.close();

  // 2. assinante: vê a publicada, sem prévia, sem avisos, sem botão
  s = await abrir(browser, ASSIN);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro/carteira-soliduns'); await s.page.waitForSelector('#sc-carteira table', { timeout: 10000 }).catch(() => {});
  ok(await s.page.$$eval('#sc-carteira tbody tr', t => t.length) === 15, 'assinante abre pelo endereço direto e vê a carteira publicada');
  ok(!(await s.page.$('[data-sc-publicar]')) && !(await s.page.$('.sc-avisos')) && !(await s.page.$('.rx-previa')), 'assinante: sem prévia, sem avisos, sem botão');
  await s.page.screenshot({ path: OUT + '/v167_assinante.png', fullPage: true });
  await s.db.end(); await s.ctx.close();

  // 3. nada publicado: estado vazio
  { const c = new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 't182' }); await c.connect(); await c.query('update selecao_execucoes set publicado = false'); await c.end(); }
  s = await abrir(browser, ASSIN);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro/carteira-soliduns'); await s.page.waitForSelector('#sc-conteudo .rx-vazio', { timeout: 10000 }).catch(() => {});
  ok(await s.page.isVisible('#sc-conteudo .rx-vazio'), 'assinante sem carteira publicada: "Carteira em preparação"');
  await s.db.end(); await s.ctx.close();

  // 4. celular
  { const c = new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 't182' }); await c.connect(); await c.query('update selecao_execucoes set publicado = true'); await c.end(); }
  s = await abrir(browser, ASSIN, 390);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro/carteira-soliduns'); await s.page.waitForSelector('#sc-carteira table', { timeout: 10000 }).catch(() => {});
  const larg = await s.page.evaluate(() => document.documentElement.scrollWidth);
  ok(larg <= 392, 'celular (390 px): sem rolagem horizontal da página (' + larg + ' px; a tabela rola dentro da própria caixa)');
  await s.page.screenshot({ path: OUT + '/v167_celular.png', fullPage: false });
  await s.db.end(); await s.ctx.close();

  // 5. outra página do menu continua funcionando depois da carteira (Radar)
  s = await abrir(browser, ADMIN);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro/carteira-soliduns'); await s.page.waitForSelector('#sc-carteira table', { timeout: 10000 }).catch(() => {});
  await s.page.evaluate(() => document.querySelector('[data-mercado="br"] [data-acao="radar-exponencial"]').click()); await s.page.waitForTimeout(1500);
  ok(await s.page.evaluate(() => location.hash.endsWith('/radar') && !document.getElementById('sc-conteudo')), 'Radar abre normalmente depois da Carteira');
  await s.db.end(); await s.ctx.close();

  await browser.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
})();
