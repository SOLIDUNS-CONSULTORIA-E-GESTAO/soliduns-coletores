\set ON_ERROR_STOP off
\pset tuples_only on
set t.uid = '11111111-1111-1111-1111-111111111111';
-- 1) não-editor
set t.editor = 'nao';
select 'nao-editor salvar: ' || coalesce((select (public.vm_artigo_salvar(null, '{"titulo":"x"}'))::text), '?');
-- 2) editor cria
set t.editor = 'sim';
select 'criou: ' || public.vm_artigo_salvar(null, '{"titulo":"Copom mantém a Selic","linha_fina":"x","corpo":[{"tipo":"paragrafo","conteudo":[{"marca":"negrito","conteudo":[{"texto":"Selic"}]},{"texto":" em 13,75%"},{"marca":"link","url":"https://www.bcb.gov.br","conteudo":[{"texto":"BC"}]},{"marca":"fonte","valor":"jost","conteudo":[{"texto":"j"}]}]}],"tags":["Juros","Copom"]}')::text;
-- 3) corpo malicioso
select 'link js: ' || public.vm_artigo_salvar(null, '{"titulo":"t","corpo":[{"tipo":"paragrafo","conteudo":[{"marca":"link","url":"javascript:alert(1)","conteudo":[{"texto":"x"}]}]}]}')::text;
select 'tag html: ' || public.vm_artigo_salvar(null, '{"titulo":"t","corpo":[{"tipo":"paragrafo","conteudo":[{"marca":"script","conteudo":[{"texto":"x"}]}]}]}')::text;
select 'campo extra: ' || public.vm_artigo_salvar(null, '{"titulo":"t","corpo":[{"tipo":"paragrafo","onclick":"x","conteudo":[]}]}')::text;
select 'fonte livre: ' || public.vm_artigo_salvar(null, '{"titulo":"t","corpo":[{"tipo":"paragrafo","conteudo":[{"marca":"fonte","valor":"Comic Sans","conteudo":[{"texto":"x"}]}]}]}')::text;
-- 4) público não vê rascunho
reset role; set role anon;
select 'publico antes: ' || public.vm_artigos_publicos()::text;
select 'anon lê tabela: ' || (select count(*) from public.vm_artigos)::text;
reset role;
-- 5) publicar e agendar
select 'publicou: ' || public.vm_artigo_publicar(1)::text;
set role anon; select 'publico depois: ' || jsonb_array_length(public.vm_artigos_publicos()); select 'artigo publico tem corpo: ' || (public.vm_artigo_publico(1) ? 'corpo')::text; reset role;
select 'salvar publicado: ' || public.vm_artigo_salvar(1, '{"titulo":"mudou"}')::text;
select 'corrigir: ' || public.vm_artigo_corrigir(1, '{"titulo":"Copom mantém a Selic em 13,75%"}', 'o valor da Selic', '13,50%')::text;
select 'versoes: ' || count(*) from public.vm_artigos_versoes;
select 'novo p/ agendar: ' || public.vm_artigo_salvar(null, '{"titulo":"Agendado","corpo":[{"tipo":"paragrafo","conteudo":[{"texto":"a"}]}]}')::text;
select 'agendou: ' || public.vm_artigo_publicar(2, now() + interval '1 hour')::text;
update public.vm_artigos set publicar_em = now() - interval '1 minute' where id = 2;
select 'cron publicou: ' || public.vm_publicar_agendados();
select 'despublicar sem motivo: ' || public.vm_artigo_despublicar(2, '')::text;
select 'despublicou: ' || public.vm_artigo_despublicar(2, 'Teste de retirada')::text;
-- 6) layout
select 'layout ok: ' || public.vm_layout_salvar('{"versao":0,"blocos":[{"tipo":"artigos","ativo":true,"destaques":[1]},{"tipo":"manchete","ativo":true}]}')::text;
select 'layout bloco estranho: ' || public.vm_layout_salvar('{"versao":0,"blocos":[{"tipo":"iframe","ativo":true}]}')::text;
select 'layout repetido: ' || public.vm_layout_salvar('{"versao":0,"blocos":[{"tipo":"manchete","ativo":true},{"tipo":"manchete","ativo":false}]}')::text;
set role anon; select 'layout publico: ' || public.vm_layout_publico()::text; reset role;
select 'voltar v1: ' || public.vm_layout_voltar(1)::text;
-- 7) mídia
select 'midia sem arquivo: ' || public.vm_midia_registrar('2026/10/abcdef0123456789.jpg','image/jpeg',1000,10,10,'alt','Ana','Foto própria')::text;
insert into storage.objects (bucket_id, name) values ('vm-imagens', '2026/10/abcdef0123456789.jpg');
select 'midia ok: ' || public.vm_midia_registrar('2026/10/abcdef0123456789.jpg','image/jpeg',1000,10,10,'alt','Ana','Foto própria')::text;
select 'midia exe: ' || public.vm_midia_registrar('2026/10/abcdef0123456789.exe','application/x-msdownload',1000,10,10,'alt','Ana','Foto própria')::text;
-- 8) auditoria e editor-only
select 'eventos: ' || jsonb_array_length(public.vm_eventos_lista());
select 'acoes: ' || string_agg(distinct acao, ', ') from public.vm_eventos_redacao;
set t.editor = 'nao';
select 'nao-editor publicar: ' || public.vm_artigo_publicar(1)::text;
select 'nao-editor eventos: ' || public.vm_eventos_lista()::text;
select 'nao-editor layout: ' || public.vm_layout_salvar('{"versao":0,"blocos":[]}')::text;
