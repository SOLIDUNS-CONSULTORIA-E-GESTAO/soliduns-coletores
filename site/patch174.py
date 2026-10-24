# patch174.py — SOLIDUNS v174 (23/10/2026): correções de layout para celular e tablet
#
# Diagnóstico de 23/10 (94 telas x 9 larguras, sem alterar nada) aprovado pelo Thiago às 21h38 ("AUTORIZO TUDO"):
#   A. Equipe: tabelas viram cartões no celular.  B. Barra do topo no celular: "+ Novo registro" compacto, Equipe e Sair
#   dentro do ☰.  C. Barra do topo em tablet/telas médias: menu no ☰ quando não cabe.  D. Tabela da carteira com
#   rolagem própria e subtítulo do Alvos numa linha.  E. Botões maiores na Equipe.
#   1. Novo módulo site/fontes/v174_layout_mobile.js, publicado como /assets/sol-<md5>.js, depois do v173.
#   2. index.html: só o <script> do módulo. Nenhum texto, logo ou botão do cabeçalho muda (só a arrumação em telas
#      estreitas, feita pelo módulo).
#
# Uso (a partir da pasta site/):  python3 patch174.py   -> aplica em publicar/ (recusa aplicar duas vezes)
import hashlib, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(AQUI, 'publicar', 'index.html')
FONTE = os.path.join(AQUI, 'fontes', 'v174_layout_mobile.js')

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

def main():
    s = open(INDEX, encoding='utf-8').read()
    if 'v174 (23/10/2026)' in s:
        sys.exit('v174 já aplicada em publicar/index.html')
    m = re.search(r'<!-- v173 \(23/10/2026\): a plataforma como app[^\n]*-->\n<script src="/assets/(sol-[0-9a-f]{10}\.js)" charset="utf-8"></script>', s)
    assert m, 'v173 não encontrada no index.html'
    js = open(FONTE, encoding='utf-8').read().encode('utf-8')
    nome = 'sol-' + hashlib.md5(js).hexdigest()[:10] + '.js'
    open(os.path.join(AQUI, 'publicar', 'assets', nome), 'wb').write(js)
    s = troca(s, m.group(0), m.group(0) + '\n\n'
              '<!-- v174 (23/10/2026): correções de layout para celular e tablet (Equipe, barra do topo, carteira, Alvos); fonte em site/fontes/ -->\n'
              f'<script src="/assets/{nome}" charset="utf-8"></script>')
    s = troca(s, '<!-- v173 (23/10/2026): a plataforma como app no celular — iPhone pelo Safari e Android pelo Chrome -->',
              '<!-- v174 (23/10/2026): correções de layout para celular e tablet — Equipe, barra do topo, carteira e Alvos -->\n'
              '<!-- v173 (23/10/2026): a plataforma como app no celular — iPhone pelo Safari e Android pelo Chrome -->')
    open(INDEX, 'w', encoding='utf-8').write(s)
    print('v174 aplicada:', nome)

if __name__ == '__main__':
    main()
