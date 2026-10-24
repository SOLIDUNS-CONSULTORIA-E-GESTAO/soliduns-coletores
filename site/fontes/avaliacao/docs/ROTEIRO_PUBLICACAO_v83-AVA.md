# SOLIDUNS — v83-AVA (09/10/2026) — AVALIAÇÃO DE IMÓVEIS DENTRO DA PLATAFORMA — AUDITADA E PRONTA PARA INTEGRAR

Esta versão passou por auditoria independente, por uma reauditoria e pela conferência com o texto da NBR 14653 (Partes 1, 2 e 4). Todos os achados foram corrigidos e testados (ver AUDITORIA_v83-AVA.md).

## O QUE É
**v83-AVA = v82-LEI + patch83ava.py + patch83ava_textos.py + arquivo novo avaliacao.html.**

| Arquivo do 1_DEPLOY | md5 | Mudança |
|---|---|---|
| index.html | 2a93cf67fff77146f93a64a76f8b5ed6 | patch83ava.py (base v82-LEI 8c20bf30…) |
| avaliacao.html | 1d00cd6f793a60ff2b05621e4bc0e9c7 | arquivo NOVO (o módulo) |
| privacidade.html | e869ed1e64a4e90a0e2a853db6cb094e | patch83ava_textos.py (vigência 9/10/2026) |
| termos.html | 5e133240df4a2780cc0553ee1eb7253e | patch83ava_textos.py (vigência 9/10/2026) |
| os outros 6 itens | iguais à v82-LEI | — |

Tem TUDO da v82-LEI (FIIs, REITs, ETFs, Leilões, Automóveis, Meu perfil) + o módulo novo.

O módulo fica em **Investimentos > Avaliação de imóveis** (endereço `#/avaliacao-imoveis`). Ele traz:
- **As 10 fases** do Compêndio, com as travas da NBR 14653.
- **Os cinco métodos:** comparativo, evolutivo, inferência estatística, involutivo e renda.
- **Fotos da vistoria e documentos**, guardados no Supabase.
- **Laudo e minuta em Word** no modelo SOLIDUNS.
- **Trilha de auditoria, banco de mercado e parâmetros** por perito.
- **Celular e trabalho sem internet:** as alterações sobem sozinhas quando o sinal volta.
- **Cópia de segurança (.zip)** com os dados, as fotos e os documentos.
- **Pedido de outras áreas:** o Leilão pode abrir o módulo com uma avaliação já preenchida (contrato v1, ver abaixo).

O módulo **não tem login próprio**. Ele usa a conta da plataforma. Senha, Google, CPF, plano e liberação continuam
em Minha conta e na tela Equipe.

## PASSO 1 — BANCO (Supabase)
1. Abra o Supabase, projeto evcsniicnrlrtzpdmeza.
2. Clique em **SQL Editor** e depois em **New query**.
3. Abra o arquivo `2_BANCO/2026-10-09_160_avaliacao-imoveis.sql` no Bloco de Notas, copie tudo e cole.
4. Clique em **Run**. Se aparecer "Potential issue detected", escolha **Run this query**. NUNCA "Run and enable RLS".
5. Confira o resultado: **9 linhas, todas com ok = true**.
   - Se aparecer "FALTA public.…" ou "formato inesperado", pare e me avise. Nada foi gravado.

O que o SQL 160 faz:
- **Cria** as tabelas `aval_*` e a pasta de arquivos `aval-anexos` (só imagens, PDF e Word). Não altera nada dos outros ramos.
- **Trilha de auditoria:** data, usuário e papel passam a ser carimbados pelo banco.
- **Planos:** se a tabela de planos tiver lista fixa de áreas, inclui a área nova `avaliacao_imoveis` nela.
- **Linha 1 da conferência:** simula um plano com a área nova e desfaz na hora, para provar que o plano aceita.
- **Pode rodar de novo** sem perder dados.

## PASSO 2 — SITE (Netlify)
Antes, decida quem publica. Pelas regras das conversas, quem publica é a conversa MF:
- **Opção A (recomendada):** entregue este pacote à conversa MF. Ela junta com a próxima versão consolidada e publica.
- **Opção B:** publique você mesmo, **só se nada foi publicado no Netlify depois da v82-LEI**. Em Deploys, o último
  "Published" deve ser o da v82-LEI (09/10). Se houver outro mais novo, use a opção A, senão você desfaz trabalho de outro ramo.

Na opção B:
1. Abra https://app.netlify.com/sites/spontaneous-longma-b03f62/deploys
2. Arraste a pasta **1_DEPLOY deste pacote** (10 itens: os 9 de antes + **avaliacao.html**).
3. Espere aparecer "Published".

## PASSO 3 — CONFERIR (Ctrl+F5)
1. Entre na plataforma com a sua conta.
2. Clique em **Investimentos**. Deve aparecer o card **Avaliação de imóveis**.
3. Clique no card. O módulo abre já com o seu nome, sem pedir login.
4. No primeiro acesso aparecem 6 avaliações de exemplo. Elas servem para conhecer o fluxo; pode excluir.
5. No menu do módulo deve aparecer **"Salvo na nuvem às …"**.
6. Abra uma avaliação, vá à fase **F3 Vistoria** e tire uma foto pelo celular. Depois abra no computador: a foto aparece.
7. Em **Perfil do perito**, preencha o CREA/CAU (sai no laudo) e teste **Baixar cópia (.zip)**.
   Ali também fica **Apagar meus dados**, que apaga tudo do perito no módulo (não teste com dados reais).
8. Abra https://soliduns.com.br/privacidade.html e /termos.html: a vigência deve ser **9 de outubro de 2026**.

## PASSO 4 — QUEM PODE USAR (planos)
- **Área de plano nova:** "Avaliação de imóveis (laudos)", código `avaliacao_imoveis`.
- **Administradores do sistema** (você e o Thales) sempre abrem o módulo, com ou sem plano.
- **Plano que libera tudo** (GOLD) já inclui a área.
- **Outro plano:** na tela **Equipe > Planos**, marque "Avaliação de imóveis (laudos)" no plano desejado.
- **Quem não tem a área** vê o card com o selo "Planos pagos" e a tela de plano. O banco também recusa.

## EXCLUSÃO DE CONTA (arquivos)
O Supabase não apaga os arquivos do Storage quando um usuário é excluído. Depois de excluir alguém em
**Authentication > Users**, abra o módulo como administrador: **Administração > Conexão > Limpar arquivos de contas excluídas**.
- O banco aponta só as pastas de contas que não existem mais e sem arquivo novo nas últimas 24 horas.
- O módulo mostra quantas pastas e arquivos achou e pede confirmação antes de apagar.
- Quem perdeu o acesso ao módulo e quer apagar os dados pede pelo e-mail contato@soliduns.com.br (texto já na Política).

## CONTRATO v1 — OUTRAS ÁREAS ABRINDO O MÓDULO
Qualquer área do index.html pode chamar `avalAbrirCom(dados)`.

O que acontece:
- O módulo abre e cria uma avaliação nova, já preenchida.
- A fase F1 mostra a origem e os valores do edital.

Campos aceitos (todos opcionais; qualquer outro campo é ignorado):
- `origem`: use 'leilao';
- `ref`: id do lote;
- `url`: link do edital;
- localização: `uf`, `cidade`, `bairro`, `endereco`;
- imóvel: `tipo`, `area`, `matricula`;
- processo: `processo`, `juizo`;
- valores: `valorEdital` (valor de avaliação do edital) e `lance`;
- `finalidade`.

Quem não tem a área vê a tela de plano, e o pedido é descartado.

O botão "Avaliar este imóvel" na ficha do leilão é da conversa de Leilões. O exemplo pronto está na
MENSAGEM_PARA_CONVERSA_MF.md.

## NUMERAÇÃO
- Faixa de SQL deste ramo (AVA): **160 a 189**. Próximo SQL livre: **161**.

## TESTES (09/10) — 5_TESTES/resultado_v83.txt
- **SQL 160** (PGlite, rodado 2x, também com CRLF): 48 de 48.
  Inclui planos com lista fixa em text[] e em jsonb, e a parada segura com lista em formato desconhecido.
- **Plataforma real + módulo + Supabase simulado:** 77 de 77 no computador e 77 de 77 no celular Android,
  inclusive um teste para cada achado da auditoria.
- **Regras da NBR 14653 no cálculo:** 36 de 36 (Tabelas 2 a 11 e Anexos A e B da Parte 2; Tabelas 4 e 5 da Parte 4).
- **Varredura de 33 rotas** v82-LEI × v83-AVA: nenhum erro novo de JavaScript.
- **Gerar de novo sobre outra base:** `bash 5_TESTES/modulo_fonte/gerar_deploy.sh <1_DEPLOY da base> <saída>` (reproduz os md5 acima sobre a v82-LEI).
- **Versão avulsa do módulo** (sem a plataforma): 492 + 499 verificações de tela e 89 da nuvem, sem regressão.
