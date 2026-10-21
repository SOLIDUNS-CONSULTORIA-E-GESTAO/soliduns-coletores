-- SQL 178 — SOLIDUNS / Valor e Mercado — REDAÇÃO: RASCUNHO SALVA SEM TEXTO ALTERNATIVO E ERRO DIZ O CAMPO (21/10/2026)
-- Pedido do Thiago (21/10 15h17): ao salvar o rascunho, "O banco recusou um campo (tamanho ou formato)".
--   1. A foto de capa sem texto alternativo travava o RASCUNHO (o banco exigia 3 a 300 letras já ao salvar).
--      Agora o rascunho salva sem ele; a exigência continua na hora de PUBLICAR/AGENDAR (FOTO_SEM_TEXTO_ALTERNATIVO, SQL 146).
--   2. Antes de gravar, o banco confere cada campo e, se algo estiver fora do padrão, devolve a frase dizendo QUAL campo
--      e o que corrigir (ex.: "Linha fina: até 260 caracteres (está com 275)."). Funciona já na página aberta, sem recarregar.
--   3. Fontes consultadas: até 300 fontes por artigo (antes 60).
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): foto_sem_alt_ok | fontes_100_ok | msg_linha_fina
--                               true            | true          | Linha fina: até 260 caracteres (está com 300).

create or replace function public.vm_foto_valida(p jsonb) returns boolean
language plpgsql immutable set search_path to '' as $$
declare k text;
begin
  if p is null or p = 'null'::jsonb then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop if k not in ('src', 'alt', 'fotografo', 'fotografo_url', 'origem', 'pagina_url', 'midia_id') then return false; end if; end loop;
  return public.vm_https(p->>'src') and length(coalesce(btrim(p->>'alt'), '')) <= 300          -- v178: alt pode faltar no rascunho
     and length(coalesce(p->>'fotografo', '')) <= 80 and coalesce(p->>'origem', 'Foto própria') in ('Foto própria', 'Unsplash', 'Outra, com autorização')
     and (not p ? 'fotografo_url' or public.vm_https(p->>'fotografo_url')) and (not p ? 'pagina_url' or public.vm_https(p->>'pagina_url'));
end $$;

create or replace function public.vm_fontes_validas(p jsonb) returns boolean
language plpgsql immutable set search_path to '' as $$
declare f jsonb; k text;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 300 then return false; end if;      -- v178: 300 (antes 60)
  for f in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(f) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(f) loop if k not in ('titulo', 'url') then return false; end if; end loop;
    if length(coalesce(btrim(f->>'titulo'), '')) not between 1 and 300 then return false; end if;
    if coalesce(btrim(f->>'url'), '') <> '' and not public.vm_https(f->>'url') then return false; end if;
  end loop;
  return true;
end $$;

-- confere os campos ANTES de gravar e diz qual está errado (mesmas regras das colunas de vm_artigos)
create or replace function public._vm_artigo_conferir(p jsonb) returns void
language plpgsql immutable set search_path to '' as $$
declare n int; i int := 0; f jsonb; foto jsonb := nullif(p->'foto', 'null'::jsonb); k text;
begin
  if p ? 'titulo' then n := length(btrim(coalesce(p->>'titulo', '')));
    if n not between 1 and 90 then raise exception 'Título: use de 1 a 90 caracteres (está com %).', n using errcode = '22023'; end if; end if;
  n := length(coalesce(btrim(p->>'chapeu'), ''));
  if n > 60 then raise exception 'Chapéu: até 60 caracteres (está com %).', n using errcode = '22023'; end if;
  n := length(coalesce(btrim(p->>'linha_fina'), ''));
  if n > 260 then raise exception 'Linha fina: até 260 caracteres (está com %).', n using errcode = '22023'; end if;
  n := length(coalesce(btrim(p->>'autor'), ''));
  if n = 1 or n > 60 then raise exception 'Autor: de 2 a 60 caracteres (está com %).', n using errcode = '22023'; end if;
  if p ? 'tipo' and (p->>'tipo') not in ('reportagem', 'opiniao', 'nota') then raise exception 'Tipo de texto inválido: %.', p->>'tipo' using errcode = '22023'; end if;
  if p ? 'editoria' and (p->>'editoria') not in ('Mercados', 'Economia', 'Empresas', 'Política Econômica', 'Internacional', 'Investimentos', 'Opinião') then
    raise exception 'Editoria inválida: %.', p->>'editoria' using errcode = '22023'; end if;
  if p ? 'lugar' and (p->>'lugar') not in ('artigos', 'manchete', 'lista') then raise exception 'Lugar no jornal inválido: %.', p->>'lugar' using errcode = '22023'; end if;
  n := length(coalesce(btrim(p->>'seo_titulo'), ''));
  if n > 90 then raise exception 'Título SEO: até 90 caracteres (está com %).', n using errcode = '22023'; end if;
  n := length(coalesce(btrim(p->>'seo_descricao'), ''));
  if n > 220 then raise exception 'Descrição SEO: até 220 caracteres (está com %).', n using errcode = '22023'; end if;
  if p ? 'tags' and jsonb_typeof(p->'tags') = 'array' and (select count(*) from jsonb_array_elements_text(p->'tags') t where btrim(t) <> '') > 8 then
    raise exception 'Tags: no máximo 8.' using errcode = '22023'; end if;
  -- foto de capa
  if foto is not null then
    if jsonb_typeof(foto) <> 'object' then raise exception 'Foto de capa: dados inválidos. Remova a foto e envie de novo.' using errcode = '22023'; end if;
    for k in select jsonb_object_keys(foto) loop if k not in ('src', 'alt', 'fotografo', 'fotografo_url', 'origem', 'pagina_url', 'midia_id') then
      raise exception 'Foto de capa: dados inválidos. Remova a foto e envie de novo.' using errcode = '22023'; end if; end loop;
    if not public.vm_https(foto->>'src') then raise exception 'Foto de capa: o arquivo não foi enviado. Remova a foto e envie de novo.' using errcode = '22023'; end if;
    n := length(coalesce(btrim(foto->>'alt'), ''));
    if n > 300 then raise exception 'Foto de capa: texto alternativo até 300 caracteres (está com %).', n using errcode = '22023'; end if;
    n := length(coalesce(foto->>'fotografo', ''));
    if n > 80 then raise exception 'Foto de capa: nome do fotógrafo até 80 caracteres (está com %).', n using errcode = '22023'; end if;
    if coalesce(foto->>'origem', 'Foto própria') not in ('Foto própria', 'Unsplash', 'Outra, com autorização') then
      raise exception 'Foto de capa: origem inválida (%).', foto->>'origem' using errcode = '22023'; end if;
    if (foto ? 'fotografo_url' and not public.vm_https(foto->>'fotografo_url')) or (foto ? 'pagina_url' and not public.vm_https(foto->>'pagina_url')) then
      raise exception 'Foto de capa: link do crédito precisa começar com https:// e não ter espaços.' using errcode = '22023'; end if;
  end if;
  -- fontes consultadas
  if p ? 'fontes' and p->'fontes' <> 'null'::jsonb then
    if jsonb_typeof(p->'fontes') <> 'array' then raise exception 'Fontes: formato inválido.' using errcode = '22023'; end if;
    n := jsonb_array_length(p->'fontes');
    if n > 300 then raise exception 'Fontes: no máximo 300 (há %).', n using errcode = '22023'; end if;
    for f in select * from jsonb_array_elements(p->'fontes') loop
      i := i + 1;
      if jsonb_typeof(f) <> 'object' then raise exception 'Fontes, linha %: formato inválido.', i using errcode = '22023'; end if;
      n := length(coalesce(btrim(f->>'titulo'), ''));
      if n not between 1 and 300 then raise exception 'Fontes, linha %: o texto precisa ter de 1 a 300 caracteres (está com %).', i, n using errcode = '22023'; end if;
      if coalesce(btrim(f->>'url'), '') <> '' and not public.vm_https(f->>'url') then
        raise exception 'Fontes, linha %: o link precisa começar com https:// e não ter espaços nem acentos no endereço do site.', i using errcode = '22023'; end if;
    end loop;
  end if;
end $$;

-- mesma função do SQL 146, com a conferência dos campos antes de gravar
create or replace function public.vm_artigo_salvar(p_id bigint, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare a public.vm_artigos; v_id bigint; v_tags text[];
begin
  perform public._vm_exige_editor();
  if jsonb_typeof(p_dados) <> 'object' then raise exception 'DADOS_INVALIDOS' using errcode = '22023'; end if;
  if not public.vm_corpo_valido(coalesce(p_dados->'corpo', '[]'::jsonb)) then raise exception 'CORPO_INVALIDO' using errcode = '22023'; end if;
  perform public._vm_artigo_conferir(p_dados);                                                     -- v178
  select coalesce(array_agg(left(btrim(t), 30)), '{}') into v_tags from jsonb_array_elements_text(coalesce(p_dados->'tags', '[]'::jsonb)) t where btrim(t) <> '';
  if p_id is null then
    insert into public.vm_artigos (tipo, chapeu, titulo, linha_fina, autor, editoria, lugar, corpo, foto, fontes, tags, seo_titulo, seo_descricao, criado_por, atualizado_por)
    values (coalesce(p_dados->>'tipo', 'reportagem'), nullif(btrim(p_dados->>'chapeu'), ''), btrim(coalesce(p_dados->>'titulo', '')),
            nullif(btrim(p_dados->>'linha_fina'), ''), coalesce(nullif(btrim(p_dados->>'autor'), ''), 'Dr. Thiago Viegas'),
            coalesce(p_dados->>'editoria', 'Mercados'), coalesce(p_dados->>'lugar', 'artigos'), coalesce(p_dados->'corpo', '[]'::jsonb),
            nullif(p_dados->'foto', 'null'::jsonb), coalesce(p_dados->'fontes', '[]'::jsonb), v_tags,
            nullif(btrim(p_dados->>'seo_titulo'), ''), nullif(btrim(p_dados->>'seo_descricao'), ''), auth.uid(), auth.uid())
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
      tags = v_tags, seo_titulo = nullif(btrim(p_dados->>'seo_titulo'), ''), seo_descricao = nullif(btrim(p_dados->>'seo_descricao'), ''),
      atualizado_por = auth.uid(), atualizado_em = now()
    where id = p_id;
    v_id := p_id;
  end if;
  return jsonb_build_object('id', v_id, 'salvo_em', now());
end $$;

create or replace function pg_temp.msg(p jsonb) returns text language plpgsql as $$
begin perform public._vm_artigo_conferir(p); return 'ok'; exception when others then return sqlerrm; end $$;

select public.vm_foto_valida('{"src":"https://soliduns.com.br/x.jpg","alt":""}') as foto_sem_alt_ok,
       public.vm_fontes_validas((select jsonb_agg(jsonb_build_object('titulo', 'Fonte ' || g)) from generate_series(1, 100) g)) as fontes_100_ok,
       pg_temp.msg(jsonb_build_object('titulo', 'Teste', 'linha_fina', repeat('x', 300))) as msg_linha_fina;
