-- SQL 171 — SOLIDUNS / Valor e Mercado — 1 ARTIGO DIÁRIO EM RODÍZIO, SÓ O SONNET ESCREVE (20/10/2026)
-- Decisão do Thiago (20/10 08h54): "baixar o número de artigos diários para 01; deixar só o Sonnet escrever" — rodízio por dia
-- e Sonnet em tudo (artigo diário, artigos de domingo, manchete e Scanner).
--   * Diário (segunda a sexta): 1 artigo por dia, tema em rodízio — seg Petrobras · ter Juros e Inflação · qua Câmbio ·
--     qui Agronegócio · sex Mineração e Siderurgia. O Sonnet apura (até 12 buscas) e escreve às 07h00; publica às 09h00.
--   * Domingo: os 5 artigos semanais continuam, cada um apurado e escrito pelo Sonnet (até 15 buscas), publicados das 18h às 20h.
--   * As apurações amplas (apuracao-diaria e apuracao-semanal) ficam DESLIGADAS (não apagadas: dá para voltar).
--   * Manchete (v1.5) e Scanner (v2.8) passam a usar o Sonnet por padrão (código).
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (12 linhas): os 10 artigos com redator "claude", sem grupo, e o dia de cada um; as 2 apurações com ativa = false.

update public.vm_pautas_semanais set ativa = false, atualizado_em = now() where id in ('apuracao-diaria', 'apuracao-semanal');

-- diários: um por dia da semana (1 = segunda … 5 = sexta)
update public.vm_pautas_semanais p set grupo = null, redator = 'claude', modelo_redator = null, buscas = 12, ativa = true,
       dias_semana = array[d.dia], hora_escrever = 7 * 60, dias_publicar = 0, hora_publicar = 9 * 60, atualizado_em = now()
  from (values ('petrobras-dia', 1), ('juros-inflacao-dia', 2), ('cambio-dia', 3), ('agronegocio-dia', 4), ('mineracao-siderurgia-dia', 5)) d(id, dia)
 where p.id = d.id;

-- semanais (domingo): cada um com a própria apuração do Sonnet
update public.vm_pautas_semanais set grupo = null, redator = 'claude', modelo_redator = null, buscas = 15, ativa = true, atualizado_em = now()
 where id in ('petrobras', 'juros-inflacao', 'cambio', 'agronegocio', 'mineracao-siderurgia');

select id, ativa, coalesce(grupo, '—') as grupo, coalesce(redator, '—') as redator, buscas,
       case when dias_semana is not null then (array['dom','seg','ter','qua','qui','sex','sáb'])[dias_semana[1] + 1] else 'domingo' end as dia,
       to_char(make_time(hora_escrever / 60, hora_escrever % 60, 0), 'HH24:MI') as escreve,
       to_char(make_time(hora_publicar / 60, hora_publicar % 60, 0), 'HH24:MI') as publica
  from public.vm_pautas_semanais
 where id in ('apuracao-diaria', 'apuracao-semanal', 'petrobras-dia', 'juros-inflacao-dia', 'cambio-dia', 'agronegocio-dia', 'mineracao-siderurgia-dia',
              'petrobras', 'juros-inflacao', 'cambio', 'agronegocio', 'mineracao-siderurgia')
 order by ativa desc, dias_semana nulls last, id;
