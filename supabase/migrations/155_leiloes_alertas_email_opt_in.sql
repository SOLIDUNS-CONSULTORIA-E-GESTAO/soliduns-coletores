-- 155_leiloes_alertas_email_opt_in.sql — e-mail de alertas só para quem ATIVAR no "Meu perfil de imóvel"
-- Decisão do Thiago (16/10/2026 21h50): "pode enviar e-mail de alerta, mas o usuário precisa ativar essa função
-- dentro do seu perfil de investir ou morar". Começa DESLIGADO para todos (inclusive quem já tinha alertas).
-- Rodar no SQL Editor. Não mexe no agendamento (leiloes-alertas, 07h40) nem na chave do Resend.

-- 1. A opção (fica na tabela que já guarda o controle de envio de cada pessoa)
alter table public.leiloes_alertas_usuarios add column if not exists email_ativo boolean not null default false;
alter table public.leiloes_alertas_usuarios add column if not exists email_ativo_em timestamptz;

-- 2. Ligar/desligar pela própria pessoa (site) e consultar
create or replace function public.leiloes_alertas_email_definir(p_ativo boolean)
returns boolean language plpgsql security definer set search_path to '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'faça login' using errcode = '42501'; end if;
  insert into public.leiloes_alertas_usuarios as x (user_id, ultimo_corte, email_ativo, email_ativo_em)
  values (uid, now(), coalesce(p_ativo, false), now())
  on conflict (user_id) do update
     set email_ativo = coalesce(p_ativo, false), email_ativo_em = now(),
         ultimo_corte = case when coalesce(p_ativo, false) and not x.email_ativo then now() else x.ultimo_corte end;
  return coalesce(p_ativo, false);
end $$;
create or replace function public.leiloes_alertas_email_status()
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((select x.email_ativo from public.leiloes_alertas_usuarios x where x.user_id = auth.uid()), false);
$$;
revoke all on function public.leiloes_alertas_email_definir(boolean) from public, anon;
revoke all on function public.leiloes_alertas_email_status() from public, anon;
grant execute on function public.leiloes_alertas_email_definir(boolean) to authenticated;
grant execute on function public.leiloes_alertas_email_status() to authenticated;

-- 3. O envio diário passa a pular quem não ativou
CREATE OR REPLACE FUNCTION public.leiloes_alertas_enviar(p_teto integer DEFAULT 60)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  inicio timestamptz := now();
  u record; it record;
  chave text; enviados integer := 0; sem_novidade integer := 0; adiados integer := 0; desligados integer := 0;
  n integer; nf integer; nv integer; nvf integer; html text; linhas text; linhas_f text; linhas_v text; linhas_vf text; pedido bigint; assunto text;
  desde_fav timestamptz;
begin
  select s.decrypted_secret into chave from vault.decrypted_secrets s where s.name = 'resend_aprovacao';
  if chave is null or length(chave) < 20 then
    return 'SEM CHAVE do Resend no Vault (resend_aprovacao) — nada enviado';
  end if;
  for u in
    with pessoas as (
      select a.user_id from public.leiloes_alertas a where a.ativo
      union
      select f.user_id from public.leiloes_favoritos f
      union
      select va.user_id from public.veiculos_alertas va where va.ativo
      union
      select vf.user_id from public.veiculos_favoritos vf
    )
    select p.user_id, au.email, x.ultimo_corte, x.ultimo_envio, coalesce(x.aviso_favoritos, true) as aviso_favoritos,
           coalesce(x.email_ativo, false) as email_ativo
      from pessoas p
      join auth.users au on au.id = p.user_id
      left join public.leiloes_alertas_usuarios x on x.user_id = p.user_id
     where au.email is not null
     order by x.ultimo_envio nulls first, p.user_id
  loop
    -- a pessoa ainda pode ver a área de leilões?
    perform set_config('request.jwt.claim.sub', u.user_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', u.user_id, 'role', 'authenticated')::text, true);
    if not (public.eh_admin() or edu.eh_admin() or (edu.eh_aprovado() and public.tem_area('leiloes'))) then
      continue;
    end if;

    -- SQL 155: só recebe quem ATIVOU o e-mail no "Meu perfil de imóvel" (Para morar / Para investir).
    -- Quem não ativou tem o corte avançado, para não receber o acumulado quando ativar.
    if not u.email_ativo then
      desligados := desligados + 1;
      insert into public.leiloes_alertas_usuarios as x (user_id, ultimo_corte) values (u.user_id, inicio)
        on conflict (user_id) do update set ultimo_corte = inicio;
      continue;
    end if;

    -- (1) imóveis novos dos alertas ativos (sem repetir), no máximo 20
    linhas := ''; n := 0;
    for it in
      select distinct on (i.chave) i.*
        from public.leiloes_alertas a,
             lateral public.leiloes_alertas_itens(a.filtros, greatest(a.criado_em, coalesce(u.ultimo_corte, a.criado_em))) i
       where a.user_id = u.user_id and a.ativo
       order by i.chave
    loop
      n := n + 1;
      if n <= 20 then
        linhas := linhas || '<tr><td style="padding:10px 0;border-bottom:1px solid #2e2a1e;">'
          || '<div style="color:#eec617;font-size:11px;letter-spacing:.08em;text-transform:uppercase;">'
          || replace(replace(coalesce(it.fonte, ''), '<', '&lt;'), '>', '&gt;')
          || coalesce(' · ' || it.modalidade, '') || '</div>'
          || '<div style="color:#f2ecd8;font-size:15px;font-weight:bold;margin:2px 0;">'
          || replace(replace(it.titulo, '<', '&lt;'), '>', '&gt;') || ' — ' || replace(replace(coalesce(it.local, ''), '<', '&lt;'), '>', '&gt;') || '</div>'
          || '<div style="color:#a89f88;font-size:13px;">'
          || coalesce('R$ ' || translate(to_char(it.preco, 'FM999,999,999,990.00'), ',.', '.,'), 'Valor não informado')
          || coalesce(' · desconto de ' || replace(to_char(it.desconto, 'FM990.0'), '.', ',') || '%', '')
          || coalesce(' · praça em ' || to_char(it.praca, 'DD/MM/YYYY'), '') || '</div></td></tr>';
      end if;
    end loop;

    -- (2) favoritos cujo preço CAIU desde o último aviso (no 1º aviso: últimas 24 h), no máximo 20
    linhas_f := ''; nf := 0;
    if u.aviso_favoritos then
      desde_fav := coalesce(u.ultimo_corte, inicio - interval '1 day');
      for it in
        select r.id, r.tipo, r.cidade, r.uf, r.bairro, r.preco, r.preco_anterior, r.preco_inicial,
               case when r.fonte = 'djen' then 'Diário de Justiça · ' || coalesce(r.tribunal, '') else 'Caixa' end as fonte
          from public.leiloes_favoritos f
          join public.leiloes_radar r on f.item_id = 'radar-' || r.id
         where f.user_id = u.user_id and r.situacao = 'ativo'
           and r.preco_mudou_em > desde_fav and r.preco_anterior is not null and r.preco < r.preco_anterior
           and not exists (select 1 from public.leiloes_ocultos o where o.item_id = f.item_id)
         order by (r.preco / r.preco_anterior) asc
      loop
        nf := nf + 1;
        if nf <= 20 then
          linhas_f := linhas_f || '<tr><td style="padding:10px 0;border-bottom:1px solid #2e2a1e;">'
            || '<div style="color:#eec617;font-size:11px;letter-spacing:.08em;text-transform:uppercase;">'
            || replace(replace(it.fonte, '<', '&lt;'), '>', '&gt;') || '</div>'
            || '<div style="color:#f2ecd8;font-size:15px;font-weight:bold;margin:2px 0;">'
            || replace(replace(initcap(replace(coalesce(it.tipo, 'imóvel'), '_', ' ')), '<', '&lt;'), '>', '&gt;') || ' — '
            || replace(replace(concat_ws(' · ', nullif(it.bairro, ''), nullif(it.cidade, '') || '/' || it.uf), '<', '&lt;'), '>', '&gt;') || '</div>'
            || '<div style="color:#a89f88;font-size:13px;">de R$ ' || translate(to_char(it.preco_anterior, 'FM999,999,999,990.00'), ',.', '.,')
            || ' para <b style="color:#4fb3a9;">R$ ' || translate(to_char(it.preco, 'FM999,999,999,990.00'), ',.', '.,') || '</b>'
            || ' (−' || replace(to_char((1 - it.preco / it.preco_anterior) * 100, 'FM990.0'), '.', ',') || '%)'
            || case when it.preco_inicial is not null and it.preco_inicial > it.preco_anterior
                    then ' · −' || replace(to_char((1 - it.preco / it.preco_inicial) * 100, 'FM990.0'), '.', ',') || '% desde a entrada no Radar' else '' end
            || '</div></td></tr>';
        end if;
      end loop;
    end if;

    -- (3) v90: veículos novos dos alertas de veículos (sem repetir), no máximo 20
    linhas_v := ''; nv := 0;
    for it in
      select distinct on (i.chave) i.*
        from public.veiculos_alertas a,
             lateral public.veiculos_alertas_itens(a.filtros, greatest(a.criado_em, coalesce(u.ultimo_corte, a.criado_em))) i
       where a.user_id = u.user_id and a.ativo
       order by i.chave
    loop
      nv := nv + 1;
      if nv <= 20 then
        linhas_v := linhas_v || '<tr><td style="padding:10px 0;border-bottom:1px solid #2e2a1e;">'
          || '<div style="color:#eec617;font-size:11px;letter-spacing:.08em;text-transform:uppercase;">'
          || replace(replace(coalesce(it.fonte_txt, ''), '<', '&lt;'), '>', '&gt;')
          || coalesce(' · ' || replace(it.modalidade, '_', ' '), '') || '</div>'
          || '<div style="color:#f2ecd8;font-size:15px;font-weight:bold;margin:2px 0;">'
          || replace(replace(it.titulo, '<', '&lt;'), '>', '&gt;')
          || coalesce(' — ' || replace(replace(nullif(it.local_txt, ''), '<', '&lt;'), '>', '&gt;'), '') || '</div>'
          || '<div style="color:#a89f88;font-size:13px;">'
          || coalesce('Lance inicial R$ ' || translate(to_char(it.preco, 'FM999,999,999,990.00'), ',.', '.,'), 'Lance não informado')
          || coalesce(' · ' || replace(to_char(it.desagio, 'FM990.0'), '.', ',') || '% abaixo da FIPE', '')
          || coalesce(' · leilão em ' || to_char(it.data_leilao, 'DD/MM/YYYY'), '') || '</div></td></tr>';
      end if;
    end loop;

    -- (4) v96: veículos favoritos cujo LANCE caiu desde o último aviso (1º aviso: últimas 24 h), no máximo 20
    linhas_vf := ''; nvf := 0;
    if u.aviso_favoritos then
      desde_fav := coalesce(u.ultimo_corte, inicio - interval '1 day');
      for it in
        select v.id, v.titulo, v.cidade, v.uf, v.lance_inicial, v.lance_anterior,
               case when v.fonte = 'djen' then 'Diário de Justiça · ' || coalesce(v.origem_nome, '')
                    when v.fonte = 'banco' then coalesce(v.origem_nome, 'Banco') || ' · retomado'
                    else coalesce(v.origem_nome, 'Leiloeiro') end as fonte_txt
          from public.veiculos_favoritos f
          join public.veiculos_leiloes v on f.item_id = v.id
         where f.user_id = u.user_id and v.situacao = 'ativo'
           and v.lance_mudou_em > desde_fav and v.lance_anterior is not null and v.lance_inicial < v.lance_anterior
           and not exists (select 1 from public.leiloes_ocultos o where o.item_id = v.id)
         order by (v.lance_inicial / v.lance_anterior) asc
      loop
        nvf := nvf + 1;
        if nvf <= 20 then
          linhas_vf := linhas_vf || '<tr><td style="padding:10px 0;border-bottom:1px solid #2e2a1e;">'
            || '<div style="color:#eec617;font-size:11px;letter-spacing:.08em;text-transform:uppercase;">'
            || replace(replace(it.fonte_txt, '<', '&lt;'), '>', '&gt;') || '</div>'
            || '<div style="color:#f2ecd8;font-size:15px;font-weight:bold;margin:2px 0;">'
            || replace(replace(coalesce(it.titulo, 'Veículo'), '<', '&lt;'), '>', '&gt;')
            || coalesce(' — ' || replace(replace(nullif(it.cidade, '') || '/' || it.uf, '<', '&lt;'), '>', '&gt;'), coalesce(' — ' || it.uf, '')) || '</div>'
            || '<div style="color:#a89f88;font-size:13px;">de R$ ' || translate(to_char(it.lance_anterior, 'FM999,999,999,990.00'), ',.', '.,')
            || ' para <b style="color:#4fb3a9;">R$ ' || translate(to_char(it.lance_inicial, 'FM999,999,999,990.00'), ',.', '.,') || '</b>'
            || ' (−' || replace(to_char((1 - it.lance_inicial / it.lance_anterior) * 100, 'FM990.0'), '.', ',') || '%)'
            || '</div></td></tr>';
        end if;
      end loop;
    end if;

    if n = 0 and nf = 0 and nv = 0 and nvf = 0 then
      sem_novidade := sem_novidade + 1;
      insert into public.leiloes_alertas_usuarios as x (user_id, ultimo_corte) values (u.user_id, inicio)
        on conflict (user_id) do update set ultimo_corte = inicio;
      continue;
    end if;
    if enviados >= p_teto then
      adiados := adiados + 1;                  -- fica para amanhã (corte não avança)
      continue;
    end if;
    assunto := 'SOLIDUNS · ' || concat_ws(' e ',
                 case when n > 0 then n || ' imóvel(is) novo(s) nos seus alertas' end,
                 case when nf > 0 then nf || ' favorito(s) com preço menor' end,
                 case when nv > 0 then nv || ' veículo(s) novo(s) nos seus alertas' end,
                 case when nvf > 0 then nvf || ' veículo(s) favorito(s) com lance menor' end);
    html := '<div style="background:#000;padding:24px;font-family:Arial,sans-serif;">'
      || '<div style="max-width:600px;margin:0 auto;background:#0d0d0c;border:1px solid #2e2a1e;padding:24px;">'
      || '<div style="color:#eec617;font-size:20px;font-weight:bold;letter-spacing:.12em;">SOLIDUNS</div>'
      || case when n > 0 then
           '<div style="color:#f2ecd8;font-size:16px;margin:10px 0 4px;">Seus alertas de leilão: ' || n || ' imóvel(is) novo(s)</div>'
           || '<div style="color:#a89f88;font-size:12px;margin-bottom:10px;">Imóveis que entraram na plataforma desde o último aviso e combinam com os seus alertas.</div>'
           || '<table style="width:100%;border-collapse:collapse;">' || linhas || '</table>'
           || case when n > 20 then '<div style="color:#a89f88;font-size:12px;margin-top:8px;">… e mais ' || (n - 20) || ' na plataforma.</div>' else '' end
         else '' end
      || case when nf > 0 then
           '<div style="color:#f2ecd8;font-size:16px;margin:' || case when n > 0 then '22' else '10' end || 'px 0 4px;">Seus favoritos que baixaram de preço: ' || nf || '</div>'
           || '<div style="color:#a89f88;font-size:12px;margin-bottom:10px;">Imóveis que você marcou com ☆ e tiveram o preço reduzido desde o último aviso.</div>'
           || '<table style="width:100%;border-collapse:collapse;">' || linhas_f || '</table>'
           || case when nf > 20 then '<div style="color:#a89f88;font-size:12px;margin-top:8px;">… e mais ' || (nf - 20) || ' na plataforma.</div>' else '' end
         else '' end
      || case when nv > 0 then
           '<div style="color:#f2ecd8;font-size:16px;margin:' || case when n > 0 or nf > 0 then '22' else '10' end || 'px 0 4px;">Seus alertas de veículos: ' || nv || ' novo(s)</div>'
           || '<div style="color:#a89f88;font-size:12px;margin-bottom:10px;">Veículos que entraram no Leilão de Automóveis desde o último aviso e combinam com os seus alertas.</div>'
           || '<table style="width:100%;border-collapse:collapse;">' || linhas_v || '</table>'
           || case when nv > 20 then '<div style="color:#a89f88;font-size:12px;margin-top:8px;">… e mais ' || (nv - 20) || ' na plataforma.</div>' else '' end
         else '' end
      || case when nvf > 0 then
           '<div style="color:#f2ecd8;font-size:16px;margin:' || case when n > 0 or nf > 0 or nv > 0 then '22' else '10' end || 'px 0 4px;">Seus veículos favoritos que baixaram de lance: ' || nvf || '</div>'
           || '<div style="color:#a89f88;font-size:12px;margin-bottom:10px;">Veículos que você marcou com ☆ e tiveram o lance inicial reduzido desde o último aviso.</div>'
           || '<table style="width:100%;border-collapse:collapse;">' || linhas_vf || '</table>'
           || case when nvf > 20 then '<div style="color:#a89f88;font-size:12px;margin-top:8px;">… e mais ' || (nvf - 20) || ' na plataforma.</div>' else '' end
         else '' end
      || '<div style="margin:20px 0;"><a href="https://soliduns.com.br/#/leilao" '
      || 'style="background:#eec617;color:#0a0a0a;padding:12px 22px;text-decoration:none;font-weight:bold;">Ver na SOLIDUNS</a></div>'
      || '<div style="color:#a89f88;font-size:11px;line-height:1.6;">Dados objetivos coletados automaticamente (lista oficial da Caixa, editais do Diário de Justiça e anúncios dos leiloeiros), '
      || 'sem análise, exceto os marcados "Analisado SOLIDUNS". Não é recomendação de compra nem oferta. '
      || 'Para parar de receber estes e-mails: Leilão de Imóveis &gt; Meu perfil de imóvel &gt; desligue "Receber alertas por e-mail". Para pausar ou apagar os alertas: Meus alertas. '
      || 'Para não receber os avisos de queda de preço dos favoritos, responda a este e-mail.</div>'
      || '</div></div>';
    select net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || chave, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', 'SOLIDUNS <nao-responda@soliduns.com.br>',
        'to', jsonb_build_array(u.email),
        'reply_to', 'contato@soliduns.com.br',
        'subject', assunto,
        'html', html)
    ) into pedido;
    insert into public.leiloes_alertas_envios (user_id, itens, pedido_http) values (u.user_id, n + nf + nv + nvf, pedido);
    insert into public.leiloes_alertas_usuarios as x (user_id, ultimo_corte, ultimo_envio, total_envios)
      values (u.user_id, inicio, inicio, 1)
      on conflict (user_id) do update set ultimo_corte = inicio, ultimo_envio = inicio, total_envios = x.total_envios + 1;
    enviados := enviados + 1;
  end loop;
  return enviados || ' e-mail(s) enviado(s); ' || sem_novidade || ' sem novidade; ' || adiados || ' adiado(s) pelo teto de ' || p_teto
         || '; ' || desligados || ' com o e-mail desligado no perfil';
end;
$function$;

-- conferência: esperado 1 linha "true | true | 0"
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leiloes_alertas_usuarios' and column_name = 'email_ativo') as coluna,
       position('email_ativo' in pg_get_functiondef('public.leiloes_alertas_enviar(integer)'::regprocedure)) > 0 as envio_filtra,
       (select count(*) from public.leiloes_alertas_usuarios where email_ativo) as ativos;
