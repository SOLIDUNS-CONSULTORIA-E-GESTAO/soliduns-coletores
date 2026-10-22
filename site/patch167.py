# patch167.py — SOLIDUNS v167 (22/10/2026): página "Carteira SOLIDUNS" (risco Brasil e risco político)
#
# Pedido do Thiago (22/10 14h09, "pode seguir para a próxima pendência"): mostrar no site o resultado do robô de seleção
# de carteira (pasta selecao/, gravado pela migration 182). Mercado financeiro › Ações (mercado brasileiro) › Carteira SOLIDUNS.
#   1. Novo módulo site/fontes/v167_carteira_soliduns.js, publicado como /assets/sol-<md5>.js (mesma regra de nome dos outros).
#      Não altera nenhum arquivo existente em /assets/: encaixa-se por fora (rota e clique), como o v134.
#   2. index.html: item "Carteira SOLIDUNS" no menu Ações do mercado BRASILEIRO (logo abaixo do Radar) e o <script> do módulo.
#   3. Rota: #/investimentos/mercado-financeiro/carteira-soliduns
# Login obrigatório (o banco confere). Administrador-mestre vê a prévia e publica; assinante vê só a última publicada.
# Cabeçalho e logo do site: intocados.
#
# Uso (a partir da pasta site/):  python3 patch167.py           -> aplica em publicar/ (idempotente: recusa aplicar duas vezes)
import hashlib, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(AQUI, 'publicar', 'index.html')
FONTE = os.path.join(AQUI, 'fontes', 'v167_carteira_soliduns.js')

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

def main():
    s = open(INDEX, encoding='utf-8').read()
    if 'data-acao="carteira-soliduns"' in s:
        sys.exit('v167 já aplicada em publicar/index.html')
    js = open(FONTE, encoding='utf-8').read().encode('utf-8')
    nome = 'sol-' + hashlib.md5(js).hexdigest()[:10] + '.js'
    open(os.path.join(AQUI, 'publicar', 'assets', nome), 'wb').write(js)

    # menu Ações do mercado brasileiro (o 1º Radar é o do menu BR; o 2º, do menu EUA, fica como está)
    radar = '<a href="#" class="mf-link rx-item" data-acao="radar-exponencial">Radar de Ações Exponenciais <span class="ra-selo rx-selo">RADAR</span></a>'
    assert s.count(radar) == 2, 'menu do Radar mudou'
    i = s.index(radar)
    assert s.rfind('data-mercado="br"', 0, i) > s.rfind('data-mercado="us"', 0, i), 'o 1º Radar não está no menu BR'
    item = ('\n            <a href="#" class="mf-link sc-item" data-acao="carteira-soliduns">Carteira SOLIDUNS '
            '<span class="ra-selo sc-selo">CARTEIRA</span></a>')
    s = s[:i + len(radar)] + item + s[i + len(radar):]

    # script do módulo, depois do último módulo (v123/v134/v136)
    s = troca(s, '<script src="/assets/sol-6651cc3e74.js" charset="utf-8"></script>',
              '<script src="/assets/sol-6651cc3e74.js" charset="utf-8"></script>\n\n'
              '<!-- v167 (22/10/2026): Carteira SOLIDUNS (risco Brasil e risco político) — SQL 182; fonte em site/fontes/ -->\n'
              f'<script src="/assets/{nome}" charset="utf-8"></script>')
    s = troca(s, '<!-- v165-LEI (15/10/2026): index leve; código, estilos e imagens em /assets/ -->',
              '<!-- v167 (22/10/2026): Carteira SOLIDUNS em Mercado financeiro › Ações (SQL 182) -->\n'
              '<!-- v165-LEI (15/10/2026): index leve; código, estilos e imagens em /assets/ -->')
    open(INDEX, 'w', encoding='utf-8').write(s)
    print('v167 aplicada:', nome)

if __name__ == '__main__':
    main()
