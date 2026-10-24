"""SOLIDUNS — RAMO AVA — patch83ava_textos.py (09/10/2026)
Inclui o módulo "Avaliação de imóveis" na Política de Privacidade e nos Termos de Uso: inserções de texto e troca da linha de
vigência (5/10 → 9/10/2026). Se a linha de vigência da base já for outra, o patch para sem gravar nada (ajustar VIG_ANT).
Uso: python3 patch83ava_textos.py <pasta 1_DEPLOY base> <pasta 1_DEPLOY saída>   (pode ser a mesma pasta)"""
import os
import sys

if len(sys.argv) != 3:
    sys.exit('uso: python3 patch83ava_textos.py <pasta base> <pasta saída>')
BASE, DEST = sys.argv[1], sys.argv[2]
VIG_ANT = '<p class="vigencia">Em vigor desde 5 de outubro de 2026 (substitui a versão de 4 de outubro de 2026).</p>'
VIG_NOVA = '<p class="vigencia">Em vigor desde 9 de outubro de 2026 (substitui a versão de 5 de outubro de 2026).</p>'


def aplicar(nome, trocas):
    s = open(os.path.join(BASE, nome), encoding='utf-8').read()
    if 'Avaliação de imóveis' in s:
        sys.exit(f'ERRO: {nome} já menciona o módulo (aplicado duas vezes?)')
    for a, b in trocas:
        c = s.count(a)
        if c != 1:
            sys.exit(f'ERRO em {nome}: esperado 1, achei {c}:\n{a[:140]}')
        s = s.replace(a, b)
    open(os.path.join(DEST, nome), 'w', encoding='utf-8').write(s)
    print('ok', nome)


aplicar('privacidade.html', [
    (VIG_ANT, VIG_NOVA),
    ('<li><strong>Senha:</strong>',
     '<li><strong>Avaliações de imóveis (módulo de laudos):</strong> quando você usa o módulo Avaliação de imóveis, guardamos as '
     'avaliações que você lançar (identificação do imóvel, processo, juízo, partes e demais dados informados), o seu banco de dados '
     'de mercado, os seus parâmetros técnicos, as fotos da vistoria e os documentos anexados, além do seu nome profissional, '
     'habilitação e registro no CREA ou CAU, que saem no laudo. As fotos podem conter a data e a localização (GPS) gravadas pelo '
     'celular; essas informações são lidas para compor o relatório fotográfico. Cada perito vê apenas os próprios dados; os '
     'administradores do sistema acessam para suporte. Nos dados de terceiros lançados no módulo (partes do processo, proprietários '
     'e fotos de imóveis), quem decide sobre o tratamento é o perito, que atua como controlador; a SOLIDUNS atua como operadora e '
     'trata esses dados apenas para guardar e processar o trabalho dele. O perito pode apagar os próprios dados do módulo a '
     'qualquer momento (Perfil do perito, Apagar meus dados). Se não tiver mais acesso ao módulo, peça a exclusão pelo e-mail '
     'contato@soliduns.com.br. Ao excluir a conta, esses dados são apagados junto, e as fotos e os documentos são removidos do '
     'armazenamento pela administração em seguida.</li>\n'
     '<li><strong>Senha:</strong>'),
    ('essas informações não estarão disponíveis.</p>',
     'essas informações não estarão disponíveis.</p>\n<p>O módulo Avaliação de imóveis também guarda no navegador uma cópia de '
     'trabalho das suas avaliações, fotos e documentos, para funcionar sem internet. Essa cópia é apagada quando você sai da '
     'plataforma; se houver alterações ainda não enviadas, elas ficam guardadas até você entrar de novo no mesmo aparelho.</p>'),
    ('<li>Emitir certificados de conclusão',
     '<li>Guardar as avaliações de imóveis, as fotos e os documentos do módulo de laudos e montar os laudos e as minutas em Word que você baixar.</li>\n'
     '<li>Emitir certificados de conclusão'),
    ('<li><strong>Supabase:</strong> autenticação de usuários e banco de dados de controle de acesso.</li>',
     '<li><strong>Supabase:</strong> autenticação de usuários, banco de dados de controle de acesso e armazenamento dos dados e '
     'arquivos gravados na sua conta, inclusive as fotos e os documentos do módulo de laudos.</li>'),
])

aplicar('termos.html', [
    (VIG_ANT, VIG_NOVA),
    ('e ferramentas de apoio à gestão financeira, fiscal e de investimentos, como calculadoras e simuladores.</p>',
     'e ferramentas de apoio à gestão financeira, fiscal e de investimentos, como calculadoras e simuladores. Inclui também o '
     'módulo Avaliação de imóveis, que apoia engenheiros e arquitetos na elaboração de laudos de avaliação de imóveis urbanos e '
     'rurais segundo a ABNT NBR 14653.</p>'),
    ('<p>Os materiais preparatórios não têm vínculo',
     '<p>O módulo Avaliação de imóveis é uma ferramenta de apoio ao profissional. Os cálculos, os graus de fundamentação e de '
     'precisão e os laudos e minutas em Word são gerados a partir dos dados lançados pelo usuário. A vistoria, a conferência dos '
     'dados e dos resultados, as decisões técnicas e a assinatura do laudo são de responsabilidade exclusiva do profissional '
     'habilitado, com registro no CREA ou no CAU, que responde pelo trabalho perante o contratante, o juízo e o seu conselho '
     'profissional.</p>\n<p>Os materiais preparatórios não têm vínculo'),
    ('(Revisão de carteira) e os seus favoritos e alertas de leilões. Outra parte',
     '(Revisão de carteira), os seus favoritos e alertas de leilões e as suas avaliações de imóveis, com fotos e documentos. Ao lançar no módulo de '
     'laudos dados de terceiros, como partes do processo, proprietários e fotos de imóveis, você declara ter base legal para '
     'tratá-los, como o encargo de perito ou o contrato com o cliente. Outra parte'),
    ('(a Gestão oferece exportação)',
     '(a Gestão oferece exportação, e o módulo de laudos oferece cópia de segurança em arquivo .zip)'),
    ('A SOLIDUNS faz cópias de segurança periódicas do banco de dados, mas',
     'A SOLIDUNS faz cópias de segurança periódicas do banco de dados (as fotos e os documentos do módulo de laudos não entram '
     'nessas cópias; para eles, use a cópia de segurança .zip do módulo), mas'),
])
