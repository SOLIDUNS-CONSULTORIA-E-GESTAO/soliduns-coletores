-- 153_vm_ibge_pelo_banco.sql — Calendário do IBGE buscado pelo BANCO (pg_net) e lido pela função calendario-oficial v1.2
-- Diagnóstico 16/10/2026 17h11: a API v3 do IBGE responde 200 ao banco (pedidos 332–338) e 400 às Edge Functions
-- (pedidos 328 e 330). O filtro de datas é de/ate em MM-DD-YYYY. Então: às 05h50 de Brasília (dias úteis) o banco busca
-- a semana (hoje + 7 dias) e guarda o número do pedido; às 06h05 a função lê a resposta por vm_ibge_resposta().
create table if not exists public.vm_ibge_pedidos (
  pedido    bigint primary key,
  criado_em timestamptz not null default now()
);
alter table public.vm_ibge_pedidos enable row level security;
alter table public.vm_ibge_pedidos force row level security;
revoke all on table public.vm_ibge_pedidos from public, anon, authenticated;
drop policy if exists vm_ibge_pedidos_bloqueio on public.vm_ibge_pedidos;
create policy vm_ibge_pedidos_bloqueio on public.vm_ibge_pedidos
  as restrictive for all to anon, authenticated using (false) with check (false);

create or replace function public.vm_ibge_buscar()
returns bigint language plpgsql security definer set search_path to '' as $$
declare v_id bigint; d0 date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select net.http_get(
    url := 'https://servicodados.ibge.gov.br/api/v3/calendario/?qtd=100&de=' || to_char(d0, 'MM-DD-YYYY') || '&ate=' || to_char(d0 + 7, 'MM-DD-YYYY'),
    headers := jsonb_build_object('User-Agent', 'SOLIDUNS Valor e Mercado (soliduns.com.br) calendario oficial', 'Accept', 'application/json'),
    timeout_milliseconds := 30000) into v_id;
  insert into public.vm_ibge_pedidos (pedido) values (v_id);
  delete from public.vm_ibge_pedidos where criado_em < now() - interval '7 days';
  return v_id;
end $$;

create or replace function public.vm_ibge_resposta()
returns jsonb language sql stable security definer set search_path to '' as $$
  select r.content::jsonb
    from public.vm_ibge_pedidos p join net._http_response r on r.id = p.pedido
   where r.status_code = 200 and p.criado_em > now() - interval '6 hours'
   order by p.criado_em desc limit 1
$$;
revoke all on function public.vm_ibge_buscar() from public, anon, authenticated;
revoke all on function public.vm_ibge_resposta() from public, anon, authenticated;
grant execute on function public.vm_ibge_resposta() to service_role;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'vm-ibge-buscar';
  perform cron.schedule('vm-ibge-buscar', '50 8 * * 1-5', 'select public.vm_ibge_buscar()');
end $$;

-- já busca agora, para o teste de hoje
select public.vm_ibge_buscar() as pedido_ibge,
       (select schedule from cron.job where jobname = 'vm-ibge-buscar') as agenda;
