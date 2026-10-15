-- 140_radar_exponencial.sql — Radar de Ações Exponenciais (v123 do site, pedido do Thiago 15/10/2026 11h10)
-- Ranking de ações com potencial de crescimento acelerado: confluência de momentum técnico e fundamentos,
-- ordenado pelo Score Exponencial SOLIDUNS (metodologia própria, ainda em definição).
-- Esta migration só cria a estrutura: NENHUM ranking é gravado aqui. O robô (ou o administrador) grava depois,
-- com publicado = false para conferir na prévia e true para liberar aos assinantes.
-- Rodar DEPOIS da 138 (usa public.vm_eh_editor).

create table if not exists public.radar_exponencial (
  id                 bigint generated always as identity primary key,
  mercado            text not null check (mercado in ('br', 'us')),
  data_ref           date not null,                         -- pregão de referência (fechamento)
  posicao            integer not null check (posicao > 0),
  ticker             text not null,
  nome               text,
  setor              text,
  preco              numeric,                                -- fechamento na data_ref (R$ ou US$)
  nota_momentum      numeric check (nota_momentum between 0 and 100),
  nota_fundamentos   numeric check (nota_fundamentos between 0 and 100),
  score              numeric not null check (score between 0 and 100),
  sinais             text[] not null default '{}',           -- ex.: {"Rompimento de máxima","Volume 2x a média"}
  detalhe            jsonb not null default '{}'::jsonb,     -- indicadores usados no cálculo (auditoria)
  metodologia_versao text not null,
  publicado          boolean not null default false,
  criado_em          timestamptz not null default now(),
  unique (mercado, data_ref, ticker)
);
create index if not exists radar_exponencial_ultimo on public.radar_exponencial (mercado, publicado, data_ref desc, posicao);
alter table public.radar_exponencial enable row level security;
revoke all on table public.radar_exponencial from anon, authenticated;
drop policy if exists radar_exponencial_leitura_editor on public.radar_exponencial;
create policy radar_exponencial_leitura_editor on public.radar_exponencial for select to authenticated using (public.vm_eh_editor());
grant select on public.radar_exponencial to authenticated;
-- escrita só pela chave de serviço (robô) ou pelo SQL Editor

-- leitura da página: assinante logado vê o último ranking PUBLICADO do mercado;
-- administrador vê também o ranking ainda não publicado (prévia), quando for mais novo.
create or replace function public.radar_exponencial_publico(p_mercado text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_merc text := case when p_mercado = 'us' then 'us' else 'br' end;
        v_admin boolean := coalesce(public.vm_eh_editor(), false);
        v_pub date; v_prev date; v_data date;
begin
  if auth.uid() is null then raise exception 'LOGIN_NECESSARIO' using errcode = '42501'; end if;
  select max(data_ref) into v_pub from public.radar_exponencial where mercado = v_merc and publicado;
  if v_admin then
    select max(data_ref) into v_prev from public.radar_exponencial where mercado = v_merc and not publicado;
  end if;
  v_data := case when v_prev is not null and v_prev > coalesce(v_pub, '1900-01-01'::date) then v_prev else v_pub end;
  if v_data is null then return jsonb_build_object('mercado', v_merc, 'data_ref', null, 'itens', '[]'::jsonb); end if;
  return jsonb_build_object(
    'mercado', v_merc, 'data_ref', v_data, 'previa', v_data is distinct from v_pub,
    'metodologia_versao', (select max(metodologia_versao) from public.radar_exponencial where mercado = v_merc and data_ref = v_data),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('posicao', r.posicao, 'ticker', r.ticker, 'nome', r.nome, 'setor', r.setor,
                         'preco', r.preco, 'nota_momentum', r.nota_momentum, 'nota_fundamentos', r.nota_fundamentos,
                         'score', r.score, 'sinais', to_jsonb(r.sinais)) order by r.posicao)
                       from public.radar_exponencial r
                      where r.mercado = v_merc and r.data_ref = v_data
                        and (r.publicado or (v_admin and v_data is distinct from v_pub))), '[]'::jsonb));
end $$;
revoke all on function public.radar_exponencial_publico(text) from public, anon;
grant execute on function public.radar_exponencial_publico(text) to authenticated;

-- conferência: esperado 1 linha "true | true | 0"
select (select relrowsecurity from pg_class where oid = 'public.radar_exponencial'::regclass) as tabela_com_rls,
       exists (select 1 from pg_proc where proname = 'radar_exponencial_publico') as funcao,
       (select count(*) from public.radar_exponencial) as linhas;
