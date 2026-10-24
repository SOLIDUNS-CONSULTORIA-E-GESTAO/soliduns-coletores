// Teste da v180 (correções A a K da auditoria de menus e rotas). Servir site/publicar em http://localhost:8185.
// Rodar: node test_menus_v180.js pasta_das_imagens
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = 'http://localhost:8185/index.html';
const SUPA = 'https://evcsniicnrlrtzpdmeza.supabase.co';
const OUT = process.argv[2] || '.';
let falhas = 0;
const ok = (c, n, d) => { console.log((c ? 'OK  ' : 'FALHOU ') + n + (c || d === undefined ? '' : '  -> ' + JSON.stringify(d).slice(0, 400))); if (!c) falhas++; };

async function contexto(browser, sessao, movel) {
  const ctx = await browser.newContext(movel ? Object.assign({}, devices['iPhone 14']) : { viewport: { width: 1366, height: 900 } });
  const email = 'dr.thiago.viegas@gmail.com';
  await ctx.addInitScript(([x, com]) => { try { if (com) localStorage.setItem('gestao-fiscal-auth-session', x); localStorage.setItem('sol-app-aviso-v173', String(Date.now())); } catch (e) {} },
    [JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600e3, email, nome: 'Thiago Viegas', perfil: 'admin', user: { id: '11111111-1111-1111-1111-111111111111', email } }), !!sessao]);
  await ctx.route(SUPA + '/**', r => { const u = new URL(r.request().url()), p = u.pathname; const j = d => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
    if (p === '/auth/v1/token') return j({ access_token: 'tok', refresh_token: 'r', expires_in: 3600, user: { id: '11111111-1111-1111-1111-111111111111', email } });
    if (p === '/rest/v1/acessos') return j([{ status: 'aprovado', perfil: 'admin', nome: 'Thiago Viegas' }]);
    if (/cpf/i.test(p + u.search)) return j([{ cpf: '52998224725' }]);
    return j(p.startsWith('/rest/v1/rpc/') ? null : []); });
  await ctx.route(/^https:\/\/(?!evcsniicnrlrtzpdmeza)(?!localhost).*/, r => r.abort());
  const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(e.message.slice(0, 160)));
  return { ctx, page, erros };
}
const abrir = async (s, h, t) => { await s.page.goto('about:blank'); await s.page.goto(BASE + h); await s.page.waitForTimeout(t || 2200); };
const est = s => s.page.evaluate(() => {
  const vis = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
  return { h: location.hash, tit: document.title, telas: ['tela-landing', 'tela-quem-somos', 'tela-equipe', 'tela-servico', 'tela-executivo', 'tela-noticias', 'auth-screen', 'tela-dashboard', 'main-app'].filter(vis),
    painel: [...document.querySelectorAll('#tela-dashboard .painel.ativo')].map(e => e.id)[0] || '', y: Math.round(scrollY), p404: !!document.querySelector('#painel-404.ativo') };
});

(async () => {
  const browser = await chromium.launch();
  const idx = fs.readFileSync(path.join(__dirname, '..', 'publicar', 'index.html'), 'utf8');
  ok(/<!-- v180 \(24\/10\/2026\)[^\n]*-->\n<script src="\/assets\/sol-[0-9a-f]{10}\.js"/.test(idx), 'index.html carrega o módulo da v180 depois da v179');
  ok(!/\bIA\b|intelig[êe]ncia artificial/i.test(fs.readFileSync(path.join(__dirname, '..', 'fontes', 'v180_menus_rotas.js'), 'utf8')), 'nada de IA no código novo');

  /* ---------- sem login ---------- */
  let s = await contexto(browser, false, false);
  // A
  await abrir(s, '#/servicos/consultoria');
  const seq = [];
  for (let i = 0; i < 3; i++) { await s.page.click('#landing-btn-servicos-servico'); await s.page.waitForTimeout(250);
    seq.push(await s.page.evaluate(() => getComputedStyle(document.getElementById('landing-dropdown-servicos-servico')).display !== 'none')); }
  ok(JSON.stringify(seq) === '[true,false,true]', 'A. página de serviço: "Serviços" abre, fecha e abre de novo a lista', seq);
  await s.page.mouse.click(5, 700); await s.page.waitForTimeout(200);
  ok(await s.page.evaluate(() => getComputedStyle(document.getElementById('landing-dropdown-servicos-servico')).display === 'none'), 'A. clique fora fecha a lista');
  await s.page.click('#landing-btn-servicos-servico'); await s.page.waitForTimeout(200);
  await s.page.screenshot({ path: OUT + '/v180_servicos_lista.png' });
  await s.page.click('#landing-dropdown-servicos-servico a[href="#/servicos/caixa"]'); await s.page.waitForTimeout(700);
  let e = await est(s);
  ok(e.h === '#/servicos/caixa' && /Gestão de caixa/.test(e.tit) && await s.page.evaluate(() => getComputedStyle(document.getElementById('landing-dropdown-servicos-servico')).display === 'none'),
     'A. item da lista abre o serviço e a lista fecha', e);
  ok(await s.page.evaluate(() => document.querySelectorAll('#servico-subnav [data-slug]').length === 5), 'A. a faixa com os 5 serviços continua');
  const nomes = await s.page.evaluate(() => [...document.querySelectorAll('#landing-nav-servico > a, #landing-nav-servico > div > button')].map(e => e.textContent.trim()));
  ok(JSON.stringify(nomes) === JSON.stringify(['Início', 'Quem somos', 'Nosso Time', 'Serviços ▾', 'Notícias', 'Contato']), 'A. mesmos itens do cabeçalho das outras páginas', nomes);
  // C
  await abrir(s, '#/contato');
  e = await est(s); const ct = await s.page.evaluate(() => { const r = document.getElementById('contato').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
  ok(e.telas[0] === 'tela-landing' && e.y > 500 && ct, 'C. #/contato desce até o Contato', e);
  // D
  await abrir(s, '#/');
  await s.page.click('#landing-nav a[href="#/equipe"]'); await s.page.waitForTimeout(800);
  e = await est(s);
  const atv = await s.page.evaluate(() => [...document.querySelectorAll('#tela-equipe .landing-nav .landing-ativo')].map(a => a.textContent.trim()));
  ok(e.tit === 'Nosso Time · Soliduns' && JSON.stringify(atv) === '["Nosso Time"]', 'D. Nosso Time: título da aba e destaque certos (vindo da página inicial)', [e.tit, atv]);
  await abrir(s, '#/equipe'); e = await est(s);
  ok(e.tit === 'Nosso Time · Soliduns', 'D. Nosso Time aberto direto: título certo', e.tit);
  // I
  await abrir(s, '#/quem-somos');
  await s.page.click('#landing-btn-servicos-qs'); await s.page.waitForTimeout(200);
  await s.page.click('#landing-dropdown-servicos-qs a[href="#/servicos/ativos"]'); await s.page.waitForTimeout(600);
  await s.page.click('#servico-subnav [data-slug="caixa"]'); await s.page.waitForTimeout(600);
  await s.page.click('#servico-voltar'); await s.page.waitForTimeout(800);
  e = await est(s);
  ok(e.h === '#/quem-somos' && e.telas[0] === 'tela-quem-somos', 'I. "← Voltar" do serviço volta para Quem somos (de onde a pessoa veio)', e);
  await abrir(s, '#/');
  await s.page.click('#landing-btn-servicos'); await s.page.waitForTimeout(200);
  await s.page.click('#landing-dropdown-servicos a[href="#/servicos/ativos"]'); await s.page.waitForTimeout(600);
  await s.page.click('#servico-voltar'); await s.page.waitForTimeout(900);
  e = await est(s);
  ok(e.telas[0] === 'tela-landing' && e.y > 300, 'I. vindo da página inicial, continua voltando aos cartões de serviços', e);
  // G
  await abrir(s, '#/investimentos/mercado-financeiro/alvos-soliduns');
  e = await est(s); const msg = await s.page.evaluate(() => (document.getElementById('login-msg') || {}).textContent);
  ok(e.telas[0] === 'auth-screen' && e.h === '#/investimentos/mercado-financeiro/alvos-soliduns' && /Entre com sua conta/.test(msg), 'G. sem login, link da plataforma abre a tela Entrar (com aviso)', [e, msg]);
  await s.page.screenshot({ path: OUT + '/v180_entrar.png' });
  await abrir(s, '#/quem-somos'); e = await est(s);
  ok(e.telas[0] === 'tela-quem-somos', 'G. páginas públicas continuam abrindo sem login', e);
  await abrir(s, '#/rota-que-nao-existe'); e = await est(s);
  ok(e.telas[0] === 'tela-landing', 'sem login, endereço inexistente continua na página inicial', e);
  ok(s.erros.length === 0, 'sem erros de JavaScript (sem login)', s.erros);
  // G: login de verdade pelo formulário volta para a página pedida
  await abrir(s, '#/calculadoras');
  await s.page.fill('#login-email', 'dr.thiago.viegas@gmail.com').catch(() => {});
  await s.page.fill('#password', 'Senha#Forte82').catch(() => {});
  await s.page.click('#form-login button[type=submit]');
  await s.page.waitForTimeout(3500);
  e = await est(s);
  ok(e.h === '#/calculadoras' && e.painel === 'painel-calculadoras', 'G. depois do login vai para a página pedida (Calculadoras)', e);
  await s.ctx.close();

  /* ---------- com login ---------- */
  s = await contexto(browser, true, false);
  // B
  const B = [['#/equipe', 'tela-equipe'], ['#/servicos/consultoria', 'tela-servico'], ['#/servicos/caixa', 'tela-servico'], ['#/executivo/ativos', 'tela-executivo'], ['#/inicio', 'tela-landing'], ['#/contato', 'tela-landing'], ['#/quem-somos', 'tela-quem-somos']];
  const ruins = [];
  for (const [h, t] of B) { await abrir(s, h, 2600); const x = await est(s); if (x.h !== h || x.telas[0] !== t) ruins.push([h, x.h, x.telas]); }
  ok(!ruins.length, 'B. logado, recarregar/abrir direto Nosso Time, Serviços, Executivo, Início, Contato e Quem somos mantém a página', ruins);
  await abrir(s, '#/contato', 2600); e = await est(s);
  ok(e.y > 500, 'C. logado, #/contato também desce até o Contato', e);
  // H
  await abrir(s, '#/rota-que-nao-existe', 2600); e = await est(s);
  ok(e.p404 && e.h === '#/rota-que-nao-existe', 'H. logado, endereço inexistente aberto direto mostra "Página não encontrada"', e);
  await abrir(s, '#/educacao', 2000); await s.page.evaluate(() => { location.hash = '#/outra-rota-errada'; }); await s.page.waitForTimeout(800); e = await est(s);
  ok(e.p404, 'H. navegando também mostra "Página não encontrada"', e);
  await abrir(s, '#/educacao/preparatorios', 2600); e = await est(s);
  ok(e.h === '#/educacao/preparatorios' && !e.p404, 'rotas da plataforma abertas direto continuam iguais', e);
  // E
  await abrir(s, '#/admin/equipe', 2800);
  e = await est(s);
  ok(e.telas.includes('tela-dashboard') && await s.page.isVisible('#equipe-overlay'), 'E. Equipe aberta direto: a plataforma aparece atrás da janela', e);
  await s.page.click('#equipe-fechar'); await s.page.waitForTimeout(900); e = await est(s);
  ok(e.h === '#/educacao' && e.painel === 'painel-educacao' && !await s.page.isVisible('#equipe-overlay'), 'E. "← Voltar" leva para Educação (sem tela preta)', e);
  await s.page.screenshot({ path: OUT + '/v180_equipe_voltar.png' });
  await abrir(s, '#/investimentos/mercado-financeiro/alvos-soliduns', 2600);
  await s.page.click('#btn-equipe-dash'); await s.page.waitForTimeout(900);
  await s.page.click('#equipe-fechar'); await s.page.waitForTimeout(1200); e = await est(s);
  ok(e.h === '#/investimentos/mercado-financeiro/alvos-soliduns' && e.painel === 'painel-acoes', 'E. aberta pelo botão Equipe: "← Voltar" volta para a página de onde veio', e);
  // F
  for (const m of [false, true]) {
    const s2 = m ? await contexto(browser, true, true) : s;
    await abrir(s2, '#/gestao-fiscal', 2600);
    if (m || await s2.page.isVisible('#topbar-burger')) { await s2.page.click('#topbar-burger'); await s2.page.waitForTimeout(300); }
    await s2.page.click('#item-investimentos'); await s2.page.waitForTimeout(300);
    const itens = await s2.page.evaluate(() => [...document.querySelectorAll('#submenu-investimentos button')].map(b => b.textContent.trim()));
    ok(JSON.stringify(itens) === JSON.stringify(['Mercado financeiro', 'Leilão de imóveis', 'Leilão de automóveis', 'Mercado imobiliário', 'Avaliação de imóveis', 'Compra e venda de empresas']),
      'F. Investimentos da Gestão com os 6 itens do hub' + (m ? ' (celular)' : ''), itens);
    for (const [d, alvo] of [['leilao-veiculos', 'painel-leilao-veiculos'], ['avaliacao-imoveis', 'painel-avaliacao-imoveis']]) {
      await abrir(s2, '#/gestao-fiscal', 2400);
      if (m || await s2.page.isVisible('#topbar-burger')) { await s2.page.click('#topbar-burger'); await s2.page.waitForTimeout(300); }
      await s2.page.click('#item-investimentos'); await s2.page.waitForTimeout(300);
      await s2.page.click(`#submenu-investimentos [data-destino="${d}"]`); await s2.page.waitForTimeout(1300);
      e = await est(s2);
      ok(e.h === '#/' + d && e.painel === alvo, `F. ${d} abre a página certa` + (m ? ' (celular)' : ''), e);
    }
    if (m) { await s2.page.click('#topbar-burger').catch(() => {}); await s2.ctx.close(); }
  }
  // J
  await abrir(s, '#/educacao', 2200);
  await s.page.evaluate(() => { location.hash = '#/investimentos/mercado-financeiro/noticias'; }); await s.page.waitForTimeout(1200);
  e = await est(s);
  await s.page.goBack(); await s.page.waitForTimeout(1200); const v = await est(s);
  ok(e.h === '#/noticias' && v.h === '#/educacao', 'J. Notícias pelo Mercado financeiro: um "Voltar" já sai', [e.h, v.h]);
  // K
  for (const [menu, acao, rota] of [['acoes', 'busca-acoes', '#/investimentos/mercado-financeiro/busca']]) {
    await abrir(s, '#/investimentos/mercado-financeiro', 2400);
    await s.page.click(`#mf-barra .mf-item[data-menu="${menu}"]`); await s.page.waitForTimeout(250);
    await s.page.click(`#mf-dd-${menu} a[data-acao="${acao}"]`); await s.page.waitForTimeout(900);
    e = await est(s);
    ok(e.h === rota, 'K. Busca avançada de Ações (Brasil) com endereço próprio: ' + rota, e.h);
    await abrir(s, rota, 2600); e = await est(s);
    const scr = await s.page.evaluate(() => { const c = document.getElementById('screener-cards'); return !!c && c.getBoundingClientRect().height > 0; });
    ok(e.h === rota && e.painel === 'painel-acoes' && scr && !e.p404, 'K. o endereço da Busca avançada abre direto', e);
  }
  await abrir(s, '#/investimentos/mercado-financeiro', 2400);
  await s.page.click('[data-mercado-set="us"]'); await s.page.waitForTimeout(700);
  const acaoUS = await s.page.evaluate(() => { const a = [...document.querySelectorAll('#mf-dd-acoes-us a')].find(x => /Busca avançada/.test(x.textContent)); return a && a.getAttribute('data-acao'); });
  await s.page.click('#mf-barra .mf-item[data-menu="acoes-us"]'); await s.page.waitForTimeout(250);
  await s.page.click(`#mf-dd-acoes-us a[data-acao="${acaoUS}"]`); await s.page.waitForTimeout(900);
  e = await est(s);
  ok(e.h === '#/investimentos/mercado-financeiro/eua/busca', 'K. Busca avançada de Ações (EUA) com endereço próprio', [acaoUS, e.h]);
  await abrir(s, '#/investimentos/mercado-financeiro/eua/busca', 2600); e = await est(s);
  const us = await s.page.evaluate(() => document.getElementById('mercado-acoes').value);
  ok(e.painel === 'painel-acoes' && us === 'us' && !e.p404, 'K. o endereço da Busca avançada (EUA) abre direto no mercado americano', [e, us]);
  ok(s.erros.filter(x => !/reading '(length|hoje|map|erro)'/.test(x)).length === 0, 'sem erros de JavaScript (logado)', s.erros);
  await s.ctx.close();

  /* ---------- celular: Serviços no ☰ das páginas de serviço continua ---------- */
  s = await contexto(browser, false, true);
  await abrir(s, '#/servicos/consultoria');
  await s.page.click('#landing-burger-servico'); await s.page.waitForTimeout(300);
  const mob = await s.page.evaluate(() => [...document.querySelectorAll('#landing-nav-mobile-servico a')].filter(a => a.getBoundingClientRect().height > 0).length);
  ok(mob >= 9, 'celular: menu ☰ das páginas de serviço continua com todos os itens', mob);
  ok(await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'celular: nada rola para o lado');
  await s.ctx.close();

  await browser.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
  process.exit(falhas ? 1 : 0);
})();
