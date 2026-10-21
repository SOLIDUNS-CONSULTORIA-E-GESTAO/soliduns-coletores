-- SQL 176 — SOLIDUNS / Valor e Mercado — CONSERTO DO COLETOR DE FECHAMENTO (21/10/2026)
-- Problema (visto pelo Thiago em 21/10: Scanner falando do "pregão de 16 de outubro"): desde 16/10 o coletor-fechamento
-- não grava nada. Ele passou a trazer o Ibovespa em pontos (fonte 'B3 Índices') depois que a fonte foi conferida, mas a
-- tabela public.cotacoes só aceitava as fontes 'B3 COTAHIST', 'BCB SGS' e 'BCB Olinda'. A linha do Ibovespa era recusada
-- e, com ela, a gravação inteira do dia (ações da B3, Selic, CDI, IPCA, dólar e euro).
-- Correção: a tabela passa a aceitar também 'B3 Índices' (Ibovespa) e 'BCB Focus' (Boletim Focus).
-- Em seguida, esta SQL pede de novo os pregões de 16/10 (estava incompleto: 153 ações), 19/10 e 20/10.
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (3 linhas): pregao | pedido   (pedido = número; a conferência vem depois, em 2 minutos)

do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.cotacoes'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%fonte%'
  loop
    execute format('alter table public.cotacoes drop constraint %I', c);
  end loop;
  alter table public.cotacoes add constraint cotacoes_fonte_check
    check (fonte in ('B3 COTAHIST', 'BCB SGS', 'BCB Olinda', 'B3 Índices', 'BCB Focus'));
end $$;

select d as pregao,
       net.http_post(
         url     := (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_url'),
         headers := jsonb_build_object('Content-Type', 'application/json',
                      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vm_coletor_token')),
         body    := jsonb_build_object('data', d),
         timeout_milliseconds := 120000) as pedido
  from unnest(array['2026-10-16', '2026-10-19', '2026-10-20']) d;
