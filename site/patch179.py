# patch179.py — SOLIDUNS v179 (24/10/2026): botão "Baixar PDF / imprimir" do Alvos SOLIDUNS no topo, ao lado do título
#
# Pedido do Thiago (24/10, 01h53): "INSIRA O BOTÃO MAIS VISÍVEL POSSÍVEL".
#   1. Novo módulo site/fontes/v179_alvos_pdf_topo.js, publicado como /assets/sol-<md5>.js, depois do v178:
#      o botão "Baixar PDF / imprimir" vai para a linha do título "Alvos SOLIDUNS", maior e com ícone.
#   2. index.html: só o <script> do módulo e a linha de comentário. Cabeçalho e logo do site não mudam.
#
# Uso (a partir da pasta site/):  python3 patch179.py   -> aplica em publicar/ (recusa aplicar duas vezes)
import hashlib, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(AQUI, 'publicar', 'index.html')
FONTE = os.path.join(AQUI, 'fontes', 'v179_alvos_pdf_topo.js')

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

def main():
    s = open(INDEX, encoding='utf-8').read()
    if 'v179 (24/10/2026)' in s:
        sys.exit('v179 já aplicada em publicar/index.html')
    m = re.search(r'<!-- v178 \(24/10/2026\): Alvos SOLIDUNS — botão "Baixar PDF / imprimir" com a lista da tela; fonte em site/fontes/ -->\n<script src="/assets/(sol-[0-9a-f]{10}\.js)" charset="utf-8"></script>', s)
    assert m, 'v178 não encontrada no index.html'
    js = open(FONTE, encoding='utf-8').read().encode('utf-8')
    nome = 'sol-' + hashlib.md5(js).hexdigest()[:10] + '.js'
    open(os.path.join(AQUI, 'publicar', 'assets', nome), 'wb').write(js)
    s = troca(s, m.group(0), m.group(0) + '\n\n'
              '<!-- v179 (24/10/2026): Alvos SOLIDUNS — botão "Baixar PDF / imprimir" no topo, ao lado do título; fonte em site/fontes/ -->\n'
              f'<script src="/assets/{nome}" charset="utf-8"></script>')
    s = troca(s, '<!-- v178 (24/10/2026): Alvos SOLIDUNS — botão "Baixar PDF / imprimir" (capa', '<!-- v179 (24/10/2026): Alvos SOLIDUNS — botão "Baixar PDF / imprimir" no topo, ao lado do título, maior e com ícone -->\n<!-- v178 (24/10/2026): Alvos SOLIDUNS — botão "Baixar PDF / imprimir" (capa')
    open(INDEX, 'w', encoding='utf-8').write(s)
    print('v179 aplicada:', nome)

if __name__ == '__main__':
    main()
