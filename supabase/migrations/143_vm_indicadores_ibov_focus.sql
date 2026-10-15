-- 143_vm_indicadores_ibov_focus.sql — Valor e Mercado: Ibovespa EM PONTOS e Boletim Focus no quadro de indicadores
-- Plano de correção das fontes, item 2 (Thiago, 15/10/2026). Dados gravados pelo coletor-fechamento v1.4 em public.cotacoes:
--   IBOV (fonte 'B3 Índices', pontos) e FOCUS_<IPCA|SELIC|PIB|CAMBIO>_<ano> (fonte 'BCB Focus', mediana).
-- vm_indicadores_publicos v3 = v2 + 'IBOV' (série dos 2 últimos fechamentos) + 'FOCUS' (mediana mais recente de cada série).
-- O 'BOVA11' continua na resposta (reserva enquanto o IBOV não tiver dados). Rodar DEPOIS da 137.

create or replace function public.vm_indicadores_publicos()
returns jsonb language sql stable security definer set search_path to '' as $$
  with ult as (
    select c.codigo, jsonb_agg(jsonb_build_array(c.data_ref, c.fechamento) order by c.data_ref) as serie,
           (array_agg(c.url_fonte order by c.data_ref desc))[1] as url, max(c.coletado_em) as coletado
      from (select c2.*, row_number() over (partition by c2.codigo order by c2.data_ref desc) as n
              from public.cotacoes c2
             where c2.codigo in ('BOVA11', 'IBOV', 'USD', 'EUR', 'SELIC', 'CDI', 'IPCA')
               and (c2.codigo <> 'BOVA11' or c2.fonte = 'B3 COTAHIST')
               and (c2.codigo <> 'IBOV' or c2.fonte = 'B3 Índices')) c
     where c.n <= 2
     group by c.codigo),
  velho as (
    select h.indice, jsonb_agg(jsonb_build_array(h.data, h.valor) order by h.data) as serie
      from (select h2.*, row_number() over (partition by h2.indice order by h2.data desc) as n
              from public.indices_hist h2 where h2.indice in ('IBOV', 'USD', 'EUR')) h
     where h.n <= 2 group by h.indice),
  focus as (
    select distinct on (c.codigo) c.codigo, c.data_ref, c.fechamento, c.unidade, c.descricao
      from public.cotacoes c
     where c.fonte = 'BCB Focus' and c.codigo like 'FOCUS\_%'
     order by c.codigo, c.data_ref desc)
  select jsonb_build_object(
    'IBOV',   (select serie from ult where codigo = 'IBOV'),
    'BOVA11', coalesce((select serie from ult where codigo = 'BOVA11'), (select serie from velho where indice = 'IBOV')),
    'USD',    coalesce((select serie from ult where codigo = 'USD'),    (select serie from velho where indice = 'USD')),
    'EUR',    coalesce((select serie from ult where codigo = 'EUR'),    (select serie from velho where indice = 'EUR')),
    'SELIC',  (select serie from ult where codigo = 'SELIC'),
    'CDI_AA', (select serie from ult where codigo = 'CDI'),
    'IPCA',   (select serie from ult where codigo = 'IPCA'),
    'CDI',    (select jsonb_build_array(c.data, c.valor) from public.indices_hist c where c.indice = 'CDI'
                 and not exists(select 1 from public.indices_hist e where e.indice = 'CDI_ESTIMADO' and e.data = c.data)
               order by c.data desc limit 1),
    'FOCUS',  (select jsonb_object_agg(codigo, jsonb_build_object('data', data_ref, 'mediana', fechamento, 'unidade', unidade, 'descricao', descricao)) from focus),
    'links',  (select jsonb_object_agg(codigo, url) from ult),
    'coletado_em', (select max(coletado) from ult));
$$;
revoke all on function public.vm_indicadores_publicos() from public;
grant execute on function public.vm_indicadores_publicos() to anon, authenticated;

-- conferência: esperado 1 linha "true | true" (IBOV e FOCUS aparecem depois da primeira coleta com as fontes conferidas)
select (public.vm_indicadores_publicos() ? 'BOVA11') as funcao_ok, (public.vm_indicadores_publicos() ? 'USD') as dados_ok;

-- DEPOIS de conferir à mão a página de índices da B3 (https://www.b3.com.br/pt_br/market-data-e-indices/indices) e os termos,
-- o Thiago marca a fonte como conferida (o Focus já foi conferido em 15/10):
-- update public.fontes_noticia set verificada_em = now() where url = 'https://www.b3.com.br/pt_br/market-data-e-indices/indices';
