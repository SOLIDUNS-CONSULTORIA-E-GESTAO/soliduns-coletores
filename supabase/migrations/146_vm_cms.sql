-- 146_vm_cms.sql — Valor e Mercado: CMS da Redação (artigos do editor, layout da capa, mídia, banners e auditoria)
-- Pedido do Thiago (16/10/2026): escrever e publicar artigos sem acionar o Claude; visual aprovado em 16/10 07h55
-- (claude/cms_valor_e_mercado_previa.html). Projeto: claude/PROMPT_CMS_VALOR_E_MERCADO_v2.md (v2.1).
--
-- SEGURANÇA (a barreira real é o banco, não a tela):
--   * todas as tabelas com RLS ligado e SEM permissão direta para anon/authenticated (revoke all);
--   * toda escrita só por RPC security definer que começa com public._vm_exige_editor() (erro 42501 para não-editor);
--   * o corpo do artigo é uma árvore JSON validada por esquema fechado (vm_corpo_valido): blocos e marcas de uma lista,
--     links só https, fontes e tamanhos só dos valores fixos, sem campo extra — HTML nunca é guardado;
--   * leitura pública só por RPC que devolve apenas o que está publicado;
--   * imagens no bucket vm-imagens: escrita só de editor, JPG/PNG/WEBP, até 5 MB; leitura pública;
--   * cada criação/alteração/publicação vira um evento em vm_eventos_redacao (quem, quando, antes e depois).
-- Nenhuma chave neste arquivo. Rodar DEPOIS da 138 (vm_eh_editor / _vm_exige_editor).

-- ============================================================ 1. VALIDADORES (esquema fechado)
create or replace function public.vm_https(p text) returns boolean
language sql immutable set search_path to '' as $$
  select p is not null and length(p) <= 2000 and p ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^\s<>"''`]*)?$'
$$;

-- nós do conteúdo: {"texto": "..."} ou {"marca": "...", "conteudo": [...], "url"?: https, "valor"?: fixo}
create or replace function public.vm_conteudo_valido(p jsonb, p_nivel int default 0) returns boolean
language plpgsql immutable set search_path to '' as $$
declare n jsonb; k text;
begin
  if p is null or jsonb_typeof(p) <> 'array' or p_nivel > 12 or jsonb_array_length(p) > 400 then return false; end if;
  for n in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(n) <> 'object' then return false; end if;
    if n ? 'texto' then
      for k in select jsonb_object_keys(n) loop if k <> 'texto' then return false; end if; end loop;
      if jsonb_typeof(n->'texto') <> 'string' or length(n->>'texto') > 20000 then return false; end if;
    else
      for k in select jsonb_object_keys(n) loop if k not in ('marca', 'conteudo', 'url', 'valor') then return false; end if; end loop;
      if coalesce(n->>'marca', '') not in ('negrito', 'italico', 'sublinhado', 'riscado', 'marcador', 'menor', 'sobrescrito',
                                           'subscrito', 'codigo', 'link', 'fonte', 'tamanho', 'grupo') then return false; end if;
      if (n->>'marca') = 'link' and not public.vm_https(n->>'url') then return false; end if;
      if (n->>'marca') <> 'link' and n ? 'url' then return false; end if;
      if (n->>'marca') = 'fonte' and coalesce(n->>'valor', '') not in ('newsreader', 'georgia', 'jost', 'plex', 'mono') then return false; end if;
      if (n->>'marca') = 'tamanho' and coalesce(n->>'valor', '') not in ('p', 'g', 'gg') then return false; end if;
      if (n->>'marca') not in ('fonte', 'tamanho') and n ? 'valor' then return false; end if;
      if not public.vm_conteudo_valido(n->'conteudo', p_nivel + 1) then return false; end if;
    end if;
  end loop;
  return true;
end $$;

-- corpo: lista de blocos {tipo: paragrafo|intertitulo|citacao|imagem, ...}
create or replace function public.vm_corpo_valido(p jsonb) returns boolean
language plpgsql immutable set search_path to '' as $$
declare b jsonb; k text;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 300 or pg_column_size(p) > 400000 then return false; end if;
  for b in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(b) <> 'object' then return false; end if;
    if (b->>'tipo') = 'imagem' then
      for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'src', 'alt', 'legenda') then return false; end if; end loop;
      if b ? 'src' and not public.vm_https(b->>'src') then return false; end if;
      if length(coalesce(b->>'legenda', '')) > 200 or length(coalesce(b->>'alt', '')) > 300 then return false; end if;
    elsif (b->>'tipo') in ('paragrafo', 'intertitulo', 'citacao') then
      for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'texto', 'conteudo') then return false; end if; end loop;
      if not public.vm_conteudo_valido(b->'conteudo') then return false; end if;
      if b ? 'texto' and (jsonb_typeof(b->'texto') <> 'string' or length(b->>'texto') > 20000) then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
end $$;

create or replace function public.vm_foto_valida(p jsonb) returns boolean
language plpgsql immutable set search_path to '' as $$
declare k text;
begin
  if p is null or p = 'null'::jsonb then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop if k not in ('src', 'alt', 'fotografo', 'fotografo_url', 'origem', 'pagina_url', 'midia_id') then return false; end if; end loop;
  return public.vm_https(p->>'src') and length(coalesce(btrim(p->>'alt'), '')) between 3 and 300
     and length(coalesce(p->>'fotografo', '')) <= 80 and coalesce(p->>'origem', 'Foto própria') in ('Foto própria', 'Unsplash', 'Outra, com autorização')
     and (not p ? 'fotografo_url' or public.vm_https(p->>'fotografo_url')) and (not p ? 'pagina_url' or public.vm_https(p->>'pagina_url'));
end $$;

create or replace function public.vm_fontes_validas(p jsonb) returns boolean
language plpgsql immutable set search_path to '' as $$
declare f jsonb; k text;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 30 then return false; end if;
  for f in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(f) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(f) loop if k not in ('titulo', 'url') then return false; end if; end loop;
    if not public.vm_https(f->>'url') or length(coalesce(f->>'titulo', '')) > 200 then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.vm_layout_valido(p jsonb) returns boolean
language plpgsql immutable set search_path to '' as $$
declare b jsonb; k text; vistos text[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p->'blocos') <> 'array' or jsonb_array_length(p->'blocos') > 20 then return false; end if;
  for k in select jsonb_object_keys(p) loop if k not in ('versao', 'blocos') then return false; end if; end loop;
  for b in select * from jsonb_array_elements(p->'blocos') loop
    if jsonb_typeof(b) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'ativo', 'destaques') then return false; end if; end loop;
    if coalesce(b->>'tipo', '') not in ('manchete', 'scanner', 'indicadores', 'artigos', 'ultimas', 'agenda', 'radar') then return false; end if;
    if (b->>'tipo') = any(vistos) then return false; end if;          -- cada bloco uma vez só
    vistos := vistos || (b->>'tipo');
    if jsonb_typeof(b->'ativo') <> 'boolean' then return false; end if;
    if b ? 'destaques' and (jsonb_typeof(b->'destaques') <> 'array' or jsonb_array_length(b->'destaques') > 3
        or exists (select 1 from jsonb_array_elements(b->'destaques') d where jsonb_typeof(d) <> 'number')) then return false; end if;
  end loop;
  return true;
end $$;

-- ============================================================ 2. TABELAS
create table if not exists public.vm_artigos (
  id            bigint generated always as identity primary key,
  tipo          text not null default 'reportagem' check (tipo in ('reportagem', 'opiniao', 'nota')),
  situacao      text not null default 'rascunho' check (situacao in ('rascunho', 'revisao', 'agendado', 'publicado', 'despublicado')),
  chapeu        text check (length(chapeu) <= 60),
  titulo        text not null check (length(btrim(titulo)) between 1 and 90),
  linha_fina    text check (length(linha_fina) <= 260),
  autor         text not null default 'Dr. Thiago Viegas' check (length(btrim(autor)) between 2 and 60),
  editoria      text not null default 'Mercados' check (editoria in ('Mercados', 'Economia', 'Empresas', 'Política Econômica', 'Internacional', 'Investimentos', 'Opinião')),
  lugar         text not null default 'artigos' check (lugar in ('artigos', 'manchete', 'lista')),
  corpo         jsonb not null default '[]'::jsonb check (public.vm_corpo_valido(corpo)),
  foto          jsonb check (public.vm_foto_valida(foto)),
  fontes        jsonb not null default '[]'::jsonb check (public.vm_fontes_validas(fontes)),
  tags          text[] not null default '{}' check (cardinality(tags) <= 8),
  correcoes     jsonb not null default '[]'::jsonb check (jsonb_typeof(correcoes) = 'array'),
  publicar_em   timestamptz,
  publicado_em  timestamptz,
  despublicado_motivo text check (length(despublicado_motivo) <= 500),
  versao        int not null default 1,
  criado_por    uuid, criado_em timestamptz not null default now(),
  atualizado_por uuid, atualizado_em timestamptz not null default now()
);
create index if not exists vm_artigos_pub_idx on public.vm_artigos (situacao, publicado_em desc);

create table if not exists public.vm_artigos_versoes (
  id bigint generated always as identity primary key,
  artigo_id bigint not null references public.vm_artigos(id) on delete cascade,
  versao int not null, dados jsonb not null, motivo text, criado_por uuid, criado_em timestamptz not null default now(),
  unique (artigo_id, versao)
);

create table if not exists public.vm_layout_capa (
  id bigint generated always as identity primary key,
  versao int not null unique, layout jsonb not null check (public.vm_layout_valido(layout)),
  ativo boolean not null default false, criado_por uuid, criado_em timestamptz not null default now()
);
create unique index if not exists vm_layout_capa_um_ativo on public.vm_layout_capa (ativo) where ativo;

create table if not exists public.vm_midias (
  id bigint generated always as identity primary key,
  caminho text not null unique check (caminho ~ '^[0-9]{4}/[0-9]{2}/[a-f0-9]{16,64}\.(jpg|png|webp)$'),
  url text not null check (public.vm_https(url)),
  tipo text not null check (tipo in ('image/jpeg', 'image/png', 'image/webp')),
  bytes int not null check (bytes between 1 and 5242880),
  largura int check (largura between 1 and 6000), altura int check (altura between 1 and 6000),
  alt text check (length(alt) <= 300), fotografo text check (length(fotografo) <= 80),
  origem text check (origem in ('Foto própria', 'Unsplash', 'Outra, com autorização')),
  criado_por uuid, criado_em timestamptz not null default now()
);

create table if not exists public.vm_banners (
  id bigint generated always as identity primary key,
  imagem_url text not null check (public.vm_https(imagem_url)),
  link text not null check (public.vm_https(link)),
  alt text not null check (length(btrim(alt)) between 3 and 200),
  inicio date not null, fim date not null check (fim >= inicio),
  ativo boolean not null default true, criado_por uuid, criado_em timestamptz not null default now()
);

create table if not exists public.vm_eventos_redacao (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(), quem uuid, quem_nome text,
  acao text not null, item_tipo text not null, item_id bigint,
  antes jsonb, depois jsonb, motivo text
);
create index if not exists vm_eventos_redacao_quando on public.vm_eventos_redacao (quando desc);

-- RLS ligado, sem nenhuma permissão direta (escrita e leitura só pelas funções abaixo)
do $$ declare t text;
begin
  foreach t in array array['vm_artigos', 'vm_artigos_versoes', 'vm_layout_capa', 'vm_midias', 'vm_banners', 'vm_eventos_redacao'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end $$;
-- política explícita "ninguém lê nem grava direto" (documenta a intenção; o service_role e as funções security definer passam)
do $$ declare t text;
begin
  foreach t in array array['vm_artigos', 'vm_artigos_versoes', 'vm_layout_capa', 'vm_midias', 'vm_banners', 'vm_eventos_redacao'] loop
    execute format('drop policy if exists %I on public.%I', t || '_bloqueio', t);
    execute format('create policy %I on public.%I as restrictive for all to anon, authenticated using (false) with check (false)', t || '_bloqueio', t);
  end loop;
end $$;

-- ============================================================ 3. AUDITORIA (gatilho)
create or replace function public._vm_nome_usuario() returns text
language sql stable security definer set search_path to '' as $$
  select coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'nome', ''), u.email, 'sistema')
    from auth.users u where u.id = auth.uid()
$$;
revoke all on function public._vm_nome_usuario() from public, anon, authenticated;

create or replace function public._vm_auditar() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_acao text := case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'editou' else 'excluiu' end; n jsonb; o jsonb;
begin
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_table_name = 'vm_artigos' and tg_op = 'UPDATE' and (n->>'situacao') is distinct from (o->>'situacao') then
    v_acao := case n->>'situacao' when 'publicado' then 'publicou' when 'agendado' then 'agendou' when 'despublicado' then 'tirou do ar'
                                  when 'revisao' then 'enviou para revisão' else 'voltou para rascunho' end;
  elsif tg_table_name = 'vm_artigos' and tg_op = 'UPDATE' and (n->>'versao') is distinct from (o->>'versao') then v_acao := 'corrigiu';
  elsif tg_table_name = 'vm_layout_capa' and tg_op = 'UPDATE' and (n->>'ativo') = 'true' and (o->>'ativo') = 'false' then v_acao := 'aplicou o layout';
  end if;
  insert into public.vm_eventos_redacao (quem, quem_nome, acao, item_tipo, item_id, antes, depois, motivo)
  values (auth.uid(), coalesce(public._vm_nome_usuario(), 'sistema'), v_acao, tg_table_name,
          coalesce((n->>'id')::bigint, (o->>'id')::bigint), o, n,
          case when tg_table_name = 'vm_artigos' then n->>'despublicado_motivo' end);
  return coalesce(new, old);
end $$;
revoke all on function public._vm_auditar() from public, anon, authenticated;
do $$ declare t text;
begin
  foreach t in array array['vm_artigos', 'vm_layout_capa', 'vm_midias', 'vm_banners'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_auditoria', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public._vm_auditar()', t || '_auditoria', t);
  end loop;
end $$;

-- ============================================================ 4. RPCs DA REDAÇÃO (só editor)
-- salvar rascunho (novo ou existente). Artigo publicado não se altera por aqui: usar vm_artigo_corrigir.
create or replace function public.vm_artigo_salvar(p_id bigint, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare a public.vm_artigos; v_id bigint; v_tags text[];
begin
  perform public._vm_exige_editor();
  if jsonb_typeof(p_dados) <> 'object' then raise exception 'DADOS_INVALIDOS' using errcode = '22023'; end if;
  if not public.vm_corpo_valido(coalesce(p_dados->'corpo', '[]'::jsonb)) then raise exception 'CORPO_INVALIDO' using errcode = '22023'; end if;
  select coalesce(array_agg(left(btrim(t), 30)), '{}') into v_tags from jsonb_array_elements_text(coalesce(p_dados->'tags', '[]'::jsonb)) t where btrim(t) <> '';
  if p_id is null then
    insert into public.vm_artigos (tipo, chapeu, titulo, linha_fina, autor, editoria, lugar, corpo, foto, fontes, tags, criado_por, atualizado_por)
    values (coalesce(p_dados->>'tipo', 'reportagem'), nullif(btrim(p_dados->>'chapeu'), ''), btrim(coalesce(p_dados->>'titulo', '')),
            nullif(btrim(p_dados->>'linha_fina'), ''), coalesce(nullif(btrim(p_dados->>'autor'), ''), 'Dr. Thiago Viegas'),
            coalesce(p_dados->>'editoria', 'Mercados'), coalesce(p_dados->>'lugar', 'artigos'), coalesce(p_dados->'corpo', '[]'::jsonb),
            nullif(p_dados->'foto', 'null'::jsonb), coalesce(p_dados->'fontes', '[]'::jsonb), v_tags, auth.uid(), auth.uid())
    returning id into v_id;
  else
    select * into a from public.vm_artigos where id = p_id for update;
    if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'P0002'; end if;
    if a.situacao in ('publicado', 'despublicado') then raise exception 'USE_CORRIGIR' using errcode = '22023'; end if;
    update public.vm_artigos set
      tipo = coalesce(p_dados->>'tipo', tipo), chapeu = nullif(btrim(p_dados->>'chapeu'), ''), titulo = btrim(coalesce(p_dados->>'titulo', titulo)),
      linha_fina = nullif(btrim(p_dados->>'linha_fina'), ''), autor = coalesce(nullif(btrim(p_dados->>'autor'), ''), autor),
      editoria = coalesce(p_dados->>'editoria', editoria), lugar = coalesce(p_dados->>'lugar', lugar),
      corpo = coalesce(p_dados->'corpo', corpo), foto = nullif(p_dados->'foto', 'null'::jsonb), fontes = coalesce(p_dados->'fontes', fontes),
      tags = v_tags, atualizado_por = auth.uid(), atualizado_em = now()
    where id = p_id;
    v_id := p_id;
  end if;
  return jsonb_build_object('id', v_id, 'salvo_em', now());
end $$;

-- publicar agora (p_quando nulo ou no passado) ou agendar (p_quando no futuro)
create or replace function public.vm_artigo_publicar(p_id bigint, p_quando timestamptz default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare a public.vm_artigos; v_agora boolean := p_quando is null or p_quando <= now();
begin
  perform public._vm_exige_editor();
  select * into a from public.vm_artigos where id = p_id for update;
  if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'P0002'; end if;
  if a.situacao not in ('rascunho', 'revisao', 'agendado') then raise exception 'SITUACAO_INVALIDA' using errcode = '22023'; end if;
  if jsonb_array_length(a.corpo) = 0 then raise exception 'CORPO_VAZIO' using errcode = '22023'; end if;
  if a.foto is not null and length(coalesce(btrim(a.foto->>'alt'), '')) < 3 then raise exception 'FOTO_SEM_TEXTO_ALTERNATIVO' using errcode = '22023'; end if;
  insert into public.vm_artigos_versoes (artigo_id, versao, dados, motivo, criado_por)
  values (a.id, a.versao, to_jsonb(a), case when v_agora then 'publicação' else 'agendamento' end, auth.uid()) on conflict do nothing;
  update public.vm_artigos set situacao = case when v_agora then 'publicado' else 'agendado' end,
         publicar_em = case when v_agora then null else p_quando end, publicado_em = case when v_agora then now() else null end,
         despublicado_motivo = null, atualizado_por = auth.uid(), atualizado_em = now()
   where id = p_id;
  return jsonb_build_object('id', p_id, 'situacao', case when v_agora then 'publicado' else 'agendado' end, 'quando', coalesce(p_quando, now()));
end $$;

create or replace function public.vm_artigo_despublicar(p_id bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  if length(coalesce(btrim(p_motivo), '')) < 5 then raise exception 'MOTIVO_OBRIGATORIO' using errcode = '22023'; end if;
  update public.vm_artigos set situacao = 'despublicado', despublicado_motivo = left(btrim(p_motivo), 500), atualizado_por = auth.uid(), atualizado_em = now()
   where id = p_id and situacao in ('publicado', 'agendado');
  if not found then raise exception 'SITUACAO_INVALIDA' using errcode = '22023'; end if;
  return jsonb_build_object('id', p_id, 'situacao', 'despublicado');
end $$;

-- correção de artigo publicado (Manual, cap. 9): guarda a versão anterior e registra a nota de correção
create or replace function public.vm_artigo_corrigir(p_id bigint, p_dados jsonb, p_o_que text, p_versao_anterior_informava text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare a public.vm_artigos;
begin
  perform public._vm_exige_editor();
  if length(coalesce(btrim(p_o_que), '')) < 3 or length(coalesce(btrim(p_versao_anterior_informava), '')) < 3 then
    raise exception 'NOTA_DE_CORRECAO_OBRIGATORIA' using errcode = '22023'; end if;
  if not public.vm_corpo_valido(coalesce(p_dados->'corpo', '[]'::jsonb)) then raise exception 'CORPO_INVALIDO' using errcode = '22023'; end if;
  select * into a from public.vm_artigos where id = p_id for update;
  if not found or a.situacao <> 'publicado' then raise exception 'SITUACAO_INVALIDA' using errcode = '22023'; end if;
  insert into public.vm_artigos_versoes (artigo_id, versao, dados, motivo, criado_por) values (a.id, a.versao, to_jsonb(a), 'antes da correção', auth.uid())
    on conflict (artigo_id, versao) do update set dados = excluded.dados, motivo = excluded.motivo, criado_em = now();
  update public.vm_artigos set
    titulo = btrim(coalesce(p_dados->>'titulo', titulo)), linha_fina = coalesce(nullif(btrim(p_dados->>'linha_fina'), ''), linha_fina),
    corpo = coalesce(p_dados->'corpo', corpo), fontes = coalesce(p_dados->'fontes', fontes), versao = versao + 1,
    correcoes = correcoes || jsonb_build_array(jsonb_build_object('quando', now(), 'o_que', left(btrim(p_o_que), 300),
                                                                  'antes', left(btrim(p_versao_anterior_informava), 500))),
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = p_id;
  return jsonb_build_object('id', p_id, 'versao', a.versao + 1);
end $$;

-- lista da Redação (rascunhos, agendados, publicados…) — só editor
create or replace function public.vm_artigos_redacao(p_situacao text default null, p_limite int default 50)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.atualizado_em desc) from (
    select id, tipo, situacao, chapeu, titulo, autor, editoria, lugar, publicar_em, publicado_em, atualizado_em, versao
      from public.vm_artigos where p_situacao is null or situacao = p_situacao
     order by atualizado_em desc limit least(greatest(coalesce(p_limite, 50), 1), 200)) x), '[]'::jsonb);
end $$;

create or replace function public.vm_artigo_editar(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  return (select to_jsonb(a) from public.vm_artigos a where a.id = p_id);
end $$;

-- layout da capa: cada "Aplicar" vira uma versão nova; voltar = reativar uma versão antiga
create or replace function public.vm_layout_salvar(p_layout jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v int;
begin
  perform public._vm_exige_editor();
  if not public.vm_layout_valido(p_layout) then raise exception 'LAYOUT_INVALIDO' using errcode = '22023'; end if;
  select coalesce(max(versao), 0) + 1 into v from public.vm_layout_capa;
  update public.vm_layout_capa set ativo = false where ativo;
  insert into public.vm_layout_capa (versao, layout, ativo, criado_por) values (v, jsonb_set(p_layout, '{versao}', to_jsonb(v)), true, auth.uid());
  delete from public.vm_layout_capa where not ativo and versao <= v - 20;          -- guarda as 20 últimas
  return jsonb_build_object('versao', v);
end $$;

create or replace function public.vm_layout_voltar(p_versao int)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  if not exists (select 1 from public.vm_layout_capa where versao = p_versao) then raise exception 'NAO_ENCONTRADO' using errcode = 'P0002'; end if;
  update public.vm_layout_capa set ativo = false where ativo;
  update public.vm_layout_capa set ativo = true where versao = p_versao;
  return jsonb_build_object('versao', p_versao);
end $$;

create or replace function public.vm_layout_historico()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  return coalesce((select jsonb_agg(jsonb_build_object('versao', l.versao, 'ativo', l.ativo, 'criado_em', l.criado_em, 'layout', l.layout) order by l.versao desc)
                     from public.vm_layout_capa l), '[]'::jsonb);
end $$;

-- mídia: registra a imagem já enviada ao bucket vm-imagens (o caminho é gerado pela tela: AAAA/MM/<hash>.<ext>)
create or replace function public.vm_midia_registrar(p_caminho text, p_tipo text, p_bytes int, p_largura int, p_altura int,
                                                     p_alt text, p_fotografo text, p_origem text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint; v_url text;
begin
  perform public._vm_exige_editor();
  if not exists (select 1 from storage.objects o where o.bucket_id = 'vm-imagens' and o.name = p_caminho) then
    raise exception 'ARQUIVO_NAO_ENVIADO' using errcode = '22023'; end if;
  v_url := 'https://evcsniicnrlrtzpdmeza.supabase.co/storage/v1/object/public/vm-imagens/' || p_caminho;
  insert into public.vm_midias (caminho, url, tipo, bytes, largura, altura, alt, fotografo, origem, criado_por)
  values (p_caminho, v_url, p_tipo, p_bytes, p_largura, p_altura, nullif(btrim(p_alt), ''), nullif(btrim(p_fotografo), ''), p_origem, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'url', v_url);
end $$;

create or replace function public.vm_midias_lista(p_limite int default 60)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  return coalesce((select jsonb_agg(to_jsonb(m) order by m.criado_em desc) from (
    select m.*, (select count(*) from public.vm_artigos a where a.foto->>'src' = m.url or a.corpo::text like '%' || m.url || '%') as usos
      from public.vm_midias m order by m.criado_em desc limit least(greatest(coalesce(p_limite, 60), 1), 300)) m), '[]'::jsonb);
end $$;

create or replace function public.vm_midia_excluir(p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare m public.vm_midias;
begin
  perform public._vm_exige_editor();
  select * into m from public.vm_midias where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'P0002'; end if;
  if exists (select 1 from public.vm_artigos a where a.foto->>'src' = m.url or a.corpo::text like '%' || m.url || '%') then
    raise exception 'IMAGEM_EM_USO' using errcode = '22023'; end if;
  delete from public.vm_midias where id = p_id;
  return jsonb_build_object('id', p_id, 'caminho', m.caminho);      -- a tela apaga o arquivo do bucket em seguida
end $$;

create or replace function public.vm_banner_salvar(p_id bigint, p_imagem_url text, p_link text, p_alt text, p_inicio date, p_fim date, p_ativo boolean default true)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint;
begin
  perform public._vm_exige_editor();
  if p_id is null then
    insert into public.vm_banners (imagem_url, link, alt, inicio, fim, ativo, criado_por) values (p_imagem_url, p_link, btrim(p_alt), p_inicio, p_fim, coalesce(p_ativo, true), auth.uid()) returning id into v_id;
  else
    update public.vm_banners set imagem_url = p_imagem_url, link = p_link, alt = btrim(p_alt), inicio = p_inicio, fim = p_fim, ativo = coalesce(p_ativo, ativo) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'NAO_ENCONTRADO' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.vm_eventos_lista(p_limite int default 100)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  return coalesce((select jsonb_agg(jsonb_build_object('quando', e.quando, 'quem', e.quem_nome, 'acao', e.acao, 'item', e.item_tipo, 'id', e.item_id,
                                                       'titulo', coalesce(e.depois->>'titulo', e.antes->>'titulo'), 'motivo', e.motivo) order by e.quando desc)
                     from (select * from public.vm_eventos_redacao order by quando desc limit least(greatest(coalesce(p_limite, 100), 1), 500)) e), '[]'::jsonb);
end $$;

-- ============================================================ 5. LEITURA PÚBLICA (só o publicado)
create or replace function public.vm_artigos_publicos(p_limite int default 20)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'chapeu', a.chapeu, 'titulo', a.titulo, 'linha_fina', a.linha_fina,
           'autor', a.autor, 'editoria', a.editoria, 'lugar', a.lugar, 'foto', a.foto, 'publicado_em', a.publicado_em) order by a.publicado_em desc), '[]'::jsonb)
    from (select * from public.vm_artigos where situacao = 'publicado' order by publicado_em desc limit least(greatest(coalesce(p_limite, 20), 1), 100)) a
$$;

create or replace function public.vm_artigo_publico(p_id bigint)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', a.id, 'tipo', a.tipo, 'chapeu', a.chapeu, 'titulo', a.titulo, 'linha_fina', a.linha_fina, 'autor', a.autor,
           'editoria', a.editoria, 'corpo', a.corpo, 'foto', a.foto, 'fontes', a.fontes, 'tags', a.tags, 'correcoes', a.correcoes,
           'publicado_em', a.publicado_em, 'atualizado_em', a.atualizado_em)
    from public.vm_artigos a where a.id = p_id and a.situacao = 'publicado'
$$;

create or replace function public.vm_layout_publico()
returns jsonb language sql stable security definer set search_path to '' as $$
  select layout from public.vm_layout_capa where ativo limit 1
$$;

create or replace function public.vm_banners_publicos()
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('imagem_url', b.imagem_url, 'link', b.link, 'alt', b.alt) order by b.inicio), '[]'::jsonb)
    from public.vm_banners b
   where b.ativo and (now() at time zone 'America/Sao_Paulo')::date between b.inicio and b.fim
$$;

-- permissões das funções
do $$ declare f text;
begin
  foreach f in array array[
    'vm_artigo_salvar(bigint,jsonb)', 'vm_artigo_publicar(bigint,timestamptz)', 'vm_artigo_despublicar(bigint,text)',
    'vm_artigo_corrigir(bigint,jsonb,text,text)', 'vm_artigos_redacao(text,int)', 'vm_artigo_editar(bigint)',
    'vm_layout_salvar(jsonb)', 'vm_layout_voltar(int)', 'vm_layout_historico()',
    'vm_midia_registrar(text,text,int,int,int,text,text,text)', 'vm_midias_lista(int)', 'vm_midia_excluir(bigint)',
    'vm_banner_salvar(bigint,text,text,text,date,date,boolean)', 'vm_eventos_lista(int)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['vm_artigos_publicos(int)', 'vm_artigo_publico(bigint)', 'vm_layout_publico()', 'vm_banners_publicos()'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- ============================================================ 6. AGENDADOS (pg_cron a cada 5 minutos)
create or replace function public.vm_publicar_agendados() returns int
language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  update public.vm_artigos set situacao = 'publicado', publicado_em = now(), publicar_em = null
   where situacao = 'agendado' and publicar_em <= now();
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.vm_publicar_agendados() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'vm-publicar-agendados';
    perform cron.schedule('vm-publicar-agendados', '*/5 * * * *', 'select public.vm_publicar_agendados()');
  end if;
end $$;

-- ============================================================ 7. IMAGENS (Storage: bucket vm-imagens)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('vm-imagens', 'vm-imagens', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

    drop policy if exists vm_imagens_editor_envia on storage.objects;
    create policy vm_imagens_editor_envia on storage.objects for insert to authenticated
      with check (bucket_id = 'vm-imagens' and public.vm_eh_editor()
                  and name ~ '^[0-9]{4}/[0-9]{2}/[a-f0-9]{16,64}\.(jpg|png|webp)$');
    drop policy if exists vm_imagens_editor_altera on storage.objects;
    create policy vm_imagens_editor_altera on storage.objects for update to authenticated
      using (bucket_id = 'vm-imagens' and public.vm_eh_editor()) with check (bucket_id = 'vm-imagens' and public.vm_eh_editor());
    drop policy if exists vm_imagens_editor_apaga on storage.objects;
    create policy vm_imagens_editor_apaga on storage.objects for delete to authenticated
      using (bucket_id = 'vm-imagens' and public.vm_eh_editor());
    -- leitura: o bucket é público (endereço /object/public/vm-imagens/...), sem política de listagem
  end if;
end $$;

-- ============================================================ 8. LAYOUT INICIAL (o mesmo da capa de hoje)
insert into public.vm_layout_capa (versao, layout, ativo)
select 1, '{"versao":1,"blocos":[{"tipo":"manchete","ativo":true},{"tipo":"scanner","ativo":true},{"tipo":"indicadores","ativo":true},{"tipo":"artigos","ativo":true,"destaques":[]},{"tipo":"ultimas","ativo":true},{"tipo":"agenda","ativo":true},{"tipo":"radar","ativo":false}]}'::jsonb, true
where not exists (select 1 from public.vm_layout_capa);

-- conferência: esperado 1 linha "6 tabelas | rls em todas | 18 funções | bucket ok | layout v1"
select (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('vm_artigos', 'vm_artigos_versoes', 'vm_layout_capa', 'vm_midias', 'vm_banners', 'vm_eventos_redacao')) || ' tabelas' as tabelas,
       case when (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in ('vm_artigos', 'vm_artigos_versoes', 'vm_layout_capa', 'vm_midias', 'vm_banners', 'vm_eventos_redacao'))
            then 'rls em todas' else 'RLS FALTANDO' end as rls,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('vm_artigo_salvar', 'vm_artigo_publicar', 'vm_artigo_despublicar', 'vm_artigo_corrigir',
          'vm_artigos_redacao', 'vm_artigo_editar', 'vm_layout_salvar', 'vm_layout_voltar', 'vm_layout_historico', 'vm_midia_registrar', 'vm_midias_lista', 'vm_midia_excluir',
          'vm_banner_salvar', 'vm_eventos_lista', 'vm_artigos_publicos', 'vm_artigo_publico', 'vm_layout_publico', 'vm_banners_publicos')) || ' funções' as funcoes,
       case when exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets')
            then (select case when count(*) = 1 then 'bucket ok' else 'BUCKET FALTANDO' end from storage.buckets where id = 'vm-imagens') else 'sem storage' end as bucket,
       'layout v' || (select versao from public.vm_layout_capa where ativo) as layout;
