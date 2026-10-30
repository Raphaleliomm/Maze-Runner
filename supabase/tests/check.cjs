const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

// A disposable embedded Postgres used only for smoke testing. The test double
// for random bytes is not cryptographically secure and is never deployed.
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema extensions;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$
        select decode(substr(md5(random()::text),1,n*2),'hex')
      $$;
    `);
    let migration = fs.readFileSync(path.join(__dirname, '../migrations/20261029000000_game.sql'), 'utf8');
    migration = migration
      .replace('create extension if not exists pgcrypto with schema extensions;', '')
      .replace('alter publication supabase_realtime add table public.room_events;', '')
      .replace('create extension if not exists pg_cron;', '')
      .replace(/^select cron\.schedule\(.*$/gm, '');
    await db.exec(migration);
    await db.exec(fs.readFileSync(path.join(__dirname, 'game.sql'), 'utf8'));
    console.log('PGlite SQL checks passed (auth and random bytes mocked; cron and Realtime omitted).');
  } finally {
    await db.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
