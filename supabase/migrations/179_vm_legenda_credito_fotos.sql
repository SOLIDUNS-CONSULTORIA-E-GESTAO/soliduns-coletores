-- SQL 179 — SOLIDUNS / Valor e Mercado — LEGENDA E CRÉDITO/FONTE NAS FOTOS (21/10/2026)
-- Pedido do Thiago (21/10 15h26), Redação do jornal:
--   1. LEGENDA das fotos sem limite de caracteres (imagens no texto: já liberado na SQL 177; agora também na foto de capa);
--   2. CRÉDITO/FONTE: a autoria da foto (fotógrafo, veículo ou agência), até 300 letras, nas imagens do texto e na foto de capa.
-- Feita SOBRE as SQL 177 (legendas sem limite) e 178 (rascunho sem texto alternativo; erro diz o campo): mantém as duas.
-- Precisa da v162 do site. Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): corpo_ok | foto_ok | rascunho_sem_alt_ok | midia_ok
--                               true     | true    | true                | true

-- 1. imagens no texto: + crédito/fonte (regras da SQL 177 mantidas)
create or replace function public.vm_corpo_valido(p jsonb) returns boolean
language plpgsql immutable set search_path to '' as $$
declare b jsonb; k text;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 3000 or pg_column_size(p) > 8000000 then return false; end if;
  for b in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(b) <> 'object' then return false; end if;
    if (b->>'tipo') = 'imagem' then
      for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'src', 'alt', 'legenda', 'credito') then return false; end if; end loop;
      if b ? 'src' and not public.vm_https(b->>'src') then return false; end if;
      if length(coalesce(b->>'alt', '')) > 300 or length(coalesce(b->>'credito', '')) > 300 then return false; end if;   -- v179: crédito/fonte até 300; legenda sem limite
    elsif (b->>'tipo') = 'lista' then
      for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'ordenada', 'itens') then return false; end if; end loop;
      if jsonb_typeof(b->'ordenada') <> 'boolean' or jsonb_typeof(b->'itens') <> 'array' or jsonb_array_length(b->'itens') > 50 then return false; end if;
      if exists (select 1 from jsonb_array_elements(b->'itens') i where jsonb_typeof(i) <> 'object' or (select count(*) from jsonb_object_keys(i) kk where kk <> 'conteudo') > 0
                 or not public.vm_conteudo_valido(i->'conteudo')) then return false; end if;
    elsif (b->>'tipo') = 'tabela' then
      for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'cabecalho', 'linhas', 'legenda', 'fonte') then return false; end if; end loop;
      if jsonb_typeof(b->'cabecalho') <> 'array' or jsonb_array_length(b->'cabecalho') not between 1 and 8 or jsonb_typeof(b->'linhas') <> 'array'
         or jsonb_array_length(b->'linhas') > 40 then return false; end if;
      if exists (select 1 from jsonb_array_elements(b->'cabecalho') c where jsonb_typeof(c) <> 'string' or length(c #>> '{}') > 200) then return false; end if;
      if exists (select 1 from jsonb_array_elements(b->'linhas') l where jsonb_typeof(l) <> 'array' or jsonb_array_length(l) > 8
                 or exists (select 1 from jsonb_array_elements(l) c where jsonb_typeof(c) <> 'string' or length(c #>> '{}') > 200)) then return false; end if;
      if length(coalesce(b->>'fonte', '')) > 120 then return false; end if;                     -- v177: legenda sem limite
    elsif (b->>'tipo') = 'numero' then
      for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'valor', 'legenda') then return false; end if; end loop;
      if length(coalesce(b->>'valor', '')) not between 1 and 16 then return false; end if;      -- v177: legenda sem limite
    elsif (b->>'tipo') = 'anexo' then
      for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'url', 'nome', 'tamanho', 'titulo') then return false; end if; end loop;
      if (b->>'url') !~ '^https://evcsniicnrlrtzpdmeza\.supabase\.co/storage/v1/object/public/vm-anexos/[0-9]{4}/[0-9]{2}/[a-f0-9]{16,64}\.pdf$' then return false; end if;
      if length(coalesce(b->>'nome', '')) > 160 or length(coalesce(b->>'titulo', '')) > 140 or length(coalesce(b->>'tamanho', '')) > 20 then return false; end if;
    elsif (b->>'tipo') in ('paragrafo', 'intertitulo', 'citacao') then
      for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'texto', 'conteudo') then return false; end if; end loop;
      if not public.vm_conteudo_valido(b->'conteudo') then return false; end if;
      if b ? 'texto' and (jsonb_typeof(b->'texto') <> 'string' or length(b->>'texto') > 300000) then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
end $$;

-- 2. foto de capa: + legenda; crédito/fonte (campo "fotografo") até 300 (regras da SQL 178 mantidas: alt pode faltar no rascunho)
create or replace function public.vm_foto_valida(p jsonb) returns boolean
language plpgsql immutable set search_path to '' as $$
declare k text;
begin
  if p is null or p = 'null'::jsonb then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop if k not in ('src', 'alt', 'fotografo', 'fotografo_url', 'origem', 'pagina_url', 'midia_id', 'legenda') then return false; end if; end loop;
  return public.vm_https(p->>'src') and length(coalesce(btrim(p->>'alt'), '')) <= 300          -- v178: alt pode faltar no rascunho
     and length(coalesce(p->>'fotografo', '')) <= 300 and coalesce(p->>'origem', 'Foto própria') in ('Foto própria', 'Unsplash', 'Outra, com autorização')
     and (not p ? 'fotografo_url' or public.vm_https(p->>'fotografo_url')) and (not p ? 'pagina_url' or public.vm_https(p->>'pagina_url'));
end $$;

-- 3. conferência campo a campo antes de gravar (SQL 178) com os limites novos
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
    for k in select jsonb_object_keys(foto) loop if k not in ('src', 'alt', 'fotografo', 'fotografo_url', 'origem', 'pagina_url', 'midia_id', 'legenda') then
      raise exception 'Foto de capa: dados inválidos. Remova a foto e envie de novo.' using errcode = '22023'; end if; end loop;
    if not public.vm_https(foto->>'src') then raise exception 'Foto de capa: o arquivo não foi enviado. Remova a foto e envie de novo.' using errcode = '22023'; end if;
    n := length(coalesce(btrim(foto->>'alt'), ''));
    if n > 300 then raise exception 'Foto de capa: texto alternativo até 300 caracteres (está com %).', n using errcode = '22023'; end if;
    n := length(coalesce(foto->>'fotografo', ''));
    if n > 300 then raise exception 'Foto de capa: crédito/fonte até 300 caracteres (está com %).', n using errcode = '22023'; end if;
    if coalesce(foto->>'origem', 'Foto própria') not in ('Foto própria', 'Unsplash', 'Outra, com autorização') then
      raise exception 'Foto de capa: origem inválida (%).', foto->>'origem' using errcode = '22023'; end if;
    if (foto ? 'fotografo_url' and not public.vm_https(foto->>'fotografo_url')) or (foto ? 'pagina_url' and not public.vm_https(foto->>'pagina_url')) then
      raise exception 'Foto de capa: link do crédito precisa começar com https:// e não ter espaços.' using errcode = '22023'; end if;
  end if;
  -- v179: imagens no texto — crédito/fonte até 300
  i := 0;
  for f in select * from jsonb_array_elements(case when jsonb_typeof(p->'corpo') = 'array' then p->'corpo' else '[]'::jsonb end) loop
    if f->>'tipo' = 'imagem' then i := i + 1; n := length(coalesce(f->>'credito', ''));
      if n > 300 then raise exception 'Imagem % do texto: crédito/fonte até 300 caracteres (está com %).', i, n using errcode = '22023'; end if; end if;
  end loop;
  i := 0;
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

-- 4. banco de mídia: crédito até 300
alter table public.vm_midias drop constraint if exists vm_midias_fotografo_check;
alter table public.vm_midias add constraint vm_midias_fotografo_check check (length(fotografo) <= 300);

-- 5. artigo posto como manchete leva a legenda da foto de capa
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
              'src', a.foto->>'src', 'alt', a.foto->>'alt', 'fotografo', nullif(btrim(a.foto->>'fotografo'), ''), 'legenda', nullif(btrim(a.foto->>'legenda'), ''),
              'fotografo_url', a.foto->>'fotografo_url', 'pagina_url', a.foto->>'pagina_url',
              'fonte', case when coalesce(a.foto->>'origem', 'Foto própria') = 'Foto própria' then 'Valor e Mercado' else a.foto->>'origem' end)) end))
$$;

notify pgrst, 'reload schema';

select public.vm_corpo_valido(jsonb_build_array(jsonb_build_object('tipo', 'imagem', 'src', 'https://soliduns.com.br/x.jpg',
         'legenda', repeat('Legenda longa. ', 400), 'credito', 'Reuters')))                                   as corpo_ok,
       public.vm_foto_valida(jsonb_build_object('src', 'https://soliduns.com.br/x.jpg', 'alt', 'Foto',
         'fotografo', 'Agência Brasil', 'legenda', repeat('Legenda da capa. ', 300)))                        as foto_ok,
       public.vm_foto_valida('{"src":"https://soliduns.com.br/x.jpg","alt":""}')                           as rascunho_sem_alt_ok,
       (select count(*) = 1 from pg_constraint where conname = 'vm_midias_fotografo_check')                  as midia_ok;
