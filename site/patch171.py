# patch171.py — SOLIDUNS v171 (23/10/2026): página "Alvos SOLIDUNS" (entrada, stop e preço-alvo das ações da B3)
#
# Pedido do Thiago (23/10 13h16, "aprovado - siga"): ferramenta de rastreamento dos maiores alvos, em
# Mercado financeiro › Ações (mercado brasileiro), logo abaixo de "Carteira SOLIDUNS".
#   1. Novo módulo site/fontes/v171_alvos_soliduns.js, publicado como /assets/sol-<md5>.js. Encaixa-se por fora (rota e
#      clique), como o v167. Dados da RPC alvos_publico (SQL 186), gravados pelo robô selecao/robo_selecao.py.
#   2. index.html: item "Alvos SOLIDUNS" no menu Ações do mercado BRASILEIRO, logo abaixo de "Carteira SOLIDUNS",
#      e o <script> do módulo depois do v170.
#   3. Rota: #/investimentos/mercado-financeiro/alvos-soliduns
# Login obrigatório (o banco confere). Administrador-mestre vê a prévia e publica; assinante vê só a última publicada.
# Cabeçalho e logo do site: intocados.
#
# Uso (a partir da pasta site/):  python3 patch171.py   -> aplica em publicar/ (recusa aplicar duas vezes)
import hashlib, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(AQUI, 'publicar', 'index.html')
FONTE = os.path.join(AQUI, 'fontes', 'v171_alvos_soliduns.js')

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

def main():
    s = open(INDEX, encoding='utf-8').read()
    if 'data-acao="alvos-soliduns"' in s:
        sys.exit('v171 já aplicada em publicar/index.html')
    js = open(FONTE, encoding='utf-8').read().encode('utf-8')
    nome = 'sol-' + hashlib.md5(js).hexdigest()[:10] + '.js'
    open(os.path.join(AQUI, 'publicar', 'assets', nome), 'wb').write(js)

    cart = '<a href="#" class="mf-link sc-item" data-acao="carteira-soliduns">Carteira SOLIDUNS <span class="ra-selo sc-selo">CARTEIRA</span></a>'
    assert s.count(cart) == 1, 'item Carteira SOLIDUNS não encontrado (ou repetido)'
    i = s.index(cart) + len(cart)
    s = s[:i] + ('\n            <a href="#" class="mf-link al-item" data-acao="alvos-soliduns">Alvos SOLIDUNS '
                 '<span class="ra-selo al-selo">ALVOS</span></a>') + s[i:]

    m = re.search(r'<!-- v170 \(23/10/2026\): Mercado americano — Cotações[^\n]*-->\n<script src="/assets/(sol-[0-9a-f]{10}\.js)" charset="utf-8"></script>', s)
    assert m, 'script da v170 não encontrado no index.html'
    s = troca(s, m.group(0), m.group(0) + '\n\n'
              '<!-- v171 (23/10/2026): Alvos SOLIDUNS — entrada, stop e preço-alvo das ações da B3 (SQL 186); fonte em site/fontes/ -->\n'
              f'<script src="/assets/{nome}" charset="utf-8"></script>')
    s = troca(s, '<!-- v170 (23/10/2026): Mercado americano com o mesmo layout e a escolha da data do pregão (SQL 185) -->',
              '<!-- v171 (23/10/2026): Alvos SOLIDUNS em Mercado financeiro › Ações (SQL 186) -->\n'
              '<!-- v170 (23/10/2026): Mercado americano com o mesmo layout e a escolha da data do pregão (SQL 185) -->')
    open(INDEX, 'w', encoding='utf-8').write(s)
    print('v171 aplicada:', nome)

if __name__ == '__main__':
    main()
