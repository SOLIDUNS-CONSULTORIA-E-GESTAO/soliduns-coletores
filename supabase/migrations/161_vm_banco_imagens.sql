-- 161_vm_banco_imagens.sql — Valor e Mercado: BANCO DE IMAGENS PRÓPRIO para a foto da manchete e dos artigos
-- Pedido do Thiago (18/10/2026 14h43): "banco de imagens próprio pra variar as fotos da manchete e não depender sempre de
-- uma API de imagens" — SIGA. Imagens geradas UMA VEZ pelo robô do GitHub "Banco de imagens" (FLUX.2 Pro, Black Forest Labs),
-- guardadas no Storage (vm-imagens/banco/<tema>/<id>-1880.jpg e -1200.jpg) e catalogadas aqui.
-- Regras (decisão de 18/10): só cenas genéricas — nada de pessoas reais, logomarcas, textos ou fatos reais; crédito
-- "Imagem ilustrativa" (o site nunca menciona como a imagem foi feita).
-- Uso: a manchete-do-dia (v1.1) e o artigo-semanal (v1.3) pedem uma imagem pelo assunto (vm_banco_imagem_escolher);
-- se o banco não tiver nada do assunto, usam o Unsplash como antes. A mesma imagem não volta antes de 30 dias.
-- Rodar no SQL Editor (Supabase > SQL Editor > New query > Run).

create table if not exists public.vm_banco_imagens (
  id         text primary key check (id ~ '^[a-z0-9-]{3,80}$'),
  tema       text not null check (tema ~ '^[a-z0-9-]{2,40}$'),
  palavras   text[] not null default '{}',                 -- palavras-chave (inglês e português, minúsculas)
  prompt     text not null,                                -- descrição usada para gerar a imagem (registro interno)
  alt        text not null check (length(alt) between 3 and 300),
  src        text not null check (src ~ '^https://'),        -- 1200x675
  src_grande text not null check (src_grande ~ '^https://'), -- 1880x1058
  modelo     text,
  ativa      boolean not null default true,
  usos       int not null default 0,
  usada_em   timestamptz,
  criado_em  timestamptz not null default now()
);
create index if not exists vm_banco_imagens_tema_idx on public.vm_banco_imagens (tema) where ativa;
alter table public.vm_banco_imagens enable row level security;
alter table public.vm_banco_imagens force row level security;
revoke all on table public.vm_banco_imagens from public, anon, authenticated;
drop policy if exists vm_banco_imagens_editor on public.vm_banco_imagens;
create policy vm_banco_imagens_editor on public.vm_banco_imagens for select to authenticated using (public.vm_eh_editor());
grant select on public.vm_banco_imagens to authenticated;     -- editores consultam o acervo; escrita só pelo robô (service_role)

-- Escolhe a imagem que mais combina com os termos do assunto (foto_busca, título, chapéu), sem repetir em 30 dias.
-- Devolve null quando nenhuma imagem do banco combina (aí entra o Unsplash). Marca a imagem como usada.
create or replace function public.vm_banco_imagem_escolher(p_termos text[], p_dias_sem_repetir int default 30)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_pal text[];
  v record;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.vm_eh_editor() then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct w), '{}') into v_pal
    from (select lower(unnest(regexp_split_to_array(coalesce(t, ''), '[^[:alnum:]À-ÿ]+'))) as w
            from unnest(coalesce(p_termos, '{}')) as t) s
   where length(w) >= 3 and w not in ('the', 'and', 'for', 'with', 'dos', 'das', 'para', 'com', 'que', 'uma', 'por', 'sobre', 'mais');
  if cardinality(v_pal) = 0 then return null; end if;

  select b.*, (select count(*) from unnest(b.palavras) p where p = any (v_pal)) as nota into v
    from public.vm_banco_imagens b
   where b.ativa
     and (b.usada_em is null or b.usada_em < now() - make_interval(days => greatest(coalesce(p_dias_sem_repetir, 30), 0)))
     and b.palavras && v_pal
   order by nota desc, b.usos asc, random()
   limit 1;
  if v.id is null and coalesce(p_dias_sem_repetir, 30) > 7 then
    return public.vm_banco_imagem_escolher(p_termos, 7);        -- tema muito usado: aceita repetir depois de 7 dias
  end if;
  if v.id is null then return null; end if;

  update public.vm_banco_imagens set usos = usos + 1, usada_em = now() where id = v.id;
  return jsonb_build_object('id', v.id, 'tema', v.tema, 'src', v.src, 'src_grande', v.src_grande, 'alt', v.alt, 'nota', v.nota);
end $$;
revoke all on function public.vm_banco_imagem_escolher(text[], int) from public, anon;
grant execute on function public.vm_banco_imagem_escolher(text[], int) to authenticated;

-- conferência: esperado 1 linha "true | 0 | true"
select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vm_banco_imagens') as tabela,
       (select count(*) from public.vm_banco_imagens) as imagens,
       exists (select 1 from storage.buckets where id = 'vm-imagens' and public) as bucket_publico;
