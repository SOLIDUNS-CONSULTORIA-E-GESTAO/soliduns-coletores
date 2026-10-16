-- 152_ibge_calendario_agencia_brasil_livre.sql — decisões do Thiago (16/10/2026 16h19)
-- 1. IBGE: liga o calendário de divulgações (API oficial e documentada servicodados.ibge.gov.br/api/v3/calendario).
--    O robots.txt do portal e da Agência de Notícias do IBGE só restringe pastas de sistema; a API é pública e feita
--    para acesso por programa. Crédito "IBGE" em cada evento da agenda.
-- 2. Agência Brasil: volta a "livre" (texto do feed guardado e usado com crédito "Agência Brasil"). Política de
--    reprodução da EBC: "reprodução autorizada para veículos de comunicação com fins jornalísticos, mediante indicação
--    da fonte" — é o caso do jornal. Ressalvas da própria política: correções do original são responsabilidade de quem
--    republica; conteúdo de parceiros pode ter outra política (ver o aviso de cada matéria).
update public.fontes_noticia
   set verificada_em = coalesce(verificada_em, now()),
       observacao = coalesce(observacao, '') || ' | calendário IBGE liberado em 16/10/2026 (API oficial documentada)'
 where url = 'https://servicodados.ibge.gov.br/api/v3';
update public.fontes_noticia
   set camada = 'livre',
       licenca = 'EBC: reprodução autorizada para veículos com fins jornalísticos, com indicação da fonte (conferido 16/10/2026)'
 where nome ilike 'Agência Brasil%';

-- conferência: esperado IBGE (calendário) liberado e as 4 fontes da Agência Brasil "livre"
select nome, camada, verificada_em is not null as liberada
  from public.fontes_noticia
 where url = 'https://servicodados.ibge.gov.br/api/v3' or nome ilike 'Agência Brasil%'
 order by nome;
