-- 150_radar_bcb_desligado.sql — Radar: os 2 feeds do Banco Central saem do radar (16/10/2026 15h30)
-- Diagnóstico: o site do BC responde 400 ("Requisição Inválida") a todo acesso automático aos feeds
-- (pedidos 295, 297, 298, 302 e 303; com a identificação do radar, com idioma pt-BR e no formato padrão de robô).
-- Regra do projeto: não disfarçar o robô de navegador para passar pela proteção. Selic, PTAX, CDI e Focus continuam
-- vindo da API oficial de dados abertos do BC (coletor de fechamento); a decisão do Copom vem do SGS 432.
update public.fontes_noticia
   set situacao = 'inativa',
       observacao = 'Radar (item 5) — desligado em 16/10/2026: o site do BC recusa acesso automático ao feed (HTTP 400)'
 where url in ('https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias',
               'https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/comunicadoscopom');

-- conferência: esperado "2 | inativa"
select count(*) as feeds_bc, string_agg(distinct situacao, ',') as situacao
  from public.fontes_noticia
 where url like 'https://www.bcb.gov.br/api/feed/%';
