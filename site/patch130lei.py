# patch130lei.py — SOLIDUNS v130-LEI (16/10/2026): prévia do link do SCANNER com a logomarca própria "Scanner do Dia"
#
# Pedido do Thiago (16/10 10h16): "ESSA LOGOMARCA VAI PARA O LINK DO SCANNER" (Opção 2 — Radar, com a logo original do portal
# no canto superior esquerdo). Nova página de passagem /noticias/scanner/index.html com og-scanner-do-dia.jpg (1200x630, 32 KB);
# o botão de compartilhar do Scanner passa a gerar https://soliduns.com.br/noticias/scanner/?d=AAAA-MM-DD.
# A página /noticias/ (prévia do jornal) continua igual e segue aceitando ?scanner=AAAA-MM-DD (links antigos não quebram).
# ATENÇÃO: o pacote de deploy precisa levar noticias/, noticias/scanner/, og-valor-e-mercado.jpg e og-scanner-do-dia.jpg
# (o pacote da v129 NÃO levava noticias/ nem og-valor-e-mercado.jpg — publicar a v129 sozinha quebraria a prévia do jornal).
#
# Uso: python3 patch130lei.py index_v129_completo.html index_v130_completo.html
#      python3 patch122lei.py index_v130_completo.html saida130/ --sem-md5 --versao=v130
#      + copiar noticias/, og-valor-e-mercado.jpg e og-scanner-do-dia.jpg para a pasta do deploy
import sys, hashlib

ORIG_MD5 = "92d3ae2464ed0e3e28f4310e8047be65"     # v129 completo

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

def main(entrada, saida):
    raw = open(entrada, "rb").read()
    assert hashlib.md5(raw).hexdigest() == ORIG_MD5, "entrada não é a v129 completa"
    s = raw.decode("utf-8")
    s = troca(s, "  return VM_SITE + 'noticias/?scanner=' + d;",
              "  /* v130: página de passagem própria do Scanner (prévia com a logomarca Scanner do Dia) */\n"
              "  return VM_SITE + 'noticias/scanner/' + (d ? '?d=' + d : '');")
    open(saida, "w", encoding="utf-8").write(s)
    print("v130 completo:", len(s.encode()) // 1024, "KB · md5", hashlib.md5(s.encode()).hexdigest())

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
