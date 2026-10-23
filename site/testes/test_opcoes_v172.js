// Teste da v172 (aba Opções: Opções do dia e Calculadora): página real + funções SQL reais da migration 187, com as
// opções REAIS da B3 de 21 e 22/10/2026 (Séries Históricas, cadastro e posições em aberto) gravadas pelo coletor
// coletor/coletar_opcoes_b3.py. Preparar: Postgres local (socket /tmp, porta 54329), banco t187 = stub_146 + eh_admin +
// migration 187 + dados; servir publicar/ em http://localhost:8172; guardar a v171 em /tmp/index_v171.html.
// Rodar: node test_opcoes_v172.js pasta_das_imagens
const { chromium } = require('playwright');
const { Client } = require('pg');
const fs = require('fs');
const SUPA = 'https://evcsniicnrlrtzpdmeza.supabase.co';
const BASE = 'http://localhost:8172/index.html';
const OUT = process.argv[2] || '.';
let falhas = 0;
const ok = (c, n) => { console.log((c ? 'OK  ' : 'FALHOU ') + n); if (!c) falhas++; };
const QUEM = { uid: '22222222-2222-2222-2222-222222222222', email: 'assinante@exemplo.com', nome: 'Assinante Teste' };

async function abrir(browser, opcoes) {
  const o = Object.assign({ largura: 1400, semSQL: false, rota: '' }, opcoes || {});
  const ctx = await browser.newContext({ viewport: { width: o.largura, height: 950 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  const db = new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 't187' });
  await db.connect();
  await db.query(`select set_config('t.uid', $1, false)`, [QUEM.uid]);
  const sessao = { access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600e3, email: QUEM.email, nome: QUEM.nome, user: { id: QUEM.uid, email: QUEM.email } };
  await page.addInitScript(s => localStorage.setItem('gestao-fiscal-auth-session', s), JSON.stringify(sessao));
  const chamadas = [];
  await page.route(SUPA + '/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/rest/v1/rpc/opcoes_br_pregoes' || url.pathname === '/rest/v1/rpc/opcoes_br_pregao') {
      const nome = url.pathname.split('/').pop(), corpo = req.postData() ? JSON.parse(req.postData()) : {};
      chamadas.push(nome + (corpo.p_data ? ':' + corpo.p_data : ''));
      if (o.semSQL) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Could not find the function' }) });
      try {
        const r = nome === 'opcoes_br_pregoes' ? await db.query('select public.opcoes_br_pregoes($1) r', [corpo.p_limite])
                                               : await db.query('select public.opcoes_br_pregao($1::date) r', [corpo.p_data]);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].r) });
      } catch (e) { return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }); }
    }
    if (url.pathname.startsWith('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'tok2', refresh_token: 'r2', expires_in: 3600 }) });
    if (/cpf/i.test(url.search)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ cpf: '52998224725' }]) });
    if (url.pathname === '/rest/v1/acessos') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ status: 'aprovado', perfil: 'usuario', nome: QUEM.nome }]) });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto(BASE + '#/investimentos/mercado-financeiro' + (o.rota ? '/' + o.rota : ''));
  await page.waitForSelector('#mf-item-opcoes', { state: 'attached', timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return { ctx, page, erros, db, chamadas };
}
const SQL_ITENS = `from public.opcoes_br_hist h, json_array_elements(h.itens) e where h.data = $1`;
const codigos = async (page, t) => page.$$eval(`#op-lista-${t} .cotacoes-item .op-cod`, b => b.map(x => x.textContent.trim()));

(async () => {
  const browser = await chromium.launch();
  const original = fs.readFileSync('/tmp/index_v171.html', 'utf8'), novo = fs.readFileSync('/home/claude/soliduns-coletores/site/publicar/index.html', 'utf8');
  const cabs = s => [...s.matchAll(/<header class="landing-header">[\s\S]*?<\/header>/g)].map(m => m[0]);
  ok(cabs(original).length > 3 && JSON.stringify(cabs(original)) === JSON.stringify(cabs(novo)), 'cabeçalhos e logo do site idênticos aos da v171');
  const fonte = fs.readFileSync('/home/claude/soliduns-coletores/site/fontes/v172_opcoes.js', 'utf8');
  ok(!/\bIA\b|intelig[êe]ncia artificial|telegram/i.test(fonte + novo.slice(novo.indexOf('v172: aba Opções'), novo.indexOf('v172: aba Opções') + 1500)), 'nada de IA nem de Telegram no código novo');

  let s = await abrir(browser);
  // a aba
  const abas = await s.page.$$eval('#mf-barra .mf-item-wrap[data-mercado="br"] > .mf-item', b => b.map(x => x.textContent.trim()));
  ok(abas.slice(0, 3).join('|') === 'Ações|Opções|FIIs', 'aba Opções logo depois de Ações: ' + abas.join(' | '));
  await s.page.click('#mf-item-opcoes'); await s.page.waitForTimeout(200);
  const menu = await s.page.$$eval('#mf-dd-opcoes .mf-link', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(menu.length === 5 && menu[0] === 'Opções do dia' && menu[3] === 'Calculadora de opções' && menu.filter(m => /EM BREVE/.test(m)).length === 3, 'menu com 5 itens (3 EM BREVE): ' + menu.join(' | '));
  await s.page.screenshot({ path: OUT + '/v172_menu.png', clip: { x: 0, y: 100, width: 1400, height: 450 } });
  await s.page.click('#mf-dd-opcoes [data-acao="opcoes-do-dia"]');
  await s.page.waitForSelector('#op-data option', { timeout: 10000 }).catch(() => {});
  await s.page.waitForTimeout(500);
  ok(/\/mercado-financeiro\/opcoes$/.test(await s.page.evaluate(() => location.hash)), 'endereço próprio: ' + await s.page.evaluate(() => location.hash));
  ok(await s.page.textContent('#op-titulo') === 'Opções — pregão de 22/10/2026', 'título: ' + await s.page.textContent('#op-titulo'));
  const opcoes = await s.page.$$eval('#op-data option', o => o.map(x => x.textContent));
  ok(opcoes.length === 2 && /22\/10\/2026 \(qui\) · último/.test(opcoes[0]), 'caixa "Pregão": ' + opcoes.join(' | '));
  const nTot = (await s.db.query(`select count(*)::int n ${SQL_ITENS}`, ['2026-10-22'])).rows[0].n;
  const nLiq = (await s.db.query(`select count(*)::int n ${SQL_ITENS} and (e->>11)::numeric >= 100000`, ['2026-10-22'])).rows[0].n;
  const cont = await s.page.textContent('#op-contagem');
  ok(cont === nTot.toLocaleString('pt-BR') + ' opções negociadas · ' + nLiq.toLocaleString('pt-BR') + ' com liquidez', 'contagem igual à do banco: ' + cont);
  const altasBanco = (await s.db.query(`select e->>0 c ${SQL_ITENS} and (e->>11)::numeric >= 100000 and (e->>12) is not null
     and (e->>8)::numeric / (e->>12)::numeric > 1 order by (e->>8)::numeric / (e->>12)::numeric desc limit 3`, ['2026-10-22'])).rows.map(r => r.c);
  const altas = await codigos(s.page, 'alta');
  ok(JSON.stringify(altas) === JSON.stringify(altasBanco), 'maiores altas iguais às do banco: ' + altas.join(','));
  const baixasBanco = (await s.db.query(`select e->>0 c ${SQL_ITENS} and (e->>11)::numeric >= 100000 and (e->>12) is not null
     and (e->>8)::numeric / (e->>12)::numeric < 1 order by (e->>8)::numeric / (e->>12)::numeric asc limit 3`, ['2026-10-22'])).rows.map(r => r.c);
  ok(JSON.stringify(await codigos(s.page, 'baixa')) === JSON.stringify(baixasBanco), 'maiores baixas iguais às do banco: ' + baixasBanco.join(','));
  const volBanco = (await s.db.query(`select e->>0 c ${SQL_ITENS} and (e->>11)::numeric >= 100000 order by (e->>11)::numeric desc limit 3`, ['2026-10-22'])).rows.map(r => r.c);
  ok(JSON.stringify(await codigos(s.page, 'volume')) === JSON.stringify(volBanco), 'mais negociadas iguais às do banco: ' + volBanco.join(','));
  ok(/Puts ÷ calls/.test(await s.page.textContent('#op-resumo')), 'resumo com volume de calls, puts e a razão puts ÷ calls');
  ok(/Black-Scholes/.test(await s.page.textContent('#op-rodape')) && /Séries Históricas/.test(await s.page.textContent('#op-rodape')), 'rodapé com a fonte e o método');
  await s.page.evaluate(() => document.getElementById('op-titulo').scrollIntoView());
  await s.page.screenshot({ path: OUT + '/v172_dia.png' });

  // filtros
  await s.page.selectOption('#op-tipo', 'P'); await s.page.waitForTimeout(300);
  const tags = await s.page.$$eval('#op-tabela tbody .op-tag', t => [...new Set(t.map(x => x.textContent))]);
  ok(tags.length === 1 && tags[0] === 'PUT', 'filtro "Só puts" na tabela');
  await s.page.selectOption('#op-tipo', ''); await s.page.selectOption('#op-ativo', 'PETR3'); await s.page.waitForTimeout(300);
  const ativos = await s.page.$$eval('#op-tabela tbody tr td:nth-child(2)', t => [...new Set(t.map(x => x.textContent))]);
  ok(ativos.length === 1 && ativos[0] === 'PETR3' && /Preço do ativo/.test(await s.page.textContent('#op-resumo')), 'filtro de ativo-objeto PETR3');
  await s.page.fill('#op-busca', 'PETRW6'); await s.page.waitForTimeout(200);
  const busca = await s.page.$$eval('#op-tabela tbody tr td:first-child .op-cod', t => t.map(x => x.textContent));
  ok(busca.length > 0 && busca.every(c => c.startsWith('PETRW6')), 'busca por código: ' + busca.slice(0, 4).join(','));
  await s.page.fill('#op-busca', '');
  await s.page.click('#op-tabela th[data-campo="vi"]'); await s.page.waitForTimeout(200);
  const vis = await s.page.$$eval('#op-tabela tbody tr td:nth-child(11)', t => t.map(x => parseFloat(x.textContent.replace('.', '').replace(',', '.'))).filter(v => !isNaN(v)));
  ok(vis.length > 3 && vis.every((v, i) => i === 0 || vis[i - 1] >= v), 'ordenar por volatilidade implícita');
  await s.page.uncheck('#op-so-liquidas'); await s.page.waitForTimeout(200);
  const petrTot = (await s.db.query(`select n_opcoes n from public.opcoes_br_hist where data = '2026-10-22' and ativo = 'PETR3'`)).rows[0].n;
  ok(/^(\d+) opções exibidas/.test(await s.page.textContent('#op-tabela-rodape')) && (await s.page.textContent('#op-tabela-rodape')).startsWith(petrTot.toLocaleString('pt-BR')), 'sem o filtro de liquidez: as ' + petrTot + ' opções de PETR3');
  await s.page.check('#op-so-liquidas'); await s.page.selectOption('#op-ativo', ''); await s.page.waitForTimeout(200);
  await s.page.click('[data-op-ver="alta"]'); await s.page.waitForTimeout(200);
  ok((await codigos(s.page, 'alta')).length > 3 && /Ver menos/.test(await s.page.textContent('[data-op-ver="alta"]')), '"Ver todos" abre a lista completa');

  // pregão anterior
  await s.page.selectOption('#op-data', '2026-10-21');
  await s.page.waitForFunction(() => /21\/10\/2026/.test(document.getElementById('op-titulo').textContent), null, { timeout: 8000 }).catch(() => {});
  ok(/pregão de 21\/10\/2026/.test(await s.page.textContent('#op-titulo')), 'escolher 21/10/2026 troca o pregão');
  const vol21 = (await s.db.query(`select e->>0 c ${SQL_ITENS} and (e->>11)::numeric >= 100000 order by (e->>11)::numeric desc limit 3`, ['2026-10-21'])).rows.map(r => r.c);
  ok(JSON.stringify(await codigos(s.page, 'volume')) === JSON.stringify(vol21), 'mais negociadas de 21/10 iguais às do banco: ' + vol21.join(','));
  await s.page.selectOption('#op-data', '2026-10-22'); await s.page.waitForTimeout(400);
  ok(s.chamadas.filter(c => c === 'opcoes_br_pregoes').length === 1 && s.chamadas.filter(c => c === 'opcoes_br_pregao').length === 1, 'cada pregão lido uma vez só (' + s.chamadas.join(', ') + ')');

  // da tabela para a calculadora
  const cod = volBanco[0];
  const linha = (await s.db.query(`select h.ativo, h.preco_ativo, e->>13 vi, e->>8 f ${SQL_ITENS} and e->>0 = $2`, ['2026-10-22', cod])).rows[0];
  await s.page.click(`#op-lista-volume .op-cod[data-op-calc="${cod}"]`);
  await s.page.waitForSelector('#op-c-res', { timeout: 5000 }).catch(() => {});
  await s.page.waitForTimeout(300);
  ok(/opcoes\/calculadora$/.test(await s.page.evaluate(() => location.hash)) && new RegExp(cod).test(await s.page.textContent('#op-calc-origem')), 'clicar na opção abre a calculadora com os dados dela (' + cod + ')');
  const viTela = parseFloat((await s.page.textContent('#op-c-res .op-destaque b')).replace(',', '.'));
  ok(linha.vi === null || Math.abs(viTela - Number(linha.vi) * 100) < 0.15, `volatilidade implícita da calculadora (${viTela}%) igual à do coletor (${linha.vi === null ? '—' : (Number(linha.vi) * 100).toFixed(2)}%)`);
  await s.page.screenshot({ path: OUT + '/v172_calc_opcao.png' });
  ok(s.erros.filter(e => /op|v172/i.test(e)).length === 0, 'sem erros do módulo novo' + (s.erros.length ? ' (outros erros da página: ' + s.erros.length + ' — ' + s.erros.slice(0, 2).join(' / ') + ')' : ''));
  await s.db.end(); await s.ctx.close();

  // calculadora pelo endereço, com valores digitados
  s = await abrir(browser, { rota: 'opcoes/calculadora' });
  await s.page.waitForSelector('#op-c-res', { timeout: 8000 }).catch(() => {});
  ok(await s.page.isVisible('#op-calculadora'), 'endereço .../opcoes/calculadora abre a calculadora');
  await s.page.selectOption('#op-c-tipo', 'C');
  for (const [id, v] of [['#op-c-s', '30'], ['#op-c-k', '32'], ['#op-c-du', '21'], ['#op-c-selic', '14.9']]) await s.page.fill(id, v);
  await s.page.check('input[name="op-c-modo"][value="vol"]'); await s.page.fill('#op-c-vol', '35'); await s.page.waitForTimeout(200);
  const res = await s.page.textContent('#op-c-res');
  ok(/R\$ 0,59/.test(res) && /0,318/.test(res), 'Black-Scholes confere com o coletor (preço R$ 0,5923; delta 0,3179)');
  await s.page.check('input[name="op-c-modo"][value="premio"]'); await s.page.fill('#op-c-premio', '0.5923'); await s.page.waitForTimeout(200);
  ok(/35,0% ao ano/.test(await s.page.textContent('#op-c-res')), 'caminho inverso: prêmio de R$ 0,5923 → volatilidade de 35,0%');
  await s.page.screenshot({ path: OUT + '/v172_calc.png' });
  await s.db.end(); await s.ctx.close();

  // item em breve e mercado americano
  s = await abrir(browser, { rota: 'opcoes/grade' });
  ok(/Grade de opções/.test(await s.page.textContent('#mf-analises-pub')) && /EM BREVE/.test(await s.page.textContent('#mf-analises-pub')), 'Grade de opções com o selo EM BREVE');
  await s.page.evaluate(() => { const x = document.getElementById('mercado-acoes'); x.value = 'us'; x.dispatchEvent(new Event('change')); });
  ok(!(await s.page.isVisible('#mf-item-opcoes')), 'aba Opções some no Mercado americano');
  await s.db.end(); await s.ctx.close();

  // sem o SQL 187
  s = await abrir(browser, { semSQL: true, rota: 'opcoes' });
  await s.page.waitForTimeout(800);
  ok(/As opções ainda não estão disponíveis/.test(await s.page.textContent('#op-dia-corpo')), 'sem o SQL 187: aviso simples, sem quebrar a página');
  await s.db.end(); await s.ctx.close();

  // celular
  s = await abrir(browser, { largura: 390, rota: 'opcoes' });
  await s.page.waitForSelector('#op-data option', { timeout: 10000 }).catch(() => {});
  const larg = await s.page.evaluate(() => document.documentElement.scrollWidth);
  ok(larg <= 392 && await s.page.isVisible('#op-data'), 'celular (390 px): sem rolagem horizontal da página (' + larg + ' px)');
  await s.page.evaluate(() => document.getElementById('op-titulo').scrollIntoView());
  await s.page.screenshot({ path: OUT + '/v172_celular.png' });
  await s.page.evaluate(() => document.getElementById('mf-barra').scrollIntoView());
  await s.page.screenshot({ path: OUT + '/v172_celular_barra.png' });
  await s.db.end(); await s.ctx.close();

  await browser.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
})();
