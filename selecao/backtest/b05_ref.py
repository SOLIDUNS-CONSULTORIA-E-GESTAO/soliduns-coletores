"""Cadastro para o backtest: código -> CNPJ, setor, controle, free float e conselho por ano, processos na CVM."""
import glob, os, re, sys, unicodedata, zipfile
import pandas as pd

CVM, PRECOS, PS, OUT = sys.argv[1:5]
def rd(z, trecho):
    with zipfile.ZipFile(z) as f:
        for n in f.namelist():
            if trecho in n:
                return pd.read_csv(f.open(n), sep=';', encoding='latin-1', dtype=str, keep_default_na=False)
    return pd.DataFrame()
def sem(s): return re.sub(r'[^a-z0-9 ]', ' ', unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower())

anos = range(2010, 2027)
raiz, controle, ff, cons = {}, {}, {}, {}
for y in anos:
    fca = os.path.join(CVM, f'fca_cia_aberta_{y}.zip')
    if os.path.exists(fca):
        vm = rd(fca, '_valor_mobiliario_')
        for r in vm.itertuples():
            cod = r.Codigo_Negociacao.strip().upper()
            if re.fullmatch(r'[A-Z][A-Z0-9]{3}(3|4|5|6|7|8|11)', cod):
                raiz[cod[:4]] = r.CNPJ_Companhia
        ge = rd(fca, '_geral_')
        for r in ge.itertuples():
            controle[(r.CNPJ_Companhia, y)] = r.Especie_Controle_Acionario
    fre = os.path.join(CVM, f'fre_cia_aberta_{y}.zip')
    if os.path.exists(fre):
        d = rd(fre, '_distribuicao_capital_2')
        for r in d.itertuples():
            v = pd.to_numeric(r.Percentual_Total_Acoes_Circulacao, errors='coerce')
            if pd.notna(v): ff[(r.CNPJ_Companhia, y)] = float(v)
        a = rd(fre, '_administrador_membro_conselho_fiscal_')
        if not a.empty:
            a = a[a['Orgao_Administracao'].str.contains('Conselho de Administra', na=False) & ~a['Cargo_Eletivo_Ocupado'].str.contains('Suplente', na=False)]
            for cnpj, g in a.groupby('CNPJ_Companhia'):
                cons[(cnpj, y)] = g['Cargo_Eletivo_Ocupado'].str.contains('Independente', na=False).mean()
    print(y, len(raiz), flush=True)

cad = pd.read_csv(os.path.join(CVM, 'cad_cia_aberta.csv'), sep=';', encoding='latin-1', dtype=str, keep_default_na=False)
cad['ativo'] = cad['SIT'].str.upper().str.startswith('ATIV')
cad = cad.sort_values('ativo')
setor = {r.CNPJ_CIA: r.SETOR_ATIV for r in cad.itertuples() if r.SETOR_ATIV}
ctl_cad = {r.CNPJ_CIA: r.CONTROLE_ACIONARIO for r in cad.itertuples() if r.CONTROLE_ACIONARIO}
nomes = [(sem(r.DENOM_COMERC or r.DENOM_SOCIAL), sem(r.DENOM_SOCIAL), r.CNPJ_CIA) for r in cad.itertuples()]

# códigos negociados antes de 2010 sem CNPJ no FCA: casamento pelo nome do pregão
p = pd.read_parquet(PRECOS, columns=['data', 'ticker', 'nome', 'volume'])
p = p[p['ticker'].str.match(r'^[A-Z][A-Z0-9]{3}(3|4|5|6|7|8|11)$')]
p['raiz'] = p['ticker'].str[:4]
liq = p.groupby('raiz').agg(nome=('nome', 'last'), vol=('volume', 'sum'))
faltam = liq[~liq.index.isin(raiz.keys())].sort_values('vol', ascending=False).head(400)
por_nome = {}
for rz, r in faltam.iterrows():
    n = sem(r['nome']).strip()
    if len(n) < 3: continue
    cand = [c for nc, ns, c in nomes if nc.startswith(n) or ns.startswith(n)]
    if len(set(cand)) == 1: por_nome[rz] = cand[0]
raiz_total = {**por_nome, **raiz}
print('raízes com CNPJ: FCA', len(raiz), '+ por nome', len(por_nome), '; sem CNPJ entre as 400 mais líquidas:', len(faltam) - len(por_nome))
# processos sancionadores (data de abertura) com a companhia entre os acusados
proc = rd(PS, 'processo_sancionador.csv'); acus = rd(PS, 'processo_sancionador_acusado.csv')
proc['abertura'] = pd.to_datetime(proc['Data_Abertura'], errors='coerce')
acus = acus.merge(proc[['NUP', 'abertura']], on='NUP')
nome_cnpj = {}
for nc, ns, c in nomes:
    nome_cnpj.setdefault(ns.strip(), c)
acus['cnpj'] = acus['Nome_Acusado'].map(lambda s: nome_cnpj.get(re.sub(r'\s+', ' ', sem(s)).strip()))
sanc = acus.dropna(subset=['cnpj'])[['cnpj', 'abertura']]
print('processos ligados a companhias:', len(sanc))
pd.to_pickle({'raiz': raiz_total, 'setor': setor, 'controle': controle, 'controle_cad': ctl_cad, 'free_float': ff,
              'conselho': cons, 'sancoes': sanc}, OUT)
