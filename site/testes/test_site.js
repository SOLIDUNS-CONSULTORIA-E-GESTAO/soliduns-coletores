// Testes da v131 no site (capa, página do artigo, publicidade, passagem, cabeçalho intacto). Rodar: node test_site.js
const { chromium } = require('playwright');
const { ligar, SUPA } = require('./simulador');
const fs = require('fs');
const BASE = 'http://localhost:8132/';
let falhas = 0;
const ok = (c, n) => { console.log((c ? 'OK  ' : 'FALHOU ') + n); if (!c) falhas++; };
const ED = { data: new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), gerado_em: new Date().toISOString(), fontes: [],
  conteudo: { manchete: { cartola: 'JUROS', titulo: 'Manchete de teste', linha_fina: 'Linha fina de teste', corpo: ['Primeiro parágrafo.', 'Segundo parágrafo.', 'Terceiro parágrafo.', 'Quarto.'] }, scanner: {} } };

(async () => {
  // 0. cabeçalho e logo: idênticos aos da v130
  const v130 = fs.readFileSync('/home/claude/v120/index_v130_completo.html', 'utf8'), v131 = fs.readFileSync('/home/claude/v120/index_v131_completo.html', 'utf8');
  const cabs = s => [...s.matchAll(/<header class="landing-header">[\s\S]*?<\/header>/g)].map(m => m[0]);
  ok(cabs(v130).length > 3 && JSON.stringify(cabs(v130)) === JSON.stringify(cabs(v131)), 'cabeçalhos e logo do site idênticos aos da v130 (' + cabs(v131).length + ' cabeçalhos)');
  const mast = s => (s.match(/<div class="vm-mast">[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
  ok(mast(v130) === mast(v131) && mast(v131).includes('VALOR E MERCADO'), 'logomarca do jornal intocada');
  ok(!/\bIA\b|intelig[êe]ncia artificial/i.test(v131.slice(v131.indexOf('v131: VALOR E MERCADO'), v131.indexOf('v131: VALOR E MERCADO') + 20000)), 'nada de IA no código novo da página');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  const { db } = await ligar(page);
  await db.query("update public.vm_publicidade_espacos set ativo = true");
  await db.query("insert into public.vm_banners (espaco, imagem_url, link, alt, inicio, fim, ativo) values ('artigo', 'https://evcsniicnrlrtzpdmeza.supabase.co/storage/v1/object/public/vm-imagens/2026/10/aaaaaaaaaaaaaaaaaaaa.jpg', 'https://exemplo.com.br/a', 'Banner no texto', current_date - 1, current_date + 30, true), ('topo', 'https://evcsniicnrlrtzpdmeza.supabase.co/storage/v1/object/public/vm-imagens/2026/10/bbbbbbbbbbbbbbbbbbbb.jpg', 'https://exemplo.com.br/t', 'Banner do topo', current_date - 1, current_date + 30, true)");
  const art = (await db.query("select id, titulo from public.vm_artigos where situacao = 'publicado' order by publicado_em desc limit 1")).rows[0];
  await page.route(SUPA + '/rest/v1/rpc/vm_edicao_publica', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ED) }));

  // 1. capa
  await page.goto(BASE + '#/noticias'); await page.waitForTimeout(2500);
  ok(await page.$eval('#vm-artigos', e => !e.hidden && e.textContent.includes('Artigos')), 'seção Artigos aparece na capa');
  ok((await page.textContent('#vm-artigos')).includes(art.titulo), 'artigo publicado aparece na seção');
  ok(await page.$eval('#vm-pub-lateral', e => !e.hidden && !!e.querySelector('a[rel~="sponsored"] img')), 'banner lateral com rel=sponsored');
  ok(await page.$eval('#vm-pub-topo', e => !e.hidden && e.textContent.includes('Publicidade')), 'faixa do topo (ligada no teste) com etiqueta Publicidade');
  ok(await page.$eval('#vm-texto', e => { const k = [...e.children]; const i = k.findIndex(x => x.classList.contains('vm-pub-texto')); return i === 2 && k[0].tagName === 'P' && k[1].tagName === 'P'; }), 'publicidade dentro da manchete depois do 2º parágrafo');
  const area = await page.$eval('#vm-artigos', e => getComputedStyle(e).gridArea);
  ok(/artigos/.test(area), 'seção na área própria da grade: ' + area);
  await page.screenshot({ path: '/tmp/claude-0/-home-claude/023e1588-22d2-55db-b7be-766ecceeed2a/scratchpad/site_capa.png', fullPage: false });

  // 2. página do artigo
  await page.click('#vm-artigos .vm-art-dest .vm-art-tit a'); await page.waitForTimeout(1500);
  ok(page.url().endsWith('#/noticias/artigo/' + art.id), 'link da capa abre #/noticias/artigo/' + art.id);
  ok((await page.textContent('#vm-leitura h1')) === art.titulo, 'título do artigo na página');
  const html = await page.$eval('#vm-art-texto', e => e.innerHTML);
  ok(html.includes('<strong>Selic</strong>'), 'negrito do editor aparece');
  ok(/class="vm-ticker" href="#\/investimentos\/mercado-financeiro\/relatorios\?ticker=PETR4"/.test(html), 'PETR4 vira link para a SOLIDUNS');
  ok(html.includes('vm-art-num') && html.includes('vm-art-tab') && html.includes('vm-art-pdf') && /<ul>/.test(html), 'box numérico, tabela, PDF e lista renderizados');
  ok((await page.textContent('#vm-leitura')).includes('Correção'), 'nota de correção no fim');
  ok(await page.$eval('#vm-pub-topo', e => getComputedStyle(e).display === 'none'), 'faixa do topo some na página do artigo');
  ok((await page.textContent('.vm-leit-assin')).includes('Editor: Dr. Thiago Viegas'), 'assinatura com o editor');
  ok(await page.$eval('#vm-leitura', e => [...e.querySelectorAll('.vm-comp-wa')].some(a => decodeURIComponent(a.href).includes('noticias/?artigo='))), 'compartilhar usa /noticias/?artigo=');
  ok((await page.title()).includes('Valor e Mercado'), 'título da aba: ' + await page.title());
  // XSS: conteúdo com tag não vira HTML
  await db.query("update public.vm_artigos set corpo = corpo || '[{\"tipo\":\"paragrafo\",\"conteudo\":[{\"texto\":\"<img src=x onerror=alert(1)>\"}]}]'::jsonb where id = $1", [art.id]);
  await page.goto(BASE + '#/noticias'); await page.waitForTimeout(800); await page.goto(BASE + '#/noticias/artigo/' + art.id); await page.waitForTimeout(1500);
  ok(await page.$eval('#vm-art-texto', e => !e.querySelector('img[onerror]') && e.textContent.includes('<img src=x')), 'texto com tag aparece escapado (sem HTML injetado)');
  await page.screenshot({ path: '/tmp/claude-0/-home-claude/023e1588-22d2-55db-b7be-766ecceeed2a/scratchpad/site_artigo.png', fullPage: false });
  // artigo inexistente
  await page.goto(BASE + '#/noticias/artigo/999999'); await page.waitForTimeout(1200);
  ok((await page.textContent('#vm-leitura')).includes('Artigo não encontrado'), 'artigo inexistente: aviso');
  // Scanner continua abrindo pela mesma rota
  await page.goto(BASE + '#/noticias/scanner'); await page.waitForTimeout(1200);
  ok((await page.textContent('#vm-leitura')).includes('Scanner'), 'rota do Scanner continua funcionando');

  // 3. passagem e Redação
  await page.goto(BASE + 'noticias/?artigo=' + art.id); await page.waitForTimeout(1500);
  ok(page.url().endsWith('/#/noticias/artigo/' + art.id), 'passagem /noticias/?artigo= leva ao artigo');
  await page.goto(BASE + 'noticias/?scanner=2026-10-16'); await page.waitForTimeout(800);
  ok(page.url().endsWith('/#/noticias/scanner/2026-10-16'), 'passagem do Scanner antiga continua valendo');
  const red = await (await page.request.get(BASE + 'noticias/redacao/')).text();
  ok(red.includes('Redação · Valor e Mercado') && red.includes('cms.css'), 'Redação publicada em /noticias/redacao/');
  ok(v131.includes("location.href = '/noticias/redacao/'"), 'botão Redação aponta para o CMS');

  // 4. celular: sem rolagem lateral
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '#/noticias'); await page.waitForTimeout(1800);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'capa no celular sem rolagem lateral');
  await page.goto(BASE + '#/noticias/artigo/' + art.id); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'artigo no celular sem rolagem lateral');
  await page.screenshot({ path: '/tmp/claude-0/-home-claude/023e1588-22d2-55db-b7be-766ecceeed2a/scratchpad/site_artigo_cel.png', fullPage: true });
  ok(erros.filter(e => !/Failed to fetch|NetworkError|net::/.test(e)).length === 0, 'sem erros de JavaScript: ' + erros.join(' | ').slice(0, 300));
  await browser.close(); await db.end();
  console.log(falhas ? falhas + ' FALHA(S)' : 'TUDO OK');
  process.exit(falhas ? 1 : 0);
})();
