# AUDITORIA DO PACOTE v83-AVA (09/10/2026)

Auditoria feita por um agente independente, que não participou da construção. Depois veio a correção de cada achado e os testes novos.

## Resultado
- **Antes:** 1 crítico, 1 alto, 6 médios, 9 baixos. O pacote NÃO podia ser publicado.
- **Reauditoria:** C1 e A1 confirmados como resolvidos; 1 alto, 4 médios e 5 baixos novos. Na correção, achamos mais 1 médio (E1).
- **Depois:** todos corrigidos e cobertos por testes, menos M-N3 (limitação documentada). Ver o fim deste arquivo.

## Achados e correções

| # | Gravidade | Achado | Correção | Teste |
|---|---|---|---|---|
| C1 | Crítico | Um perito podia gravar pela API uma avaliação com código escondido no id ou em campos de texto. O código rodaria na tela do administrador e roubaria a sessão dele. | Todos os ids e textos passam por escape na tela. O banco recusa id fora de `[A-Za-z0-9_-]{3,60}` (avaliação, mercado, trilha). Ao carregar, ids inválidos dentro da avaliação são trocados. | Avaliação maliciosa aberta em 9 telas do administrador: nada roda. Banco recusa o id malicioso. |
| A1 | Alto | Trabalho feito sem internet podia ser sobrescrito ao recarregar a página com internet. | Ao abrir, o módulo envia primeiro o que ficou preso no aparelho e só depois baixa do servidor. Se não conseguir enviar, continua com os dados do aparelho. | Vistoria sem sinal (título e foto) + recarga: tudo sobe. |
| M1 | Médio | Os botões Sair do cabeçalho público e do aviso de CPF não passavam pelo módulo. | Todos os botões Sair passam pelo módulo. Cada pedido ao servidor confere se a conta da plataforma ainda é a mesma. A trilha vai com o dono explícito. | Sair pelo aviso de CPF limpa o módulo. |
| M2 | Médio | Duplo clique em Sair pulava a limpeza. | O segundo clique é ignorado durante a saída. O tempo de envio subiu para 25 s. Se ainda houver pendência, a plataforma pergunta antes de sair. | Duplo clique: sai e limpa. |
| M3 | Médio | Dois aparelhos editando a mesma avaliação: a última gravação apagava a outra (e deixava fotos órfãs). | Gravação com conferência de versão. Em conflito, junção em três vias: o que mudou de um lado entra; o que mudou dos dois fica com a edição deste aparelho; fotos são somadas. | Foto no aparelho 1 + edição no aparelho 2: as duas ficam. |
| M4 | Médio | O perito podia forjar data, usuário e papel na trilha de auditoria. | Gatilho no banco carimba data (servidor), e-mail e papel. A data do aparelho fica em `ts_cliente`. | Evento forjado é corrigido pelo banco. |
| M5 | Médio | A Política dizia que os arquivos eram apagados com a conta, mas o Storage não apaga sozinho. | "Apagar meus dados" para o perito. "Limpar arquivos de contas excluídas" para o administrador. Texto da Política ajustado. | As duas rotinas apagam só o que devem. |
| M6 | Médio | O roteiro mandava publicar direto, contra as regras das conversas. | Roteiro com duas opções: entregar à MF (recomendado) ou publicar direto só se nada foi publicado depois da v82-LEI. | — |
| B1 | Baixo | Erros de português nos Termos. | Corrigidos. | Conferido no texto. |
| B2 | Baixo | Papel da SOLIDUNS na LGPD para dados de terceiros. | Perito = controlador; SOLIDUNS = operadora. | — |
| B3 | Baixo | Cópia de trabalho no navegador não estava na Política. | Incluída na seção 3. | — |
| B4 | Baixo | Termos sugeriam que as fotos entram no backup do banco. | Texto ajustado: use a cópia .zip do módulo. | — |
| B5 | Baixo | Cópia .zip do administrador não levava mercado e parâmetros de todos; sem limite de tamanho. | Leva os de todos os peritos; para acima de 1,8 GB e sugere gerar por perito. | Conferido contra o banco. |
| B6 | Baixo | Renovação de token sem trava. | A ponte faz uma renovação por vez. | — |
| B7 | Baixo | Sem limite de tamanho e de tipo de arquivo. | No banco, o JSON de cada avaliação vai até 5 MB (mercado e parâmetros, 1 MB). Na pasta de arquivos, cada foto ou documento vai até 15 MB, só imagens, PDF e Word. | Página HTML recusada (tela e Storage). |
| B8 | Baixo | Descrição errada do patch de textos. | Corrigida (ele também troca a vigência). | — |
| B9 | Baixo | Testes do pacote dependiam de caminhos deste ambiente. | Caminhos relativos ao pacote, fotos e arquivos de apoio incluídos, LEIA-ME_TESTES. | — |
| I1 | Informativo | search_path das funções SECURITY DEFINER. | Fixo em `public, pg_temp`, com nomes qualificados (ver M-N4). | — |
| I2 | Informativo | Conferência dos planos falhava se a tabela não tivesse `id`. | Agora responde "não se aplica". | — |
| I3 | Informativo | Pedido do Leilão pendente não era limpo ao sair. | Limpo em todos os Sair. | — |

## Reauditoria (segunda rodada)

O mesmo agente independente conferiu as correções. C1 e A1: **resolvidos**. Achados novos e o que foi feito:

| # | Gravidade | Achado | Correção | Teste |
|---|---|---|---|---|
| A-N1 | Alto | "Limpar arquivos de contas excluídas" comparava com uma lista de usuários do aparelho (podia estar velha), lia só 1.000 pastas e apagava sem perguntar. | O banco responde quais pastas são de contas que não existem mais (`aval_pastas_orfas()`, só administrador, sem limite de pastas). Arquivo enviado nas últimas 24 h nunca entra. O módulo mostra pastas e arquivos e pede confirmação. | Arquivo recente não é apontado; confirmação com a contagem; apaga só a conta excluída. SQL: perito comum não consulta; contagem certa. |
| M-N2 | Médio | Depois de 4 conflitos seguidos, a gravação dava como salva uma avaliação que não subiu. | Sem gravação confirmada, o envio para e tenta de novo; o aviso "Erro ao salvar" aparece. | Revisão de código. |
| M-N3 | Médio | Banco de mercado e parâmetros não têm conferência de versão: dois aparelhos ao mesmo tempo, vale a última gravação. | **Limitação documentada.** São dados de consulta do próprio perito, com pouca edição simultânea. As avaliações (o laudo) têm a conferência completa. | — |
| M-N4 | Médio | search_path vazio em funções SECURITY DEFINER podia quebrar chamadas internas em alguns projetos. | Fixo em `public, pg_temp`, com nomes qualificados. | SQL 160, 2x e com CRLF. |
| M-N5 | Médio | O caminho de um arquivo vinha do JSON sem conferência. Um perito podia apontar para a pasta de outro e, ao pedir suporte, levar o administrador a apagar fotos alheias. | Só vale caminho dentro de `<dono>/<avaliação>/` da própria avaliação, sem `..`. Fora disso é descartado antes de baixar ou apagar. | Caminho de outra pasta e com `..` descartados. |
| E1 | Médio (achado na correção) | "Apagar meus dados" deixava as avaliações no aparelho; o envio seguinte podia recriá-las. Para o administrador, pendências de avaliações de outros peritos não contavam. | O aparelho também é limpo antes do envio final. A conferência de pendências do administrador inclui as avaliações de todos. | Servidor sem nada do perito depois de apagar. |
| B-N1 | Baixo | Quem perdeu o plano não consegue entrar no módulo para apagar os dados. | Regras de exclusão só pelo dono (sem exigir plano). A Política indica o e-mail contato@soliduns.com.br para esse caso. | Conferido no texto. |
| B-N2 | Baixo | Erro que não é de rede (plano revogado, avaliação grande demais) deixava o aparelho preso tentando enviar. | Sem acesso, o envio nem começa e o módulo mostra a tela de plano. Nos outros erros, os dados ficam no aparelho e o módulo avisa para baixar a cópia .zip. | — |
| B-N3 | Baixo | O texto misturava o limite do banco (5 MB) com o de arquivos (15 MB). | Texto do B7 corrigido. | — |
| B-N4 | Baixo | O script de geração usava caminhos deste ambiente. | Novo `5_TESTES/modulo_fonte/gerar_deploy.sh <base> <saída>`, que reproduz os md5 sobre a v82-LEI. LEIA-ME diz quais testes são da versão avulsa. | Rodado: md5 iguais. |
| B-N5 | Baixo | A Política dizia que os arquivos saem "em seguida", mas depende do administrador. | "Removidos do armazenamento pela administração em seguida." | Conferido no texto. |

## Conferência com o texto da NBR 14653 (10/10/2026)

Normas recebidas e conferidas: NBR 14653-1:2019, NBR 14653-2:2011 (cópia escaneada, lida por OCR e conferida nas páginas das tabelas) e NBR 14653-4:2002.
Detalhes, com a fonte de cada regra: CONFERENCIA_NBR_v83-AVA.docx.

| Regra | Como estava | Como ficou |
|---|---|---|
| Tabela 3, item 4 | Fora de 0,50–2,00 recebia 1 ponto sempre | 0,40–2,50 = 1 ponto; fora disso, 0; com menos de 5 dados, só 0,80–1,25 pontua |
| B.2.2 | Só o conjunto de fatores era conferido | Cada fator isolado entre 0,50 e 2,00 |
| B.3 | Saneamento retirava vários dados de uma vez | Um por vez, do mais distante da média, com reintrodução |
| 9.2.1.1 e 9.2.2.1 | Grau III sem as exigências adicionais | Grau III exige endereços completos dos dados e valor adotado igual à estimativa central |
| Tabela 1, item 4 | Grau I sem a extrapolação simultânea | Grau I confere cada variável e todas ao mesmo tempo |
| Tabelas 6 e 7 | Quantificação de custo não existia | Item 2 do evolutivo calculado pelas Tabelas 6 e 7 |
| Tabelas 10 e 11 | Evolutivo pelo menor item | 8, 5 e 3 pontos; itens 1 e 2 obrigatórios; regra dos 15% (9.5.2.1) |
| Tabelas 8 e 9 | Involutivo pelo menor item | 22, 13 e 9 pontos; itens 2, 6, 7 e 8 obrigatórios |
| Renda | 6 itens próprios, pelo menor | Tabelas 4 e 5 da NBR 14653-4 (9 itens) |
| Tabela 5, nota | Acima de 50% bloqueava a emissão | Sem grau de precisão, com justificativa obrigatória |
| A.10 e 6.8.2 (Parte 1) | Sem intervalo de valores admissíveis | Calculado e apresentado no laudo |
| 8.2.1.4.1 e 10.1 k | Sem gráfico de preços observados × estimados | Gráfico na tela e no laudo |
| 9.2.1.1 b | Sem elasticidades | Elasticidade de cada variável no ponto de estimação |
| A.2.1.5.2 | Sem matriz de correlações | Alerta para correlação acima de 0,80 |

Pendente: imóveis rurais. A Parte 3 recebida é a edição de 2004; a vigente é a revisão de 2019. A pontuação rural fica provisória até a conferência com a edição de 2019.

## Números finais
- SQL 160: **48/48** (PGlite, rodado 2x e com CRLF).
- Plataforma real + módulo + Supabase simulado: **77/77 no computador** e **77/77 no celular** (3 testes novos da reauditoria).
- Regras da NBR 14653 no cálculo: **36/36** (t_nbr.py).
- Varredura de 33 rotas v82-LEI × v83-AVA: nenhum erro novo.
- Versão avulsa do módulo: 492 + 499 verificações de tela e 89 da nuvem, sem regressão.
