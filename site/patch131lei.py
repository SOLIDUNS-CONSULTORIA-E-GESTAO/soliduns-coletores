# patch131lei.py — SOLIDUNS v131-LEI (16/10/2026): CMS do Valor e Mercado no site (Redação, página do artigo, Artigos na capa, publicidade)
#
# Pedido do Thiago (16/10): "QUANDO EU QUISER INCLUIR UM ARTIGO… SEM PRECISAR DE ACIONAR VOCÊ" → CMS aprovado (prévia
# cms_valor_e_mercado_previa.html) + "NÃO ALTERAR O cabeçalho (ou header). NÃO ALTERAR A LOGO E NADA DO HEADER" + publicidade no
# padrão dos grandes portais (SQL 147). Banco já instalado: SQL 146 (CMS) e 147 (publicidade).
#   1. Botão "Redação" do jornal abre a Redação (página própria /noticias/redacao/, fora do site principal: o cabeçalho e a logo
#      do site não mudam). Lá: escrever, salvar, agendar, publicar e corrigir artigos; fila; publicados; layout da capa; mídia;
#      publicidade; auditoria. Tudo por RPC protegida (_vm_exige_editor).
#   2. Página pública do artigo: #/noticias/artigo/<nº> (o mesmo leitor do Scanner), com blocos (parágrafo, intertítulo,
#      citação, imagem, lista, tabela, box numérico, PDF), códigos de ação viram link, fontes, crédito da foto, nota de correção,
#      compartilhar (link /noticias/?artigo=<nº>, que a página de passagem leva ao artigo).
#   3. Seção "Artigos" na capa (entre a manchete e a lista de notícias), respeitando o layout da Redação (ligado/desligado e
#      até 3 destaques).
#   4. Publicidade: faixa do topo (acima da manchete), retângulo lateral (coluna "O que move o dia", depois do Scanner) e
#      dentro do texto (depois do 2º parágrafo da manchete e dos artigos). Etiqueta "Publicidade" sempre; link com
#      rel="sponsored"; imagem de celular quando houver. Só aparece espaço ligado com banner no período.
# Nenhuma menção a IA. Cabeçalho e logo do site: intocados (conferido pelo teste t131).
#
# Uso: python3 patch131lei.py index_v130_completo.html index_v131_completo.html
#      python3 patch122lei.py index_v131_completo.html saida131/ --sem-md5 --versao=v131
#      + pacote: noticias/ (passagem com ?artigo=), noticias/scanner/, noticias/redacao/ (CMS), og-*.jpg
import sys, hashlib

ORIG_MD5 = "76fdf429eb96288821c35bfb541777cd"     # v130 completo

def troca(s, velho, novo, n=1):
    c = s.count(velho)
    assert c == n, f"esperado {n}, achou {c}: {velho[:90]}"
    return s.replace(velho, novo)

CSS = r"""/* v131: Artigos (capa e página do artigo) e publicidade */
#tela-noticias .vm-grade{grid-template-areas:"main side" "artigos side" "lista side";}
#tela-noticias .vm-artigos{grid-area:artigos;margin-top:2.2rem;}
#tela-noticias .vm-art-dest{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:1.2rem;align-items:start;padding-bottom:1.2rem;border-bottom:1px solid #CFC9B4;margin-bottom:1rem;}
#tela-noticias .vm-art-dest img{width:100%;aspect-ratio:3/2;object-fit:cover;display:block;background:#E5DFCC;}
#tela-noticias .vm-art-item{display:flex;gap:1rem;align-items:flex-start;padding:.9rem 0;border-bottom:1px solid #E1DBC8;}
#tela-noticias .vm-art-item img{width:118px;aspect-ratio:3/2;object-fit:cover;flex:none;background:#E5DFCC;}
#tela-noticias .vm-art-ch{font:500 11px "Jost",sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--vm-dsol);}
#tela-noticias .vm-art-tit{font:500 1.35rem/1.25 "Newsreader",Georgia,serif;color:var(--vm-tinta);margin:.25rem 0 .35rem;text-wrap:balance;}
#tela-noticias .vm-art-item .vm-art-tit{font-size:1.12rem;}
#tela-noticias .vm-art-tit a{color:inherit;text-decoration:none;}
#tela-noticias .vm-art-tit a:hover{text-decoration:underline;text-underline-offset:3px;}
#tela-noticias .vm-art-lf{font:400 1rem/1.5 "Newsreader",Georgia,serif;color:var(--vm-tinta2);margin:0 0 .35rem;}
#tela-noticias .vm-art-meta{font:400 12.5px "Jost",sans-serif;color:var(--vm-tinta2);}
#tela-noticias .vm-leit-foto{margin:0 0 1.2rem;}
#tela-noticias .vm-leit-foto img{width:100%;display:block;background:#E5DFCC;}
#tela-noticias .vm-leit-foto figcaption,#tela-noticias .vm-art-fig figcaption{font:400 11.5px "Jost",sans-serif;color:var(--vm-tinta2);text-align:right;margin-top:.3rem;}
#tela-noticias .vm-art-fig{margin:1.4rem 0;}
#tela-noticias .vm-art-fig img{width:100%;display:block;}
#tela-noticias .vm-leit-texto h2.vm-art-inter{font:500 1.5rem/1.3 "Newsreader",Georgia,serif;color:var(--vm-tinta);margin:1.8rem 0 .7rem;text-align:left;}
#tela-noticias .vm-leit-texto blockquote{font:italic 400 1.3rem/1.55 "Newsreader",Georgia,serif;color:var(--vm-tinta);border-left:4px solid var(--vm-vm);margin:1.5rem 0;padding:.1rem 0 .1rem 1rem;}
#tela-noticias .vm-leit-texto ul,#tela-noticias .vm-leit-texto ol{font:400 1.15rem/1.65 "Newsreader",Georgia,serif;color:var(--vm-tinta);margin:0 0 1.2rem;padding-left:1.5rem;}
#tela-noticias .vm-leit-texto li{margin:.3rem 0;}
#tela-noticias .vm-leit-texto li::marker{color:var(--vm-dsol);}
#tela-noticias .vm-leit-texto mark{background:var(--vm-dou);color:inherit;padding:0 .1em;}
#tela-noticias .vm-leit-texto code{font:400 .9em ui-monospace,"IBM Plex Mono",monospace;background:#ECE7D6;padding:0 .25em;}
#tela-noticias .vm-leit-texto a{color:var(--vm-vm);}
#tela-noticias .vm-leit-texto a.vm-ticker{font-weight:500;text-decoration:underline dotted;text-underline-offset:3px;}
#tela-noticias .vm-art-tab{margin:1.5rem 0;}
#tela-noticias .vm-art-tab>div{overflow-x:auto;}
#tela-noticias .vm-art-tab table{width:100%;border-collapse:collapse;font:400 14px "Jost",sans-serif;color:var(--vm-tinta);}
#tela-noticias .vm-art-tab th{text-align:left;font-weight:500;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--vm-creme);background:var(--vm-vm);padding:.55rem .75rem;}
#tela-noticias .vm-art-tab td{padding:.5rem .75rem;border-bottom:1px solid var(--vm-linha);}
#tela-noticias .vm-art-tab tr:nth-child(even) td{background:rgba(236,231,214,.6);}
#tela-noticias .vm-art-tab td.num{text-align:right;font-variant-numeric:tabular-nums;}
#tela-noticias .vm-art-tab figcaption{font:400 12px "Jost",sans-serif;color:var(--vm-tinta2);margin-top:.4rem;text-align:left;}
#tela-noticias .vm-art-num{display:flex;align-items:center;gap:1.2rem;border-left:4px solid var(--vm-dsol);background:#ECE7D6;padding:1rem 1.2rem;margin:1.5rem 0;}
#tela-noticias .vm-art-num b{font:400 2.8rem/1 "Newsreader",Georgia,serif;color:var(--vm-vm);white-space:nowrap;}
#tela-noticias .vm-art-num span{font:400 14px/1.4 "Jost",sans-serif;color:var(--vm-tinta);}
#tela-noticias .vm-art-pdf{display:flex;align-items:center;gap:1rem;border:1px solid var(--vm-linha);background:rgba(255,255,255,.6);padding:.8rem 1rem;margin:1.3rem 0;text-decoration:none;}
#tela-noticias .vm-art-pdf:hover{border-color:var(--vm-vm);}
#tela-noticias .vm-art-pdf i{font:500 11px "Jost",sans-serif;font-style:normal;background:var(--vm-vm);color:var(--vm-creme);padding:.25rem .5rem;}
#tela-noticias .vm-art-pdf span{flex:1;font:400 1.05rem "Newsreader",Georgia,serif;color:var(--vm-tinta);}
#tela-noticias .vm-art-pdf small{display:block;font:400 12px "Jost",sans-serif;color:var(--vm-tinta2);}
#tela-noticias .vm-art-corr{font:400 13px/1.55 "Jost",sans-serif;color:var(--vm-tinta2);background:#ECE7D6;padding:.8rem 1rem;margin-top:1.2rem;}
#tela-noticias .vm-art-tags{font:400 12px "Jost",sans-serif;color:var(--vm-tinta2);margin-top:1rem;}
#tela-noticias .vm-pub{margin:1.4rem auto;width:100%;}
#tela-noticias .vm-pub-rot{display:block;font:500 10px "Jost",sans-serif;letter-spacing:.18em;text-transform:uppercase;color:var(--vm-tinta2);margin-bottom:.3rem;}
#tela-noticias .vm-pub a{display:block;margin:0 auto;max-width:var(--mw);aspect-ratio:var(--ar);background:#ECE7D6;border:1px solid var(--vm-linha);overflow:hidden;}
#tela-noticias .vm-pub img{width:100%;height:100%;object-fit:cover;display:block;}
#tela-noticias .vm-pub-topo{margin:0 auto 1.6rem;}
#tela-noticias.vm-modo-leitura #vm-pub-topo{display:none;}
#tela-noticias .vm-pub-topo .vm-pub-rot,#tela-noticias .vm-pub-texto .vm-pub-rot{text-align:center;}
@media (max-width:640px){#tela-noticias .vm-pub a{max-width:var(--mwc);aspect-ratio:var(--arc);}}
@media (max-width:860px){
  #tela-noticias .vm-grade{grid-template-areas:"main" "side" "artigos" "lista";}
  #tela-noticias .vm-art-dest{grid-template-columns:minmax(0,1fr);}
}
"""

JS = r"""
/* ---------- v131: VALOR E MERCADO — artigos do CMS, página do artigo e publicidade ---------- */
var _vmArt = {lista: undefined, layout: undefined, ban: undefined, prom: null};
var VM_TICKER = /\b([A-Z]{4}(?:3|4|5|6|11|34))\b/g;
function vmArtLink(id){ return VM_SITE + 'noticias/?artigo=' + encodeURIComponent(id); }
function vmComTickers(h){
  return String(h).split(/(<a\b[\s\S]*?<\/a>|<code\b[\s\S]*?<\/code>|<[^>]+>)/).map((p, i) => i % 2 ? p : p.replace(VM_TICKER, t =>
    '<a class="vm-ticker" href="#/investimentos/mercado-financeiro/relatorios?ticker=' + t + '" title="Ver ' + t + ' na SOLIDUNS">' + t + '</a>')).join('');
}
var VM_FONTES = {newsreader: 'Newsreader,Georgia,serif', georgia: 'Georgia,serif', jost: 'Jost,sans-serif', plex: '"IBM Plex Sans",sans-serif', mono: '"IBM Plex Mono",monospace'};
var VM_TAM = {p: '.85em', g: '1.2em', gg: '1.5em'};
var VM_TAG = {negrito: 'strong', italico: 'em', sublinhado: 'u', riscado: 's', marcador: 'mark', menor: 'small', sobrescrito: 'sup', subscrito: 'sub', codigo: 'code'};
/* conteúdo fechado do CMS -> HTML seguro: tudo escapado; só as marcas da lista viram tag */
function vmConteudo(c){
  return (Array.isArray(c) ? c : []).map(x => {
    if(!x || typeof x !== 'object') return '';
    if(x.texto !== undefined) return escHtml(x.texto);
    const d = vmConteudo(x.conteudo);
    if(VM_TAG[x.marca]) return '<' + VM_TAG[x.marca] + '>' + d + '</' + VM_TAG[x.marca] + '>';
    if(x.marca === 'link' && /^https:\/\//i.test(x.url || '')) return '<a href="' + escHtml(x.url) + '" target="_blank" rel="noopener noreferrer">' + d + '</a>';
    if(x.marca === 'fonte' && VM_FONTES[x.valor]) return '<span style="font-family:' + VM_FONTES[x.valor] + '">' + d + '</span>';
    if(x.marca === 'tamanho' && VM_TAM[x.valor]) return '<span style="font-size:' + VM_TAM[x.valor] + '">' + d + '</span>';
    return d;
  }).join('');
}
function vmBlocos(blocos){
  return (Array.isArray(blocos) ? blocos : []).map(b => {
    if(!b) return '';
    if(b.tipo === 'imagem') return /^https:\/\//i.test(b.src || '') ? '<figure class="vm-art-fig"><img src="' + escHtml(b.src) + '" alt="" loading="lazy" decoding="async">'
      + (b.legenda ? '<figcaption>Foto: ' + escHtml(b.legenda) + '</figcaption>' : '') + '</figure>' : '';
    if(b.tipo === 'lista'){ const t = b.ordenada ? 'ol' : 'ul'; return '<' + t + '>' + (b.itens || []).map(i => '<li>' + vmComTickers(vmConteudo(i && i.conteudo)) + '</li>').join('') + '</' + t + '>'; }
    if(b.tipo === 'tabela') return '<figure class="vm-art-tab"><div><table><thead><tr>' + (b.cabecalho || []).map(c => '<th>' + escHtml(c) + '</th>').join('') + '</tr></thead><tbody>'
      + (b.linhas || []).map(l => '<tr>' + (l || []).map(c => '<td' + (/^[-+−]?[\d.,]+%?$/.test(String(c).trim()) ? ' class="num"' : '') + '>' + vmComTickers(escHtml(c)) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>'
      + (b.legenda || b.fonte ? '<figcaption>' + escHtml(b.legenda || '') + (b.fonte ? ' Fonte: ' + escHtml(b.fonte) : '') + '</figcaption>' : '') + '</figure>';
    if(b.tipo === 'numero') return '<aside class="vm-art-num"><b>' + escHtml(b.valor) + '</b><span>' + escHtml(b.legenda || '') + '</span></aside>';
    if(b.tipo === 'anexo') return /^https:\/\//i.test(b.url || '') ? '<a class="vm-art-pdf" href="' + escHtml(b.url) + '" target="_blank" rel="noopener noreferrer"><i>PDF</i><span>' + escHtml(b.titulo || b.nome || 'Documento')
      + '<small>' + escHtml(b.nome || '') + (b.tamanho ? ' · ' + escHtml(b.tamanho) : '') + ' · baixar</small></span></a>' : '';
    const h = vmComTickers(vmConteudo(b.conteudo));
    if(!h.trim()) return '';
    if(b.tipo === 'intertitulo') return '<h2 class="vm-art-inter">' + h + '</h2>';
    if(b.tipo === 'citacao') return '<blockquote>' + h + '</blockquote>';
    return '<p>' + h + '</p>';
  }).join('');
}
/* publicidade: um banner sorteado por espaço; só espaço ligado e banner no período (vm_banners_publicos) */
function vmBanners(){
  if(_vmArt.ban !== undefined) return Promise.resolve(_vmArt.ban);
  return vmRpc('vm_banners_publicos').then(d => { _vmArt.ban = (d && typeof d === 'object' && !Array.isArray(d)) ? d : {}; return _vmArt.ban; });
}
function vmPubHtml(espaco, extra){
  const e = _vmArt.ban && _vmArt.ban[espaco], l = e && Array.isArray(e.banners) ? e.banners.filter(b => /^https:\/\//i.test(b.imagem_url || '') && /^https:\/\//i.test(b.link || '')) : [];
  if(!l.length) return '';
  const b = l[Math.floor(Math.random() * l.length)];
  const cel = /^https:\/\//i.test(b.imagem_cel_url || '') ? b.imagem_cel_url : '';
  return '<div class="vm-pub' + (extra ? ' ' + extra : '') + '" style="--mw:' + (e.largura | 0) + 'px;--ar:' + (e.largura | 0) + '/' + (e.altura | 0) + ';--mwc:' + (e.largura_cel | 0) + 'px;--arc:' + (e.largura_cel | 0) + '/' + (e.altura_cel | 0) + '">'
    + '<span class="vm-pub-rot">Publicidade</span><a href="' + escHtml(b.link) + '" target="_blank" rel="sponsored noopener noreferrer">'
    + '<picture>' + (cel ? '<source media="(max-width:640px)" srcset="' + escHtml(cel) + '">' : '') + '<img src="' + escHtml(b.imagem_url) + '" alt="' + escHtml(b.alt || 'Publicidade') + '" loading="lazy" decoding="async"></picture></a></div>';
}
function vmPubNoTexto(el){        /* depois do 2º parágrafo */
  if(!el) return;
  el.querySelectorAll('.vm-pub-texto').forEach(x => x.remove());
  const h = vmPubHtml('artigo', 'vm-pub-texto'), ps = el.querySelectorAll(':scope > p');
  if(h && ps.length > 2) ps[1].insertAdjacentHTML('afterend', h);
}
function vmPubPreencher(){
  vmBanners().then(() => {
    const topo = document.getElementById('vm-pub-topo'), lat = document.getElementById('vm-pub-lateral');
    const ht = vmPubHtml('topo', 'vm-pub-topo'), hl = vmPubHtml('lateral');
    if(topo){ topo.innerHTML = ht; topo.hidden = !ht; }
    if(lat){ lat.innerHTML = hl; lat.hidden = !hl; }
    vmPubNoTexto(document.getElementById('vm-texto'));
  });
}
/* seção "Artigos" da capa (respeita o layout da Redação: ligado/desligado e até 3 destaques) */
function vmCarregarArtigos(){
  const sec = document.getElementById('vm-artigos');
  if(!sec) return;
  if(_vmArt.lista !== undefined) return vmDesenharArtigos();
  if(!_vmArt.prom) _vmArt.prom = Promise.all([vmRpcCorpo('vm_artigos_publicos', {p_limite: 20}), vmRpc('vm_layout_publico')])
    .then(([l, lay]) => { _vmArt.lista = Array.isArray(l) ? l : []; _vmArt.layout = lay && lay.blocos ? lay : null; _vmArt.prom = null; });
  _vmArt.prom.then(vmDesenharArtigos);
}
function vmDesenharArtigos(){
  const sec = document.getElementById('vm-artigos'), l = _vmArt.lista || [];
  const bl = _vmArt.layout && (_vmArt.layout.blocos || []).find(b => b.tipo === 'artigos');
  if(!l.length || (bl && bl.ativo === false)){ sec.hidden = true; return; }
  const dest = (bl && Array.isArray(bl.destaques) ? bl.destaques : []);
  const ordem = l.slice().sort((a, b) => {
    const da = dest.indexOf(a.id), db = dest.indexOf(b.id);
    if(da >= 0 || db >= 0) return (da < 0 ? 99 : da) - (db < 0 ? 99 : db);
    const pa = a.lugar === 'manchete' ? 0 : a.lugar === 'lista' ? 2 : 1, pb = b.lugar === 'manchete' ? 0 : b.lugar === 'lista' ? 2 : 1;
    return pa - pb || String(b.publicado_em).localeCompare(String(a.publicado_em));
  });
  const meta = a => '<span class="vm-art-meta">Por ' + escHtml(a.autor || 'Redação Valor e Mercado') + (a.publicado_em ? ' · ' + escHtml(vmDataTitulo(String(new Date(new Date(a.publicado_em).getTime() - 3 * 3600e3).toISOString()).slice(0, 10))) : '') + '</span>';
  const foto = a => a.foto && /^https:\/\//i.test(a.foto.src || '') ? '<a href="#/noticias/artigo/' + a.id + '" tabindex="-1" aria-hidden="true"><img src="' + escHtml(a.foto.src) + '" alt="" loading="lazy" decoding="async"></a>' : '';
  const ch = a => '<span class="vm-art-ch">' + escHtml(a.chapeu || a.editoria || 'Artigo') + '</span>';
  const tit = a => '<h3 class="vm-art-tit"><a href="#/noticias/artigo/' + a.id + '">' + escHtml(a.titulo) + '</a></h3>';
  const p = ordem[0];
  sec.innerHTML = '<div class="vm-sec-topo"><h2>Artigos</h2><span class="vm-regua"></span></div>'
    + '<article class="vm-art-dest">' + (foto(p) || '') + '<div>' + ch(p) + tit(p) + (p.linha_fina ? '<p class="vm-art-lf">' + escHtml(p.linha_fina) + '</p>' : '') + meta(p) + '</div></article>'
    + ordem.slice(1, 9).map(a => '<article class="vm-art-item">' + foto(a) + '<div>' + ch(a) + tit(a) + meta(a) + '</div></article>').join('');
  sec.hidden = false;
}
/* página do artigo: #/noticias/artigo/<nº> */
async function vmArtigoPagina(id){
  const tela = document.getElementById('tela-noticias'), art = document.getElementById('vm-leitura');
  tela.classList.add('vm-modo-leitura'); art.hidden = false; window.scrollTo(0, 0);
  document.querySelectorAll('#tela-noticias .vm-nav [data-vm-ir]').forEach(b => b.classList.remove('vm-atual'));
  art.innerHTML = '<a class="vm-leit-voltar" href="#/noticias">&larr; Capa do Valor e Mercado</a><p class="vm-leit-carregando">Carregando o artigo…</p>';
  const [a] = await Promise.all([vmRpcCorpo('vm_artigo_publico', {p_id: Number(id)}), vmBanners()]);
  if(!tela.classList.contains('vm-modo-leitura')) return;
  vmDesenharArtigo(a && a.titulo ? a : null);
}
function vmDesenharArtigo(a){
  const art = document.getElementById('vm-leitura');
  const voltar = '<a class="vm-leit-voltar" href="#/noticias">&larr; Capa do Valor e Mercado</a>';
  if(!a){
    art.innerHTML = voltar + '<div class="vm-leit-vazio"><h1>Artigo não encontrado</h1><p>Este artigo não está publicado ou saiu do ar. <a href="#/noticias">Voltar para a capa &rarr;</a></p></div>';
    document.title = 'Valor e Mercado';
    return;
  }
  const link = vmArtLink(a.id), msg = a.titulo + ' — Valor e Mercado';
  const quando = a.publicado_em ? new Date(a.publicado_em) : null;
  const dia = quando ? String(new Date(quando.getTime() - 3 * 3600e3).toISOString()).slice(0, 10) : '';
  const texto = vmBlocos(a.corpo);
  const pal = String(texto).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const f = a.foto && /^https:\/\//i.test(a.foto.src || '') ? a.foto : null;
  const fontes = (a.fontes || []).filter(x => x && /^https:\/\//i.test(x.url || ''));
  const corr = (a.correcoes || []).filter(c => c && c.o_que);
  art.innerHTML = voltar
    + '<header class="vm-leit-cab"><span class="vm-chapeu">' + escHtml(a.chapeu || a.editoria || 'Artigo') + '</span>'
    + (dia ? '<p class="vm-leit-data"><time datetime="' + escHtml(dia) + '">' + escHtml(vmDataTitulo(dia)) + '</time></p>' : '')
    + '<h1 class="vm-leit-titulo">' + escHtml(a.titulo) + '</h1>'
    + (a.linha_fina ? '<p class="vm-leit-linhafina">' + escHtml(a.linha_fina) + '</p>' : '')
    + '<p class="vm-leit-assin">Por ' + escHtml(a.autor || 'Redação Valor e Mercado') + ' · ' + escHtml(VM_EDITOR) + (quando ? ' · ' + escHtml(vmHora(a.publicado_em)) : '')
    + ' · ' + Math.max(1, Math.round(pal / 200)) + ' min de leitura</p></header>'
    + (f ? '<figure class="vm-leit-foto"><img src="' + escHtml(f.src) + '" alt="' + escHtml(f.alt || '') + '" decoding="async">' + (f.fotografo ? '<figcaption>Foto: ' + escHtml(f.fotografo) + '</figcaption>' : '') + '</figure>' : '')
    + vmCompartilharHtml(link, msg, 'topo')
    + '<div class="vm-leit-texto" id="vm-art-texto">' + texto + '</div>'
    + (corr.length ? corr.map(c => '<p class="vm-art-corr"><b>Correção' + (c.quando ? ' (' + escHtml(new Date(c.quando).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'})) + ')' : '') + ':</b> ' + escHtml(c.o_que)
        + (c.antes ? '. A versão anterior informava: ' + escHtml(c.antes) : '') + '.</p>').join('') : '')
    + (fontes.length ? '<div class="vm-leit-fontes"><b>Fontes consultadas</b><ul>' + fontes.map(x => '<li><a href="' + escHtml(x.url) + '" target="_blank" rel="noopener noreferrer">' + escHtml(x.titulo || x.url) + '</a></li>').join('') + '</ul>'
        + (f && f.fotografo ? '<p class="vm-foto-credito">Foto de capa: ' + escHtml(f.fotografo) + ' / ' + escHtml(f.origem || 'Foto própria') + '</p>' : '') + '</div>'
      : (f && f.fotografo ? '<div class="vm-leit-fontes"><p class="vm-foto-credito">Foto de capa: ' + escHtml(f.fotografo) + ' / ' + escHtml(f.origem || 'Foto própria') + '</p></div>' : ''))
    + ((a.tags || []).length ? '<p class="vm-art-tags">Assuntos: ' + a.tags.map(escHtml).join(' · ') + '</p>' : '')
    + vmCompartilharHtml(link, msg, 'fim')
    + '<p class="vm-leit-plataforma">O Valor e Mercado é o jornal da <a href="' + VM_SITE + '">SOLIDUNS</a>, plataforma de análise de ativos, gestão e educação financeira.</p>';
  vmPubNoTexto(document.getElementById('vm-art-texto'));
  document.title = (a.seo_titulo || a.titulo) + ' | Valor e Mercado';
  art.querySelectorAll('[data-vm-copiar]').forEach(b => b.addEventListener('click', () => vmCopiarLink(b, link)));
  art.querySelectorAll('[data-vm-nativo]').forEach(b => b.addEventListener('click', () => {
    navigator.share({title: a.titulo, text: msg, url: link}).catch(() => {}); }));
}
"""

def main(entrada, saida):
    raw = open(entrada, "rb").read()
    assert hashlib.md5(raw).hexdigest() == ORIG_MD5, "entrada não é a v130 completa"
    s = raw.decode("utf-8")
    # CSS (antes das regras de compartilhar do leitor)
    s = troca(s, "#tela-noticias .vm-compart{display:flex;", CSS + "#tela-noticias .vm-compart{display:flex;")
    # marcação: espaços de publicidade e seção Artigos (o cabeçalho e a logo não mudam)
    s = troca(s, '<p class="vm-edicao" id="vm-edicao" hidden></p>',
              '<p class="vm-edicao" id="vm-edicao" hidden></p>\n      <div id="vm-pub-topo" hidden></div>')
    s = troca(s, '<div class="vm-sc-fontes" id="vm-sc-fontes"></div>\n          </article>',
              '<div class="vm-sc-fontes" id="vm-sc-fontes"></div>\n          </article>\n          <div id="vm-pub-lateral" hidden></div>')
    s = troca(s, '<section class="vm-secao vm-lista" id="vm-ultimas">',
              '<section class="vm-secao vm-artigos" id="vm-artigos" hidden aria-label="Artigos"></section>\n        <section class="vm-secao vm-lista" id="vm-ultimas">')
    # rota do artigo (o mesmo leitor do Scanner)
    s = troca(s, "var VM_SC_RE = /^noticias\\/scanner(\\/\\d{4}-\\d{2}-\\d{2})?$/;   /* v125: página de leitura do Scanner do Dia */",
              "var VM_SC_RE = /^noticias\\/(?:scanner(\\/\\d{4}-\\d{2}-\\d{2})?|artigo\\/(\\d{1,9}))$/;   /* v125: leitura do Scanner do Dia; v131: página do artigo */")
    s = troca(s, "  if(vmSc) setTimeout(() => vmScannerPagina(vmSc[1] ? vmSc[1].slice(1) : ''), 0);",
              "  if(vmSc && vmSc[2]) setTimeout(() => vmArtigoPagina(vmSc[2]), 0);   /* v131 */\n"
              "  else if(vmSc) setTimeout(() => vmScannerPagina(vmSc[1] ? vmSc[1].slice(1) : ''), 0);")
    # capa: artigos e publicidade
    s = troca(s, "  vmCarregarScanner();   /* v121 */\n  if(_vm.ind !== undefined)",
              "  vmCarregarScanner();   /* v121 */\n  vmCarregarArtigos(); vmPubPreencher();   /* v131 */\n  if(_vm.ind !== undefined)")
    s = troca(s, "  document.getElementById('vm-texto').innerHTML = corpo.map(p => '<p>' + vmTxt(p) + '</p>').join('');",
              "  document.getElementById('vm-texto').innerHTML = corpo.map(p => '<p>' + vmTxt(p) + '</p>').join('');\n"
              "  if(_vmArt.ban !== undefined) vmPubNoTexto(document.getElementById('vm-texto'));   /* v131 */")
    # funções novas, logo depois das do leitor do Scanner
    s = troca(s, "/* no modo de leitura, os botões do menu do jornal voltam para a capa;", JS + "/* no modo de leitura, os botões do menu do jornal voltam para a capa;")
    # botão Redação abre o CMS
    s = troca(s, "document.getElementById('vm-nav-redacao').addEventListener('click', vmRedAbrir);",
              "document.getElementById('vm-nav-redacao').addEventListener('click', () => { location.href = '/noticias/redacao/'; });   /* v131: Redação = CMS */")
    open(saida, "w", encoding="utf-8").write(s)
    print("v131 completo:", len(s.encode()) // 1024, "KB · md5", hashlib.md5(s.encode()).hexdigest())

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
