#!/bin/bash
# Gera site/publicar/avaliacao.html a partir da fonte do módulo (app.html), no padrão da plataforma:
#   1. build_modulo.py (modo SOLIDUNS, tabelas aval_*, cores e fontes da plataforma) — md5 1d00cd6f… na v83-AVA;
#   2. aplicar_v107.py (texto justificado, igual ao resto do site).
# Uso (de qualquer pasta): bash site/fontes/avaliacao/gerar_avaliacao.sh
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; PUB="$AQUI/../../publicar"; TMP="$(mktemp)"
python3 "$AQUI/build_modulo.py" "$AQUI/app.html" "$AQUI/logo.b64" "$TMP"
python3 "$AQUI/aplicar_v107.py" "$TMP" "$AQUI/bloco_v107.css" "$PUB/avaliacao.html"
rm -f "$TMP"
md5sum "$PUB/avaliacao.html"
