// Teste da v169 (Cotações de fechamento com escolha da data do pregão): página real + funções SQL reais da migration 184.
// Preparar: Postgres local (socket /tmp, porta 54329), banco t184 = stub_146 + cotacoes_br_hist/cotacoes_br_eventos (Séries
// Históricas reais de ago-out/2026) + migration 184; resumo "último" em /tmp/.../eod_t184.json. Servir publicar/ em
// http://localhost:8169 e guardar a v168 em /tmp/index_v168.html. Rodar: node test_cotacoes_v169.js pasta eod.json
const { chromium } = require('playwright');
const { Client } = require('pg');
const fs = require('fs');
const SUPA = 'https://evcsniicnrlrtzpdmeza.supabase.co';
const BASE = 'http://localhost:8169/index.html';
const OUT = process.argv[2] || '.';
const EOD = fs.readFileSync(process.argv[3], 'utf8');
let falhas = 0;
const ok = (c, n) => { console.log((c ? 'OK  ' : 'FALHOU ') + n); if (!c) falhas++; };
const QUEM = { uid: '22222222-2222-2222-2222-222222222222', email: 'assinante@exemplo.com', nome: 'Assinante Teste' };

async function abrir(browser, largura) {
  const ctx = await browser.newContext({ viewport: { width: largura || 1400, height: 950 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  const db = new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 't184' });
  await db.connect();
  await db.query(`select set_config('t.uid', $1, false)`, [QUEM.uid]);
  const sessao = { access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600e3, email: QUEM.email, nome: QUEM.nome, user: { id: QUEM.uid, email: QUEM.email } };
  await page.addInitScript(s => localStorage.setItem('gestao-fiscal-auth-session', s), JSON.stringify(sessao));
  const chamadas = [];
  await page.route(SUPA + '/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/rest/v1/cotacoes_eod') return route.fulfill({ status: 200, contentType: 'application/json', body: EOD });
    if (url.pathname === '/rest/v1/rpc/cotacoes_br_pregoes' || url.pathname === '/rest/v1/rpc/cotacoes_br_pregao') {
      const nome = url.pathname.split('/').pop(), corpo = req.postData() ? JSON.parse(req.postData()) : {};
      chamadas.push(nome + (corpo.p_data ? ':' + corpo.p_data : ''));
      try {
        const r = nome === 'cotacoes_br_pregoes' ? await db.query('select public.cotacoes_br_pregoes($1) r', [corpo.p_limite])
                                                 : await db.query('select public.cotacoes_br_pregao($1::date) r', [corpo.p_data]);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].r) });
      } catch (e) { return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }); }
    }
    if (url.pathname.startsWith('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'tok2', refresh_token: 'r2', expires_in: 3600 }) });
    if (/cpf/i.test(url.search)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ cpf: '52998224725' }]) });
    if (url.pathname === '/rest/v1/acessos') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ status: 'aprovado', perfil: 'usuario', nome: QUEM.nome }]) });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  return { ctx, page, erros, db, chamadas };
}
const topoDe = async (page, tipo) => page.$$eval(`.cotacoes-lista[data-mercado="br"][data-tipo="${tipo}"] .cotacoes-item b`, t => t.map(x => x.textContent.trim()));

(async () => {
  const browser = await chromium.launch();
  const original = fs.readFileSync('/tmp/index_v168.html', 'utf8'), novo = fs.readFileSync('/home/claude/soliduns-coletores/site/publicar/index.html', 'utf8');
  const cabs = s => [...s.matchAll(/<header class="landing-header">[\s\S]*?<\/header>/g)].map(m => m[0]);
  ok(cabs(original).length > 3 && JSON.stringify(cabs(original)) === JSON.stringify(cabs(novo)), 'cabeçalhos e logo do site idênticos aos da v168');
  ok(!/\bIA\b|intelig[êe]ncia artificial|telegram/i.test(fs.readFileSync('/home/claude/soliduns-coletores/site/fontes/v169_cotacoes_data.js', 'utf8')), 'nada de IA nem de Telegram no código novo');

  let s = await abrir(browser);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro'); await s.page.waitForSelector('#cotacoes-br-data option', { timeout: 12000 }).catch(() => {});
  await s.page.waitForTimeout(800);
  const opcoes = await s.page.$$eval('#cotacoes-br-data option', o => o.map(x => [x.value, x.textContent]));
  ok(opcoes.length === 56 && /21\/10\/2026 \(qua\) · último/.test(opcoes[0][1]) && opcoes[1][0] === '2026-10-20', 'caixa "Pregão" com 56 datas, a 1ª é o último pregão: ' + opcoes.slice(0, 3).map(x => x[1]).join(' | '));
  ok(/pregão de 21\/10\/2026/.test(await s.page.textContent('#cotacoes-br-titulo')), 'título no último pregão');
  const alta21 = await topoDe(s.page, 'alta');
  await s.page.screenshot({ path: OUT + '/v169_ultimo.png', clip: { x: 0, y: 150, width: 1400, height: 700 } }).catch(() => {});

  // escolhe 16/10/2026
  await s.page.selectOption('#cotacoes-br-data', '2026-10-16'); await s.page.waitForFunction(() => /16\/10\/2026/.test(document.getElementById('cotacoes-br-titulo').textContent), null, { timeout: 8000 }).catch(() => {});
  ok(/pregão de 16\/10\/2026/.test(await s.page.textContent('#cotacoes-br-titulo')), 'título muda para o pregão de 16/10/2026');
  const esperado = (await s.db.query(`select x->>'ticker' t from jsonb_array_elements(public.cotacoes_br_pregao('2026-10-16')->'todas') x
                                       where (x->>'volume_fin')::numeric >= 5000000 and (x->>'variacao_pct')::numeric > 0
                                       order by (x->>'variacao_pct')::numeric desc limit 3`)).rows.map(r => r.t);
  const alta16 = await topoDe(s.page, 'alta');
  ok(JSON.stringify(alta16) === JSON.stringify(esperado), 'maiores altas de 16/10 iguais às do banco: ' + alta16.join(',') + ' (21/10 era ' + alta21.join(',') + ')');
  const esperadoVol = (await s.db.query(`select x->>'ticker' t from jsonb_array_elements(public.cotacoes_br_pregao('2026-10-16')->'todas') x
                                          where (x->>'volume_fin')::numeric >= 5000000 order by (x->>'volume_fin')::numeric desc limit 3`)).rows.map(r => r.t);
  ok(JSON.stringify(await topoDe(s.page, 'dividendo')) === JSON.stringify(esperadoVol), 'mais negociadas de 16/10: ' + esperadoVol.join(','));
  ok(/Séries Históricas/.test(await s.page.textContent('#cotacoes-br-rodape')) && !/Atenção/.test(await s.page.textContent('#cotacoes-br-rodape')), 'rodapé fala do pregão escolhido, sem o aviso de coleta atrasada');
  ok(await s.page.inputValue('#cotacoes-br-data') === '2026-10-16', 'caixa fica na data escolhida');
  // filtro de liquidez continua valendo no pregão escolhido
  await s.page.uncheck('#cotacoes-br-so-liquidas'); await s.page.waitForTimeout(400);
  const semFiltro = await s.page.textContent('.cotacoes-vertodos[data-mercado="br"][data-tipo="dividendo"]');
  ok(/pregão de 16\/10\/2026/.test(await s.page.textContent('#cotacoes-br-titulo')) && /\(30[0-9]\)/.test(semFiltro), 'sem o filtro de liquidez, ainda em 16/10: ' + semFiltro);
  await s.page.check('#cotacoes-br-so-liquidas'); await s.page.waitForTimeout(300);
  await s.page.click('.cotacoes-vertodos[data-mercado="br"][data-tipo="alta"]'); await s.page.waitForTimeout(200);
  ok((await topoDe(s.page, 'alta')).length > 3, '"Ver todos" abre a lista completa de altas do dia');
  await s.page.screenshot({ path: OUT + '/v169_16out.png', clip: { x: 0, y: 150, width: 1400, height: 700 } }).catch(() => {});
  // volta ao último
  await s.page.selectOption('#cotacoes-br-data', '2026-10-21'); await s.page.waitForTimeout(500);
  ok(/pregão de 21\/10\/2026/.test(await s.page.textContent('#cotacoes-br-titulo')) && JSON.stringify(await topoDe(s.page, 'alta')) === JSON.stringify(alta21), 'voltar ao último pregão restaura o resumo de sempre');
  ok(s.chamadas.filter(c => c === 'cotacoes_br_pregoes').length === 1, 'datas lidas uma vez só (' + s.chamadas.join(', ') + ')');
  ok(s.erros.filter(e => /eod|cotac|v169/i.test(e)).length === 0, 'sem erros do módulo novo' + (s.erros.length ? ' (outros erros da página: ' + s.erros.length + ')' : ''));
  await s.db.end(); await s.ctx.close();

  // celular
  s = await abrir(browser, 390);
  await s.page.goto(BASE + '#/investimentos/mercado-financeiro'); await s.page.waitForSelector('#cotacoes-br-data option', { timeout: 12000 }).catch(() => {});
  const larg = await s.page.evaluate(() => document.documentElement.scrollWidth);
  ok(larg <= 392 && await s.page.isVisible('#cotacoes-br-data'), 'celular (390 px): caixa visível e sem rolagem horizontal (' + larg + ' px)');
  await s.page.evaluate(() => document.getElementById('cotacoes-br-data').scrollIntoView({ block: 'center' }));
  await s.page.screenshot({ path: OUT + '/v169_celular.png' });
  await s.db.end(); await s.ctx.close();

  await browser.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
})();
