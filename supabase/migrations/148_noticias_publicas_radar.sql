-- 148_noticias_publicas_radar.sql — "Últimas notícias" do jornal com TODAS as fontes do radar (não só a Agência Brasil)
-- Pergunta do Thiago (16/10/2026 08h19): "por que no sidebar 'Últimas notícias' só aparece notícia da Agência Brasil?"
-- Causa: a lista lia só public.noticias (robô do GitHub "Notícias - manchetes": Agência Brasil no Brasil; Fed e SEC nos EUA).
-- As fontes novas do radar (BCB, Copom, Câmara, Senado, CADE, ANP, Receita, ANS, CVM, BCE, BoE, BoJ, BLS, USDA…) ficam em
-- public.vm_achados e não chegavam à lista. Correção SÓ NO BANCO (vale na hora, sem publicar o site):
--   noticias_publicas('br'|'us') passa a juntar public.noticias + public.vm_achados (só título, fonte, link e data; nunca o texto),
--   alternando as fontes (no máximo 1 de cada fonte por "rodada"), para a lista não ficar tomada por uma só.
--   Região: fonte com endereço .br = Brasil; demais = EUA/Internacional. Janela: últimos 3 dias. CVM: só fatos relevantes
--   na lista (comunicados e avisos continuam no Scanner).

create or replace function public.noticias_publicas(p_regiao text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if p_regiao not in ('br', 'us') then
    raise exception 'SITUACAO_INVALIDA' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'atualizado', greatest((select max(n.coletado_em) from public.noticias n where n.regiao = p_regiao),
                           (select max(a.coletado_em) from public.vm_achados a)),
    'itens', coalesce((
      with todas as (
        select n.fonte as f, n.titulo as t, n.link as l, n.publicado as d
          from public.noticias n
         where n.regiao = p_regiao and n.link ~* '^https://' and n.publicado > now() - interval '3 days'
        union all
        select regexp_replace(a.fonte_nome, '\s*\((feed|feed do site)\)\s*$', '') as f, a.titulo as t, a.link as l,
               coalesce(a.publicado_em, a.coletado_em) as d
          from public.vm_achados a
          join public.fontes_noticia fn on fn.id = a.fonte_id
         where a.link ~* '^https://'
           and coalesce(a.publicado_em, a.coletado_em) > now() - interval '3 days'
           and coalesce(a.publicado_em, a.coletado_em) <= now() + interval '1 hour'
           and (case when coalesce(fn.url_coleta, fn.url) ~* '^https?://[^/]*\.br(/|$)' or a.fonte_nome = 'CVM' then 'br' else 'us' end) = p_regiao
           and (a.fonte_nome <> 'CVM' or a.titulo ~* 'fato relevante')
      ),
      unicas as (select distinct on (l) * from todas order by l, d desc),
      rodadas as (select *, row_number() over (partition by f order by d desc) as rodada from unicas)
      select jsonb_agg(jsonb_build_object('f', x.f, 't', x.t, 'l', x.l, 'd', x.d) order by x.rodada, x.d desc)
        from (select * from rodadas order by rodada, d desc limit 80) x), '[]'::jsonb));
end $$;
revoke all on function public.noticias_publicas(text) from public;
grant execute on function public.noticias_publicas(text) to anon, authenticated;

-- conferência: as 8 primeiras do Brasil (as que aparecem em "Últimas notícias") e quantas fontes diferentes há na lista
select r as regiao,
       (select string_agg(distinct i->>'f', ', ') from jsonb_array_elements(public.noticias_publicas(r)->'itens') i) as fontes,
       (select string_agg(i->>'f', ' | ') from (select i from jsonb_array_elements(public.noticias_publicas(r)->'itens') i limit 8) z) as primeiras_8
  from unnest(array['br', 'us']) r;
