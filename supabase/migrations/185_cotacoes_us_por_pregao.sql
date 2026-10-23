-- 185_cotacoes_us_por_pregao.sql — Cotações de fechamento do MERCADO AMERICANO com escolha da data do pregão (v170)
-- Pedido do Thiago (23/10 12h16): o mesmo buscador de datas do mercado brasileiro no mercado americano, com o mesmo
-- layout (altas, baixas, mais negociadas, filtro de liquidez, "Ver todos" e tabela completa).
-- Fonte: public.cotacoes_us (SQL 45/48; fechamento diário da Massive, gravado pelo workflow "Preços EUA" e guardado por
-- 1 ano), com nome e setor de public.indicadores_us. Variação = fechamento ÷ fechamento do pregão anterior do mesmo
-- papel. A Massive entrega o preço já ajustado no dia da coleta, mas os dias guardados antes de um desdobramento não
-- são refeitos: salto de 45% ou mais entre o fechamento anterior e a abertura que bate (até 2%; 5% nas razões a partir
-- de 5) com uma razão exata de desdobramento ou grupamento é tratado como evento — a mesma regra do Brasil (SQL 127).
-- Só leitura; nenhuma tabela nova.

create index if not exists cotacoes_us_data on public.cotacoes_us (data);

create or replace function public.cotacoes_us_pregoes(p_limite integer default 260)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_NECESSARIO' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x.data order by x.data desc)
                     from (select distinct c.data from public.cotacoes_us c
                            order by c.data desc limit greatest(1, least(coalesce(p_limite, 260), 600))) x), '[]'::jsonb);
end $$;
revoke all on function public.cotacoes_us_pregoes(integer) from public, anon;
grant execute on function public.cotacoes_us_pregoes(integer) to authenticated;

-- todas as ações de um pregão (p_data nulo = o mais recente)
create or replace function public.cotacoes_us_pregao(p_data date default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_data date;
begin
  if auth.uid() is null then raise exception 'LOGIN_NECESSARIO' using errcode = '42501'; end if;
  select max(c.data) into v_data from public.cotacoes_us c where c.data <= coalesce(p_data, current_date);
  if v_data is null then
    return jsonb_build_object('data', null, 'fonte', 'Massive (fechamento de NYSE e Nasdaq)', 'todas', '[]'::jsonb);
  end if;
  return (
    with dia as (
      select c.ticker, c.fechamento, c.abertura, coalesce(c.financeiro, 0) as financeiro
        from public.cotacoes_us c where c.data = v_data and c.fechamento > 0),
    ant as (
      select distinct on (c.ticker) c.ticker, c.fechamento
        from public.cotacoes_us c join dia d on d.ticker = c.ticker
       where c.data < v_data and c.data >= v_data - 14 and c.fechamento > 0
       order by c.ticker, c.data desc),
    razoes(r) as (values (2::numeric), (3), (4), (5), (8), (10), (15), (20), (25), (30), (40), (50), (100),
                         (1/2::numeric), (1/3::numeric), (1/4::numeric), (1/5::numeric), (1/8::numeric), (1/10::numeric),
                         (1/15::numeric), (1/20::numeric), (1/25::numeric), (1/30::numeric), (1/40::numeric), (1/50::numeric), (1/100::numeric)),
    evento as (   -- desdobramento/grupamento não refeito nos dias guardados: fator pela razão exata mais próxima
      select d.ticker, (select z.r from razoes z
                         where abs(ln(a.fechamento / d.abertura / z.r)) <= case when abs(ln(z.r)) < ln(5) then 0.02 else 0.05 end
                         order by abs(ln(a.fechamento / d.abertura / z.r)) limit 1) as fator
        from dia d join ant a on a.ticker = d.ticker
       where d.abertura > 0 and least(a.fechamento, d.abertura) >= 0.10
         and abs(ln(a.fechamento / d.abertura)) >= ln(1.45))
    select jsonb_build_object(
      'data', v_data, 'fonte', 'Massive (fechamento de NYSE e Nasdaq)',
      'todas', coalesce(jsonb_agg(jsonb_build_object(
                 'ticker', d.ticker, 'nome', coalesce(i.nome, ''), 'setor', coalesce(i.setor, ''),
                 'preco', d.fechamento, 'volume_fin', d.financeiro,
                 'variacao_pct', round(((d.fechamento * coalesce(e.fator, 1) / a.fechamento - 1) * 100)::numeric, 4))
               order by d.ticker), '[]'::jsonb))
      from dia d join ant a on a.ticker = d.ticker
      left join evento e on e.ticker = d.ticker
      left join public.indicadores_us i on i.ticker = d.ticker);
end $$;
revoke all on function public.cotacoes_us_pregao(date) from public, anon;
grant execute on function public.cotacoes_us_pregao(date) to authenticated;

-- conferência: esperado 1 linha com o último pregão americano gravado, o número de pregões e de ações nesse dia
select max(data) as ultimo_pregao, count(distinct data) as pregoes_gravados,
       (select count(*) from public.cotacoes_us where data = (select max(data) from public.cotacoes_us)) as acoes_no_ultimo
  from public.cotacoes_us;
