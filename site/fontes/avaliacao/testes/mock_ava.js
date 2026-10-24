// Servidor simulado do Supabase (GoTrue + PostgREST + Storage) sobre PGlite, com o schema.sql real e RLS.
const http=require('http');const fs=require('fs');const crypto=require('crypto');const {PGlite}=(()=>{try{return require('@electric-sql/pglite')}catch(e){return require('/home/claude/cloud/node_modules/@electric-sql/pglite')}})();
const PORT=+process.env.PORT||54322;const ANON='anon-test-key';
let CFG={confirm:false,expires:3600};
const STUB=`create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable security definer as $$ select jsonb_build_object('email',(select email from auth.users where id = auth.uid())) $$;
grant execute on function auth.jwt() to authenticated, anon;
create schema storage; create table storage.buckets(id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text, created_at timestamptz default now(), unique(bucket_id,name));
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
alter table storage.objects enable row level security;
grant usage on schema auth, storage to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
grant all on storage.objects to authenticated;
create table public.acessos(id uuid primary key, email text, nome text, status text, perfil text);
alter table public.acessos enable row level security;
create policy acessos_le on public.acessos for select to authenticated using (id = auth.uid());
grant select on public.acessos to authenticated;
create table public.teste_areas(id uuid, area text);
create function public.eh_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from auth.users u where u.id = auth.uid() and lower(u.email) in ('dr.thiago.viegas@gmail.com','thales.viegas@gmail.com')) $$;
create function public.esta_aprovado() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.acessos a where a.id = auth.uid() and a.status = 'aprovado') $$;
create function public.tem_area(p text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.teste_areas t where t.id = auth.uid() and (t.area = p or t.area = '*')) $$;
create function public.minhas_areas() returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('tudo', exists(select 1 from public.teste_areas t where t.id=auth.uid() and t.area='*'),
    'areas', coalesce((select jsonb_agg(t.area) from public.teste_areas t where t.id=auth.uid()), '[]'::jsonb), 'exige_plano', true, 'cadastro_livre', false) $$;
grant usage on schema public to authenticated, anon;
grant execute on function public.minhas_areas() to authenticated;`;
const USERS=new Map();// email -> {id,email,pw,provider,meta,confirmed}
const TOK=new Map(),REF=new Map();const MAIL=[];const BLOBS=new Map();const LOG=[];
let db;let fila=Promise.resolve();
const serial=fn=>{const p=fila.then(fn,fn);fila=p.catch(()=>{});return p};
async function asUser(uid,fn){return serial(async()=>{
  if(uid){await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`)}
  try{return await fn()}finally{await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);")}})}
function userObj(u){return {id:u.id,aud:'authenticated',role:'authenticated',email:u.email,email_confirmed_at:u.confirmed?new Date().toISOString():null,app_metadata:{provider:u.provider,providers:[u.provider]},user_metadata:u.meta,identities:[{provider:u.provider}],created_at:u.criado}}
function sessao(u){const at='at_'+crypto.randomBytes(12).toString('hex'),rt='rt_'+crypto.randomBytes(12).toString('hex');
  TOK.set(at,{id:u.id,exp:Date.now()+CFG.expires*1000});REF.set(rt,u.id);return {access_token:at,token_type:'bearer',expires_in:CFG.expires,refresh_token:rt,user:userObj(u)}}
const porId=id=>[...USERS.values()].find(u=>u.id===id);
async function criarUser(email,pw,provider,meta,confirmed){const u={id:crypto.randomUUID(),email,pw,provider,meta:meta||{},confirmed,criado:new Date().toISOString()};USERS.set(email,u);
  await serial(()=>db.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)`,[u.id,email,JSON.stringify(u.meta)]));return u}
function send(res,st,body,h={}){const H={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'content-range',...h};
  if(body===undefined||body===null){res.writeHead(st,H);return res.end()}
  if(Buffer.isBuffer(body)){res.writeHead(st,H);return res.end(body)}
  res.writeHead(st,{'Content-Type':'application/json',...H});res.end(JSON.stringify(body))}
const ID=/^[a-z_][a-z0-9_]*$/;
function filtros(q,params){const w=[];for(const [k,v] of q){if(['select','order','limit','on_conflict','offset'].includes(k))continue;if(!ID.test(k))throw new Error('coluna inválida '+k);
  let m;if((m=/^eq\.(.*)$/s.exec(v))){params.push(m[1]);w.push(`${k} = $${params.length}`)}
  else if((m=/^in\.\((.*)\)$/s.exec(v))){const it=m[1].split(',').map(decodeURIComponent);const ph=it.map(x=>{params.push(x);return '$'+params.length});w.push(`${k} in (${ph.join(',')})`)}
  else throw new Error('filtro não suportado '+v)}
  return w.length?' where '+w.join(' and '):''}
const val=v=>v!==null&&typeof v==='object'?JSON.stringify(v):v;
async function postgrest(req,res,url,uid,body){
  const rpc=/^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
  if(rpc){try{const set=(await db.query(`select proretset from pg_proc where proname=$1 and pronamespace='public'::regnamespace`,[rpc[1]])).rows[0];const r=await asUser(uid,()=>db.query(set&&set.proretset?`select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) as r from public.${rpc[1]}() t`:`select to_jsonb(public.${rpc[1]}()) as r`));return send(res,200,r.rows[0].r)}catch(e){LOG.push(['rpc-erro',rpc[1],e.message]);return send(res,400,{message:e.message})}}
  const t=url.pathname.split('/')[3];if(!ID.test(t))return send(res,404,{message:'tabela'});const q=url.searchParams;const params=[];
  const prefer=req.headers.prefer||'';
  try{
   if(req.method==='GET'){let sql=`select * from public.${t}`+filtros(q,params);
    if(q.get('order')){const [c,d]=q.get('order').split('.');if(!ID.test(c))throw new Error('ordem');sql+=` order by ${c} ${d==='desc'?'desc':'asc'}`}
    if(q.get('limit'))sql+=` limit ${parseInt(q.get('limit'))}`;
    const r=await asUser(uid,()=>db.query(sql,params));return send(res,200,r.rows)}
   if(req.method==='POST'){const rows=Array.isArray(body)?body:[body];if(!rows.length)return send(res,201,[]);
    const cols=Object.keys(rows[0]);cols.forEach(c=>{if(!ID.test(c))throw new Error('coluna')});
    const vals=rows.map(r=>'('+cols.map(c=>{params.push(val(r[c]));return '$'+params.length}).join(',')+')').join(',');
    let sql=`insert into public.${t}(${cols.join(',')}) values ${vals}`;const oc=q.get('on_conflict');
    if(/merge-duplicates/.test(prefer)&&oc){if(!ID.test(oc))throw new Error('on_conflict');sql+=` on conflict (${oc}) do update set `+cols.filter(c=>c!==oc).map(c=>`${c}=excluded.${c}`).join(',')}
    const repr=/return=representation/.test(prefer);if(repr)sql+=' returning *';
    const rr=await asUser(uid,()=>db.query(sql,params));return send(res,201,repr?rr.rows:null)}
   if(req.method==='PATCH'){const cols=Object.keys(body);cols.forEach(c=>{if(!ID.test(c))throw new Error('coluna')});
    const set=cols.map(c=>{params.push(val(body[c]));return `${c}=$${params.length}`}).join(',');
    const repr=/return=representation/.test(prefer);const sql=`update public.${t} set ${set}`+filtros(q,params)+(repr?' returning *':'');const rr=await asUser(uid,()=>db.query(sql,params));return repr?send(res,200,rr.rows):send(res,204,null)}
   if(req.method==='DELETE'){const w=filtros(q,params);if(!w)throw new Error('DELETE sem filtro');await asUser(uid,()=>db.query(`delete from public.${t}`+w,params));return send(res,204,null)}
  }catch(e){const rls=/row-level security|permission denied/i.test(e.message);LOG.push(['rest-erro',req.method,t,e.message]);return send(res,rls?403:400,{message:e.message,code:rls?'42501':'PGRST'})}}
async function storage(req,res,url,uid,raw){
  if(!uid&&url.pathname.startsWith('/storage/'))return send(res,401,{message:'jwt'});
  if(url.pathname==='/storage/v1/object/list/aval-anexos'&&req.method==='POST'){const j=JSON.parse(raw.toString()||'{}');const pre=String(j.prefix||'');
   const r=await asUser(uid,()=>db.query(`select id,name from storage.objects where bucket_id='aval-anexos' and name like $1 order by name`,[pre.replace(/[%_]/g,'\\$&')+'%']));
   const out=[],pastas=new Set();for(const o of r.rows){const resto=o.name.slice(pre.length);const i=resto.indexOf('/');
    if(i>=0){const nm=resto.slice(0,i);if(!pastas.has(nm)){pastas.add(nm);out.push({name:nm,id:null})}}else out.push({name:resto,id:o.id})}
   const off=+j.offset||0,lim=+j.limit||100;return send(res,200,out.slice(off,off+lim))}
  if(url.pathname==='/storage/v1/object/aval-anexos'&&req.method==='DELETE'){const j=JSON.parse(raw.toString()||'{}');const apagados=[];
   for(const nm of (j.prefixes||[])){const r=await asUser(uid,()=>db.query(`delete from storage.objects where bucket_id='aval-anexos' and name=$1`,[nm]));if(r.affectedRows){BLOBS.delete(nm);apagados.push({name:nm})}}
   return send(res,200,apagados)}
  const m=/^\/storage\/v1\/object\/(authenticated\/)?aval-anexos\/(.+)$/.exec(url.pathname);if(!m)return send(res,404,{message:'rota'});const name=decodeURIComponent(m[2]);
  if(!uid)return send(res,401,{message:'jwt'});
  try{
   if(req.method==='POST'||req.method==='PUT'){if(raw.length>15728640)return send(res,413,{message:'Payload too large'});
    const bk=(await serial(()=>db.query(`select allowed_mime_types a from storage.buckets where id='aval-anexos'`))).rows[0];const tipo=(req.headers['content-type']||'').split(';')[0];
    if(bk&&bk.a&&!bk.a.includes(tipo)){LOG.push(['storage-tipo',tipo]);return send(res,400,{statusCode:'415',error:'invalid_mime_type',message:'mime type '+tipo+' is not supported'})}
    await asUser(uid,async()=>{const ex=await db.query(`select id from storage.objects where bucket_id='aval-anexos' and name=$1`,[name]);
     if(!ex.rows.length)await db.query(`insert into storage.objects(bucket_id,name) values ('aval-anexos',$1)`,[name]);
     else{const up=await db.query(`update storage.objects set name=name where bucket_id='aval-anexos' and name=$1`,[name]);if(!up.affectedRows)throw new Error('permission denied')}});
    BLOBS.set(name,{buf:raw,type:req.headers['content-type']||'application/octet-stream'});return send(res,200,{Key:'aval-anexos/'+name})}
   if(req.method==='GET'){const r=await asUser(uid,()=>db.query(`select id from storage.objects where bucket_id='aval-anexos' and name=$1`,[name]));
    if(!r.rows.length||!BLOBS.has(name))return send(res,400,{statusCode:'404',error:'not_found',message:'Object not found'});const b=BLOBS.get(name);return send(res,200,b.buf,{'Content-Type':b.type})}
   if(req.method==='DELETE'){const r=await asUser(uid,()=>db.query(`delete from storage.objects where bucket_id='aval-anexos' and name=$1`,[name]));if(r.affectedRows)BLOBS.delete(name);return send(res,200,{message:'ok'})}
  }catch(e){LOG.push(['storage-erro',req.method,name,e.message]);return send(res,403,{statusCode:'403',error:'Unauthorized',message:'new row violates row-level security policy'})}}
function redirLink(base,s,type){return base+'#access_token='+s.access_token+'&expires_in='+s.expires_in+'&refresh_token='+s.refresh_token+'&token_type=bearer'+(type?'&type='+type:'')}
async function auth(req,res,url,body,bearer){const p=url.pathname.replace('/auth/v1','');const rt=url.searchParams.get('redirect_to')||'http://localhost:8765/';
  if(p==='/signup'&&req.method==='POST'){const email=String(body.email||'').toLowerCase();if(USERS.has(email)){if(CFG.confirm)return send(res,200,{...userObj(USERS.get(email)),id:crypto.randomUUID(),identities:[]});return send(res,422,{code:422,error_code:'user_already_exists',msg:'User already registered'})}
   if(String(body.password||'').length<6)return send(res,422,{msg:'Password should be at least 6 characters (weak_password)'});
   const u=await criarUser(email,body.password,'email',body.data,!CFG.confirm);
   if(CFG.confirm){const s=sessao(u);MAIL.push({to:email,tipo:'confirmacao',link:redirLink(rt,s,'signup')});return send(res,200,userObj(u))}
   return send(res,200,sessao(u))}
  if(p==='/token'&&req.method==='POST'){const gt=url.searchParams.get('grant_type');
   if(gt==='password'){const u=USERS.get(String(body.email||'').toLowerCase());if(!u||u.pw!==body.password)return send(res,400,{error:'invalid_grant',error_description:'Invalid login credentials'});
    if(!u.confirmed)return send(res,400,{error:'invalid_grant',error_code:'email_not_confirmed',error_description:'Email not confirmed'});return send(res,200,sessao(u))}
   if(gt==='refresh_token'){const id=REF.get(body.refresh_token);if(!id)return send(res,400,{error:'invalid_grant',error_description:'Invalid Refresh Token'});REF.delete(body.refresh_token);LOG.push(['refresh']);return send(res,200,sessao(porId(id)))}}
  if(p==='/user'){const t=TOK.get(bearer);if(!t||t.exp<Date.now())return send(res,401,{msg:'invalid JWT'});const u=porId(t.id);
   if(req.method==='GET')return send(res,200,userObj(u));
   if(req.method==='PUT'){if(body.password){if(String(body.password).length<6)return send(res,422,{msg:'Password should be at least 6 characters'});u.pw=body.password;u.confirmed=true}return send(res,200,userObj(u))}}
  if(p==='/logout'&&req.method==='POST'){TOK.delete(bearer);return send(res,204,null)}
  if(p==='/recover'&&req.method==='POST'){const u=USERS.get(String(body.email||'').toLowerCase());if(u){const s=sessao(u);MAIL.push({to:u.email,tipo:'recuperacao',link:redirLink(rt,s,'recovery')})}return send(res,200,{})}
  if(p==='/authorize'&&req.method==='GET'){const html=`<!doctype html><meta charset=utf-8><title>Google (simulado)</title><body style="font-family:sans-serif;padding:30px"><h1>Escolha uma conta Google</h1>
<form method=post action="/__mock/google"><input type=hidden name=rt value="${rt.replace(/"/g,'')}"><p><label>Nome <input name=nome id=g-nome value="Gabriela Google"></label></p><p><label>E-mail <input name=email id=g-email value="gabi@gmail.com"></label></p><button id=g-ok>Continuar</button> <button name=negar value=1 id=g-no>Cancelar</button></form>`;res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html)}
  return send(res,404,{msg:'rota de autenticação não simulada '+p})}
async function handler(req,res){const url=new URL(req.url,'http://x');
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey,authorization,content-type,prefer,x-upsert,x-client-info','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Max-Age':'600'});return res.end()}
  const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);
  if(url.pathname.startsWith('/__mock/')){
   if(url.pathname==='/__mock/google'){const f=new URLSearchParams(raw.toString());const rt=f.get('rt');if(f.get('negar')){res.writeHead(302,{Location:rt+'#error=access_denied&error_description=O+usu%C3%A1rio+cancelou'});return res.end()}
    const email=f.get('email').toLowerCase();let u=USERS.get(email);if(!u)u=await criarUser(email,null,'google',{full_name:f.get('nome')},true);const s=sessao(u);res.writeHead(302,{Location:redirLink(rt,s)});return res.end()}
   if(url.pathname==='/__mock/mail')return send(res,200,MAIL);
   if(url.pathname==='/__mock/log')return send(res,200,LOG);
   if(url.pathname==='/__mock/config'){const j=JSON.parse(raw.toString()||'{}');CFG={...CFG,...j};return send(res,200,CFG)}
   if(url.pathname==='/__mock/sql'){try{const r=await serial(()=>db.query(raw.toString()));return send(res,200,r.rows)}catch(e){return send(res,400,{message:e.message})}}
   if(url.pathname==='/__mock/blobs')return send(res,200,[...BLOBS.keys()]);
   if(url.pathname==='/__mock/expire'){for(const t of TOK.values())t.exp=0;return send(res,200,{ok:true})}
  }
  if(req.headers.apikey!==ANON&&url.pathname!=='/auth/v1/authorize')return send(res,401,{message:'No API key found in request'});
  const bearer=(req.headers.authorization||'').replace(/^Bearer /,'');let uid=null;
  if(bearer&&bearer!==ANON){const t=TOK.get(bearer);if(!t||t.exp<Date.now())return send(res,401,{message:'JWT expired',code:'PGRST301'});uid=t.id}
  let body={};const ct=req.headers['content-type']||'';if(ct.includes('json')&&raw.length){try{body=JSON.parse(raw.toString())}catch(e){return send(res,400,{message:'json'})}}
  LOG.push([req.method,url.pathname+url.search]);
  if(url.pathname.startsWith('/auth/v1'))return auth(req,res,url,body,bearer);
  if(url.pathname.startsWith('/rest/v1/')){if(!uid)return send(res,401,{message:'anon sem acesso'});return postgrest(req,res,url,uid,body)}
  if(url.pathname.startsWith('/storage/v1/'))return storage(req,res,url,uid,raw);
  send(res,404,{message:'não encontrado'})}
(async()=>{db=new PGlite();await db.exec(STUB);const SQLP=[process.env.AVA_SQL,require('path').join(__dirname,'..','2_BANCO','2026-10-09_160_avaliacao-imoveis.sql'),'/home/claude/ava/sql/2026-10-09_160_avaliacao-imoveis.sql'].find(p=>p&&fs.existsSync(p));
  await db.exec(fs.readFileSync(SQLP,'utf8'));
  await db.exec(`grant usage on schema public to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated;`);
  http.createServer((q,r)=>handler(q,r).catch(e=>{console.error(e);try{send(r,500,{message:e.message})}catch(x){}})).listen(PORT,()=>console.log('mock supabase em',PORT))})();
