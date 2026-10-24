# Como rodar os testes do ramo AVA (5_TESTES)

Pré-requisitos: Python 3 com Playwright (Chromium), Node 18+ e, dentro de 5_TESTES:
`npm install @electric-sql/pglite docx@9.7.1` (o docx serve só para o teste do laudo em Word).

1. **SQL 160** (sem navegador):
   `node t160_sql.js` → lê `../2_BANCO/2026-10-09_160_avaliacao-imoveis.sql`. Esperado: `SQL 160: 48/48`.
2. **Supabase simulado** (deixe rodando em outro terminal):
   `node mock_ava.js` → porta 54322, com o SQL 160 e as funções da plataforma (acessos, eh_admin, esta_aprovado,
   tem_area, minhas_areas).
3. **Site** (outro terminal): `python3 -m http.server 8766 --directory ../1_DEPLOY`
4. **Plataforma + módulo**: `python3 t83ava.py desktop` e `python3 t83ava.py mobile` → esperado `77/77`.
   Reinicie o `mock_ava.js` antes de cada rodada (os testes criam usuários com e-mails fixos).
   Variáveis opcionais: `AVA_SITE`, `AVA_FX` (pasta das fotos de teste), `DOCX_IIFE` (caminho do docx IIFE).
5. **Varredura de rotas**: `python3 varredura83.py <pasta 1_DEPLOY da v82-LEI> ../1_DEPLOY` → `RESULTADO: TUDO OK`.

6. **Regras da NBR 14653 no motor de cálculo** (versão avulsa servida em `localhost:8765/test.html`):
   `python3 t_nbr.py` → esperado `NBR TOTAL 36 OK 36`. Confere as Tabelas 2 a 11 e os Anexos A e B da NBR 14653-2:2011
   e as Tabelas 4 e 5 da NBR 14653-4:2002.
7. **Gerar o 1_DEPLOY de novo** (sobre a v82-LEI ou outra base): `bash modulo_fonte/gerar_deploy.sh <1_DEPLOY da base> <saída>`.

Os números "492 + 499" e "89 da nuvem" citados no roteiro são da versão avulsa do módulo (fora da plataforma). Os scripts
deles (qa.py, e2e_nuvem.py) ficam com a conversa de avaliação e não fazem parte deste pacote.

Arquivos de apoio: `fx/` (6 fotos com EXIF e GPS, 1 PDF), `unlock.js` (preenche as fases de uma avaliação de teste).
Resultado completo da última rodada: `resultado_v83.txt`.
