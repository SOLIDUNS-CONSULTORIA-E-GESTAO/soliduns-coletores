-- 142_vm_calendario_oficial.sql — Valor e Mercado: agenda pelos CALENDÁRIOS OFICIAIS (plano de correção das fontes, item 1)
-- Pedido do Thiago (15/10/2026 12h25). Edge Function "calendario-oficial": IBGE, BLS, Federal Reserve (FOMC), Banco Central
-- (Copom e Focus) -> public.vm_agenda com origem = 'calendario_oficial'. O Scanner já dá prioridade a essa origem.
-- Cada fonte só roda depois de conferida à mão (fontes_noticia.verificada_em) — regra do Thiago. Rodar DEPOIS da 139.

-- 1. Endereço da função no cofre (trocar ENDERECO_REAL pelo final da URL da função, depois do deploy)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'vm_calendario_url') then
    perform vault.create_secret('https://evcsniicnrlrtzpdmeza.supabase.co/functions/v1/ENDERECO_REAL', 'vm_calendario_url',
                                'Edge Function calendario-oficial (Valor e Mercado)');
  end if;
end $$;

-- 2. Agenda: 6h05 de Brasília (9h05 UTC), dias úteis — antes da pesquisa na web (6h15) e do Scanner (6h45)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'vm-calendario-oficial';
    perform cron.schedule('vm-calendario-oficial', '5 9 * * 1-5', $job$
      select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'vm_calendario_url'),
        headers := jsonb_build_object('Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_token')),
        body := '{"dias": 7}'::jsonb, timeout_milliseconds := 120000);
    $job$);
  end if;
end $$;

-- conferência: esperado 1 linha "true | 5 9 * * 1-5"
select exists (select 1 from vault.secrets where name = 'vm_calendario_url') as segredo,
       (select schedule from cron.job where jobname = 'vm-calendario-oficial') as agenda;

-- 3. DEPOIS de conferir à mão cada endereço e os termos de uso, o Thiago marca as fontes como conferidas
--    (rodar à parte, só as linhas das fontes conferidas):
-- update public.fontes_noticia set verificada_em = now() where url in (
--   'https://servicodados.ibge.gov.br/api/v3',            -- IBGE
--   'https://www.bls.gov',                                -- BLS
--   'https://www.federalreserve.gov',                     -- Federal Reserve
--   'https://www.bcb.gov.br/controleinflacao/copom',      -- Copom
--   'https://www.bcb.gov.br/publicacoes/focus');          -- Focus
