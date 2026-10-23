# patch172.py — SOLIDUNS v172 (23/10/2026): aba Opções no Mercado financeiro (mercado brasileiro)
#
# Pedido do Thiago (23/10 16h09 "aprovado - siga"): ferramenta de análise de opções da B3 numa aba própria, logo
# depois de "Ações", com o menu Opções do dia · Grade de opções · Simulador de estratégias · Calculadora de opções ·
# Tudo sobre opções. Nesta versão: Opções do dia (mesmo layout das Cotações de fechamento) e Calculadora; os outros
# três itens aparecem com o selo EM BREVE.
#   1. Novo módulo site/fontes/v172_opcoes.js, publicado como /assets/sol-<md5>.js. Dados das RPCs opcoes_br_pregoes e
#      opcoes_br_pregao (SQL 187), gravadas pelo workflow "Mercado - opções B3".
#   2. index.html: a aba Opções na barra do Mercado financeiro (só no mercado brasileiro) e o <script> do módulo,
#      depois do v171. Cabeçalho e logo do site: intocados.
#
# Uso (a partir da pasta site/):  python3 patch172.py   -> aplica em publicar/ (recusa aplicar duas vezes)
import hashlib, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(AQUI, 'publicar', 'index.html')
FONTE = os.path.join(AQUI, 'fontes', 'v172_opcoes.js')

ABA = '''        <!-- v172: aba Opções (mercado brasileiro) — calls e puts da B3 -->
        <div class="mf-item-wrap" data-mercado="br">
          <button type="button" class="mf-item" data-menu="opcoes" id="mf-item-opcoes">Opções</button>
          <div class="mf-dropdown" id="mf-dd-opcoes">
            <a href="#" class="mf-link" data-acao="opcoes-do-dia">Opções do dia</a>
            <a href="#" class="mf-link" data-acao="opcoes-grade">Grade de opções <span class="op-embreve">EM BREVE</span></a>
            <a href="#" class="mf-link" data-acao="opcoes-simulador">Simulador de estratégias <span class="op-embreve">EM BREVE</span></a>
            <a href="#" class="mf-link" data-acao="opcoes-calculadora">Calculadora de opções</a>
            <a href="#" class="mf-link" data-acao="opcoes-tudo-sobre">Tudo sobre opções <span class="op-embreve">EM BREVE</span></a>
          </div>
        </div>

'''

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

def main():
    s = open(INDEX, encoding='utf-8').read()
    if 'v172 (23/10/2026)' in s:
        sys.exit('v172 já aplicada em publicar/index.html')
    m = re.search(r'<!-- v171 \(23/10/2026\): Alvos SOLIDUNS —[^\n]*-->\n<script src="/assets/(sol-[0-9a-f]{10}\.js)" charset="utf-8"></script>', s)
    assert m, 'v171 não encontrada no index.html'
    js = open(FONTE, encoding='utf-8').read().encode('utf-8')
    nome = 'sol-' + hashlib.md5(js).hexdigest()[:10] + '.js'
    open(os.path.join(AQUI, 'publicar', 'assets', nome), 'wb').write(js)
    s = troca(s, m.group(0), m.group(0) + '\n\n'
              '<!-- v172 (23/10/2026): aba Opções — Opções do dia e Calculadora de opções (SQL 187); fonte em site/fontes/ -->\n'
              f'<script src="/assets/{nome}" charset="utf-8"></script>')
    fiis = '''        <div class="mf-item-wrap" data-mercado="br">
          <button type="button" class="mf-item" data-menu="fiis">FIIs</button>'''
    s = troca(s, fiis, ABA + fiis)
    s = troca(s, '<!-- BARRA Internacional | Ações | FIIs | Fundos | Outros | Revisão de carteira -->',
              '<!-- BARRA Internacional | Ações | Opções | FIIs | Fundos | Outros | Revisão de carteira -->')
    s = troca(s, '<!-- v171 (23/10/2026): Alvos SOLIDUNS em Mercado financeiro › Ações (SQL 186) -->',
              '<!-- v172 (23/10/2026): aba Opções no Mercado financeiro — Opções do dia e Calculadora (SQL 187) -->\n'
              '<!-- v171 (23/10/2026): Alvos SOLIDUNS em Mercado financeiro › Ações (SQL 186) -->')
    open(INDEX, 'w', encoding='utf-8').write(s)
    print('v172 aplicada:', nome)

if __name__ == '__main__':
    main()
