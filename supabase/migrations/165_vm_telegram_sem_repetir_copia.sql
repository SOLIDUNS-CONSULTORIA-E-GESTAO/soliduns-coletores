-- SQL 165 — SOLIDUNS / Valor e Mercado — TELEGRAM NÃO REPETE A MANCHETE QUE VIROU ARTIGO (19/10/2026)
-- Quando a manchete do robô desce para a lista de artigos (SQL 164), a cópia nasce como artigo publicado. Sem esta SQL,
-- o robô do Telegram mandaria o mesmo texto de novo aos grupos, agora como "artigo". Aqui a cópia já nasce marcada
-- como enviada em todos os grupos/canais ativos (a manchete original segue sendo enviada normalmente).
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): gatilho | copias_marcadas
--                               true    | (nº de grupos x cópias; 0 se o robô não estiver em nenhum grupo)

create or replace function public._vm_copia_nao_reenviar() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  insert into public.vm_telegram_envios (item, chat_id, ok, erro)
  select 'artigo:' || new.artigo_id, d.chat_id, true, 'cópia da manchete — não reenviada'
    from public.vm_telegram_destinos d where d.ativo
  on conflict (item, chat_id) do nothing;
  return new;
end $$;
revoke all on function public._vm_copia_nao_reenviar() from public, anon, authenticated;

drop trigger if exists vm_capa_copias_telegram on public.vm_capa_copias;
create trigger vm_capa_copias_telegram after insert on public.vm_capa_copias
  for each row execute function public._vm_copia_nao_reenviar();

-- cópias já feitas (ex.: artigo 54)
insert into public.vm_telegram_envios (item, chat_id, ok, erro)
select 'artigo:' || c.artigo_id, d.chat_id, true, 'cópia da manchete — não reenviada'
  from public.vm_capa_copias c cross join public.vm_telegram_destinos d where d.ativo
on conflict (item, chat_id) do nothing;

select exists (select 1 from pg_trigger where tgname = 'vm_capa_copias_telegram') as gatilho,
       (select count(*) from public.vm_telegram_envios e join public.vm_capa_copias c on e.item = 'artigo:' || c.artigo_id) as copias_marcadas;
