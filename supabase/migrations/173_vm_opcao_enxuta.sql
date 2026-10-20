-- SQL 173 — SOLIDUNS / Valor e Mercado — OPÇÃO B "ENXUTA" (20/10/2026)
-- Decisão do Thiago (20/10 16h05): economizar saldo da Anthropic.
--   * Artigo diário: DESLIGADO (as 5 pautas diárias ficam com ativa = false; dá para religar).
--   * Domingo: 1 artigo só, em RODÍZIO semanal entre os 5 temas (Petrobras → Juros e Inflação → Câmbio → Agronegócio →
--     Mineração e Siderurgia → …). Todo domingo às 05h00 o banco liga o tema da semana e desliga os outros; publica às 18h00.
--   * Manchete (até 8 buscas) e Scanner seguem diários (Sonnet). Agenda com menos buscas (agenda-do-dia v1.2: 6; segunda 10).
--   * Vigia (SQL 170): deixa de cobrar artigo diário quando não há pauta diária ligada.
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): diarios_ligados | tema_do_proximo_domingo | rodizio_cron
--                               0               | (um dos 5 temas)        | 0 8 * * 0

update public.vm_pautas_semanais set ativa = false, atualizado_em = now()
 where id in ('petrobras-dia', 'juros-inflacao-dia', 'cambio-dia', 'agronegocio-dia', 'mineracao-siderurgia-dia');

update public.vm_pautas_semanais set hora_publicar = 18 * 60, atualizado_em = now()
 where id in ('petrobras', 'juros-inflacao', 'cambio', 'agronegocio', 'mineracao-siderurgia');

-- rodízio: o tema do domingo sai do número da semana do ano (muda toda semana)
create or replace function public.vm_rodizio_domingo(p_data date default null) returns text
language plpgsql security definer set search_path to '' as $$
declare
  temas text[] := array['petrobras', 'juros-inflacao', 'cambio', 'agronegocio', 'mineracao-siderurgia'];
  dom date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  escolhido text;
begin
  dom := dom + ((7 - extract(isodow from dom)::int) % 7);          -- o domingo desta semana (ou o próprio dia, se domingo)
  escolhido := temas[(extract(week from dom)::int % 5) + 1];
  update public.vm_pautas_semanais set ativa = (id = escolhido), atualizado_em = now() where id = any(temas);
  return escolhido;
end $$;
revoke all on function public.vm_rodizio_domingo(date) from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'vm-rodizio-domingo';
  perform cron.schedule('vm-rodizio-domingo', '0 8 * * 0', $job$ select public.vm_rodizio_domingo(); $job$);   -- domingo 05h00 de Brasília
end $$;

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
     where e.semana = hoje and e.modo = 'producao' and e.pauta in (select id from public.vm_pautas_semanais where periodo = 'dia');
    select count(*) into v_pub from public.vm_artigos where situacao = 'publicado'
       and (publicado_em at time zone 'America/Sao_Paulo')::date = hoje and autor = 'Redação Valor e Mercado';
    -- v173: só cobra apuração/artigos diários se houver pauta diária ATIVA para hoje (opção B: nenhuma)
    if exists (select 1 from public.vm_pautas_semanais where id = 'apuracao-diaria' and ativa) and v_ap is null and min >= 8 * 60 then
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

select (select count(*) from public.vm_pautas_semanais where id like '%-dia' and ativa) as diarios_ligados,
       public.vm_rodizio_domingo() as tema_do_proximo_domingo,
       (select schedule from cron.job where jobname = 'vm-rodizio-domingo') as rodizio_cron;
