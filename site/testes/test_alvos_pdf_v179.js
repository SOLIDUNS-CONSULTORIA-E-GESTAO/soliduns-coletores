// Teste da v179 (Alvos SOLIDUNS: botão "Baixar PDF / imprimir" no topo, ao lado do título; função da v178). Página real (publicar/ servida em http://localhost:8167)
// com a RPC alvos_publico simulada por uma lista de 155 ações no formato da SQL 186.
// Rodar: node test_alvos_pdf_v178.js pasta_das_capturas   (gera também o PDF de exemplo na pasta)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SUPA = 'https://evcsniicnrlrtzpdmeza.supabase.co';
const BASE = 'http://localhost:8167/index.html';
const OUT = process.argv[2] || '.';
let falhas = 0;
const ok = (c, n, d) => { console.log((c ? 'OK  ' : 'FALHOU ') + n + (c || d === undefined ? '' : '  -> ' + JSON.stringify(d).slice(0, 300))); if (!c) falhas++; };

const SETORES = ['Construção civil e incorporação', 'Varejo e consumo discricionário', 'Saúde e educação privadas', 'Bancos e serviços financeiros', 'Energia elétrica', 'Petróleo e gás', 'Mineração e siderurgia'];
// ALVOS_JSON=arquivo usa uma lista real (cópia feita pelo workflow "Pesquisa - lista do Alvos"); sem ela, usa a lista simulada.
function dados() {
  if (process.env.ALVOS_JSON) return JSON.parse(fs.readFileSync(process.env.ALVOS_JSON, 'utf8'));
  const acoes = [['AZEV3', 'AZEVEDO & TRAVASSOS', 13.57, 11.41, 13.71, 5.51, 15.52, 17.07], ['LJQQ3', 'LOJAS QUERO-QUERO S.A.', 3.00, 2.61, 3.03, 1.812, 3.25, 3.25],
                 ['MGLU3', 'MAGAZINE LUIZA SA', 12.78, 11.35, 12.91, 8.09, 13.93, 13.93], ['DASA3', 'DIAGNOSTICOS DA AMERICA SA', 5.04, 4.73, 5.09, 3.49, 5.72, 5.79]];
  for (let i = 4; i < 155; i++) { const p = 5 + (i * 7.3) % 60; acoes.push(['TST' + String(i).padStart(2, '0') + '3', 'EMPRESA TESTE ' + i + ' S.A.', p, p * 0.93, p * 1.01, p * 0.8, p * 1.05, p * (1.02 + (i % 9) / 100)]); }
  return { admin: true, previa: true, ultima_publicada: null,
    execucao: { id: 7, data_referencia: '2026-10-22', resultado: '', executado_em: '2026-10-23T22:38:00-03:00', p_d: 0.75, cds_pb: 110, cds_d_pb: 94, cds_e_pb: 156, n_acoes: 155,
      publicado: false, candidato_d: 'Flávio Bolsonaro', candidato_e: 'Lula', ganho_destaque: 0.20, avisos: ['aviso de teste'] },
    acoes: acoes.map((a, i) => ({ posicao: i + 1, ticker: a[0], empresa: a[1], setor: SETORES[i % SETORES.length], preco: a[2], ent_ideal: a[3], ent_max: a[4], stop: a[5],
      alvo1: a[6], alvo2_d: a[7], alvo2_n: a[6], ganho_d: a[7] / a[3] - 1, ganho_n: a[6] / a[3] - 1, rr_d: (a[7] - a[3]) / (a[3] - a[5]), rr_n: (a[6] - a[3]) / (a[3] - a[5]),
      limpa: i % 5 !== 3, alertas: i % 5 === 3 ? ['prejuízo nos últimos 12 meses', 'ganho/risco abaixo de 1'] : [], origem_choque: 'robô', serie: [] })) };
}

async function abrir(browser, opc) {
  const ctx = await browser.newContext(opc || { viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage(); const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  const sessao = { access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600e3, email: 'dr.thiago.viegas@gmail.com', nome: 'Thiago', user: { id: '11111111-1111-1111-1111-111111111111', email: 'dr.thiago.viegas@gmail.com' } };
  await page.addInitScript(s => { try { localStorage.setItem('gestao-fiscal-auth-session', s); localStorage.setItem('sol-app-aviso-v173', String(Date.now())); } catch (e) {} }, JSON.stringify(sessao));
  const D = JSON.stringify(dados());
  await page.route(/^https:\/\/(?!evcsniicnrlrtzpdmeza)/, r => r.abort());
  await page.route(SUPA + '/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/rest/v1/rpc/alvos_publico') return route.fulfill({ status: 200, contentType: 'application/json', body: D });
    if (/cpf/i.test(url.pathname + url.search)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ cpf: '52998224725' }]) });
    if (url.pathname === '/rest/v1/acessos') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ status: 'aprovado', perfil: 'admin', nome: 'Thiago' }]) });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto(BASE + '#/investimentos/mercado-financeiro'); await page.waitForTimeout(2500);
  await page.evaluate(() => alMostrar()); await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__impressoes = 0; window.print = () => { window.__impressoes++; }; });
  return { ctx, page, erros };
}

(async () => {
  const browser = await chromium.launch();
  const idx = fs.readFileSync(path.join(__dirname, '..', 'publicar', 'index.html'), 'utf8');
  ok(/<!-- v178 \(24\/10\/2026\)[^\n]*-->\n<script src="\/assets\/sol-[0-9a-f]{10}\.js" charset="utf-8"><\/script>\n\n<!-- v179 \(24\/10\/2026\)[^\n]*-->\n<script src="\/assets\/sol-[0-9a-f]{10}\.js"/.test(idx), 'index.html carrega a v178 e, logo depois, a v179');
  ok(!/\bIA\b|intelig[êe]ncia artificial/i.test((fs.readFileSync(path.join(__dirname, '..', 'fontes', 'v178_alvos_pdf.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'fontes', 'v179_alvos_pdf_topo.js'), 'utf8'))), 'nada de IA no código novo');

  let s = await abrir(browser);
  const btn = await s.page.evaluate(() => { const b = document.getElementById('al-imprimir'); const r = b && b.getBoundingClientRect(), h = b.closest('.rel-topo').querySelector('h2').getBoundingClientRect(); return b && { txt: b.textContent, noTopo: !!b.closest('.rel-topo'), mesmaLinha: r.top < h.bottom && r.bottom > h.top, aDireita: r.left > h.right, vis: r.width > 0, unico: document.querySelectorAll('#al-imprimir').length === 1, naBarra: !!document.querySelector('.al-filtros #al-imprimir') }; });
  ok(btn && btn.txt === 'Baixar PDF / imprimir' && btn.noTopo && btn.mesmaLinha && btn.aDireita && btn.vis && btn.unico && !btn.naBarra, 'botão "Baixar PDF / imprimir" no topo, na linha do título "Alvos SOLIDUNS", à direita (um só)', btn);
  await s.page.screenshot({ path: path.join(OUT, 'v179_alvos_botao.png') });
  await s.page.click('#al-imprimir'); await s.page.waitForTimeout(800);
  const r1 = await s.page.evaluate(() => { const d = document.getElementById('rel-impressao');
    return d && { imp: window.__impressoes, capa: !!d.querySelector('.rp-capa .rp-logo'), tit: d.querySelector('.rp-titulo').textContent, linhas: d.querySelectorAll('.alp-tabela tbody tr').length,
      tela: document.querySelectorAll('#al-corpo tr.al-linha').length, prim: [...d.querySelectorAll('.alp-tabela tbody tr')].slice(0, 2).map(t => t.cells[1].textContent),
      primTela: [...document.querySelectorAll('#al-corpo tr.al-linha')].slice(0, 2).map(t => t.dataset.alTk), previa: /PRÉVIA/.test(d.querySelector('.rp-sub').textContent),
      ler: !!d.querySelector('.alp-ler li'), alertaTexto: (() => { const x = (_al.dados.acoes || []).find(a => (a.alertas || []).length); return !x || d.textContent.indexOf(x.alertas[0]) >= 0; })(), doc: document.title }; });
  ok(r1 && r1.imp === 1, 'o clique abre a janela de imprimir / salvar PDF', r1);
  ok(r1 && r1.capa && r1.tit === 'ALVOS SOLIDUNS' && r1.previa, 'capa SOLIDUNS com logo, título e o aviso de prévia (administrador)', r1);
  ok(r1 && r1.linhas === r1.tela && r1.linhas === 155 && JSON.stringify(r1.prim) === JSON.stringify(r1.primTela), 'PDF com as mesmas 155 ações e a mesma ordem da tela', r1);
  ok(r1 && r1.ler && r1.alertaTexto, 'PDF traz "Como ler os alvos" e os alertas por extenso', r1);
  ok(r1 && /^Alvos SOLIDUNS \d\d-\d\d-\d{4}$/.test(r1.doc), 'nome do arquivo sugerido: "Alvos SOLIDUNS dd-mm-aaaa" (data do pregão)', r1 && r1.doc);
  await s.page.pdf({ path: path.join(OUT, 'v178_alvos_exemplo.pdf'), preferCSSPageSize: true, printBackground: true });
  ok(fs.statSync(path.join(OUT, 'v178_alvos_exemplo.pdf')).size > 20000, 'PDF gerado (arquivo de exemplo na pasta das capturas)');
  await s.page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await s.page.waitForTimeout(200);
  ok(await s.page.evaluate(() => !document.getElementById('rel-impressao') && !/^Alvos SOLIDUNS \d/.test(document.title)), 'depois de imprimir a página volta ao normal');
  // filtros: setor + esconder alertas + ordem por ação
  const SETOR = await s.page.evaluate(() => { const c = {}; _al.dados.acoes.filter(a => a.limpa).forEach(a => c[a.setor] = (c[a.setor] || 0) + 1); return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; });
  await s.page.selectOption('#al-setor', SETOR); await s.page.check('#al-limpas'); await s.page.waitForTimeout(300);
  ok(await s.page.evaluate(() => document.querySelectorAll('#al-imprimir').length === 1 && !!document.querySelector('.rel-topo #al-imprimir')), 'botão continua no topo (um só) depois de mudar os filtros');
  await s.page.click('#al-imprimir'); await s.page.waitForTimeout(600);
  const r2 = await s.page.evaluate(() => { const d = document.getElementById('rel-impressao');
    return { linhas: d.querySelectorAll('.alp-tabela tbody tr').length, tela: document.querySelectorAll('#al-corpo tr.al-linha').length, filtros: d.querySelector('.alp-filtros').textContent }; });
  ok(r2.linhas === r2.tela && r2.linhas > 0 && r2.linhas < 155 && r2.filtros.indexOf('setor: ' + SETOR) >= 0 && /alertas: escondidas/.test(r2.filtros), 'PDF segue os filtros da tela e diz quais foram usados', r2);
  ok(s.erros.length === 0, 'sem erros de JavaScript (computador)', s.erros);
  await s.ctx.close();

  s = await abrir(browser, { ...require('playwright').devices['iPhone 14'] });
  await s.page.evaluate(() => window.scrollTo(0, 0)); await s.page.waitForTimeout(200);
  const m = await s.page.evaluate(() => { const b = document.getElementById('al-imprimir'), r = b.getBoundingClientRect(); return { w: Math.round(r.width), dentro: r.right <= innerWidth + 1, naTela: r.bottom <= innerHeight, sobra: document.documentElement.scrollWidth - innerWidth }; });
  ok(m.w > 200 && m.dentro && m.naTela && m.sobra <= 1, 'celular: botão na largura da tela, visível sem rolar a página', m);
  await s.page.screenshot({ path: path.join(OUT, 'v179_alvos_celular.png') });
  await s.page.tap('#al-imprimir'); await s.page.waitForTimeout(600);
  ok(await s.page.evaluate(() => window.__impressoes === 1 && !!document.getElementById('rel-impressao')), 'celular: o toque abre a janela de imprimir / salvar PDF');
  ok(s.erros.length === 0, 'sem erros de JavaScript (celular)', s.erros);
  await s.ctx.close(); await browser.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
  process.exit(falhas ? 1 : 0);
})();
