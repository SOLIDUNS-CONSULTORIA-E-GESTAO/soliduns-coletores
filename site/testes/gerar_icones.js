// gera ../redacao/icones.js só com os ícones usados (lucide 0.453.0, licença ISC)
const fs = require('fs');
const L = require('./node_modules/lucide/dist/umd/lucide.js');
const nomes = process.argv.slice(2);
const pascal = n => n.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
const out = {};
for (const n of nomes) {
  const ic = L.icons[pascal(n)] || (n === 'upload-cloud' && L.icons.CloudUpload) || (n === 'cloud-check' && L.icons.CircleCheck);
  if (!ic) { console.error('faltou', n); continue; }
  out[n] = ic;
}
const js = `/* Ícones Lucide 0.453.0 (ISC) — só os usados na Redação */
(function(){var I=${JSON.stringify(out)};
function svg(n,el){var d=I[n];if(!d)return;var s=document.createElementNS('http://www.w3.org/2000/svg','svg');
var a={xmlns:'http://www.w3.org/2000/svg',width:24,height:24,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'};
for(var k in a)s.setAttribute(k,a[k]);s.setAttribute('class',(el.getAttribute('class')||'')+' lucide lucide-'+n);
(Array.isArray(d[0])?d:d[2]||[]).forEach(function(c){var e=document.createElementNS('http://www.w3.org/2000/svg',c[0]);for(var q in c[1])e.setAttribute(q,c[1][q]);s.appendChild(e);});
el.parentNode.replaceChild(s,el);}
window.lucide={createIcons:function(){document.querySelectorAll('i[data-lucide]').forEach(function(el){svg(el.getAttribute('data-lucide'),el);});}};})();`;
fs.writeFileSync('../redacao/icones.js', js);
console.log(Object.keys(out).length, 'ícones,', js.length, 'bytes');
console.log(JSON.stringify(out['x']).slice(0,200));
