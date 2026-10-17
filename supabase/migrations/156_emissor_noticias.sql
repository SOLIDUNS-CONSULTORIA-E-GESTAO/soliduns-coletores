-- 156_emissor_noticias.sql — NOTÍCIAS POR EMPRESA para os Relatórios de Análise SOLIDUNS (17/10/2026)
-- Pedido do Thiago (17/10 16h53): o relatório do emissor passa a juntar o que a EMPRESA informou (CVM / SEC) e o que a
-- IMPRENSA publicou — "nem sempre a empresa noticia informações relevantes".
-- Gravada pelo robô do GitHub "Notícias por empresa" (coletor/noticias_emissores.py). Lida pelo robô dos relatórios
-- (conversa do AGENTE) pela função public.emissor_noticias_dossie.
-- Guarda só: título, link, data, fonte e categoria. NENHUM texto de matéria é copiado (imprensa = pauta, com crédito).
-- Fontes, todas públicas e conferidas: CVM (Dados Abertos, base IPE, licença ODbL), SEC EDGAR (dados públicos dos EUA,
-- regra de acesso justo: identificação no pedido, até 10 pedidos/s) e os feeds já liberados do radar (public.vm_achados).

create table if not exists public.emissor_noticias (
  id            bigint generated always as identity primary key,
  mercado       text not null check (mercado in ('br', 'us')),
  ticker        text not null check (ticker ~ '^[A-Z0-9.]{1,12}$'),
  empresa       text,
  origem        text not null check (origem in ('emissor', 'imprensa')),
  fonte         text not null,                 -- 'CVM', 'SEC EDGAR' ou o nome do veículo
  categoria     text,                          -- Fato relevante, Comunicado ao mercado, 8-K, 10-Q… ou 'Notícia'
  titulo        text not null check (length(titulo) <= 400),
  link          text not null check (link ~ '^https?://'),
  publicado_em  timestamptz not null,
  detalhe       jsonb not null default '{}'::jsonb,   -- itens do 8-K, espécie, assunto, protocolo… (nunca texto de matéria)
  coletado_em   timestamptz not null default now(),
  constraint emissor_noticias_unica unique (mercado, ticker, link)
);
create index if not exists emissor_noticias_ticker_data on public.emissor_noticias (mercado, ticker, publicado_em desc);

alter table public.emissor_noticias enable row level security;
alter table public.emissor_noticias force row level security;
revoke all on table public.emissor_noticias from anon, authenticated;
drop policy if exists emissor_noticias_leitura_editor on public.emissor_noticias;
create policy emissor_noticias_leitura_editor on public.emissor_noticias
  for select to authenticated using (public.vm_eh_editor());
grant select on public.emissor_noticias to authenticated;
-- gravação: só o robô (service_role, que ignora a RLS). Nenhuma política de escrita para usuários.

-- Dossiê de uma empresa para o relatório: o que a empresa informou + o que a imprensa publicou.
-- Cada notícia de imprensa vem marcada "sem_comunicado_oficial" quando a empresa NÃO entregou nenhum documento
-- (CVM/SEC) entre 3 dias antes e 3 dias depois — é o caso "a empresa não noticiou".
create or replace function public.emissor_noticias_dossie(p_mercado text, p_ticker text, p_dias integer default 180)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_merc text := case when p_mercado = 'us' then 'us' else 'br' end;
  v_tk   text := upper(btrim(coalesce(p_ticker, '')));
  v_ini  timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 180), 730)));
begin
  if auth.role() <> 'service_role' and not public.vm_eh_editor() then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'mercado', v_merc, 'ticker', v_tk, 'desde', v_ini, 'gerado_em', now(),
    'emissor', coalesce((
      select jsonb_agg(jsonb_build_object('data', e.publicado_em, 'fonte', e.fonte, 'categoria', e.categoria,
                                          'titulo', e.titulo, 'link', e.link, 'detalhe', e.detalhe) order by e.publicado_em desc)
        from public.emissor_noticias e
       where e.mercado = v_merc and e.ticker = v_tk and e.origem = 'emissor' and e.publicado_em >= v_ini), '[]'::jsonb),
    'imprensa', coalesce((
      select jsonb_agg(jsonb_build_object('data', i.publicado_em, 'fonte', i.fonte, 'titulo', i.titulo, 'link', i.link,
               'sem_comunicado_oficial', not exists (
                  select 1 from public.emissor_noticias e
                   where e.mercado = i.mercado and e.ticker = i.ticker and e.origem = 'emissor'
                     and e.publicado_em between i.publicado_em - interval '3 days' and i.publicado_em + interval '3 days'))
             order by i.publicado_em desc)
        from public.emissor_noticias i
       where i.mercado = v_merc and i.ticker = v_tk and i.origem = 'imprensa' and i.publicado_em >= v_ini), '[]'::jsonb)
  );
end $$;
revoke all on function public.emissor_noticias_dossie(text, text, integer) from public, anon;
grant execute on function public.emissor_noticias_dossie(text, text, integer) to authenticated, service_role;

-- conferência: esperado 1 linha "true | true | 0"
select (select relrowsecurity from pg_class where oid = 'public.emissor_noticias'::regclass) as tabela_com_rls,
       exists (select 1 from pg_proc where proname = 'emissor_noticias_dossie') as funcao,
       (select count(*) from public.emissor_noticias) as linhas;
