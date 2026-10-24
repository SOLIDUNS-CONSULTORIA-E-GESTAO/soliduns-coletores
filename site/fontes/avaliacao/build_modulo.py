"""Gera 1_DEPLOY/avaliacao.html (módulo da plataforma SOLIDUNS) a partir do código-fonte da plataforma de avaliação.
Uso: python3 build_modulo.py <app.html fonte> <logo.b64> <saída avaliacao.html>"""
import sys
src, logo, out = sys.argv[1:4]
s = open(src, encoding='utf-8').read().replace('__LOGO__', open(logo).read().strip())
def troca(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: sys.exit(f'ERRO: esperado {n}, achei {c}: {a[:100]}')
    s = s.replace(a, b)
troca('const MODO_SOLIDUNS=false;', 'const MODO_SOLIDUNS=true;')
troca('<title>SOLIDUNS Avalia</title>', '<title>Avaliação de imóveis — SOLIDUNS</title>')
troca('family=Saira:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500',
      'family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600')
troca('const base="soliduns-avalia-v1"', 'const base="soliduns-aval-modulo-v1"')
# identidade visual da plataforma (preto, dourado #eec617, IBM Plex Sans, títulos em Source Serif 4)
PALETA = '''
/* ---------- identidade da plataforma SOLIDUNS (módulo embutido) ---------- */
:root:not([data-theme="light"]){--bg:#000000;--surface:#0d0d0c;--raised:#15130e;--line:#2e2a1e;--line-soft:#1f1c14;
 --fg:#f2ecd8;--muted:#a89f88;--faint:#6f6857;--accent:#eec617;--accent-ink:#0a0a0a;--accent-fg:#eec617;--accent-soft:rgba(238,198,23,.14);
 --ok:#3ecb99;--ok-soft:rgba(62,203,153,.14);--warn:#dba22a;--warn-soft:rgba(219,162,42,.14);--bad:#e2564f;--bad-soft:rgba(226,86,79,.14);
 --info:#7fb2d9;--info-soft:rgba(127,178,217,.14);--r:3px;--f-display:"Source Serif 4",Georgia,serif;color-scheme:dark}
body{background:var(--bg)}
h1,h2,h3{letter-spacing:0}
'''
i = s.index('</style>')
s = s[:i] + PALETA + s[i:]
s = ('<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8">'
     '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
     '<meta name="robots" content="noindex,nofollow">\n' + s + '\n</html>\n')
open(out, 'w', encoding='utf-8').write(s)
print('ok', out, len(s))
