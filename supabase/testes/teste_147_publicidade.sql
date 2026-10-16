\pset tuples_only on
set t.uid = '11111111-1111-1111-1111-111111111111'; set t.editor = 'sim';
select 'banner: ' || public.vm_banner_salvar(null, 'lateral', 'https://x.supabase.co/a.png', 'https://anunciante.com.br', 'Banco X', current_date - 1, current_date + 30, true, null, 'Banco X')::text;
select 'banner topo: ' || public.vm_banner_salvar(null, 'topo', 'https://x.supabase.co/b.png', 'https://anunciante.com.br', 'Banco Y', current_date, current_date + 5)::text;
select 'espaço inválido: ' || public.vm_banner_salvar(null, 'popup', 'https://x/a.png', 'https://a.com', 'abc', current_date, current_date)::text;
select 'link js: ' || public.vm_banner_salvar(null, 'lateral', 'https://x/a.png', 'javascript:alert(1)', 'abc', current_date, current_date)::text;
set role anon; select 'publico: ' || public.vm_banners_publicos()::text; reset role;
select 'liga topo: ' || public.vm_espaco_publicidade_ligar('topo', true)::text;
set role anon; select 'publico tem topo: ' || (public.vm_banners_publicos() ? 'topo')::text; reset role;
select 'evento: ' || acao from public.vm_eventos_redacao where item_tipo = 'vm_publicidade_espacos';
set t.editor = 'nao'; select 'nao-editor: ' || public.vm_espaco_publicidade_ligar('topo', false)::text;
