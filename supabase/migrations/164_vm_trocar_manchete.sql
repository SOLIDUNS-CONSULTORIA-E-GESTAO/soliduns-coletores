-- SQL 164 — SOLIDUNS / Valor e Mercado — TROCAR A MANCHETE (19/10/2026)
--
-- Pedido do Thiago (19/10 01h18): "quero poder mudar a posição dos textos já publicados (manchete virar artigo, artigo substituir
-- a manchete que o agente já fez). Agora acabei de escrever esse artigo e queria que ele virasse manchete: #/noticias/artigo/1".
--
-- Como funciona (só no banco: vale na hora, sem deploy):
--   * select public.vm_capa_trocar(1);   -> o artigo 1 (já publicado) vira a MANCHETE de hoje (dia de Brasília).
--       A manchete do robô que estava na capa desce para a lista de ARTIGOS (cópia publicada, com o mesmo texto e foto).
--       Se a manchete do robô de hoje ainda não tinha saído (ex.: 04h50 ou 07h15), quando sair ela já entra como artigo.
--   * select public.vm_capa_desfazer();  -> volta a manchete do robô; o artigo volta para a lista; a cópia sai do ar.
--   * No dia seguinte a capa volta sozinha para a manchete nova do robô (a troca vale para o dia em que foi feita).
--   * O artigo escolhido não aparece repetido na lista de artigos enquanto estiver na manchete.
-- Quem pode: administrador-mestre e editor do jornal (ou o SQL Editor do Supabase). Na v150 entra o botão na Redação.
--
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): tabela | funcoes | capa_hoje
--                               true   | 4       | (vazio)

-- ------------------------------------------------------------ 1. tabelas
create table if not exists public.vm_capa_escolha (
  data       date primary key,                       -- dia de Brasília em que o artigo é a manchete
  artigo_id  bigint not null references public.vm_artigos(id),
  escolhido_em timestamptz not null default now(),
  escolhido_por text
);
create table if not exists public.vm_capa_copias (    -- manchete do robô que virou artigo (uma por edição)
  edicao_data date primary key,
  artigo_id   bigint not null references public.vm_artigos(id),
  criado_em   timestamptz not null default now()
);
alter table public.vm_capa_escolha enable row level security;
alter table public.vm_capa_copias enable row level security;
drop policy if exists vm_capa_escolha_bloqueio on public.vm_capa_escolha;
create policy vm_capa_escolha_bloqueio on public.vm_capa_escolha as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists vm_capa_copias_bloqueio on public.vm_capa_copias;
create policy vm_capa_copias_bloqueio on public.vm_capa_copias as restrictive for all to anon, authenticated using (false) with check (false);
revoke all on table public.vm_capa_escolha, public.vm_capa_copias from anon, authenticated;

-- ------------------------------------------------------------ 2. utilitários
create or replace function public._vm_hoje() returns date language sql stable set search_path to '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- texto puro de um bloco do corpo do CMS (a formatação fina fica só na página do artigo)
create or replace function public._vm_bloco_texto(b jsonb) returns text language sql immutable set search_path to '' as $$
  select btrim(regexp_replace(coalesce(nullif(b->>'texto', ''),
           (select string_agg(t #>> '{}', '') from jsonb_path_query(coalesce(b->'conteudo', '[]'::jsonb), 'strict $.**.texto') t), ''),
         '\s+', ' ', 'g'))
$$;

-- artigo do CMS no formato da manchete da capa
create or replace function public._vm_artigo_como_manchete(a public.vm_artigos) returns jsonb
language sql stable set search_path to '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'cartola', a.chapeu, 'titulo', a.titulo, 'linha_fina', a.linha_fina, 'artigo_id', a.id, 'autor', a.autor,
    'corpo', coalesce((
      select jsonb_agg(x.t order by x.n, x.m) from (
        select n, 0::bigint as m, case when b->>'tipo' = 'intertitulo' then '## ' || public._vm_bloco_texto(b) else public._vm_bloco_texto(b) end as t
          from jsonb_array_elements(a.corpo) with ordinality as c(b, n)
         where b->>'tipo' in ('paragrafo', 'intertitulo', 'citacao')
        union all                                                     -- lista: cada item vira um parágrafo
        select n, m, '• ' || public._vm_bloco_texto(i)
          from jsonb_array_elements(a.corpo) with ordinality as c(b, n), jsonb_array_elements(b->'itens') with ordinality as it(i, m)
         where b->>'tipo' = 'lista') x
       where coalesce(x.t, '') not in ('', '## ', '• ')), '[]'::jsonb),
    'foto', case when coalesce(a.foto->>'src', '') like 'https://%' then jsonb_strip_nulls(jsonb_build_object(
              'src', a.foto->>'src', 'alt', a.foto->>'alt', 'fotografo', nullif(btrim(a.foto->>'fotografo'), ''),
              'fotografo_url', a.foto->>'fotografo_url', 'pagina_url', a.foto->>'pagina_url',
              'fonte', case when coalesce(a.foto->>'origem', 'Foto própria') = 'Foto própria' then 'Valor e Mercado' else a.foto->>'origem' end)) end))
$$;

-- manchete do robô copiada como artigo publicado (uma vez por edição)
create or replace function public._vm_manchete_para_artigo(p_data date) returns bigint
language plpgsql security definer set search_path to '' as $$
declare e public.vm_edicoes%rowtype; m jsonb; f jsonb; v_id bigint; corpo jsonb; foto jsonb; fontes jsonb;
begin
  select artigo_id into v_id from public.vm_capa_copias where edicao_data = p_data;
  if found then
    update public.vm_artigos set situacao = 'publicado', despublicado_motivo = null, atualizado_em = now()
     where id = v_id and situacao = 'despublicado';
    return v_id;
  end if;
  select * into e from public.vm_edicoes where data = p_data and publicado;
  if not found then return null; end if;
  m := e.conteudo->'manchete';
  if m is null or coalesce(m->>'titulo', '') = '' then return null; end if;
  corpo := coalesce((select jsonb_agg(case when p #>> '{}' like '## %'
                                           then jsonb_build_object('tipo', 'intertitulo', 'conteudo', jsonb_build_array(jsonb_build_object('texto', btrim(substr(p #>> '{}', 4)))))
                                           else jsonb_build_object('tipo', 'paragrafo', 'conteudo', jsonb_build_array(jsonb_build_object('texto', p #>> '{}'))) end
                                      order by n)
                       from jsonb_array_elements(coalesce(m->'corpo', '[]'::jsonb)) with ordinality as c(p, n)
                      where jsonb_typeof(p) = 'string' and btrim(p #>> '{}') <> ''), '[]'::jsonb);
  f := m->'foto';
  foto := case when coalesce(f->>'src', '') like 'https://%' and length(coalesce(btrim(f->>'alt'), '')) >= 3 then jsonb_strip_nulls(jsonb_build_object(
            'src', f->>'src', 'alt', left(f->>'alt', 300), 'fotografo', left(f->>'fotografo', 80),
            'fotografo_url', case when coalesce(f->>'fotografo_url', '') like 'https://%' then f->>'fotografo_url' end,
            'pagina_url', case when coalesce(f->>'pagina_url', '') like 'https://%' then f->>'pagina_url' end,
            'origem', case when coalesce(f->>'fonte', '') ilike 'unsplash%' then 'Unsplash'
                           when coalesce(f->>'fonte', '') = '' or f->>'fonte' ilike '%banco%' then 'Foto própria'
                           else 'Outra, com autorização' end)) end;
  fontes := coalesce((select jsonb_agg(jsonb_build_object('titulo', left(coalesce(x->>'titulo', x->>'nome', x->>'url'), 200), 'url', x->>'url'))
                        from (select x from jsonb_array_elements(case when jsonb_typeof(e.fontes) = 'array' then e.fontes else '[]'::jsonb end) x
                               where coalesce(x->>'url', '') like 'https://%' limit 30) s), '[]'::jsonb);
  insert into public.vm_artigos (tipo, situacao, chapeu, titulo, linha_fina, autor, editoria, lugar, corpo, foto, fontes, publicado_em)
  values ('reportagem', 'publicado', left(nullif(btrim(m->>'cartola'), ''), 60), left(m->>'titulo', 90), left(m->>'linha_fina', 260),
          'Redação Valor e Mercado', 'Economia', 'artigos', corpo, foto, fontes, now())
  returning id into v_id;
  insert into public.vm_capa_copias (edicao_data, artigo_id) values (p_data, v_id);
  return v_id;
end $$;
revoke all on function public._vm_manchete_para_artigo(date) from public, anon, authenticated;

create or replace function public._vm_pode_editar() returns boolean language plpgsql stable security definer set search_path to '' as $$
begin
  return session_user in ('postgres', 'supabase_admin') or public.vm_eh_editor();
end $$;
revoke all on function public._vm_pode_editar() from public, anon;

-- ------------------------------------------------------------ 3. trocar e desfazer
create or replace function public.vm_capa_trocar(p_artigo bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare a public.vm_artigos%rowtype; v_hoje date := public._vm_hoje(); v_ed date; v_copia bigint;
begin
  if not public._vm_pode_editar() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into a from public.vm_artigos where id = p_artigo;
  if not found then raise exception 'Artigo % não existe.', p_artigo; end if;
  if a.situacao <> 'publicado' then raise exception 'O artigo % não está publicado (situação: %). Publique antes.', p_artigo, a.situacao; end if;
  if exists (select 1 from public.vm_capa_copias where artigo_id = p_artigo) then
    raise exception 'O artigo % é a cópia de uma manchete do robô; para trazê-la de volta use vm_capa_desfazer().', p_artigo;
  end if;
  insert into public.vm_capa_escolha (data, artigo_id, escolhido_por)
  values (v_hoje, p_artigo, coalesce(auth.jwt() ->> 'email', session_user))
  on conflict (data) do update set artigo_id = excluded.artigo_id, escolhido_em = now(), escolhido_por = excluded.escolhido_por;
  update public.vm_artigos set lugar = 'manchete', atualizado_em = now() where id = p_artigo and lugar <> 'manchete';
  -- a manchete do robô que está na capa agora desce para a lista de artigos
  select max(data) into v_ed from public.vm_edicoes where publicado and data >= v_hoje - 7;
  if v_ed is not null then v_copia := public._vm_manchete_para_artigo(v_ed); end if;
  return jsonb_build_object('manchete_de_hoje', p_artigo, 'titulo', a.titulo, 'manchete_do_robo_virou_artigo', v_copia);
end $$;

create or replace function public.vm_capa_desfazer() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_hoje date := public._vm_hoje(); v_art bigint; n int;
begin
  if not public._vm_pode_editar() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  delete from public.vm_capa_escolha where data = v_hoje returning artigo_id into v_art;
  if v_art is null then return jsonb_build_object('desfeito', false, 'motivo', 'Hoje a capa já é a manchete do robô.'); end if;
  update public.vm_artigos set lugar = 'artigos', atualizado_em = now() where id = v_art;
  update public.vm_artigos a set situacao = 'despublicado', despublicado_motivo = 'Manchete do robô voltou para a capa.', atualizado_em = now()
    from public.vm_capa_copias c
   where c.artigo_id = a.id and c.edicao_data >= v_hoje - 7 and a.situacao = 'publicado';
  get diagnostics n = row_count;
  return jsonb_build_object('desfeito', true, 'artigo_voltou_para_a_lista', v_art, 'copias_tiradas_do_ar', n);
end $$;

revoke all on function public.vm_capa_trocar(bigint), public.vm_capa_desfazer() from public, anon;
grant execute on function public.vm_capa_trocar(bigint), public.vm_capa_desfazer() to authenticated;

-- manchete do robô que for publicada num dia com troca já feita entra direto como artigo
create or replace function public._vm_edicao_publicada() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.publicado and (tg_op = 'INSERT' or not coalesce(old.publicado, false))
     and exists (select 1 from public.vm_capa_escolha where data = public._vm_hoje()) then
    perform public._vm_manchete_para_artigo(new.data);
  end if;
  return new;
end $$;
drop trigger if exists vm_edicoes_capa_troca on public.vm_edicoes;
create trigger vm_edicoes_capa_troca after insert or update of publicado on public.vm_edicoes
  for each row execute function public._vm_edicao_publicada();

-- ------------------------------------------------------------ 4. leitura pública (capa e lista de artigos)
create or replace function public.vm_edicao_publica()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r jsonb; a public.vm_artigos%rowtype;
begin
  r := coalesce((
    select jsonb_build_object('data', e.data, 'gerado_em', e.gerado_em, 'conteudo', e.conteudo, 'fontes', e.fontes)
      from public.vm_edicoes e
     where e.publicado and e.data >= public._vm_hoje() - 7
     order by e.data desc limit 1), '{}'::jsonb);
  select x.* into a from public.vm_capa_escolha c join public.vm_artigos x on x.id = c.artigo_id
   where c.data = public._vm_hoje() and x.situacao = 'publicado';
  if found then
    r := jsonb_set(case when r = '{}'::jsonb then jsonb_build_object('data', public._vm_hoje(), 'gerado_em', a.publicado_em, 'conteudo', '{}'::jsonb) else r end,
                   '{conteudo,manchete}', public._vm_artigo_como_manchete(a), true);
    r := jsonb_set(r, '{fontes}', coalesce(a.fontes, '[]'::jsonb), true);
  end if;
  return r;
end $$;
revoke all on function public.vm_edicao_publica() from public;
grant execute on function public.vm_edicao_publica() to anon, authenticated;

create or replace function public.vm_artigos_publicos(p_limite int default 20)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'chapeu', a.chapeu, 'titulo', a.titulo, 'linha_fina', a.linha_fina,
           'autor', a.autor, 'editoria', a.editoria, 'lugar', a.lugar, 'foto', a.foto, 'publicado_em', a.publicado_em) order by a.publicado_em desc), '[]'::jsonb)
    from (select * from public.vm_artigos x
           where x.situacao = 'publicado'
             and x.id is distinct from (select c.artigo_id from public.vm_capa_escolha c where c.data = public._vm_hoje())
           order by x.publicado_em desc limit least(greatest(coalesce(p_limite, 20), 1), 100)) a
$$;
revoke all on function public.vm_artigos_publicos(int) from public;
grant execute on function public.vm_artigos_publicos(int) to anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------ conferência
select to_regclass('public.vm_capa_escolha') is not null and to_regclass('public.vm_capa_copias') is not null as tabela,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
         and proname in ('vm_capa_trocar', 'vm_capa_desfazer', 'vm_edicao_publica', 'vm_artigos_publicos')) as funcoes,
       (select artigo_id from public.vm_capa_escolha where data = public._vm_hoje()) as capa_hoje;
