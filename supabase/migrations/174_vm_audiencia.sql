-- SQL 174 — SOLIDUNS / Valor e Mercado — MEDIÇÃO DE AUDIÊNCIA (20/10/2026)
-- Pedido do Thiago (20/10): "a medição de audiência no site, para ter esses números" (para o mídia kit e para anunciantes).
-- O que mede: visitantes únicos e páginas vistas por dia e por mês, artigos mais lidos, de onde vêm (Google, Telegram...)
-- e o aparelho (celular, computador, tablet). Só as páginas PÚBLICAS do site (capa, jornal, quem somos etc.).
-- Privacidade: não grava IP, nome, e-mail nem cookie. Cada navegador recebe um número aleatório anônimo (fica no próprio
-- navegador); robôs de busca e pré-visualizações não contam. Dados brutos guardados por 13 meses; depois o banco apaga sozinho
-- (o resumo mensal fica guardado para sempre em vm_audiencia_mensal).
-- Quem lê os números: só editores do jornal (Redação › Painel).
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): tabela | rls | registrar | resumo | limpeza_cron
--                               true   | true | true      | true   | 30 6 * * *

-- 1. Tabela das visitas -------------------------------------------------------------------------------------------------
create table if not exists public.vm_audiencia (
  id           bigint generated always as identity primary key,
  criado_em    timestamptz not null default now(),
  dia          date not null default (now() at time zone 'America/Sao_Paulo')::date,
  visitante    uuid not null,
  caminho      text not null check (char_length(caminho) between 1 and 120),
  artigo       bigint,
  origem       text check (char_length(origem) <= 80),
  dispositivo  text not null check (dispositivo in ('celular', 'computador', 'tablet'))
);
create index if not exists vm_audiencia_dia_idx       on public.vm_audiencia (dia);
create index if not exists vm_audiencia_visitante_idx on public.vm_audiencia (visitante, criado_em desc);
create index if not exists vm_audiencia_artigo_idx    on public.vm_audiencia (artigo, dia) where artigo is not null;
comment on table public.vm_audiencia is 'páginas vistas do site público (sem IP, sem dado pessoal); grava só via vm_registrar_visita';

alter table public.vm_audiencia enable row level security;
revoke all on public.vm_audiencia from public, anon, authenticated;
grant select on public.vm_audiencia to authenticated;
drop policy if exists vm_audiencia_editores_leem on public.vm_audiencia;
create policy vm_audiencia_editores_leem on public.vm_audiencia for select to authenticated using (public.vm_eh_editor());
-- sem política de insert/update/delete: ninguém grava direto; só a função abaixo (security definer)

-- 2. Resumo mensal permanente --------------------------------------------------------------------------------------------
create table if not exists public.vm_audiencia_mensal (
  mes          date primary key,              -- primeiro dia do mês
  visitantes   int not null default 0,
  visualizacoes int not null default 0,
  atualizado_em timestamptz not null default now()
);
alter table public.vm_audiencia_mensal enable row level security;
revoke all on public.vm_audiencia_mensal from public, anon, authenticated;
grant select on public.vm_audiencia_mensal to authenticated;
drop policy if exists vm_audiencia_mensal_editores_leem on public.vm_audiencia_mensal;
create policy vm_audiencia_mensal_editores_leem on public.vm_audiencia_mensal for select to authenticated using (public.vm_eh_editor());

-- 3. Registrar uma visita (chamada pelo site, sem login) ------------------------------------------------------------------
create or replace function public.vm_registrar_visita(p_visitante uuid, p_caminho text, p_origem text default null,
                                                      p_dispositivo text default 'computador') returns void
language plpgsql security definer set search_path to '' as $$
declare
  v_cam text := lower(left(btrim(coalesce(p_caminho, '')), 120));
  v_ori text := lower(left(btrim(coalesce(p_origem, '')), 80));
  v_dis text := case when p_dispositivo in ('celular', 'computador', 'tablet') then p_dispositivo else 'computador' end;
  v_art bigint;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_visitante is null or v_cam !~ '^/[a-z0-9/_\-]*$' then return; end if;   -- só caminhos do próprio site
  v_art := nullif(substring(v_cam from '^/noticias/artigo/([0-9]{1,12})'), '')::bigint;
  v_ori := case when v_ori ~ '^[a-z0-9.\-]+$' and v_ori !~ '(^|\.)soliduns\.com\.br$' then nullif(regexp_replace(v_ori, '^www\.', ''), '') end;
  -- a mesma pessoa na mesma página em 30 minutos conta uma vez; teto de 300 páginas por pessoa por dia (contra abuso)
  if exists (select 1 from public.vm_audiencia where visitante = p_visitante and caminho = v_cam and criado_em > now() - interval '30 minutes') then return; end if;
  if (select count(*) from public.vm_audiencia where visitante = p_visitante and dia = v_hoje) >= 300 then return; end if;
  insert into public.vm_audiencia (visitante, caminho, artigo, origem, dispositivo) values (p_visitante, v_cam, v_art, v_ori, v_dis);
end $$;
revoke all on function public.vm_registrar_visita(uuid, text, text, text) from public;
grant execute on function public.vm_registrar_visita(uuid, text, text, text) to anon, authenticated;

-- 4. Resumo para a Redação (só editores) ----------------------------------------------------------------------------------
create or replace function public.vm_audiencia_resumo(p_dias int default 30) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  d int := least(greatest(coalesce(p_dias, 30), 7), 400);
  ini date;
begin
  perform public._vm_exige_editor();
  ini := hoje - (d - 1);
  return jsonb_build_object(
    'hoje',   (select jsonb_build_object('visitantes', count(distinct visitante), 'visualizacoes', count(*)) from public.vm_audiencia where dia = hoje),
    'ontem',  (select jsonb_build_object('visitantes', count(distinct visitante), 'visualizacoes', count(*)) from public.vm_audiencia where dia = hoje - 1),
    'sete_dias', (select jsonb_build_object('visitantes', count(distinct visitante), 'visualizacoes', count(*)) from public.vm_audiencia where dia > hoje - 7),
    'periodo', (select jsonb_build_object('dias', d, 'visitantes', count(distinct visitante), 'visualizacoes', count(*)) from public.vm_audiencia where dia >= ini),
    'mes_atual', (select jsonb_build_object('visitantes', count(distinct visitante), 'visualizacoes', count(*)) from public.vm_audiencia
                   where dia >= date_trunc('month', hoje)::date),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', g::date, 'visitantes', coalesce(x.v, 0), 'visualizacoes', coalesce(x.p, 0)) order by g)
                   from generate_series(ini, hoje, interval '1 day') g
                   left join (select dia, count(distinct visitante) v, count(*) p from public.vm_audiencia where dia >= ini group by dia) x on x.dia = g::date), '[]'),
    'artigos', coalesce((select jsonb_agg(jsonb_build_object('id', t.artigo, 'titulo', a.titulo, 'visualizacoes', t.p, 'leitores', t.v) order by t.p desc)
                   from (select artigo, count(*) p, count(distinct visitante) v from public.vm_audiencia where dia >= ini and artigo is not null
                          group by artigo order by count(*) desc limit 10) t
                   left join public.vm_artigos a on a.id = t.artigo), '[]'),
    'paginas', coalesce((select jsonb_agg(jsonb_build_object('caminho', caminho, 'visualizacoes', p) order by p desc)
                   from (select caminho, count(*) p from public.vm_audiencia where dia >= ini and artigo is null group by caminho order by count(*) desc limit 8) t), '[]'),
    'origens', coalesce((select jsonb_agg(jsonb_build_object('origem', o, 'visitas', p) order by p desc)
                   from (select coalesce(origem, 'direto') o, count(*) p from public.vm_audiencia where dia >= ini group by 1 order by 2 desc limit 8) t), '[]'),
    'aparelhos', coalesce((select jsonb_object_agg(dispositivo, p) from (select dispositivo, count(*) p from public.vm_audiencia where dia >= ini group by 1) t), '{}'),
    'meses', coalesce((select jsonb_agg(jsonb_build_object('mes', mes, 'visitantes', visitantes, 'visualizacoes', visualizacoes) order by mes desc)
                   from (select mes, visitantes, visualizacoes from public.vm_audiencia_mensal order by mes desc limit 12) t), '[]')
  );
end $$;
revoke all on function public.vm_audiencia_resumo(int) from public, anon;
grant execute on function public.vm_audiencia_resumo(int) to authenticated;

-- 5. Todo dia às 03h30: fecha o resumo mensal e apaga visitas com mais de 13 meses ---------------------------------------
create or replace function public.vm_audiencia_manutencao() returns void
language plpgsql security definer set search_path to '' as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into public.vm_audiencia_mensal (mes, visitantes, visualizacoes, atualizado_em)
  select date_trunc('month', dia)::date, count(distinct visitante), count(*), now()
    from public.vm_audiencia where dia >= date_trunc('month', hoje - 1)::date - interval '1 month' and dia < hoje
   group by 1
  on conflict (mes) do update set visitantes = excluded.visitantes, visualizacoes = excluded.visualizacoes, atualizado_em = now();
  delete from public.vm_audiencia where dia < (hoje - interval '13 months')::date;
end $$;
revoke all on function public.vm_audiencia_manutencao() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'vm-audiencia-manutencao';
  perform cron.schedule('vm-audiencia-manutencao', '30 6 * * *', $job$ select public.vm_audiencia_manutencao(); $job$);   -- 03h30 de Brasília
end $$;

select to_regclass('public.vm_audiencia') is not null as tabela,
       (select relrowsecurity from pg_class where oid = 'public.vm_audiencia'::regclass) as rls,
       exists (select 1 from pg_proc where proname = 'vm_registrar_visita') as registrar,
       exists (select 1 from pg_proc where proname = 'vm_audiencia_resumo') as resumo,
       (select schedule from cron.job where jobname = 'vm-audiencia-manutencao') as limpeza_cron;
