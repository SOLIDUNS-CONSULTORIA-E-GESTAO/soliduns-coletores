-- 145_radar_mais_feeds.sql — Valor e Mercado: mais fontes no radar (plano de correção das fontes, item 5)
-- Pedido do Thiago (15/10/2026 20h39): "coloque mais fontes no radar — todas relevantes possíveis".
-- Cada feed abaixo foi aberto em 15/10 (XML válido, notícias recentes, robots.txt permite). Mesmo assim, pela regra do
-- projeto, NENHUM roda antes da conferência manual (verificada_em) — ver o item 3 no fim.
-- Rodar ANTES de colar o radar-fontes v1.1 na função clever-task (a v1.1 lê a coluna nova filtro_link).
--
-- Camadas: livre = obra pública/domínio público ou licença aberta (título + resumo do feed, com crédito);
--          pauta = direitos reservados, CC "sem derivações" (gov.br) ou termos não conferidos (só título, link e data).
-- Ficaram de fora: STJ (robots.txt bloqueia robôs), STF (sem feed no ar), Agência Gov e Fazenda/CVM/ANEEL/MME/Secom
-- (feeds parados desde agosto/setembro), EIA e BEA (robots.txt bloqueia /rss), FMI, Banco Mundial, OMC, OCDE, UNCTAD,
-- OPEP e IEA (sem feed oficial).

-- 1. Coluna nova: filtro de links (expressão regular) para feeds "do site inteiro" do gov.br, que misturam notícias
--    com PDFs, planilhas e imagens
alter table public.fontes_noticia add column if not exists filtro_link text;
comment on column public.fontes_noticia.filtro_link is 'expressão regular: o radar só guarda itens cujo link combina (vazio = todos)';

-- 2. Carga (url = endereço do feed; idempotente)
insert into public.fontes_noticia (nome, url, url_coleta, tipo, pilar, camada, licenca, cadencia, formato, situacao, filtro_link, observacao)
values
('BCB — Notícias (feed)',                    'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias',          'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias',          'rss', 3, 'livre', 'Comunicação oficial do Banco Central', 'continua', 'rss', 'ativa', null, 'Radar (item 5)'),
('Agência Brasil — Política (feed)',         'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml',             'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml',             'rss', 0, 'livre', 'CC BY 4.0 (conferir no site)',         'continua', 'rss', 'ativa', null, 'Radar (item 5); robots: Crawl-delay 10'),
('BCB — Comunicados do Copom (feed)',        'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/comunicadoscopom',  'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/comunicadoscopom',  'rss', 3, 'livre', 'Comunicação oficial do Banco Central', 'eventual', 'rss', 'ativa', null, 'Radar (item 5); um item por reunião'),
('Câmara — Notícias de economia (feed)',     'https://www.camara.leg.br/noticias/rss/dinamico/ECONOMIA',           'https://www.camara.leg.br/noticias/rss/dinamico/ECONOMIA',           'rss', 6, 'pauta', 'Copyright Câmara dos Deputados',       'continua', 'rss', 'ativa', null, 'Radar (item 5)'),
('Agência Senado — Notícias (feed)',         'https://www12.senado.leg.br/noticias/rss',                            'https://www12.senado.leg.br/noticias/rss',                            'rss', 6, 'pauta', 'Termos não conferidos',                'continua', 'rss', 'ativa', null, 'Radar (item 5)'),
('Agência Brasil — Internacional (feed)',    'https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml',        'https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml',        'rss', 0, 'livre', 'CC BY 4.0 (conferir no site)',         'continua', 'rss', 'ativa', null, 'Radar (item 5); robots: Crawl-delay 10'),
('CADE — Notícias (feed do site)',           'https://www.gov.br/cade/RSS',                                         'https://www.gov.br/cade/RSS',                                         'rss', 5, 'pauta', 'CC BY-ND 3.0 (gov.br)',                'diaria',   'rss', 'ativa', '/noticias[^/]*/(?!.*/view$)', 'Radar (item 5); feed do site inteiro, filtrado'),
('ANP — Notícias (feed do site)',            'https://www.gov.br/anp/RSS',                                          'https://www.gov.br/anp/RSS',                                          'rss', 2, 'pauta', 'CC BY-ND 3.0 (gov.br)',                'diaria',   'rss', 'ativa', '/noticias[^/]*/(?!.*/view$)', 'Radar (item 5); feed do site inteiro, filtrado'),
('Receita Federal — Notícias (feed do site)','https://www.gov.br/receitafederal/RSS',                               'https://www.gov.br/receitafederal/RSS',                               'rss', 6, 'pauta', 'CC BY-ND 3.0 (gov.br)',                'diaria',   'rss', 'ativa', '/noticias[^/]*/(?!.*/view$)', 'Radar (item 5); feed do site inteiro, filtrado'),
('Agência Brasil — Últimas notícias (feed)', 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml',      'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml',      'rss', 0, 'livre', 'CC BY 4.0 (conferir no site)',         'continua', 'rss', 'ativa', null, 'Radar (item 5); robots: Crawl-delay 10'),
('ANS — Notícias (feed do site)',            'https://www.gov.br/ans/RSS',                                          'https://www.gov.br/ans/RSS',                                          'rss', 0, 'pauta', 'CC BY-ND 3.0 (gov.br)',                'diaria',   'rss', 'ativa', '/noticias[^/]*/(?!.*/view$)', 'Radar (item 5); feed do site inteiro, filtrado'),
('IBGE — Agência de Notícias (feed)',        'https://agenciadenoticias.ibge.gov.br/agencia-rss',                   'https://agenciadenoticias.ibge.gov.br/agencia-rss',                   'rss', 6, 'pauta', 'Termos não conferidos',                'continua', 'rss', 'ativa', null, 'Radar (item 5); IBGE depende de decisão do Thiago'),
('Federal Reserve — Press releases (feed)',  'https://www.federalreserve.gov/feeds/press_all.xml',                  'https://www.federalreserve.gov/feeds/press_all.xml',                  'rss', 3, 'livre', 'Domínio público (governo dos EUA)',    'continua', 'rss', 'ativa', null, 'Radar (item 5)'),
('BLS — Inflação ao consumidor CPI (feed)',  'https://www.bls.gov/feed/cpi.rss',                                    'https://www.bls.gov/feed/cpi.rss',                                    'rss', 3, 'livre', 'Domínio público (governo dos EUA)',    'mensal',   'rss', 'ativa', null, 'Radar (item 5)'),
('BLS — Emprego, payroll (feed)',            'https://www.bls.gov/feed/empsit.rss',                                 'https://www.bls.gov/feed/empsit.rss',                                 'rss', 3, 'livre', 'Domínio público (governo dos EUA)',    'mensal',   'rss', 'ativa', null, 'Radar (item 5)'),
('BCE — Comunicados (feed)',                 'https://www.ecb.europa.eu/rss/press.html',                            'https://www.ecb.europa.eu/rss/press.html',                            'rss', 3, 'pauta', 'Termos do BCE não conferidos',         'continua', 'rss', 'ativa', null, 'Radar (item 5)'),
('Bank of England — News (feed)',            'https://www.bankofengland.co.uk/rss/news',                            'https://www.bankofengland.co.uk/rss/news',                            'rss', 3, 'pauta', 'Copyright Bank of England',            'continua', 'rss', 'ativa', null, 'Radar (item 5)'),
('Bank of Japan — What''s new (feed)',       'https://www.boj.or.jp/en/rss/whatsnew.xml',                           'https://www.boj.or.jp/en/rss/whatsnew.xml',                           'rss', 3, 'pauta', 'Copyright Bank of Japan',              'continua', 'rss', 'ativa', null, 'Radar (item 5); itens sem resumo'),
('USDA — Latest releases (feed)',            'https://www.usda.gov/rss/latest-releases.xml',                        'https://www.usda.gov/rss/latest-releases.xml',                        'rss', 4, 'livre', 'Domínio público (governo dos EUA)',    'continua', 'rss', 'ativa', null, 'Radar (item 5)'),
('SEC — Press releases (feed)',              'https://www.sec.gov/news/pressreleases.rss',                          'https://www.sec.gov/news/pressreleases.rss',                          'rss', 5, 'livre', 'Domínio público (governo dos EUA)',    'continua', 'rss', 'ativa', null, 'Radar (item 5)')
on conflict (url) do nothing;

-- conferência: esperado 1 linha "coluna ok | 20"
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'fontes_noticia' and column_name = 'filtro_link') = 1 as coluna_ok,
       (select count(*) from public.fontes_noticia where observacao like 'Radar (item 5)%') as feeds_novos;

-- 3. DEPOIS de abrir cada endereço e conferir os termos de uso, o Thiago libera os que aprovar
--    (apague da lista os que NÃO aprovar):
-- update public.fontes_noticia set verificada_em = now() where url in (
--   'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias', ... );
