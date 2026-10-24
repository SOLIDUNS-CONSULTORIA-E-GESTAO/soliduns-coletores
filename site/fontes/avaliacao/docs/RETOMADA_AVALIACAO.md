# RETOMADA — RAMO AVALIAÇÃO DE IMÓVEIS (AVA) — atualizado em 09/10/2026

Cole este texto na primeira mensagem de uma conversa nova sobre o módulo de avaliação, junto com o zip da última versão.

## SITUAÇÃO
- v83-AVA pronta para integrar (v82-LEI + patch83ava.py + patch83ava_textos.py + avaliacao.html). PUBLICAR seguindo ROTEIRO_PUBLICACAO_v83-AVA.md.
- index.html md5 2a93cf67fff77146f93a64a76f8b5ed6 · avaliacao.html md5 1d00cd6f793a60ff2b05621e4bc0e9c7.
- privacidade.html md5 e869ed1e64a4e90a0e2a853db6cb094e · termos.html md5 5e133240df4a2780cc0553ee1eb7253e.
- Auditoria independente e reauditoria em 09/10: tudo corrigido, menos M-N3 (mercado/parâmetros sem conferência de versão, documentado). Ver AUDITORIA_v83-AVA.md.
- Prompts de integração para MF, LEI e AG: PROMPTS_INTEGRACAO_v83-AVA.docx.
- Motor conferido com a NBR 14653-1:2019, 14653-2:2011 (escaneada; OCR) e 14653-4:2002 em 10/10: CONFERENCIA_NBR_v83-AVA.docx.
- PENDENTE: imóveis rurais. A Parte 3 recebida é a de 2004; a vigente é a revisão de 2019. Pedir ao Thiago a 14653-3:2019.
- SQL 160 pronto, AINDA NÃO EXECUTADO. Faixa de SQL do ramo AVA: 160 a 189. Próximo livre: 161.
- Prefixos: tabelas aval_*, pasta de arquivos aval-anexos, funções aval_*.

## COMO O MÓDULO FUNCIONA
- Fica em Investimentos > Avaliação de imóveis (#/avaliacao-imoveis; apelidos #/laudos, #/avaliacao).
- É o arquivo avaliacao.html aberto num quadro (iframe) dentro do index.html.
- Login, senha, CPF, plano e liberação são da plataforma. O módulo pede o token à plataforma (window.SOLIDUNS_AVAL).
- Acesso: administrador do sistema (eh_admin) ou aprovado na fila com a área de plano 'avaliacao_imoveis'.
- Dados: avaliações, mercado, parâmetros e trilha no Supabase; fotos e documentos na pasta aval-anexos.
- Gravação automática em segundo plano; sem internet guarda no aparelho e envia depois.
- Sair da plataforma (qualquer botão Sair): o módulo envia o que falta e limpa o aparelho; cada usuário tem armazenamento próprio.
- Gravação com conferência de versão; conflito entre aparelhos = junção em três vias (nada se perde).
- Ao abrir, envia primeiro o que ficou preso no aparelho (vistoria sem internet) e só depois baixa.
- Apagar meus dados (perito) e Limpar arquivos de contas excluídas (administrador; o banco aponta as pastas por aval_pastas_orfas(), arquivos com menos de 24 h ficam, confirmação com contagem).
- Caminho de arquivo só vale dentro de <dono>/<avaliação>/ da própria avaliação.
- Administradores do sistema sempre abrem (embrulho de areaLiberada só para 'avaliacao_imoveis'; no banco, eh_admin).
- Cópia de segurança .zip (dados.json + anexos/) em Perfil do perito e em Administração > Conexão.
- Contrato v1: avalAbrirCom(dados) cria avaliação já preenchida (campos: origem, ref, url, uf, cidade, bairro, endereco,
  tipo, area, matricula, processo, juizo, valorEdital, lance, finalidade). O botão no Leilão é do ramo LEI.

## ONDE ESTÁ O CÓDIGO
- Fonte única do módulo: 5_TESTES/modulo_fonte/app.html (o mesmo da versão avulsa).
- Gerar avaliacao.html: python3 build_modulo.py app.html logo.b64 avaliacao.html (troca MODO_SOLIDUNS para true,
  nomes das tabelas aval_*, cores e fontes da plataforma).
- index.html: sempre por patch (patch83ava.py <base> <saída>), nunca o arquivo inteiro.
- Tudo de uma vez sobre qualquer base: bash 5_TESTES/modulo_fonte/gerar_deploy.sh <1_DEPLOY da base> <saída>.

## TESTES
- 5_TESTES/t160_sql.js (SQL, 48 verificações), mock_ava.js (Supabase simulado com o SQL 160 e as funções da plataforma),
  t_nbr.py (36 regras da norma), t83ava.py desktop|mobile (plataforma real + módulo, 77 verificações), varredura83.py <base> <nova>. Como rodar: LEIA-ME_TESTES.md.

## PENDENTES (fora desta conversa)
- Thiago: enviar os prompts às conversas MF, LEI e AG; rodar o SQL 160 (9 linhas ok) quando a MF incluir no roteiro; entregar à MF (ou publicar direto só se nada foi publicado depois da v82-LEI).
- LEI: botão "Avaliar este imóvel" na ficha do lote chamando avalAbrirCom (exemplo na MENSAGEM).
- BACKEND: incluir as aval_* no backup do banco e na auditoria de segurança; rotina para a pasta aval-anexos.
- MF: aceitar os textos de Privacidade/Termos e rodar a regressão completa com o kit dela.
