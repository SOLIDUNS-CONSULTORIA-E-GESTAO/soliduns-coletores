// Teste da v171 (Alvos SOLIDUNS): página real + funções SQL reais da migration 186 (banco local t182).
// Preparar: Postgres local (socket /tmp, porta 54329) com o banco t182 = supabase/testes/stub_146_supabase.sql + public.eh_admin()
// (lê a configuração t.admin) + migrations 182 e 186 + uma execução gravada pelo robô (selecao/robo_selecao.py --gravar).
// Servir a pasta publicar/ em http://localhost:8167 e guardar a v170 em /tmp/index_v170.html (comparação do cabeçalho).
// Rodar: node test_alvos_v171.js pasta_das_capturas
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
    if (url.pathname.startsWith('/rest/v1/rpc/alvos_')) {
      const nome = url.pathname.split('/').pop(), corpo = req.postData() ? JSON.parse(req.postData()) : {};
      chamadas.push(nome);
      try {
        const r = nome === 'alvos_publicar'
          ? await db.query('select public.alvos_publicar($1::bigint, $2::boolean) r', [corpo.p_execucao_id, corpo.p_publicar])
          : await db.query('select public.alvos_publico() r');
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
  const fs = require('fs');
  const browser = await chromium.launch();
  const original = fs.readFileSync('/tmp/index_v170.html', 'utf8'), novo = fs.readFileSync('/home/claude/soliduns-coletores/site/publicar/index.html', 'utf8');
  const cabs = s => [...s.matchAll(/<header class="landing-header">[\s\S]*?<\/header>/g)].map(m => m[0]);
  ok(cabs(original).length > 3 && JSON.stringify(cabs(original)) === JSON.stringify(cabs(novo)), 'cabeçalhos e logo do site idênticos aos da v170');
  ok(!/\bIA\b|intelig[êe]ncia artificial/i.test(fs.readFileSync('/home/claude/soliduns-coletores/site/fontes/v171_alvos_soliduns.js', 'utf8')), 'nada de IA no código novo');
  { const c = new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 't182' }); await c.connect();
    await c.query('update alvos_execucoes set publicado = false, publicado_em = null, publicado_por = null'); await c.end(); }

  // 1. administrador
  let s = await abrir(browser, ADMIN);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro'); await s.page.waitForTimeout(2500);
  const ordem = await s.page.evaluate(() => [...document.querySelectorAll('[data-mercado="br"] #mf-dd-acoes .mf-link')].map(a => a.getAttribute('data-acao')));
  ok(ordem.indexOf('alvos-soliduns') === ordem.indexOf('carteira-soliduns') + 1, 'menu Ações (BR): Alvos SOLIDUNS logo abaixo de Carteira SOLIDUNS');
  ok(!(await s.page.$('[data-mercado="us"] [data-acao="alvos-soliduns"]')), 'item só no menu do mercado brasileiro');
  await s.page.evaluate(() => document.querySelector('[data-mercado="br"] [data-acao="alvos-soliduns"]').click());
  await s.page.waitForSelector('#al-corpo tr', { timeout: 10000 }).catch(() => {});
  ok(await s.page.evaluate(() => location.hash.endsWith('/alvos-soliduns')), 'endereço da página: ' + await s.page.evaluate(() => location.hash));
  ok(await s.page.evaluate(() => document.title.startsWith('Alvos SOLIDUNS')), 'título da aba');
  const n = (await s.db.query('select count(*)::int n from alvos_acoes')).rows[0].n;
  const linhas = await s.page.$$eval('#al-corpo tr.al-linha', t => t.length);
  ok(linhas === n, 'tabela com todas as ações gravadas (' + linhas + ' de ' + n + ')');
  const verdesDb = (await s.db.query('select count(*)::int n from alvos_acoes where limpa and ganho_d >= 0.20')).rows[0].n;
  const verdes = await s.page.$$eval('#al-corpo tr.al-verde', t => t.length);
  ok(verdes === verdesDb, 'linhas em verde = ganho de 20% ou mais e sem alertas (' + verdes + ' / banco ' + verdesDb + ')');
  const g = await s.page.$$eval('#al-corpo tr.al-linha td:nth-child(11)', t => t.slice(0, 8).map(x => parseFloat(x.textContent.replace('+', '').replace('−', '-').replace(',', '.'))));
  ok(g.every((v, i) => i === 0 || v <= g[i - 1] + 1e-9), 'ordem: maior ganho até o alvo 2 primeiro (' + g.join(' ') + ')');
  ok(await s.page.isVisible('[data-al-publicar="1"]'), 'administrador vê PRÉVIA e botão Publicar');
  await s.page.screenshot({ path: OUT + '/v171_admin_lista.png', fullPage: false });
  await s.page.selectOption('#al-ganho', '0.2'); await s.page.waitForTimeout(200);
  const g20 = await s.page.$$eval('#al-corpo tr.al-linha td:nth-child(11)', t => t.map(x => parseFloat(x.textContent.replace('+', '').replace('−', '-').replace(',', '.'))));
  const db20 = (await s.db.query('select count(*)::int n from alvos_acoes where ganho_d >= 0.20')).rows[0].n;
  ok(g20.length === db20 && g20.every(v => v >= 20), 'filtro "20% ou mais": ' + g20.length + ' ações (banco ' + db20 + ')');
  await s.page.check('#al-limpas'); await s.page.waitForTimeout(200);
  const lim = await s.page.$$eval('#al-corpo tr.al-linha', t => t.length);
  ok(lim === verdesDb, 'esconder ações com alertas: sobram as em verde (' + lim + ')');
  await s.page.uncheck('#al-limpas'); await s.page.selectOption('#al-ganho', '0');
  await s.page.fill('#al-busca', 'btg'); await s.page.waitForTimeout(200);
  const bt = await s.page.$$eval('#al-corpo tr.al-linha .rx-tk', t => t.map(x => x.textContent));
  ok(bt.length === 1 && bt[0] === 'BPAC11', 'busca "btg" acha BPAC11: ' + bt.join(','));
  await s.page.click('#al-corpo tr.al-linha'); await s.page.waitForSelector('.al-detalhe svg', { timeout: 3000 }).catch(() => {});
  ok(await s.page.isVisible('.al-detalhe svg polyline'), 'clique abre o gráfico da ação');
  const rot = await s.page.$$eval('.al-detalhe .al-rot', t => t.map(x => x.textContent));
  ok(rot.length === 4 && rot.some(r => /^Stop/.test(r)) && rot.some(r => /^Alvo 2/.test(r)), 'gráfico com entrada, stop e alvos: ' + rot.join(' | '));
  const leit = await s.page.$$eval('.al-detalhe .al-leitura li', t => t.length);
  ok(leit >= 4, 'leitura dos indicadores em tópicos (' + leit + ')');
  await s.page.screenshot({ path: OUT + '/v171_admin_detalhe.png', fullPage: false });
  const a2d = await s.page.textContent('#al-corpo tr.al-linha td:nth-child(10)');
  await s.page.selectOption('#al-cen', 'T'); await s.page.waitForTimeout(200);
  const a2t = await s.page.textContent('#al-corpo tr.al-linha td:nth-child(10)');
  const dbA = (await s.db.query("select alvo2_d, alvo2_n from alvos_acoes where ticker = 'BPAC11'")).rows[0];
  ok(a2d !== null && a2t !== null && (Number(dbA.alvo2_d) === Number(dbA.alvo2_n) || a2d !== a2t), 'seletor de cenário troca o alvo 2 (' + a2d + ' → ' + a2t + ')');
  await s.page.selectOption('#al-cen', 'D'); await s.page.fill('#al-busca', ''); await s.page.waitForTimeout(200);
  await s.page.click('#al-cab th[data-al-ord="rr"]'); await s.page.waitForTimeout(200);
  const rr = await s.page.$$eval('#al-corpo tr.al-linha td:nth-child(13)', t => t.slice(0, 6).map(x => parseFloat(x.textContent.replace(',', '.'))));
  ok(rr.every((v, i) => i === 0 || v <= rr[i - 1]), 'clique em "Ganho / risco" ordena do maior para o menor: ' + rr.join(' '));
  await s.page.click('[data-al-publicar="1"]'); await s.page.waitForSelector('[data-al-publicar="0"]', { timeout: 5000 }).catch(() => {});
  ok(await s.page.isVisible('[data-al-publicar="0"]') && /publicada/i.test(await s.page.textContent('#al-admin-msg')), 'publicar: vira "Publicada" com botão Retirar');
  const pub = (await s.db.query('select publicado, publicado_por from alvos_execucoes')).rows[0];
  ok(pub.publicado === true && pub.publicado_por === 'dr.thiago.viegas@gmail.com', 'banco: publicada por ' + pub.publicado_por);
  ok(s.erros.filter(e => /^al|alvos|v171/i.test(e)).length === 0, 'sem erros do módulo novo' + (s.erros.length ? ' (outros erros da página: ' + s.erros.length + ')' : ''));
  if (s.erros.length) console.log('   erros da página:', s.erros.slice(0, 5).map(e => e.slice(0, 120)));
  await s.db.end(); await s.ctx.close();

  // 2. assinante
  s = await abrir(browser, ASSIN);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro/alvos-soliduns'); await s.page.waitForSelector('#al-corpo tr', { timeout: 10000 }).catch(() => {});
  ok(await s.page.$$eval('#al-corpo tr.al-linha', t => t.length) === n, 'assinante abre pelo endereço direto e vê a lista publicada');
  ok(!(await s.page.$('[data-al-publicar]')) && !(await s.page.$('.al-avisos')) && !(await s.page.$('.rx-previa')), 'assinante: sem prévia, sem avisos, sem botão');
  ok(await s.page.$$eval('#al-corpo tr.al-verde', t => t.length) === verdesDb, 'assinante vê os mesmos destaques em verde');
  await s.db.end(); await s.ctx.close();

  // 3. nada publicado
  { const c = new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 't182' }); await c.connect(); await c.query('update alvos_execucoes set publicado = false'); await c.end(); }
  s = await abrir(browser, ASSIN);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro/alvos-soliduns'); await s.page.waitForSelector('#al-conteudo .rx-vazio', { timeout: 10000 }).catch(() => {});
  ok(await s.page.isVisible('#al-conteudo .rx-vazio'), 'assinante sem lista publicada: "Alvos em preparação"');
  await s.db.end(); await s.ctx.close();

  // 4. celular
  s = await abrir(browser, ADMIN, 390);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro/alvos-soliduns'); await s.page.waitForSelector('#al-corpo tr', { timeout: 10000 }).catch(() => {});
  await s.page.click('#al-corpo tr.al-linha'); await s.page.waitForTimeout(400);
  const larg = await s.page.evaluate(() => document.documentElement.scrollWidth);
  ok(larg <= 392, 'celular (390 px): sem rolagem horizontal da página (' + larg + ' px)');
  await s.page.screenshot({ path: OUT + '/v171_celular.png', fullPage: false });
  await s.db.end(); await s.ctx.close();

  // 5. Carteira SOLIDUNS continua abrindo depois dos Alvos
  s = await abrir(browser, ADMIN);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro/alvos-soliduns'); await s.page.waitForSelector('#al-corpo tr', { timeout: 10000 }).catch(() => {});
  await s.page.evaluate(() => document.querySelector('[data-mercado="br"] [data-acao="carteira-soliduns"]').click());
  await s.page.waitForSelector('#sc-conteudo', { timeout: 8000 }).catch(() => {});
  ok(await s.page.evaluate(() => location.hash.endsWith('/carteira-soliduns') && !document.getElementById('al-conteudo')), 'Carteira SOLIDUNS abre normalmente depois dos Alvos');
  await s.db.end(); await s.ctx.close();

  await browser.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
})();
