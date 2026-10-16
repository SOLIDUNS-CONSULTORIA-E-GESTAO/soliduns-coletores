-- 147_vm_publicidade.sql — Valor e Mercado: espaços de publicidade no padrão dos grandes portais
-- Decisão do Thiago (16/10/2026 08h15): "siga o padrão dos grandes portais"; recomendação aprovada:
--   lateral  — retângulo 300 × 250 na coluna "O que move o dia" ................ LIGADO
--   artigo   — dentro do texto, depois do 2º parágrafo (300 × 250 no celular, 728 × 90 no computador) ... LIGADO
--   topo     — faixa "billboard" 970 × 250 acima da manchete (no celular 320 × 100) ... PRONTO, DESLIGADO
--   (rodapé: não usado por enquanto)
-- Regras: só imagem + link https + período; etiqueta "Publicidade" sempre visível (CDC art. 36 / CONAR);
-- espaço reservado no tamanho certo (o texto não pula quando o banner carrega). Rodar DEPOIS da 146.

create table if not exists public.vm_publicidade_espacos (
  espaco      text primary key check (espaco in ('lateral', 'artigo', 'topo')),
  nome        text not null,
  ativo       boolean not null default false,
  largura     int not null, altura int not null,                 -- tamanho no computador
  largura_cel int not null, altura_cel int not null,             -- tamanho no celular
  atualizado_por uuid, atualizado_em timestamptz not null default now()
);
insert into public.vm_publicidade_espacos (espaco, nome, ativo, largura, altura, largura_cel, altura_cel) values
  ('lateral', 'Retângulo lateral (O que move o dia)', true,  300, 250, 300, 250),
  ('artigo',  'Dentro do artigo (depois do 2º parágrafo)', true, 728, 90, 300, 250),
  ('topo',    'Faixa do topo (billboard, acima da manchete)', false, 970, 250, 320, 100)
on conflict (espaco) do nothing;

alter table public.vm_publicidade_espacos enable row level security;
alter table public.vm_publicidade_espacos force row level security;
revoke all on table public.vm_publicidade_espacos from public, anon, authenticated;
drop policy if exists vm_publicidade_espacos_bloqueio on public.vm_publicidade_espacos;
create policy vm_publicidade_espacos_bloqueio on public.vm_publicidade_espacos as restrictive for all to anon, authenticated using (false) with check (false);

-- cada banner escolhe o seu espaço
alter table public.vm_banners add column if not exists espaco text not null default 'lateral';
alter table public.vm_banners drop constraint if exists vm_banners_espaco_ok;
alter table public.vm_banners add constraint vm_banners_espaco_ok check (espaco in ('lateral', 'artigo', 'topo'));
alter table public.vm_banners add column if not exists imagem_cel_url text;          -- versão para celular (opcional)
alter table public.vm_banners drop constraint if exists vm_banners_imagem_cel_ok;
alter table public.vm_banners add constraint vm_banners_imagem_cel_ok check (imagem_cel_url is null or public.vm_https(imagem_cel_url));
alter table public.vm_banners add column if not exists anunciante text check (length(anunciante) <= 80);

-- auditoria também nos espaços
drop trigger if exists vm_publicidade_espacos_auditoria on public.vm_publicidade_espacos;
create or replace function public._vm_auditar_espaco() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  insert into public.vm_eventos_redacao (quem, quem_nome, acao, item_tipo, item_id, antes, depois)
  values (auth.uid(), coalesce(public._vm_nome_usuario(), 'sistema'), case when new.ativo then 'ligou o espaço' else 'desligou o espaço' end,
          'vm_publicidade_espacos', null, to_jsonb(old), to_jsonb(new));
  return new;
end $$;
revoke all on function public._vm_auditar_espaco() from public, anon, authenticated;
create trigger vm_publicidade_espacos_auditoria after update on public.vm_publicidade_espacos
  for each row when (old.ativo is distinct from new.ativo) execute function public._vm_auditar_espaco();

-- RPCs da Redação
drop function if exists public.vm_banner_salvar(bigint, text, text, text, date, date, boolean);
create or replace function public.vm_banner_salvar(p_id bigint, p_espaco text, p_imagem_url text, p_link text, p_alt text, p_inicio date, p_fim date,
                                                   p_ativo boolean default true, p_imagem_cel_url text default null, p_anunciante text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint;
begin
  perform public._vm_exige_editor();
  if p_id is null then
    insert into public.vm_banners (espaco, imagem_url, imagem_cel_url, link, alt, anunciante, inicio, fim, ativo, criado_por)
    values (p_espaco, p_imagem_url, nullif(btrim(p_imagem_cel_url), ''), p_link, btrim(p_alt), nullif(btrim(p_anunciante), ''), p_inicio, p_fim, coalesce(p_ativo, true), auth.uid())
    returning id into v_id;
  else
    update public.vm_banners set espaco = p_espaco, imagem_url = p_imagem_url, imagem_cel_url = nullif(btrim(p_imagem_cel_url), ''), link = p_link,
           alt = btrim(p_alt), anunciante = nullif(btrim(p_anunciante), ''), inicio = p_inicio, fim = p_fim, ativo = coalesce(p_ativo, ativo)
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'NAO_ENCONTRADO' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.vm_banners_redacao()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  return jsonb_build_object(
    'espacos', (select jsonb_agg(to_jsonb(e) order by array_position(array['topo', 'lateral', 'artigo'], e.espaco)) from public.vm_publicidade_espacos e),
    'banners', coalesce((select jsonb_agg(to_jsonb(b) order by b.fim desc) from public.vm_banners b), '[]'::jsonb));
end $$;

create or replace function public.vm_espaco_publicidade_ligar(p_espaco text, p_ativo boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  update public.vm_publicidade_espacos set ativo = p_ativo, atualizado_por = auth.uid(), atualizado_em = now() where espaco = p_espaco;
  if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'P0002'; end if;
  return jsonb_build_object('espaco', p_espaco, 'ativo', p_ativo);
end $$;

-- leitura pública: só espaços ligados, banners ativos e dentro do período (horário de Brasília); um sorteio por espaço é feito na página
create or replace function public.vm_banners_publicos()
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_object_agg(e.espaco, jsonb_build_object(
           'largura', e.largura, 'altura', e.altura, 'largura_cel', e.largura_cel, 'altura_cel', e.altura_cel,
           'banners', coalesce((select jsonb_agg(jsonb_build_object('imagem_url', b.imagem_url, 'imagem_cel_url', b.imagem_cel_url, 'link', b.link, 'alt', b.alt))
                                  from public.vm_banners b
                                 where b.espaco = e.espaco and b.ativo and (now() at time zone 'America/Sao_Paulo')::date between b.inicio and b.fim), '[]'::jsonb))), '{}'::jsonb)
    from public.vm_publicidade_espacos e where e.ativo
$$;

revoke all on function public.vm_banner_salvar(bigint, text, text, text, text, date, date, boolean, text, text) from public, anon;
grant execute on function public.vm_banner_salvar(bigint, text, text, text, text, date, date, boolean, text, text) to authenticated;
revoke all on function public.vm_banners_redacao() from public, anon;
grant execute on function public.vm_banners_redacao() to authenticated;
revoke all on function public.vm_espaco_publicidade_ligar(text, boolean) from public, anon;
grant execute on function public.vm_espaco_publicidade_ligar(text, boolean) to authenticated;
revoke all on function public.vm_banners_publicos() from public;
grant execute on function public.vm_banners_publicos() to anon, authenticated;

-- conferência: esperado 1 linha "3 espaços | lateral, artigo ligados | topo desligado | 3 funções"
select (select count(*) from public.vm_publicidade_espacos) || ' espaços' as espacos,
       (select string_agg(espaco, ', ' order by espaco desc) from public.vm_publicidade_espacos where ativo) || ' ligados' as ligados,
       (select string_agg(espaco, ', ') from public.vm_publicidade_espacos where not ativo) || ' desligado' as desligado,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('vm_banner_salvar', 'vm_banners_redacao', 'vm_espaco_publicidade_ligar')) || ' funções' as funcoes;
