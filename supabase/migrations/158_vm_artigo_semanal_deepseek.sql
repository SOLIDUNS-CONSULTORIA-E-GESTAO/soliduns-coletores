-- 158_vm_artigo_semanal_deepseek.sql — Valor e Mercado: redator DeepSeek no artigo semanal (pedido do Thiago, 17/10/2026 21h51)
-- Rodar DEPOIS da SQL 157 e da função artigo-semanal v1.2. O Sonnet continua APURANDO (busca na web); a DeepSeek ESCREVE.
-- Para voltar ao Claude: update public.vm_pautas_semanais set redator = 'claude' where id = 'petrobras';
alter table public.vm_pautas_semanais add column if not exists redator text not null default 'claude' check (redator in ('claude', 'deepseek'));
alter table public.vm_pautas_semanais add column if not exists modelo_redator text check (modelo_redator in ('deepseek-flash', 'deepseek-v4-pro'));
update public.vm_pautas_semanais set redator = 'deepseek', modelo_redator = 'deepseek-flash', atualizado_em = now() where id = 'petrobras';

-- conferência: esperado 1 linha "petrobras | deepseek | deepseek-flash"
select id, redator, modelo_redator from public.vm_pautas_semanais where id = 'petrobras';
