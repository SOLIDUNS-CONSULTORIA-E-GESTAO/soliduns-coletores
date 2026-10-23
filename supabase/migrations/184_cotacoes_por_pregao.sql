-- 184_cotacoes_por_pregao.sql — Cotações de fechamento: escolher a data do pregão (v169 do site, 23/10/2026)
-- Pedido do Thiago (23/10 11h53): combobox de datas na seção "Cotações de fechamento" para ver as maiores altas,
-- baixas e mais negociadas do pregão escolhido.
-- Fonte: public.cotacoes_br_hist (SQL 127; Séries Históricas da B3, COTAHIST, gravada todo dia útil às 22h20 pelo
-- workflow "Mercado - histórico B3"). Variação = fechamento do dia ÷ fechamento do pregão anterior do mesmo papel,
-- com o preço anterior ajustado pelos desdobramentos e grupamentos de public.cotacoes_br_eventos (fator divide os
-- preços até a data-com). Só leitura; nenhuma tabela nova.

create index if not exists cotacoes_br_hist_data on public.cotacoes_br_hist (data);

-- datas com pregão gravado (mais recente primeiro)
create or replace function public.cotacoes_br_pregoes(p_limite integer default 260)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_NECESSARIO' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x.data order by x.data desc)
                     from (select distinct h.data from public.cotacoes_br_hist h
                            order by h.data desc limit greatest(1, least(coalesce(p_limite, 260), 600))) x), '[]'::jsonb);
end $$;
revoke all on function public.cotacoes_br_pregoes(integer) from public, anon;
grant execute on function public.cotacoes_br_pregoes(integer) to authenticated;

-- todas as ações de um pregão: preço de fechamento, variação contra o pregão anterior e volume financeiro
create or replace function public.cotacoes_br_pregao(p_data date)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_data date;
begin
  if auth.uid() is null then raise exception 'LOGIN_NECESSARIO' using errcode = '42501'; end if;
  select max(h.data) into v_data from public.cotacoes_br_hist h where h.data <= p_data;
  if v_data is null then
    return jsonb_build_object('data', null, 'fonte', 'B3 — Séries Históricas (COTAHIST)', 'todas', '[]'::jsonb);
  end if;
  return (
    with dia as (
      select h.ticker, h.fechamento, h.volume_fin from public.cotacoes_br_hist h
       where h.data = v_data and h.fechamento > 0),
    ant as (
      select distinct on (h.ticker) h.ticker, h.data, h.fechamento
        from public.cotacoes_br_hist h join dia d on d.ticker = h.ticker
       where h.data < v_data and h.data >= v_data - 31 and h.fechamento > 0
       order by h.ticker, h.data desc),
    fat as (
      select a.ticker, exp(sum(ln(e.fator))) as f
        from ant a join public.cotacoes_br_eventos e
          on e.ticker = a.ticker and e.data_com >= a.data and e.data_com < v_data and e.fator > 0
       group by a.ticker)
    select jsonb_build_object(
      'data', v_data, 'fonte', 'B3 — Séries Históricas (COTAHIST)',
      'todas', coalesce(jsonb_agg(jsonb_build_object(
                 'ticker', d.ticker, 'preco', d.fechamento, 'volume_fin', coalesce(d.volume_fin, 0),
                 'variacao_pct', round(((d.fechamento * coalesce(f.f, 1) / a.fechamento - 1) * 100)::numeric, 4))
               order by d.ticker), '[]'::jsonb))
      from dia d join ant a on a.ticker = d.ticker left join fat f on f.ticker = d.ticker);
end $$;
revoke all on function public.cotacoes_br_pregao(date) from public, anon;
grant execute on function public.cotacoes_br_pregao(date) to authenticated;

-- conferência (rodar logado no SQL Editor, que usa a chave de serviço: as funções exigem login, então a conferência
-- lê as tabelas direto). Esperado: 1 linha com o último pregão gravado, o número de pregões e de ações nesse dia.
select max(data) as ultimo_pregao, count(distinct data) as pregoes_gravados,
       (select count(*) from public.cotacoes_br_hist where data = (select max(data) from public.cotacoes_br_hist)) as acoes_no_ultimo
  from public.cotacoes_br_hist;
