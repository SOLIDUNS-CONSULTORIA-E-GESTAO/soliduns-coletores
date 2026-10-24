// Teste da v174 (correções de layout para celular e tablet): sessão de administrador-mestre simulada, dados fictícios da
// tela Equipe (nomes e e-mails longos). Servir publicar/ em http://localhost:8185; guardar a v173 em /tmp/index_v173.html.
// Rodar: node test_layout_v174.js pasta_das_imagens
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8185/index.html';
const OUT = process.argv[2] || '.';
let falhas = 0;
const ok = (c, n) => { console.log((c ? 'OK  ' : 'FALHOU ') + n); if (!c) falhas++; };
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PLANOS = [
  { id: 'p1', nome: 'Plano Premium Anual — Toda a Plataforma', slug: 'premium-anual-toda-plataforma', preco: 1997, periodicidade: 'anual', validade_dias: 365, ativo: true, libera_tudo: true, ordem: 1, todos_cursos: false, entidades: [], areas: [] },
  { id: 'p2', nome: 'Preparatório ANBIMA CPA-20 e CEA', slug: 'preparatorio-anbima-cpa20-cea', preco: 497.9, periodicidade: 'semestral', validade_dias: 180, ativo: true, libera_tudo: false, ordem: 2, todos_cursos: false, entidades: [], areas: ['mercado_financeiro', 'leilao'] },
  { id: 'p3', nome: 'Investidor Leilões de Imóveis e Automóveis', slug: 'investidor-leiloes', preco: 89.9, periodicidade: 'mensal', validade_dias: null, ativo: false, libera_tudo: false, ordem: 3, todos_cursos: true, entidades: [], areas: ['leilao'] }];
const FILA = Array.from({ length: 6 }, (_, i) => ({ id: 'a' + i, email: 'pessoa.com.email.bem.comprido.' + i + '@empresa-exemplo.com.br', nome: 'Nome Completo da Pessoa Número ' + i,
  status: ['pendente', 'aprovado', 'aprovado'][i % 3], perfil: 'usuario', criado_em: '2026-10-0' + (i + 1) + 'T12:00:00Z', plano: i % 2 ? 'p1' : null, plano_validade: i % 2 ? '2027-10-01' : null }));

async function abrir(browser, w, h, o) {
  o = Object.assign({ admin: true, rota: '#/educacao' }, o || {});
  const movel = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: movel, hasTouch: movel, deviceScaleFactor: movel ? 3 : 1, userAgent: movel ? UA_IPHONE : undefined });
  const email = o.admin ? 'dr.thiago.viegas@gmail.com' : 'assinante@exemplo.com';
  await ctx.addInitScript(x => { try { localStorage.setItem('gestao-fiscal-auth-session', x); localStorage.setItem('sol-app-aviso-v173', String(Date.now())); } catch (e) {} },
    JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600e3, email, nome: 'Thiago Viegas', perfil: o.admin ? 'admin' : 'usuario', user: { id: '11111111-1111-1111-1111-111111111111', email } }));
  await ctx.route('https://evcsniicnrlrtzpdmeza.supabase.co/**', r => { const u = new URL(r.request().url()), p = u.pathname;
    const j = d => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
    if (p === '/rest/v1/acessos') return j(/select=id,email,nome,status/.test(u.search) ? FILA : [{ status: 'aprovado', perfil: o.admin ? 'admin' : 'usuario', nome: 'Thiago Viegas' }]);
    if (p === '/rest/v1/planos') return j(PLANOS);
    if (p === '/rest/v1/cursos') return j([{ id: 'c1', slug: 'cpa-20', titulo: 'Preparatório CPA-20', ordem: 1 }]);
    if (p === '/rest/v1/usuarios_cpf') return j(FILA.map(f => ({ id: f.id, cpf: '52998224725' })));
    if (/cpf/i.test(u.search)) return j([{ cpf: '52998224725' }]);
    return j(p.startsWith('/rest/v1/rpc/') ? null : []); });
  await ctx.route(/^https:\/\/(?!evcsniicnrlrtzpdmeza)(?!localhost).*/, r => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(e.message));
  await page.goto(BASE + o.rota); await page.waitForTimeout(1800);
  return { ctx, page, erros };
}
const ir = async (page, h, t) => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(t || 900); };
const larg = page => page.evaluate(() => ({ iw: innerWidth, sw: document.documentElement.scrollWidth }));

(async () => {
  const browser = await chromium.launch();
  const antes = fs.readFileSync('/tmp/index_v173.html', 'utf8'), depois = fs.readFileSync('/home/claude/soliduns-coletores/site/publicar/index.html', 'utf8');
  const cabs = s => [...s.matchAll(/<header class="(landing-header|topbar)"[\s\S]*?<\/header>/g)].map(m => m[0]);
  ok(cabs(antes).length >= 5 && JSON.stringify(cabs(antes)) === JSON.stringify(cabs(depois)), 'cabeçalhos e logo: HTML idêntico ao da v173 (' + cabs(antes).length + ' cabeçalhos)');
  ok(!/\bIA\b|intelig[êe]ncia artificial|telegram/i.test(fs.readFileSync('/home/claude/soliduns-coletores/site/fontes/v174_layout_mobile.js', 'utf8')), 'nada de IA nem de Telegram no código novo');

  // A + E. Equipe no iPhone
  let s = await abrir(browser, 390, 844, { rota: '#/admin/equipe' });
  await s.page.waitForTimeout(800);
  const eq = await s.page.evaluate(() => { const o = document.getElementById('equipe-overlay'); return { sw: o.scrollWidth, cw: o.clientWidth }; });
  ok(eq.sw <= eq.cw + 1, `Equipe no iPhone: a janela não desliza mais para o lado (conteúdo ${eq.sw} px em ${eq.cw} px; antes 796 px)`);
  const card = await s.page.$$eval('#planos-lista tbody tr:first-child td', tds => tds.map(td => (td.getAttribute('data-rotulo') || '') + '=' + td.textContent.trim().slice(0, 18)));
  ok(/^Plano=/.test(card[0]) && card.some(c => /^Preço=R\$/.test(c)) && card.some(c => /^Assinantes=/.test(c)) && card.some(c => /^Situação=/.test(c)), 'plano em cartão, com todas as colunas: ' + card.join(' | '));
  const editar = await s.page.$eval('#planos-lista .ac-plano-editar', b => { const r = b.getBoundingClientRect(); return { dir: r.right, alto: r.height, w: innerWidth }; });
  ok(editar.dir <= editar.w && editar.alto >= 36, `botão Editar dentro da tela e com área de toque de ${Math.round(editar.alto)} px`);
  await s.page.evaluate(() => document.querySelector('#planos-lista').scrollIntoView());
  await s.page.screenshot({ path: OUT + '/v174_equipe_iphone.png' });
  await s.page.click('#planos-lista .ac-plano-editar'); await s.page.waitForTimeout(400);
  ok(await s.page.isVisible('#plano-overlay'), '"Editar" continua abrindo o formulário do plano');
  await s.page.click('#plano-cancelar').catch(() => {}); await s.page.waitForTimeout(200);
  await s.page.evaluate(() => document.querySelector('#fila-secoes').scrollIntoView());
  await s.page.screenshot({ path: OUT + '/v174_equipe_fila_iphone.png' });
  const filas = await s.page.$$eval('#fila-secoes table.leilao-admin-table tbody tr', trs => trs.length);
  const foraFila = await s.page.$$eval('#fila-secoes td', tds => tds.filter(td => td.getBoundingClientRect().right > innerWidth + 1).length);
  ok(filas > 0 && foraFila === 0, `fila de aprovação (${filas} pessoas) em cartões, nada fora da tela`);
  ok(s.erros.length === 0, 'sem erros na página' + (s.erros.length ? ': ' + s.erros.slice(0, 2).join(' / ') : ''));
  await s.ctx.close();

  // Equipe no computador: tabela normal
  s = await abrir(browser, 1440, 900, { rota: '#/admin/equipe' });
  await s.page.waitForTimeout(800);
  ok(await s.page.$eval('#planos-lista thead', t => getComputedStyle(t).display !== 'none'), 'Equipe no computador: tabela de sempre, com cabeçalho');
  await s.ctx.close();

  // B. barra do topo da Gestão no iPhone (administrador)
  s = await abrir(browser, 390, 844, { rota: '#/gestao-fiscal' });
  let L = await larg(s.page);
  ok(L.iw === 390 && L.sw <= 390, `Gestão fiscal no iPhone: a página não fica mais afastada (largura ${L.sw} px; antes 457 px)`);
  ok(await s.page.getAttribute('#topbar', 'data-topo') === 'mini', 'barra do topo em modo compacto');
  ok(!(await s.page.isVisible('#btn-sair-fiscal')) && await s.page.isVisible('#btn-novo-registro') && await s.page.isVisible('#btn-conta-fiscal') && await s.page.isVisible('#btn-notificacoes'),
     'no topo ficam "+", sino e avatar; Sair vai para o ☰');
  ok(/Novo registro/.test(await s.page.textContent('#btn-novo-registro')), 'o botão "+" mantém o nome "Novo registro" para leitores de tela');
  await s.page.click('#btn-novo-registro'); await s.page.waitForTimeout(300);
  ok(await s.page.isVisible('#dropdown-novo-registro'), '"+" continua abrindo o menu de Novo registro');
  await s.page.click('#btn-novo-registro'); await s.page.waitForTimeout(200);
  await s.page.click('#topbar-burger'); await s.page.waitForTimeout(300);
  const itens = await s.page.$$eval('#topbar-nav > .topbar-item, #topbar-nav .topbar-item-wrap > .topbar-item', b => b.filter(x => x.getBoundingClientRect().height > 0).map(x => x.textContent.trim()));
  ok(itens.includes('Equipe') && itens.includes('Sair') && itens.includes('Calculadoras'), 'menu ☰ com o menu do site, Equipe e Sair: ' + itens.join(' | '));
  await s.page.screenshot({ path: OUT + '/v174_gestao_iphone_menu.png' });
  await s.page.evaluate(() => { window.__sair = 0; document.getElementById('btn-sair-fiscal').addEventListener('click', e => { window.__sair++; e.stopImmediatePropagation(); }, true); });
  await s.page.click('#topbar-nav .topo-extra[data-de="btn-sair-fiscal"]'); await s.page.waitForTimeout(200);
  ok(await s.page.evaluate(() => window.__sair === 1), '"Sair" do ☰ aciona o mesmo botão Sair de sempre');
  await s.ctx.close();

  // assinante comum no celular pequeno
  s = await abrir(browser, 320, 568, { admin: false, rota: '#/gestao-fiscal' });
  L = await larg(s.page);
  ok(L.iw === 320 && L.sw <= 320, `Gestão fiscal, assinante, celular de 320 px: sem afastar a página (${L.sw} px; antes 372 px)`);
  await ir(s.page, '#/investimentos/mercado-financeiro');
  L = await larg(s.page);
  ok(L.iw === 320 && L.sw <= 320, `Mercado financeiro em 320 px: sem afastar a página (${L.sw} px; antes 369 px)`);
  await ir(s.page, '#/investimentos/mercado-financeiro/alvos-soliduns', 1500);
  const sub = await s.page.$eval('.al-subtit', p => ({ cabe: p.scrollWidth <= p.clientWidth + 1, fonte: parseFloat(getComputedStyle(p).fontSize), linhas: Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight || 20)) })).catch(() => null);
  ok(sub && sub.cabe && sub.fonte >= 11, 'subtítulo do Alvos SOLIDUNS inteiro, numa linha (fonte de ' + (sub && sub.fonte) + ' px)');
  await s.ctx.close();

  // C. tablet: menu do topo no ☰ e página sem rolar para o lado
  for (const [w, h] of [[768, 1024], [1024, 768]]) {
    s = await abrir(browser, w, h, { rota: '#/educacao' });
    L = await larg(s.page);
    ok(L.sw <= w, `tablet ${w} px, Educação: sem rolar para o lado (${L.sw} px; antes 1163 px)`);
    await ir(s.page, '#/gestao-fiscal');
    L = await larg(s.page);
    ok(L.sw <= w, `tablet ${w} px, Gestão fiscal: sem rolar para o lado (${L.sw} px; antes 1563 px)`);
    await ir(s.page, '#/educacao');
    if (w === 768) {
      ok(await s.page.getAttribute('#topbar-dash', 'data-topo') === 'compacto' && await s.page.isVisible('#topbar-burger-dash'), 'tablet 768 px: menu do topo no ☰, Equipe e Sair continuam à vista');
      await s.page.click('#topbar-burger-dash'); await s.page.waitForTimeout(300);
      await s.page.screenshot({ path: OUT + '/v174_tablet_menu.png' });
      await s.page.click('#topbar-nav-dash .topbar-item[data-painel="calculadoras"]'); await s.page.waitForTimeout(700);
      ok(/calculadoras/.test(await s.page.evaluate(() => location.hash)), 'item do ☰ (Calculadoras) navega normalmente');
    }
    await s.ctx.close();
  }

  // tablet: tabelas e telas da Gestão que ainda empurravam a página
  for (const [w, h, rotas] of [[768, 1024, ['#/gestao-financeira/fin-pagar', '#/gestao-financeira/fin-carteira', '#/gestao-fiscal/fiscal-arquivos', '#/gestao-fiscal/fiscal-compliance', '#/admin/equipe']],
                                [1024, 768, ['#/gestao-financeira/fin-conciliacao']],
                                [390, 844, ['#/gestao-financeira/fin-conciliacao', '#/gestao-financeira/fin-integracoes', '#/gestao-financeira/fin-pagar', '#/gestao-fiscal/fiscal-arquivos', '#/gestao-fiscal/fiscal-cadastros', '#/gestao-fiscal/fiscal-compliance']],
                                [320, 568, ['#/gestao-financeira/fin-relatorios', '#/educacao/preparatorios/certificacoes']]]) {
    s = await abrir(browser, w, h, { rota: '#/educacao' });
    const ruins = [];
    for (const r of rotas) { await ir(s.page, r, r.indexOf('equipe') >= 0 ? 1500 : 900); const x = await larg(s.page); if (x.iw !== w || x.sw > w + 1) ruins.push(r + ' ' + x.sw); }
    ok(ruins.length === 0, `${w} px: ${rotas.length} telas da Gestão/Equipe/Educação sem empurrar a página` + (ruins.length ? ' — ' + ruins.join(', ') : ''));
    await s.ctx.close();
  }

  // computador: onde cabe, nada muda
  for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    s = await abrir(browser, w, h, { rota: '#/educacao' });
    const dash = await s.page.getAttribute('#topbar-dash', 'data-topo');
    const visNav = await s.page.isVisible('#topbar-nav-dash');
    L = await larg(s.page);
    ok(L.sw <= w && visNav && dash !== 'compacto' && dash !== 'mini', `computador ${w} px: menu do topo como sempre (${dash || 'sem mudança'}), sem rolar para o lado`);
    await ir(s.page, '#/gestao-fiscal');
    L = await larg(s.page);
    const fis = await s.page.getAttribute('#topbar', 'data-topo');
    ok(L.sw <= w, `computador ${w} px, Gestão fiscal (administrador): sem rolar para o lado (${L.sw} px${w < 1600 ? '; antes 1563 px' : ''}), barra ${fis || 'sem mudança'}`);
    if (w === 1920) ok(!fis || fis === 'normal', 'tela larga (1920 px): barra da Gestão exatamente como antes');
    if (w === 1440) await s.page.screenshot({ path: OUT + '/v174_gestao_1440.png', clip: { x: 0, y: 0, width: 1440, height: 300 } });
    await s.ctx.close();
  }

  await browser.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
})();
