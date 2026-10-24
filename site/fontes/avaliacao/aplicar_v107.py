"""
Avaliação de imóveis — aplica ao avaliacao.html do ramo AVA o mesmo ajuste tipográfico que o resto da plataforma
recebeu na v107 (texto justificado; alinhamentos próprios preservados pela variável --v107-alin).
É exatamente o que estava no avaliacao.html publicado no Netlify em 15/10/2026 (recuperado em 23/10).
Uso: python3 aplicar_v107.py avaliacao_original.html bloco_v107.css saida.html
"""
import re, sys
orig, bloco, saida = sys.argv[1:4]
s = open(orig, encoding='utf-8').read()
assert 'v107-justificado' not in s, 'já tem o ajuste v107'
partes = re.split(r'(<style[^>]*>.*?</style>)', s, flags=re.S)
n = 0
for i, p in enumerate(partes):
    if p.startswith('<style'):
        partes[i], k = re.subn(r'text-align:(left|right|center|justify|start|end)(?=[;}])', lambda m: m.group(0) + ';--v107-alin:' + m.group(1), p)
        n += k
    else:   # alinhamento escrito direto no atributo style="..." do HTML montado pelo módulo
        partes[i], k = re.subn(r'(style="[^"]*?)text-align:(left|right|center|justify|start|end)(?=[;"])',
                               lambda m: m.group(1) + 'text-align:' + m.group(2) + ';--v107-alin:' + m.group(2), p)
        n += k
s = ''.join(partes)
ancora = 'h1,h2,h3{letter-spacing:0}\n</style>\n\n<div id="app"></div>'
assert s.count(ancora) == 1, 'âncora do bloco v107 não encontrada'
s = s.replace(ancora, 'h1,h2,h3{letter-spacing:0}\n</style>\n' + open(bloco, encoding='utf-8').read().rstrip('\n') + '\n\n\n<div id="app"></div>')
open(saida, 'w', encoding='utf-8').write(s)
print(f'v107 aplicado: {n} alinhamentos preservados')
