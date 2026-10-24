# patch180.py — SOLIDUNS v180 (24/10/2026): correções de menus e rotas da auditoria (A a K), aprovadas pelo Thiago
#
# Auditoria de menus e rotas de 24/10 (robô site/testes/auditoria_menus_rotas.js), aprovada às 02h55 ("APROVADO - SIGA").
#   1. Novo módulo site/fontes/v180_menus_rotas.js, publicado como /assets/sol-<md5>.js, depois do v179 (lista A a K no topo do módulo).
#   2. index.html: só o <script> do módulo e a linha de comentário. Textos, logo e cores do cabeçalho não mudam.
#
# Uso (a partir da pasta site/):  python3 patch180.py   -> aplica em publicar/ (recusa aplicar duas vezes)
import hashlib, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(AQUI, 'publicar', 'index.html')
FONTE = os.path.join(AQUI, 'fontes', 'v180_menus_rotas.js')

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

def main():
    s = open(INDEX, encoding='utf-8').read()
    if 'v180 (24/10/2026)' in s:
        sys.exit('v180 já aplicada em publicar/index.html')
    m = re.search(r'<!-- v179 \(24/10/2026\)[^\n]*fonte em site/fontes/ -->\n<script src="/assets/(sol-[0-9a-f]{10}\.js)" charset="utf-8"></script>', s)
    assert m, 'script da v179 não encontrado no index.html'
    js = open(FONTE, encoding='utf-8').read().encode('utf-8')
    nome = 'sol-' + hashlib.md5(js).hexdigest()[:10] + '.js'
    open(os.path.join(AQUI, 'publicar', 'assets', nome), 'wb').write(js)
    s = troca(s, m.group(0), m.group(0) + '\n\n'
              '<!-- v180 (24/10/2026): menus e rotas — correções A a K da auditoria; fonte em site/fontes/ -->\n'
              f'<script src="/assets/{nome}" charset="utf-8"></script>')
    s = troca(s, '<head>\n<!-- v179 (24/10/2026):', '<head>\n<!-- v180 (24/10/2026): menus e rotas — Serviços com lista em todas as páginas, recarga e links diretos, Contato, Nosso Time, Equipe, Investimentos da Gestão, login com volta à página pedida, página não encontrada, Voltar e Busca avançada -->\n<!-- v179 (24/10/2026):')
    open(INDEX, 'w', encoding='utf-8').write(s)
    print('v180 aplicada:', nome)

if __name__ == '__main__':
    main()
