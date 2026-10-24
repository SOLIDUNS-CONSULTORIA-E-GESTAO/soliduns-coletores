// AUDITORIA DE MENUS E ROTAS DO SITE (24/10/2026) — clica de verdade em cada item de menu e abre cada rota, sem alterar nada.
// Fases: publico (cabeçalho do site sem login), logado (mesmo cabeçalho com sessão), plataforma (barra do topo, hub de
// Investimentos, menu do Mercado financeiro, menus laterais da Gestão), rotas (cada endereço: pela navegação, abrindo direto
// e com o Voltar do navegador).
// Uso: servir site/publicar em http://localhost:8185 e rodar: node auditoria_menus_rotas.js <fase> <desktop|mobile> saida.json
const { chromium, devices } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8185/index.html';
const [FASE, MODO, SAIDA] = [process.argv[2] || 'publico', process.argv[3] || 'desktop', process.argv[4] || 'auditoria.json'];
const SUPA = 'https://evcsniicnrlrtzpdmeza.supabase.co';
const res = { fase: FASE, modo: MODO, itens: [] };
const reg = (grupo, item, d) => { res.itens.push(Object.assign({ grupo, item }, d)); if (process.env.VERBOSO) console.log(grupo, '|', item, '|', JSON.stringify(d).slice(0, 300)); };

const ESTADO = () => {
  const vis = e => !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().height > 0;
  const TELAS = ['tela-landing', 'tela-noticias', 'tela-quem-somos', 'tela-equipe', 'tela-servico', 'tela-executivo', 'tela-splash', 'auth-screen', 'tela-dashboard', 'main-app'];
  const telas = TELAS.filter(id => vis(document.getElementById(id)));
  const raiz = document.getElementById(telas[0] || 'tela-landing') || document.body;
  const titulos = [...raiz.querySelectorAll('h1,h2')].filter(e => vis(e) && e.textContent.trim() && !e.closest('header,nav,.landing-dropdown,.mf-dropdown,[id$="-overlay"]'));
  const h = titulos.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).find(e => e.getBoundingClientRect().bottom > 0);
  const dd = [...document.querySelectorAll('.landing-dropdown,.mf-dropdown,.topbar-dropdown,[class*="dropdown"]')].filter(e => vis(e) && e.querySelector('a,button')).map(e => e.id || e.className.split(' ')[0]);
  const ov = [...document.querySelectorAll('[id$="-overlay"],#cpf-gate,.modal')].filter(vis).map(e => e.id || e.className.split(' ')[0]);
  const ativos = [...document.querySelectorAll('.topbar-item.active,.landing-ativo,.mf-item.active,.nav-item.active,.servico-subnav a.ativo,[aria-current="page"]')].filter(vis).map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 30));
  const painel = [...document.querySelectorAll('#tela-dashboard .painel.ativo')].map(e => e.id);
  const view = [...document.querySelectorAll('#main-app .view.ativo, #main-app .view.active, #main-app [data-view-panel].ativo')].filter(vis).map(e => e.id).slice(0, 2);
  const contato = document.getElementById('contato'); const rc = contato && contato.getBoundingClientRect();
  return { hash: location.hash, telas, painel, view, titulo: document.title.slice(0, 80), h: h ? h.textContent.trim().replace(/\s+/g, ' ').slice(0, 70) : '', dd, ov, ativos,
    y: Math.round(scrollY), contatoNaTela: !!(rc && rc.top < innerHeight && rc.bottom > 0 && vis(contato)), p404: !!document.querySelector('#painel-404.ativo'),
    sobra: document.documentElement.scrollWidth - innerWidth };
};

async function nova(browser, sessao) {
  const opc = MODO === 'mobile' ? Object.assign({}, devices['iPhone 14']) : { viewport: { width: 1366, height: 900 } };
  const ctx = await browser.newContext(opc);
  if (sessao) {
    const email = sessao === 'admin' ? 'dr.thiago.viegas@gmail.com' : 'assinante@exemplo.com';
    await ctx.addInitScript(x => { try { localStorage.setItem('gestao-fiscal-auth-session', x); localStorage.setItem('sol-app-aviso-v173', String(Date.now())); } catch (e) {} },
      JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600e3, email, nome: 'Thiago Viegas', perfil: sessao === 'admin' ? 'admin' : 'usuario', user: { id: '11111111-1111-1111-1111-111111111111', email } }));
  } else {
    await ctx.addInitScript(() => { try { localStorage.setItem('sol-app-aviso-v173', String(Date.now())); } catch (e) {} });
  }
  await ctx.route(SUPA + '/**', r => { const u = new URL(r.request().url()), p = u.pathname; const j = d => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
    if (p === '/rest/v1/acessos') return j([{ status: 'aprovado', perfil: sessao === 'admin' ? 'admin' : 'usuario', nome: 'Thiago Viegas' }]);
    if (/cpf/i.test(p + u.search)) return j([{ cpf: '52998224725' }]);
    return j(p.startsWith('/rest/v1/rpc/') ? null : []); });
  await ctx.route(/^https:\/\/(?!evcsniicnrlrtzpdmeza)(?!localhost).*/, r => r.abort());
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  const erros = []; page.on('pageerror', e => erros.push(e.message.slice(0, 200)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  return { ctx, page, erros };
}
async function abrirEm(s, hash, espera) {
  await s.page.goto('about:blank'); await s.page.goto(BASE + hash); await s.page.waitForTimeout(espera || 1800);
}
const estado = s => s.page.evaluate(ESTADO);
async function clicar(s, sel, idx) {
  const loc = s.page.locator(sel).nth(idx || 0);
  try { await loc.scrollIntoViewIfNeeded({ timeout: 2000 }); await loc.click({ timeout: 3000 }); return null; }
  catch (e) { const m = String(e.message).split('\n').find(l => /intercepts|not visible|outside|Timeout/.test(l)) || String(e.message).split('\n')[0]; return m.trim().slice(0, 200); }
}

/* ---------------- fase 1/2: cabeçalho público ---------------- */
const PUBLICAS = ['#/', '#/quem-somos', '#/equipe', '#/servicos/consultoria', '#/servicos/caixa', '#/noticias', '#/executivo/consultoria'];
async function fasePublica(browser, sessao) {
  const s = await nova(browser, sessao);
  for (const ini of PUBLICAS) {
    await abrirEm(s, ini);
    const base = await estado(s);
    reg('abrir', ini, { estado: base, erros: s.erros.splice(0) });
    const sel = MODO === 'mobile' ? null : 'header.landing-header';
    const itens = await s.page.evaluate(() => {
      const vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().width > 0;
      const hd = [...document.querySelectorAll('header.landing-header')].find(vis); if (!hd) return [];
      const tela = hd.closest('[id^="tela-"]');
      const out = [];
      const add = (el, tipo) => { if (!vis(el)) return; const k = 'aud' + out.length; el.setAttribute('data-aud-m', k); out.push({ k, tipo, txt: (el.getAttribute('aria-label') && tipo === 'logo' ? 'Logo SOLIDUNS' : el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)), href: el.getAttribute('href') || '' }); };
      add(hd.querySelector('.landing-logo'), 'logo');
      hd.querySelectorAll('.landing-nav > a, .landing-nav > .landing-nav-item-wrap > button, .landing-nav > span').forEach(e => add(e, e.tagName === 'SPAN' ? 'rotulo' : (e.tagName === 'BUTTON' ? 'botao-menu' : 'link')));
      hd.querySelectorAll('.landing-entrar-header, .landing-sair-header, .landing-burger').forEach(e => add(e, e.className.replace('landing-', '').split(' ')[0]));
      if (tela) tela.querySelectorAll('nav:not(.landing-nav):not(.landing-nav-mobile) a').forEach(e => add(e, 'subnav'));
      return out;
    });
    for (const it of itens) {
      if (it.tipo === 'sair-header') { reg('cabecalho ' + ini, it.txt, { pulado: 'Sair (não clicado)' }); continue; }
      await abrirEm(s, ini, 1500);
      await s.page.evaluate(() => {
        const vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
        const hd = [...document.querySelectorAll('header.landing-header')].find(vis); const tela = hd && hd.closest('[id^="tela-"]'); let n = 0;
        const add = el => { if (vis(el)) el.setAttribute('data-aud-m', 'aud' + n++); };
        if (!hd) return; add(hd.querySelector('.landing-logo'));
        hd.querySelectorAll('.landing-nav > a, .landing-nav > .landing-nav-item-wrap > button, .landing-nav > span').forEach(add);
        hd.querySelectorAll('.landing-entrar-header, .landing-sair-header, .landing-burger').forEach(add);
        if (tela) tela.querySelectorAll('nav:not(.landing-nav):not(.landing-nav-mobile) a').forEach(add);
      });
      if (it.tipo === 'botao-menu' || it.tipo === 'rotulo') {
        // menu suspenso: 1º clique abre, 2º fecha, 3º abre de novo, clique fora fecha
        const seq = [];
        for (let i = 0; i < 3; i++) { const e = await clicar(s, `[data-aud-m="${it.k}"]`); await s.page.waitForTimeout(350); const st = await estado(s); seq.push({ erro: e, dd: st.dd, hash: st.hash, telas: st.telas }); }
        await s.page.mouse.click(5, 600); await s.page.waitForTimeout(300); const fora = await estado(s);
        reg('cabecalho ' + ini, it.txt + ' (' + it.tipo + ')', { seq, fora: fora.dd, erros: s.erros.splice(0) });
        // cada item da lista
        await abrirEm(s, ini, 1400);
        const n = await s.page.evaluate(() => { const vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
          const hd = [...document.querySelectorAll('header.landing-header')].find(vis); const dd = hd && hd.querySelector('.landing-dropdown'); return dd ? dd.querySelectorAll('a').length : 0; });
        for (let j = 0; j < n; j++) {
          await abrirEm(s, ini, 1400);
          const e1 = await s.page.evaluate(() => { const vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
            const hd = [...document.querySelectorAll('header.landing-header')].find(vis); hd.querySelectorAll('.landing-dropdown a').forEach((a, i) => a.setAttribute('data-aud-dd', i));
            const b = hd.querySelector('.landing-nav-servicos'); if (b) b.setAttribute('data-aud-bt', '1'); return !!b; });
          if (e1) await clicar(s, '[data-aud-bt="1"]'); await s.page.waitForTimeout(300);
          const txt = await s.page.evaluate(j => (document.querySelector(`[data-aud-dd="${j}"]`) || {}).textContent, j);
          const er = await clicar(s, `[data-aud-dd="${j}"]`); await s.page.waitForTimeout(900);
          reg('cabecalho ' + ini, 'Serviços › ' + txt, { erroClique: er, estado: await estado(s), erros: s.erros.splice(0) });
        }
        continue;
      }
      if (it.tipo === 'burger') {
        const er = await clicar(s, `[data-aud-m="${it.k}"]`); await s.page.waitForTimeout(400);
        const links = await s.page.evaluate(() => { const vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
          const m = [...document.querySelectorAll('.landing-nav-mobile')].find(vis); if (!m) return [];
          return [...m.querySelectorAll('a')].map((a, i) => { a.setAttribute('data-aud-mob', i); return a.textContent.trim(); }); });
        reg('cabecalho ' + ini, 'Menu ☰ abre', { erroClique: er, links });
        for (let j = 0; j < links.length; j++) {
          await abrirEm(s, ini, 1400);
          await s.page.evaluate(() => { const vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
            const hd = [...document.querySelectorAll('header.landing-header')].find(vis); hd.querySelector('.landing-burger').setAttribute('data-aud-bg', '1'); });
          await clicar(s, '[data-aud-bg="1"]'); await s.page.waitForTimeout(400);
          await s.page.evaluate(() => { const vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
            const m = [...document.querySelectorAll('.landing-nav-mobile')].find(vis); if (m) m.querySelectorAll('a').forEach((a, i) => a.setAttribute('data-aud-mob', i)); });
          const er2 = await clicar(s, `[data-aud-mob="${j}"]`); await s.page.waitForTimeout(900);
          const st = await estado(s);
          const menuAberto = await s.page.evaluate(() => [...document.querySelectorAll('.landing-nav-mobile')].some(m => getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().height > 0));
          reg('cabecalho ' + ini, '☰ › ' + links[j], { erroClique: er2, estado: st, menuContinuaAberto: menuAberto, erros: s.erros.splice(0) });
        }
        continue;
      }
      const er = await clicar(s, `[data-aud-m="${it.k}"]`); await s.page.waitForTimeout(1000);
      reg('cabecalho ' + ini, it.txt + ' (' + it.tipo + (it.href ? ' ' + it.href : '') + ')', { erroClique: er, estado: await estado(s), erros: s.erros.splice(0) });
      // 2º clique no mesmo item (mesma posição) — o que acontece
    }
  }
  await s.ctx.close();
}

/* ---------------- fase 3: plataforma (logado) ---------------- */
async function fasePlataforma(browser) {
  const s = await nova(browser, 'admin');
  // barra do topo
  const TOP = ['#item-educacao-dash', '#item-investimentos-dash', '#item-financeira-dash', '#item-fiscal-dash', '#item-calculadoras-dash', '#btn-conta-dash', '#btn-equipe-dash', '#brand-dash'];
  for (const ini of ['#/educacao', '#/investimentos/mercado-financeiro/alvos-soliduns']) {
    for (const t of TOP) {
      await abrirEm(s, ini, 2200);
      let er = null;
      if (MODO === 'mobile' && t.startsWith('#item-')) { er = await clicar(s, '#topbar-burger-dash'); await s.page.waitForTimeout(400); }
      const nome = await s.page.evaluate(t => (document.querySelector(t) || {}).textContent, t);
      const er2 = await clicar(s, t); await s.page.waitForTimeout(1200);
      const st1 = await estado(s);
      // 2º clique no mesmo item
      let st2 = null, er3 = null;
      if (t.startsWith('#item-')) { if (MODO === 'mobile') { await clicar(s, '#topbar-burger-dash'); await s.page.waitForTimeout(400); } er3 = await clicar(s, t); await s.page.waitForTimeout(1000); st2 = await estado(s); }
      reg('topo a partir de ' + ini, (nome || t).trim().slice(0, 30), { erroBurger: er, erroClique: er2, estado: st1, segundoClique: st2, erroSegundo: er3, erros: s.erros.splice(0) });
    }
  }
  // fiscal: barra própria (#topbar-nav) e menu lateral (.spine)
  for (const ini of ['#/gestao-financeira', '#/gestao-fiscal']) {
    await abrirEm(s, ini, 2200);
    const top = await s.page.evaluate(() => [...document.querySelectorAll('#topbar-nav button, #topbar-nav a, #topbar .topbar-logo')].map((e, i) => { e.setAttribute('data-aud-t', i); return e.id + '|' + e.textContent.trim().slice(0, 30); }));
    for (let i = 0; i < top.length; i++) {
      await abrirEm(s, ini, 2000);
      await s.page.evaluate(() => document.querySelectorAll('#topbar-nav button, #topbar-nav a, #topbar .topbar-logo').forEach((e, i) => e.setAttribute('data-aud-t', i)));
      let er0 = null; if (MODO === 'mobile') { er0 = await clicar(s, '#topbar-burger'); await s.page.waitForTimeout(400); }
      const er = await clicar(s, `[data-aud-t="${i}"]`); await s.page.waitForTimeout(1200);
      reg('topo da Gestão a partir de ' + ini, top[i], { erroBurger: er0, erroClique: er, estado: await estado(s), erros: s.erros.splice(0) });
    }
    const lat = await s.page.evaluate(g => [...document.querySelectorAll('.spine .nav-item[data-view]')].filter(e => (e.getAttribute('data-grupo') === 'fiscal') === (g === 'fiscal'))
      .map(e => e.getAttribute('data-view') + '|' + e.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)), ini === '#/gestao-fiscal' ? 'fiscal' : 'financeiro');
    for (const l of lat) {
      const v = l.split('|')[0];
      await abrirEm(s, ini, 1800);
      let er0 = null; if (MODO === 'mobile') { er0 = await clicar(s, '#topbar-burger, .spine-toggle, #btn-spine'); await s.page.waitForTimeout(400); }
      const er = await clicar(s, `.spine .nav-item[data-view="${v}"]`); await s.page.waitForTimeout(900);
      reg('menu lateral ' + ini, l, { erroClique: er, estado: await estado(s), erros: s.erros.splice(0) });
    }
  }
  // hub de Investimentos e Calculadoras / Educação: cartões
  for (const [ini, sel] of [['#/investimentos', '#painel-investimentos-escolha .escolha-card, #painel-investimentos-escolha [data-painel]:not(.voltar-link)'],
                            ['#/calculadoras', '#painel-calculadoras .escolha-card, #painel-calculadoras button[data-calc], #painel-calculadoras .calc-card'],
                            ['#/educacao', '#edu-categorias .escolha-card']]) {
    await abrirEm(s, ini, 2000);
    const n = await s.page.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().height > 0).map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)), sel);
    for (let i = 0; i < n.length; i++) {
      await abrirEm(s, ini, 1800);
      await s.page.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().height > 0).forEach((e, i) => e.setAttribute('data-aud-c', i)), sel);
      const er = await clicar(s, `[data-aud-c="${i}"]`); await s.page.waitForTimeout(1300);
      reg('cartões ' + ini, n[i], { erroClique: er, estado: await estado(s), erros: s.erros.splice(0) });
    }
  }
  // menu do Mercado financeiro (abas e listas)
  for (const merc of ['br', 'us']) {
    await abrirEm(s, '#/investimentos/mercado-financeiro', 2200);
    if (merc === 'us') { await s.page.selectOption('#mercado-acoes', 'us').catch(() => {}); await s.page.waitForTimeout(800); }
    const abas = await s.page.evaluate(() => [...document.querySelectorAll('#mf-barra .mf-item')].filter(e => e.getBoundingClientRect().height > 0).map(e => e.getAttribute('data-menu') + '|' + e.textContent.trim()));
    for (const a of abas) {
      const menu = a.split('|')[0];
      await abrirEm(s, '#/investimentos/mercado-financeiro', 2000);
      if (merc === 'us') { await s.page.selectOption('#mercado-acoes', 'us').catch(() => {}); await s.page.waitForTimeout(600); }
      const seq = [];
      for (let k = 0; k < 2; k++) { const e = await clicar(s, `#mf-barra .mf-item[data-menu="${menu}"]`); await s.page.waitForTimeout(350); const st = await estado(s); seq.push({ erro: e, dd: st.dd }); }
      reg('Mercado financeiro (' + merc + ')', 'aba ' + a.split('|')[1] + ': 1º e 2º clique', { seq, erros: s.erros.splice(0) });
      const links = await s.page.evaluate(m => { const d = document.querySelector(`#mf-dd-${m}`); return d ? [...d.querySelectorAll('a')].filter(x => getComputedStyle(x).display !== 'none').map(x => x.getAttribute('data-acao') + '|' + x.textContent.trim().replace(/\s+/g, ' ').slice(0, 45)) : []; }, menu);
      for (const l of links) {
        const ac = l.split('|')[0];
        await abrirEm(s, '#/investimentos/mercado-financeiro', 1800);
        if (merc === 'us') { await s.page.selectOption('#mercado-acoes', 'us').catch(() => {}); await s.page.waitForTimeout(600); }
        await clicar(s, `#mf-barra .mf-item[data-menu="${menu}"]`); await s.page.waitForTimeout(300);
        const er = await clicar(s, `#mf-dd-${menu} a[data-acao="${ac}"]`); await s.page.waitForTimeout(1400);
        const st = await estado(s);
        const conteudo = await s.page.evaluate(() => { const c = document.getElementById('mf-analises-pub'); const vis = c && getComputedStyle(c).display !== 'none';
          const h = [...document.querySelectorAll('#painel-acoes h2, #painel-acoes h3')].find(e => e.getBoundingClientRect().height > 0 && !e.closest('.mf-dropdown')); return { pub: !!vis, h: h ? h.textContent.trim().slice(0, 60) : '' }; });
        reg('Mercado financeiro (' + merc + ')', a.split('|')[1] + ' › ' + l.split('|')[1], { erroClique: er, estado: st, conteudo, erros: s.erros.splice(0) });
      }
    }
  }
  await s.ctx.close();
}

/* ---------------- fase 4: rotas ---------------- */
async function faseRotas(browser) {
  const s = await nova(browser, 'admin');
  await abrirEm(s, '#/educacao', 2500);
  const info = await s.page.evaluate(() => ({ rotas: Object.keys(ROTAS), redir: Object.keys(ROTAS_REDIRECT), mf: MF_SUBROTAS.slice(),
    views: [...document.querySelectorAll('.spine .nav-item[data-view]')].map(i => (i.getAttribute('data-grupo') === 'fiscal' ? 'gestao-fiscal/' : 'gestao-financeira/') + i.getAttribute('data-view')) }));
  const lista = ['', 'inicio', 'contato', 'quem-somos', 'equipe', 'noticias', 'noticias/eua', 'servicos/consultoria', 'servicos/ativos', 'servicos/educacao-financeira', 'servicos/educacao-tributaria', 'servicos/caixa',
    'executivo/consultoria', 'executivo/ativos', 'executivo/educacao', 'educacao/preparatorios', 'educacao/livres', 'educacao/artigos', 'educacao/preparatorios/certificacoes', 'investimentos/mercado-financeiro/eua', 'rota-que-nao-existe']
    .concat(info.rotas, info.redir, info.mf.map(m => 'investimentos/mercado-financeiro/' + m), info.views);
  const vistos = new Set();
  for (const r of lista) {
    if (vistos.has(r)) continue; vistos.add(r);
    // 1. navegando (troca de endereço dentro da página)
    await abrirEm(s, '#/educacao', 1500);
    await s.page.evaluate(h => { location.hash = h; }, '#/' + r); await s.page.waitForTimeout(1400);
    const nav = await estado(s); const e1 = s.erros.splice(0);
    // 2. Voltar do navegador
    await s.page.goBack().catch(() => {}); await s.page.waitForTimeout(1000); const volta = await estado(s);
    // 3. abrindo o endereço direto (link salvo / recarregar)
    await abrirEm(s, '#/' + r, 2400); const dir = await estado(s); const e2 = s.erros.splice(0);
    reg('rota', '#/' + r, { nav, volta: { hash: volta.hash, telas: volta.telas, painel: volta.painel }, direto: dir, erros: e1.concat(e2) });
  }
  // sem login: as rotas da plataforma levam ao login? as públicas abrem?
  const p = await nova(browser, null);
  for (const r of ['', 'quem-somos', 'equipe', 'noticias', 'servicos/consultoria', 'contato', 'inicio', 'educacao', 'investimentos', 'investimentos/mercado-financeiro/alvos-soliduns', 'gestao-fiscal', 'calculadoras', 'avaliacao-imoveis', 'leilao', 'rota-que-nao-existe']) {
    await abrirEm(p, '#/' + r, 2200);
    reg('rota sem login', '#/' + r, { direto: await estado(p), erros: p.erros.splice(0) });
  }
  await p.ctx.close(); await s.ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (FASE === 'publico') await fasePublica(browser, null);
    else if (FASE === 'logado') await fasePublica(browser, 'admin');
    else if (FASE === 'plataforma') await fasePlataforma(browser);
    else if (FASE === 'rotas') await faseRotas(browser);
  } catch (e) { res.erroAuditoria = String(e.stack || e).slice(0, 800); console.log('ERRO NA AUDITORIA', e); }
  fs.writeFileSync(SAIDA, JSON.stringify(res, null, 1));
  console.log(FASE, MODO, 'itens:', res.itens.length);
  await browser.close();
})();
