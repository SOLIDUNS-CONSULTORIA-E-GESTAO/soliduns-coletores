
/* ===== v112 — EQUIPE: CONVITE DE VERDADE, COM E-MAIL (SQL 126: equipe_convidar / equipe_convite_cancelar) ===== */
var EQ_MSG_V112 = {
  SEM_PERMISSAO: 'Só administradores podem convidar.',
  EMAIL_INVALIDO: 'E-mail inválido.',
  NOME_INVALIDO: 'Informe o nome (de 2 a 120 letras).',
  PERFIL_INVALIDO: 'Perfil inválido.',
  SO_MESTRE_ADMIN: 'Só o administrador-mestre pode convidar alguém já como administrador.',
  AGUARDE: 'Este e-mail recebeu um convite há menos de 10 minutos. Aguarde para reenviar.',
  LIMITE_DIA: 'Limite de 50 convites por dia atingido. Tente amanhã.',
  SEM_SQL: 'O convite por e-mail ainda não está instalado no servidor: rode o SQL 126 no Supabase.'
};
function eqServidorV112(){ return !!(sessaoAtual && sessaoAtual.access_token && !sessaoAtual.modoLocal); }
async function eqRpcV112(nome, corpo){
  let r;
  try{
    r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + nome, {method: 'POST',
      headers: {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sessaoAtual.access_token, 'Content-Type': 'application/json', 'Accept': 'application/json'},
      body: JSON.stringify(corpo || {})});
  }catch(e){ throw {codigo: 'REDE', texto: 'Sem conexão com o servidor. Tente de novo.'}; }
  let j = null; try{ j = await r.json(); }catch(e){}
  if(r.ok) return j;
  const m = String((j && (j.message || j.hint)) || '');
  const cod = r.status === 404 || (j && j.code === 'PGRST202') ? 'SEM_SQL' : (Object.keys(EQ_MSG_V112).find(k => m.indexOf(k) >= 0) || 'ERRO');
  throw {codigo: cod, texto: EQ_MSG_V112[cod] || ('O servidor recusou (' + (m || ('HTTP ' + r.status)) + ').')};
}
function eqTextoSituacaoV112(r){
  const em = escHtml(r.email || '');
  switch(r.situacao){
    case 'convite_enviado': return 'Convite enviado para ' + em + '. Quando a pessoa criar a conta com esse e-mail, o acesso é liberado sozinho.';
    case 'acesso_liberado': return em + ' já tinha cadastro: acesso liberado agora' + (r.aviso ? ' (o e-mail sai pelo aviso de aprovação de sempre).' : ' e avisado por e-mail.');
    case 'ja_tem_acesso': return em + ' já tem acesso liberado. Nenhum e-mail enviado.';
    case 'convite_salvo_sem_email': return 'Convite guardado, mas o e-mail NÃO saiu: falta a chave do Resend no Vault (resend_aprovacao).';
    case 'acesso_liberado_sem_email': return 'Acesso liberado, mas o e-mail NÃO saiu: falta a chave do Resend no Vault (resend_aprovacao).';
    default: return 'Feito.';
  }
}
async function eqConvidarV112(ev){
  if(!eqServidorV112()) return;                       /* modo local: segue o roster antigo */
  ev.stopImmediatePropagation(); ev.preventDefault();
  const bt = document.getElementById('btn-salvar-convite'), msg = document.getElementById('convidar-msg');
  const nome = document.getElementById('cv-nome').value.trim();
  const email = document.getElementById('cv-email').value.trim().toLowerCase();
  if(nome.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
    msg.textContent = 'Preencha nome e e-mail válidos.'; msg.className = 'auth-msg erro'; return; }
  const perfil = (ehMestre() && document.getElementById('cv-admin').checked) ? 'admin' : 'usuario';
  bt.disabled = true; const rotulo = bt.textContent; bt.textContent = 'Enviando convite…';
  msg.textContent = ''; msg.className = 'auth-msg';
  try{
    const r = await eqRpcV112('equipe_convidar', {p_nome: nome, p_email: email, p_perfil: perfil});
    msg.innerHTML = eqTextoSituacaoV112(r || {});
    msg.className = 'auth-msg' + (r && /sem_email/.test(r.situacao) ? ' erro' : ' ok');
    if(r && r.situacao !== 'ja_tem_acesso'){ document.getElementById('cv-nome').value = ''; document.getElementById('cv-email').value = ''; }
    eqCarregarConvitesV112();
    if(typeof renderizarFilaAcessos === 'function') renderizarFilaAcessos();
  }catch(e){
    msg.textContent = e.texto || 'Não foi possível convidar.'; msg.className = 'auth-msg erro';
  }finally{
    bt.disabled = false; bt.textContent = rotulo;
  }
}
/* fase de captura: roda antes do clique antigo (roster local) e o impede quando há servidor */
document.getElementById('btn-salvar-convite').addEventListener('click', eqConvidarV112, true);

async function eqCarregarConvitesV112(){
  const sec = document.getElementById('eq-convites-secao'), sub = document.getElementById('eq-convites-sub'), lista = document.getElementById('eq-convites-lista');
  if(!sec || !eqServidorV112()){ if(sec) sec.style.display = 'none'; return; }
  let linhas;
  try{
    const r = await fetch(SUPABASE_URL + '/rest/v1/equipe_convites?select=email,nome,perfil,convidado_por,criado_em,envios,ultimo_envio,aceito_em,cancelado_em&order=criado_em.desc&limit=200',
      {headers: {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sessaoAtual.access_token, 'Accept': 'application/json'}});
    if(r.status === 404){ sec.style.display = 'none'; return; }   /* SQL 126 ainda não rodado */
    if(!r.ok) throw new Error('HTTP ' + r.status);
    linhas = await r.json();
  }catch(e){
    sec.style.display = ''; sub.textContent = 'Não foi possível carregar os convites (' + (e.message || 'falha de rede') + ').'; lista.innerHTML = ''; return;
  }
  sec.style.display = '';
  const dt = s => s ? new Date(s).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'}) : '—';
  const aguardando = linhas.filter(c => !c.aceito_em && !c.cancelado_em).length;
  sub.textContent = linhas.length ? (aguardando + ' aguardando cadastro, de ' + linhas.length + ' convite(s).') : 'Nenhum convite enviado ainda. Use "+ Convidar".';
  if(!linhas.length){ lista.innerHTML = ''; return; }
  lista.innerHTML = '<table class="leilao-admin-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Envios</th><th></th></tr></thead><tbody>'
    + linhas.map(c => {
        const sit = c.aceito_em ? '<span style="color:var(--teal);">Aceito em ' + dt(c.aceito_em) + '</span>'
                  : c.cancelado_em ? '<span style="color:var(--ink-soft);">Cancelado em ' + dt(c.cancelado_em) + '</span>'
                  : '<span style="color:var(--gold);">Aguardando cadastro</span>';
        const acoes = (!c.aceito_em ? '<button type="button" class="ac-editar" data-eq-reenviar="' + escHtml(c.email) + '">' + (c.cancelado_em ? 'Convidar de novo' : 'Reenviar') + '</button> ' : '')
                    + (!c.aceito_em && !c.cancelado_em ? '<button type="button" class="ac-editar" data-eq-cancelar="' + escHtml(c.email) + '">Cancelar</button>' : '');
        return '<tr><td>' + escHtml(c.nome) + '</td><td>' + escHtml(c.email) + '</td><td>' + (c.perfil === 'admin' ? 'Admin' : 'Usuário') + '</td><td>' + sit
          + '</td><td>' + (c.envios || 0) + (c.ultimo_envio ? ' · último ' + dt(c.ultimo_envio) : '') + '</td><td>' + acoes + '</td></tr>';
      }).join('') + '</tbody></table><div class="auth-msg" id="eq-convites-msg" style="margin-top:6px;"></div>';
  const porEmail = {}; linhas.forEach(c => { porEmail[c.email] = c; });
  const aviso = (t, erro) => { const m = document.getElementById('eq-convites-msg'); if(m){ m.innerHTML = t; m.className = 'auth-msg' + (erro ? ' erro' : ' ok'); } };
  lista.querySelectorAll('[data-eq-reenviar]').forEach(b => b.addEventListener('click', async () => {
    const c = porEmail[b.getAttribute('data-eq-reenviar')]; if(!c) return;
    b.disabled = true;
    try{ const r = await eqRpcV112('equipe_convidar', {p_nome: c.nome, p_email: c.email, p_perfil: c.perfil}); await eqCarregarConvitesV112(); aviso(eqTextoSituacaoV112(r || {}), r && /sem_email/.test(r.situacao)); }
    catch(e){ b.disabled = false; aviso(escHtml(e.texto || 'Não foi possível reenviar.'), true); }
  }));
  lista.querySelectorAll('[data-eq-cancelar]').forEach(b => b.addEventListener('click', async () => {
    const em = b.getAttribute('data-eq-cancelar');
    if(!confirm('Cancelar o convite de ' + em + '? Se a pessoa se cadastrar depois, cai na fila de aprovação normal.')) return;
    b.disabled = true;
    try{ await eqRpcV112('equipe_convite_cancelar', {p_email: em}); await eqCarregarConvitesV112(); aviso('Convite de ' + escHtml(em) + ' cancelado.'); }
    catch(e){ b.disabled = false; aviso(escHtml(e.texto || 'Não foi possível cancelar.'), true); }
  }));
}
/* a lista de convites acompanha a fila (abrir a Equipe, "Atualizar fila", decisões) */
(function(){
  if(typeof renderizarFilaAcessos !== 'function') return;
  const original = renderizarFilaAcessos;
  renderizarFilaAcessos = async function(){ const r = await original.apply(this, arguments); try{ eqCarregarConvitesV112(); }catch(e){} return r; };
})();
