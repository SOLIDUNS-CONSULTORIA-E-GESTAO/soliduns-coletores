// Testes da Redação v131 (CMS) — página real + funções SQL reais (banco t131). Rodar: node test_cms.js
const { chromium } = require('playwright');
const { ligar } = require('./simulador');
const fs = require('fs'), path = require('path');
const BASE = 'http://localhost:8131/index.html';
let falhas = 0;
const ok = (c, n) => { console.log((c ? 'OK  ' : 'FALHOU ') + n); if (!c) falhas++; };
const SESSAO = { access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600e3, email: 'dr.thiago.viegas@gmail.com', nome: 'Dr. Thiago Viegas',
  user: { id: '11111111-1111-1111-1111-111111111111', email: 'dr.thiago.viegas@gmail.com' } };
const FOTO = '/home/claude/v120/og-scanner-do-dia.jpg';
const PDF = path.join(__dirname, 'teste.pdf');
fs.writeFileSync(PDF, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function nova(browser, opc = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  if (opc.sessao !== false) await page.addInitScript(s => localStorage.setItem('gestao-fiscal-auth-session', s), JSON.stringify(SESSAO));
  const sim = await ligar(page, opc);
  return { ctx, page, erros, ...sim };
}
const toastTem = async (page, txt) => { await page.waitForFunction(t => [...document.querySelectorAll('#toasts div')].some(d => d.textContent.includes(t)), txt, { timeout: 8000 }).catch(() => {}); return page.evaluate(t => [...document.querySelectorAll('#toasts div')].some(d => d.textContent.includes(t)), txt); };

(async () => {
  const browser = await chromium.launch();
  // ---------- 1. editor entra, escreve, salva com foto, anexo, lista, tabela e número
  let { ctx, page, erros, db, log } = await nova(browser);
  await page.goto(BASE); await page.waitForFunction(() => document.getElementById('portao').classList.contains('hidden'), null, { timeout: 8000 }).catch(() => {});
  ok(await page.$eval('#portao', e => e.classList.contains('hidden')), 'editor entra na Redação (portão fechado)');
  ok((await page.textContent('#u-nome')).includes('Thiago') && (await page.textContent('#u-ini')) === 'TV', 'nome e iniciais do editor');
  await page.fill('#f-chapeu', 'Juros');
  await page.fill('#f-titulo', 'Copom mantém a Selic e reforça cautela com a inflação');
  await page.fill('#f-linha', 'Decisão unânime preserva a taxa básica; comunicado cita expectativas acima da meta e incerteza externa como razões para manter a política monetária restritiva por mais tempo.');
  const ed = page.locator('#blocos .editor-bloco').first();
  await ed.click(); await page.keyboard.type('O Comitê de Política Monetária manteve a Selic em 15,00% ao ano. PETR4 subiu no dia.');
  // negrito em "Selic"
  await page.evaluate(() => { const e = document.querySelector('#blocos .editor-bloco'); selecionar(e, 41, 46); });
  await page.click('[data-cmd="negrito"]');
  ok(await page.$eval('#blocos .editor-bloco', e => e.innerHTML.includes('<strong>Selic</strong>')), 'negrito aplicado no trecho');
  await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.type('Segundo parágrafo com a reação do mercado.');
  await page.click('[data-cmd="lista"]'); await page.fill('#blocos .l-itens', 'Selic mantida\nIPCA acima da meta');
  await page.click('[data-cmd="numero"]'); await page.fill('#blocos .n-valor', '15,00%'); await page.fill('#blocos .n-leg', 'Selic mantida pela 4ª reunião seguida');
  await page.click('[data-cmd="tabela"]');
  await page.locator('#blocos .t-grade input').nth(3).fill('Itaú'); await page.locator('#blocos .t-grade input').nth(4).fill('10.500'); await page.locator('#blocos .t-grade input').nth(5).fill('+3,2%');
  await page.setInputFiles('#arq-anexo', PDF);
  await page.setInputFiles('#foto-arq', FOTO); await page.waitForTimeout(400);
  await page.fill('#f-alt', 'Logomarca do Scanner do Dia'); await page.fill('#f-fotografo', 'Redação');
  await page.click('#btn-fonte'); await page.locator('#fontes li input').nth(0).fill('Comunicado do Copom'); await page.locator('#fontes li input').nth(1).fill('https://www.bcb.gov.br/publicacoes/comunicadoscopom');
  await page.fill('#f-tag', 'Selic'); await page.press('#f-tag', 'Enter');
  await page.click('#btn-salvar');
  ok(await toastTem(page, 'Rascunho salvo.'), 'rascunho salvo no banco');
  let a = (await db.query('select * from public.vm_artigos order by id desc limit 1')).rows[0];
  ok(a && a.titulo.startsWith('Copom mantém') && a.situacao === 'rascunho', 'linha gravada como rascunho');
  ok(a.foto && /\/vm-imagens\/\d{4}\/\d{2}\/[a-f0-9]{40}\.jpg$/.test(a.foto.src) && a.foto.alt === 'Logomarca do Scanner do Dia', 'foto de capa enviada ao Storage com nome por hash');
  const tipos = a.corpo.map(b => b.tipo).join(',');
  ok(tipos === 'paragrafo,paragrafo,lista,numero,tabela,anexo', 'corpo com 6 blocos na ordem: ' + tipos);
  ok(JSON.stringify(a.corpo[0].conteudo).includes('"marca":"negrito"'), 'negrito vai para o JSON fechado');
  ok(/vm-anexos\/\d{4}\/\d{2}\/[a-f0-9]{40}\.pdf$/.test(a.corpo[5].url), 'PDF anexado sobe para vm-anexos e passa no validador');
  ok(a.fontes.length === 1 && a.tags.join() === 'Selic', 'fontes e tags gravadas');
  ok(log.filter(l => l.storage).every(l => l.ok), 'nomes de arquivo aceitos pela política do Storage');
  const midias = (await db.query('select count(*)::int n from public.vm_midias')).rows[0].n;
  ok(midias >= 2, 'mídias registradas (foto + PDF): ' + midias);
  // salvar de novo não reenvia a foto
  const antes = log.filter(l => l.storage).length;
  await page.fill('#f-chapeu', 'Juros e inflação'); await page.click('#btn-salvar'); await page.waitForTimeout(800);
  ok(log.filter(l => l.storage).length === antes, 'segundo salvamento não reenvia arquivos');
  // ---------- 2. publicar
  await page.click('#btn-publicar'); await page.click('#cf-sim');
  ok(await toastTem(page, 'Artigo publicado.'), 'publicação confirmada');
  a = (await db.query('select * from public.vm_artigos where id = $1', [a.id])).rows[0];
  ok(a.situacao === 'publicado' && a.publicado_em, 'artigo no ar no banco');
  ok((await page.textContent('#btn-publicar')).includes('Salvar correção'), 'botão vira "Salvar correção" no publicado');
  const pub = (await db.query('select public.vm_artigo_publico($1) r', [a.id])).rows[0].r;
  ok(pub && pub.titulo === a.titulo, 'leitura pública do artigo funciona');
  ok(erros.length === 0, 'sem erros de JavaScript na escrita: ' + erros.join(' | '));
  await ctx.close(); await db.end();

  // ---------- 3. reabrir pelo endereço (?artigo=) e corrigir
  ({ ctx, page, erros, db, log } = await nova(browser));
  await page.goto(BASE + '?artigo=' + a.id);
  await page.waitForFunction(() => document.getElementById('f-titulo').value.length > 0, null, { timeout: 8000 }).catch(() => {});
  ok((await page.inputValue('#f-titulo')) === a.titulo, 'artigo reaberto pelo endereço');
  ok(await page.$eval('#blocos .editor-bloco', e => e.innerHTML.includes('<strong>Selic</strong>')), 'formatação volta para o editor');
  ok((await page.$$('#blocos > div')).length === 6 && (await page.inputValue('#blocos .n-valor')) === '15,00%', 'blocos especiais reabertos');
  ok(!(await page.$eval('#thumb', e => e.classList.contains('hidden'))), 'foto de capa reaberta');
  await page.locator('#blocos .editor-bloco').nth(1).click(); await page.keyboard.press('End'); await page.keyboard.type(' Com ajuste.');
  await page.click('#btn-publicar');
  await page.fill('#cr-oque', 'acréscimo no segundo parágrafo'); await page.fill('#cr-antes', 'texto sem o ajuste');
  await page.click('#cr-sim');
  ok(await toastTem(page, 'Correção publicada.'), 'correção publicada');
  const c = (await db.query('select versao, correcoes, corpo from public.vm_artigos where id = $1', [a.id])).rows[0];
  ok(c.versao === 2 && c.correcoes.length === 1 && JSON.stringify(c.corpo).includes('Com ajuste'), 'versão 2 com nota de correção');
  // ---------- 4. listas, layout, publicidade, mídia, auditoria
  await page.click('[data-aba="publicados"]'); await page.waitForTimeout(600);
  ok((await page.textContent('#lista-pub')).includes('Copom mantém'), 'lista de publicados mostra o artigo');
  await page.click('[data-aba="layout"]'); await page.waitForTimeout(600);
  const nBlocos = await page.$$eval('#lay-blocos li', l => l.length);
  ok(nBlocos === 7, 'layout carrega os 7 blocos da capa');
  await page.click('[data-liga="6"]'); await page.click('#btn-aplicar');
  ok(await toastTem(page, 'Layout aplicado'), 'layout aplicado');
  const lay = (await db.query('select versao, layout from public.vm_layout_capa where ativo')).rows[0];
  ok(lay.versao >= 2 && lay.layout.blocos.find(b => b.tipo === 'radar').ativo === true, 'nova versão do layout no ar (radar ligado)');
  await page.click('[data-aba="banners"]'); await page.waitForTimeout(600);
  ok(await page.$$eval('#espacos [role="switch"]', l => l.length) === 3, 'três espaços de publicidade');
  await page.fill('#b-anunciante', 'Banco Teste'); await page.fill('#b-link', 'https://exemplo.com.br'); await page.fill('#b-alt', 'Conta digital Banco Teste');
  await page.fill('#b-ini', '2026-10-16'); await page.fill('#b-fim', '2026-11-16');
  await page.setInputFiles('#b-img', FOTO); await page.waitForTimeout(300);
  await page.click('#b-salvar');
  ok(await toastTem(page, 'Banner salvo.'), 'banner salvo');
  const ban = (await db.query("select * from public.vm_banners order by id desc limit 1")).rows[0];
  ok(ban && ban.espaco === 'lateral' && ban.anunciante === 'Banco Teste' && /vm-imagens/.test(ban.imagem_url), 'banner gravado com imagem no Storage');
  const pubBan = (await db.query('select public.vm_banners_publicos() r')).rows[0].r;
  ok(pubBan.lateral && pubBan.lateral.banners.length >= 1, 'banner aparece na leitura pública do espaço lateral');
  await page.click('[data-aba="midia"]'); await page.waitForTimeout(600);
  ok(await page.$$eval('#lista-midia figure', l => l.length) >= 2, 'mídia lista os arquivos enviados');
  await page.click('[data-aba="auditoria"]'); await page.waitForTimeout(600);
  const aud = await page.textContent('#lista-aud');
  ok(/publicou/.test(aud) && /corrigiu|editou/.test(aud), 'auditoria registra publicação e correção');
  await page.click('[data-aba="painel"]'); await page.waitForTimeout(600);
  ok((await page.textContent('#p-hoje')).trim() !== '–', 'painel preenchido');
  ok(erros.length === 0, 'sem erros de JavaScript nas abas: ' + erros.join(' | '));
  await page.screenshot({ path: '/tmp/claude-0/-home-claude/023e1588-22d2-55db-b7be-766ecceeed2a/scratchpad/cms_painel.png' });
  await page.click('[data-aba="escrever"]'); await page.screenshot({ path: '/tmp/claude-0/-home-claude/023e1588-22d2-55db-b7be-766ecceeed2a/scratchpad/cms_escrever.png', fullPage: false });
  await ctx.close(); await db.end();

  // ---------- 5. quem não é editor e quem não entrou
  ({ ctx, page, erros, db } = await nova(browser, { editor: false }));
  await page.goto(BASE); await page.waitForTimeout(1200);
  ok(!(await page.$eval('#portao', e => e.classList.contains('hidden'))) && (await page.textContent('#portao-msg')).includes('não tem acesso'), 'conta sem perfil de editor fica no portão');
  await ctx.close(); await db.end();
  ({ ctx, page, erros, db } = await nova(browser, { sessao: false }));
  await page.goto(BASE); await page.waitForTimeout(1200);
  ok((await page.textContent('#portao-msg')).includes('Entre no site'), 'sem sessão: pede para entrar no site');
  await ctx.close(); await db.end();
  await browser.close();
  console.log(falhas ? falhas + ' FALHA(S)' : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})();
