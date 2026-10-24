// Teste da v175: os arquivos que só existiam no Netlify (sumiram nas publicações desde 17/10) voltaram ao pacote.
// Servir publicar/ em http://localhost:8185. Rodar: node test_restauro_v175.js pasta_das_imagens
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
let falhas = 0;
const ok = (c, n) => { console.log((c ? 'OK  ' : 'FALHOU ') + n); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const movel = w < 768;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: movel, hasTouch: movel, deviceScaleFactor: movel ? 3 : 1 });
    await ctx.addInitScript(x => { try { localStorage.setItem('gestao-fiscal-auth-session', x); localStorage.setItem('sol-app-aviso-v173', String(Date.now())); } catch (e) {} },
      JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600e3, email: 'dr.thiago.viegas@gmail.com', nome: 'Thiago', perfil: 'admin', user: { id: '11111111-1111-1111-1111-111111111111', email: 'dr.thiago.viegas@gmail.com' } }));
    await ctx.route('https://evcsniicnrlrtzpdmeza.supabase.co/**', r => { const u = new URL(r.request().url());
      if (u.pathname === '/rest/v1/acessos') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ status: 'aprovado', perfil: 'admin', nome: 'Thiago' }]) });
      if (/cpf/i.test(u.search)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[{"cpf":"52998224725"}]' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: u.pathname.startsWith('/rest/v1/rpc/') ? 'null' : '[]' }); });
    await ctx.route(/^https:\/\/(?!evcsniicnrlrtzpdmeza)(?!localhost).*/, r => r.abort());
    const p = await ctx.newPage();
    await p.goto('http://localhost:8185/index.html#/avaliacao-imoveis'); await p.waitForTimeout(3000);
    const fr = p.frame({ url: /avaliacao\.html/ });
    const titulo = fr ? await fr.title().catch(() => '') : '';
    const texto = fr ? (await fr.textContent('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 120) : '';
    ok(/Avaliação de imóveis/.test(titulo) && !/Page not found|404/.test(texto), `${w} px: Avaliação de imóveis abre dentro da plataforma ("${texto.slice(0, 70)}…")`);
    await p.screenshot({ path: `${OUT}/v175_avaliacao_${w}.png` });
    if (w === 1440) {
      for (const f of ['/privacidade.html', '/termos.html', '/verificar.html?c=TESTE', '/robots.txt', '/sitemap.xml', '/logos/index.json', '/logos/caixa.png', '/vendor/lightweight-charts-4.2.3.standalone.production.js']) {
        const r = await p.request.get('http://localhost:8185' + f);
        ok(r.status() === 200, f + ' responde (HTTP ' + r.status() + ')');
      }
    }
    await ctx.close();
  }
  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
  process.exit(falhas ? 1 : 0);
})();
