-- 138_vm_redacao_scanner.sql — Valor e Mercado, ETAPA 3: radar de fontes + "Scanner do Dia" com aprovação humana
-- (Prompts 12 a 17 do plano, adaptados à SOLIDUNS). Rodar DEPOIS das migrations 135, 136 e 137.
--
--   radar-fontes  (Edge Function) varre as fontes ATIVAS e CONFERIDAS de public.fontes_noticia, respeitando a camada:
--                 livre = título + resumo do próprio feed (pode virar texto-base com crédito);
--                 pauta = só título e link (radar de assuntos; o texto nunca é guardado);
--                 licenciada = não roda (o banco recusa).
--   scanner-do-dia (Edge Function) monta o contexto (cotacoes + achados) e chama a Anthropic com o prompt de sistema
--                 versão 1.0, SEM busca na web; o texto entra como RASCUNHO em public.vm_materias, com verificação.
--   Publicação: só por um administrador (vm_materia_aprovar), que fica registrado (nome, data e hora, texto aprovado).
-- Escrita das tabelas só pela chave de serviço (as Edge Functions) e pelas funções abaixo. Nenhuma chave neste arquivo.

-- 0. Quem é editor: os mesmos administradores dos Relatórios de Análise (public._analise_exige_admin, SQL 130)
create or replace function public.vm_eh_editor() returns boolean
language plpgsql stable security definer set search_path to '' as $$
begin
  perform public._analise_exige_admin();
  return true;
exception when others then
  return false;
end $$;
revoke all on function public.vm_eh_editor() from public, anon;
grant execute on function public.vm_eh_editor() to authenticated;

create or replace function public._vm_exige_editor() returns void
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.vm_eh_editor() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
end $$;
revoke all on function public._vm_exige_editor() from public, anon, authenticated;

-- 1. Fontes: endereço de coleta (feed) e conferência manual -----------------------------------------------
alter table public.fontes_noticia add column if not exists url_coleta text;   -- endereço do feed (url = página da fonte)
comment on column public.fontes_noticia.url_coleta    is 'endereço que o radar baixa (feed RSS/Atom); só é usado com verificada_em preenchida';
comment on column public.fontes_noticia.verificada_em is 'conferência MANUAL do endereço e dos termos de uso (regra do Thiago); sem ela o radar não lê a fonte';
-- Agência Brasil: feed de economia que o robô de manchetes já lê todo dia (cae89e4). A conferência fica com o Thiago.
update public.fontes_noticia
   set url_coleta = 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', licenca = coalesce(licenca, 'CC BY 4.0')
 where url = 'https://agenciabrasil.ebc.com.br/rss' and url_coleta is null;

-- 2. Achados do radar -------------------------------------------------------------------------------------
create table if not exists public.vm_achados (
  id           bigint generated always as identity primary key,
  fonte_id     bigint not null references public.fontes_noticia(id),
  fonte_nome   text not null,
  camada       text not null check (camada in ('livre', 'pauta')),      -- licenciada nunca entra
  titulo       text not null,
  resumo       text,                                                   -- só camada livre (resumo do próprio feed)
  link         text not null unique,
  publicado_em timestamptz,
  coletado_em  timestamptz not null default now(),
  constraint vm_achados_pauta_sem_texto check (camada <> 'pauta' or resumo is null)
);
create index if not exists vm_achados_coletado on public.vm_achados (coletado_em desc);
alter table public.vm_achados enable row level security;
revoke all on table public.vm_achados from anon, authenticated;
drop policy if exists vm_achados_leitura_editor on public.vm_achados;
create policy vm_achados_leitura_editor on public.vm_achados for select to authenticated using (public.vm_eh_editor());
grant select on public.vm_achados to authenticated;

-- 3. Registro de cada execução dos robôs (Prompt 12) -----------------------------------------------------
create table if not exists public.vm_coletas (
  id           bigint generated always as identity primary key,
  coletor      text not null,
  iniciado_em  timestamptz not null default now(),
  situacao     text not null check (situacao in ('ok', 'parcial', 'erro')),
  novos        integer not null default 0,
  detalhe      jsonb,
  erro         text
);
alter table public.vm_coletas enable row level security;
revoke all on table public.vm_coletas from anon, authenticated;
drop policy if exists vm_coletas_leitura_editor on public.vm_coletas;
create policy vm_coletas_leitura_editor on public.vm_coletas for select to authenticated using (public.vm_eh_editor());
grant select on public.vm_coletas to authenticated;

-- 4. Matérias geradas por IA (Prompts 14 a 17) ------------------------------------------------------------
create table if not exists public.vm_materias (
  id              bigint generated always as identity primary key,
  tipo            text not null default 'scanner' check (tipo in ('scanner', 'manchete')),
  data_ref        date not null,
  situacao        text not null default 'rascunho'
                  check (situacao in ('rascunho', 'publicada', 'substituida', 'descartada', 'devolvida')),
  gerado          jsonb not null,             -- saída do agente, intacta: chapeu, titulo, linha_fina, paragrafos, editoria_sugerida, tags, referencias
  fontes          jsonb not null default '[]'::jsonb,   -- referências resolvidas: id do registro, fonte, endereço da consulta
  contexto        jsonb not null,             -- exatamente o que o agente recebeu (auditoria)
  verificacoes    jsonb not null default '[]'::jsonb,
  verificacao_ok  boolean not null default false,
  gerado_por_ia   boolean not null default true,
  modelo          text,
  prompt_versao   text not null,              -- versão do prompt de sistema usada (ex.: 1.0)
  prompt_sha256   text not null,              -- impressão digital do texto exato do prompt
  instrucao_extra text,                       -- instrução do editor ao pedir nova geração
  origem_id       bigint references public.vm_materias(id),
  tokens_entrada  integer, tokens_saida integer, custo_usd numeric(10,4),
  criado_em       timestamptz not null default now(),
  texto_aprovado  jsonb,                      -- versão EXATA aprovada (pode ter sido editada)
  editado         boolean,
  justificativa   text,                       -- obrigatória para publicar rascunho reprovado na verificação
  aprovador_uid   uuid,
  aprovador_nome  text,
  aprovado_em     timestamptz,
  motivo_descarte text,
  constraint vm_materias_publicada_aprovada
    check (situacao not in ('publicada', 'substituida') or (aprovador_uid is not null and aprovado_em is not null and texto_aprovado is not null)),
  constraint vm_materias_reprovada_justificada
    check (situacao not in ('publicada', 'substituida') or verificacao_ok or coalesce(btrim(justificativa), '') <> '')
);
create index if not exists vm_materias_fila on public.vm_materias (situacao, criado_em desc);
alter table public.vm_materias enable row level security;
revoke all on table public.vm_materias from anon, authenticated;
drop policy if exists vm_materias_leitura_editor on public.vm_materias;
create policy vm_materias_leitura_editor on public.vm_materias for select to authenticated using (public.vm_eh_editor());
grant select on public.vm_materias to authenticated;
-- Ninguém (fora a chave de serviço) grava direto: aprovar, descartar e pedir nova geração só pelas funções abaixo.

-- 5. Fila de revisão e métricas do mês (Prompt 16) ---------------------------------------------------------
create or replace function public.vm_materias_fila()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare ini timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  perform public._vm_exige_editor();
  return jsonb_build_object(
    'fila', coalesce((select jsonb_agg(to_jsonb(m) - 'contexto' order by m.criado_em desc)
                        from public.vm_materias m where m.situacao = 'rascunho'), '[]'::jsonb),
    'recentes', coalesce((select jsonb_agg(x order by x->>'criado_em' desc) from (
                   select jsonb_build_object('id', m.id, 'tipo', m.tipo, 'data_ref', m.data_ref, 'situacao', m.situacao,
                          'titulo', coalesce(m.texto_aprovado->>'titulo', m.gerado->>'titulo'), 'aprovador_nome', m.aprovador_nome,
                          'aprovado_em', m.aprovado_em, 'motivo_descarte', m.motivo_descarte, 'criado_em', m.criado_em) as x
                     from public.vm_materias m where m.situacao <> 'rascunho' order by m.criado_em desc limit 15) r), '[]'::jsonb),
    'metricas', (select jsonb_build_object(
                   'gerados', count(*),
                   'aprovados_sem_edicao', count(*) filter (where situacao in ('publicada','substituida') and editado is false),
                   'aprovados_com_edicao', count(*) filter (where situacao in ('publicada','substituida') and editado is true),
                   'descartados', count(*) filter (where situacao = 'descartada'),
                   'devolvidos', count(*) filter (where situacao = 'devolvida'),
                   'custo_usd', coalesce(sum(custo_usd), 0),
                   'tokens', coalesce(sum(coalesce(tokens_entrada, 0) + coalesce(tokens_saida, 0)), 0))
                   from public.vm_materias where criado_em >= ini),
    'ultimas_coletas', coalesce((select jsonb_agg(c order by c.iniciado_em desc) from
                   (select coletor, iniciado_em, situacao, novos, erro from public.vm_coletas order by iniciado_em desc limit 6) c), '[]'::jsonb));
end $$;

-- 6. Aprovar (com edição livre), descartar, pedir nova geração (Prompt 16) ----------------------------------
create or replace function public.vm_materia_aprovar(p_id bigint, p_titulo text, p_linha_fina text,
                                                     p_paragrafos jsonb, p_chapeu text default null, p_justificativa text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare m public.vm_materias; v_txt jsonb; v_nome text; v_uid uuid := auth.uid();
begin
  perform public._vm_exige_editor();
  select * into m from public.vm_materias where id = p_id for update;
  if not found or m.situacao <> 'rascunho' then raise exception 'SITUACAO_INVALIDA' using errcode = '22023'; end if;
  if coalesce(btrim(p_titulo), '') = '' or jsonb_typeof(p_paragrafos) <> 'array' or jsonb_array_length(p_paragrafos) = 0 then
    raise exception 'TEXTO_INCOMPLETO' using errcode = '22023';
  end if;
  if not m.verificacao_ok and coalesce(btrim(p_justificativa), '') = '' then
    raise exception 'JUSTIFICATIVA_OBRIGATORIA' using errcode = '22023';
  end if;
  select coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'nome', ''),
                  nullif(u.raw_user_meta_data->>'name', ''), u.email)
    into v_nome from auth.users u where u.id = v_uid;
  v_txt := jsonb_build_object('chapeu', coalesce(p_chapeu, m.gerado->>'chapeu'), 'titulo', btrim(p_titulo),
                              'linha_fina', btrim(coalesce(p_linha_fina, '')), 'paragrafos', p_paragrafos);
  update public.vm_materias set situacao = 'substituida'
   where tipo = m.tipo and data_ref = m.data_ref and situacao = 'publicada';
  update public.vm_materias
     set situacao = 'publicada', texto_aprovado = v_txt, aprovador_uid = v_uid, aprovador_nome = coalesce(v_nome, 'Editor'),
         aprovado_em = now(), justificativa = nullif(btrim(coalesce(p_justificativa, '')), ''),
         editado = (v_txt->>'titulo' is distinct from m.gerado->>'titulo'
                    or v_txt->>'linha_fina' is distinct from m.gerado->>'linha_fina'
                    or v_txt->'paragrafos' is distinct from m.gerado->'paragrafos'
                    or v_txt->>'chapeu' is distinct from m.gerado->>'chapeu')
   where id = p_id;
  return jsonb_build_object('id', p_id, 'situacao', 'publicada', 'aprovador', coalesce(v_nome, 'Editor'));
end $$;

create or replace function public.vm_materia_descartar(p_id bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'MOTIVO_OBRIGATORIO' using errcode = '22023'; end if;
  update public.vm_materias set situacao = 'descartada', motivo_descarte = btrim(p_motivo)
   where id = p_id and situacao = 'rascunho';
  if not found then raise exception 'SITUACAO_INVALIDA' using errcode = '22023'; end if;
  return jsonb_build_object('id', p_id, 'situacao', 'descartada');
end $$;

-- chama a Edge Function scanner-do-dia pelo pg_net (endereço e senha no Vault)
create or replace function public._vm_chamar_scanner(p_corpo jsonb) returns bigint
language plpgsql security definer set search_path to '' as $$
declare v_id bigint;
begin
  execute $q$ select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'vm_scanner_url'),
      headers := jsonb_build_object('Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_token')),
      body := $1, timeout_milliseconds := 150000) $q$ into v_id using p_corpo;
  return v_id;
end $$;
revoke all on function public._vm_chamar_scanner(jsonb) from public, anon, authenticated;

create or replace function public.vm_materia_regerar(p_id bigint, p_instrucao text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare m public.vm_materias;
begin
  perform public._vm_exige_editor();
  if coalesce(btrim(p_instrucao), '') = '' then raise exception 'INSTRUCAO_OBRIGATORIA' using errcode = '22023'; end if;
  select * into m from public.vm_materias where id = p_id for update;
  if not found or m.situacao <> 'rascunho' then raise exception 'SITUACAO_INVALIDA' using errcode = '22023'; end if;
  update public.vm_materias set situacao = 'devolvida', instrucao_extra = btrim(p_instrucao) where id = p_id;
  return jsonb_build_object('id', p_id, 'situacao', 'devolvida',
    'pedido', public._vm_chamar_scanner(jsonb_build_object('devolvida', p_id, 'instrucao', btrim(p_instrucao))));
end $$;

create or replace function public.vm_scanner_gerar()
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  return jsonb_build_object('pedido', public._vm_chamar_scanner('{}'::jsonb));
end $$;

revoke all on function public.vm_materias_fila() from public, anon;
revoke all on function public.vm_materia_aprovar(bigint, text, text, jsonb, text, text) from public, anon;
revoke all on function public.vm_materia_descartar(bigint, text) from public, anon;
revoke all on function public.vm_materia_regerar(bigint, text) from public, anon;
revoke all on function public.vm_scanner_gerar() from public, anon;
grant execute on function public.vm_materias_fila() to authenticated;
grant execute on function public.vm_materia_aprovar(bigint, text, text, jsonb, text, text) to authenticated;
grant execute on function public.vm_materia_descartar(bigint, text) to authenticated;
grant execute on function public.vm_materia_regerar(bigint, text) to authenticated;
grant execute on function public.vm_scanner_gerar() to authenticated;

-- 7. Leitura pública: só o texto APROVADO, com fontes e o nome de quem aprovou (Prompt 17) ------------------
create or replace function public.vm_scanner_publico()
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce((
    select jsonb_build_object('id', m.id, 'data', m.data_ref, 'texto', m.texto_aprovado, 'fontes', m.fontes,
                              'gerado_por_ia', m.gerado_por_ia, 'aprovador', m.aprovador_nome, 'aprovado_em', m.aprovado_em,
                              'criado_em', m.criado_em, 'prompt_versao', m.prompt_versao)
      from public.vm_materias m
     where m.tipo = 'scanner' and m.situacao = 'publicada'
       and m.data_ref >= (now() at time zone 'America/Sao_Paulo')::date - 7
     order by m.data_ref desc, m.aprovado_em desc limit 1), '{}'::jsonb);
$$;
revoke all on function public.vm_scanner_publico() from public;
grant execute on function public.vm_scanner_publico() to anon, authenticated;

-- 8. Agenda (pg_cron, UTC): radar a cada 30 min das 6h às 20h30 de Brasília; Scanner às 6h45, dias úteis -----
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('vm-radar-fontes', 'vm-scanner-do-dia');
    perform cron.schedule('vm-radar-fontes', '*/30 9-23 * * *', $job$
      select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'vm_radar_url'),
        headers := jsonb_build_object('Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_token')),
        body := '{}'::jsonb, timeout_milliseconds := 120000);
    $job$);
    perform cron.schedule('vm-scanner-do-dia', '45 9 * * 1-5', $job$ select public._vm_chamar_scanner('{}'::jsonb); $job$);
    raise notice 'Agendas criadas: vm-radar-fontes (a cada 30 min, 6h–20h30 BRT) e vm-scanner-do-dia (6h45 BRT, dias úteis).';
  else
    raise notice 'ATENÇÃO: pg_cron e pg_net precisam estar ligados; rode este arquivo de novo depois de ligá-los.';
  end if;
end $$;

-- conferência: esperado 1 linha "4 tabelas | rls em todas | 9 funções | url_coleta da Agência Brasil preenchida"
select (select count(*) from pg_class where oid in ('public.vm_achados'::regclass, 'public.vm_coletas'::regclass,
                                                     'public.vm_materias'::regclass, 'public.fontes_noticia'::regclass)) as tabelas,
       (select bool_and(relrowsecurity) from pg_class where oid in ('public.vm_achados'::regclass, 'public.vm_coletas'::regclass,
                                                                    'public.vm_materias'::regclass)) as rls_em_todas,
       (select count(*) from pg_proc where proname in ('vm_eh_editor', '_vm_exige_editor', 'vm_materias_fila', 'vm_materia_aprovar',
               'vm_materia_descartar', '_vm_chamar_scanner', 'vm_materia_regerar', 'vm_scanner_gerar', 'vm_scanner_publico')) as funcoes,
       (select url_coleta from public.fontes_noticia where url = 'https://agenciabrasil.ebc.com.br/rss') as feed_agencia_brasil;
