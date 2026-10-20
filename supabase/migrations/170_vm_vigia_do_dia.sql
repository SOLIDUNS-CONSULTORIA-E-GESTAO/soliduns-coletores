-- SQL 170 — SOLIDUNS / Valor e Mercado — VIGIA DO DIA (20/10/2026)
-- Pedido do Thiago (20/10 08h22: "vou ter que ficar disparando manualmente todo dia?"): não.
-- De segunda a sexta, às 08h35 e às 11h15 de Brasília, o banco confere sozinho se saíram a agenda, a manchete, o Scanner
-- e a apuração/artigos do dia. Se o Scanner não saiu, ele mesmo dispara de novo. Se algo ficou para trás, manda um aviso
-- PRIVADO para o Thiago no Telegram (telegram-envio v1.6, ação "alerta"; nunca vai para os grupos). Tudo certo: silêncio.
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): vigia | agenda_cron
--                               true  | 35 11 * * 1-5 / 15 14 * * 1-5

create or replace function public.vm_vigia(p_avisar boolean default true) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  min int := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int * 60 + extract(minute from (now() at time zone 'America/Sao_Paulo'))::int;
  util boolean := extract(isodow from hoje) between 1 and 5;
  problemas text[] := '{}';
  v_ap text; v_fal int; v_ag int; v_pub int;
begin
  if not exists (select 1 from public.vm_edicoes where data = hoje and publicado) then
    problemas := problemas || ('Manchete de hoje NÃO publicada (' || coalesce((select etapa || ': ' || coalesce(registro->>-1, '')
      from public.vm_manchete_execucoes where data = hoje and modo = 'producao'), 'sem execução') || ')');
  end if;
  if util then
    if not exists (select 1 from public.vm_agenda where data_ref = hoje) then
      problemas := problemas || 'Agenda do dia vazia (a pesquisa das 06h15 não gravou nada).'::text;
    end if;
    if not exists (select 1 from public.vm_materias where tipo = 'scanner' and data_ref = hoje and situacao = 'publicada') then
      perform public._vm_chamar_scanner('{}'::jsonb);
      problemas := problemas || 'Scanner de hoje não tinha saído: o vigia disparou de novo agora (confira em 3 minutos).'::text;
    end if;
    select etapa || ': ' || coalesce(registro->>-1, '') into v_ap from public.vm_artigo_semanal_execucoes
     where pauta = 'apuracao-diaria' and semana = hoje and modo = 'producao';
    select count(*) filter (where etapa = 'falhou'), count(*) filter (where etapa in ('agendada', 'concluida'))
      into v_fal, v_ag from public.vm_artigo_semanal_execucoes e
     where e.semana = hoje and e.modo = 'producao' and e.pauta in (select id from public.vm_pautas_semanais where periodo = 'dia' and grupo is not null);
    select count(*) into v_pub from public.vm_artigos where situacao = 'publicado'
       and (publicado_em at time zone 'America/Sao_Paulo')::date = hoje and autor = 'Redação Valor e Mercado';
    if v_ap is null and min >= 8 * 60 then
      problemas := problemas || 'Apuração dos artigos diários não começou (deveria às 07h00).'::text;
    elsif v_ap like 'falhou%' then
      problemas := problemas || ('Apuração dos artigos diários FALHOU — ' || left(v_ap, 300));
    elsif coalesce(v_fal, 0) > 0 then
      problemas := problemas || (v_fal || ' artigo(s) diário(s) falharam; ' || coalesce(v_ag, 0) || ' prontos ou agendados.');
    end if;
  end if;
  if p_avisar and cardinality(problemas) > 0 then
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'vm_telegram_url'),
      headers := jsonb_build_object('Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_token')),
      body := jsonb_build_object('acao', 'alerta', 'texto',
                to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24"h"MI') || E'\n• ' || array_to_string(problemas, E'\n• ')),
      timeout_milliseconds := 30000);
  end if;
  return jsonb_build_object('data', hoje, 'problemas', to_jsonb(problemas), 'artigos_publicados_hoje', v_pub);
end $$;
revoke all on function public.vm_vigia(boolean) from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('vm-vigia-0835', 'vm-vigia-1115');
  perform cron.schedule('vm-vigia-0835', '35 11 * * 1-5', $job$ select public.vm_vigia(true); $job$);   -- 08h35 de Brasília
  perform cron.schedule('vm-vigia-1115', '15 14 * * 1-5', $job$ select public.vm_vigia(true); $job$);   -- 11h15 de Brasília
end $$;

select exists (select 1 from pg_proc where proname = 'vm_vigia') as vigia,
       (select string_agg(schedule, ' / ' order by jobname) from cron.job where jobname in ('vm-vigia-0835', 'vm-vigia-1115')) as agenda_cron;
