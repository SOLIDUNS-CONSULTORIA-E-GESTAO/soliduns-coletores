// Teste do SQL 160 em PGlite (PostgreSQL 16/17 embarcado) com simulação do Supabase e das funções da plataforma.
const {PGlite}=(()=>{try{return require('@electric-sql/pglite')}catch(e){return require('/home/claude/cloud/node_modules/@electric-sql/pglite')}})();const fs=require('fs');
const SQL=fs.readFileSync(process.argv[2]||[require('path').join(__dirname,'..','2_BANCO','2026-10-09_160_avaliacao-imoveis.sql'),'/home/claude/ava/sql/2026-10-09_160_avaliacao-imoveis.sql'].find(p=>fs.existsSync(p)),'utf8');
const STUB=`create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable security definer as $$ select jsonb_build_object('email',(select email from auth.users where id = auth.uid())) $$;
grant execute on function auth.jwt() to authenticated, anon;
create schema storage; create table storage.buckets(id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text, created_at timestamptz default now());
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
alter table storage.objects enable row level security;
grant usage on schema auth, storage to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
grant all on storage.objects to authenticated;
-- plataforma (simulação): fila de acesso, áreas do plano e administradores do sistema
create table public.acessos(id uuid primary key, email text, status text, perfil text);
create table public.teste_areas(id uuid, area text);
create function public.eh_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from auth.users u where u.id = auth.uid() and lower(u.email) in ('dr.thiago.viegas@gmail.com','thales.viegas@gmail.com')) $$;
create function public.esta_aprovado() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.acessos a where a.id = auth.uid() and a.status = 'aprovado') $$;
create function public.tem_area(p text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.teste_areas t where t.id = auth.uid() and (t.area = p or t.area = '*')) $$;
grant usage on schema public to authenticated, anon;`;
const ADM='aaaaaaaa-0000-0000-0000-000000000001',A='aaaaaaaa-0000-0000-0000-00000000000a',B='aaaaaaaa-0000-0000-0000-00000000000b',P='aaaaaaaa-0000-0000-0000-00000000000c',S='aaaaaaaa-0000-0000-0000-00000000000d';
const res=[];const ok=(n,c,d='')=>{res.push([n,!!c,d])};
(async()=>{const db=new PGlite();await db.exec(STUB);
 // sem pré-requisito: o SQL recusa e nada é gravado
 const db0=new PGlite();await db0.exec(STUB.replace(/create function public.tem_area[\s\S]*?\$\$;/,''));
 let msg='';try{await db0.exec(SQL)}catch(e){msg=e.message;await db0.exec('rollback')}
 ok('Sem tem_area: SQL recusa com mensagem clara',/FALTA public.tem_area/.test(msg),msg);
 ok('Sem tem_area: nada gravado',(await db0.query(`select to_regclass('public.aval_avaliacoes') t`)).rows[0].t===null);
 await db.exec(SQL);await db.exec(SQL); // 2x: idempotente
 const conf=(await db.query(SQL.slice(SQL.lastIndexOf('select \'planos aceitam'))));
 ok('Conferência do próprio SQL: todas ok',conf.rows.every(r=>r.ok===true),JSON.stringify(conf.rows));
 await db.exec(`insert into auth.users values ('${ADM}','dr.thiago.viegas@gmail.com'),('${A}','ana@x.com'),('${B}','bruno@x.com'),('${P}','pendente@x.com'),('${S}','semarea@x.com');
  insert into public.acessos values ('${ADM}','dr.thiago.viegas@gmail.com','aprovado','admin'),('${A}','ana@x.com','aprovado','usuario'),('${B}','bruno@x.com','aprovado','usuario'),('${P}','pendente@x.com','pendente','usuario'),('${S}','semarea@x.com','aprovado','usuario');
  insert into public.teste_areas values ('${A}','avaliacao_imoveis'),('${B}','*'),('${P}','avaliacao_imoveis'),('${S}','leiloes');`);
 const as=async(uid,sql)=>{await db.exec(`set role ${uid?'authenticated':'anon'}; select set_config('request.jwt.claim.sub','${uid||''}',false);`);try{return await db.query(sql)}finally{await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);")}};
 const falha=async(uid,sql)=>{try{await as(uid,sql);return false}catch(e){return e.message||true}};
 await as(A,`insert into public.aval_avaliacoes(id,codigo,dados) values ('avA1','AV-1','{"t":1}')`);
 await as(B,`insert into public.aval_avaliacoes(id,codigo,dados) values ('avB1','AV-2','{"t":2}')`);
 ok('Dono grava avaliação (dono preenchido sozinho)',(await db.query(`select owner from public.aval_avaliacoes where id='avA1'`)).rows[0].owner===A);
 ok('Perito só vê as próprias avaliações',(await as(A,`select id from public.aval_avaliacoes`)).rows.map(r=>r.id).join()==='avA1');
 ok('Não grava em nome de outro',!!await falha(A,`insert into public.aval_avaliacoes(id,owner,dados) values ('xx1','${B}','{}')`));
 ok('Não altera avaliação de outro (0 linhas)',(await as(A,`update public.aval_avaliacoes set codigo='x' where id='avB1'`)).affectedRows===0);
 ok('Não apaga avaliação de outro (0 linhas)',(await as(A,`delete from public.aval_avaliacoes where id='avB1'`)).affectedRows===0);
 ok('Dono não muda o dono',!!await falha(A,`update public.aval_avaliacoes set owner='${B}' where id='avA1'`));
 ok('Pendente na fila não lê nem grava',(await as(P,`select id from public.aval_avaliacoes`)).rows.length===0&&!!await falha(P,`insert into public.aval_avaliacoes(id,dados) values ('pp1','{}')`));
 ok('Aprovado sem a área no plano não grava',!!await falha(S,`insert into public.aval_avaliacoes(id,dados) values ('ss1','{}')`));
 ok('Plano que libera tudo grava',(await as(B,`select count(*)::int n from public.aval_avaliacoes`)).rows[0].n===1);
 ok('Visitante não lê',!!await falha(null,`select * from public.aval_avaliacoes`));
 ok('Administrador do sistema lê todas',(await as(ADM,`select id from public.aval_avaliacoes`)).rows.length===2);
 await as(ADM,`update public.aval_avaliacoes set codigo='AV-2-suporte' where id='avB1'`);
 ok('Administrador ajusta avaliação de perito (suporte), dono preservado',(await db.query(`select codigo,owner from public.aval_avaliacoes where id='avB1'`)).rows[0].owner===B);
 await as(A,`insert into public.aval_perfis(nome,registro) values ('Ana Souza','CREA-DF 1')`);
 ok('Perito cria o próprio perfil',(await db.query(`select nome from public.aval_perfis where id='${A}'`)).rows[0].nome==='Ana Souza');
 ok('Não cria perfil de outro',!!await falha(A,`insert into public.aval_perfis(id,nome) values ('${B}','x')`));
 ok('Não vê perfil de outro',(await as(B,`select id from public.aval_perfis`)).rows.length===0);
 ok('Administrador vê os perfis',(await as(ADM,`select id from public.aval_perfis`)).rows.length===1);
 await as(A,`insert into public.aval_parametros(dados) values ('{"fo":0.9}')`);await as(A,`insert into public.aval_mercado(id,dados) values ('mmA1','{}')`);
 ok('Parâmetros e mercado por perito',(await as(B,`select * from public.aval_parametros`)).rows.length===0&&(await as(A,`select * from public.aval_mercado`)).rows.length===1);
 await as(A,`insert into public.aval_auditoria(id,tipo,detalhe) values ('evA1','acao','teste')`);
 ok('Trilha: inclui o próprio evento',(await as(A,`select id from public.aval_auditoria`)).rows.length===1);
 ok('Trilha: ninguém altera',!!await falha(A,`update public.aval_auditoria set detalhe='x'`));
 ok('Trilha: ninguém apaga',!!await falha(A,`delete from public.aval_auditoria`));
 ok('Trilha: não registra em nome de outro',!!await falha(A,`insert into public.aval_auditoria(id,owner,tipo) values ('evx1','${B}','acao')`));
 const ev=(await db.query(`select usuario,papel,ts_cliente,ts from public.aval_auditoria where id='evA1'`)).rows[0];
 ok('Trilha: usuário e papel carimbados pelo servidor',ev.usuario==='ana@x.com'&&ev.papel==='perito',JSON.stringify(ev));
 await as(A,`insert into public.aval_auditoria(id,tipo,detalhe,usuario,papel,ts) values ('evA2','acao','forjado','thales.viegas@gmail.com','admin','2020-01-01')`);
 const ev2=(await db.query(`select usuario,papel,ts,ts_cliente from public.aval_auditoria where id='evA2'`)).rows[0];
 ok('Trilha forjada: usuário, papel e data corrigidos pelo servidor',ev2.usuario==='ana@x.com'&&ev2.papel==='perito'&&new Date(ev2.ts).getFullYear()>=2026&&new Date(ev2.ts_cliente).getFullYear()===2020,JSON.stringify(ev2));
 ok('Id com código escondido é recusado (avaliação)',!!await falha(A,`insert into public.aval_avaliacoes(id,dados) values ('x"><img src=x onerror=alert(1)>','{}')`));
 ok('Id com código escondido é recusado (mercado e trilha)',!!await falha(A,`insert into public.aval_mercado(id,dados) values ('a b<','{}')`)&&!!await falha(A,`insert into public.aval_auditoria(id,tipo) values ('<x>','acao')`));
 ok('Documento acima de 5 MB é recusado',!!await falha(A,`insert into public.aval_avaliacoes(id,dados) values ('grande1',jsonb_build_object('x',repeat('a',5100000)))`));
 ok('Pasta aval-anexos aceita só imagens, PDF e Word',(await db.query(`select allowed_mime_types m from storage.buckets where id='aval-anexos'`)).rows[0].m.length===9);
 ok('Trilha: administrador lê todas',(await as(ADM,`select id from public.aval_auditoria`)).rows.length===2);
 await as(A,`insert into storage.objects(bucket_id,name) values ('aval-anexos','${A}/avA1/fx_1')`);
 ok('Foto na própria pasta',(await db.query(`select count(*)::int n from storage.objects`)).rows[0].n===1);
 ok('Foto na pasta de outro: recusada',!!await falha(A,`insert into storage.objects(bucket_id,name) values ('aval-anexos','${B}/x/f')`));
 ok('Outro perito não vê a foto',(await as(B,`select name from storage.objects`)).rows.length===0);
 ok('Administrador vê a foto',(await as(ADM,`select name from storage.objects`)).rows.length===1);
 ok('Pendente não envia foto',!!await falha(P,`insert into storage.objects(bucket_id,name) values ('aval-anexos','${P}/x/f')`));
 await as(B,`insert into public.aval_perfis(nome) values ('Bruno')`);
 ok('Perito apaga o próprio perfil',(await as(B,`delete from public.aval_perfis where id='${B}'`)).affectedRows===1);
 ok('Perito não apaga perfil de outro (0 linhas)',(await as(B,`delete from public.aval_perfis where id='${A}'`)).affectedRows===0);
 await db.exec(`update public.acessos set status='bloqueado' where id='${A}'`);
 ok('Perito bloqueado na fila perde o acesso na hora',(await as(A,`select id from public.aval_avaliacoes`)).rows.length===0&&(await as(A,`select name from storage.objects`)).rows.length===0);
 await db.exec(`delete from auth.users where id='${A}'`);
 ok('Conta excluída: avaliações, perfil e trilha saem junto',(await db.query(`select (select count(*) from public.aval_avaliacoes where owner='${A}')+(select count(*) from public.aval_perfis where id='${A}')+(select count(*) from public.aval_auditoria where owner='${A}') n`)).rows[0].n==0);
 // pastas de contas excluídas (limpeza do administrador)
 await db.exec(`insert into storage.objects(bucket_id,name) values ('aval-anexos','${B}/avB1/fx_9')`);
 ok('Pastas órfãs: perito comum não consulta',!!await falha(B,`select * from public.aval_pastas_orfas()`));
 ok('Pastas órfãs: arquivo recente (menos de 24 h) não entra',(await as(ADM,`select * from public.aval_pastas_orfas()`)).rows.length===0);
 await db.exec(`update storage.objects set created_at=now()-interval '2 days'`);
 {const r=(await as(ADM,`select pasta, arquivos::int n from public.aval_pastas_orfas()`)).rows;
  ok('Pastas órfãs: só a pasta da conta excluída, com a contagem certa',r.length===1&&r[0].pasta===A&&r[0].n===1,JSON.stringify(r))}
 // planos com lista fixa de áreas (text[] e jsonb): a área nova passa a ser aceita
 for(const [tipo,col,chk,upd] of [['text[]',"areas text[] default '{}'","areas <@ array['filtro_acoes','leiloes','mercado_imobiliario']::text[]","array_append(areas,'avaliacao_imoveis')"],
   ['jsonb',"areas jsonb default '[]'","areas <@ '[\"filtro_acoes\",\"leiloes\",\"mercado_imobiliario\"]'::jsonb","areas || '[\"avaliacao_imoveis\"]'::jsonb"]]){
  const dp=new PGlite();await dp.exec(STUB);await dp.exec(`create table public.planos(id serial primary key, slug text, ${col}, constraint planos_areas_validas check (${chk})); insert into public.planos(slug) values ('gratis');`);
  let antes='';try{await dp.query(`update public.planos set areas=${upd}`)}catch(e){antes='recusa'}
  await dp.exec(SQL);await dp.exec(SQL);
  const c2=(await dp.query(SQL.slice(SQL.lastIndexOf("select 'planos aceitam")))).rows;
  const n=(await dp.query(`select count(*)::int n from public.planos where slug='gratis' and areas::text like '%avaliacao%'`)).rows[0].n;
  let depois='aceita';try{await dp.query(`update public.planos set areas=${upd}`)}catch(e){depois=e.message}
  ok(`Planos com lista fixa (${tipo}): área nova passa a ser aceita`,antes==='recusa'&&depois==='aceita'&&c2[0].ok===true&&c2.every(r=>r.ok),JSON.stringify([antes,depois,c2]));
  ok(`Planos (${tipo}): a conferência não grava nada no plano`,n===0,'n='+n);
 }
 {const dq=new PGlite();await dq.exec(STUB);await dq.exec(`create table public.planos(id serial primary key, areas text, constraint pl check (areas ~ 'mercado_imobiliario|x'));`);
  let m='';try{await dq.exec(SQL)}catch(e){m=e.message;await dq.exec('rollback')}
  ok('Lista de áreas em formato desconhecido: SQL para e nada é gravado',/formato inesperado/.test(m)&&(await dq.query(`select to_regclass('public.aval_avaliacoes') t`)).rows[0].t===null,m)}
 res.forEach(([n,c,d])=>console.log((c?'OK    ':'FALHA ')+n+(c?'':'  -> '+d)));
 console.log(`SQL 160: ${res.filter(r=>r[1]).length}/${res.length}`);process.exit(res.every(r=>r[1])?0:1)})().catch(e=>{console.error(e);process.exit(2)});
