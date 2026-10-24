# patch178.py — SOLIDUNS v178 (24/10/2026): botão "Baixar PDF / imprimir" no Alvos SOLIDUNS
#
# Pedido do Thiago (24/10, 00h41): inserir "BAIXAR PDF - IMPRIMIR" na seção Alvos SOLIDUNS.
#   1. Novo módulo site/fontes/v178_alvos_pdf.js, publicado como /assets/sol-<md5>.js, depois do v174.
#      Gera o PDF da lista que está na tela (mesmos filtros, cenário e ordem): capa SOLIDUNS com resumo e aviso,
#      tabela completa com os alertas por extenso e "Como ler os alvos".
#   2. index.html: só o <script> do módulo e a linha de comentário. Cabeçalho e logo do site não mudam.
#
# Uso (a partir da pasta site/):  python3 patch178.py   -> aplica em publicar/ (recusa aplicar duas vezes)
import hashlib, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(AQUI, 'publicar', 'index.html')
FONTE = os.path.join(AQUI, 'fontes', 'v178_alvos_pdf.js')

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

def main():
    s = open(INDEX, encoding='utf-8').read()
    if 'v178 (24/10/2026)' in s:
        sys.exit('v178 já aplicada em publicar/index.html')
    m = re.search(r'<!-- v174 \(23/10/2026\): correções de layout para celular e tablet \(Equipe[^\n]*-->\n<script src="/assets/(sol-[0-9a-f]{10}\.js)" charset="utf-8"></script>', s)
    assert m, 'v174 não encontrada no index.html'
    js = open(FONTE, encoding='utf-8').read().encode('utf-8')
    nome = 'sol-' + hashlib.md5(js).hexdigest()[:10] + '.js'
    open(os.path.join(AQUI, 'publicar', 'assets', nome), 'wb').write(js)
    s = troca(s, m.group(0), m.group(0) + '\n\n'
              '<!-- v178 (24/10/2026): Alvos SOLIDUNS — botão "Baixar PDF / imprimir" com a lista da tela; fonte em site/fontes/ -->\n'
              f'<script src="/assets/{nome}" charset="utf-8"></script>')
    s = troca(s, '<!-- v177 (24/10/2026):', '<!-- v178 (24/10/2026): Alvos SOLIDUNS — botão "Baixar PDF / imprimir" (capa, resumo, tabela completa e como ler) -->\n<!-- v177 (24/10/2026):')
    open(INDEX, 'w', encoding='utf-8').write(s)
    print('v178 aplicada:', nome)

if __name__ == '__main__':
    main()
