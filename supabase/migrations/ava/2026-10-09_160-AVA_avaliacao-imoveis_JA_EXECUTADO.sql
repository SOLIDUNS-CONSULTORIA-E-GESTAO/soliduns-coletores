-- REGISTRO (23/10/2026): SQL 160 do ramo AVALIAÇÃO DE IMÓVEIS, JÁ EXECUTADO no Supabase antes de 15/10/2026
-- (conferido em 23/10: tabelas aval_* com dados e função aval_pode existem). NÃO RODAR DE NOVO sem necessidade.
-- O número 160 do ramo AVA não é o SQL 160 dos outros ramos (vm_editores_jornal). Novos SQLs da Avaliação: 190 em diante.

-- =====================================================================
-- SOLIDUNS — RAMO AVALIAÇÃO DE IMÓVEIS (AVA) — SQL 160 (09/10/2026)
-- Módulo "Avaliação de imóveis" (laudos periciais NBR 14653) dentro da plataforma.
-- Faixa de SQL do ramo AVA: 160 a 189. Prefixo dos objetos: aval_ (nunca usado por MF, LEI ou AG).
--
-- O QUE CRIA
--   aval_perfis       nome profissional, e-mail de contato, habilitação e registro (CREA/CAU) do perito
--   aval_avaliacoes   cada avaliação (documento completo em JSON)
--   aval_mercado      banco de dados de mercado de cada perito
--   aval_parametros   parâmetros técnicos de cada perito
--   aval_auditoria    trilha de auditoria (só inclusão; data, usuário e papel carimbados pelo servidor)
--   bucket aval-anexos (privado, 15 MB por arquivo, só imagens, PDF e Word): fotos da vistoria e documentos
--
-- QUEM ACESSA
--   Dono: lê e grava o que é seu, se estiver liberado na fila (public.esta_aprovado)
--         e o plano tiver a área 'avaliacao_imoveis' (public.tem_area).
--   Administrador do SISTEMA (public.eh_admin = Thiago e Thales): lê tudo e ajusta, para suporte.
--   Visitante (anon): nada.
--
-- Pode ser executado de novo: não apaga dados (IF NOT EXISTS; funções, gatilhos e regras são recriados).
-- Em transação: se algo falhar, nada é gravado. Se o SQL Editor avisar "Potential issue detected",
-- escolher "Run this query". NUNCA "Run and enable RLS".
-- =====================================================================
begin;

-- ---------- 0. pré-requisitos da plataforma (SQL 23, 35 e 41) e do Supabase ----------
do $$
begin
  if to_regprocedure('public.eh_admin()') is null then raise exception 'FALTA public.eh_admin() (SQL 23). Nada foi gravado.'; end if;
  if to_regprocedure('public.esta_aprovado()') is null then raise exception 'FALTA public.esta_aprovado(). Nada foi gravado.'; end if;
  if to_regprocedure('public.tem_area(text)') is null then raise exception 'FALTA public.tem_area(text) (SQL 35). Nada foi gravado.'; end if;
  if to_regprocedure('auth.jwt()') is null then raise exception 'FALTA auth.jwt() (Supabase). Nada foi gravado.'; end if;
end $$;

-- ---------- 1. porta única de acesso do módulo ----------
create or replace function public.aval_pode() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.eh_admin(), false)
      or (coalesce(public.esta_aprovado(), false) and coalesce(public.tem_area('avaliacao_imoveis'), false))
$$;
revoke all on function public.aval_pode() from public, anon;
grant execute on function public.aval_pode() to authenticated;

-- ---------- 2. tabelas ----------
create table if not exists public.aval_perfis (
  id            uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  nome          text not null default '' check (length(nome) <= 200),
  email         text not null default '' check (length(email) <= 200),
  prof          text not null default '' check (length(prof) <= 80),
  registro      text not null default '' check (length(registro) <= 80),
  criado        timestamptz not null default now(),
  ultimo_acesso timestamptz
);

create table if not exists public.aval_avaliacoes (
  id         text primary key check (length(id) between 3 and 60),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codigo     text not null default '' check (length(codigo) <= 60),
  status     text not null default '' check (length(status) <= 30),
  dados      jsonb not null,
  atualizado timestamptz not null default now()
);
create index if not exists aval_avaliacoes_owner_idx on public.aval_avaliacoes(owner);

create table if not exists public.aval_mercado (
  id         text primary key check (length(id) between 3 and 60),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dados      jsonb not null,
  atualizado timestamptz not null default now()
);
create index if not exists aval_mercado_owner_idx on public.aval_mercado(owner);

create table if not exists public.aval_parametros (
  owner      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  dados      jsonb not null,
  atualizado timestamptz not null default now()
);

create table if not exists public.aval_auditoria (
  id      text primary key check (length(id) between 3 and 60),
  owner   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ts      timestamptz not null default now(),
  tipo    text not null check (length(tipo) <= 30),
  rota    text not null default '' check (length(rota) <= 60),
  detalhe text not null default '' check (length(detalhe) <= 300),
  usuario text not null default '' check (length(usuario) <= 200),
  papel   text not null default '' check (length(papel) <= 30)
);
create index if not exists aval_auditoria_owner_ts_idx on public.aval_auditoria(owner, ts desc);
alter table public.aval_auditoria add column if not exists ts_cliente timestamptz;

-- ids só com letras, números, _ e - (impede código escondido no id); documento de até 5 MB
alter table public.aval_avaliacoes drop constraint if exists aval_avaliacoes_id_ok;
alter table public.aval_avaliacoes add constraint aval_avaliacoes_id_ok check (id ~ '^[A-Za-z0-9_-]{3,60}$');
alter table public.aval_avaliacoes drop constraint if exists aval_avaliacoes_tamanho;
alter table public.aval_avaliacoes add constraint aval_avaliacoes_tamanho check (octet_length(dados::text) <= 5000000);
alter table public.aval_mercado drop constraint if exists aval_mercado_id_ok;
alter table public.aval_mercado add constraint aval_mercado_id_ok check (id ~ '^[A-Za-z0-9_-]{3,60}$');
alter table public.aval_mercado drop constraint if exists aval_mercado_tamanho;
alter table public.aval_mercado add constraint aval_mercado_tamanho check (octet_length(dados::text) <= 1000000);
alter table public.aval_parametros drop constraint if exists aval_parametros_tamanho;
alter table public.aval_parametros add constraint aval_parametros_tamanho check (octet_length(dados::text) <= 1000000);
alter table public.aval_auditoria drop constraint if exists aval_auditoria_id_ok;
alter table public.aval_auditoria add constraint aval_auditoria_id_ok check (id ~ '^[A-Za-z0-9_-]{3,60}$');

-- ---------- 3. gatilhos: o dono nunca muda; data de atualização automática ----------
create or replace function public.aval_protege_dono() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.owner is distinct from old.owner then
    raise exception 'O dono do registro não pode ser alterado';
  end if;
  new.atualizado := now();
  return new;
end $$;
revoke all on function public.aval_protege_dono() from public, anon, authenticated;

drop trigger if exists aval_protege_dono on public.aval_avaliacoes;
create trigger aval_protege_dono before update on public.aval_avaliacoes for each row execute function public.aval_protege_dono();
drop trigger if exists aval_protege_dono on public.aval_mercado;
create trigger aval_protege_dono before update on public.aval_mercado for each row execute function public.aval_protege_dono();
drop trigger if exists aval_protege_dono on public.aval_parametros;
create trigger aval_protege_dono before update on public.aval_parametros for each row execute function public.aval_protege_dono();

create or replace function public.aval_protege_perfil() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.id is distinct from old.id or new.criado is distinct from old.criado then
    raise exception 'O dono do perfil não pode ser alterado';
  end if;
  return new;
end $$;
revoke all on function public.aval_protege_perfil() from public, anon, authenticated;
drop trigger if exists aval_protege_perfil on public.aval_perfis;
create trigger aval_protege_perfil before update on public.aval_perfis for each row execute function public.aval_protege_perfil();

-- trilha carimbada pelo servidor: data, usuário e papel não vêm do aparelho (a data do aparelho fica em ts_cliente)
create or replace function public.aval_carimbo_trilha() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null then
    new.ts_cliente := new.ts;
    new.ts := now();
    new.usuario := coalesce(auth.jwt() ->> 'email', '');
    new.papel := case when public.eh_admin() then 'admin' else 'perito' end;
  end if;
  return new;
end $$;
revoke all on function public.aval_carimbo_trilha() from public, anon, authenticated;
drop trigger if exists aval_carimbo_trilha on public.aval_auditoria;
create trigger aval_carimbo_trilha before insert on public.aval_auditoria for each row execute function public.aval_carimbo_trilha();

-- ---------- 4. permissões e regras (RLS) ----------
alter table public.aval_perfis     enable row level security;
alter table public.aval_avaliacoes enable row level security;
alter table public.aval_mercado    enable row level security;
alter table public.aval_parametros enable row level security;
alter table public.aval_auditoria  enable row level security;

revoke all on public.aval_perfis, public.aval_avaliacoes, public.aval_mercado, public.aval_parametros, public.aval_auditoria from anon;
revoke truncate, references, trigger on public.aval_perfis, public.aval_avaliacoes, public.aval_mercado, public.aval_parametros, public.aval_auditoria from authenticated;
grant select, insert, update, delete on public.aval_perfis, public.aval_avaliacoes, public.aval_mercado, public.aval_parametros to authenticated;
grant select, insert on public.aval_auditoria to authenticated;
revoke update, delete on public.aval_auditoria from authenticated;

-- perfis: cada um o seu; administrador do sistema lê todos
drop policy if exists aval_perfis_ler on public.aval_perfis;
create policy aval_perfis_ler on public.aval_perfis for select to authenticated
  using ((id = (select auth.uid()) and (select public.aval_pode())) or (select public.eh_admin()));
drop policy if exists aval_perfis_incluir on public.aval_perfis;
create policy aval_perfis_incluir on public.aval_perfis for insert to authenticated
  with check (id = (select auth.uid()) and (select public.aval_pode()));
drop policy if exists aval_perfis_editar on public.aval_perfis;
create policy aval_perfis_editar on public.aval_perfis for update to authenticated
  using (id = (select auth.uid()) and (select public.aval_pode()))
  with check (id = (select auth.uid()) and (select public.aval_pode()));
drop policy if exists aval_perfis_excluir on public.aval_perfis;
create policy aval_perfis_excluir on public.aval_perfis for delete to authenticated
  using (id = (select auth.uid()));

-- avaliações, mercado e parâmetros: o dono liberado; o administrador do sistema, para suporte
do $$
declare t text;
begin
  foreach t in array array['aval_avaliacoes','aval_mercado','aval_parametros'] loop
    execute format('drop policy if exists %1$s_ler on public.%1$s', t);
    execute format('create policy %1$s_ler on public.%1$s for select to authenticated using ((owner = (select auth.uid()) and (select public.aval_pode())) or (select public.eh_admin()))', t);
    execute format('drop policy if exists %1$s_incluir on public.%1$s', t);
    execute format('create policy %1$s_incluir on public.%1$s for insert to authenticated with check ((owner = (select auth.uid()) and (select public.aval_pode())) or (select public.eh_admin()))', t);
    execute format('drop policy if exists %1$s_editar on public.%1$s', t);
    execute format('create policy %1$s_editar on public.%1$s for update to authenticated using ((owner = (select auth.uid()) and (select public.aval_pode())) or (select public.eh_admin())) with check ((owner = (select auth.uid()) and (select public.aval_pode())) or (select public.eh_admin()))', t);
    execute format('drop policy if exists %1$s_excluir on public.%1$s', t);
    execute format('create policy %1$s_excluir on public.%1$s for delete to authenticated using (owner = (select auth.uid()) or (select public.eh_admin()))', t);
  end loop;
end $$;

-- trilha: cada um inclui os próprios eventos; ninguém altera nem apaga; o administrador lê tudo
drop policy if exists aval_auditoria_ler on public.aval_auditoria;
create policy aval_auditoria_ler on public.aval_auditoria for select to authenticated
  using (owner = (select auth.uid()) or (select public.eh_admin()));
drop policy if exists aval_auditoria_incluir on public.aval_auditoria;
create policy aval_auditoria_incluir on public.aval_auditoria for insert to authenticated
  with check (owner = (select auth.uid()) and (select public.aval_pode()));

-- ---------- 5. arquivos: fotos da vistoria e documentos ----------
-- caminho: <id do usuário>/<id da avaliação>/<id do arquivo>
-- só imagens, PDF e Word
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aval-anexos', 'aval-anexos', false, 15728640,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif','application/pdf','application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists aval_anexos_ler on storage.objects;
create policy aval_anexos_ler on storage.objects for select to authenticated
  using (bucket_id = 'aval-anexos' and (((storage.foldername(name))[1] = (select auth.uid())::text and (select public.aval_pode())) or (select public.eh_admin())));
drop policy if exists aval_anexos_incluir on storage.objects;
create policy aval_anexos_incluir on storage.objects for insert to authenticated
  with check (bucket_id = 'aval-anexos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.aval_pode()));
drop policy if exists aval_anexos_editar on storage.objects;
create policy aval_anexos_editar on storage.objects for update to authenticated
  using (bucket_id = 'aval-anexos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.aval_pode()));
drop policy if exists aval_anexos_excluir on storage.objects;
create policy aval_anexos_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'aval-anexos' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.eh_admin())));

-- pastas do aval-anexos cujo dono não existe mais em auth.users (conta excluída) e sem arquivo novo nas últimas 24 h
create or replace function public.aval_pastas_orfas()
returns table(pasta text, arquivos bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(public.eh_admin(), false) then
    raise exception 'SEM_PERMISSAO';
  end if;
  return query
    select g.pasta, g.arquivos
      from (select split_part(o.name, '/', 1) as pasta, count(*)::bigint as arquivos, max(o.created_at) as ultimo
              from storage.objects o
             where o.bucket_id = 'aval-anexos'
             group by 1) g
     where g.ultimo < now() - interval '24 hours'
       and not exists(select 1 from auth.users u where u.id::text = g.pasta);
end $$;
revoke all on function public.aval_pastas_orfas() from public, anon;
grant execute on function public.aval_pastas_orfas() to authenticated;

-- ---------- 6. planos: a área nova 'avaliacao_imoveis' precisa ser aceita pela lista de áreas (SQL 34) ----------
-- Se public.planos tiver regra (CHECK) com a lista fixa de áreas, o código novo entra na lista, ao lado de 'mercado_imobiliario'.
do $$
declare r record; novo text;
begin
  if to_regclass('public.planos') is null then return; end if;
  for r in select c.conname, pg_get_constraintdef(c.oid) as def from pg_constraint c
            where c.conrelid = 'public.planos'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) like '%mercado_imobiliario%'
              and pg_get_constraintdef(c.oid) not like '%avaliacao_imoveis%' loop
    novo := replace(r.def, '''mercado_imobiliario''::text', '''mercado_imobiliario''::text, ''avaliacao_imoveis''::text');
    if novo = r.def then
      novo := replace(r.def, '''mercado_imobiliario''', '''mercado_imobiliario'', ''avaliacao_imoveis''');
    end if;
    if novo = r.def then
      novo := replace(r.def, '"mercado_imobiliario"', '"mercado_imobiliario", "avaliacao_imoveis"');
    end if;
    if novo = r.def then
      raise exception 'A regra % de public.planos tem a lista de áreas num formato inesperado. Nada foi gravado.', r.conname;
    end if;
    execute format('alter table public.planos drop constraint %I', r.conname);
    execute format('alter table public.planos add constraint %I %s', r.conname, novo);
  end loop;
end $$;

commit;

-- teste da área nova nos planos (só simula: a alteração é desfeita na hora)
create or replace function pg_temp.aval_planos_aceitam() returns boolean language plpgsql as $$
declare tipo text; pid text;
begin
  if to_regclass('public.planos') is null then return true; end if;
  select data_type into tipo from information_schema.columns where table_schema = 'public' and table_name = 'planos' and column_name = 'areas';
  if tipo is null then return true; end if;
  if not exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'planos' and column_name = 'id') then return true; end if;
  execute 'select id::text from public.planos limit 1' into pid;
  if pid is null then return true; end if;
  begin
    if tipo = 'ARRAY' then
      execute 'update public.planos set areas = array_append(coalesce(areas, ''{}''), ''avaliacao_imoveis'') where id::text = $1' using pid;
    elsif tipo = 'jsonb' then
      execute 'update public.planos set areas = coalesce(areas, ''[]''::jsonb) || ''["avaliacao_imoveis"]''::jsonb where id::text = $1' using pid;
    else
      return true;
    end if;
    raise exception 'AVAL_DESFAZER';
  exception when others then
    return sqlerrm = 'AVAL_DESFAZER';
  end;
end $$;

-- ---------- 7. conferência (todas as linhas devem vir com ok = true) ----------
select 'planos aceitam a área avaliacao_imoveis' as item, pg_temp.aval_planos_aceitam() as ok
union all
select 'tabelas aval_ com RLS (5)',
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname in ('aval_perfis','aval_avaliacoes','aval_mercado','aval_parametros','aval_auditoria')
           and c.relrowsecurity) = 5 as ok
union all
select 'regras das tabelas aval_ (18)',
       (select count(*) from pg_policies where schemaname = 'public' and tablename like 'aval\_%') = 18
union all
select 'regras dos arquivos aval-anexos (4)',
       (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'aval\_anexos\_%') = 4
union all
select 'pasta aval-anexos privada (15 MB; imagens, PDF e Word)',
       exists(select 1 from storage.buckets where id = 'aval-anexos' and public = false and file_size_limit = 15728640
                and 'application/pdf' = any(allowed_mime_types) and not ('text/html' = any(allowed_mime_types)))
union all
select 'visitante sem acesso às tabelas',
       not has_table_privilege('anon', 'public.aval_avaliacoes', 'select')
union all
select 'trilha sem alterar nem apagar',
       not has_table_privilege('authenticated', 'public.aval_auditoria', 'update')
   and not has_table_privilege('authenticated', 'public.aval_auditoria', 'delete')
union all
select 'trilha carimbada pelo servidor (data, usuário e papel)',
       exists(select 1 from pg_trigger where tgname = 'aval_carimbo_trilha' and tgrelid = 'public.aval_auditoria'::regclass)
union all
select 'ids e tamanho validados no banco',
       (select count(*) from pg_constraint where conname in ('aval_avaliacoes_id_ok','aval_mercado_id_ok','aval_auditoria_id_ok','aval_avaliacoes_tamanho','aval_mercado_tamanho','aval_parametros_tamanho')) = 6;
