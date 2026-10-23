# patch173.py — SOLIDUNS v173 (23/10/2026): a plataforma como app no celular (iPhone pelo Safari, Android pelo Chrome)
#
# Pedido do Thiago (23/10 17h00): versão mobile pelo Safari, sem conta de desenvolvedor da Apple. O site vira app
# instalável ("Adicionar à Tela de Início"): ícone, tela de abertura, tela cheia, aviso de instalação, botão Voltar no
# modo app e ajustes de toque.
#   1. Arquivos novos em publicar/: manifest.webmanifest, sw.js (service worker) e app/ (ícones e telas de abertura,
#      gerados a partir de logo-soliduns.png, que não muda).
#   2. Novo módulo site/fontes/v173_app.js, publicado como /assets/sol-<md5>.js, depois do v172.
#   3. index.html, só no <head>: manifest, ícone do iPhone, metas do modo app e telas de abertura. Cabeçalho e logo do
#      site: intocados.
#
# Uso (a partir da pasta site/):  python3 patch173.py   -> aplica em publicar/ (recusa aplicar duas vezes)
import hashlib, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(AQUI, 'publicar', 'index.html')
FONTE = os.path.join(AQUI, 'fontes', 'v173_app.js')
TELAS = [(1320, 2868, 3), (1206, 2622, 3), (1290, 2796, 3), (1179, 2556, 3), (1284, 2778, 3), (1170, 2532, 3), (1125, 2436, 3),
         (1242, 2688, 3), (828, 1792, 2), (750, 1334, 2), (640, 1136, 2)]

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

def main():
    s = open(INDEX, encoding='utf-8').read()
    if 'v173 (23/10/2026)' in s:
        sys.exit('v173 já aplicada em publicar/index.html')
    for f in ['manifest.webmanifest', 'sw.js', 'app/icone-180.png'] + [f'app/abertura-{w}x{h}.png' for w, h, _ in TELAS]:
        assert os.path.exists(os.path.join(AQUI, 'publicar', f)), 'falta publicar/' + f
    m = re.search(r'<!-- v172 \(23/10/2026\): aba Opções —[^\n]*-->\n<script src="/assets/(sol-[0-9a-f]{10}\.js)" charset="utf-8"></script>', s)
    assert m, 'v172 não encontrada no index.html'
    js = open(FONTE, encoding='utf-8').read().encode('utf-8')
    nome = 'sol-' + hashlib.md5(js).hexdigest()[:10] + '.js'
    open(os.path.join(AQUI, 'publicar', 'assets', nome), 'wb').write(js)
    s = troca(s, m.group(0), m.group(0) + '\n\n'
              '<!-- v173 (23/10/2026): a plataforma como app no celular (iPhone e Android); fonte em site/fontes/ -->\n'
              f'<script src="/assets/{nome}" charset="utf-8"></script>')
    telas = '\n'.join(f'<link rel="apple-touch-startup-image" href="/app/abertura-{w}x{h}.png" media="(device-width: {w // d}px) and (device-height: {h // d}px) '
                      f'and (-webkit-device-pixel-ratio: {d}) and (orientation: portrait)">' for w, h, d in TELAS)
    s = troca(s, '<link rel="apple-touch-icon" href="/logo-soliduns.png">',
              '<!-- v173: app no celular (Adicionar à Tela de Início) -->\n'
              '<link rel="manifest" href="/manifest.webmanifest">\n'
              '<link rel="apple-touch-icon" href="/app/icone-180.png">\n'
              '<meta name="apple-mobile-web-app-capable" content="yes">\n'
              '<meta name="mobile-web-app-capable" content="yes">\n'
              '<meta name="apple-mobile-web-app-status-bar-style" content="black">\n'
              '<meta name="apple-mobile-web-app-title" content="SOLIDUNS">\n'
              '<meta name="application-name" content="SOLIDUNS">\n'
              '<meta name="format-detection" content="telephone=no">\n' + telas)
    s = troca(s, '<!-- v172 (23/10/2026): aba Opções no Mercado financeiro — Opções do dia e Calculadora (SQL 187) -->',
              '<!-- v173 (23/10/2026): a plataforma como app no celular — iPhone pelo Safari e Android pelo Chrome -->\n'
              '<!-- v172 (23/10/2026): aba Opções no Mercado financeiro — Opções do dia e Calculadora (SQL 187) -->')
    open(INDEX, 'w', encoding='utf-8').write(s)
    print('v173 aplicada:', nome)

if __name__ == '__main__':
    main()
