-- SQL 180 — SOLIDUNS / Valor e Mercado — OLHO DA MATÉRIA E FIO DE SEPARAÇÃO (21/10/2026)
-- Pedido do Thiago (21/10 15h53): inserir OLHO (frase em destaque entre fios, com atribuição) e FIOS DE SEPARAÇÃO editáveis
-- (espessura, cor, estilo e largura) no corpo dos artigos. Feita sobre a SQL 179 (mantém tudo dela).
-- Precisa da v163 do site. Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): olho_ok | fio_ok | fio_invalido_recusado
--                               true    | true   | true

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
    elsif (b->>'tipo') = 'olho' then                                                             -- v180: olho da matéria
      for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'texto', 'autor', 'fios') then return false; end if; end loop;
      if jsonb_typeof(b->'texto') <> 'string' or length(btrim(b->>'texto')) not between 1 and 5000 or length(coalesce(b->>'autor', '')) > 300 then return false; end if;
      if b ? 'fios' and jsonb_typeof(b->'fios') <> 'boolean' then return false; end if;
    elsif (b->>'tipo') = 'fio' then                                                              -- v180: fio de separação
      for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'espessura', 'cor', 'estilo', 'largura') then return false; end if; end loop;
      if coalesce(b->>'espessura', '1') not in ('1', '2', '4') or coalesce(b->>'cor', 'dourado') not in ('dourado', 'oliva', 'cinza')
         or coalesce(b->>'estilo', 'continuo') not in ('continuo', 'tracejado', 'pontilhado') or coalesce(b->>'largura', 'inteira') not in ('inteira', 'media', 'curta') then return false; end if;
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

-- artigo posto como manchete: o olho entra como parágrafo entre aspas
create or replace function public._vm_artigo_como_manchete(a public.vm_artigos) returns jsonb
language sql stable set search_path to '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'cartola', a.chapeu, 'titulo', a.titulo, 'linha_fina', a.linha_fina, 'artigo_id', a.id, 'autor', a.autor,
    'corpo', coalesce((
      select jsonb_agg(x.t order by x.n, x.m) from (
        select n, 0::bigint as m, case when b->>'tipo' = 'intertitulo' then '## ' || public._vm_bloco_texto(b) else public._vm_bloco_texto(b) end as t
          from jsonb_array_elements(a.corpo) with ordinality as c(b, n)
         where b->>'tipo' in ('paragrafo', 'intertitulo', 'citacao')
        union all                                                     -- v180: olho vira parágrafo entre aspas
        select n, 0::bigint, '“' || btrim(b->>'texto', ' “”"') || '”' || coalesce(' — ' || nullif(btrim(b->>'autor'), ''), '')
          from jsonb_array_elements(a.corpo) with ordinality as c(b, n)
         where b->>'tipo' = 'olho'
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

select public.vm_corpo_valido(jsonb_build_array(jsonb_build_object('tipo', 'olho', 'texto', 'Isso representa um marco', 'autor', 'Yasuo Matsubara, na EES Solar', 'fios', true))) as olho_ok,
       public.vm_corpo_valido(jsonb_build_array(jsonb_build_object('tipo', 'fio', 'espessura', 2, 'cor', 'oliva', 'estilo', 'tracejado', 'largura', 'media'))) as fio_ok,
       not public.vm_corpo_valido(jsonb_build_array(jsonb_build_object('tipo', 'fio', 'cor', 'vermelho')))                                       as fio_invalido_recusado;
