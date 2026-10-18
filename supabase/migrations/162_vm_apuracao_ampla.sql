-- 162_vm_apuracao_ampla.sql — Valor e Mercado: APURAÇÃO AMPLA SEMANAL e DIÁRIA (uma apuração, vários artigos) — rev. 18/10 17h40
-- Rev. 17h40 (decisões do Thiago 16h42–16h59): DeepSeek V4 Pro escreve FORA DO PICO; 5 ARTIGOS DIÁRIOS de segunda a sexta,
-- com os mesmos 5 temas (apuração às 07h00, publicação 09h–17h); Scanner do Dia passa para as 07h00 (DeepSeek V4 Pro).
-- Os artigos SEMANAIS passam a sair no domingo à noite (18h–20h), para não chocar com os diários de segunda.
-- Decisão do Thiago (18/10/2026 16h32): "UMA APURAÇÃO GRANDE POR SEMANA, VÁRIOS ARTIGOS — APROVADO"; temas escolhidos:
-- Juros/inflação/Copom, Câmbio e dólar, Agronegócio, Mineração e siderurgia (+ a Petrobras, que já existia).
-- Como funciona (Edge Function artigo-semanal v1.4):
--   domingo 16h00  o Sonnet faz UMA apuração com busca na web para TODAS as pautas do grupo (até 60 buscas, ~US$ 1 a 1,50)
--   a seguir       a DeepSeek escreve um artigo por pauta só com os fatos daquela pauta (~US$ 0,01 cada), 1 por passo de 5 min
--   segunda        os artigos entram AGENDADOS: Petrobras 07h, Juros 09h, Câmbio 11h, Agronegócio 13h, Mineração 15h
-- Pauta com menos de 15 fatos não é escrita (nada é publicado sem apuração). Tudo passa pela mesma conferência automática.
-- Rodar no SQL Editor (Supabase > SQL Editor > New query > Run) DEPOIS de atualizar a função artigo-semanal para a v1.4,
-- e NÃO no domingo entre 16h e 22h (para não começar a semana pela metade).

-- 1. Campos novos das pautas ----------------------------------------------------------------------------------
alter table public.vm_pautas_semanais add column if not exists tipo text not null default 'artigo' check (tipo in ('artigo', 'apuracao'));
alter table public.vm_pautas_semanais add column if not exists grupo text references public.vm_pautas_semanais(id);
alter table public.vm_pautas_semanais add column if not exists area text check (length(area) <= 80);
alter table public.vm_pautas_semanais add column if not exists perfil text check (length(perfil) <= 800);
alter table public.vm_pautas_semanais add column if not exists regras text check (length(regras) <= 2000);
alter table public.vm_pautas_semanais add column if not exists fontes_primarias text check (length(fontes_primarias) <= 300);
alter table public.vm_pautas_semanais add column if not exists foto_exemplos text check (length(foto_exemplos) <= 200);
alter table public.vm_pautas_semanais add column if not exists numeros text check (length(numeros) <= 200);
alter table public.vm_pautas_semanais add column if not exists buscas int check (buscas between 4 and 90);
alter table public.vm_pautas_semanais add column if not exists periodo text not null default 'semana' check (periodo in ('semana', 'dia'));
alter table public.vm_pautas_semanais add column if not exists dias_semana int[];          -- 0 = domingo … 6 = sábado (pauta diária)

-- 2. A apuração ampla (não vira artigo: só apura para as pautas do grupo) -----------------------------------------
insert into public.vm_pautas_semanais (id, tipo, nome, chapeu, editoria, tickers, tema, estrutura, dia_escrever, hora_escrever, dias_publicar,
                                       hora_publicar, foto_busca, buscas, redator)
values ('apuracao-semanal', 'apuracao', 'Apuração ampla da semana', 'APURAÇÃO', 'Economia', '{}',
  'Semana de 7 dias até hoje. Para cada pauta, priorize o que mexeu com preços, juros, câmbio e ações; registre a agenda da próxima semana com dia e horário.',
  '', 0, 16 * 60, 0, 0, 'financial market', 60, 'deepseek')
on conflict (id) do update set tipo = excluded.tipo, tema = excluded.tema, hora_escrever = excluded.hora_escrever, buscas = excluded.buscas,
  ativa = true, atualizado_em = now();

-- 3. Pautas do grupo -------------------------------------------------------------------------------------------
insert into public.vm_pautas_semanais (id, grupo, nome, chapeu, editoria, tickers, tema, estrutura, exigir, palavras_min, palavras_max, fontes_min,
  dia_escrever, hora_escrever, dias_publicar, hora_publicar, foto_busca, tags, redator, modelo_redator,
  area, perfil, regras, fontes_primarias, foto_exemplos, numeros)
values
('juros-inflacao', 'apuracao-semanal', 'Juros, inflação e Copom — semanal', 'JUROS & INFLAÇÃO', 'Política Econômica', '{}',
  'Política monetária e inflação no Brasil: decisões e comunicação do Copom e do Banco Central (atas, falas da diretoria, Relatório de Política Monetária), '
  || 'Selic e curva de juros futuros (DI), IPCA, IPCA-15, IGP-M e núcleos, expectativas do Boletim Focus, contas públicas e arcabouço fiscal como motores do prêmio, '
  || 'Tesouro Direto e leilões do Tesouro, e o efeito do Fed e dos juros americanos.',
  'abertura sem intertítulo: o fato da semana para os juros e a inflação | intertítulo "Banco Central e Copom": decisões, ata, falas | '
  || 'intertítulo "Inflação": IPCA, IPCA-15, IGPs e núcleos divulgados na semana | intertítulo "Expectativas e curva de juros": Focus, DI futuro, Tesouro | '
  || 'intertítulo "Fiscal": contas públicas e efeito no prêmio | intertítulo "O que acompanhar": agenda da próxima semana com o dia',
  array['Selic', 'IPCA', 'Copom', 'Focus', 'Banco Central'], 1000, 1600, 6, 0, 16 * 60 + 5, 1, 9 * 60, 'central bank building',
  array['Juros', 'Selic', 'Inflação', 'IPCA', 'Copom', 'Banco Central'], 'deepseek', 'deepseek-flash',
  'juros e inflação',
  'especializado em política monetária e inflação, com domínio de Copom, curva de juros (DI), Boletim Focus, índices de preços (IPCA, IPCA-15, IGPs e núcleos), Tesouro Nacional e da relação entre fiscal, câmbio e juros',
  E'- Toda decisão ou fala do Banco Central vem com a data, quem falou e o efeito observado nos juros futuros (em pontos-base) quando houver.\n- Índices de preços citados com o mês de referência, a variação mensal, a acumulada em 12 meses e a expectativa do mercado.',
  'Banco Central, Copom, IBGE, FGV, Tesouro Nacional, B3', '"central bank building", "brazilian real banknotes", "supermarket aisle"',
  'pontos-base, taxas ao ano, variações mensais e em 12 meses'),
('cambio', 'apuracao-semanal', 'Câmbio e dólar — semanal', 'CÂMBIO', 'Mercados', '{}',
  'Câmbio: o real frente ao dólar na semana (cotação de fechamento, máxima, mínima, variação), atuação do Banco Central (leilões, swaps), fluxo cambial, '
  || 'diferencial de juros, o dólar no mundo (índice DXY, euro, iene, moedas emergentes), o Fed e os juros americanos, commodities e risco fiscal como motores do real.',
  'abertura sem intertítulo: o dólar na semana e o fato que mais pesou | intertítulo "O real na semana": fechamentos, máxima, mínima, volume | '
  || 'intertítulo "Banco Central e fluxo": leilões, swaps, fluxo cambial | intertítulo "O dólar no mundo": DXY, Fed, juros americanos, emergentes | '
  || 'intertítulo "Os motores do real": juros, fiscal, commodities | intertítulo "O que acompanhar": agenda da próxima semana com o dia',
  array['dólar', 'real', 'Banco Central', 'Fed'], 1000, 1600, 6, 0, 16 * 60 + 5, 1, 11 * 60, 'us dollar brazilian real banknotes',
  array['Câmbio', 'Dólar', 'Real', 'Fed', 'Banco Central'], 'deepseek', 'deepseek-flash',
  'câmbio e moedas',
  'especializado em câmbio e moedas, com domínio de mercado à vista e futuro de dólar, intervenções do Banco Central (leilões e swaps), fluxo cambial, diferencial de juros, política do Fed e moedas emergentes',
  E'- O dólar é citado em R$ com 4 casas e a variação em % com sinal, sempre com o dia.\n- Cada motor do real vem com o fato concreto da semana e o efeito observado no dólar.',
  'Banco Central, Federal Reserve, Tesouro americano, B3', '"us dollar banknotes", "currency exchange board", "trading screen currency"',
  'reais por dólar com 4 casas, pontos do DXY, pontos-base'),
('agronegocio', 'apuracao-semanal', 'Agronegócio — semanal', 'AGRONEGÓCIO', 'Economia', '{}',
  'Agronegócio: safra brasileira (estimativas da Conab e do IBGE, clima, plantio e colheita), preços de soja, milho, café, açúcar, boi gordo e algodão '
  || '(Chicago, B3, Cepea), exportações (Secex), demanda da China, relatórios do USDA (WASDE), fretes e logística, crédito rural e Plano Safra.',
  'abertura sem intertítulo: o fato da semana para o campo | intertítulo "Safra e clima": Conab, IBGE, clima, plantio e colheita | '
  || 'intertítulo "Preços": soja, milho, café, açúcar, boi e algodão na semana | intertítulo "Exportações e China": Secex, embarques, demanda externa | '
  || 'intertítulo "USDA e mercado mundial": WASDE, Chicago, concorrentes | intertítulo "O que acompanhar": agenda da próxima semana com o dia',
  array['soja', 'milho', 'Conab', 'China'], 1000, 1600, 6, 0, 16 * 60 + 5, 1, 13 * 60, 'soybean harvest',
  array['Agronegócio', 'Soja', 'Milho', 'Safra', 'Exportação'], 'deepseek', 'deepseek-flash',
  'agronegócio',
  'especializado em agronegócio e commodities agrícolas, com domínio de safras (Conab, IBGE, USDA), formação de preços em Chicago e na B3, indicadores Cepea/Esalq, logística de exportação e da demanda chinesa',
  E'- Preços citados com a praça ou bolsa, a unidade (saca de 60 kg, bushel, arroba) e a variação na semana.\n- Estimativas de safra citadas com o órgão, a data e o número anterior.',
  'Conab, IBGE, USDA, Cepea/Esalq, Secex, Ministério da Agricultura', '"soybean harvest", "grain silos", "coffee plantation"',
  'toneladas, sacas de 60 kg, bushels, arrobas, US$ por tonelada'),
('mineracao-siderurgia', 'apuracao-semanal', 'Mineração e siderurgia — semanal', 'MINERAÇÃO & SIDERURGIA', 'Empresas', array['VALE3', 'GGBR4', 'CSNA3', 'USIM5'],
  'Mineração e siderurgia: minério de ferro (preço em Dalian e Singapura, estoques nos portos chineses), Vale (produção, vendas, comunicados à CVM, Samarco e Brumadinho), '
  || 'siderúrgicas (Gerdau, CSN, Usiminas), preço do aço, importações de aço e tarifas, demanda da China (construção, PMI, estímulos), cobre, lítio e níquel.',
  'abertura sem intertítulo: o fato da semana e o desempenho de VALE3 e do minério | intertítulo "Vale": produção, comunicados, dividendos | '
  || 'intertítulo "Minério de ferro e China": preços, estoques, demanda, estímulos | intertítulo "Siderurgia": Gerdau, CSN, Usiminas, aço e importações | '
  || 'intertítulo "Outros metais": cobre, lítio, níquel | intertítulo "O que acompanhar": agenda da próxima semana com o dia',
  array['VALE3', 'minério de ferro', 'China', 'aço'], 1000, 1600, 6, 0, 16 * 60 + 5, 1, 15 * 60, 'iron ore mine',
  array['Mineração', 'Vale', 'VALE3', 'Minério', 'Siderurgia', 'Aço'], 'deepseek', 'deepseek-flash',
  'mineração e siderurgia',
  'especializado em mineração, siderurgia e metais, com domínio do mercado de minério de ferro (Dalian, Singapura, prêmios de qualidade), da economia chinesa, de balanços de mineradoras e siderúrgicas e de comércio exterior de aço',
  E'- Minério citado em US$ por tonelada (ou yuan em Dalian) com a variação na semana e o dia.\n- Comunicados da Vale e das siderúrgicas citados com a data e o documento (fato relevante, relatório de produção).',
  'Vale, Gerdau, CSN, Usiminas, Aço Brasil, Ministério de Minas e Energia, Departamento Nacional de Estatísticas da China', '"iron ore mine", "steel mill", "ore train"',
  'US$ por tonelada, milhões de toneladas, tickers')
on conflict (id) do update set grupo = excluded.grupo, nome = excluded.nome, chapeu = excluded.chapeu, editoria = excluded.editoria, tickers = excluded.tickers,
  tema = excluded.tema, estrutura = excluded.estrutura, exigir = excluded.exigir, palavras_min = excluded.palavras_min, palavras_max = excluded.palavras_max,
  fontes_min = excluded.fontes_min, dia_escrever = excluded.dia_escrever, hora_escrever = excluded.hora_escrever, dias_publicar = excluded.dias_publicar,
  hora_publicar = excluded.hora_publicar, foto_busca = excluded.foto_busca, tags = excluded.tags, redator = excluded.redator, modelo_redator = excluded.modelo_redator,
  area = excluded.area, perfil = excluded.perfil, regras = excluded.regras, fontes_primarias = excluded.fontes_primarias, foto_exemplos = excluded.foto_exemplos,
  numeros = excluded.numeros, ativa = true, atualizado_em = now();

-- 4. A Petrobras entra no grupo (mesma pauta, mesmo texto; os fatos passam a vir da apuração ampla) ----------------
update public.vm_pautas_semanais set grupo = 'apuracao-semanal', redator = 'deepseek', modelo_redator = coalesce(modelo_redator, 'deepseek-flash'),
       hora_escrever = 16 * 60 + 5, atualizado_em = now()
 where id = 'petrobras';

-- 5. Semanais: publicação no DOMINGO à noite (18h00 a 20h00) e redator DeepSeek V4 Pro ---------------------------------
update public.vm_pautas_semanais p set dias_publicar = 0, modelo_redator = 'deepseek-v4-pro', atualizado_em = now(),
       hora_publicar = case p.id when 'petrobras' then 18 * 60 when 'juros-inflacao' then 18 * 60 + 30 when 'cambio' then 19 * 60
                                 when 'agronegocio' then 19 * 60 + 30 else 20 * 60 end
 where p.grupo = 'apuracao-semanal';

-- 6. DIÁRIOS (segunda a sexta): apuração ampla às 07h00 e 5 artigos no mesmo dia, 09h00 a 17h00 -----------------------
insert into public.vm_pautas_semanais (id, tipo, periodo, dias_semana, nome, chapeu, editoria, tickers, tema, estrutura, dia_escrever, hora_escrever,
                                       dias_publicar, hora_publicar, foto_busca, buscas, redator)
values ('apuracao-diaria', 'apuracao', 'dia', array[1, 2, 3, 4, 5], 'Apuração ampla do dia', 'APURAÇÃO', 'Economia', '{}',
  'Últimas 24 horas até agora (inclui o fechamento de ontem, a noite, a Ásia, a Europa e o pré-mercado de hoje). Para cada pauta, priorize o que mexe com preços, juros, câmbio e ações HOJE; registre a agenda de hoje com horário.',
  '', 1, 7 * 60, 0, 0, 'financial market', 50, 'deepseek')
on conflict (id) do update set tipo = excluded.tipo, periodo = excluded.periodo, dias_semana = excluded.dias_semana, tema = excluded.tema,
  hora_escrever = excluded.hora_escrever, buscas = excluded.buscas, ativa = true, atualizado_em = now();

insert into public.vm_pautas_semanais (id, grupo, periodo, dias_semana, nome, chapeu, editoria, tickers, tema, estrutura, exigir, palavras_min, palavras_max,
  fontes_min, dia_escrever, hora_escrever, dias_publicar, hora_publicar, foto_busca, tags, redator, modelo_redator,
  area, perfil, regras, fontes_primarias, foto_exemplos, numeros)
select s.id || '-dia', 'apuracao-diaria', 'dia', array[1, 2, 3, 4, 5], replace(s.nome, '— semanal', '— do dia'), s.chapeu, s.editoria, s.tickers, s.tema,
  'abertura sem intertítulo: o fato do dia e o movimento dos preços | intertítulo "Os números do dia": cotações, indicadores e variações com o horário | '
  || 'intertítulo "O contexto": o que explica o movimento e o que disseram as fontes primárias | intertítulo "O que acompanhar": agenda de hoje e dos próximos dias com o horário',
  case s.id when 'petrobras' then array['PETR4', 'Brent'] when 'juros-inflacao' then array['Selic', 'juros'] when 'cambio' then array['dólar', 'real']
            when 'agronegocio' then array['soja', 'milho'] else array['minério de ferro', 'VALE3'] end,
  600, 1000, 4, 1, 7 * 60 + 5, 0,
  case s.id when 'petrobras' then 9 * 60 when 'juros-inflacao' then 11 * 60 when 'cambio' then 13 * 60 when 'agronegocio' then 15 * 60 else 17 * 60 end,
  s.foto_busca, s.tags, 'deepseek', 'deepseek-v4-pro', s.area, s.perfil, s.regras, s.fontes_primarias, s.foto_exemplos, s.numeros
  from public.vm_pautas_semanais s
 where s.grupo = 'apuracao-semanal'
on conflict (id) do update set grupo = excluded.grupo, periodo = excluded.periodo, dias_semana = excluded.dias_semana, nome = excluded.nome,
  tema = excluded.tema, estrutura = excluded.estrutura, exigir = excluded.exigir, palavras_min = excluded.palavras_min, palavras_max = excluded.palavras_max,
  fontes_min = excluded.fontes_min, hora_escrever = excluded.hora_escrever, dias_publicar = excluded.dias_publicar, hora_publicar = excluded.hora_publicar,
  modelo_redator = excluded.modelo_redator, area = excluded.area, perfil = excluded.perfil, regras = excluded.regras,
  fontes_primarias = excluded.fontes_primarias, foto_exemplos = excluded.foto_exemplos, numeros = excluded.numeros, ativa = true, atualizado_em = now();
-- (o perfil de petróleo da Petrobras vem do padrão da função; nos diários vale o mesmo)

-- 7. Scanner do Dia: 07h00 de Brasília em dias úteis (DeepSeek V4 Pro fora do pico; antes 06h45) ---------------------
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'vm-scanner-do-dia';
  perform cron.schedule('vm-scanner-do-dia', '0 10 * * 1-5', $job$ select public._vm_chamar_scanner('{}'::jsonb); $job$);
end $$;

-- conferência: esperado 12 linhas (2 apurações + 5 semanais + 5 diárias) e o Scanner às "0 10 * * 1-5" — apuracao-semanal (apuracao, domingo 16:00) e 5 pautas do grupo com publicação na segunda
select id, tipo, periodo, coalesce(grupo, '—') as grupo, coalesce(modelo_redator, '—') as modelo,
       case when periodo = 'dia' then 'seg a sex' else 'domingo' end as quando,
       to_char(make_time(hora_escrever / 60, hora_escrever % 60, 0), 'HH24:MI') as escreve,
       case when tipo = 'apuracao' then '—' else to_char(make_time(hora_publicar / 60, hora_publicar % 60, 0), 'HH24:MI') end as publica,
       (select schedule from cron.job where jobname = 'vm-scanner-do-dia') as scanner
  from public.vm_pautas_semanais where ativa order by periodo, tipo desc, hora_publicar;
