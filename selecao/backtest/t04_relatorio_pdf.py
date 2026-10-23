"""PDF: preço de entrada e alvos (cenário de vitória da direita) para 5 ações + maiores altas de 05/10/2026."""
import sys, json
import numpy as np, pandas as pd
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image as PImage
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, KeepTogether, Image
from reportlab.lib.styles import ParagraphStyle
T, OUT, LOGO = sys.argv[1], sys.argv[2], sys.argv[3]
F = '/usr/share/fonts/truetype/dejavu/'
for n, f in (('Sans', 'DejaVuSans.ttf'), ('SansB', 'DejaVuSans-Bold.ttf'), ('SansI', 'DejaVuSans-Oblique.ttf'), ('SansC', 'DejaVuSansCondensed.ttf'), ('SansCB', 'DejaVuSansCondensed-Bold.ttf')):
    pdfmetrics.registerFont(TTFont(n, F + f))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily('Sans', normal='Sans', bold='SansB', italic='SansI', boldItalic='SansB')
registerFontFamily('SansC', normal='SansC', bold='SansCB', italic='SansC', boldItalic='SansCB')
ESC, OURO, CINZA, LINHA, CLARO, VERDE, VERM = (colors.HexColor(h) for h in ('#0F181F', '#F2C811', '#5A6670', '#D9DDE1', '#F4F5F7', '#006100', '#A4262C'))
W, H = A4
tec = json.load(open(f'{T}/tecnica.json')); niv = json.load(open(f'{T}/niveis.json')); alt = pd.read_pickle(f'{T}/altas_dia.pkl')
ohlc = pd.read_parquet(f'{T}/ohlc.parquet')
NOME = {'CXSE3': 'Caixa Seguridade', 'BBSE3': 'BB Seguridade', 'BBAS3': 'Banco do Brasil', 'BPAC11': 'BTG Pactual', 'POMO4': 'Marcopolo', 'B3SA3': 'B3'}
ORDEM = ['CXSE3', 'BBSE3', 'BBAS3', 'BPAC11', 'B3SA3', 'POMO4']
br = lambda v, d=2: f'{v:,.{d}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
pc = lambda v, d=1: f'{v * 100:+.{d}f}%'.replace('.', ',')

def cab(c, doc):
    c.saveState()
    c.setFillColor(colors.HexColor('#10171F')); c.rect(0, H - 24 * mm, W, 24 * mm, stroke=0, fill=1)
    ic, nm = LOGO.replace('soliduns_logo.jpg', 'icone.png'), LOGO.replace('soliduns_logo.jpg', 'nome.png')
    (iw, ih), (nw, nh) = PImage.open(ic).size, PImage.open(nm).size
    hi = 16 * mm; c.drawImage(ic, 12 * mm, H - 20 * mm, width=hi * iw / ih, height=hi)
    hn = 5.4 * mm; xn = 12 * mm + hi * iw / ih + 4 * mm
    c.drawImage(nm, xn, H - 11.8 * mm, width=hn * nw / nh, height=hn)
    c.setFillColor(colors.HexColor('#96A0A8')); c.setFont('Sans', 7.2); c.drawString(xn + 0.3 * mm, H - 17.8 * mm, 'CONSULTORIA E GESTÃO')
    c.setFillColor(colors.white); c.setFont('SansB', 10.5); c.drawRightString(W - 12 * mm, H - 11 * mm, 'Preço de entrada e preço-alvo')
    c.setFillColor(OURO); c.setFont('Sans', 7.8); c.drawRightString(W - 12 * mm, H - 16.5 * mm, 'Cenário: vitória de Flávio Bolsonaro em 25/10/2026')
    c.setFillColor(OURO); c.rect(0, H - 25 * mm, W, 1 * mm, stroke=0, fill=1)
    c.setStrokeColor(LINHA); c.setLineWidth(0.5); c.line(12 * mm, 12 * mm, W - 12 * mm, 12 * mm)
    c.setFillColor(CINZA); c.setFont('Sans', 6.6)
    c.drawString(12 * mm, 8 * mm, 'SOLIDUNS Consultoria e Gestão Ltda · Águas Claras – DF · Análise de cenário; não constitui recomendação de investimento.')
    c.setFont('SansB', 8); c.setFillColor(ESC); c.drawRightString(W - 12 * mm, 8 * mm, str(doc.page))
    c.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=31 * mm, bottomMargin=17 * mm,
                      title='Preço de entrada e preço-alvo — SOLIDUNS', author='SOLIDUNS Consultoria e Gestão')
doc.addPageTemplates([PageTemplate(frames=[Frame(14 * mm, 17 * mm, W - 28 * mm, H - 48 * mm, id='f', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=cab)])
S = lambda n, **k: ParagraphStyle(n, fontName=k.pop('f', 'Sans'), **k)
H1 = S('h1', f='SansB', fontSize=15, leading=19, textColor=ESC, spaceAfter=2)
SUB = S('sub', f='SansI', fontSize=9, leading=12, textColor=CINZA, spaceAfter=8)
H2 = S('h2', f='SansB', fontSize=11.5, leading=15, textColor=ESC, spaceBefore=8, spaceAfter=4)
TX = S('tx', fontSize=9, leading=12.6, textColor=colors.HexColor('#222222'), spaceAfter=5, alignment=4)
BL = S('bl', bulletFontName='SansB', bulletFontSize=6.5, bulletColor=colors.HexColor('#8A6D00'), fontSize=9, leading=12.4, textColor=colors.HexColor('#222222'), leftIndent=10, bulletIndent=1, spaceAfter=2.5)
CE = S('ce', f='SansC', fontSize=7.8, leading=9.6, textColor=colors.HexColor('#222222'))
CEB = S('ceb', f='SansCB', fontSize=7.8, leading=9.6, textColor=ESC)
CEN = S('cen', f='SansC', fontSize=7.8, leading=9.6, alignment=2)
HD = S('hd', f='SansCB', fontSize=7.6, leading=9.2, textColor=colors.white)
HDN = S('hdn', f='SansCB', fontSize=7.6, leading=9.2, textColor=colors.white, alignment=2)
NT = S('nt', f='SansI', fontSize=7.6, leading=10, textColor=CINZA, spaceAfter=6)
b = lambda t: Paragraph(t, BL, bulletText='●')
def tabela(cab_, linhas, larg, num_cols=(), destaque=None):
    d = [[Paragraph(h, HDN if i in num_cols else HD) for i, h in enumerate(cab_)]]
    for r in linhas: d.append([Paragraph(str(v), (CEN if i in num_cols else (CEB if i == 0 else CE))) for i, v in enumerate(r)])
    t = Table(d, colWidths=larg, repeatRows=1)
    st = [('BACKGROUND', (0, 0), (-1, 0), ESC), ('LINEBELOW', (0, 0), (-1, 0), 1.2, OURO), ('LINEBELOW', (0, 1), (-1, -1), 0.3, LINHA),
          ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('TOPPADDING', (0, 0), (-1, -1), 2.4), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.4),
          ('LEFTPADDING', (0, 0), (-1, -1), 3), ('RIGHTPADDING', (0, 0), (-1, -1), 3)]
    for i in range(1, len(d)):
        if i % 2 == 0: st.append(('BACKGROUND', (0, i), (-1, i), CLARO))
    if destaque: st += destaque
    t.setStyle(TableStyle(st)); return t

def grafico(tk):
    x = ohlc[ohlc.ticker == tk].set_index('data').sort_index()
    c = x.fech; e21, e50, e200 = (c.ewm(span=n, adjust=False).mean() for n in (21, 50, 200))
    v = x.iloc[-160:]; n = niv[tk]
    fig, ax = plt.subplots(figsize=(7.4, 3.0), dpi=200)
    ax.plot(v.index, v.fech, color='#0F181F', lw=1.6, label='Fechamento')
    for s_, cor, nm in ((e21, '#2a78d6', 'MME 21'), (e50, '#eda100', 'MME 50'), (e200, '#e87ba4', 'MME 200')):
        ax.plot(v.index, s_.loc[v.index], color=cor, lw=1.1, label=nm)
    for val, cor, nm, ls in ((n['ent_ideal'], '#006100', 'Entrada', '-'), (n['stop'], '#A4262C', 'Stop', '--'), (n['alvo1'], '#8A6D00', 'Alvo 1', ':'), (n['alvo2'], '#8A6D00', 'Alvo 2', '-.')):
        ax.axhline(val, color=cor, lw=1.0, ls=ls); ax.text(v.index[-1] + pd.Timedelta(days=2), val, f' {nm} {br(val)}', va='center', fontsize=6.8, color=cor)
    ax.axvline(pd.Timestamp('2026-10-05'), color='#96A0A8', lw=0.8, ls=':'); ax.text(pd.Timestamp('2026-10-05'), ax.get_ylim()[0], ' 05/10', fontsize=6.5, color='#5A6670', va='bottom')
    ax.set_xlim(v.index[0], v.index[-1] + pd.Timedelta(days=28))
    for s_ in ('top', 'right'): ax.spines[s_].set_visible(False)
    ax.spines['left'].set_color('#D9DDE1'); ax.spines['bottom'].set_color('#D9DDE1'); ax.tick_params(colors='#52514e', labelsize=7)
    ax.grid(color='#ECEDEF', lw=0.6); ax.legend(frameon=False, fontsize=6.8, ncol=4, loc='upper left')
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda y, _: br(y)))
    fig.autofmt_xdate(rotation=0, ha='center'); fig.tight_layout()
    p = f'{T}/g_{tk}.png'; fig.savefig(p); plt.close(fig); return p

pD, dcds = niv['pD'], niv['dcds_pb']
st = []
st += [Paragraph('Preço de entrada e preço-alvo de seis ações', H1),
       Paragraph('Cenário de vitória de Flávio Bolsonaro no 2º turno · cotações até o fechamento de 21/10/2026', SUB)]
st += [Paragraph('Premissa do cenário', H2),
       Paragraph(f'A análise supõe a vitória de Flávio Bolsonaro no domingo, 25/10. As pesquisas mais recentes dão a ele cerca de {br(niv["v"] * 100, 1)}% dos votos válidos. '
                 f'Pelo método do robô, isso equivale a uma probabilidade de vitória de cerca de {br(pD * 100, 0)}%.', TX),
       Paragraph(f'Portanto, o mercado já precifica boa parte desse resultado. Se ele se confirmar, falta precificar só o restante, cerca de {br((1 - pD) * 100, 0)}% do efeito. '
                 f'Com um prêmio político de 100 pontos-base entre os cenários, o CDS cairia cerca de {br(-dcds, 0)} pontos-base.', TX),
       Paragraph('O alvo de cada ação combina duas medidas, com peso igual:', TX),
       b('<b>Alvo fundamental:</b> a reprecificação pela fórmula do robô, com custo de capital menor e crescimento do setor ajustado pela queda esperada da Selic.'),
       b('<b>Alvo empírico:</b> a reação da ação ao 1º turno, em 05/10, quando a probabilidade de vitória da direita subiu em proporção parecida.'),
       Paragraph('Os preços de entrada, stop e alvos técnicos vêm dos indicadores técnicos, detalhados ação por ação nas páginas seguintes.', TX)]
linhas, dest = [], []
for i, tk in enumerate(ORDEM, start=1):
    n = niv[tk]
    linhas.append([f'{tk}<br/><font size="6.6" color="#5A6670">{NOME[tk]}</font>', br(n['preco']), br(n['ent_ideal']), br(n['ent_max']), br(n['stop']), br(n['alvo1']), br(n['alvo2']),
                   f'<font color="#006100">{pc(n["ganho2"])}</font>', f'<font color="#A4262C">{pc(n["perda"])}</font>', br(n['rr2'], 1).replace('-', '')])
    dest.append(('TEXTCOLOR', (7, i), (7, i), VERDE)); dest.append(('TEXTCOLOR', (8, i), (8, i), VERM))
st += [Paragraph('Quadro-resumo', H2),
       tabela(['Ação', 'Preço 21/10', 'Entrada ideal', 'Entrada máxima', 'Stop', 'Alvo 1', 'Alvo 2', 'Ganho até alvo 2', 'Perda até stop', 'Ganho / risco'],
              linhas, [26 * mm, 16 * mm, 17 * mm, 17 * mm, 15 * mm, 15 * mm, 15 * mm, 17 * mm, 16 * mm, 14 * mm][:10], num_cols=range(1, 10)),
       Paragraph('Ganho e perda medidos a partir da entrada ideal. Ganho/risco acima de 1,5 indica boa assimetria; abaixo de 1, o risco supera o ganho esperado.', NT)]
st += [Paragraph('Leitura geral', H2),
       b('<b>BTG Pactual, Banco do Brasil e B3</b> têm a melhor relação ganho/risco no cenário. Bancos e a bolsa são os mais sensíveis à queda do risco-país e dos juros longos, e foram os que mais reagiram ao 1º turno.'),
       b('<b>B3 e BTG</b> estão esticadas depois da alta de outubro. Para as duas, a entrada indicada é num recuo, não no preço atual.'),
       b('<b>Marcopolo</b> tem ganho moderado. Ela ainda está abaixo da média de 200 dias, numa tendência de baixa de longo prazo, mas tem os melhores fundamentos do grupo.'),
       b('<b>Caixa Seguridade e BB Seguridade</b> têm pouco a ganhar com a eleição. Seguradoras lucram com juros altos, porque aplicam as reservas técnicas. No 1º turno subiram só 1%. São ações de qualidade e defensivas, não de aposta eleitoral.'),
       b('<b>Movimento de 22/10:</b> BB Seguridade subiu 2,05% (para cerca de R$ 43,33) e já passou do alvo 1. Banco do Brasil caiu 0,75% (cerca de R$ 23,92) e Marcopolo subiu 1,50% (cerca de R$ 4,75). Confira o preço do dia antes de executar.')]
st.append(PageBreak())

LEIT = {
 'CXSE3': ['<b>Tendência:</b> de alta. O preço está acima das médias de 9, 21, 50 e 200 dias, todas inclinadas para cima.',
           '<b>Força:</b> ADX em 33, com DI+ (31) bem acima do DI− (13). A tendência é firme.',
           '<b>Momento:</b> IFR em 60, sem sobrecompra. MACD acima da linha de sinal.',
           '<b>Volume:</b> 44% acima da média nos últimos 5 pregões, com OBV subindo. Há compra consistente.',
           '<b>Resistências:</b> R$ 21,96 (máxima de 20 dias) e R$ 22,54 (máxima histórica, julho de 2026).',
           '<b>Conclusão:</b> gráfico saudável, mas pouco espaço no cenário eleitoral (+3,3%). Relação ganho/risco fraca para uma aposta de curto prazo.'],
 'BBSE3': ['<b>Tendência:</b> de alta, com o preço acima de todas as médias.',
           '<b>Momento:</b> estocástico em 92, sobrecomprado. O preço encosta na banda superior de Bollinger (R$ 43,02) e na máxima histórica (R$ 42,98).',
           '<b>Força:</b> ADX em 20. A tendência é fraca e o volume está 21% abaixo da média.',
           '<b>22/10:</b> subiu 2,05% e rompeu a máxima histórica. Um rompimento com volume baixo pede confirmação.',
           '<b>Conclusão:</b> esperar recuo para perto de R$ 41,45 (média de 9 dias e suporte do pivô). Comprar no topo dá ganho/risco abaixo de 1.'],
 'BBAS3': ['<b>Tendência:</b> de alta no médio prazo. O preço está acima das médias de 21, 50 e 200 dias.',
           '<b>Movimento recente:</b> subiu 11% em 05/10 e chegou a R$ 27,19. Depois devolveu parte da alta e parou em R$ 23,60, na retração de 38,2% de Fibonacci.',
           '<b>Momento:</b> MACD abaixo da linha de sinal e estocástico em 32, caindo. A correção ainda não acabou.',
           '<b>Força:</b> ADX em 30, com DI+ acima do DI−. A tendência principal segue de alta.',
           '<b>Fundamentos:</b> fracos hoje (75º no ranking por ROE baixo). A alta depende da tese de melhora de gestão, não dos números atuais.',
           '<b>Conclusão:</b> entrada perto de R$ 23,70 (média de 21 dias e Fibonacci). Alvo 2 é a volta ao topo de 05/10 (R$ 27,19). Ganho/risco de 1,9.'],
 'BPAC11': ['<b>Tendência:</b> de alta forte. ADX em 53, com DI+ em 43 e DI− em 10. Subiu 27% em 21 pregões e 53% no ano.',
            '<b>Momento:</b> IFR em 69 e estocástico em 81, perto da sobrecompra. O preço está 9% acima da média de 21 dias, o que aumenta o risco de correção.',
            '<b>05/10:</b> subiu 22,5%, a maior reação entre as cinco ações. O topo foi de R$ 84,59.',
            '<b>Alvos:</b> o alvo 1 fica abaixo do topo de 05/10. O alvo 2 (R$ 94,34) é a extensão de 127% de Fibonacci do movimento de junho a outubro.',
            '<b>Conclusão:</b> melhor ganho/risco do grupo (2,2), mas com volatilidade alta. Entrada em recuo para R$ 77,40 e stop largo, abaixo de R$ 69,50.'],
 'B3SA3': ['<b>Tendência:</b> de alta forte. ADX em 50, com DI+ em 44 e DI− em 11. O preço está acima de todas as médias e subiu 29% em 21 pregões e 69% no ano.',
           '<b>Momento:</b> IFR em 72 e estocástico em 88, em sobrecompra. O preço está 11% acima da média de 21 dias (R$ 21,20). O risco de correção é alto.',
           '<b>05/10:</b> subiu 22,6% e marcou a máxima histórica, R$ 24,28. Desde então se mantém perto do topo, sem devolver a alta.',
           '<b>Volume:</b> 21% acima da média nos últimos 5 pregões.',
           '<b>Por que reage ao cenário:</b> a B3 ganha com o volume de negócios. Juros menores e risco-país em queda trazem mais investidor para a bolsa, mais emissões de ações e mais negociação.',
           '<b>Alvos:</b> o alvo 1 é a máxima histórica (R$ 24,28). O alvo 2 (R$ 27,05) é a extensão de 127% de Fibonacci do movimento de agosto a outubro.',
           '<b>Conclusão:</b> boa relação ganho/risco (1,8), mas a entrada certa é num recuo para perto de R$ 22,34 (média de 9 dias e suporte do pivô). O stop é largo, em R$ 19,77.'],
 'POMO4': ['<b>Tendência:</b> de baixa no longo prazo. O preço (R$ 4,68) está bem abaixo da média de 200 dias (R$ 5,57) e caiu 22% no ano.',
           '<b>Recuperação:</b> desde a mínima de R$ 4,03 (28/09), o preço voltou para cima das médias de 21 e 50 dias. Subiu 8% em 05/10.',
           '<b>Momento:</b> MACD levemente acima da linha de sinal, IFR em 53 e ADX em 24. A recuperação é inicial.',
           '<b>Volume:</b> 28% acima da média, com OBV subindo. Há acumulação.',
           '<b>Resistências:</b> R$ 4,92 (pivô), R$ 5,00 a R$ 5,02 (máxima de 20 dias e Fibonacci 38,2%) e R$ 5,13 (Bollinger).',
           '<b>Conclusão:</b> fundamentos fortes (9º no ranking, P/L perto de 4), mas o gráfico ainda precisa romper R$ 5,02 para confirmar a virada.'],
}
for tk in ORDEM:
    t, n = tec[tk], niv[tk]
    bloco = [Paragraph(f'{NOME[tk]} ({tk})', H1),
             Paragraph(f'Fechamento de 21/10/2026: R$ {br(t["fech"])} · 5 dias: {pc(t["ret_5d"])} · 21 dias: {pc(t["ret_21d"])} · no ano: {pc(t["ret_ano"])} · em 05/10: {pc(t["ret_0510"])}', SUB),
             Image(grafico(tk), width=W - 28 * mm, height=(W - 28 * mm) * 3.0 / 7.4)]
    ind = [['Médias móveis exponenciais', f'MME 9: {br(t["mme9"])} · MME 21: {br(t["mme21"])} · MME 50: {br(t["mme50"])} · MME 200: {br(t["mme200"])}'],
           ['IFR (14)', br(t['ifr14'], 1)], ['MACD / sinal', f'{br(t["macd"])} / {br(t["sinal"])}'],
           ['Bandas de Bollinger (20; 2)', f'inferior {br(t["bb_inf"])} · superior {br(t["bb_sup"])}'],
           ['Estocástico %K / %D', f'{br(t["estoc_k"], 0)} / {br(t["estoc_d"], 0)}'], ['ADX (DI+ / DI−)', f'{br(t["adx"], 0)} ({br(t["di_mais"], 0)} / {br(t["di_menos"], 0)})'],
           ['ATR (14)', f'R$ {br(t["atr14"])} por dia'], ['Volume 5 dias / média de 60', f'{br(t["vol_rel"], 2)}x'],
           ['Mín. / máx. de 20 e 252 pregões', f'{br(t["min20"])} – {br(t["max20"])} · {br(t["min252"])} – {br(t["max252"])}'],
           ['Pivô semanal (S2 · S1 · P · R1 · R2)', f'{br(t["s2"])} · {br(t["s1"])} · {br(t["pivo"])} · {br(t["r1"])} · {br(t["r2"])}']]
    niv_t = [['Entrada ideal', f'R$ {br(n["ent_ideal"])}'], ['Entrada máxima', f'R$ {br(n["ent_max"])}'], ['Stop', f'R$ {br(n["stop"])} ({pc(n["perda"])})'],
             ['Alvo 1 (técnico)', f'R$ {br(n["alvo1"])} ({pc(n["ganho1"])})'], ['Alvo 2 (cenário)', f'R$ {br(n["alvo2"])} ({pc(n["ganho2"])})'],
             ['Reprecificação no cenário', f'fundamental {pc(n["up_fund"])} · empírica {pc(n["up_emp"])} · média {pc(n["up"])}'], ['Ganho / risco', br(n['rr2'], 1)]]
    t1 = tabela(['Indicador', 'Valor'], ind, [52 * mm, (W - 28 * mm) * 0.58 - 52 * mm])
    t2 = tabela(['Nível', 'Preço'], niv_t, [30 * mm, (W - 28 * mm) * 0.42 - 33 * mm], destaque=[('TEXTCOLOR', (1, 3), (1, 3), VERM)])
    lado = Table([[t1, t2]], colWidths=[(W - 28 * mm) * 0.58, (W - 28 * mm) * 0.42])
    lado.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (0, 0), 3 * mm), ('RIGHTPADDING', (1, 0), (1, 0), 0)]))
    bloco += [Spacer(1, 3 * mm), lado, Paragraph('Leitura dos indicadores', H2)] + [b(x) for x in LEIT[tk]]
    st += bloco + [PageBreak()]

# maiores altas de 05/10
top = alt.head(25)
GR = {'ECOR3': 'Concessões', 'MOVI3': 'Locação', 'MGLU3': 'Varejo', 'PGMN3': 'Varejo (farmácia)', 'CSAN3': 'Holding/energia', 'SBFG3': 'Varejo', 'B3SA3': 'Bolsa',
      'BPAC11': 'Banco', 'VAMO3': 'Locação', 'RENT3': 'Locação', 'CYRE4': 'Construção', 'CEAB3': 'Varejo', 'GGPS3': 'Serviços', 'RENT4': 'Locação', 'SMFT3': 'Academias',
      'CYRE3': 'Construção', 'PLPL3': 'Construção', 'EZTC3': 'Construção', 'ANIM3': 'Educação', 'ASAI3': 'Varejo (atacarejo)', 'SIMH3': 'Logística', 'AZEV4': 'Engenharia',
      'LREN3': 'Varejo', 'BBDC3': 'Banco', 'ENGI11': 'Energia'}
lin = [[f'{i}', tk, r.nome.title(), GR.get(tk, ''), br(r.ant), br(r.fech), pc(r.ret)] for i, (tk, r) in enumerate(top.iterrows(), start=1)]
st += [Paragraph('Maiores altas do pregão de 05/10/2026', H1),
       Paragraph('Primeiro pregão depois do 1º turno · ações com volume médio de pelo menos R$ 5 milhões por dia', SUB),
       tabela(['Nº', 'Ação', 'Nome no pregão', 'Setor', 'Fech. 02/10', 'Fech. 05/10', 'Alta'], lin,
              [9 * mm, 18 * mm, 40 * mm, 34 * mm, 22 * mm, 22 * mm, (W - 28 * mm) - 145 * mm], num_cols=(4, 5, 6),
              destaque=[('TEXTCOLOR', (6, 1), (6, -1), VERDE)]),
       Spacer(1, 3 * mm), Paragraph('O que o pregão de 05/10 mostra', H2),
       b('<b>Os maiores ganhos vieram dos setores mais sensíveis a juros domésticos:</b> varejo, construção civil, locadoras e concessões. São os que mais se beneficiam de juros longos menores e de risco-país em queda.'),
       b('<b>B3 e BTG Pactual</b> subiram mais de 22%. Bolsa e banco de investimento ganham diretamente com mais negócios no mercado de capitais.'),
       b(f'<b>Entre as seis ações analisadas:</b> B3 {pc(tec["B3SA3"]["ret_0510"])}, BTG {pc(tec["BPAC11"]["ret_0510"])}, Banco do Brasil {pc(tec["BBAS3"]["ret_0510"])}, Marcopolo {pc(tec["POMO4"]["ret_0510"])}, '
         f'BB Seguridade {pc(tec["BBSE3"]["ret_0510"])} e Caixa Seguridade {pc(tec["CXSE3"]["ret_0510"])}.'),
       b('<b>Atenção:</b> varejo e construção civil estão fora do método por decisão de gestão. Se o cenário se confirmar, devem estar entre os que mais sobem, mas não entram na carteira.')]
st += [Spacer(1, 2 * mm), Paragraph('Riscos e cuidados', H2),
       b('<b>Resultado contrário:</b> se Lula vencer, o stop protege a posição. Mas a abertura de segunda-feira pode vir com salto de preço abaixo do stop, e a perda real ser maior.'),
       b('<b>Salto na abertura:</b> se a vitória se confirmar, a segunda-feira pode abrir acima das entradas indicadas. Nesse caso, não perseguir o preço: esperar recuo até a entrada máxima ou abaixo.'),
       b('<b>Cotações:</b> os níveis foram calculados com o fechamento de 21/10/2026. Confirme o preço do dia antes de executar.'),
       b('<b>Natureza do material:</b> análise de cenário da SOLIDUNS, não recomendação individual de investimento.')]
doc.build(st); print('ok')
