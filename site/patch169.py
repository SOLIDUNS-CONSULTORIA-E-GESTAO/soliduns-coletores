# patch169.py — SOLIDUNS v169 (23/10/2026): Cotações de fechamento com escolha da data do pregão
#
# Pedido do Thiago (23/10 11h53): combobox de datas na seção "Cotações de fechamento" para ver as maiores altas,
# baixas e mais negociadas do pregão escolhido.
#   1. Novo módulo site/fontes/v169_cotacoes_data.js, publicado como /assets/sol-<md5>.js. Encaixa-se por fora:
#      envolve renderizarCotacoesEOD (v18) e põe a caixa "Pregão" antes do filtro de liquidez. Pregões anteriores vêm
#      das RPCs cotacoes_br_pregoes e cotacoes_br_pregao (SQL 184).
#   2. index.html: só o <script> do módulo, depois do v168. Cabeçalho e logo do site: intocados.
#
# Uso (a partir da pasta site/):  python3 patch169.py   -> aplica em publicar/ (recusa aplicar duas vezes)
import hashlib, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(AQUI, 'publicar', 'index.html')
FONTE = os.path.join(AQUI, 'fontes', 'v169_cotacoes_data.js')

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

def main():
    s = open(INDEX, encoding='utf-8').read()
    if 'v169 (23/10/2026)' in s:
        sys.exit('v169 já aplicada em publicar/index.html')
    m = re.search(r'<!-- v168 \(23/10/2026\): Radar[^\n]*-->\n<script src="/assets/(sol-[0-9a-f]{10}\.js)" charset="utf-8"></script>', s)
    assert m, 'v168 não encontrada no index.html'
    js = open(FONTE, encoding='utf-8').read().encode('utf-8')
    nome = 'sol-' + hashlib.md5(js).hexdigest()[:10] + '.js'
    open(os.path.join(AQUI, 'publicar', 'assets', nome), 'wb').write(js)
    s = troca(s, m.group(0), m.group(0) + '\n\n'
              '<!-- v169 (23/10/2026): Cotações de fechamento — escolha da data do pregão (SQL 184); fonte em site/fontes/ -->\n'
              f'<script src="/assets/{nome}" charset="utf-8"></script>')
    s = troca(s, '<!-- v168 (23/10/2026): Radar de Ações Exponenciais com o Score Exponencial v1.0.5 (SQL 183) -->',
              '<!-- v169 (23/10/2026): Cotações de fechamento com escolha da data do pregão (SQL 184) -->\n'
              '<!-- v168 (23/10/2026): Radar de Ações Exponenciais com o Score Exponencial v1.0.5 (SQL 183) -->')
    open(INDEX, 'w', encoding='utf-8').write(s)
    print('v169 aplicada:', nome)

if __name__ == '__main__':
    main()
