create table if not exists public.noticias (id text primary key, regiao text, fonte text, titulo text, link text, publicado timestamptz, coletado_em timestamptz default now());
create table if not exists public.fontes_noticia (id bigint primary key, nome text, url text, url_coleta text);
create table if not exists public.vm_achados (id serial, fonte_id bigint, fonte_nome text, camada text, titulo text, resumo text, link text unique, publicado_em timestamptz, coletado_em timestamptz default now());
truncate public.noticias, public.vm_achados; delete from public.fontes_noticia;
insert into public.fontes_noticia values (1,'Agência Brasil','https://agenciabrasil.ebc.com.br/rss','https://agenciabrasil.ebc.com.br/rss/economia/feed.xml'),(2,'BCB — Notícias (feed)','https://www.bcb.gov.br/api/feed/x','https://www.bcb.gov.br/api/feed/x'),(3,'Federal Reserve — Press releases (feed)','https://www.federalreserve.gov/feeds/press_all.xml','https://www.federalreserve.gov/feeds/press_all.xml'),(4,'CVM','https://www.rad.cvm.gov.br/ENET',null),(5,'Câmara — Notícias de economia (feed)','https://www.camara.leg.br/noticias/rss/dinamico/ECONOMIA','https://www.camara.leg.br/noticias/rss/dinamico/ECONOMIA');
insert into public.noticias select 'ab'||g,'br','Agência Brasil','Agência '||g,'https://agenciabrasil.ebc.com.br/n'||g, now()-(g||' minutes')::interval from generate_series(1,20) g;
insert into public.vm_achados (fonte_id,fonte_nome,camada,titulo,link,publicado_em) values
 (2,'BCB — Notícias (feed)','livre','BC divulga nota','https://www.bcb.gov.br/n1',now()-interval '2 hours'),
 (5,'Câmara — Notícias de economia (feed)','pauta','Câmara aprova projeto','https://www.camara.leg.br/n1',now()-interval '3 hours'),
 (4,'CVM','livre','PETROBRAS S.A. — Fato Relevante: x','https://www.rad.cvm.gov.br/a',now()-interval '1 hour'),
 (4,'CVM','livre','VALE S.A. — Comunicado ao Mercado: y','https://www.rad.cvm.gov.br/b',now()-interval '1 hour'),
 (3,'Federal Reserve — Press releases (feed)','livre','Fed minutes','https://www.federalreserve.gov/x',now()-interval '1 hour'),
 (1,'Agência Brasil','livre','Agência 1 (dup)','https://agenciabrasil.ebc.com.br/n1',now()-interval '1 minutes'),
 (2,'BCB — Notícias (feed)','livre','velha','https://www.bcb.gov.br/velha',now()-interval '10 days');
