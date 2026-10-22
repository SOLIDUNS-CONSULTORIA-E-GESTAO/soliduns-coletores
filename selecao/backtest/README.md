# Backteste da Carteira SOLIDUNS (2001–2026)

Aplica a metodologia do robô de seleção (`selecao/`) a 26 anos de dados: carteira teórica de 10 ações,
rebalanceamento trimestral, comparada com Ibovespa, CDI e carteiras de peso igual.

Fase B (2001–06/2011): método reduzido, sem balanços padronizados. Fase A (07/2011–2026): método completo,
balanços da CVM na data de entrega (DT_RECEB).

## Ordem de execução (cada script recebe a pasta de dados `B`)

| Script | Faz |
|---|---|
| b01_precos.py | COTAHIST da B3 → precos.parquet |
| b02_retornos.py | retorno total diário (eventos corporativos tratados) |
| b03_macro.py | Selic, CDI, Ibovespa, IPCA, PIB (SGS) e EMBI+ (Ipeadata) |
| b04_cvm.py | DFP/ITR da CVM com data de entrega |
| b05_ref.py | setor, controle, free float, conselho, sanções |
| b05c_ajustes_ref.py | raízes de código sem CNPJ no FCA (BTG, CSN, CSN Mineração) |
| b05b_datas.py | datas trimestrais e universo líquido |
| b06_fund_pit.py | fundamentos na data (point-in-time) |
| b06b_fre_acoes.py | ações em circulação pelo FRE |
| b07_backtest.py | motor: `YSEL=backtest/configs/<atual|original> python b07_backtest.py B SAIDA` |
| b09_analise.py | métricas, ciclos da Selic, risco-país, eleições, custos, carteiras sorteadas: `python b09_analise.py B SAIDA` |
| b10_saidas.py | gráficos e planilha: `python b10_saidas.py B SAIDA_atual SAIDA_original PASTA` |
| b11_dados_relatorio.py | tabelas do relatório |

`configs/original` = parâmetros antes de 22/10/2026 (com varejo e construção; bancos antigos), referência
sem viés de retrospectiva. `configs/atual` = parâmetros publicados.

Correções da revisão independente estão ativas por padrão em b07 (`est, ctl2010, stale, macro, fre`).

## Carteira setorial por fundamentos

`s01_carteira_setorial.py B SAIDA` ranqueia as ações líquidas de cada setor por liquidez corrente, margem bruta, giro do ativo,
renovação de ativos (capex/depreciação) e CAGR de receita; bancos e seguradoras por PL/Ativo, margem líquida, ROE e CAGR.
`s02_excel_setorial.py B PASTA` gera a planilha.
