-- 144_vm_cvm_documentos.sql — Valor e Mercado: fatos relevantes e comunicados da CVM (plano de correção das fontes, item 3)
-- Decisão do Thiago (15/10/2026 16h12): as duas vias — consulta pública do dia (Empresas.NET) + dados abertos (reserva).
-- Edge Function "cvm-documentos" -> public.vm_achados (camada livre, crédito "CVM"). Rodar DEPOIS da 138.

-- 1. Endereço da função no cofre (trocar ENDERECO_REAL pelo final da URL da função, depois do deploy)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'vm_cvm_url') then
    perform vault.create_secret('https://evcsniicnrlrtzpdmeza.supabase.co/functions/v1/ENDERECO_REAL', 'vm_cvm_url',
                                'Edge Function cvm-documentos (Valor e Mercado)');
  end if;
end $$;

-- 2. Agenda: a cada 30 min, das 8h às 19h30 de Brasília (11h–22h30 UTC), dias úteis
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'vm-cvm-documentos';
    perform cron.schedule('vm-cvm-documentos', '*/30 11-22 * * 1-5', $job$
      select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'vm_cvm_url'),
        headers := jsonb_build_object('Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_token')),
        body := '{"dias": 2}'::jsonb, timeout_milliseconds := 120000);
    $job$);
  end if;
end $$;

-- conferência: esperado 1 linha "true | */30 11-22 * * 1-5"
select exists (select 1 from vault.secrets where name = 'vm_cvm_url') as segredo,
       (select schedule from cron.job where jobname = 'vm-cvm-documentos') as agenda;

-- 3. DEPOIS de conferir à mão os endereços e os termos, o Thiago marca as fontes como conferidas:
-- update public.fontes_noticia set verificada_em = now() where url in (
--   'https://www.rad.cvm.gov.br/ENET',     -- consulta pública de documentos (Empresas.NET)
--   'https://dados.cvm.gov.br');           -- Portal de Dados Abertos da CVM (ODbL)
