-- SQL 181 — SOLIDUNS / Valor e Mercado — FECHAMENTO SEM ATRASO (22/10/2026)
-- Pedido do Thiago (21/10 23h48): "os dados do fechamento do pregão de hoje já são públicos e gratuitos; por que ainda
-- não foram computados?"
-- Causa: o coletor rodava UMA vez, às 18h30. O arquivo de cotações da B3 (COTAHIST) do dia 21/10 só foi publicado às
-- 20h46 de Brasília. Às 18h30 ele ainda não existia, e a próxima tentativa era só no dia seguinte, às 18h30 (24 h de atraso).
-- Agora o coletor tenta de 30 em 30 minutos, das 18h30 às 23h30 (dias úteis), e mais uma vez às 06h30 do dia seguinte.
-- Quando o pregão já está gravado, a chamada só atualiza Ibovespa, PTAX, Selic, CDI, IPCA e Focus (nada se repete no banco).
-- Ao rodar, também chama o coletor UMA vez na hora, para gravar já o fechamento de 21/10.
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (4 linhas, todas com active = true):
--   vm-coletor-fechamento         | 30 21 * * 1-5      | true
--   vm-coletor-fechamento-manha   | 30 9 * * 2-6       | true
--   vm-coletor-fechamento-noite   | 0,30 0-2 * * 2-6   | true
--   vm-coletor-fechamento-tarde   | 0,30 22-23 * * 1-5 | true
do $$
declare
  cmd text := $job$
      select net.http_post(
        url     := (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_url'),
        headers := jsonb_build_object('Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_token')),
        body    := '{}'::jsonb,
        timeout_milliseconds := 120000);
    $job$;
begin
  perform cron.unschedule(jobid) from cron.job
   where jobname like 'vm-coletor-fechamento%';
  -- o pg_cron do Supabase usa UTC: Brasília = UTC − 3
  perform cron.schedule('vm-coletor-fechamento',       '30 21 * * 1-5',             cmd);  -- 18h30 (seg–sex)
  perform cron.schedule('vm-coletor-fechamento-tarde', '0,30 22-23 * * 1-5',        cmd);  -- 19h00 a 20h30 (seg–sex)
  perform cron.schedule('vm-coletor-fechamento-noite', '0,30 0-2 * * 2-6',          cmd);  -- 21h00 a 23h30 (seg–sex)
  perform cron.schedule('vm-coletor-fechamento-manha', '30 9 * * 2-6',              cmd);  -- 06h30 do dia seguinte
  execute cmd;                                                                               -- uma coleta agora
end $$;

select jobname, schedule, active from cron.job where jobname like 'vm-coletor-fechamento%' order by jobname;
