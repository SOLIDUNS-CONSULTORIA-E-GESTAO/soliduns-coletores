-- SQL 175 — SOLIDUNS / Valor e Mercado — PRÉVIA DA MANCHETE NO WHATSAPP (20/10/2026)
-- Pedido do Thiago (20/10 16h31): "não está abrindo a previsualização da manchete".
-- Agora o link do jornal sem número de artigo — https://soliduns.com.br/noticias/ — mostra no WhatsApp e no Telegram
-- a FOTO, o TÍTULO e a LINHA FINA da manchete do dia (a do robô ou o artigo que você pôs na capa) e abre o jornal.
-- Links de artigo (?artigo=N) seguem iguais. Sem manchete publicada: a imagem padrão do Valor e Mercado.
-- Precisa também da v156 do site (o Netlify passa a pedir esta prévia para /noticias/ sem artigo).
-- Onde colar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Resultado esperado (1 linha): previa_ok | titulo_da_manchete
--                               true      | (título da manchete de hoje)

create or replace function public.vm_previa(p_artigo bigint) returns public."*/*"
language plpgsql stable security definer set search_path to '' as $$
declare
  a public.vm_artigos%rowtype;
  achou boolean;
  m jsonb;
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
  elsif coalesce(p_artigo, 0) = 0
        and (public.vm_edicao_publica() #>> '{conteudo,manchete,titulo}') is not null then
    -- v175: link do jornal sem artigo (https://soliduns.com.br/noticias/) = prévia da MANCHETE do dia
    m := public.vm_edicao_publica() #> '{conteudo,manchete}';
    tit := m->>'titulo';
    des := coalesce(nullif(btrim(m->>'linha_fina'), ''), 'Valor e Mercado, o jornal da SOLIDUNS.');
    img := case when coalesce(m #>> '{foto,src}', '') like 'https://%' then m #>> '{foto,src}' else 'https://soliduns.com.br/og-valor-e-mercado.jpg' end;
    alt := coalesce(nullif(btrim(m #>> '{foto,alt}'), ''), tit);
    url := 'https://soliduns.com.br/noticias/';
    destino := '/#/noticias';
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
revoke all on function public.vm_previa(bigint) from public;
grant execute on function public.vm_previa(bigint) to anon, authenticated;
notify pgrst, 'reload schema';

select exists (select 1 from pg_proc where proname = 'vm_previa' and pronamespace = 'public'::regnamespace) as previa_ok,
       public.vm_edicao_publica() #>> '{conteudo,manchete,titulo}' as titulo_da_manchete;
