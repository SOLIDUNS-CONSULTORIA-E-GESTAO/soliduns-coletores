-- SQL 169 — SOLIDUNS / Valor e Mercado — LISTA MESTRE DE INDICADORES AMPLIADA (19/10/2026)
-- Pedido do Thiago (19/10 16h48: "AMPLIAR LISTA"): entram os indicadores que a pesquisa da semana achou fora da lista
-- (NAHB, PMI S&P Global, Monitor do PIB, fluxo cambial) e outros de acompanhamento frequente pelo mercado.
-- Também corrige o impacto dos itens já gravados na agenda desta semana (o impacto vem sempre da lista mestre).
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): universo | alto | agenda_atualizada
--                               (105)   | (16)   | (nº de itens da agenda reclassificados, pode ser 0)

insert into public.vm_indicadores_universo (id, pais, grupo, indicador, instituicao, impacto, frequencia) values
-- BRASIL
 ('br-monitor-pib',    'BR', 'Atividade, Preços e Outros', 'Monitor do PIB', 'FGV', 'baixo', 'mensal'),
 ('br-fluxo-cambial',  'BR', 'Atividade, Preços e Outros', 'Fluxo cambial', 'Banco Central do Brasil', 'baixo', 'semanal'),
 ('br-arrecadacao',    'BR', 'Atividade, Preços e Outros', 'Arrecadação federal', 'Receita Federal', 'medio', 'mensal'),
 ('br-leilao-tesouro', 'BR', 'Atividade, Preços e Outros', 'Leilões de títulos públicos', 'Tesouro Nacional', 'medio', 'semanal'),
 ('br-rtb-bimestral',  'BR', 'Atividade, Preços e Outros', 'Relatório de Avaliação de Receitas e Despesas Primárias', 'Ministério do Planejamento e Fazenda', 'alto', 'bimestral'),
 ('br-pmi',            'BR', 'Atividade, Preços e Outros', 'PMI industrial e de serviços', 'S&P Global', 'baixo', 'mensal'),
 ('br-ipp',            'BR', 'Atividade, Preços e Outros', 'IPP (preços ao produtor)', 'IBGE', 'baixo', 'mensal'),
 ('br-lspa',           'BR', 'Atividade, Preços e Outros', 'Levantamento Sistemático da Produção Agrícola (LSPA)', 'IBGE', 'baixo', 'mensal'),
 ('br-conab-safra',    'BR', 'Atividade, Preços e Outros', 'Levantamento de safra de grãos', 'Conab', 'medio', 'mensal'),
 ('br-anfavea',        'BR', 'Atividade, Preços e Outros', 'Produção e vendas de veículos', 'Anfavea', 'baixo', 'mensal'),
 ('br-fenabrave',      'BR', 'Atividade, Preços e Outros', 'Emplacamentos de veículos', 'Fenabrave', 'baixo', 'mensal'),
 ('br-icva',           'BR', 'Atividade, Preços e Outros', 'Índice Cielo do Varejo Ampliado (ICVA)', 'Cielo', 'baixo', 'mensal'),
 ('br-serasa',         'BR', 'Endividamento e Crédito', 'Inadimplência e recuperação judicial', 'Serasa Experian', 'baixo', 'mensal'),
 ('br-poupanca',       'BR', 'Endividamento e Crédito', 'Captação da poupança', 'Banco Central do Brasil', 'baixo', 'mensal'),
 ('br-copom-comunic',  'BR', 'Política Monetária', 'Falas e comunicações da diretoria do Banco Central', 'Banco Central do Brasil', 'medio', 'eventual'),
-- EUA
 ('us-nahb',           'EUA', 'Habitação e Construção', 'Índice NAHB do mercado imobiliário', 'NAHB', 'baixo', 'mensal'),
 ('us-pmi-sp',         'EUA', 'Atividade, Preços e Outros', 'PMI composto, industrial e de serviços', 'S&P Global', 'baixo', 'mensal'),
 ('us-construcao',     'EUA', 'Habitação e Construção', 'Gastos com construção', 'Census Bureau', 'baixo', 'mensal'),
 ('us-import-prices',  'EUA', 'Atividade, Preços e Outros', 'Preços de importação e exportação', 'BLS', 'baixo', 'mensal'),
 ('us-empire',         'EUA', 'Atividade, Preços e Outros', 'Empire State Manufacturing', 'Federal Reserve Bank of New York', 'baixo', 'mensal'),
 ('us-philly-fed',     'EUA', 'Atividade, Preços e Outros', 'Philadelphia Fed Manufacturing', 'Federal Reserve Bank of Philadelphia', 'baixo', 'mensal'),
 ('us-chicago-pmi',    'EUA', 'Atividade, Preços e Outros', 'Chicago PMI', 'ISM-Chicago', 'baixo', 'mensal'),
 ('us-estoques',       'EUA', 'Atividade, Preços e Outros', 'Estoques de petróleo', 'EIA', 'medio', 'semanal (quarta-feira)'),
 ('us-tesouro-leilao', 'EUA', 'Atividade, Preços e Outros', 'Leilões de Treasuries', 'Departamento do Tesouro', 'medio', 'semanal'),
 ('us-fala-fed',       'EUA', 'Política Monetária', 'Falas do presidente e de dirigentes do Fed', 'Federal Reserve', 'medio', 'eventual'),
 ('us-eci',            'EUA', 'Emprego e Mercado de Trabalho', 'Índice de Custo do Emprego (ECI)', 'BLS', 'medio', 'trimestral'),
 ('us-produtividade',  'EUA', 'Emprego e Mercado de Trabalho', 'Produtividade e custo unitário do trabalho', 'BLS', 'baixo', 'trimestral'),
 ('us-challenger',     'EUA', 'Emprego e Mercado de Trabalho', 'Anúncios de demissões (Challenger)', 'Challenger, Gray & Christmas', 'baixo', 'mensal'),
 ('us-orcamento',      'EUA', 'Atividade, Preços e Outros', 'Resultado do orçamento federal', 'Departamento do Tesouro', 'baixo', 'mensal'),
 ('us-senior-loan',    'EUA', 'Endividamento e Crédito', 'Pesquisa com responsáveis por crédito (SLOOS)', 'Federal Reserve', 'baixo', 'trimestral')
on conflict (id) do update set pais = excluded.pais, grupo = excluded.grupo, indicador = excluded.indicador, instituicao = excluded.instituicao,
  impacto = excluded.impacto, frequencia = excluded.frequencia, ativo = true, atualizado_em = now();

-- itens desta semana que vieram fora da lista: passam a usar o grupo, a instituição e o impacto da lista
with mapa(texto, id) as (values
  ('nahb', 'us-nahb'), ('s&p global pmi', 'us-pmi-sp'), ('monitor do pib', 'br-monitor-pib'), ('fluxo cambial', 'br-fluxo-cambial')),
alvo as (
  select a.id as agenda_id, u.* from public.vm_agenda a
    join mapa m on lower(coalesce(a.indicador, a.evento)) like '%' || m.texto || '%'
    join public.vm_indicadores_universo u on u.id = m.id
   where a.tipo = 'indicador' and a.data_ref >= (now() at time zone 'America/Sao_Paulo')::date - 7),
feito as (
  update public.vm_agenda a set grupo = alvo.grupo, instituicao = alvo.instituicao, impacto = alvo.impacto, indicador = alvo.indicador
    from alvo where a.id = alvo.agenda_id returning a.id)
select (select count(*) from public.vm_indicadores_universo where ativo) as universo,
       (select count(*) from public.vm_indicadores_universo where ativo and impacto = 'alto') as alto,
       (select count(*) from feito) as agenda_atualizada;
