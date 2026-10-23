-- 183_radar_exponencial_score.sql — Radar de Ações Exponenciais com o Score Exponencial v1.0.5 (23/10/2026)
-- Pedido do Thiago (23/10 00h05): concluir a ferramenta e inserir na plataforma, sem publicar no Telegram.
-- O teste histórico (rodada única) não passou nos critérios de publicação: o ranking é gravado todo mês pelo robô
-- (workflow "Score - mensal") com publicado = false. Assinante vê "Ranking em calibração"; administrador vê a prévia
-- e o acompanhamento em tempo real da carteira do Radar. Publicar para assinantes continua sendo decisão do Thiago.
-- Rodar DEPOIS da 140 (tabela radar_exponencial e função radar_exponencial_publico).

alter table public.radar_exponencial
  add column if not exists nota_qualidade numeric check (nota_qualidade between 0 and 100),
  add column if not exists nota_momento   numeric check (nota_momento between 0 and 100),
  add column if not exists nota_risco     numeric check (nota_risco between 0 and 100),
  add column if not exists carteira       boolean not null default false;

-- acompanhamento em tempo real: retorno mensal da carteira do Radar (faixa 20%/40%), depois dos custos, contra o Ibovespa
create table if not exists public.radar_exponencial_acompanhamento (
  mercado          text not null default 'br' check (mercado in ('br', 'us')),
  mes_formacao     text not null check (mes_formacao ~ '^\d{4}-\d{2}$'),
  mes_retorno      text not null check (mes_retorno ~ '^\d{4}-\d{2}$'),
  n_acoes          integer not null,
  retorno_bruto    numeric not null,
  custo            numeric not null,
  retorno_liquido  numeric not null,
  ibovespa         numeric,
  metodologia_versao text not null,
  gravado_em       timestamptz not null default now(),
  primary key (mercado, mes_formacao)
);
alter table public.radar_exponencial_acompanhamento enable row level security;
revoke all on table public.radar_exponencial_acompanhamento from anon, authenticated;
drop policy if exists radar_acomp_leitura_editor on public.radar_exponencial_acompanhamento;
create policy radar_acomp_leitura_editor on public.radar_exponencial_acompanhamento for select to authenticated using (public.vm_eh_editor());
grant select on public.radar_exponencial_acompanhamento to authenticated;
-- escrita só pela chave de serviço (robô)

-- leitura da página: assinante vê o último ranking PUBLICADO; administrador vê também a prévia e o acompanhamento
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
  if v_data is null then
    return jsonb_build_object('mercado', v_merc, 'data_ref', null, 'itens', '[]'::jsonb, 'calibracao', v_pub is null);
  end if;
  return jsonb_build_object(
    'mercado', v_merc, 'data_ref', v_data, 'previa', v_data is distinct from v_pub, 'calibracao', v_pub is null,
    'metodologia_versao', (select max(metodologia_versao) from public.radar_exponencial where mercado = v_merc and data_ref = v_data),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('posicao', r.posicao, 'ticker', r.ticker, 'nome', r.nome, 'setor', r.setor,
                         'preco', r.preco, 'nota_momentum', r.nota_momentum, 'nota_fundamentos', r.nota_fundamentos,
                         'nota_qualidade', r.nota_qualidade, 'nota_momento', r.nota_momento, 'nota_risco', r.nota_risco,
                         'carteira', r.carteira, 'score', r.score, 'sinais', to_jsonb(r.sinais)) order by r.posicao)
                       from public.radar_exponencial r
                      where r.mercado = v_merc and r.data_ref = v_data
                        and (r.publicado or (v_admin and v_data is distinct from v_pub))), '[]'::jsonb),
    'acompanhamento', case when v_admin then coalesce((select jsonb_agg(jsonb_build_object('mes_formacao', a.mes_formacao,
                         'mes_retorno', a.mes_retorno, 'n_acoes', a.n_acoes, 'retorno_liquido', a.retorno_liquido,
                         'ibovespa', a.ibovespa) order by a.mes_formacao)
                       from public.radar_exponencial_acompanhamento a where a.mercado = v_merc), '[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function public.radar_exponencial_publico(text) from public, anon;
grant execute on function public.radar_exponencial_publico(text) to authenticated;

-- conferência: esperado 1 linha "true | true | 4 | 0"
select (select relrowsecurity from pg_class where oid = 'public.radar_exponencial_acompanhamento'::regclass) as tabela_nova_com_rls,
       exists (select 1 from pg_proc where proname = 'radar_exponencial_publico') as funcao,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'radar_exponencial'
          and column_name in ('nota_qualidade', 'nota_momento', 'nota_risco', 'carteira')) as colunas_novas,
       (select count(*) from public.radar_exponencial_acompanhamento) as linhas_acompanhamento;
