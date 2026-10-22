"""Funções de apoio: registro, download com cache e números."""
import datetime as dt
import os
import time
import unicodedata

import requests

AVISOS = []          # avisos acumulados na execução (vão para o relatório)
ORIGEM = {}          # parâmetro -> de onde veio o valor usado (coletado, estimado, configurado)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def aviso(msg):
    AVISOS.append(msg)
    log("  AVISO:", msg)


def origem(nome, valor, fonte):
    ORIGEM[nome] = (valor, fonte)


def sem_acento(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def baixar(url, pasta, nome=None, max_idade_h=20, timeout=180, validar=None):
    """Baixa `url` para `pasta/nome`, reaproveitando o arquivo se for recente.
    `validar(bytes)` pode recusar respostas inválidas (ex.: página de erro).
    Devolve o caminho, ou None se não conseguir."""
    os.makedirs(pasta, exist_ok=True)
    nome = nome or url.rsplit("/", 1)[-1].split("?")[0]
    caminho = os.path.join(pasta, nome)
    if os.path.exists(caminho):
        idade = (time.time() - os.path.getmtime(caminho)) / 3600
        if max_idade_h is None or idade < max_idade_h:
            return caminho
    for tentativa in range(3):
        try:
            r = requests.get(url, timeout=timeout, headers={"User-Agent": "SOLIDUNS robo de selecao"})
            if r.status_code == 404:
                return caminho if os.path.exists(caminho) else None
            r.raise_for_status()
            if validar and not validar(r.content):
                raise ValueError("conteúdo inesperado")
            tmp = caminho + ".parcial"
            with open(tmp, "wb") as f:
                f.write(r.content)
            os.replace(tmp, caminho)
            return caminho
        except (requests.RequestException, ValueError) as e:
            log(f"  falha ao baixar {nome} ({e}); nova tentativa em {5 * (tentativa + 1)}s")
            time.sleep(5 * (tentativa + 1))
    if os.path.exists(caminho):
        aviso(f"{nome}: download falhou; usando a cópia guardada em {pasta}")
        return caminho
    return None


def hoje(cfg):
    d = cfg.get("data_referencia")
    return dt.date.fromisoformat(str(d)) if d else dt.date.today()
