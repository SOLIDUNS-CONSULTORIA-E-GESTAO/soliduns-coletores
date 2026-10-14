# Supabase — Valor e Mercado (SOLIDUNS)

Migrations versionadas (`migrations/`) e Edge Functions (`functions/`) do jornal Valor e Mercado.
Nenhuma chave fica neste repositório: só variáveis de ambiente e segredos do Vault.

## coletor-fechamento (Etapa 2 — indicadores de fechamento)

Baixa o COTAHIST diário da B3 e as séries do Banco Central (SGS: Selic, CDI, IPCA; Olinda: PTAX de fechamento)
e grava em `public.cotacoes` (migration 137). Roda às 18h30 de Brasília, dias úteis, pelo pg_cron.

Variáveis: `COLETOR_TOKEN` (configurar à mão). `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` o Supabase já fornece.
Segredos do Vault usados pela agenda: `vm_coletor_url`, `vm_coletor_token`.

Instalação (painel do Supabase, sem linha de comando):
1. Database > Extensions: ligar `pg_cron` e `pg_net`.
2. Edge Functions > Deploy a new function > Via Editor: nome `coletor-fechamento`, colar `functions/coletor-fechamento/index.ts`, Deploy.
3. Na função: desligar "Enforce JWT verification" (a função confere o próprio token).
4. Edge Functions > Secrets: criar `COLETOR_TOKEN` com uma senha longa.
5. Vault: criar `vm_coletor_url` (endereço da função) e `vm_coletor_token` (a mesma senha do passo 4).
6. SQL Editor: rodar `migrations/137_cotacoes_fechamento.sql`.

Testes locais (sem rede externa): `python3 testes/teste_coletor.py` e `deno run --allow-env --allow-net testes/t_calendario.ts`.
