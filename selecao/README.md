# SOLIDUNS — Robô de Seleção de Carteira

Seleção de ações brasileiras sob **risco Brasil** e **risco político**, conforme o
*Compêndio metodológico* da SOLIDUNS (outubro de 2026).

O robô:

1. **Coleta** os dados públicos: CVM (DFP, ITR, FCA, FRE e processos sancionadores),
   B3 (cotações históricas COTAHIST), Banco Central (Selic e Focus), Tesouro Direto e
   Damodaran.
2. **Calcula** o custo de capital de cada ação hoje e em cada cenário eleitoral, a
   probabilidade de cada cenário pelas pesquisas, o crescimento do setor, o índice de
   governança e a margem bruta.
3. **Pontua** as ações com o escore de cinco fatores.
4. **Monta** a carteira com limites por ação, por setor e por estatais, e com perda
   máxima em cada cenário eleitoral.
5. **Gera** um relatório em Excel e grava o resultado na plataforma, que o mostra na página
   **Carteira SOLIDUNS** (Mercado financeiro › Ações).

Os fundamentos contábeis vêm do **mesmo coletor da plataforma** (`coletor/coletar_cvm.py`).
Por isso a pasta `selecao` fica no repositório `soliduns-coletores`, ao lado da pasta
`coletor`.

---

## Como instalar (uma vez, no computador pessoal)

1. **Instale o Python 3.12** em python.org. No Windows, marque a opção
   *"Add Python to PATH"* na primeira tela do instalador.
2. **Baixe o repositório `soliduns-coletores`** pelo GitHub Desktop (a pasta `selecao` já
   vem dentro dele, ao lado da pasta `coletor`).
3. **Abra o terminal dentro da pasta `selecao`.** No Windows: abra a pasta no
   Explorador, clique na barra de endereço, digite `cmd` e tecle Enter.
4. **Instale as bibliotecas:**

   ```
   pip install -r requirements.txt
   ```

## Antes de cada execução

- **CDS de 5 anos:** é dado pago, então o robô não o baixa sozinho. Atualize
  `cds_5a_pb` e `cds_data` no arquivo `parametros.yaml`.
- **Pesquisas eleitorais:** acrescente cada nova pesquisa em `pesquisas.csv`, uma linha
  por pesquisa: data de divulgação, instituto, amostra, % do candidato D, % do candidato E,
  base (`validos` ou `totais`) e fonte. Se a amostra não for divulgada, deixe em branco.

## Como rodar

Dentro da pasta `selecao`:

| Comando | O que faz |
|---|---|
| `python robo_selecao.py` | Carteiras com os parâmetros do arquivo (padrão: modo "condicional") |
| `python robo_selecao.py --modo condicional` | Carteira atual + uma pronta para cada resultado |
| `python robo_selecao.py --modo neutro` | Carteira com a mesma sensibilidade política da bolsa |
| `python robo_selecao.py --resultado D` | Depois da apuração, se D vencer (use `E` no outro caso) |
| `python robo_selecao.py --regime normal` | Pesos do regime normal (fora da janela eleitoral) |
| `python robo_selecao.py --gravar` | Também grava o resultado no Supabase da plataforma |
| `python testes/test_formulas.py` | Confere as fórmulas contra os exemplos do compêndio |

A **primeira execução** baixa cerca de 350 MB e leva uns 10 minutos. As seguintes
reaproveitam os arquivos da pasta `cache` e levam de 1 a 5 minutos.

O relatório sai na pasta `resultados`, com o nome `selecao_AAAA-MM-DD_modo.xlsx`.

## Abas do relatório

- **Resumo:** probabilidade de cada cenário, prêmio político, CDS por cenário, custo de
  capital médio, resumo das carteiras e avisos da execução.
- **Carteira(s):** ações, pesos, escore, retorno implícito no preço, custo de capital
  esperado, excesso de retorno sobre a ação mediana, choques por cenário e γ.
- **Ranking:** todas as ações elegíveis com os cinco fatores padronizados.
- **Cenários por ação:** β, λ, custo de capital (atual, se D, se E), crescimento, P/L justo,
  potencial e choques — fórmulas 3.3 a 8.5.
- **Governança:** as seis notas do IGov por ação.
- **Parâmetros:** cada número usado e de onde veio (coletado, estimado ou do arquivo).
- **Pesquisas** e **Excluídas** (com o motivo de cada exclusão).

## Na plataforma (GitHub Actions + Supabase)

O robô roda sozinho no GitHub, como os outros coletores:

- **Quando:** de segunda a sexta às 20h17 de Brasília, depois que a B3 publica as
  cotações do dia (arquivo `.github/workflows/selecao-carteira.yml`).
- **À mão:** aba **Actions** → **Seleção de carteira** → **Run workflow**. Ali dá para
  escolher o modo, o resultado da eleição (D ou E) e o regime dos pesos.
- **Onde grava:** tabelas `selecao_execucoes`, `selecao_carteiras` e `selecao_ranking`
  (migration 182). Cada execução entra como **prévia**.
- **No site:** Mercado financeiro › Ações › **Carteira SOLIDUNS**. O administrador-mestre vê
  a prévia mais recente e o botão **Publicar para assinantes**. O assinante logado vê só a
  última execução publicada. Para publicar sem clicar, mude `publicar_automaticamente` para
  `true` em `parametros.yaml`.
- **Relatório em Excel:** fica para download na própria execução, na seção
  **Artifacts** (guardado por 30 dias).

**Antes da primeira execução**, rode uma vez a migration
`supabase/migrations/182_selecao_carteira.sql` no **SQL Editor** do Supabase. Os segredos `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` já são os
mesmos da Coleta CVM. Se as tabelas ainda não existirem, o robô só avisa no registro e o
relatório em Excel continua sendo gerado.

**Para atualizar CDS e pesquisas sem instalar nada:** no site do GitHub, abra
`selecao/parametros.yaml` ou `selecao/pesquisas.csv`, clique no lápis (*Edit*), altere e
clique em **Commit changes**. A próxima execução já usa os valores novos.

## Calendário em torno do segundo turno (25/10/2026)

- **Sábado 24/10:** lance as últimas pesquisas e rode em **Actions** (modo condicional).
- **Segunda 26/10, antes da abertura:** rode em **Actions** com resultado D ou E. Depois,
  escreva o resultado em `eleicao: resultado:` no `parametros.yaml`, para as execuções
  automáticas seguintes já partirem dele.
- **Depois do Copom (3 e 4/11):** rode de novo para atualizar Selic e curva.

---

## Ajustes em relação à primeira versão do compêndio

Ao ligar o método aos dados reais, seis pontos foram adaptados. A versão atual do
compêndio já incorpora todos eles (fórmulas 4.8, 8.6, 8.7 e 10.2 a 10.5):

1. **Restrição de perda por cenário (10.4):** é aplicada ao **choque imediato** de cada
   cenário (média do choque fundamental, fórmula 10.2, com o choque empírico, fórmula 4.7),
   e não ao potencial U. O nível de U depende do custo de capital teórico, que no Brasil é
   alto (≈ 18%); com ele, quase todas as ações teriam U negativo e a restrição perderia o
   sentido. O choque mede só o que muda com a eleição.
2. **Modo neutro (10.5):** uma carteira só comprada não chega a Γ = 0. "Neutro" passou a
   significar **Γ da carteira igual ao γ da bolsa (BOVA11)**: sem aposta política além da
   que o índice já tem.
3. **Prêmio político Δ (4.4):** sem série diária de CDS gratuita, Δ é tirado da reação da
   bolsa às pesquisas, pela fórmula (4.8): Δ = γ_mercado · (K_e − g) / (κ − 1 + m). Se você criar o arquivo
   `cds_historico.csv` (colunas `data;cds_pb`), o robô usa a regressão (4.4) original.
4. **Exposição ao risco país λ (3.4):** os dados abertos da CVM não trazem receita por
   país. λ vem do grupo de setores (`setores.yaml`), reescalado para média 1 no universo.
   Ajustes por ação podem ser feitos em `ajustes_por_acao`.
5. **Margem bruta (7.2):** a estabilidade usa as DFP anuais dos últimos 5 anos mais os
   12 meses atuais, no lugar de 12 trimestres.
6. **Governança (6.1):** o tag along é deduzido do segmento de listagem e da classe da
   ação; o componente "histórico" conta processos sancionadores da CVM com a companhia
   entre os acusados (a republicação de demonstrações não entrou: é frequente e quase
   sempre por correções menores).

## Observação sobre os dados da CVM

A **quantidade de ações** da composição do capital das ITR vem **em milhares** para parte
das companhias (74 em outubro de 2026, ex.: VALE3, ITUB4, CYRE3), sem coluna que indique
a escala. O robô corrige isso comparando com o Formulário de Referência (FRE), que traz a
quantidade em unidades. **Vale conferir se os indicadores que dependem de preço na
plataforma (P/L, LPA, valor de mercado) sofrem do mesmo problema**, porque eles vêm da
mesma coluna em `fundamentos_br`.

---

Dados públicos: CVM (ODbL), B3, Banco Central, Tesouro Transparente, Damodaran (NYU Stern).
Material metodológico. **Não constitui recomendação de investimento.**
