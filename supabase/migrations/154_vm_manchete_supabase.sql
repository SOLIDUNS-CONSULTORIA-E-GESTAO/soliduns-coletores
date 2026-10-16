-- 154_vm_manchete_supabase.sql — Valor e Mercado: a edição do dia (Manchete + Scanner) passa a ser escrita pelo Supabase
-- Decisão do Thiago (16/10/2026 17h45): "MANCHETE PELO SUPABASE — SIGA".
-- Edge Function "manchete-do-dia" chamada a cada 5 min. A edição de verdade só anda das 05h00 às 08h55 de Brasília (fora disso a
-- função responde "fora do horário" em milissegundos); o resto do dia serve para levar adiante um TESTE pedido à mão.
-- Cada chamada dá um passo (pedido em lote à Anthropic -> conferência -> foto -> publica às 06h30). O robô do GitHub vira RESERVA às 07h15.
-- Rodar DEPOIS de criar a função manchete-do-dia no painel.

-- 1. Registro das execuções (uma por dia e por modo: producao | teste) ---------------------------------------
create table if not exists public.vm_manchete_execucoes (
  data          date not null,
  modo          text not null default 'producao' check (modo in ('producao', 'teste')),
  etapa         text not null default 'nova',     -- nova | aguardando | pronta | publicada | falhou | substituida
  rodada        int  not null default 0,          -- 0 = redação; 1 = correção
  continuacoes  int  not null default 0,
  reenvios      int  not null default 0,
  modelo        text,
  lote_id       text,
  mensagens     jsonb not null default '[]'::jsonb, -- conversa em andamento (apagada quando termina)
  buscas        int  not null default 0,
  urls          jsonb not null default '{}'::jsonb, -- endereços que a busca devolveu (só eles valem como fonte)
  edicao        jsonb,
  fontes        jsonb not null default '[]'::jsonb,
  ent           bigint not null default 0,
  sai           bigint not null default 0,
  nbuscas       int  not null default 0,
  registro      jsonb not null default '[]'::jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (data, modo)
);
alter table public.vm_manchete_execucoes enable row level security;
alter table public.vm_manchete_execucoes force row level security;
revoke all on table public.vm_manchete_execucoes from public, anon, authenticated;
drop policy if exists vm_manchete_execucoes_bloqueio on public.vm_manchete_execucoes;
create policy vm_manchete_execucoes_bloqueio on public.vm_manchete_execucoes
  as restrictive for all to anon, authenticated using (false) with check (false);

-- 2. Endereço da função no cofre e agenda a cada 5 min ------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'vm_manchete_url') then
    perform vault.create_secret('https://evcsniicnrlrtzpdmeza.supabase.co/functions/v1/manchete-do-dia',
                                'vm_manchete_url', 'Edge Function manchete-do-dia (Valor e Mercado)');
  end if;
end $$;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'vm-manchete-do-dia';
  perform cron.schedule('vm-manchete-do-dia', '*/5 * * * *', $job$
    select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'vm_manchete_url'),
      headers := jsonb_build_object('Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_token')),
      body := '{}'::jsonb, timeout_milliseconds := 120000);
  $job$);
end $$;

-- conferência: esperado 1 linha "true | */5 * * * * | 0"
select exists (select 1 from vault.secrets where name = 'vm_manchete_url') as segredo,
       (select schedule from cron.job where jobname = 'vm-manchete-do-dia') as agenda,
       (select count(*) from public.vm_manchete_execucoes) as execucoes;
