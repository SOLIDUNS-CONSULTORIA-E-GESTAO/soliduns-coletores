-- SQL 168 — SOLIDUNS / Valor e Mercado — AGENDA DE INDICADORES NO SCANNER (19/10/2026)
-- Pedido do Thiago (19/10 16h31): o Scanner do Dia informa a agenda de divulgação dos indicadores econômicos do Brasil e
-- dos EUA (universo do "Anexo A" da pesquisa feita com a DeepSeek + IBGE e FGV). Na SEGUNDA-FEIRA, a agenda da SEMANA
-- inteira (como o calendário econômico semanal da imprensa). Os de MAIOR IMPACTO vão para o texto e para a planilha;
-- os demais só aparecem em tópicos/planilha no fim do Scanner.
--   1. public.vm_indicadores_universo: lista mestre dos indicadores rastreados (país, grupo, instituição, impacto).
--      A pesquisa da agenda (agenda-do-dia v1.1) lê esta lista; dá para incluir/retirar indicadores sem mexer em código.
--   2. public.vm_agenda ganha: tipo (indicador/evento), pais, grupo, indicador, instituicao, impacto, referencia, anterior.
--   3. vm_scanner_publico() e vm_scanner_publico_data() passam a devolver também "agenda": os indicadores do dia do Scanner
--      (segunda-feira: de segunda a sexta), montados direto do banco — nenhum número escrito pela IA na planilha.
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): universo | alto | colunas_agenda
--                               (≈ 70)  | (≈ 15) | 8

-- ------------------------------------------------------------ 1. universo de indicadores
create table if not exists public.vm_indicadores_universo (
  id          text primary key,
  pais        text not null check (pais in ('BR', 'EUA')),
  grupo       text not null check (grupo in ('Habitação e Construção', 'Emprego e Mercado de Trabalho', 'Endividamento e Crédito',
                                             'Atividade, Preços e Outros', 'Política Monetária')),
  indicador   text not null,
  instituicao text not null,
  impacto     text not null check (impacto in ('alto', 'medio', 'baixo')),
  frequencia  text,
  ativo       boolean not null default true,
  atualizado_em timestamptz not null default now()
);
alter table public.vm_indicadores_universo enable row level security;
revoke all on table public.vm_indicadores_universo from anon, authenticated;
drop policy if exists vm_indicadores_universo_editor on public.vm_indicadores_universo;
create policy vm_indicadores_universo_editor on public.vm_indicadores_universo for select to authenticated using (public.vm_eh_editor());
grant select on public.vm_indicadores_universo to authenticated;
-- escrita só pela chave de serviço / SQL Editor

insert into public.vm_indicadores_universo (id, pais, grupo, indicador, instituicao, impacto, frequencia) values
-- BRASIL — política monetária e preços (alto impacto)
 ('br-copom',          'BR', 'Política Monetária', 'Decisão do Copom (Selic)', 'Banco Central do Brasil', 'alto', 'a cada 45 dias'),
 ('br-ata-copom',      'BR', 'Política Monetária', 'Ata do Copom', 'Banco Central do Brasil', 'alto', 'a cada 45 dias'),
 ('br-rpm',            'BR', 'Política Monetária', 'Relatório de Política Monetária', 'Banco Central do Brasil', 'medio', 'trimestral'),
 ('br-focus',          'BR', 'Política Monetária', 'Boletim Focus', 'Banco Central do Brasil', 'medio', 'semanal'),
 ('br-ipca',           'BR', 'Atividade, Preços e Outros', 'IPCA', 'IBGE', 'alto', 'mensal'),
 ('br-ipca15',         'BR', 'Atividade, Preços e Outros', 'IPCA-15', 'IBGE', 'alto', 'mensal'),
 ('br-pib',            'BR', 'Atividade, Preços e Outros', 'PIB', 'IBGE', 'alto', 'trimestral'),
 ('br-inpc',           'BR', 'Atividade, Preços e Outros', 'INPC', 'IBGE', 'baixo', 'mensal'),
 ('br-pim',            'BR', 'Atividade, Preços e Outros', 'Produção Industrial (PIM-PF)', 'IBGE', 'medio', 'mensal'),
 ('br-pmc',            'BR', 'Atividade, Preços e Outros', 'Vendas no Varejo (PMC)', 'IBGE', 'medio', 'mensal'),
 ('br-pms',            'BR', 'Atividade, Preços e Outros', 'Volume de Serviços (PMS)', 'IBGE', 'medio', 'mensal'),
 ('br-ibcbr',          'BR', 'Atividade, Preços e Outros', 'IBC-Br', 'Banco Central do Brasil', 'medio', 'mensal'),
 ('br-igpm',           'BR', 'Atividade, Preços e Outros', 'IGP-M', 'FGV', 'medio', 'mensal'),
 ('br-igp10',          'BR', 'Atividade, Preços e Outros', 'IGP-10', 'FGV', 'baixo', 'mensal'),
 ('br-igpdi',          'BR', 'Atividade, Preços e Outros', 'IGP-DI', 'FGV', 'baixo', 'mensal'),
 ('br-ipcs',           'BR', 'Atividade, Preços e Outros', 'IPC-S', 'FGV', 'baixo', 'semanal'),
 ('br-ipcfipe',        'BR', 'Atividade, Preços e Outros', 'IPC-Fipe', 'FIPE', 'baixo', 'mensal e quadrissemanal'),
 ('br-confianca-fgv',  'BR', 'Atividade, Preços e Outros', 'Sondagens e índices de confiança (consumidor, indústria, comércio, serviços)', 'FGV', 'baixo', 'mensal'),
 ('br-balanca',        'BR', 'Atividade, Preços e Outros', 'Balança Comercial', 'MDIC/Secex', 'medio', 'semanal e mensal'),
 ('br-transacoes',     'BR', 'Atividade, Preços e Outros', 'Transações correntes e investimento direto', 'Banco Central do Brasil', 'medio', 'mensal'),
 ('br-tesouro-rtn',    'BR', 'Atividade, Preços e Outros', 'Resultado do Tesouro Nacional (Governo Central)', 'Tesouro Nacional', 'medio', 'mensal'),
 ('br-divida-publica', 'BR', 'Atividade, Preços e Outros', 'Relatório Mensal da Dívida Pública', 'Tesouro Nacional', 'baixo', 'mensal'),
 ('br-fiscal-bcb',     'BR', 'Atividade, Preços e Outros', 'Estatísticas Fiscais (resultado primário do setor público, dívida bruta)', 'Banco Central do Brasil', 'medio', 'mensal'),
 ('br-ipea-carta',     'BR', 'Atividade, Preços e Outros', 'Carta de Conjuntura', 'Ipea', 'baixo', 'trimestral'),
 ('br-bndes-sinopse',  'BR', 'Atividade, Preços e Outros', 'Sinopse Econômica', 'BNDES', 'baixo', 'mensal'),
 ('br-fipe-boletim',   'BR', 'Atividade, Preços e Outros', 'Boletim de Informações FIPE', 'FIPE', 'baixo', 'mensal'),
 ('br-dieese-cesta',   'BR', 'Atividade, Preços e Outros', 'Cesta básica e custo de vida', 'DIEESE', 'baixo', 'mensal'),
 ('br-cni-sondagem',   'BR', 'Atividade, Preços e Outros', 'Sondagem Industrial e confiança do empresário (ICEI)', 'CNI', 'baixo', 'mensal'),
 ('br-cnc-confianca',  'BR', 'Atividade, Preços e Outros', 'Confiança do comércio (ICEC) e intenção de consumo (ICF)', 'CNC', 'baixo', 'mensal'),
-- BRASIL — emprego
 ('br-caged',          'BR', 'Emprego e Mercado de Trabalho', 'Novo CAGED (emprego formal)', 'Ministério do Trabalho e Emprego', 'alto', 'mensal'),
 ('br-pnad',           'BR', 'Emprego e Mercado de Trabalho', 'PNAD Contínua (taxa de desocupação)', 'IBGE', 'alto', 'mensal'),
 ('br-fiesp-emprego',  'BR', 'Emprego e Mercado de Trabalho', 'Nível de Emprego Industrial', 'FIESP', 'baixo', 'mensal'),
 ('br-cni-indicadores','BR', 'Emprego e Mercado de Trabalho', 'Indicadores Industriais (emprego, renda e horas)', 'CNI', 'baixo', 'mensal'),
 ('br-dieese-emprego', 'BR', 'Emprego e Mercado de Trabalho', 'Emprego, desemprego e rendimento', 'DIEESE', 'baixo', 'mensal'),
-- BRASIL — crédito
 ('br-credito-bcb',    'BR', 'Endividamento e Crédito', 'Estatísticas de crédito (concessões, spreads, inadimplência, comprometimento de renda)', 'Banco Central do Brasil', 'medio', 'mensal'),
 ('br-peic',           'BR', 'Endividamento e Crédito', 'PEIC — endividamento e inadimplência do consumidor', 'CNC', 'baixo', 'mensal'),
-- BRASIL — habitação e construção
 ('br-cbic',           'BR', 'Habitação e Construção', 'Indicadores da construção (custos, emprego, imobiliário, sondagens)', 'CBIC', 'baixo', 'mensal'),
 ('br-incc',           'BR', 'Habitação e Construção', 'INCC', 'FGV', 'baixo', 'mensal'),
 ('br-sinapi',         'BR', 'Habitação e Construção', 'SINAPI (custo da construção)', 'IBGE', 'baixo', 'mensal'),
 ('br-secovi',         'BR', 'Habitação e Construção', 'Pesquisa do Mercado Imobiliário (vendas e estoques)', 'Secovi-SP', 'baixo', 'mensal'),
 ('br-abecip',         'BR', 'Habitação e Construção', 'Financiamento imobiliário (SBPE) e IGMI-R', 'ABECIP', 'baixo', 'mensal'),
 ('br-fipezap',        'BR', 'Habitação e Construção', 'Índice FipeZAP (preços de imóveis)', 'FIPE', 'baixo', 'mensal'),
-- EUA — política monetária e preços (alto impacto)
 ('us-fomc',           'EUA', 'Política Monetária', 'Decisão do FOMC (Fed Funds)', 'Federal Reserve', 'alto', '8 reuniões por ano'),
 ('us-fomc-ata',       'EUA', 'Política Monetária', 'Ata do FOMC', 'Federal Reserve', 'medio', '8 por ano'),
 ('us-livro-bege',     'EUA', 'Política Monetária', 'Livro Bege', 'Federal Reserve', 'medio', '8 por ano'),
 ('us-cpi',            'EUA', 'Atividade, Preços e Outros', 'CPI (inflação ao consumidor)', 'BLS', 'alto', 'mensal'),
 ('us-ppi',            'EUA', 'Atividade, Preços e Outros', 'PPI (preços ao produtor)', 'BLS', 'medio', 'mensal'),
 ('us-pce',            'EUA', 'Atividade, Preços e Outros', 'Renda e gastos pessoais (PCE)', 'BEA', 'alto', 'mensal'),
 ('us-gdp',            'EUA', 'Atividade, Preços e Outros', 'PIB (GDP)', 'BEA', 'alto', 'trimestral, com revisões'),
 ('us-trade',          'EUA', 'Atividade, Preços e Outros', 'Balança comercial', 'BEA/Census', 'medio', 'mensal'),
 ('us-retail',         'EUA', 'Atividade, Preços e Outros', 'Vendas no varejo', 'Census Bureau', 'alto', 'mensal'),
 ('us-ism-man',        'EUA', 'Atividade, Preços e Outros', 'ISM Manufacturing PMI', 'ISM', 'alto', 'mensal'),
 ('us-ism-serv',       'EUA', 'Atividade, Preços e Outros', 'ISM Services PMI', 'ISM', 'alto', 'mensal'),
 ('us-indprod',        'EUA', 'Atividade, Preços e Outros', 'Produção industrial e utilização da capacidade', 'Federal Reserve', 'medio', 'mensal'),
 ('us-z1',             'EUA', 'Atividade, Preços e Outros', 'Flow of Funds (Z.1)', 'Federal Reserve', 'baixo', 'trimestral'),
 ('us-lei',            'EUA', 'Atividade, Preços e Outros', 'Leading Economic Index (LEI)', 'The Conference Board', 'baixo', 'mensal'),
 ('us-confianca-cb',   'EUA', 'Atividade, Preços e Outros', 'Confiança do consumidor', 'The Conference Board', 'medio', 'mensal'),
 ('us-michigan',       'EUA', 'Atividade, Preços e Outros', 'Sentimento do consumidor (Universidade de Michigan)', 'Universidade de Michigan', 'medio', 'mensal'),
 ('us-duraveis',       'EUA', 'Atividade, Preços e Outros', 'Encomendas de bens duráveis', 'Census Bureau', 'medio', 'mensal'),
-- EUA — emprego
 ('us-payroll',        'EUA', 'Emprego e Mercado de Trabalho', 'Relatório de emprego (payroll e taxa de desemprego)', 'BLS', 'alto', 'mensal'),
 ('us-jolts',          'EUA', 'Emprego e Mercado de Trabalho', 'JOLTS (vagas abertas)', 'BLS', 'medio', 'mensal'),
 ('us-claims',         'EUA', 'Emprego e Mercado de Trabalho', 'Pedidos de auxílio-desemprego', 'Department of Labor', 'medio', 'semanal (quinta-feira)'),
 ('us-adp',            'EUA', 'Emprego e Mercado de Trabalho', 'ADP Employment Report', 'ADP', 'medio', 'mensal'),
 ('us-emprego-estados','EUA', 'Emprego e Mercado de Trabalho', 'Emprego e desemprego por estado', 'BLS', 'baixo', 'mensal'),
 ('us-help-wanted',    'EUA', 'Emprego e Mercado de Trabalho', 'Help-Wanted OnLine Index', 'The Conference Board', 'baixo', 'mensal'),
-- EUA — crédito
 ('us-g19',            'EUA', 'Endividamento e Crédito', 'Crédito ao consumidor (G.19)', 'Federal Reserve', 'baixo', 'mensal'),
 ('us-nyfed-divida',   'EUA', 'Endividamento e Crédito', 'Household Debt and Credit Report', 'Federal Reserve Bank of New York', 'baixo', 'trimestral'),
 ('us-philly-credito', 'EUA', 'Endividamento e Crédito', 'Dados de crédito de grandes bancos (cartões e hipotecas)', 'Federal Reserve Bank of Philadelphia', 'baixo', 'trimestral'),
-- EUA — habitação
 ('us-starts',         'EUA', 'Habitação e Construção', 'Housing starts e building permits', 'Census Bureau/HUD', 'medio', 'mensal'),
 ('us-new-home',       'EUA', 'Habitação e Construção', 'Vendas de casas novas (new home sales)', 'Census Bureau/HUD', 'medio', 'mensal'),
 ('us-existing-home',  'EUA', 'Habitação e Construção', 'Vendas de casas usadas e preço mediano', 'NAR', 'medio', 'mensal'),
 ('us-pending-home',   'EUA', 'Habitação e Construção', 'Vendas pendentes de imóveis', 'NAR', 'baixo', 'mensal'),
 ('us-fhfa',           'EUA', 'Habitação e Construção', 'FHFA House Price Index', 'FHFA', 'baixo', 'mensal'),
 ('us-case-shiller',   'EUA', 'Habitação e Construção', 'S&P CoreLogic Case-Shiller', 'S&P Dow Jones Indices', 'baixo', 'mensal'),
 ('us-hud',            'EUA', 'Habitação e Construção', 'National Housing Market Summary e Housing Market Indicators', 'HUD', 'baixo', 'mensal e trimestral')
on conflict (id) do update set pais = excluded.pais, grupo = excluded.grupo, indicador = excluded.indicador, instituicao = excluded.instituicao,
  impacto = excluded.impacto, frequencia = excluded.frequencia, atualizado_em = now();

-- ------------------------------------------------------------ 2. agenda: campos dos indicadores
alter table public.vm_agenda add column if not exists tipo        text not null default 'evento' check (tipo in ('evento', 'indicador'));
alter table public.vm_agenda add column if not exists pais        text check (pais in ('BR', 'EUA'));
alter table public.vm_agenda add column if not exists grupo       text;
alter table public.vm_agenda add column if not exists indicador   text;
alter table public.vm_agenda add column if not exists instituicao text;
alter table public.vm_agenda add column if not exists impacto     text check (impacto in ('alto', 'medio', 'baixo'));
alter table public.vm_agenda add column if not exists referencia  text;           -- período de referência (ex.: "outubro", "3º tri")
alter table public.vm_agenda add column if not exists anterior    text;           -- resultado anterior, quando a fonte trouxer

-- ------------------------------------------------------------ 3. Scanner público com a agenda de indicadores
-- segunda-feira: indicadores de segunda a sexta; demais dias: só os do dia. Sem nome de fonte de imprensa: só a instituição.
create or replace function public._vm_agenda_scanner(p_data date) returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('data', a.data_ref, 'hora', a.hora, 'pais', a.pais, 'grupo', a.grupo,
           'indicador', coalesce(a.indicador, a.evento), 'instituicao', a.instituicao, 'impacto', coalesce(a.impacto, 'baixo'),
           'referencia', a.referencia, 'consenso', a.consenso, 'anterior', a.anterior)
         order by a.data_ref, case coalesce(a.impacto, 'baixo') when 'alto' then 0 when 'medio' then 1 else 2 end, a.hora), '[]'::jsonb)
    from (select distinct on (x.data_ref, coalesce(x.indicador, x.evento), x.hora) x.*
            from public.vm_agenda x
           where x.tipo = 'indicador'
             and x.data_ref between p_data and p_data + case when extract(isodow from p_data) = 1 then 4 else 0 end
           order by x.data_ref, coalesce(x.indicador, x.evento), x.hora, x.coletado_em desc) a
$$;
revoke all on function public._vm_agenda_scanner(date) from public, anon, authenticated;

create or replace function public.vm_scanner_publico()
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce((
    select jsonb_build_object('id', m.id, 'data', m.data_ref, 'texto', m.texto_aprovado, 'fontes', m.fontes,
                              'publicado_em', m.aprovado_em, 'agenda', public._vm_agenda_scanner(m.data_ref),
                              'semana', extract(isodow from m.data_ref) = 1)
      from public.vm_materias m
     where m.tipo = 'scanner' and m.situacao = 'publicada'
       and m.data_ref >= (now() at time zone 'America/Sao_Paulo')::date - 7
     order by m.data_ref desc, m.aprovado_em desc limit 1), '{}'::jsonb);
$$;
revoke all on function public.vm_scanner_publico() from public;
grant execute on function public.vm_scanner_publico() to anon, authenticated;

create or replace function public.vm_scanner_publico_data(p_data date)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce((
    select jsonb_build_object('id', m.id, 'data', m.data_ref, 'texto', m.texto_aprovado, 'fontes', m.fontes,
                              'publicado_em', m.aprovado_em, 'agenda', public._vm_agenda_scanner(m.data_ref),
                              'semana', extract(isodow from m.data_ref) = 1)
      from public.vm_materias m
     where m.tipo = 'scanner' and m.situacao = 'publicada' and m.data_ref = p_data
     order by m.aprovado_em desc limit 1), '{}'::jsonb);
$$;
revoke all on function public.vm_scanner_publico_data(date) from public;
grant execute on function public.vm_scanner_publico_data(date) to anon, authenticated;

notify pgrst, 'reload schema';

select (select count(*) from public.vm_indicadores_universo where ativo) as universo,
       (select count(*) from public.vm_indicadores_universo where ativo and impacto = 'alto') as alto,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'vm_agenda'
         and column_name in ('tipo', 'pais', 'grupo', 'indicador', 'instituicao', 'impacto', 'referencia', 'anterior')) as colunas_agenda;
