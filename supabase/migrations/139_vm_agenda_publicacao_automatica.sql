-- 139_vm_agenda_publicacao_automatica.sql — Valor e Mercado (decisões do Thiago, 14/10/2026 15h43)
--   1. Scanner do Dia PUBLICADO AUTOMATICAMENTE, sem revisão (por enquanto). A verificação continua rodando só como registro.
--   2. A página nunca menciona IA (a nota sai do site; a v121 deixa de exibi-la).
--   3. Agenda do dia: tabela public.vm_agenda, alimentada hoje pela pesquisa na web (Edge Function agenda-do-dia) e,
--      depois, pelos coletores de calendários oficiais (mesma tabela, origem = 'calendario_oficial').
-- Rodar DEPOIS da migration 138.

-- 1. Publicação automática ------------------------------------------------------------------------------
alter table public.vm_materias add column if not exists publicacao_automatica boolean not null default false;
alter table public.vm_materias drop constraint if exists vm_materias_publicada_aprovada;
alter table public.vm_materias add constraint vm_materias_publicada_aprovada
  check (situacao not in ('publicada', 'substituida') or texto_aprovado is not null and aprovado_em is not null
         and (publicacao_automatica or aprovador_uid is not null));
alter table public.vm_materias drop constraint if exists vm_materias_reprovada_justificada;
alter table public.vm_materias add constraint vm_materias_reprovada_justificada
  check (situacao not in ('publicada', 'substituida') or publicacao_automatica or verificacao_ok or coalesce(btrim(justificativa), '') <> '');

-- leitura pública: sem nome de aprovador nem marcação de IA (decisão do Thiago)
create or replace function public.vm_scanner_publico()
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce((
    select jsonb_build_object('id', m.id, 'data', m.data_ref, 'texto', m.texto_aprovado, 'fontes', m.fontes,
                              'publicado_em', m.aprovado_em)
      from public.vm_materias m
     where m.tipo = 'scanner' and m.situacao = 'publicada'
       and m.data_ref >= (now() at time zone 'America/Sao_Paulo')::date - 7
     order by m.data_ref desc, m.aprovado_em desc limit 1), '{}'::jsonb);
$$;
revoke all on function public.vm_scanner_publico() from public;
grant execute on function public.vm_scanner_publico() to anon, authenticated;

-- tirar do ar um Scanner publicado automaticamente (administrador, pela Redação)
create or replace function public.vm_materia_despublicar(p_id bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'MOTIVO_OBRIGATORIO' using errcode = '22023'; end if;
  update public.vm_materias set situacao = 'descartada', motivo_descarte = btrim(p_motivo)
   where id = p_id and situacao = 'publicada';
  if not found then raise exception 'SITUACAO_INVALIDA' using errcode = '22023'; end if;
  return jsonb_build_object('id', p_id, 'situacao', 'descartada');
end $$;
revoke all on function public.vm_materia_despublicar(bigint, text) from public, anon;
grant execute on function public.vm_materia_despublicar(bigint, text) to authenticated;

-- a fila da Redação passa a listar também o Scanner publicado hoje (para conferir e, se preciso, tirar do ar)
create or replace function public.vm_materias_fila()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare ini timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  perform public._vm_exige_editor();
  return jsonb_build_object(
    'fila', coalesce((select jsonb_agg(to_jsonb(m) - 'contexto' order by m.criado_em desc)
                        from public.vm_materias m where m.situacao = 'rascunho'), '[]'::jsonb),
    'publicados', coalesce((select jsonb_agg(to_jsonb(m) - 'contexto' order by m.criado_em desc)
                        from public.vm_materias m where m.situacao = 'publicada'
                         and m.data_ref >= (now() at time zone 'America/Sao_Paulo')::date - 2), '[]'::jsonb),
    'recentes', coalesce((select jsonb_agg(x order by x->>'criado_em' desc) from (
                   select jsonb_build_object('id', m.id, 'tipo', m.tipo, 'data_ref', m.data_ref, 'situacao', m.situacao,
                          'titulo', coalesce(m.texto_aprovado->>'titulo', m.gerado->>'titulo'), 'aprovador_nome', m.aprovador_nome,
                          'publicacao_automatica', m.publicacao_automatica, 'aprovado_em', m.aprovado_em,
                          'motivo_descarte', m.motivo_descarte, 'criado_em', m.criado_em) as x
                     from public.vm_materias m where m.situacao <> 'rascunho' order by m.criado_em desc limit 15) r), '[]'::jsonb),
    'metricas', (select jsonb_build_object(
                   'gerados', count(*),
                   'publicados_automaticamente', count(*) filter (where publicacao_automatica),
                   'aprovados_sem_edicao', count(*) filter (where situacao in ('publicada','substituida') and not publicacao_automatica and editado is false),
                   'aprovados_com_edicao', count(*) filter (where situacao in ('publicada','substituida') and not publicacao_automatica and editado is true),
                   'descartados', count(*) filter (where situacao = 'descartada'),
                   'devolvidos', count(*) filter (where situacao = 'devolvida'),
                   'reprovados_na_verificacao', count(*) filter (where not verificacao_ok),
                   'custo_usd', coalesce(sum(custo_usd), 0),
                   'tokens', coalesce(sum(coalesce(tokens_entrada, 0) + coalesce(tokens_saida, 0)), 0))
                   from public.vm_materias where criado_em >= ini),
    'agenda_hoje', (select count(*) from public.vm_agenda where data_ref = (now() at time zone 'America/Sao_Paulo')::date),
    'ultimas_coletas', coalesce((select jsonb_agg(c order by c.iniciado_em desc) from
                   (select coletor, iniciado_em, situacao, novos, erro from public.vm_coletas order by iniciado_em desc limit 8) c), '[]'::jsonb));
end $$;

-- 2. Agenda do dia ----------------------------------------------------------------------------------------
create table if not exists public.vm_agenda (
  id          bigint generated always as identity primary key,
  data_ref    date not null,
  hora        text,                                  -- horário de Brasília (09h00) ou 'Dia todo' / 'A definir'
  regiao      text not null check (regiao in ('br', 'us', 'global')),
  categoria   text not null,                         -- CVM, Banco Central, Governo e Congresso, Federal Reserve, Agenda EUA, Empresas, Outros
  evento      text not null,
  consenso    text,
  fonte       text not null,
  url         text not null,
  origem      text not null check (origem in ('pesquisa_web', 'calendario_oficial')),
  chave       text not null unique,                  -- data|origem|hora|evento normalizado (sem repetir na mesma origem)
  coletado_em timestamptz not null default now()
);
create index if not exists vm_agenda_data on public.vm_agenda (data_ref, hora);
alter table public.vm_agenda enable row level security;
revoke all on table public.vm_agenda from anon, authenticated;
drop policy if exists vm_agenda_leitura_editor on public.vm_agenda;
create policy vm_agenda_leitura_editor on public.vm_agenda for select to authenticated using (public.vm_eh_editor());
grant select on public.vm_agenda to authenticated;
-- escrita só pela chave de serviço (agenda-do-dia e, depois, os coletores de calendário oficial)

-- 3. Agenda: pesquisa às 6h15 de Brasília (9h15 UTC), dias úteis, antes do Scanner (6h45) -------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'vm-agenda-do-dia';
    perform cron.schedule('vm-agenda-do-dia', '15 9 * * 1-5', $job$
      select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'vm_agenda_url'),
        headers := jsonb_build_object('Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_token')),
        body := '{}'::jsonb, timeout_milliseconds := 300000);
    $job$);
    raise notice 'Agenda criada: vm-agenda-do-dia às 6h15 de Brasília, dias úteis.';
  else
    raise notice 'ATENÇÃO: pg_cron e pg_net precisam estar ligados.';
  end if;
end $$;

-- conferência: esperado 1 linha "true | true | true"
select exists (select 1 from information_schema.columns where table_name = 'vm_materias' and column_name = 'publicacao_automatica') as publicacao_automatica,
       (select relrowsecurity from pg_class where oid = 'public.vm_agenda'::regclass) as agenda_com_rls,
       exists (select 1 from pg_proc where proname = 'vm_materia_despublicar') as despublicar;
