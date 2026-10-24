"""Testes das regras da NBR 14653 no motor de cálculo do módulo (sem servidor).
Uso: python3 t_nbr.py [url do test.html da versão avulsa]  (padrão http://localhost:8765/test.html)"""
import sys, json
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/test.html'
R = []
def rec(n, ok, det=''):
    R.append((n, bool(ok), det)); print(('OK    ' if ok else 'FALHA ') + n + ('' if ok else '  -> ' + str(det)))

JS_BASE = r"""(()=>{window.__av=(vhs,extra={})=>{const ams=vhs.map((v,i)=>({id:'d'+i,ref:'D'+(i+1),natureza:'transacao',fonte:'F',data:'2026-09-01',preco:String(v*100),area:'100',endereco:extra.semEnd?'':'Rua Exemplo, '+(i+1)+', Bairro, Brasília/DF',f:Object.assign({},extra.f&&extra.f[i]||{})}));
 return Object.assign({id:'avT',codigo:'T',segmento:'urbano',amostra:ams,metodo:{escolha:'comparativo'},doc:{areaDoc:'100'},vistoria:{validada:true},espec:{i1:'3',i3:'3'},resultado:{}},extra.a||{})};return 1})()
"""

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        pg.goto(URL); pg.wait_for_function("typeof calcComparativo==='function'&&typeof DB==='object'", timeout=20000)
        pg.evaluate(JS_BASE)
        # ---------- Tabela 2 (regressão) ----------
        t2 = pg.evaluate("[[2,3,2,3,3,3],[3,2,3,3,3,3],[1,1,1,1,1,1],[3,3,3,3,3,0],[1,2,1,2,2,2]].map(v=>enquadra(v.reduce((s,x)=>s+x,0),v,[1,3,4,5],[16,10,6]))")
        rec('Tabela 2: 16 pontos com itens 2, 4, 5 e 6 no grau III = grau III', t2[0] == 3, t2)
        rec('Tabela 2: item 2 no grau II derruba para o grau II', t2[1] == 2, t2)
        rec('Tabela 2: 6 pontos, todos no grau I = grau I', t2[2] == 1, t2)
        rec('Tabela 2: item obrigatório não atendido = sem enquadramento', t2[3] == 0, t2)
        rec('Tabela 2: 10 pontos com obrigatórios no grau II = grau II', t2[4] == 2, t2)
        # ---------- B.3 saneamento um a um ----------
        san = pg.evaluate("(()=>{const c=calcComparativo(__av([100,100,100,100,100,250,70]));return {n:c.n,fora:c.rows.filter(r=>!c.ativos.includes(r)).map(r=>r.vh)}})()")
        rec('B.3: saneamento retira um dado por vez (o 70 volta depois que o 250 sai)', san['n'] == 6 and san['fora'] == [250], san)
        # ---------- B.2.2 fator isolado ----------
        b22 = pg.evaluate("(()=>{const c=calcComparativo(__av([100,101,99,100,102],{f:[{Fl:'2.2'}]}));const r=c.rows[0];return {fora:r.fora,motivo:r.motivo,n:c.n}})()")
        rec('B.2.2: dado com fator isolado acima de 2,00 é excluído', b22['fora'] and b22['motivo'].startswith('B.2.2') and b22['n'] == 4, b22)
        # ---------- Tabela 3, item 4 ----------
        i4 = pg.evaluate("""(()=>{const it=(vhs,f)=>fundamentacao(__av(vhs,{f})).itens[3][1];
          return {n4_13:it([100,100,100,100],[{Fl:'1.3'}]),n5_13:it([100,100,100,100,100],[{Fl:'1.3'}]),n5_23:it([100,100,100,100,100],Array(5).fill({Fl:'1.6',Ft:'1.7'})),n5_11:it([100,100,100,100,100],[{Fl:'1.1'}])}})()""")
        rec('Tabela 3: com menos de 5 dados, conjunto fora de 0,80–1,25 não pontua (nota a)', i4['n4_13'] == 0, i4)
        rec('Tabela 3: conjunto 1,30 com 5 dados = grau II no item 4', i4['n5_13'] == 2, i4)
        rec('Tabela 3: conjunto 2,30 com 5 dados = grau I no item 4', i4['n5_23'] == 1, i4)
        rec('Tabela 3: conjunto 1,10 = grau III no item 4', i4['n5_11'] == 3, i4)
        # ---------- Tabela 4 e exigências do grau III (9.2.2.1) ----------
        g = pg.evaluate("""(()=>{const v=Array(12).fill(100);const f1=fundamentacao(__av(v));const f2=fundamentacao(__av(v,{semEnd:true}));
          const f3=fundamentacao(__av(v,{a:{resultado:{adotado:'11000'}}}));return [f1.grau,f2.grau,f3.grau,f2.obs]})()""")
        rec('Tabela 4: 12 dados, fatores em 0,80–1,25 e itens 1 e 3 no grau III = grau III', g[0] == 3, g)
        rec('9.2.2.1: sem endereço completo dos dados, o grau III cai para o II', g[1] == 2 and 'endereço' in g[3], g)
        rec('9.2.2.1: valor adotado diferente da estimativa central derruba o grau III', g[2] == 2, g)
        # ---------- Tabelas 6 e 7 (quantificação de custo) ----------
        qc = pg.evaluate("[grauQC({qc1:'3',qc2:'2',qc3:'2'}),grauQC({qc1:'2',qc2:'2',qc3:'1'}),grauQC({qc1:'1',qc2:'1',qc3:'1'}),grauQC({qc1:'3',qc2:'1',qc3:'3'}),grauQC({})]")
        rec('Tabela 7: item 1 no III e demais no II (7 pontos) = grau III', qc[0] == 3, qc)
        rec('Tabela 7: 5 pontos, itens 1 e 2 no II = grau II', qc[1] == 2, qc)
        rec('Tabela 7: todos no I = grau I', qc[2] == 1, qc)
        rec('Tabela 7: BDI arbitrado impede o grau II mesmo com 7 pontos', qc[3] == 1, qc)
        rec('Tabela 7: sem preenchimento, o item 2 continua manual', qc[4] is None, qc)
        # ---------- Tabelas 10 e 11 (evolutivo) ----------
        ev = pg.evaluate("[[3,3,2],[3,2,3],[2,2,1],[1,1,1],[3,3,1]].map(v=>enquadra(v.reduce((s,x)=>s+x,0),v,[0,1],[8,5,3]))")
        rec('Tabela 11: itens 1 e 2 no III e item 3 no II = grau III', ev[0] == 3, ev)
        rec('Tabela 11: item 2 no grau II limita ao grau II', ev[1] == 2, ev)
        rec('Tabela 11: 5 pontos com itens 1 e 2 no II = grau II', ev[2] == 2, ev)
        rec('Tabela 11: 3 pontos = grau I', ev[3] == 1, ev)
        rec('Tabela 11: item 3 no grau I impede o grau III', ev[4] == 2, ev)
        sh = pg.evaluate("""(()=>{const a=__av([100,100,100],{a:{metodo:{escolha:'evolutivo'},evolutivo:{vt:'10000',cub:'2000',ae:'100',idade:'10',vida:'60',estado:'C',fc:'1'},espec:{ev1:'1',ev2:'3',ev3:'2'}}});return fundamentacao(a).itens[0][1]})()""")
        rec('9.5.2.1: terreno com menos de 15% do total recebe 2 pontos', sh == 2, sh)
        # ---------- Tabelas 8 e 9 (involutivo) ----------
        inv = pg.evaluate("[[2,3,3,3,3,3,3,3,3],[3,2,3,3,3,3,3,3,3],[1,1,1,1,1,1,1,1,1],[2,2,2,2,2,3,2,3,2]].map(v=>enquadra(v.reduce((s,x)=>s+x,0),v,INV_OBRIG,[22,13,9]))")
        rec('Tabela 9: 26 pontos, itens 2, 6, 7 e 8 no III, demais no II = grau III', inv[0] == 3, inv)
        rec('Tabela 9: item 2 no grau II limita ao grau II', inv[1] == 2, inv)
        rec('Tabela 9: 9 pontos = grau I', inv[2] == 1, inv)
        rec('Tabela 9: 20 pontos = grau II', inv[3] == 2, inv)
        # ---------- Tabelas 4 e 5 da Parte 4 (renda) ----------
        ren = pg.evaluate("""(()=>{const f=(esp,op)=>{const e={};esp.forEach((v,i)=>e['ren'+i]=String(v));return fundNovos({espec:e,renda:{emOperacao:op},vistoria:{}},{tipo:'renda'})};
          const a=f([3,3,3,3,3,3,2,2,3],true),b=f([3,3,3,3,3,3,2,1,1],true),c=f([2,0,2,2,2,2,2,1,1],false),d=f([1,0,1,1,1,1,1,1,1],false);return [a.grau,a.pontos,b.grau,c.grau,c.pontos,d.grau,d.itens[1][1]]})()""")
        rec('Parte 4, Tabela 5: 25 pontos e 2 itens abaixo do III = grau III', ren[0] == 3 and ren[1] == 25, ren)
        rec('Parte 4, Tabela 5: dois itens no grau I impedem o grau III', ren[2] == 2, ren)
        rec('Parte 4: séries históricas não se aplicam fora de operação (8 itens)', ren[6] == 'n/a' and ren[4] == 14 and ren[3] == 2, ren)
        rec('Parte 4, Tabela 5: 8 itens no grau I = grau I', ren[5] == 1, ren)
        # ---------- A.10 intervalo de valores admissíveis ----------
        ia = pg.evaluate("""(()=>{const e={tipo:'comparativo',central:100,ic:[80,125]};return [intervaloAdmissivel({resultado:{}},e),intervaloAdmissivel({resultado:{adotado:'110'}},e)]})()""")
        rec('A.10.1.1: valores admissíveis = IC80% ∩ campo de arbítrio (85 a 115)', abs(ia[0]['lo'] - 85) < 1e-9 and abs(ia[0]['hi'] - 115) < 1e-9, ia)
        rec('A.10.1.2: valor arbitrado desloca o IC e respeita o campo de arbítrio (90 a 115)', abs(ia[1]['lo'] - 90) < 1e-9 and abs(ia[1]['hi'] - 115) < 1e-9 and ia[1]['arbitrado'], ia)
        # ---------- Tabela 5 (precisão) ----------
        gp = pg.evaluate("[.3,.31,.4,.5,.51].map(grauPrecisao)")
        rec('Tabela 5: 30% = III, 40% = II, 50% = I, acima de 50% sem grau', gp == [3, 2, 2, 1, 0], gp)
        b.close()

run()
ok = sum(1 for r in R if r[1]); print('\nNBR TOTAL %d OK %d FALHAS %d' % (len(R), ok, len(R) - ok))
sys.exit(0 if ok == len(R) else 1)
