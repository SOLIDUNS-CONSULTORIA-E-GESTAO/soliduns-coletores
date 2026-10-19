-- SQL 166 — SOLIDUNS / Valor e Mercado — ASSINATURA "Thiago Viegas" SEM O "Dr." (19/10/2026)
-- Pedido do Thiago (19/10 01h37): na página do artigo, "Por Thiago Viegas" (sem "Dr.").
-- Muda os artigos já gravados e o padrão novo. Uma trava garante que "Dr. Thiago Viegas" vire "Thiago Viegas" mesmo que
-- a Redação antiga (até a v150) ainda mande o nome com "Dr.". Vale na hora, sem deploy.
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): com_dr | sem_dr
--                               0      | (nº de artigos assinados por Thiago Viegas)

create or replace function public._vm_autor_sem_dr() returns trigger language plpgsql set search_path to '' as $$
begin
  if new.autor ~* '^\s*dr\.?\s+thiago\s+viegas\s*$' then new.autor := 'Thiago Viegas'; end if;
  return new;
end $$;
drop trigger if exists vm_artigos_autor_sem_dr on public.vm_artigos;
create trigger vm_artigos_autor_sem_dr before insert or update of autor on public.vm_artigos
  for each row execute function public._vm_autor_sem_dr();

alter table public.vm_artigos alter column autor set default 'Thiago Viegas';
update public.vm_artigos set autor = 'Thiago Viegas' where autor ~* '^\s*dr\.?\s+thiago\s+viegas\s*$';

select (select count(*) from public.vm_artigos where autor ilike '%dr%thiago%') as com_dr,
       (select count(*) from public.vm_artigos where autor = 'Thiago Viegas') as sem_dr;
