// Simulador do Supabase para os testes da v131: as chamadas da página (RPC, Storage, Auth) são respondidas
// pelas FUNÇÕES SQL DE VERDADE das migrations 146/147, num Postgres local (banco t131, cópia de teste).
const { Client } = require('pg');
const SUPA = 'https://evcsniicnrlrtzpdmeza.supabase.co';
async function ligar(page, opc = {}) {
  const db = new Client({ host: '127.0.0.1', user: 'postgres', password: 'pg', database: opc.banco || 't131' });
  await db.connect();
  await db.query(`select set_config('t.uid', '11111111-1111-1111-1111-111111111111', false), set_config('t.editor', $1, false)`, [opc.editor === false ? 'nao' : 'sim']);
  const log = [];
  const tiposDe = {};
  await page.route(SUPA + '/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), m = req.method();
    try {
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const nome = url.pathname.split('/').pop(), corpo = req.postData() ? JSON.parse(req.postData()) : {};
        if (!tiposDe[nome]) {
          const r = await db.query(`select p.proname, pg_get_function_identity_arguments(p.oid) a from pg_proc p where p.proname = $1 and p.pronamespace = 'public'::regnamespace`, [nome]);
          if (!r.rows.length) { log.push({ nome, erro: 404 }); return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Could not find the function' }) }); }
          tiposDe[nome] = Object.fromEntries(r.rows[0].a.split(',').filter(Boolean).map(x => x.trim().split(/\s+/)).map(([k, ...t]) => [k, t.join(' ')]));
        }
        const ks = Object.keys(corpo), vals = ks.map(k => corpo[k] === null || corpo[k] === undefined ? null : (typeof corpo[k] === 'object' ? JSON.stringify(corpo[k]) : String(corpo[k])));
        const sql = `select to_jsonb(public.${nome}(${ks.map((k, i) => `${k} := $${i + 1}::${tiposDe[nome][k] || 'text'}`).join(', ')})) as r`;
        log.push({ nome, corpo });
        try {
          const r = await db.query(sql, vals);
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].r) });
        } catch (e) {
          log.push({ nome, erroSql: e.message });
          return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message, code: e.code }) });
        }
      }
      if (url.pathname.startsWith('/storage/v1/object/')) {
        const partes = url.pathname.replace('/storage/v1/object/', '').split('/'); const balde = partes.shift(), nome = partes.join('/');
        if (m === 'POST') {
          const ok = balde === 'vm-imagens' ? /^[0-9]{4}\/[0-9]{2}\/[a-f0-9]{16,64}\.(jpg|png|webp)$/.test(nome) : /^[0-9]{4}\/[0-9]{2}\/[a-f0-9]{16,64}\.pdf$/.test(nome);
          log.push({ storage: balde + '/' + nome, bytes: (req.postDataBuffer() || []).length, ok, tipo: req.headers()['content-type'] });
          if (!ok) return route.fulfill({ status: 403, body: 'new row violates row-level security policy' });
          const ja = await db.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [balde, nome]);
          if (ja.rows.length) return route.fulfill({ status: 409, body: '{"error":"Duplicate","message":"The resource already exists"}' });
          await db.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [balde, nome]);
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: balde + '/' + nome }) });
        }
        if (m === 'DELETE') { await db.query('delete from storage.objects where bucket_id = $1 and name = $2', [balde, nome]); return route.fulfill({ status: 200, body: '{}' }); }
        // leitura pública de imagem (thumb): devolve um PNG 1x1
        return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
      }
      if (url.pathname.startsWith('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'tok2', refresh_token: 'r2', expires_in: 3600 }) });
      return route.fulfill({ status: 404, body: '{}' });
    } catch (e) { log.push({ falhaSimulador: e.message }); return route.fulfill({ status: 500, body: JSON.stringify({ message: e.message }) }); }
  });
  return { db, log };
}
module.exports = { ligar, SUPA };
