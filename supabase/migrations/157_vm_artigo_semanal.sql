-- 157_vm_artigo_semanal.sql — Valor e Mercado: ARTIGO SEMANAL automático (1º tema: Petrobras e o mercado de petróleo) — rev. 17/10 21h28 (OPEP e motores do preço)
-- Pedido do Thiago (17/10/2026 21h21): "artigo semanal sobre a Petrobras (PETR3 e PETR4) no jornal… tudo que interessa ao
-- mercado de petróleo no Brasil e no mundo… com o Sonnet, como os demais agendados".
-- Edge Function "artigo-semanal" (mesmo motor da manchete-do-dia: lote da Anthropic + busca na web + conferência + foto),
-- chamada a cada 5 min. Cada pauta tem dia e hora para ser escrita; o artigo entra na Redação como AGENDADO para o horário
-- de publicação (o Thiago pode ler, editar ou despublicar antes) e o agendador vm-publicar-agendados (SQL 146) publica.
-- Rodar DEPOIS de criar a função artigo-semanal no painel (Edge Functions > Deploy a new function, JWT desligado).

-- 1. Pautas semanais (uma linha por tema; a Petrobras é a primeira) --------------------------------------------
create table if not exists public.vm_pautas_semanais (
  id             text primary key check (id ~ '^[a-z0-9-]{3,40}$'),
  ativa          boolean not null default true,
  nome           text not null,
  chapeu         text not null check (length(chapeu) <= 60),
  editoria       text not null default 'Empresas',
  tickers        text[] not null default '{}',
  tema           text not null,                         -- o que o artigo precisa cobrir (entra no prompt)
  estrutura      text not null default '',              -- seções obrigatórias do corpo (entra no prompt)
  exigir         text[] not null default '{}',          -- termos que o corpo PRECISA citar (conferência automática)
  palavras_min   int  not null default 900,
  palavras_max   int  not null default 1400,
  fontes_min     int  not null default 5,
  dia_escrever   int  not null check (dia_escrever between 0 and 6),          -- 0 = domingo (horário de Brasília)
  hora_escrever  int  not null check (hora_escrever between 0 and 1439),      -- minutos do dia
  dias_publicar  int  not null default 1 check (dias_publicar between 0 and 6), -- quantos dias depois de escrever
  hora_publicar  int  not null check (hora_publicar between 0 and 1439),
  foto_busca     text not null default 'oil refinery',
  tags           text[] not null default '{}',
  atualizado_em  timestamptz not null default now()
);
alter table public.vm_pautas_semanais enable row level security;
alter table public.vm_pautas_semanais force row level security;
revoke all on table public.vm_pautas_semanais from public, anon, authenticated;
drop policy if exists vm_pautas_semanais_editor on public.vm_pautas_semanais;
create policy vm_pautas_semanais_editor on public.vm_pautas_semanais for select to authenticated using (public.vm_eh_editor());
grant select on public.vm_pautas_semanais to authenticated;

insert into public.vm_pautas_semanais (id, nome, chapeu, editoria, tickers, tema, estrutura, exigir, palavras_min, palavras_max, fontes_min,
                                       dia_escrever, hora_escrever, dias_publicar, hora_publicar, foto_busca, tags)
values ('petrobras', 'Petrobras e o mercado de petróleo — semanal', 'PETRÓLEO & PETROBRAS', 'Empresas', array['PETR3', 'PETR4'],
  'Duas camadas na mesma leitura (pedido do Thiago, 17/10 21h28): (A) o CONTEXTO DA PETROBRAS — desempenho de PETR3, PETR4 e do '
  || 'Ibovespa; fatos relevantes e comunicados à CVM; produção (pré-sal, novos FPSOs, paradas); política de preços de diesel, gasolina e GLP; '
  || 'dividendos e recompras; governança e interferência política; plano de negócios, refino, Margem Equatorial e licenciamento; '
  || '(B) o CONTEXTO DO PETRÓLEO — Brent e WTI na semana e os motores do preço: OPEP+ (OPEC+: reuniões, cotas, cortes voluntários, '
  || 'cumprimento das cotas, falas de Arábia Saudita e Emirados); ORIENTE MÉDIO (conflitos na região produtora: Irã, Israel, Iraque, '
  || 'Estreito de Ormuz, Mar Vermelho e ataques a navios e instalações); RÚSSIA (sanções, teto de preço, exportações marítimas, ataques '
  || 'a refinarias e portos, frota paralela); VENEZUELA (produção da PDVSA, licenças e sanções dos EUA, exportações); ESTADOS UNIDOS '
  || '(produção de xisto, sondas em operação, estoques, Reserva Estratégica, política energética e comercial da Casa Branca, dólar e Fed); '
  || 'demanda da China e da Índia; no Brasil, ANP, leilões, tributação de combustíveis e biocombustíveis. '
  || 'PUBLICAÇÕES DE REFERÊNCIA que devem ser consultadas quando saírem na semana (citar pelo nome e pela data): Relatório Mensal do '
  || 'Mercado de Petróleo da OPEP (OPEC Monthly Oil Market Report), Relatório Mensal da Agência Internacional de Energia (IEA Oil Market '
  || 'Report), relatório semanal de estoques da EIA (Weekly Petroleum Status Report) e a projeção de curto prazo da EIA (Short-Term Energy '
  || 'Outlook), contagem de sondas da Baker Hughes, posições dos fundos na CFTC (Commitments of Traders), comunicados das reuniões da OPEP+, '
  || 'boletins de produção da ANP e o site de Relações com Investidores da Petrobras.',
  'abertura sem intertítulo (1 ou 2 parágrafos): o fato da semana e o desempenho de PETR3, PETR4 e do Brent na semana | '
  || 'intertítulo "Petrobras": comunicados, produção, preços, dividendos, governança | '
  || 'intertítulo "OPEP+": decisões, cotas, cumprimento e o que disse o relatório mensal da OPEP (OPEC MOMR) quando houver | '
  || 'intertítulo "Os motores do preço": um parágrafo para cada motor que pesou na semana — Oriente Médio, Rússia, Venezuela, Estados Unidos '
  || '(e China/Índia se relevante), cada um com o fato, a data e o efeito no Brent | '
  || 'intertítulo "Oferta, demanda e estoques": IEA, EIA (estoques semanais e projeção), sondas da Baker Hughes, posições dos fundos | '
  || 'intertítulo "Brasil": ANP, leilões, regulação, tributação, biocombustíveis, Margem Equatorial | '
  || 'intertítulo "O que acompanhar": agenda da próxima semana com o dia (reunião da OPEP+, relatórios da OPEP/IEA/EIA, resultados, assembleias)',
  array['PETR3', 'PETR4', 'Brent', 'OPEP', 'Oriente Médio', 'Rússia', 'Venezuela', 'Estados Unidos'], 1200, 1900, 8,
  0, 17 * 60, 1, 7 * 60, 'oil platform offshore', array['Petrobras', 'PETR4', 'PETR3', 'Petróleo', 'Brent', 'OPEP'])
on conflict (id) do update set tema = excluded.tema, estrutura = excluded.estrutura, exigir = excluded.exigir,
  palavras_min = excluded.palavras_min, palavras_max = excluded.palavras_max, fontes_min = excluded.fontes_min,
  foto_busca = excluded.foto_busca, tags = excluded.tags, atualizado_em = now();

-- 2. Registro das execuções (uma por pauta, semana e modo) --------------------------------------------------------
create table if not exists public.vm_artigo_semanal_execucoes (
  pauta         text not null references public.vm_pautas_semanais(id),
  semana        date not null,                    -- dia em que o artigo foi escrito (Brasília)
  modo          text not null default 'producao' check (modo in ('producao', 'teste')),
  etapa         text not null default 'nova',     -- nova | aguardando | pronta | agendada | falhou
  rodada        int  not null default 0,
  continuacoes  int  not null default 0,
  reenvios      int  not null default 0,
  modelo        text,
  lote_id       text,
  mensagens     jsonb not null default '[]'::jsonb,
  buscas        int  not null default 0,
  urls          jsonb not null default '{}'::jsonb,
  artigo        jsonb,
  fontes        jsonb not null default '[]'::jsonb,
  artigo_id     bigint,
  ent           bigint not null default 0,
  sai           bigint not null default 0,
  nbuscas       int  not null default 0,
  registro      jsonb not null default '[]'::jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (pauta, semana, modo)
);
alter table public.vm_artigo_semanal_execucoes enable row level security;
alter table public.vm_artigo_semanal_execucoes force row level security;
revoke all on table public.vm_artigo_semanal_execucoes from public, anon, authenticated;
drop policy if exists vm_artigo_semanal_execucoes_bloqueio on public.vm_artigo_semanal_execucoes;
create policy vm_artigo_semanal_execucoes_bloqueio on public.vm_artigo_semanal_execucoes
  as restrictive for all to anon, authenticated using (false) with check (false);

-- 3. Endereço da função no cofre e agenda a cada 5 min -----------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'vm_artigo_semanal_url') then
    perform vault.create_secret('https://evcsniicnrlrtzpdmeza.supabase.co/functions/v1/artigo-semanal',
                                'vm_artigo_semanal_url', 'Edge Function artigo-semanal (Valor e Mercado)');
  end if;
end $$;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'vm-artigo-semanal';
  perform cron.schedule('vm-artigo-semanal', '*/5 * * * *', $job$
    select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'vm_artigo_semanal_url'),
      headers := jsonb_build_object('Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_token')),
      body := '{}'::jsonb, timeout_milliseconds := 120000);
  $job$);
end $$;

-- conferência: esperado 1 linha "true | */5 * * * * | 1 | 0"
select exists (select 1 from vault.secrets where name = 'vm_artigo_semanal_url') as segredo,
       (select schedule from cron.job where jobname = 'vm-artigo-semanal') as agenda,
       (select count(*) from public.vm_pautas_semanais where ativa) as pautas,
       (select count(*) from public.vm_artigo_semanal_execucoes) as execucoes;
