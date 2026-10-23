-- SQL 186 — SOLIDUNS — ALVOS SOLIDUNS (preço de entrada, stop e alvos de todas as ações líquidas da B3) — 23/10/2026
-- Pedido do Thiago (23/10 13h16 "aprovado - siga"): ferramenta de rastreamento dos maiores alvos, em
-- Mercado financeiro › Ações (mercado brasileiro), logo abaixo de "Carteira SOLIDUNS".
--
-- O que esta migration faz:
--   1. Tabelas gravadas pelo robô (selecao/robo_selecao.py --gravar, mesmo agendamento diário da Carteira SOLIDUNS):
--      alvos_execucoes (uma linha por pregão + resultado da eleição) e alvos_acoes (uma linha por ação, com os níveis,
--      os indicadores técnicos, os alertas e a série do gráfico). Escrita só pela chave de serviço (robô).
--   2. Mesmo modelo de publicação da Carteira SOLIDUNS (SQL 182): o robô grava como PRÉVIA; o administrador-mestre vê a
--      prévia e publica pelo botão da página; o assinante só vê a última execução publicada.
--   3. Leitura só por função (alvos_publico), com login obrigatório.
-- Pode ser rodada de novo sem perder dados.
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): tabelas_com_rls = 2 | funcoes = 2 | leitura_direta_aberta = 0

-- 1. Tabelas ---------------------------------------------------------------------------------------------------------
create table if not exists public.alvos_execucoes (
  id              bigint generated always as identity primary key,
  data_referencia date        not null,                 -- pregão dos preços usados
  resultado       text        not null default '',      -- '' antes da apuração; 'D' ou 'E' depois
  executado_em    timestamptz not null default now(),
  p_d             numeric,                              -- probabilidade do cenário D (fórmula 4.2)
  cds_pb          numeric,
  cds_d_pb        numeric,
  cds_e_pb        numeric,
  n_acoes         integer,
  parametros      jsonb,
  avisos          jsonb,
  publicado       boolean     not null default false,
  publicado_em    timestamptz,
  publicado_por   text,
  unique (data_referencia, resultado)
);

create table if not exists public.alvos_acoes (
  execucao_id   bigint not null references public.alvos_execucoes(id) on delete cascade,
  posicao       integer,                                -- ordem pelo ganho até o alvo 2 do cenário D
  ticker        text   not null,
  empresa       text,
  setor         text,
  grupo         text,
  preco         numeric,
  volume_medio  numeric,
  ent_ideal     numeric,
  ent_max       numeric,
  stop          numeric,
  alvo1         numeric,
  alvo2_d       numeric,                                -- alvo 2 no cenário D (vitória do candidato D)
  alvo2_n       numeric,                                -- alvo 2 técnico (sem efeito eleitoral)
  preco_e       numeric,                                -- preço estimado no cenário E
  ganho1        numeric,
  ganho_d       numeric,                                -- da entrada ideal até o alvo 2 D
  ganho_d_atual numeric,                                -- do preço atual até o alvo 2 D
  ganho_n       numeric,
  perda         numeric,                                -- da entrada ideal até o stop
  rr_d          numeric,
  rr_n          numeric,
  choque_d      numeric,                                -- reação estimada do preço ao cenário D
  choque_e      numeric,
  origem_choque text,                                   -- 'robô' (ação elegível) ou 'estimado' (fora do universo do robô)
  alertas       text[],
  limpa         boolean,
  ifr           numeric, adx numeric, di_mais numeric, di_menos numeric, macd numeric, sinal numeric,
  estoc_k       numeric, estoc_d numeric, atr numeric,
  mme9          numeric, mme21 numeric, mme50 numeric, mme200 numeric, bb_inf numeric, bb_sup numeric,
  vol_rel       numeric, ret_5d numeric, ret_21d numeric, ret_ano numeric,
  s2 numeric, s1 numeric, pivo numeric, r1 numeric, r2 numeric,
  min252        numeric, max252 numeric,
  serie         jsonb,                                  -- [[data, fech, mme21, mme50, mme200], ...] (160 pregões)
  primary key (execucao_id, ticker)
);
create index if not exists alvos_execucoes_data on public.alvos_execucoes (data_referencia desc, executado_em desc);

-- 2. Segurança: só o robô escreve; leitura direta só para administrador ------------------------------------------------
alter table public.alvos_execucoes enable row level security;
alter table public.alvos_acoes     enable row level security;
revoke all on table public.alvos_execucoes, public.alvos_acoes from anon, authenticated;
drop policy if exists alvos_execucoes_leitura on public.alvos_execucoes;
drop policy if exists alvos_acoes_leitura     on public.alvos_acoes;
create policy alvos_execucoes_leitura on public.alvos_execucoes for select to authenticated using (public.eh_admin());
create policy alvos_acoes_leitura     on public.alvos_acoes     for select to authenticated using (public.eh_admin());
grant select on public.alvos_execucoes, public.alvos_acoes to authenticated;

-- 3. Leitura pela página (login obrigatório) -------------------------------------------------------------------------
-- Administrador: a execução mais recente (prévia ou publicada). Assinante: a última publicada.
-- A série do gráfico vai junto (cerca de 160 pontos por ação), para a página abrir o gráfico sem nova consulta.
create or replace function public.alvos_publico()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_admin boolean := coalesce(public.eh_admin(), false);
        v_pub public.alvos_execucoes; v_prev public.alvos_execucoes; e public.alvos_execucoes;
begin
  if auth.uid() is null then raise exception 'LOGIN_NECESSARIO' using errcode = '42501'; end if;
  select * into v_pub from public.alvos_execucoes where publicado
   order by data_referencia desc, executado_em desc limit 1;
  if v_admin then
    select * into v_prev from public.alvos_execucoes where not publicado
     order by data_referencia desc, executado_em desc limit 1;
  end if;
  if v_prev.id is not null and (v_pub.id is null or (v_prev.data_referencia, v_prev.executado_em) > (v_pub.data_referencia, v_pub.executado_em))
    then e := v_prev; else e := v_pub; end if;
  if e.id is null then
    return jsonb_build_object('execucao', null, 'admin', v_admin, 'acoes', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'admin', v_admin,
    'previa', not e.publicado,
    'execucao', jsonb_build_object('id', e.id, 'data_referencia', e.data_referencia, 'resultado', e.resultado,
        'executado_em', e.executado_em, 'p_d', e.p_d, 'cds_pb', e.cds_pb, 'cds_d_pb', e.cds_d_pb, 'cds_e_pb', e.cds_e_pb,
        'n_acoes', e.n_acoes, 'publicado', e.publicado, 'publicado_em', e.publicado_em,
        'candidato_d', e.parametros ->> 'candidato_d', 'candidato_e', e.parametros ->> 'candidato_e',
        'grupos_alerta', e.parametros -> 'grupos_alerta',
        'ganho_destaque', coalesce((e.parametros ->> 'ganho_destaque')::numeric, 0.20),
        'avisos', case when v_admin then e.avisos else null end,
        'parametros', case when v_admin then e.parametros else null end),
    'ultima_publicada', case when v_admin and v_pub.id is not null and v_pub.id <> e.id then v_pub.data_referencia end,
    'acoes', coalesce((select jsonb_agg(to_jsonb(a) - 'execucao_id' order by a.posicao)
                         from public.alvos_acoes a where a.execucao_id = e.id), '[]'::jsonb));
end $$;
revoke all on function public.alvos_publico() from public, anon;
grant execute on function public.alvos_publico() to authenticated;

-- 4. Publicar / retirar (só administrador-mestre) --------------------------------------------------------------------
create or replace function public.alvos_publicar(p_execucao_id bigint, p_publicar boolean)
returns jsonb language plpgsql volatile security definer set search_path to '' as $$
declare n int;
begin
  if not coalesce(public.eh_admin(), false) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  update public.alvos_execucoes
     set publicado = coalesce(p_publicar, false),
         publicado_em = case when coalesce(p_publicar, false) then now() end,
         publicado_por = case when coalesce(p_publicar, false)
                              then (select u.email from auth.users u where u.id = auth.uid()) end
   where id = p_execucao_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'EXECUCAO_INEXISTENTE' using errcode = 'P0002'; end if;
  return public.alvos_publico();
end $$;
revoke all on function public.alvos_publicar(bigint, boolean) from public, anon;
grant execute on function public.alvos_publicar(bigint, boolean) to authenticated;

-- 5. Conferência -----------------------------------------------------------------------------------------------------
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('alvos_execucoes', 'alvos_acoes') and c.relrowsecurity) as tabelas_com_rls,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('alvos_publico', 'alvos_publicar')) as funcoes,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('alvos_execucoes', 'alvos_acoes')
    and qual not like '%eh_admin%') as leitura_direta_aberta;
