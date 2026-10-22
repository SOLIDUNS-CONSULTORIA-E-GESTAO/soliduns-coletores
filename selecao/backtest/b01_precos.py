"""Converte os COTAHIST da B3 (2000–2026) numa base compacta: mercado à vista, lote padrão."""
import glob, os, sys, zipfile
import pandas as pd

RAW = sys.argv[1]; OUT = sys.argv[2]
partes = []
for f in sorted(glob.glob(os.path.join(RAW, 'COTAHIST_A*.ZIP'))):
    z = zipfile.ZipFile(f)
    reg = []
    with z.open(z.namelist()[0]) as fh:
        for l in fh:
            l = l.decode('latin-1')
            if l[:2] != '01' or l[24:27] != '010':
                continue
            bdi = l[10:12]; cod = l[12:24].strip()
            if bdi != '02' and cod != 'BOVA11':
                continue
            fat = int(l[210:217] or 1) or 1
            reg.append((l[2:10], cod, l[27:39].strip(), l[39:49].strip(), int(l[108:121]) / 100 / fat,
                        int(l[170:188]) / 100, l[230:242], int(l[242:245] or 0)))
    df = pd.DataFrame(reg, columns=['data', 'ticker', 'nome', 'especi', 'fech', 'volume', 'isin', 'dismes'])
    df['data'] = pd.to_datetime(df['data'], format='%Y%m%d')
    partes.append(df)
    print(os.path.basename(f), len(df), df['ticker'].nunique(), flush=True)
p = pd.concat(partes, ignore_index=True).drop_duplicates(['data', 'ticker'], keep='last')
p.to_parquet(OUT, index=False)
print('total', len(p), p['data'].min().date(), p['data'].max().date())
