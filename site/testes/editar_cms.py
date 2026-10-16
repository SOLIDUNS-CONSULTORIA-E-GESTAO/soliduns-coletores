import sys
p=sys.argv[1]; s=open(p).read()
def troca(velho, novo, n=1):
    global s
    c=s.count(velho); assert c==n, (c, velho[:80]); s=s.replace(velho,novo)
troca('<!-- Prévia visual do CMS (dados fictícios, sem rede e sem chave). Cole no play.tailwindcss.com. -->\n<script src="https://cdn.tailwindcss.com"></script>',
      '<!-- v131: Redação do Valor e Mercado (CMS). Só para o editor; a página pública nunca carrega este arquivo. -->\n<meta name="robots" content="noindex, nofollow">\n<link rel="stylesheet" href="cms.css">')
troca('<script src="https://unpkg.com/lucide@0.453.0/dist/umd/lucide.min.js"></script>', '<script src="icones.js"></script>')
troca('Fila de revisão <span class="ml-auto f-mono text-[11px] bg-[#2e2a1e] text-[#f2ecd8] px-1.5 rounded">3</span>',
      'Fila de revisão <span id="n-fila" class="hidden ml-auto f-mono text-[11px] bg-[#2e2a1e] text-[#f2ecd8] px-1.5 rounded">0</span>')
troca('<div class="w-9 h-9 rounded-full bg-[#2e2a1e] flex items-center justify-center f-marca text-[#eec617]">TV</div>',
      '<div id="u-ini" class="w-9 h-9 rounded-full bg-[#2e2a1e] flex items-center justify-center f-marca text-[#eec617]">TV</div>')
troca('<div class="text-sm text-[#f2ecd8] truncate">Dr. Thiago Viegas</div>', '<div id="u-nome" class="text-sm text-[#f2ecd8] truncate">Dr. Thiago Viegas</div>')
troca('<button class="ml-auto text-[#a89f88] hover:text-[#e2564f]" title="Sair" aria-label="Sair">', '<button id="btn-sair" class="ml-auto text-[#a89f88] hover:text-[#e2564f]" title="Voltar ao jornal" aria-label="Voltar ao jornal">')
troca('<div id="acoes-artigo" class="ml-auto flex flex-wrap gap-2">',
      '<span id="sit-artigo" class="text-xs f-mono text-[#a89f88]">Artigo novo</span>\n        <div id="acoes-artigo" class="ml-auto flex flex-wrap gap-2">\n          <button id="btn-novo" class="inline-flex items-center gap-2 px-3 py-2 text-sm border border-[#2e2a1e] rounded hover:border-[#a89f88]"><i data-lucide="plus" class="w-4 h-4"></i>Novo artigo</button>')
troca('<input id="arq-anexo" type="file" accept=".pdf,application/pdf" class="hidden">',
      '<input id="arq-anexo" type="file" accept=".pdf,application/pdf" class="hidden">\n              <input id="arq-img" type="file" accept="image/jpeg,image/png,image/webp" class="hidden">')
troca('<div class="text-[11px] uppercase tracking-wider text-[#a89f88]">Publicados hoje</div><div class="f-mono text-2xl mt-1">4</div>',
      '<div class="text-[11px] uppercase tracking-wider text-[#a89f88]">Artigos publicados hoje</div><div id="p-hoje" class="f-mono text-2xl mt-1">–</div>')
troca('<div class="text-[11px] uppercase tracking-wider text-[#a89f88]">Na fila</div><div class="f-mono text-2xl mt-1">3</div>',
      '<div class="text-[11px] uppercase tracking-wider text-[#a89f88]">Rascunhos e agendados</div><div id="p-fila" class="f-mono text-2xl mt-1">–</div>')
troca('<div class="text-[11px] uppercase tracking-wider text-[#a89f88]">Alertas da verificação</div><div class="f-mono text-2xl mt-1 text-[#dba22a]">2</div>',
      '<div class="text-[11px] uppercase tracking-wider text-[#a89f88]">Scanner com alerta (mês)</div><div id="p-alertas" class="f-mono text-2xl mt-1 text-[#dba22a]">–</div>')
troca('<div class="f-mono text-2xl mt-1">US$ 9,84</div></div>\n      </div>',
      '<div id="p-custo" class="f-mono text-2xl mt-1">–</div></div>\n      </div>\n      <h2 class="text-xs uppercase tracking-widest text-[#a89f88] mt-8 mb-3">Últimas coletas dos robôs</h2>\n      <div class="overflow-x-auto bg-[#0d0d0c] border border-[#2e2a1e] rounded-lg"><table class="w-full text-xs f-mono"><tbody id="p-coletas"></tbody></table></div>')
troca('<span class="f-mono text-[11px] text-[#a89f88]">versão em edição: <span id="lay-ver">v4</span></span>', '<span class="f-mono text-[11px] text-[#a89f88]">versão no ar: <span id="lay-ver">v1</span></span>')
troca('<div id="toasts"', '''<div id="portao" class="fixed inset-0 z-[60] bg-black flex items-center justify-center p-6 text-center">
  <div><div class="f-marca tracking-[.18em] text-sm">VALOR E MERCADO</div><div class="f-mono text-[11px] text-[#eec617] mt-1 tracking-widest">REDAÇÃO</div>
  <p id="portao-msg" class="mt-6 text-sm text-[#a89f88] leading-relaxed">Abrindo a Redação…</p></div>
</div>
<div id="toasts"''')
troca('''   PRÉVIA DO CMS — dados fictícios em memória. Nenhuma chamada de rede.
   No site real, TODA gravação passa por RPC no Supabase protegida por
   _vm_exige_editor(); esta tela é só a interface.''', '''   REDAÇÃO DO VALOR E MERCADO (v131) — interface do editor. TODA gravação passa
   por RPC no Supabase protegida por _vm_exige_editor() (ver integração no fim).''')
troca("  if (c === 'anexo') return $('#arq-anexo').click();", "  if (c === 'anexo') return $('#arq-anexo').click();\n  if (c === 'imagem') return $('#arq-img').click();")
troca("if (['paragrafo','intertitulo','citacao','imagem'].includes(c)) {", "if (['paragrafo','intertitulo','citacao'].includes(c)) {")
troca('''      <input class="mt-2 w-full h-8 bg-black border border-[#2e2a1e] rounded px-2 text-xs" placeholder="Legenda (só o nome do fotógrafo)" aria-label="Legenda da imagem">`;''',
      '''      <input class="mt-2 w-full h-8 bg-black border border-[#2e2a1e] rounded px-2 text-xs" maxlength="200" placeholder="Legenda (só o nome do fotógrafo)" aria-label="Legenda da imagem">`;
    if (texto && texto.legenda) w.querySelector('input').value = texto.legenda;''')
troca('${w.dataset.src ? `<img src="${w.dataset.src}" alt="" class="max-h-40 rounded">`', '${w.dataset.src ? `<img src="${escapar(w.dataset.src)}" alt="" class="max-h-40 rounded">`')
troca("  const r = new FileReader();\n  r.onload = () => {", "  fotoArquivo = arq; fotoAtual = null;\n  const r = new FileReader();\n  r.onload = () => {")
troca("$('#foto-arq').value = ''; atualizar();\n});", "$('#foto-arq').value = ''; fotoArquivo = null; fotoAtual = null; atualizar();\n});")
troca("    w._json = () => ({tipo, nome: d.nome, tamanho: d.tamanho, url: d.url || '#', titulo: w.querySelector('.a-tit').value.trim()});",
      "    w._d = d;\n    w._json = () => ({tipo, nome: (d.nome || '').slice(0, 160), tamanho: d.tamanho, url: d.url || '', titulo: w.querySelector('.a-tit').value.trim()});")
troca("  novoBloco('anexo', {nome: f.name.replace(/[^\\w.\\- ()À-ú]/g, '_'), tamanho: (f.size / 1048576).toFixed(1).replace('.', ',') + ' MB', url: URL.createObjectURL(f), titulo: f.name.replace(/\\.pdf$/i, '')}, blocoDoCursor());\n  atualizar(); toast('PDF anexado.');",
      "  const w = novoBloco('anexo', {nome: f.name.replace(/[^\\w.\\- ()À-ú]/g, '_'), tamanho: (f.size / 1048576).toFixed(1).replace('.', ',') + ' MB', url: '', titulo: f.name.replace(/\\.pdf$/i, '')}, blocoDoCursor());\n  w._arquivo = f; atualizar(); toast('PDF anexado: sobe quando salvar.');")
open(p,'w').write(s); print('ok')
