# patch168.py — SOLIDUNS v168 (23/10/2026): Radar de Ações Exponenciais com o Score Exponencial v1.0.5
#
# Pedido do Thiago (23/10 00h05): "concluir a ferramenta e inserir na plataforma, sem publicar no Telegram".
#   1. Novo módulo site/fontes/v168_radar_exponencial.js, publicado como /assets/sol-<md5>.js. Redefine as funções da
#      página do Radar (v123): 4 pilares da metodologia v1.0.5, aviso "Ranking em calibração" (o teste histórico não
#      passou nos critérios), colunas dos 4 pilares, filtro "Só a carteira do Radar" e, para o administrador, a prévia
#      mensal e o acompanhamento em tempo real (SQL 183).
#   2. index.html: só o <script> do módulo, depois do v167. Cabeçalho e logo do site: intocados. Nada vai ao Telegram.
#
# Uso (a partir da pasta site/):  python3 patch168.py   -> aplica em publicar/ (recusa aplicar duas vezes)
import hashlib, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(AQUI, 'publicar', 'index.html')
FONTE = os.path.join(AQUI, 'fontes', 'v168_radar_exponencial.js')

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

def main():
    s = open(INDEX, encoding='utf-8').read()
    if 'v168 (23/10/2026)' in s:
        sys.exit('v168 já aplicada em publicar/index.html')
    js = open(FONTE, encoding='utf-8').read().encode('utf-8')
    nome = 'sol-' + hashlib.md5(js).hexdigest()[:10] + '.js'
    open(os.path.join(AQUI, 'publicar', 'assets', nome), 'wb').write(js)
    s = troca(s, '<script src="/assets/sol-941ea30244.js" charset="utf-8"></script>',
              '<script src="/assets/sol-941ea30244.js" charset="utf-8"></script>\n\n'
              '<!-- v168 (23/10/2026): Radar de Ações Exponenciais com o Score Exponencial v1.0.5 — SQL 183; fonte em site/fontes/ -->\n'
              f'<script src="/assets/{nome}" charset="utf-8"></script>')
    s = troca(s, '<!-- v167 (22/10/2026): Carteira SOLIDUNS em Mercado financeiro › Ações (SQL 182) -->',
              '<!-- v168 (23/10/2026): Radar de Ações Exponenciais com o Score Exponencial v1.0.5 (SQL 183) -->\n'
              '<!-- v167 (22/10/2026): Carteira SOLIDUNS em Mercado financeiro › Ações (SQL 182) -->')
    open(INDEX, 'w', encoding='utf-8').write(s)
    print('v168 aplicada:', nome)

if __name__ == '__main__':
    main()
