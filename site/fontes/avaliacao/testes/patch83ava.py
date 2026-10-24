"""SOLIDUNS — RAMO AVALIAÇÃO DE IMÓVEIS (AVA) — patch83ava.py (09/10/2026)
v83-AVA = v82-LEI (md5 8c20bf30021cf9b4a535d8eb540826fc) + módulo "Avaliação de imóveis" (laudos periciais NBR 14653).
SÓ INSERÇÕES no index.html (nenhuma tela de MF, LEI ou AG é alterada):
  1. card "Avaliação de imóveis" no hub de Investimentos (depois de Mercado imobiliário);
  2. seção painel-avaliacao-imoveis com o módulo num quadro (iframe) que abre o arquivo novo avaliacao.html;
  3. 1 linha em AREAS_PLANO ('avaliacao_imoveis'), AREA_DO_PAINEL, ROTAS ('avaliacao-imoveis'), ROTAS_REDIRECT (4 apelidos),
     marcarAtivo, subareasInvestimentos e restaurarTituloAposFecharEquipe;
  4. bloco JS aval* antes do Mercado imobiliário: ponte window.SOLIDUNS_AVAL (sessão, token, administrador, sair, Minha conta,
     pedido), abertura do quadro ao entrar no painel, limpeza do módulo ao sair da conta (todos os botões Sair, inclusive
     os do cabeçalho público e do pedido de CPF; duplo clique ignorado; aviso se houver alterações sem enviar), área sempre liberada para os
     administradores do sistema (embrulho de areaLiberada só para 'avaliacao_imoveis') e avalAbrirCom(dados) — contrato v1
     para outras áreas abrirem o módulo com uma avaliação já preenchida (ex.: Leilão > "Avaliar este imóvel").
Arquivo NOVO no 1_DEPLOY: avaliacao.html (o módulo; aberto fora da plataforma, volta para #/avaliacao-imoveis).
Banco: SQL 160 (tabelas aval_*, pasta aval-anexos). Faixa de SQL do ramo AVA: 160 a 189.
Uso:  python3 patch83ava.py <index.html base (v82-LEI)> <index.html saída>"""
import hashlib
import sys

if len(sys.argv) != 3:
    sys.exit('uso: python3 patch83ava.py <index base> <index saída>')
ORIG, DEST = sys.argv[1], sys.argv[2]
s = open(ORIG, encoding='utf-8').read()
md5 = hashlib.md5(s.encode('utf-8')).hexdigest()
if md5 != '8c20bf30021cf9b4a535d8eb540826fc':
    print('AVISO: a base não é a v82-LEI (md5 ' + md5 + '); conferindo pelos trechos.')


def troca(a, n_, n=1):
    global s
    c = s.count(a)
    if c != n:
        sys.exit(f'ERRO: esperado {n}, achei {c}:\n{a[:160]}')
    s = s.replace(a, n_)


NOVOS = ['painel-avaliacao-imoveis', 'SOLIDUNS_AVAL', 'avalAbrir', 'aval-frame', "'avaliacao-imoveis'", 'avaliacao_imoveis', '_areaLiberadaV83A']
ja = [n for n in NOVOS if n in s]
if ja:
    sys.exit('ERRO: nomes novos já existem na base (aplicado duas vezes ou base errada): ' + ', '.join(ja))

# 1. card no hub de Investimentos (depois do Mercado imobiliário)
troca('''          <h2>Mercado imobiliário</h2>
          <p>Imóveis à venda fora de leilão — compra e venda direta.</p>
        </button>''', '''          <h2>Mercado imobiliário</h2>
          <p>Imóveis à venda fora de leilão — compra e venda direta.</p>
        </button>
        <button type="button" class="escolha-card" data-painel="avaliacao-imoveis" aria-label="Avaliação de imóveis — Laudos periciais de imóveis urbanos e rurais pela NBR 14653, do enquadramento à emissão.">
          <h2>Avaliação de imóveis</h2>
          <p>Laudos periciais de imóveis urbanos e rurais pela NBR 14653 — do enquadramento à emissão.</p>
        </button>''')

# 2. seção nova (antes do Leilão de automóveis, que é a primeira seção depois do hub)
SECAO = '''    <!-- INVESTIMENTOS - AVALIACAO DE IMOVEIS (v83-AVA) -->
    <section class="painel" id="painel-avaliacao-imoveis">
      <button type="button" class="voltar-link" data-painel="investimentos-escolha">&larr; Investimentos</button>
      <div class="page-head aval-head">
        <h1>Avaliação de Imóveis</h1>
        <p><span class="breadcrumb-link" data-painel="investimentos-escolha">Investimentos</span> — Laudos periciais pela NBR 14653</p>
      </div>
      <div class="aval-quadro"><iframe id="aval-frame" title="Avaliação de imóveis — laudos periciais" allow="camera; geolocation; clipboard-write"></iframe></div>
    </section>

    <!-- INVESTIMENTOS - LEILAO DE AUTOMOVEIS (v77-LEI) -->'''
troca('    <!-- INVESTIMENTOS - LEILAO DE AUTOMOVEIS (v77-LEI) -->', SECAO)

# 3. navegação, área do plano e título
troca("  ['mercado_imobiliario', 'Mercado imobiliário'],\n",
      "  ['mercado_imobiliario', 'Mercado imobiliário'],\n  ['avaliacao_imoveis', 'Avaliação de imóveis (laudos)'],   /* v83-AVA */\n")
troca("var AREA_DO_PAINEL = {'acoes':'filtro_acoes', 'leilao':'leiloes', 'leilao-veiculos':'leiloes', ",
      "var AREA_DO_PAINEL = {'acoes':'filtro_acoes', 'leilao':'leiloes', 'leilao-veiculos':'leiloes', 'avaliacao-imoveis':'avaliacao_imoveis', ")
troca("""  'mercado-imobiliario':    {tipo:'painel', painel:'mercado-imobiliario', pai:'Investimentos', filho:'Mercado imobiliário', marcarRota:'investimentos'},""",
      """  'mercado-imobiliario':    {tipo:'painel', painel:'mercado-imobiliario', pai:'Investimentos', filho:'Mercado imobiliário', marcarRota:'investimentos'},
  'avaliacao-imoveis':      {tipo:'painel', painel:'avaliacao-imoveis', pai:'Investimentos', filho:'Avaliação de imóveis', marcarRota:'investimentos'},   /* v83-AVA */""")
troca("""  'investimentos/mercado-imobiliario': '#/mercado-imobiliario',""",
      """  'investimentos/mercado-imobiliario': '#/mercado-imobiliario',
  'investimentos/avaliacao-imoveis': '#/avaliacao-imoveis', 'avaliacao': '#/avaliacao-imoveis', 'avaliacao-de-imoveis': '#/avaliacao-imoveis', 'laudos': '#/avaliacao-imoveis',   /* v83-AVA */""")
troca("painelId === 'investimentos-escolha' || painelId === 'leilao' || painelId === 'leilao-veiculos' || painelId === 'acoes'",
      "painelId === 'investimentos-escolha' || painelId === 'leilao' || painelId === 'leilao-veiculos' || painelId === 'avaliacao-imoveis' || painelId === 'acoes'")
troca("var subareasInvestimentos = ['acoes','leilao','leilao-veiculos','mercado-imobiliario','empresas'];",
      "var subareasInvestimentos = ['acoes','leilao','leilao-veiculos','mercado-imobiliario','avaliacao-imoveis','empresas'];")
troca("    else if(id === 'leilao-veiculos') setTituloPagina('Leilão de automóveis');\n",
      "    else if(id === 'leilao-veiculos') setTituloPagina('Leilão de automóveis');\n    else if(id === 'avaliacao-imoveis') setTituloPagina('Avaliação de imóveis');\n")

# 4. bloco JS
BLOCO = r"""/* ==========================================================================
   v83-AVA — AVALIAÇÃO DE IMÓVEIS (SQL 160) — módulo num quadro (avaliacao.html)
   O módulo usa a sessão da plataforma pela ponte window.SOLIDUNS_AVAL: não tem login, senha nem plano próprios.
   Dados nas tabelas aval_* (RLS: dono liberado com a área 'avaliacao_imoveis'; administrador do sistema para suporte).
   ========================================================================== */
window.SOLIDUNS_AVAL = {
  url: SUPABASE_URL,
  key: SUPABASE_KEY,
  token: function(){   /* uma renovação por vez: o módulo faz pedidos em paralelo */
    if(!window._avalToken) window._avalToken = Promise.resolve(contaTokenValido()).finally(function(){ window._avalToken = null; });
    return window._avalToken;
  },
  usuario: function(){
    if(!sessaoAtual || sessaoAtual.modoLocal) return null;
    const u = sessaoAtual.user || {};
    const meta = u.user_metadata || {};
    return {id: u.id || null, email: sessaoAtual.email || u.email || '', nome: sessaoAtual.nome || meta.nome || meta.full_name || ''};
  },
  admin: function(){ return ehAdminSistema(); },
  sair: function(){ avalSairDaPlataforma(); },
  abrirConta: function(aba){ abrirConta(aba || 'plano'); },
  pedido: function(){ const p = window._avalPedido || null; window._avalPedido = null; return p; }
};
/* Os administradores do sistema sempre abrem o módulo (o banco também libera: public.aval_pode). */
var _areaLiberadaV83A = areaLiberada;
areaLiberada = function(cod){
  if(cod === 'avaliacao_imoveis' && ehAdminSistema()) return true;
  return _areaLiberadaV83A.apply(this, arguments);
};
/* CONTRATO v1 para outras áreas (ex.: Leilão > "Avaliar este imóvel"): avalAbrirCom({origem:'leilao', ref, url, uf, cidade,
   bairro, endereco, tipo, area, matricula, processo, juizo, valorEdital, lance, finalidade}). Abre o módulo e cria uma
   avaliação nova já preenchida. Quem não tem a área no plano vê a tela de plano (o pedido é descartado). */
window._avalPedido = null;
function avalAbrirCom(dados){
  if(!dados || typeof dados !== 'object') return false;
  if(!areaLiberada('avaliacao_imoveis')){ navegarHash('#/avaliacao-imoveis'); return false; }
  window._avalPedido = dados;
  if(window.location.hash !== '#/avaliacao-imoveis') navegarHash('#/avaliacao-imoveis');
  else window.mostrarPainelDash('avaliacao-imoveis');
  avalEntregarPedido();
  return true;
}
function avalEntregarPedido(){
  const f = avalFrame();
  if(!window._avalPedido || !f || !f.getAttribute('src')) return;
  try{
    const w = f.contentWindow;
    if(w && w.avalPronto && typeof w.avalReceber === 'function'){
      const p = window._avalPedido; window._avalPedido = null; w.avalReceber(p);
    }
  }catch(e){}
}
var _avalSaindo = false;
function avalFrame(){ return document.getElementById('aval-frame'); }
/* o quadro ocupa a tela do ponto onde começa até o fim da janela */
function avalAjustar(){
  const f = avalFrame();
  if(!f || !f.offsetParent) return;
  const topo = f.getBoundingClientRect().top + window.scrollY;
  f.style.height = Math.max(window.innerWidth <= 760 ? 420 : 560, Math.round(window.innerHeight - topo - 10)) + 'px';
}
window.addEventListener('resize', avalAjustar);
window.addEventListener('orientationchange', function(){ setTimeout(avalAjustar, 300); });
function avalAbrir(){
  const f = avalFrame();
  if(!f) return;
  setTimeout(avalAjustar, 0);
  const u = window.SOLIDUNS_AVAL.usuario();
  const dono = (u && u.id) || '';
  if(!f.getAttribute('src') || f.dataset.dono !== dono){
    f.dataset.dono = dono;
    f.setAttribute('src', 'avaliacao.html?v=83');
  }
}
/* antes de sair: o módulo envia o que falta (até 25 s) e limpa o aparelho.
   Devolve true se pode sair; false se o usuário preferiu ficar porque ainda há alterações sem enviar. */
async function avalEncerrarModulo(){
  const f = avalFrame();
  if(!f || !f.getAttribute('src')) return true;
  let limpo = true;
  try{
    const w = f.contentWindow;
    if(w && typeof w.avalEncerrar === 'function'){
      limpo = await Promise.race([w.avalEncerrar(), new Promise(res => setTimeout(() => res(false), 25000))]);
    }
  }catch(e){ limpo = false; }
  if(limpo === false && !window.confirm('Avaliação de imóveis: algumas alterações ainda não foram enviadas (sem conexão).\n\n' +
       'Se sair agora, elas ficam guardadas neste aparelho e sobem quando você entrar de novo aqui.\n\nSair mesmo assim?')) return false;
  f.removeAttribute('src');
  f.dataset.dono = '';
  try{ f.contentWindow.location.replace('about:blank'); }catch(e){}
  return true;
}
async function avalSairDaPlataforma(){
  if(_avalSaindo) return;
  _avalSaindo = true;
  let pode = true;
  try{ pode = await avalEncerrarModulo(); } finally { _avalSaindo = false; }
  if(!pode) return;
  window._avalPedido = null;
  fazerLogout();
}
/* todos os botões "Sair" da plataforma passam primeiro pelo módulo, se ele estiver aberto */
var AVAL_BOTOES_SAIR = '#btn-sair-dash, #btn-sair-fiscal, #btn-cpf-gate-sair, [id^="landing-btn-sair-header"]';
document.addEventListener('click', function(ev){
  const b = ev.target && ev.target.closest && ev.target.closest(AVAL_BOTOES_SAIR);
  if(!b) return;
  window._avalPedido = null;
  const f = avalFrame();
  if(!_avalSaindo && (!f || !f.getAttribute('src'))) return;
  ev.stopImmediatePropagation();
  ev.preventDefault();
  avalSairDaPlataforma();   /* segundo clique durante a saída: ignorado */
}, true);
(function(){
  const st = document.createElement('style');
  st.textContent = '#painel-avaliacao-imoveis .aval-head{margin-bottom:10px;}'
    + '.aval-quadro{border:1px solid var(--line);border-radius:var(--radius);background:#000;overflow:hidden;}'
    + '#aval-frame{display:block;width:100%;border:0;height:calc(100vh - var(--topbar-h, 64px) - 150px);min-height:560px;background:#000;}'
    + '@supports (height:100dvh){#aval-frame{height:calc(100dvh - var(--topbar-h, 64px) - 150px);}}'
    + '@media (max-width:760px){#painel-avaliacao-imoveis .aval-head{display:none;}#painel-avaliacao-imoveis .voltar-link{margin-bottom:8px;}'
    + '#aval-frame{min-height:420px;}'
    + '.aval-quadro{border-left:0;border-right:0;border-radius:0;margin:0 -16px;}}';
  document.head.appendChild(st);
  const ant = window.mostrarPainelDash;
  if(typeof ant === 'function'){
    window.mostrarPainelDash = function(painelId, viaVoltar){
      const r = ant.apply(this, arguments);
      if(painelId === 'avaliacao-imoveis' && document.getElementById('painel-avaliacao-imoveis').classList.contains('ativo')){
        setTituloPagina('Avaliação de imóveis', 'Laudos periciais de imóveis urbanos e rurais pela NBR 14653 — SOLIDUNS.');
        avalAbrir();
        avalEntregarPedido();
      }
      return r;
    };
  }
})();

"""
troca('/* ==========================================================================\n   MERCADO IMOBILIÁRIO — compra e venda fora de leilão.',
      BLOCO + '/* ==========================================================================\n   MERCADO IMOBILIÁRIO — compra e venda fora de leilão.')

open(DEST, 'w', encoding='utf-8').write(s)
print('ok', DEST, hashlib.md5(s.encode('utf-8')).hexdigest())
