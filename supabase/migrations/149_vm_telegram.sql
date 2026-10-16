-- 149_vm_telegram.sql — Valor e Mercado no Telegram (canal t.me/valoremercadojornal + grupos onde o Thiago puser o robô)
-- Decisão do Thiago (16/10/2026 09h04–09h11): robô nos grupos e no canal; envia o link no horário da publicação.
-- Opção B: Manchete, Scanner do Dia e artigos do CMS. Edge Function "telegram-envio" (a cada 5 min). Rodar DEPOIS da 147.

-- 1. Destinos (grupos e canais) ----------------------------------------------------------------------------
create table if not exists public.vm_telegram_destinos (
  chat_id        text primary key,                 -- número do grupo/canal no Telegram (ou @endereço do canal)
  nome           text, tipo text,
  ativo          boolean not null default true,
  adicionado_por text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
-- 2. Registro de envios (nunca manda a mesma matéria duas vezes ao mesmo destino)
create table if not exists public.vm_telegram_envios (
  id          bigint generated always as identity primary key,
  item        text not null,                       -- manchete:AAAA-MM-DD | scanner:<id> | artigo:<id>
  chat_id     text not null,
  ok          boolean not null,
  tentativas  int not null default 1,
  mensagem_id bigint,
  erro        text,
  enviado_em  timestamptz not null default now(),
  unique (item, chat_id)
);

alter table public.vm_telegram_destinos enable row level security;
alter table public.vm_telegram_destinos force row level security;
alter table public.vm_telegram_envios enable row level security;
alter table public.vm_telegram_envios force row level security;
revoke all on table public.vm_telegram_destinos from public, anon, authenticated;
revoke all on table public.vm_telegram_envios from public, anon, authenticated;
drop policy if exists vm_telegram_destinos_bloqueio on public.vm_telegram_destinos;
create policy vm_telegram_destinos_bloqueio on public.vm_telegram_destinos
  as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists vm_telegram_envios_bloqueio on public.vm_telegram_envios;
create policy vm_telegram_envios_bloqueio on public.vm_telegram_envios
  as restrictive for all to anon, authenticated using (false) with check (false);

-- gravação de um envio (só a função, com a chave de serviço): soma tentativas quando falha de novo
create or replace function public.vm_telegram_registrar(p jsonb)
returns void language sql security definer set search_path to '' as $$
  insert into public.vm_telegram_envios (item, chat_id, ok, mensagem_id, erro)
  values (p->>'item', p->>'chat_id', coalesce((p->>'ok')::boolean, false), (p->>'mensagem_id')::bigint, p->>'erro')
  on conflict (item, chat_id) do update
    set ok = excluded.ok, mensagem_id = coalesce(excluded.mensagem_id, public.vm_telegram_envios.mensagem_id),
        erro = excluded.erro, enviado_em = now(),
        tentativas = public.vm_telegram_envios.tentativas + 1
  where not public.vm_telegram_envios.ok;
$$;
revoke all on function public.vm_telegram_registrar(jsonb) from public, anon, authenticated;
grant execute on function public.vm_telegram_registrar(jsonb) to service_role;

-- o canal do jornal já entra pelo endereço; quando o Telegram avisar, vira o número oficial
insert into public.vm_telegram_destinos (chat_id, nome, tipo, adicionado_por)
values ('@valoremercadojornal', 'Valor e Mercado (canal)', 'channel', 'manual')
on conflict (chat_id) do nothing;

-- 3. Endereço da função no cofre e agenda a cada 5 min ------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'vm_telegram_url') then
    perform vault.create_secret('https://evcsniicnrlrtzpdmeza.supabase.co/functions/v1/telegram-envio',
                                'vm_telegram_url', 'Edge Function telegram-envio (Valor e Mercado)');
  end if;
end $$;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'vm-telegram-envio';
  perform cron.schedule('vm-telegram-envio', '*/5 * * * *', $job$
    select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'vm_telegram_url'),
      headers := jsonb_build_object('Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_token')),
      body := '{}'::jsonb, timeout_milliseconds := 120000);
  $job$);
end $$;

-- conferência: esperado 1 linha "true | */5 * * * * | 1"
select exists (select 1 from vault.secrets where name = 'vm_telegram_url') as segredo,
       (select schedule from cron.job where jobname = 'vm-telegram-envio') as agenda,
       (select count(*) from public.vm_telegram_destinos) as destinos;
