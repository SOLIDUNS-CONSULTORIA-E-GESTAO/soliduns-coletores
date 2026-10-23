"""
Fórmulas em LaTeX → equações do Word (OMML), dentro de um .docx gerado pelo docx-js.

O gerador escreve cada fórmula como um marcador @@EQn@@ e grava a lista em <arquivo>.eq.json
([{"latex": ..., "modo": "destaque" | "inline"}]). Este script:
  1. converte todas as fórmulas de uma vez com o pandoc (LaTeX → OMML);
  2. troca cada marcador pela equação, com a formatação do texto em volta (negrito, cor e tamanho), sem a fonte
     do texto (a equação usa a fonte matemática do Word);
  3. fórmula em destaque vira equação própria (centralizada); fórmula no texto fica em linha.
Uso: python3 latex_omml.py arquivo.docx
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile


def converter(eqs):
    md = []
    for i, e in enumerate(eqs):
        md.append(f"MARCA{i}FIM ${e['latex']}$" if e["modo"] == "inline" else f"MARCA{i}FIM\n\n$${e['latex']}$$")
    with tempfile.TemporaryDirectory() as d:
        fonte, saida = os.path.join(d, "e.md"), os.path.join(d, "e.docx")
        open(fonte, "w", encoding="utf-8").write("\n\n".join(md) + "\n")
        subprocess.run(["pandoc", fonte, "-f", "markdown", "-o", saida], check=True)
        xml = zipfile.ZipFile(saida).read("word/document.xml").decode("utf-8")
    partes = re.split(r"MARCA(\d+)FIM", xml)
    res = {}
    for k in range(1, len(partes), 2):
        i, trecho = int(partes[k]), partes[k + 1]
        m = re.search(r"<m:oMathPara>.*?</m:oMathPara>", trecho, re.S) if eqs[i]["modo"] != "inline" else None
        if not m:
            m = re.search(r"<m:oMath>.*?</m:oMath>", trecho, re.S)
        if not m:
            raise SystemExit(f"fórmula {i} não convertida: {eqs[i]['latex']}")
        res[i] = m.group(0)
    return res


def formatar(omml, rpr):
    omml = omml.replace("<m:t>*</m:t>", "<m:t>\u2217</m:t>")                    # asterisco matemático (g*)
    rpr = re.sub(r"<w:rFonts[^>]*/>", "", rpr or "")
    omml = re.sub(r"<w:rPr>.*?</w:rPr>", "", omml, flags=re.S)
    if not rpr:
        return omml
    omml = re.sub(r"(<m:r>(?:<m:rPr>.*?</m:rPr>)?)", lambda m: m.group(1) + f"<w:rPr>{rpr}</w:rPr>", omml, flags=re.S)
    return omml


def main():
    caminho = sys.argv[1]
    eqs = json.load(open(re.sub(r"\.docx$", ".eq.json", caminho), encoding="utf-8"))
    omml = converter(eqs)
    z = zipfile.ZipFile(caminho)
    arquivos = {n: z.read(n) for n in z.namelist()}
    xml = arquivos["word/document.xml"].decode("utf-8")
    feitas = 0
    for i, e in enumerate(eqs):
        marca = f"@@EQ{i}@@"
        k = xml.find(marca)
        if k < 0:
            raise SystemExit(f"marcador {marca} não achado")
        ini, fim = xml.rfind("<w:r>", 0, k), xml.find("</w:r>", k) + len("</w:r>")
        m = re.search(r"<w:rPr>(.*?)</w:rPr>", xml[ini:fim], re.S)
        xml = xml[:ini] + formatar(omml[i], m.group(1) if m else "") + xml[fim:]
        feitas += 1
    assert "@@EQ" not in xml
    arquivos["word/document.xml"] = xml.encode("utf-8")
    tmp = caminho + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as w:
        for n, b in arquivos.items():
            w.writestr(n, b)
    os.replace(tmp, caminho)
    os.remove(re.sub(r"\.docx$", ".eq.json", caminho))
    print(f"{feitas} fórmulas convertidas para equações do Word")


if __name__ == "__main__":
    main()
