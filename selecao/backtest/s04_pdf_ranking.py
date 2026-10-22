"""PDF do ranking geral com a marca SOLIDUNS (sem a aba de metodologia)."""
import sys
import pandas as pd
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, KeepTogether
from reportlab.lib.styles import ParagraphStyle
XLS, OUT, LOGO = sys.argv[1], sys.argv[2], sys.argv[3]
D = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('Sans', D + 'DejaVuSansCondensed.ttf'))
pdfmetrics.registerFont(TTFont('SansB', D + 'DejaVuSansCondensed-Bold.ttf'))
pdfmetrics.registerFont(TTFont('SansI', D + 'DejaVuSansCondensed-Oblique.ttf'))
ESC, OURO, CINZA, VERDE, VERDE_T, LINHA = (colors.HexColor(h) for h in ('#0F181F', '#F2C811', '#5A6670', '#C6EFCE', '#006100', '#D9DDE1'))
W, H = landscape(A4)

def cabecalho(c, doc):
    c.saveState()
    c.setFillColor(colors.HexColor('#10171F')); c.rect(0, H - 22 * mm, W, 22 * mm, stroke=0, fill=1)
    x, y, s = 12 * mm, H - 18 * mm, 14 * mm
    from PIL import Image as _I
    ic, nm = LOGO.replace('soliduns_logo.jpg', 'icone.png'), LOGO.replace('soliduns_logo.jpg', 'nome.png')
    (iw, ih), (nw, nh) = _I.open(ic).size, _I.open(nm).size
    hi = 15 * mm; c.drawImage(ic, 12 * mm, H - 18.5 * mm, width=hi * iw / ih, height=hi)
    hn = 5.2 * mm; xn = 12 * mm + hi * iw / ih + 4 * mm
    c.drawImage(nm, xn, H - 10.6 * mm, width=hn * nw / nh, height=hn)
    c.setFillColor(colors.HexColor('#96A0A8')); c.setFont('Sans', 7.5); c.drawString(xn + 0.3 * mm, H - 16.6 * mm, 'CONSULTORIA E GESTÃO')
    c.setFillColor(colors.white); c.setFont('SansB', 11.5); c.drawRightString(W - 12 * mm, y + 6.4 * mm, 'Ranking de ações brasileiras por fundamentos contábeis')
    c.setFillColor(OURO); c.setFont('Sans', 8.5); c.drawRightString(W - 12 * mm, y + 1.6 * mm, 'Balanços entregues à CVM até 22/10/2026')
    c.setFillColor(OURO); c.rect(0, H - 23 * mm, W, 1 * mm, stroke=0, fill=1)
    c.setStrokeColor(LINHA); c.setLineWidth(0.5); c.line(12 * mm, 11 * mm, W - 12 * mm, 11 * mm)
    c.setFillColor(CINZA); c.setFont('Sans', 7)
    c.drawString(12 * mm, 7 * mm, 'SOLIDUNS Consultoria e Gestão Ltda · Águas Claras – DF · Material de análise; não constitui recomendação de investimento.')
    c.setFont('SansB', 8); c.setFillColor(ESC); c.drawRightString(W - 12 * mm, 7 * mm, f'{doc.page}')
    c.restoreState()

doc = BaseDocTemplate(OUT, pagesize=(W, H), leftMargin=12 * mm, rightMargin=12 * mm, topMargin=28 * mm, bottomMargin=15 * mm,
                      title='Ranking de ações brasileiras por fundamentos — SOLIDUNS', author='SOLIDUNS Consultoria e Gestão')
doc.addPageTemplates([PageTemplate(frames=[Frame(12 * mm, 15 * mm, W - 24 * mm, H - 43 * mm, id='f', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=cabecalho)])
st = lambda n, **k: ParagraphStyle(n, fontName=k.pop('f', 'Sans'), **k)
TIT = st('t', f='SansB', fontSize=14, leading=17, textColor=ESC, spaceAfter=2)
SUB = st('s', f='SansI', fontSize=9, leading=11, textColor=CINZA, spaceAfter=6)
CEL = st('c', fontSize=6.6, leading=7.8, textColor=colors.HexColor('#222222'))
CELV = st('cv', f='SansB', fontSize=6.6, leading=7.8, textColor=VERDE_T)
CELN = st('cn', fontSize=6.6, leading=7.8, textColor=colors.HexColor('#222222'), alignment=2)
CELVN = st('cvn', f='SansB', fontSize=6.6, leading=7.8, textColor=VERDE_T, alignment=2)
HDRN = st('hn', f='SansB', fontSize=6.4, leading=7.6, textColor=colors.white, alignment=2)
HDR = st('h', f='SansB', fontSize=6.6, leading=7.8, textColor=colors.white)

R = pd.read_excel(XLS, 'Ranking geral'); F = pd.read_excel(XLS, 'Fora do ranking')
def pct(v): return '—' if pd.isna(v) else f'{v * 100:.1f}%'.replace('.', ',')
def num(v, d=2): return '—' if pd.isna(v) else f'{v:.{d}f}'.replace('.', ',')
COLS = [('Nº', 7, lambda r: str(int(r['Nº']))), ('Ação', 15, lambda r: r['Ação']), ('Empresa', 50, lambda r: r['Empresa'].replace(' S.A.', '').replace(' S/A', '').replace(' S.A', '').strip()),
        ('Setor', 32, lambda r: r['Setor']), ('Nota', 10, lambda r: num(r['Nota final (0–100)'], 1)),
        ('Liquidez corrente', 13, lambda r: num(r['Liquidez corrente'])), ('Margem bruta', 13, lambda r: pct(r['Margem bruta'])),
        ('Giro do ativo', 12, lambda r: num(r['Giro do ativo'])), ('Renov. ativos', 13, lambda r: num(r['Renovação (capex/deprec.)'])),
        ('CAGR receita 5a', 13, lambda r: pct(r['CAGR receita 5a'])), ('PL / Ativo', 11, lambda r: pct(r['PL/Ativo'])),
        ('Margem líquida', 12, lambda r: pct(r['Margem líquida'])), ('ROE', 11, lambda r: pct(r['ROE'])), ('CAGR lucro 5a', 12, lambda r: pct(r['CAGR lucro 5a'])),
        ('Dív. líq. / EBITDA', 13, lambda r: num(r['Dív. líquida/EBITDA'], 1)), ('Alertas', 0, lambda r: '' if pd.isna(r['Alertas (fora da nota)']) else r['Alertas (fora da nota)'])]
base = {'Nº': 7, 'Ação': 14, 'Empresa': 44, 'Setor': 29, 'Nota': 10}
larg = [base.get(h, 12.6) * mm for h, _, _ in COLS]; larg[-1] = (W - 24 * mm) - sum(larg[:-1])
NUMS = {h for h, _, _ in COLS[4:-1]}
dados = [[Paragraph(h, HDRN if h in NUMS else HDR) for h, _, _ in COLS]]
for i, r in R.iterrows():
    s = CELV if i < 20 else CEL
    dados.append([Paragraph(str(f(r)), (CELVN if i < 20 else CELN) if h in NUMS else s) for h, _, f in COLS])
t = Table(dados, colWidths=larg, repeatRows=1)
est = [('BACKGROUND', (0, 0), (-1, 0), ESC), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LINEBELOW', (0, 0), (-1, -1), 0.3, LINHA),
       ('LINEBELOW', (0, 0), (-1, 0), 1.2, OURO), ('TOPPADDING', (0, 0), (-1, -1), 1.6), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.6),
       ('LEFTPADDING', (0, 0), (-1, -1), 2.2), ('RIGHTPADDING', (0, 0), (-1, -1), 2.2), ('BACKGROUND', (0, 1), (-1, 20), VERDE),
       ('LINEBELOW', (0, 20), (-1, 20), 1.2, VERDE_T)]
t.setStyle(TableStyle(est))
leg = st('l', fontSize=8, leading=10, textColor=CINZA, spaceBefore=4)
story = [Paragraph('Ranking geral: da melhor para a pior empresa', TIT),
         Paragraph(f'{len(R)} empresas · as 20 melhores destacadas em verde · bancos e seguradoras avaliados por PL/Ativo, margem líquida, ROE e crescimento', SUB),
         t, Paragraph('Alertas aparecem como informação e não entram na nota. "—" indica indicador que não se aplica ao tipo de empresa ou sem dado disponível.', leg)]
F2 = [[Paragraph(h, HDR) for h in ('Ação', 'Empresa', 'Setor', 'Motivo')]] + \
     [[Paragraph(str(r['Ação']), CEL), Paragraph(r['Empresa'], CEL), Paragraph(str(r['Setor']), CEL), Paragraph(str(r['Motivo']), CEL)] for _, r in F.iterrows()]
tf = Table(F2, colWidths=[22 * mm, 90 * mm, 45 * mm, W - 24 * mm - 157 * mm], repeatRows=1)
tf.setStyle(TableStyle([e for e in est if e[0] != 'BACKGROUND' or e[1] == (0, 0)][:] + [('BACKGROUND', (0, 0), (-1, 0), ESC)]
                       if False else [('BACKGROUND', (0, 0), (-1, 0), ESC), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LINEBELOW', (0, 0), (-1, -1), 0.3, LINHA),
                                      ('LINEBELOW', (0, 0), (-1, 0), 1.2, OURO), ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
story += [Spacer(1, 8 * mm), KeepTogether([Paragraph('Empresas fora do ranking', TIT), Paragraph(f'{len(F)} empresas, com o motivo da exclusão', SUB), tf])]
doc.build(story)
print('ok')
