# Avaliação de imóveis (ramo AVA) — fonte do módulo dentro do repositório (v176, 23/10/2026)

O módulo é o arquivo `site/publicar/avaliacao.html`, aberto num quadro em Investimentos › Avaliação de imóveis.
Até 23/10 ele só existia no Netlify e sumiu do site nas publicações a partir de 17/10. Agora a fonte fica aqui.

- `app.html` — fonte única do módulo (a mesma da versão avulsa). Versão v83-AVA, conferida com a NBR 14653
  (Partes 1:2019, 2:2011 e 4:2002) em 10/10/2026 — ver `docs/CONFERENCIA_NBR_v83-AVA.docx`.
- `build_modulo.py` + `logo.b64` — gera o módulo no modo SOLIDUNS (md5 1d00cd6f793a60ff2b05621e4bc0e9c7).
- `aplicar_v107.py` + `bloco_v107.css` — mesmo texto justificado do resto da plataforma (v107-LEI).
- `gerar_avaliacao.sh` — faz os dois passos e grava `site/publicar/avaliacao.html`.
- `testes/` — kit do ramo: `t160_sql.js` (48), `mock_ava.js` (Supabase simulado), `t83ava.py desktop|mobile` (77 cada),
  `t_nbr.py` (36 regras da norma, na versão avulsa `app.html` servida em UTF-8), `t176_botao_layout.py` (botão do Leilão e
  layout do módulo em 5 larguras). Como rodar: `testes/LEIA-ME_TESTES.md`.
- Banco: `supabase/migrations/ava/…_160-AVA_…_JA_EXECUTADO.sql` (tabelas aval_* já existem com dados; não rodar de novo).
  Novos SQLs da Avaliação: 190 em diante.
- Pendente: imóveis rurais (NBR 14653-3:2019 recebida em 23/10 — conferência a autorizar).
