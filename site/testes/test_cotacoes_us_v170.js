// Teste da v170 (Mercado americano com o layout de Cotações de fechamento do brasileiro e a escolha do pregão): página real +
// funções SQL reais da migration 185. Preparar: Postgres local (socket /tmp, porta 54329), banco t185 = stub_146 +
// cotacoes_us/indicadores_us sintéticas (60 ações, 01/09 a 22/10/2026, um desdobramento 10:1 e um grupamento 1:20 em 15/10)
// + migration 185. Servir publicar/ em http://localhost:8170 e guardar a v169 em /tmp/index_v169.html.
// Rodar: node test_cotacoes_us_v170.js pasta_das_imagens
const { chromium } = require('playwright');
const { Client } = require('pg');
const fs = require('fs');
const SUPA = 'https://evcsniicnrlrtzpdmeza.supabase.co';
const BASE = 'http://localhost:8170/index.html';
const OUT = process.argv[2] || '.';
let falhas = 0;
const ok = (c, n) => { console.log((c ? 'OK  ' : 'FALHOU ') + n); if (!c) falhas++; };
const QUEM = { uid: '22222222-2222-2222-2222-222222222222', email: 'assinante@exemplo.com', nome: 'Assinante Teste' };

async function abrir(browser, largura, semSQL) {
  const ctx = await browser.newContext({ viewport: { width: largura || 1400, height: 950 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  const db = new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 't185' });
  await db.connect();
  await db.query(`select set_config('t.uid', $1, false)`, [QUEM.uid]);
  const sessao = { access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600e3, email: QUEM.email, nome: QUEM.nome, user: { id: QUEM.uid, email: QUEM.email } };
  await page.addInitScript(s => localStorage.setItem('gestao-fiscal-auth-session', s), JSON.stringify(sessao));
  const chamadas = [];
  const ind = (await db.query('select ticker, nome, setor, 10::numeric preco from public.indicadores_us order by ticker')).rows;
  await page.route(SUPA + '/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/rest/v1/indicadores_us') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ind) });
    if (url.pathname === '/rest/v1/rpc/cotacoes_hoje_us') return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: '2026-10-22', altas: [{ ticker: 'ANTIGO', nome: 'Resumo antigo', preco: 1, variacao_pct: 1 }], baixas: [], mais_negociadas: [] }) });
    if (url.pathname === '/rest/v1/rpc/cotacoes_us_pregoes' || url.pathname === '/rest/v1/rpc/cotacoes_us_pregao') {
      const nome = url.pathname.split('/').pop(), corpo = req.postData() ? JSON.parse(req.postData()) : {};
      chamadas.push(nome + (corpo.p_data ? ':' + corpo.p_data : ''));
      if (semSQL) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Could not find the function' }) });
      try {
        const r = nome === 'cotacoes_us_pregoes' ? await db.query('select public.cotacoes_us_pregoes($1) r', [corpo.p_limite])
                                                 : await db.query('select public.cotacoes_us_pregao($1::date) r', [corpo.p_data]);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].r) });
      } catch (e) { return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }); }
    }
    if (url.pathname.startsWith('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'tok2', refresh_token: 'r2', expires_in: 3600 }) });
    if (/cpf/i.test(url.search)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ cpf: '52998224725' }]) });
    if (url.pathname === '/rest/v1/acessos') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ status: 'aprovado', perfil: 'usuario', nome: QUEM.nome }]) });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto(BASE + '#/investimentos/mercado-financeiro');
  await page.waitForSelector('#mercado-acoes', { state: 'attached', timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const s = document.getElementById('mercado-acoes'); s.value = 'us'; s.dispatchEvent(new Event('change')); });
  return { ctx, page, erros, db, chamadas };
}
const topoDe = async (page, tipo) => page.$$eval(`.cotacoes-lista[data-mercado="us"][data-tipo="${tipo}"] .cotacoes-item b`, t => t.map(x => x.textContent.trim()));
const banco = async (db, dia, ordem, filtro) => (await db.query(`select x->>'ticker' t from jsonb_array_elements(public.cotacoes_us_pregao($1::date)->'todas') x
   where (x->>'volume_fin')::numeric >= 5000000 ${filtro || ''} order by ${ordem} limit 3`, [dia])).rows.map(r => r.t);

(async () => {
  const browser = await chromium.launch();
  const original = fs.readFileSync('/tmp/index_v169.html', 'utf8'), novo = fs.readFileSync('/home/claude/soliduns-coletores/site/publicar/index.html', 'utf8');
  const cabs = s => [...s.matchAll(/<header class="landing-header">[\s\S]*?<\/header>/g)].map(m => m[0]);
  ok(cabs(original).length > 3 && JSON.stringify(cabs(original)) === JSON.stringify(cabs(novo)), 'cabeçalhos e logo do site idênticos aos da v169');
  ok(!/\bIA\b|intelig[êe]ncia artificial|telegram/i.test(fs.readFileSync('/home/claude/soliduns-coletores/site/fontes/v170_cotacoes_us.js', 'utf8')), 'nada de IA nem de Telegram no código novo');

  let s = await abrir(browser);
  await s.page.waitForSelector('#cotacoes-us-data option', { timeout: 12000 }).catch(() => {});
  await s.page.waitForTimeout(600);
  const opcoes = await s.page.$$eval('#cotacoes-us-data option', o => o.map(x => [x.value, x.textContent]));
  ok(opcoes.length === 38 && /22\/10\/2026 \(qui\) · último/.test(opcoes[0][1]) && opcoes[1][0] === '2026-10-21', 'caixa "Pregão" com 38 datas, a 1ª é o último pregão: ' + opcoes.slice(0, 3).map(x => x[1]).join(' | '));
  ok(/^Cotações de fechamento — pregão de 22\/10\/2026$/.test(await s.page.textContent('#cotacoes-us-titulo')), 'título igual ao do Brasil: ' + await s.page.textContent('#cotacoes-us-titulo'));
  ok(!(await s.page.isVisible('#mercado-us-conteudo .cotacoes-filtro')), 'filtro por índice escondido (como no Brasil)');
  ok((await s.page.$$eval('#mercado-us-conteudo .cotacoes-coluna h3', h => h.map(x => x.textContent))).join('|') === 'Altas|Baixas|Mais negociadas', 'colunas Altas | Baixas | Mais negociadas');
  ok(/Somente ações com liquidez \(volume financeiro de pelo menos US\$ 5 milhões no dia\)/.test(await s.page.textContent('#cotacoes-us-controles')), 'filtro de liquidez em US$ 5 milhões');
  const cont = await s.page.textContent('#cotacoes-us-contagem');
  const nLiq = (await s.db.query(`select count(*)::int n from public.cotacoes_us where data = '2026-10-22' and financeiro >= 5000000`)).rows[0].n;
  ok(cont === '62 ações negociadas no pregão · ' + nLiq + ' com liquidez', 'contagem: ' + cont);
  const alta22 = await topoDe(s.page, 'alta');
  ok(JSON.stringify(alta22) === JSON.stringify(await banco(s.db, '2026-10-22', `(x->>'variacao_pct')::numeric desc`, `and (x->>'variacao_pct')::numeric > 0`)), 'maiores altas de 22/10 iguais às do banco: ' + alta22.join(','));
  ok(!alta22.includes('ANTIGO'), 'não mostra mais o resumo antigo (só altas, sem "Ver todos")');
  ok(/^Ver todos \(\d+\)$/.test(await s.page.textContent('.cotacoes-vertodos[data-mercado="us"][data-tipo="alta"]')), '"Ver todos (N)" visível: ' + await s.page.textContent('.cotacoes-vertodos[data-mercado="us"][data-tipo="alta"]'));
  ok(/US\$ [\d,]+ (mi|bi)/.test(await s.page.textContent('.cotacoes-lista[data-mercado="us"][data-tipo="dividendo"]')), 'mais negociadas em US$');
  ok(/Ações com liquidez — fechamento de 22\/10\/2026/.test(await s.page.textContent('#cotacoes-us-tabela-titulo')), 'tabela completa com o título do Brasil');
  ok(/Massive/.test(await s.page.textContent('#cotacoes-us-rodape')) && /US\$ 5 milhões/.test(await s.page.textContent('#cotacoes-us-rodape')), 'rodapé com a fonte e o critério de liquidez');
  await s.page.evaluate(() => document.getElementById('cotacoes-us-titulo').scrollIntoView());
  await s.page.screenshot({ path: OUT + '/v170_ultimo.png', fullPage: false });

  // busca e ordenação
  await s.page.fill('#cotacoes-us-busca', 'saúde'); await s.page.waitForTimeout(200);
  const setores = await s.page.$$eval('#cotacoes-us-tabela tbody tr td:nth-child(3)', t => [...new Set(t.map(x => x.textContent))]);
  ok(setores.length === 1 && setores[0] === 'Saúde', 'busca por setor filtra a tabela');
  await s.page.fill('#cotacoes-us-busca', ''); await s.page.click('#cotacoes-us-tabela th[data-campo="variacao_pct"]'); await s.page.waitForTimeout(200);
  const vars = await s.page.$$eval('#cotacoes-us-tabela tbody tr td:nth-child(5)', t => t.map(x => parseFloat(x.textContent.replace(',', '.'))));
  ok(vars.length > 3 && vars.every((v, i) => i === 0 || vars[i - 1] >= v), 'ordenar por variação (maior primeiro)');

  // pregão de 15/10 (desdobramento 10:1 da NVDX e grupamento 1:20 da GRUP)
  await s.page.selectOption('#cotacoes-us-data', '2026-10-15');
  await s.page.waitForFunction(() => /15\/10\/2026/.test(document.getElementById('cotacoes-us-titulo').textContent), null, { timeout: 8000 }).catch(() => {});
  ok(/pregão de 15\/10\/2026/.test(await s.page.textContent('#cotacoes-us-titulo')), 'título muda para o pregão de 15/10/2026');
  const alta15 = await topoDe(s.page, 'alta');
  ok(JSON.stringify(alta15) === JSON.stringify(await banco(s.db, '2026-10-15', `(x->>'variacao_pct')::numeric desc`, `and (x->>'variacao_pct')::numeric > 0`)), 'maiores altas de 15/10 iguais às do banco: ' + alta15.join(',') + ' (22/10 era ' + alta22.join(',') + ')');
  ok(JSON.stringify(await topoDe(s.page, 'dividendo')) === JSON.stringify(await banco(s.db, '2026-10-15', `(x->>'volume_fin')::numeric desc`)), 'mais negociadas de 15/10 iguais às do banco');
  await s.page.fill('#cotacoes-us-busca', 'NVDX'); await s.page.waitForTimeout(200);
  const nv = await s.page.$$eval('#cotacoes-us-tabela tbody tr td', t => t.map(x => x.textContent));
  ok(nv[0] === 'NVDX' && nv[4] === '+2,00%', 'desdobramento 10:1 não vira queda de 90%: NVDX ' + nv[4]);
  await s.page.fill('#cotacoes-us-busca', 'GRUP'); await s.page.waitForTimeout(200);
  const gr = await s.page.$$eval('#cotacoes-us-tabela tbody tr td', t => t.map(x => x.textContent));
  ok(gr[0] === 'GRUP' && gr[4] === '-5,00%', 'grupamento 1:20 não vira alta de 1.800%: GRUP ' + gr[4]);
  await s.page.fill('#cotacoes-us-busca', '');
  ok(await s.page.inputValue('#cotacoes-us-data') === '2026-10-15', 'caixa fica na data escolhida');
  await s.page.uncheck('#cotacoes-us-so-liquidas'); await s.page.waitForTimeout(300);
  ok(/pregão de 15\/10\/2026/.test(await s.page.textContent('#cotacoes-us-titulo')) && /Ver todos \(62\)/.test(await s.page.textContent('.cotacoes-vertodos[data-mercado="us"][data-tipo="dividendo"]'))
     && /Todas as ações da NYSE e da Nasdaq/.test(await s.page.textContent('#cotacoes-us-tabela-titulo')), 'sem o filtro de liquidez: as 62 ações de 15/10');
  await s.page.check('#cotacoes-us-so-liquidas'); await s.page.waitForTimeout(200);
  await s.page.click('.cotacoes-vertodos[data-mercado="us"][data-tipo="alta"]'); await s.page.waitForTimeout(200);
  ok((await topoDe(s.page, 'alta')).length > 3 && /Ver menos/.test(await s.page.textContent('.cotacoes-vertodos[data-mercado="us"][data-tipo="alta"]')), '"Ver todos" abre a lista completa');
  await s.page.evaluate(() => document.getElementById('cotacoes-us-titulo').scrollIntoView());
  await s.page.screenshot({ path: OUT + '/v170_15out.png' });
  await s.page.selectOption('#cotacoes-us-data', '2026-10-22'); await s.page.waitForTimeout(500);
  ok(/pregão de 22\/10\/2026/.test(await s.page.textContent('#cotacoes-us-titulo')) && JSON.stringify(await topoDe(s.page, 'alta')) === JSON.stringify(alta22), 'voltar ao último pregão');
  ok(s.chamadas.filter(c => c === 'cotacoes_us_pregoes').length === 1, 'datas lidas uma vez só (' + s.chamadas.join(', ') + ')');
  // o Brasil continua igual
  await s.page.evaluate(() => { const x = document.getElementById('mercado-acoes'); x.value = 'br'; x.dispatchEvent(new Event('change')); });
  ok(!(await s.page.$('#mercado-br-conteudo #cotacoes-us-controles')), 'seção brasileira sem os controles americanos');
  ok(s.erros.filter(e => /cotac|v170/i.test(e)).length === 0, 'sem erros do módulo novo' + (s.erros.length ? ' (outros erros da página: ' + s.erros.length + ')' : ''));
  await s.db.end(); await s.ctx.close();

  // sem o SQL 185: a seção fica como antes
  s = await abrir(browser, 1400, true); await s.page.waitForTimeout(1500);
  ok(!(await s.page.$('#cotacoes-us-controles')) && (await topoDe(s.page, 'alta')).includes('ANTIGO'), 'sem o SQL 185, continua o resumo de antes');
  await s.db.end(); await s.ctx.close();

  // celular
  s = await abrir(browser, 390);
  await s.page.waitForSelector('#cotacoes-us-data option', { timeout: 12000 }).catch(() => {});
  const larg = await s.page.evaluate(() => document.documentElement.scrollWidth);
  ok(larg <= 392 && await s.page.isVisible('#cotacoes-us-data'), 'celular (390 px): caixa visível e sem rolagem horizontal (' + larg + ' px)');
  await s.page.evaluate(() => document.getElementById('cotacoes-us-data').scrollIntoView({ block: 'start' }));
  await s.page.screenshot({ path: OUT + '/v170_celular.png' });
  await s.db.end(); await s.ctx.close();

  await browser.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
})();
