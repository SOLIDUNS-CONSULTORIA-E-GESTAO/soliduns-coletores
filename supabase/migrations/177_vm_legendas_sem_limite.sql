-- SQL 177 — SOLIDUNS / Valor e Mercado — REDAÇÃO: LEGENDAS SEM LIMITE DE CARACTERES (21/10/2026)
-- Pedido do Thiago (21/10 15h04): "campos de texto da legenda têm limite de caracteres — retire esse limite".
--   O banco recusava legenda de imagem no texto com mais de 200 caracteres, legenda de tabela com mais de 200
--   e legenda de número em destaque com mais de 120. Agora as três legendas não têm limite próprio
--   (vale só o limite geral do corpo do artigo: 3.000 blocos e 8 MB). Demais regras de 172 sem mudança.
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): legenda_imagem_longa | legenda_tabela_longa | legenda_numero_longa | alt_longo_recusado
--                               true                 | true                 | true                 | true

create or replace function public.vm_corpo_valido(p jsonb) returns boolean
language plpgsql immutable set search_path to '' as $$
declare b jsonb; k text;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 3000 or pg_column_size(p) > 8000000 then return false; end if;
  for b in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(b) <> 'object' then return false; end if;
    if (b->>'tipo') = 'imagem' then
      for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'src', 'alt', 'legenda') then return false; end if; end loop;
      if b ? 'src' and not public.vm_https(b->>'src') then return false; end if;
      if length(coalesce(b->>'alt', '')) > 300 then return false; end if;                       -- v177: legenda sem limite
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

select public.vm_corpo_valido(jsonb_build_array(jsonb_build_object('tipo', 'imagem', 'src', 'https://soliduns.com.br/x.jpg',
         'legenda', repeat('Legenda informativa longa. ', 40))))                                                       as legenda_imagem_longa,
       public.vm_corpo_valido(jsonb_build_array(jsonb_build_object('tipo', 'tabela', 'cabecalho', jsonb_build_array('A'),
         'linhas', jsonb_build_array(jsonb_build_array('1')), 'legenda', repeat('Legenda de tabela. ', 40))))          as legenda_tabela_longa,
       public.vm_corpo_valido(jsonb_build_array(jsonb_build_object('tipo', 'numero', 'valor', '85%',
         'legenda', repeat('Legenda de número. ', 40))))                                                               as legenda_numero_longa,
       not public.vm_corpo_valido(jsonb_build_array(jsonb_build_object('tipo', 'imagem', 'src', 'https://soliduns.com.br/x.jpg',
         'alt', repeat('a', 301))))                                                                                    as alt_longo_recusado;
