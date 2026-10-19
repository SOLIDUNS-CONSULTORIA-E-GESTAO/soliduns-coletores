-- SQL 167 — SOLIDUNS / Valor e Mercado — CORREÇÃO EM RASCUNHO (19/10/2026)
-- Pedido do Thiago (19/10 13h13): "Não publique automaticamente as correções que eu fizer no artigo. Apenas quando eu
-- selecionar PUBLICAR CORREÇÃO."
-- Agora a correção de um artigo publicado fica GUARDADA (rascunho da correção, invisível ao leitor) até o botão
-- "Publicar correção". Só então o texto do site muda e a nota de correção aparece no fim do artigo.
--   vm_artigo_correcao_salvar(id, dados)            guarda a correção (o site não muda)
--   vm_artigo_correcao_publicar(id, o_que, antes)   publica a correção guardada, com a nota (Manual, cap. 9)
--   vm_artigo_correcao_descartar(id)                joga fora a correção guardada
-- A Redação nova (v151) usa essas funções. Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): coluna | funcoes
--                               true   | 3

alter table public.vm_artigos add column if not exists correcao_pendente jsonb;

create or replace function public.vm_artigo_correcao_salvar(p_id bigint, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare a public.vm_artigos;
begin
  perform public._vm_exige_editor();
  if not public.vm_corpo_valido(coalesce(p_dados->'corpo', '[]'::jsonb)) then raise exception 'CORPO_INVALIDO' using errcode = '22023'; end if;
  if not public.vm_fontes_validas(p_dados->'fontes') then raise exception 'FONTES_INVALIDAS' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_dados->>'titulo', 'x'))) not between 1 and 90 then raise exception 'TITULO_INVALIDO' using errcode = '22023'; end if;
  select * into a from public.vm_artigos where id = p_id for update;
  if not found or a.situacao <> 'publicado' then raise exception 'SITUACAO_INVALIDA' using errcode = '22023'; end if;
  update public.vm_artigos set correcao_pendente = jsonb_build_object(
      'dados', jsonb_build_object('titulo', p_dados->'titulo', 'linha_fina', p_dados->'linha_fina', 'corpo', p_dados->'corpo', 'fontes', p_dados->'fontes'),
      'salvo_em', now(), 'salvo_por', auth.uid())
   where id = p_id;
  return jsonb_build_object('id', p_id, 'correcao_guardada', true, 'publicada', false);
end $$;

create or replace function public.vm_artigo_correcao_publicar(p_id bigint, p_o_que text, p_versao_anterior_informava text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_pend jsonb; r jsonb;
begin
  perform public._vm_exige_editor();
  select correcao_pendente into v_pend from public.vm_artigos where id = p_id for update;
  if v_pend is null or v_pend->'dados' is null then raise exception 'SEM_CORRECAO_GUARDADA' using errcode = '22023'; end if;
  r := public.vm_artigo_corrigir(p_id, v_pend->'dados', p_o_que, p_versao_anterior_informava);
  update public.vm_artigos set correcao_pendente = null where id = p_id;
  return r || jsonb_build_object('publicada', true);
end $$;

create or replace function public.vm_artigo_correcao_descartar(p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform public._vm_exige_editor();
  update public.vm_artigos set correcao_pendente = null where id = p_id;
  return jsonb_build_object('id', p_id, 'descartada', true);
end $$;

revoke all on function public.vm_artigo_correcao_salvar(bigint, jsonb), public.vm_artigo_correcao_publicar(bigint, text, text),
                       public.vm_artigo_correcao_descartar(bigint) from public, anon;
grant execute on function public.vm_artigo_correcao_salvar(bigint, jsonb), public.vm_artigo_correcao_publicar(bigint, text, text),
                          public.vm_artigo_correcao_descartar(bigint) to authenticated;

notify pgrst, 'reload schema';

select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vm_artigos'
                and column_name = 'correcao_pendente') as coluna,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
         and proname in ('vm_artigo_correcao_salvar', 'vm_artigo_correcao_publicar', 'vm_artigo_correcao_descartar')) as funcoes;
