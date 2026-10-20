-- SQL 172 — SOLIDUNS / Valor e Mercado — REDAÇÃO: SEM LIMITE PRÁTICO DE TEXTO E FONTE SEM LINK (20/10/2026)
-- Pedidos do Thiago (20/10 15h41):
--   1. "Retirar limite de palavras do corpo do texto": o banco aceitava até 300 blocos (parágrafos, imagens…), 400 KB de corpo
--      e 20 mil caracteres por parágrafo. Agora: até 3.000 blocos, 8 MB de corpo e 300 mil caracteres por parágrafo
--      (na prática, sem limite para um artigo; o limite só protege o banco de um arquivo absurdo).
--   2. FONTES CONSULTADAS: o link passa a ser OPCIONAL. Cada fonte precisa do texto (nome da obra, autor ou veículo);
--      o link, se preenchido, precisa ser um endereço https:// válido. Fonte sem link é aceita em rascunho, agendamento e publicação.
--   3. Imagens no corpo: sem limite de quantidade (cada imagem é um bloco; vale o limite de 3.000 blocos).
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): fonte_sem_link | fonte_link_errado | corpo_grande
--                               true           | false             | true

create or replace function public.vm_conteudo_valido(p jsonb, p_nivel int default 0) returns boolean
language plpgsql immutable set search_path to '' as $$
declare n jsonb; k text;
begin
  if p is null or jsonb_typeof(p) <> 'array' or p_nivel > 12 or jsonb_array_length(p) > 5000 then return false; end if;
  for n in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(n) <> 'object' then return false; end if;
    if n ? 'texto' then
      for k in select jsonb_object_keys(n) loop if k <> 'texto' then return false; end if; end loop;
      if jsonb_typeof(n->'texto') <> 'string' or length(n->>'texto') > 300000 then return false; end if;
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
      if length(coalesce(b->>'legenda', '')) > 200 or length(coalesce(b->>'alt', '')) > 300 then return false; end if;
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
      if length(coalesce(b->>'legenda', '')) > 200 or length(coalesce(b->>'fonte', '')) > 120 then return false; end if;
    elsif (b->>'tipo') = 'numero' then
      for k in select jsonb_object_keys(b) loop if k not in ('tipo', 'valor', 'legenda') then return false; end if; end loop;
      if length(coalesce(b->>'valor', '')) not between 1 and 16 or length(coalesce(b->>'legenda', '')) > 120 then return false; end if;
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

-- fontes: texto obrigatório; link opcional (se vier, https:// válido)
create or replace function public.vm_fontes_validas(p jsonb) returns boolean
language plpgsql immutable set search_path to '' as $$
declare f jsonb; k text;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 60 then return false; end if;
  for f in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(f) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(f) loop if k not in ('titulo', 'url') then return false; end if; end loop;
    if length(coalesce(btrim(f->>'titulo'), '')) not between 1 and 300 then return false; end if;
    if coalesce(btrim(f->>'url'), '') <> '' and not public.vm_https(f->>'url') then return false; end if;
  end loop;
  return true;
end $$;

select public.vm_fontes_validas('[{"titulo":"Banco Central, Relatório de Inflação"},{"titulo":"IBGE","url":"https://www.ibge.gov.br"}]') as fonte_sem_link,
       public.vm_fontes_validas('[{"titulo":"X","url":"www.site.com"}]') as fonte_link_errado,
       public.vm_corpo_valido((select jsonb_agg(jsonb_build_object('tipo', 'paragrafo', 'conteudo', jsonb_build_array(jsonb_build_object('texto',
                                 repeat('palavra ', case when g = 1 then 3000 else 600 end)))))                    -- 1 parágrafo de 24 mil caracteres + 399 de 4.800
                                 from generate_series(1, 400) g)) as corpo_grande;
