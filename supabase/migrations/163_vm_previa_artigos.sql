-- SQL 163 — SOLIDUNS / Valor e Mercado — PRÉVIA DO LINK DOS ARTIGOS + PROTEÇÃO DOS ARTIGOS (19/10/2026)
--
-- Pedido do Thiago (19/10 01h06):
--   1. O link https://soliduns.com.br/noticias/?artigo=53 compartilhado no WhatsApp/Telegram não mostra a foto do artigo.
--      Causa: a página /noticias/ é fixa (sempre a imagem do jornal) e o WhatsApp não roda o código do site.
--      Correção: public.vm_previa(p_artigo) monta a página de passagem DAQUELE artigo (título, linha fina e foto de capa)
--      e leva o leitor na hora para o artigo. Na v150, o Netlify passa a buscar essa página quando o link tiver ?artigo=.
--   2. "As próximas versões não devem apagar os artigos que eu mesmo escrevi." Os artigos e as fotos ficam no banco e no
--      Storage do Supabase, fora do pacote do site: o deploy nunca encosta neles. Para garantir, esta SQL BLOQUEIA o
--      DELETE na tabela de artigos (nem migration, nem robô, nem engano apagam). Tirar do ar continua sendo "Despublicar".
--
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): previa_ok | protecao | artigos
--                               true      | true     | <nº de artigos>

-- ------------------------------------------------------------ 1. página de prévia (resposta em HTML)
-- O tipo "*/*" faz o servidor de dados responder a qualquer pedido (WhatsApp, Telegram, navegador) com o HTML abaixo.
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = '*/*') then
    create domain public."*/*" as bytea;
  end if;
end $$;

create or replace function public._vm_html(t text) returns text
language sql immutable set search_path to '' as $$
  select replace(replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

create or replace function public.vm_previa(p_artigo bigint) returns public."*/*"
language plpgsql stable security definer set search_path to '' as $$
declare
  a public.vm_artigos%rowtype;
  achou boolean;
  tit text; des text; img text; alt text; url text; destino text; h text;
begin
  select * into a from public.vm_artigos where id = p_artigo and situacao = 'publicado';
  achou := found;
  if achou then
    tit := coalesce(nullif(btrim(a.seo_titulo), ''), a.titulo);
    des := coalesce(nullif(btrim(a.seo_descricao), ''), nullif(btrim(a.linha_fina), ''), 'Valor e Mercado, o jornal da SOLIDUNS.');
    img := case when coalesce(a.foto->>'src', '') like 'https://%' then a.foto->>'src' else 'https://soliduns.com.br/og-valor-e-mercado.jpg' end;
    alt := coalesce(nullif(btrim(a.foto->>'alt'), ''), tit);
    url := 'https://soliduns.com.br/noticias/?artigo=' || a.id;
    destino := '/#/noticias/artigo/' || a.id;
  else
    tit := 'Valor e Mercado | Conteúdo e notícias';
    des := 'Scanner do Dia, agenda e indicadores do mercado: o jornal Valor e Mercado, da SOLIDUNS.';
    img := 'https://soliduns.com.br/og-valor-e-mercado.jpg';
    alt := 'Valor e Mercado — Conteúdo e notícias';
    url := 'https://soliduns.com.br/noticias/';
    destino := '/#/noticias';
  end if;

  h := '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
    || '<title>' || public._vm_html(tit) || ' | Valor e Mercado</title>'
    || '<meta name="viewport" content="width=device-width, initial-scale=1">'
    || '<meta name="description" content="' || public._vm_html(des) || '">'
    || '<meta property="og:type" content="article">'
    || '<meta property="og:site_name" content="Valor e Mercado · SOLIDUNS">'
    || '<meta property="og:locale" content="pt_BR">'
    || '<meta property="og:url" content="' || public._vm_html(url) || '">'
    || '<meta property="og:title" content="' || public._vm_html(tit) || '">'
    || '<meta property="og:description" content="' || public._vm_html(des) || '">'
    || '<meta property="og:image" content="' || public._vm_html(img) || '">'
    || '<meta property="og:image:secure_url" content="' || public._vm_html(img) || '">'
    || '<meta property="og:image:alt" content="' || public._vm_html(alt) || '">'
    || '<meta name="twitter:card" content="summary_large_image">'
    || '<meta name="twitter:title" content="' || public._vm_html(tit) || '">'
    || '<meta name="twitter:description" content="' || public._vm_html(des) || '">'
    || '<meta name="twitter:image" content="' || public._vm_html(img) || '">'
    || '<meta name="robots" content="noindex, follow">'
    || '<link rel="canonical" href="' || public._vm_html(url) || '">'
    || '<script>location.replace("https://soliduns.com.br' || destino || '");</script>'
    || '<style>body{margin:0;background:#414A38;color:#F5F2E7;font:16px/1.5 system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}a{color:#E4D79B}</style>'
    || '</head><body><p>Abrindo o jornal <a href="https://soliduns.com.br' || destino || '">Valor e Mercado</a>…</p></body></html>';

  perform set_config('response.headers',
    json_build_array(json_build_object('Content-Type', 'text/html; charset=utf-8'),
                     json_build_object('Cache-Control', 'public, max-age=300'))::text, true);
  return convert_to(h, 'UTF8');
end $$;

revoke all on function public.vm_previa(bigint) from public;
grant execute on function public.vm_previa(bigint) to anon, authenticated;
revoke all on function public._vm_html(text) from public;
grant execute on function public._vm_html(text) to anon, authenticated;

-- ------------------------------------------------------------ 2. proteção: artigo não se apaga
create or replace function public._vm_artigos_nao_apagar() returns trigger
language plpgsql set search_path to '' as $$
begin
  raise exception 'Artigos do Valor e Mercado não podem ser apagados. Para tirar do ar, use "Despublicar" na Redação.'
    using errcode = 'P0001';
end $$;

drop trigger if exists vm_artigos_nao_apagar on public.vm_artigos;
create trigger vm_artigos_nao_apagar before delete on public.vm_artigos
  for each row execute function public._vm_artigos_nao_apagar();

drop trigger if exists vm_artigos_nao_esvaziar on public.vm_artigos;
create trigger vm_artigos_nao_esvaziar before truncate on public.vm_artigos
  for each statement execute function public._vm_artigos_nao_apagar();

-- PostgREST relê as funções novas
notify pgrst, 'reload schema';

-- ------------------------------------------------------------ conferência
select exists (select 1 from pg_proc where proname = 'vm_previa' and pronamespace = 'public'::regnamespace) as previa_ok,
       (select count(*) = 2 from pg_trigger where tgrelid = 'public.vm_artigos'::regclass
         and tgname in ('vm_artigos_nao_apagar', 'vm_artigos_nao_esvaziar')) as protecao,
       (select count(*) from public.vm_artigos) as artigos;
