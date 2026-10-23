-- SQL 187 — SOLIDUNS — OPÇÕES DE AÇÕES DA B3 (calls e puts) por pregão — 23/10/2026 (site v172, aba Opções)
-- Pedido do Thiago (23/10 16h09 "aprovado - siga"): ferramenta de análise de opções do mercado brasileiro, sem
-- assinatura de dados da B3, numa aba própria "Opções" do Mercado financeiro.
--
-- O que esta migration faz:
--   1. Tabela opcoes_br_hist: uma linha por pregão e ativo-objeto (PETR3, VALE3, BOVA11…), com as opções negociadas
--      no dia numa lista compacta (itens). Gravada só pelo coletor (coletor/coletar_opcoes_b3.py, workflow
--      "Mercado - opções B3", todo dia útil às 22h47), a partir das Séries Históricas e dos arquivos públicos da B3.
--      Cada item: [código, tipo C/P, estilo A/E, exercício, vencimento, abertura, máxima, mínima, fechamento,
--      negócios, quantidade, volume R$, fechamento anterior, vol. implícita, delta, posição em aberto, dias úteis].
--   2. Leitura só por função, com login: opcoes_br_pregoes (datas) e opcoes_br_pregao (todas as opções de um pregão).
--      Leitura direta da tabela só para administradores.
--   3. Funções de serviço do coletor: opcoes_br_datas_gravadas e opcoes_br_limpar (guarda os últimos 126 pregões, cerca de 6 meses: ~0,65 MB por pregão).
-- Pode ser rodada de novo sem perder dados.
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): tabelas_com_rls = 1 | funcoes = 4 | leitura_direta_aberta = 0

-- 1. Tabela ----------------------------------------------------------------------------------------------------------
create table if not exists public.opcoes_br_hist (
  data         date        not null,
  ativo        text        not null,                 -- ativo-objeto (código do mercado à vista)
  preco_ativo  numeric,                              -- fechamento do ativo-objeto no pregão
  selic        numeric,                              -- Selic anualizada (decimal) usada nos cálculos
  n_opcoes     integer     not null default 0,
  volume       numeric     not null default 0,       -- volume financeiro das opções do ativo no dia (R$)
  itens        json        not null default '[]'::json,   -- json (texto comprimido): ~25% menor que jsonb
  coletado_em  timestamptz not null default now(),
  primary key (data, ativo)
);
create index if not exists opcoes_br_hist_data on public.opcoes_br_hist (data desc);
alter table public.opcoes_br_hist enable row level security;
drop policy if exists opcoes_br_hist_leitura on public.opcoes_br_hist;
create policy opcoes_br_hist_leitura on public.opcoes_br_hist for select to authenticated using (public.eh_admin());

-- 2. Leitura para o site (login obrigatório) -------------------------------------------------------------------------
create or replace function public.opcoes_br_pregoes(p_limite integer default 260)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_NECESSARIO' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x.data order by x.data desc)
                     from (select distinct h.data from public.opcoes_br_hist h
                            order by h.data desc limit greatest(1, least(coalesce(p_limite, 260), 600))) x), '[]'::jsonb);
end $$;
revoke all on function public.opcoes_br_pregoes(integer) from public, anon;
grant execute on function public.opcoes_br_pregoes(integer) to authenticated;

-- todas as opções de um pregão (p_data nulo = o mais recente; data sem pregão = o anterior mais próximo)
drop function if exists public.opcoes_br_pregao(date);
create or replace function public.opcoes_br_pregao(p_data date default null)
returns json language plpgsql stable security definer set search_path to '' as $$
declare v_data date;
begin
  if auth.uid() is null then raise exception 'LOGIN_NECESSARIO' using errcode = '42501'; end if;
  select max(h.data) into v_data from public.opcoes_br_hist h where h.data <= coalesce(p_data, current_date);
  if v_data is null then
    return json_build_object('data', null, 'ativos', '[]'::json);
  end if;
  return (select json_build_object(
            'data', v_data,
            'fonte', 'B3 — Séries Históricas, cadastro de instrumentos e posições em aberto; Banco Central (Selic)',
            'selic', max(h.selic),
            'campos', json_build_array('codigo', 'tipo', 'estilo', 'strike', 'vencimento', 'abertura', 'maxima', 'minima',
                                        'fechamento', 'negocios', 'quantidade', 'volume', 'fech_anterior', 'vi', 'delta',
                                        'posicao', 'dias_uteis'),
            'ativos', json_agg(json_build_object('ativo', h.ativo, 'preco', h.preco_ativo, 'volume', h.volume,
                                                   'n', h.n_opcoes, 'itens', h.itens) order by h.volume desc))
            from public.opcoes_br_hist h where h.data = v_data);
end $$;
revoke all on function public.opcoes_br_pregao(date) from public, anon;
grant execute on function public.opcoes_br_pregao(date) to authenticated;

-- 3. Funções do coletor (só a chave de serviço) ----------------------------------------------------------------------
create or replace function public.opcoes_br_datas_gravadas(p_desde date)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(distinct h.data), '[]'::jsonb) from public.opcoes_br_hist h where h.data >= p_desde;
$$;
revoke all on function public.opcoes_br_datas_gravadas(date) from public, anon, authenticated;
grant execute on function public.opcoes_br_datas_gravadas(date) to service_role;

create or replace function public.opcoes_br_limpar(p_pregoes integer default 126)
returns integer language plpgsql volatile security definer set search_path to '' as $$
declare v_corte date; n integer;
begin
  select min(x.data) into v_corte
    from (select distinct h.data from public.opcoes_br_hist h order by h.data desc limit greatest(coalesce(p_pregoes, 126), 20)) x;
  delete from public.opcoes_br_hist h where h.data < v_corte;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.opcoes_br_limpar(integer) from public, anon, authenticated;
grant execute on function public.opcoes_br_limpar(integer) to service_role;

-- 4. Conferência -----------------------------------------------------------------------------------------------------
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'opcoes_br_hist' and c.relrowsecurity) as tabelas_com_rls,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('opcoes_br_pregoes', 'opcoes_br_pregao', 'opcoes_br_datas_gravadas', 'opcoes_br_limpar')) as funcoes,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'opcoes_br_hist'
    and qual not like '%eh_admin%') as leitura_direta_aberta;
