-- 151_radar_agencia_brasil_ibge_pauta.sql — Radar: Agência Brasil e Agência IBGE como PAUTA (só título e link)
-- Conferência 16/10/2026 15h50:
--   Agência Brasil (agenciabrasil.ebc.com.br/sobre, "Política de reprodução"): NÃO é mais CC BY 4.0. Reprodução autorizada
--   para veículos com fins jornalísticos, com indicação da fonte; uso comercial exige licença (licenciamento@ebc.com.br).
--   Como o jornal tem publicidade, a regra segura é não reproduzir o texto: só título, link e crédito (camada "pauta").
--   Agência de Notícias IBGE (agenciadenoticias.ibge.gov.br/robots.txt): bloqueia só pastas de sistema; o feed /agencia-rss
--   é liberado. (O bloqueio a robôs é no servidor da API do calendário, servicodados.ibge.gov.br, que segue desligado.)
-- Rodar só com a aprovação do Thiago (rodar = aprovar).
update public.fontes_noticia
   set camada = 'pauta',
       licenca = 'Reprodução jornalística com crédito; uso comercial exige licença da EBC (conferido 16/10/2026)',
       verificada_em = coalesce(verificada_em, now())
 where url like 'https://agenciabrasil.ebc.com.br/rss/%';
update public.fontes_noticia
   set camada = 'pauta',
       licenca = 'robots.txt libera o feed; uso com crédito ao IBGE (conferido 16/10/2026)',
       verificada_em = coalesce(verificada_em, now())
 where url = 'https://agenciadenoticias.ibge.gov.br/agencia-rss';
-- o que já foi guardado como "livre" da Agência Brasil perde o resumo (o texto nunca fica guardado na pauta)
update public.vm_achados set camada = 'pauta', resumo = null
 where fonte_nome ilike 'Agência Brasil%' and camada = 'livre';

-- conferência: esperado uma linha por fonte, todas "pauta" e conferidas
select nome, camada, verificada_em is not null as liberada
  from public.fontes_noticia
 where url like 'https://agenciabrasil.ebc.com.br/rss/%' or url = 'https://agenciadenoticias.ibge.gov.br/agencia-rss'
 order by nome;
