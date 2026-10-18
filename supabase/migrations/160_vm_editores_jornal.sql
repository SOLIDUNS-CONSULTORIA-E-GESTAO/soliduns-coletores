-- 160_vm_editores_jornal.sql — Valor e Mercado: perfil "Editor do jornal"
-- Pedido do Thiago (18/10/2026 14h27): o botão "Redação" (edição do jornal) só para os administradores-mestre
-- (Thiago e Thales) e para um perfil novo: usuário "Editor do jornal".
-- O que muda:
--   1. Tabela public.vm_editores_jornal (e-mails dos editores). Só os administradores-mestre incluem e retiram (tela Equipe).
--   2. public.vm_eh_editor() passa a ser: administrador-mestre (public.eh_admin) OU e-mail na lista de editores.
--      Todas as permissões da Redação (artigos, fotos, anexos, pautas, scanner) já usam essa função: o editor ganha a Redação
--      inteira e NADA além dela (não vê Equipe, CPFs, planos nem as outras áreas de administração).
-- Rodar no SQL Editor (Supabase > SQL Editor > New query > Run) DEPOIS de publicar a v136 do site.

-- 1. Lista de editores ------------------------------------------------------------------------------------------
create table if not exists public.vm_editores_jornal (
  email      text primary key check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  nome       text check (length(nome) <= 120),
  criado_em  timestamptz not null default now(),
  criado_por text
);
alter table public.vm_editores_jornal enable row level security;
alter table public.vm_editores_jornal force row level security;
revoke all on table public.vm_editores_jornal from public, anon, authenticated;
drop policy if exists vm_editores_jornal_bloqueio on public.vm_editores_jornal;
create policy vm_editores_jornal_bloqueio on public.vm_editores_jornal
  as restrictive for all to anon, authenticated using (false) with check (false);   -- acesso só pelas funções abaixo

-- 2. Quem é editor --------------------------------------------------------------------------------------------
create or replace function public.vm_eh_editor() returns boolean
language plpgsql stable security definer set search_path to '' as $$
declare v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if coalesce(auth.role(), '') = 'service_role' then return true; end if;
  if public.eh_admin() then return true; end if;                          -- administradores-mestre (Thiago e Thales)
  return v_email <> '' and exists (select 1 from public.vm_editores_jornal e where e.email = v_email);
exception when others then
  return false;
end $$;
revoke all on function public.vm_eh_editor() from public, anon;
grant execute on function public.vm_eh_editor() to authenticated;

-- 3. Incluir, retirar e listar (só administrador-mestre) -------------------------------------------------------
create or replace function public.vm_editores_listar() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('email', e.email, 'nome', e.nome, 'criado_em', e.criado_em) order by e.nome, e.email)
                     from public.vm_editores_jornal e), '[]'::jsonb);
end $$;

create or replace function public.vm_editores_incluir(p_email text, p_nome text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'EMAIL_INVALIDO' using errcode = '22023'; end if;
  insert into public.vm_editores_jornal (email, nome, criado_por)
  values (v_email, nullif(left(btrim(coalesce(p_nome, '')), 120), ''), lower(coalesce(auth.jwt() ->> 'email', '')))
  on conflict (email) do update set nome = coalesce(excluded.nome, public.vm_editores_jornal.nome);
  return public.vm_editores_listar();
end $$;

create or replace function public.vm_editores_retirar(p_email text) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  delete from public.vm_editores_jornal where email = lower(btrim(coalesce(p_email, '')));
  return public.vm_editores_listar();
end $$;

revoke all on function public.vm_editores_listar() from public, anon;
revoke all on function public.vm_editores_incluir(text, text) from public, anon;
revoke all on function public.vm_editores_retirar(text) from public, anon;
grant execute on function public.vm_editores_listar() to authenticated;
grant execute on function public.vm_editores_incluir(text, text) to authenticated;
grant execute on function public.vm_editores_retirar(text) to authenticated;

-- conferência: esperado 1 linha "true | 0 | true"
select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vm_editores_jornal') as tabela,
       (select count(*) from public.vm_editores_jornal) as editores,
       position('vm_editores_jornal' in pg_get_functiondef('public.vm_eh_editor()'::regprocedure)) > 0 as funcao_nova;
