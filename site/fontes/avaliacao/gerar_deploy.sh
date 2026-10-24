#!/bin/bash
# Gera o 1_DEPLOY da v83-AVA sobre qualquer base (v82-LEI ou consolidada mais nova).
# Uso: bash gerar_deploy.sh <pasta 1_DEPLOY da base> <pasta de saída (nova)>
# Os patches conferem os trechos e param, sem gravar, se não acharem o que esperam.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; T="$AQUI/.."
BASE="$1"; OUT="$2"
if [ -z "$BASE" ] || [ -z "$OUT" ] || [ ! -f "$BASE/index.html" ]; then
  echo "uso: bash gerar_deploy.sh <pasta 1_DEPLOY da base> <pasta de saída>"; exit 1; fi
if [ "$(cd "$BASE" && pwd)" = "$(mkdir -p "$OUT" && cd "$OUT" && pwd)" ]; then echo "a saída deve ser outra pasta"; exit 1; fi
cp -r "$BASE"/. "$OUT"/
python3 "$AQUI/build_modulo.py" "$AQUI/app.html" "$AQUI/logo.b64" "$OUT/avaliacao.html"
python3 "$T/patch83ava.py" "$BASE/index.html" "$OUT/index.html"
python3 "$T/patch83ava_textos.py" "$BASE" "$OUT"
md5sum "$OUT/index.html" "$OUT/avaliacao.html" "$OUT/privacidade.html" "$OUT/termos.html"
