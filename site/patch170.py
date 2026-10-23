# patch170.py — SOLIDUNS v170 (23/10/2026): Mercado americano com o mesmo layout de Cotações de fechamento do brasileiro
#
# Pedido do Thiago (23/10): o mesmo buscador de datas no "Mercado americano"; tudo que for feito no mercado brasileiro
# é espelhado no americano.
#   1. Novo módulo site/fontes/v170_cotacoes_us.js, publicado como /assets/sol-<md5>.js. Encaixa-se por fora:
#      envolve renderizarCotacoes e desenha a seção americana igual à brasileira (título com o pregão, caixa "Pregão",
#      filtro de liquidez de US$ 5 milhões, contagem, "Ver todos", tabela completa com busca e ordenação, rodapé).
#      Dados das RPCs cotacoes_us_pregoes e cotacoes_us_pregao (SQL 185). Sem o SQL 185, a seção fica como antes.
#   2. index.html: só o <script> do módulo, depois do v169. Cabeçalho e logo do site: intocados.
#
# Uso (a partir da pasta site/):  python3 patch170.py   -> aplica em publicar/ (recusa aplicar duas vezes)
import hashlib, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(AQUI, 'publicar', 'index.html')
FONTE = os.path.join(AQUI, 'fontes', 'v170_cotacoes_us.js')

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

def main():
    s = open(INDEX, encoding='utf-8').read()
    if 'v170 (23/10/2026)' in s:
        sys.exit('v170 já aplicada em publicar/index.html')
    m = re.search(r'<!-- v169 \(23/10/2026\): Cotações de fechamento — escolha[^\n]*-->\n<script src="/assets/(sol-[0-9a-f]{10}\.js)" charset="utf-8"></script>', s)
    assert m, 'v169 não encontrada no index.html'
    js = open(FONTE, encoding='utf-8').read().encode('utf-8')
    nome = 'sol-' + hashlib.md5(js).hexdigest()[:10] + '.js'
    open(os.path.join(AQUI, 'publicar', 'assets', nome), 'wb').write(js)
    s = troca(s, m.group(0), m.group(0) + '\n\n'
              '<!-- v170 (23/10/2026): Mercado americano — Cotações de fechamento com o layout do brasileiro (SQL 185); fonte em site/fontes/ -->\n'
              f'<script src="/assets/{nome}" charset="utf-8"></script>')
    s = troca(s, '<!-- v169 (23/10/2026): Cotações de fechamento com escolha da data do pregão (SQL 184) -->',
              '<!-- v170 (23/10/2026): Mercado americano com o mesmo layout e a escolha da data do pregão (SQL 185) -->\n'
              '<!-- v169 (23/10/2026): Cotações de fechamento com escolha da data do pregão (SQL 184) -->')
    open(INDEX, 'w', encoding='utf-8').write(s)
    print('v170 aplicada:', nome)

if __name__ == '__main__':
    main()
