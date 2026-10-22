# Confere DOI, autores completos, volume, número e páginas de cada artigo na Crossref (só leitura).
import csv, json, sys, time, urllib.parse, urllib.request, difflib
ent, sai = sys.argv[1], sys.argv[2]
def norm(t): return ''.join(c.lower() for c in t if c.isalnum() or c == ' ').split()
def sim(a, b): return difflib.SequenceMatcher(None, ' '.join(norm(a)), ' '.join(norm(b))).ratio()
linhas = []
for chave, titulo, revista in csv.reader(open(ent, encoding='utf-8'), delimiter='\t'):
    ano = int(chave.split()[-1])
    q = urllib.parse.urlencode({'query.bibliographic': f'{titulo} {revista}', 'filter': f'from-pub-date:{ano-2},until-pub-date:{ano+2}', 'rows': 8,
        'select': 'DOI,title,author,container-title,volume,issue,page,published-print,published-online,type', 'mailto': 'dr.thiago.viegas@gmail.com'})
    try:
        j = json.load(urllib.request.urlopen('https://api.crossref.org/works?' + q, timeout=30))['message']['items']
    except Exception as e:
        j = []; print(chave, 'ERRO', e)
    melhor = max(j, key=lambda x: sim(titulo, (x.get('title') or [''])[0]) + 0.3 * sim(revista, (x.get('container-title') or [''])[0]) + (0.2 if 'ssrn' not in x['DOI'] else -0.5), default=None)
    if not melhor: linhas.append([chave, titulo, '', '', '', '', '', '', '', '0']); continue
    aut = '; '.join(f"{a.get('family','')}, {a.get('given','')}".strip(', ') for a in melhor.get('author', []))
    d = (melhor.get('published-print') or melhor.get('published-online') or {}).get('date-parts', [['']])[0][0]
    linhas.append([chave, titulo, melhor['DOI'], (melhor.get('title') or [''])[0], aut, (melhor.get('container-title') or [''])[0],
                   melhor.get('volume', ''), melhor.get('issue', ''), melhor.get('page', ''), f"{sim(titulo, (melhor.get('title') or [''])[0]):.2f}", str(d)])
    time.sleep(1)
csv.writer(open(sai, 'w', encoding='utf-8', newline=''), delimiter='\t').writerows(linhas)
print('ok', len(linhas))
