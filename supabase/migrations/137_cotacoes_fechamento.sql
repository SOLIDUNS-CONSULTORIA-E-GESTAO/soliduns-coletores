-- 137_cotacoes_fechamento.sql — Valor e Mercado, ETAPA 2: indicadores de FECHAMENTO
-- Tabela public.cotacoes (fechamento da B3 via COTAHIST + séries do Banco Central: SGS e Olinda/PTAX),
-- gravada pela Edge Function "coletor-fechamento", chamada pelo pg_cron às 18h30 de Brasília (dias úteis).
-- APENAS dados de fechamento: nada de tempo real nem com atraso. Cada registro guarda a fonte, o endereço e a hora da coleta.
-- Pré-requisitos no Supabase: extensões pg_cron e pg_net (Database > Extensions) e dois segredos no Vault:
--   vm_coletor_url    = endereço da função (https://<projeto>.supabase.co/functions/v1/coletor-fechamento)
--   vm_coletor_token  = o mesmo valor da variável COLETOR_TOKEN da função

create table if not exists public.cotacoes (
  id           bigint generated always as identity primary key,
  fonte        text not null check (fonte in ('B3 COTAHIST', 'BCB SGS', 'BCB Olinda')),
  url_fonte    text not null,                 -- endereço exato baixado pelo robô
  codigo       text not null,                 -- ticker (PETR4, BOVA11…) ou série (SELIC, CDI, IPCA, USD, EUR)
  descricao    text,
  data_ref     date not null,                 -- dia do pregão / da série (IPCA: 1º dia do mês)
  abertura     numeric, maxima numeric, minima numeric,
  fechamento   numeric not null,              -- preço de fechamento ou valor da série
  volume       numeric,                       -- volume financeiro (R$) — só B3
  negocios     integer,                       -- só B3
  codbdi       text,                          -- só B3: 02 ações/units, 12 FII, 14 ETF/fundos
  unidade      text not null,                 -- 'R$', '% a.a.', '% no mês', 'R$ por US$', 'R$ por €'
  coletado_em  timestamptz not null default now(),
  constraint cotacoes_unica unique (fonte, codigo, data_ref)
);
create index if not exists cotacoes_codigo_data on public.cotacoes (codigo, data_ref desc);

alter table public.cotacoes enable row level security;
revoke all on table public.cotacoes from anon, authenticated;
-- Leitura: usuários logados leem tudo (dado público de fechamento); visitantes só pela função vm_indicadores_publicos.
drop policy if exists cotacoes_leitura_logado on public.cotacoes;
create policy cotacoes_leitura_logado on public.cotacoes for select to authenticated using (true);
grant select on public.cotacoes to authenticated;
-- Escrita: só a chave de serviço (a Edge Function), que ignora RLS. Nenhuma política de escrita para anon/authenticated.

-- Indicadores do jornal: passam a vir de public.cotacoes (com o endereço da fonte e a hora da coleta).
-- Enquanto a tabela estiver vazia, cada indicador cai na série antiga (indices_hist), como no SQL 134.
create or replace function public.vm_indicadores_publicos()
returns jsonb language sql stable security definer set search_path to '' as $$
  with ult as (
    select c.codigo, jsonb_agg(jsonb_build_array(c.data_ref, c.fechamento) order by c.data_ref) as serie,
           (array_agg(c.url_fonte order by c.data_ref desc))[1] as url, max(c.coletado_em) as coletado
      from (select c2.*, row_number() over (partition by c2.codigo order by c2.data_ref desc) as n
              from public.cotacoes c2
             where c2.codigo in ('BOVA11', 'USD', 'EUR', 'SELIC', 'CDI', 'IPCA')
               and (c2.codigo <> 'BOVA11' or c2.fonte = 'B3 COTAHIST')) c
     where c.n <= 2
     group by c.codigo),
  velho as (
    select h.indice, jsonb_agg(jsonb_build_array(h.data, h.valor) order by h.data) as serie
      from (select h2.*, row_number() over (partition by h2.indice order by h2.data desc) as n
              from public.indices_hist h2 where h2.indice in ('IBOV', 'USD', 'EUR')) h
     where h.n <= 2 group by h.indice)
  select jsonb_build_object(
    'BOVA11', coalesce((select serie from ult where codigo = 'BOVA11'), (select serie from velho where indice = 'IBOV')),
    'USD',    coalesce((select serie from ult where codigo = 'USD'),    (select serie from velho where indice = 'USD')),
    'EUR',    coalesce((select serie from ult where codigo = 'EUR'),    (select serie from velho where indice = 'EUR')),
    'SELIC',  (select serie from ult where codigo = 'SELIC'),
    'CDI_AA', (select serie from ult where codigo = 'CDI'),
    'IPCA',   (select serie from ult where codigo = 'IPCA'),
    'CDI',    (select jsonb_build_array(c.data, c.valor) from public.indices_hist c where c.indice = 'CDI'
                 and not exists(select 1 from public.indices_hist e where e.indice = 'CDI_ESTIMADO' and e.data = c.data)
               order by c.data desc limit 1),
    'links',  (select jsonb_object_agg(codigo, url) from ult),
    'coletado_em', (select max(coletado) from ult));
$$;
revoke all on function public.vm_indicadores_publicos() from public;
grant execute on function public.vm_indicadores_publicos() to anon, authenticated;

-- Agenda: 18h30 de Brasília = 21h30 UTC (o pg_cron do Supabase usa UTC), segunda a sexta.
-- A chamada lê o endereço e o token do Vault: nenhuma chave neste arquivo.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'vm-coletor-fechamento';
    perform cron.schedule('vm-coletor-fechamento', '30 21 * * 1-5', $job$
      select net.http_post(
        url     := (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_url'),
        headers := jsonb_build_object('Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_token')),
        body    := '{}'::jsonb,
        timeout_milliseconds := 120000);
    $job$);
    raise notice 'Agenda criada: vm-coletor-fechamento às 21h30 UTC (18h30 de Brasília), dias úteis.';
  else
    raise notice 'ATENÇÃO: ligue as extensões pg_cron e pg_net (Database > Extensions) e rode este arquivo de novo.';
  end if;
end $$;

-- conferência: esperado 1 linha "tabela cotacoes | rls ligado | true | true"
-- (pg_cron e pg_net precisam estar true; com eles ligados, a mensagem acima diz "Agenda criada")
select 'tabela cotacoes' as tabela,
       case when c.relrowsecurity then 'rls ligado' else 'RLS DESLIGADO' end as rls,
       exists (select 1 from pg_extension where extname = 'pg_cron') as pg_cron,
       exists (select 1 from pg_extension where extname = 'pg_net') as pg_net
  from pg_class c where c.oid = 'public.cotacoes'::regclass;
-- depois confira a agenda: select jobname, schedule, active from cron.job where jobname = 'vm-coletor-fechamento';
