-- SQL 182 — SOLIDUNS — CARTEIRA SOLIDUNS (robô de seleção sob risco Brasil e risco político) — 22/10/2026
-- Pedido do Thiago (22/10 01h38 "APROVADO - SIGA"; 14h09 "pode seguir para a próxima pendência"): ligar o robô de seleção
-- de carteira (pasta selecao/ deste repositório; compêndio metodológico v1.1) à plataforma e mostrar o resultado no site.
--
-- O que esta migration faz:
--   1. Tabelas gravadas pelo robô (selecao/robo_selecao.py --gravar, agendado em .github/workflows/selecao-carteira.yml):
--      selecao_execucoes (uma linha por dia + modo + resultado), selecao_carteiras (ações de cada carteira) e
--      selecao_ranking (todas as ações elegíveis). Escrita só pela chave de serviço (robô).
--   2. Coluna "publicado": o robô grava como PRÉVIA (publicado = false). O assinante só vê a última execução PUBLICADA.
--      O administrador-mestre vê a prévia e publica pelo botão da própria página (função selecao_publicar).
--   3. Leitura só por função (selecao_carteira_publico), com login obrigatório — mesmo modelo do Radar Exponencial (SQL 140).
-- Pode ser rodada de novo sem perder dados. Também corrige a versão preliminar (selecao/sql/selecao_carteira.sql do
-- repositório antigo), que liberava leitura direta das tabelas a qualquer usuário logado.
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): tabelas_com_rls = 3 | funcoes = 2 | leitura_direta_aberta = 0

-- 1. Tabelas ---------------------------------------------------------------------------------------------------------
create table if not exists public.selecao_execucoes (
  id              bigint generated always as identity primary key,
  data_referencia date        not null,
  modo            text        not null,                 -- cenarios | neutro | condicional
  resultado       text        not null default '',      -- '' antes da apuração; 'D' ou 'E' depois
  regime          text        not null,                 -- eleitoral | normal
  executado_em    timestamptz not null default now(),
  p_d             numeric,                              -- probabilidade do cenário D (fórmula 4.2)
  delta_pb        numeric,                              -- prêmio político Δ, pontos-base (4.4 / 4.8)
  cds_pb          numeric,                              -- CDS 5 anos usado
  cds_d_pb        numeric,                              -- CDS no cenário D (4.5)
  cds_e_pb        numeric,                              -- CDS no cenário E (4.5)
  ke_medio        numeric,                              -- K_e da ação média (3.3)
  selic           numeric,
  gamma_bolsa     numeric,                              -- γ do BOVA11 (4.6)
  n_universo      integer,
  n_excluidas     integer,
  carteiras       jsonb,                                -- resumo de cada carteira
  parametros      jsonb,                                -- cada parâmetro e sua origem
  avisos          jsonb,
  unique (data_referencia, modo, resultado)
);
alter table public.selecao_execucoes add column if not exists publicado    boolean not null default false;
alter table public.selecao_execucoes add column if not exists publicado_em timestamptz;
alter table public.selecao_execucoes add column if not exists publicado_por text;

create table if not exists public.selecao_carteiras (
  execucao_id   bigint not null references public.selecao_execucoes(id) on delete cascade,
  carteira      text   not null,                        -- Atual | Se vencer D | Se vencer E | Resultado D | Resultado E
  ticker        text   not null,
  empresa       text,
  setor         text,
  peso          numeric,
  escore        numeric,
  preco         numeric,
  pl            numeric,
  ret_implicito numeric,
  ke_esperado   numeric,
  excesso_rel   numeric,
  choque_d      numeric,
  choque_e      numeric,
  gamma         numeric,
  igov          numeric,
  segmento      text,
  estatal       boolean,
  primary key (execucao_id, carteira, ticker)
);

create table if not exists public.selecao_ranking (
  execucao_id        bigint not null references public.selecao_execucoes(id) on delete cascade,
  posicao            integer,
  ticker             text not null,
  empresa            text,
  setor              text,
  escore             numeric,
  z_retorno_esperado numeric,
  z_pior_caso        numeric,
  z_crescimento      numeric,
  z_governanca       numeric,
  q_margem           numeric,
  u_esperado         numeric,
  u_min              numeric,
  ret_implicito      numeric,
  ke_esperado        numeric,
  excesso_rel        numeric,
  g_esperado         numeric,
  igov               numeric,
  mb_media           numeric,
  gamma              numeric,
  choque_d           numeric,
  choque_e           numeric,
  ke_atual           numeric,
  ke_d               numeric,
  ke_e               numeric,
  pl                 numeric,
  beta               numeric,
  lambda             numeric,
  estatal            boolean,
  segmento           text,
  primary key (execucao_id, ticker)
);
create index if not exists selecao_execucoes_data_idx on public.selecao_execucoes (publicado, data_referencia desc, executado_em desc);

-- 2. Segurança: nada de leitura direta; administrador-mestre lê as tabelas; o resto só pela função -------------------
drop view if exists public.selecao_ultima;      -- vista da versão preliminar (não é mais usada)
alter table public.selecao_execucoes enable row level security;
alter table public.selecao_carteiras enable row level security;
alter table public.selecao_ranking   enable row level security;
revoke all on table public.selecao_execucoes, public.selecao_carteiras, public.selecao_ranking from anon, authenticated;
drop policy if exists selecao_execucoes_leitura on public.selecao_execucoes;
drop policy if exists selecao_carteiras_leitura on public.selecao_carteiras;
drop policy if exists selecao_ranking_leitura   on public.selecao_ranking;
create policy selecao_execucoes_leitura on public.selecao_execucoes for select to authenticated using (public.eh_admin());
create policy selecao_carteiras_leitura on public.selecao_carteiras for select to authenticated using (public.eh_admin());
create policy selecao_ranking_leitura   on public.selecao_ranking   for select to authenticated using (public.eh_admin());
grant select on public.selecao_execucoes, public.selecao_carteiras, public.selecao_ranking to authenticated;
-- escrita só pela chave de serviço (robô) ou pelo SQL Editor

-- 3. Leitura da página -----------------------------------------------------------------------------------------------
-- Assinante logado: última execução PUBLICADA. Administrador-mestre: a prévia, quando for mais nova que a publicada.
create or replace function public.selecao_carteira_publico()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_admin boolean := coalesce(public.eh_admin(), false);
        v_pub public.selecao_execucoes; v_prev public.selecao_execucoes; e public.selecao_execucoes;
begin
  if auth.uid() is null then raise exception 'LOGIN_NECESSARIO' using errcode = '42501'; end if;
  select * into v_pub from public.selecao_execucoes where publicado
   order by data_referencia desc, executado_em desc limit 1;
  if v_admin then
    select * into v_prev from public.selecao_execucoes where not publicado
     order by data_referencia desc, executado_em desc limit 1;
  end if;
  if v_prev.id is not null and (v_pub.id is null or (v_prev.data_referencia, v_prev.executado_em) > (v_pub.data_referencia, v_pub.executado_em))
    then e := v_prev; else e := v_pub; end if;
  if e.id is null then
    return jsonb_build_object('execucao', null, 'admin', v_admin, 'carteiras', '[]'::jsonb, 'ranking', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'admin', v_admin,
    'previa', not e.publicado,
    'execucao', jsonb_build_object('id', e.id, 'data_referencia', e.data_referencia, 'modo', e.modo, 'resultado', e.resultado,
        'regime', e.regime, 'executado_em', e.executado_em, 'p_d', e.p_d, 'delta_pb', e.delta_pb, 'cds_pb', e.cds_pb,
        'cds_d_pb', e.cds_d_pb, 'cds_e_pb', e.cds_e_pb, 'ke_medio', e.ke_medio, 'selic', e.selic, 'gamma_bolsa', e.gamma_bolsa,
        'n_universo', e.n_universo, 'n_excluidas', e.n_excluidas, 'resumos', e.carteiras, 'publicado', e.publicado,
        'publicado_em', e.publicado_em,
        'candidato_d', e.parametros -> 'Candidato D' ->> 0, 'candidato_e', e.parametros -> 'Candidato E' ->> 0,
        'avisos', case when v_admin then e.avisos else null end,
        'parametros', case when v_admin then e.parametros else null end),
    'ultima_publicada', case when v_admin and v_pub.id is not null and v_pub.id <> e.id then v_pub.data_referencia end,
    'carteiras', coalesce((select jsonb_agg(to_jsonb(c) - 'execucao_id' order by c.carteira, c.peso desc)
                             from public.selecao_carteiras c where c.execucao_id = e.id), '[]'::jsonb),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object('posicao', r.posicao, 'ticker', r.ticker, 'empresa', r.empresa,
                             'setor', r.setor, 'escore', r.escore, 'excesso_rel', r.excesso_rel, 'g_esperado', r.g_esperado,
                             'igov', r.igov, 'mb_media', r.mb_media, 'gamma', r.gamma, 'choque_d', r.choque_d,
                             'choque_e', r.choque_e, 'pl', r.pl, 'ke_esperado', r.ke_esperado, 'ret_implicito', r.ret_implicito,
                             'estatal', r.estatal, 'segmento', r.segmento) order by r.posicao)
                           from public.selecao_ranking r where r.execucao_id = e.id), '[]'::jsonb));
end $$;
revoke all on function public.selecao_carteira_publico() from public, anon;
grant execute on function public.selecao_carteira_publico() to authenticated;

-- 4. Publicar / retirar (só administrador-mestre) --------------------------------------------------------------------
create or replace function public.selecao_publicar(p_execucao_id bigint, p_publicar boolean)
returns jsonb language plpgsql volatile security definer set search_path to '' as $$
declare n int;
begin
  if not coalesce(public.eh_admin(), false) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  update public.selecao_execucoes
     set publicado = coalesce(p_publicar, false),
         publicado_em = case when coalesce(p_publicar, false) then now() end,
         publicado_por = case when coalesce(p_publicar, false)
                              then (select u.email from auth.users u where u.id = auth.uid()) end
   where id = p_execucao_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'EXECUCAO_INEXISTENTE' using errcode = 'P0002'; end if;
  return public.selecao_carteira_publico();
end $$;
revoke all on function public.selecao_publicar(bigint, boolean) from public, anon;
grant execute on function public.selecao_publicar(bigint, boolean) to authenticated;

-- conferência
select (select count(*) from pg_class where relname in ('selecao_execucoes', 'selecao_carteiras', 'selecao_ranking')
           and relnamespace = 'public'::regnamespace and relrowsecurity) as tabelas_com_rls,
       (select count(*) from pg_proc where proname in ('selecao_carteira_publico', 'selecao_publicar')) as funcoes,
       (select count(*) from pg_policies where tablename like 'selecao_%' and qual = 'true') as leitura_direta_aberta;
