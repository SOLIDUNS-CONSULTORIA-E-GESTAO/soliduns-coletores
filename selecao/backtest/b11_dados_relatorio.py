"""Tabelas do relatório (strings formatadas) a partir das duas configurações."""
import sys, json
import pandas as pd
B, V, V2, OUT = sys.argv[1:5]
a, a2 = pd.read_pickle(f'{V}/bt_analise.pkl'), pd.read_pickle(f'{V2}/bt_analise.pkl')
n1, n2 = pd.read_pickle(f'{V}/bt_nav.pkl'), pd.read_pickle(f'{V2}/bt_nav.pkl')
c1, c2 = pd.read_pickle(f'{V}/bt_carteiras.pkl'), pd.read_pickle(f'{V2}/bt_carteiras.pkl')
C0, I, CDI, EU, EE = list(n1.columns)
pc = lambda v, d=1: (f'{v*100:+.{d}f}%' if v < 0 else f'{v*100:.{d}f}%').replace('.', ',')
pcs = lambda v, d=1: f'{v*100:+.{d}f}%'.replace('.', ',')
num = lambda v, d=2: f'{v:.{d}f}'.replace('.', ',')
mil = lambda v: f'{v*100:,.0f}%'.replace(',', '.')
D = {}
def met(m, per, s): r = m[(m.periodo == per) & (m.serie == s)].iloc[0]; return r
rows = []
for per in ['Total (2001–2026)', 'Fase B (2001–06/2011)', 'Fase A (07/2011–2026)']:
    for nome, m, s in (('Carteira – config. atual', a['metricas'], C0), ('Carteira – config. original', a2['metricas'], C0), ('Ibovespa', a['metricas'], I),
                       ('CDI', a['metricas'], CDI), ('Universo líquido (peso igual)', a['metricas'], EU), ('Elegíveis – config. atual (peso igual)', a['metricas'], EE),
                       ('Elegíveis – config. original (peso igual)', a2['metricas'], EE)):
        r = met(m, per, s)
        rows.append([per, nome, pc(r.cagr), pc(r.vol) if s != CDI else '—', num(r.sharpe) if s != CDI else '—', pc(r.max_dd) if s != CDI else '—', mil(r.acum)])
D['metricas'] = rows
D['m'] = {f'{k}_{p}': pc(met(m, per, s)[col]) for k, m, s in (('at', a['metricas'], C0), ('or', a2['metricas'], C0), ('ib', a['metricas'], I), ('cdi', a['metricas'], CDI), ('eu', a['metricas'], EU), ('eeat', a['metricas'], EE), ('eeor', a2['metricas'], EE))
          for p, per in (('T', 'Total (2001–2026)'), ('B', 'Fase B (2001–06/2011)'), ('A', 'Fase A (07/2011–2026)')) for col in ['cagr']}
D['acum'] = {'at': mil(met(a['metricas'], 'Total (2001–2026)', C0).acum), 'or': mil(met(a2['metricas'], 'Total (2001–2026)', C0).acum),
             'ib': mil(met(a['metricas'], 'Total (2001–2026)', I).acum), 'cdi': mil(met(a['metricas'], 'Total (2001–2026)', CDI).acum)}
D['ciclos'] = [[r.tipo, f'{pd.Timestamp(r.inicio):%m/%Y} a {pd.Timestamp(r.fim):%m/%Y}', r.selic.replace('.', ','), pc(r[C0]), pc(o[C0]), pc(r[I]), pc(r[CDI])]
               for (_, r), (_, o) in zip(a['ciclos'].iterrows(), a2['ciclos'].iterrows())]
q1, q2 = a['ciclos'][a['ciclos'].tipo == 'Queda'], a2['ciclos'][a2['ciclos'].tipo == 'Queda']
D['vit'] = {'at': int((q1[C0] > q1[I]).sum()), 'or': int((q2[C0] > q2[I]).sum()), 'n': len(q1),
            'at_cdi': int((q1[C0] > q1[CDI]).sum()), 'or_cdi': int((q2[C0] > q2[CDI]).sum())}
D['regimes'] = [[r.regime, str(r.pregoes), pc(r[C0]), pc(o[C0]), pc(r[I]), pc(r[CDI]), pc(r[EE])] for (_, r), (_, o) in zip(a['regimes_selic'].iterrows(), a2['regimes_selic'].iterrows())]
D['risco'] = [[r.regime, pc(r[C0]), pc(o[C0]), pc(r[I]), pc(r[CDI])] for (_, r), (_, o) in zip(a['risco_pais'].iterrows(), a2['risco_pais'].iterrows())]
D['eleicoes'] = [[str(int(r.ano)) + (' (até 21/10)' if r.ano == 2026 else ''), pc(r[C0]), pc(o[C0]), pc(r[I]), pc(r[CDI])] for (_, r), (_, o) in zip(a['eleicoes'].iterrows(), a2['eleicoes'].iterrows())]
D['custos'] = [[r.custo_por_lado.replace('.', ','), pc(r.cagr), pc(o.cagr)] for (_, r), (_, o) in zip(a['custos'].iterrows(), a2['custos'].iterrows())]
al = lambda x: [pc(x['cagr_top10_peso_igual']), pc(x['p50']), pc(x['p95']), f"{x['percentil_metodo']*100:.1f}%".replace('.', ',')]
alf = lambda x: [pc(x['metodo']), pc(x['p50']), pc(x['p95']), f"{x['percentil']*100:.1f}%".replace('.', ',')]
D['aleat'] = [['Atual', 'Total'] + al(a['aleatorias']), ['Atual', 'Fase B'] + alf(a['aleatorias_B']), ['Atual', 'Fase A'] + alf(a['aleatorias_A']),
              ['Original', 'Total'] + al(a2['aleatorias']), ['Original', 'Fase B'] + alf(a2['aleatorias_B']), ['Original', 'Fase A'] + alf(a2['aleatorias_A'])]
D['outros'] = {k: {'beta': num(x['beta_trimestral']), 'hit_ib': pc(x['pct_trim_acima_ibov'], 0), 'hit_cdi': pc(x['pct_trim_acima_cdi'], 0), 'giro': pc(x['giro_medio'], 0)} for k, x in (('at', a), ('or', a2))}
G = {'bancos': 'Bancos e financeiras', 'seguradoras': 'Seguradoras', 'construcao': 'Construção civil', 'varejo': 'Varejo', 'energia_saneamento': 'Energia e saneamento',
     'mineracao_siderurgia': 'Mineração e siderurgia', 'industria': 'Indústria', 'transporte': 'Transporte', 'consumo_basico': 'Consumo básico', 'petroquimica': 'Petroquímica',
     'petroleo': 'Petróleo', 'holdings': 'Holdings', 'tecnologia_telecom': 'Tecnologia e telecom', 'saude_educacao': 'Saúde e educação', 'papel_celulose': 'Papel e celulose',
     'lazer_turismo': 'Lazer e turismo', 'agro_exportador': 'Agro exportador'}
sr = []
for g in ['bancos', 'seguradoras', 'energia_saneamento', 'mineracao_siderurgia', 'industria', 'transporte', 'construcao', 'varejo']:
    x1 = a['setores_regime'].loc[g] if g in a['setores_regime'].index else None; x2 = a2['setores_regime'].loc[g]
    sr.append([G[g]] + ([pc(x1['Queda']), pc(x1['Alta'])] if x1 is not None else ['excluído', 'excluído']) + [pc(x2['Queda']), pc(x2['Alta'])])
D['setores'] = sr
u = c1[c1.data == c1.data.max()].sort_values('peso', ascending=False)
D['atual'] = [[r.ticker, G.get(r.grupo, r.grupo), r.setor, pc(r.peso), num(r.igov, 0), num(r.pl, 1) if pd.notna(r.pl) else '—'] for r in u.itertuples()]
u2 = c2[c2.data == c2.data.max()].sort_values('peso', ascending=False)
D['atual_or'] = ', '.join(f'{r.ticker} ({G.get(r.grupo, r.grupo).lower()})' for r in u2.itertuples())
D['data_ult'] = f'{c1.data.max():%d/%m/%Y}'
an1 = n1.resample('YE').last(); an1 = an1.pct_change().fillna(an1.iloc[0] / n1.iloc[0] - 1)
an2 = n2.resample('YE').last(); an2 = an2.pct_change().fillna(an2.iloc[0] / n2.iloc[0] - 1)
D['anos'] = [[str(d.year) + (' (até 21/10)' if d.year == 2026 else ''), pc(an1.loc[d, C0]), pc(an2.loc[d, C0]), pc(an1.loc[d, I]), pc(an1.loc[d, CDI])] for d in an1.index]
fr = c1.groupby('ticker').size().sort_values(ascending=False).head(12)
D['freq'] = ', '.join(f'{t} ({n})' for t, n in fr.items()); D['n_reb'] = int(c1.data.nunique())
json.dump(D, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(json.dumps(D['m'], ensure_ascii=False)); print(D['vit'], D['outros'], D['freq'], D['n_reb'])
