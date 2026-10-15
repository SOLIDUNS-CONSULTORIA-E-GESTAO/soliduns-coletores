-- 141_vm_scanner_por_data.sql — Valor e Mercado: Scanner do Dia por data (página de leitura compartilhável, v125)
-- Pedido do Thiago (15/10/2026 11h33): cada Scanner com data e página própria para divulgar no WhatsApp e no Telegram.
-- Leitura PÚBLICA (anon), só do texto já PUBLICADO. Rodar DEPOIS das migrations 138 e 139.

-- o Scanner publicado de um dia (o mesmo formato de vm_scanner_publico)
create or replace function public.vm_scanner_publico_data(p_data date)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce((
    select jsonb_build_object('id', m.id, 'data', m.data_ref, 'texto', m.texto_aprovado, 'fontes', m.fontes,
                              'publicado_em', m.aprovado_em)
      from public.vm_materias m
     where m.tipo = 'scanner' and m.situacao = 'publicada' and m.data_ref = p_data
     order by m.aprovado_em desc limit 1), '{}'::jsonb);
$$;
revoke all on function public.vm_scanner_publico_data(date) from public;
grant execute on function public.vm_scanner_publico_data(date) to anon, authenticated;

-- lista dos Scanners publicados (um por dia, do mais novo para o mais antigo): data e título
create or replace function public.vm_scanner_lista(p_limite integer default 30)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('data', x.data_ref, 'titulo', x.titulo) order by x.data_ref desc), '[]'::jsonb)
    from (select distinct on (m.data_ref) m.data_ref, m.texto_aprovado->>'titulo' as titulo
            from public.vm_materias m
           where m.tipo = 'scanner' and m.situacao = 'publicada'
           order by m.data_ref desc, m.aprovado_em desc
           limit least(greatest(coalesce(p_limite, 30), 1), 120)) x;
$$;
revoke all on function public.vm_scanner_lista(integer) from public;
grant execute on function public.vm_scanner_lista(integer) to anon, authenticated;

-- conferência: esperado 1 linha com o título do Scanner de hoje e a quantidade de Scanners publicados
select public.vm_scanner_publico_data((now() at time zone 'America/Sao_Paulo')::date)->'texto'->>'titulo' as scanner_de_hoje,
       jsonb_array_length(public.vm_scanner_lista(30)) as scanners_publicados;
