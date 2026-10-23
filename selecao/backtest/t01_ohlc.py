"""OHLC diário 2025–2026 do COTAHIST (mercado à vista, lote padrão)."""
import sys, zipfile, io
import pandas as pd
B, OUT = sys.argv[1], sys.argv[2]
rows = []
for ano in (2025, 2026):
    z = zipfile.ZipFile(f'{B}/raw/COTAHIST_A{ano}.ZIP'); txt = z.read(z.namelist()[0]).decode('latin1')
    for l in txt.splitlines():
        if not l.startswith('01') or l[24:27] != '010' or l[10:12] != '02': continue
        n = lambda a, b: int(l[a:b]) / 100
        rows.append((l[2:10], l[12:24].strip(), l[27:39].strip(), n(56, 69), n(69, 82), n(82, 95), n(108, 121), int(l[152:170]), n(170, 188), l[39:49].strip()))
d = pd.DataFrame(rows, columns=['data', 'ticker', 'nome', 'abe', 'max', 'min', 'fech', 'negocios', 'volume', 'especi'])
d['data'] = pd.to_datetime(d['data']); d.to_parquet(OUT); print(len(d), d.data.max())
