# Database tests

Quick, isolated PostgreSQL logic and RLS smoke test (requires Node and npm):

```sh
npm install --prefix supabase/tests --no-package-lock
node supabase/tests/check.cjs
```

This runs a disposable in-memory PGlite database. It mocks `auth.uid()` and random-byte generation and omits the Supabase Realtime publication and pg_cron statements. It does not prove Supabase deployment, real JWT authentication, Realtime delivery, the scheduler, or concurrency behavior. It does check the migration's remaining SQL and exercises game logic and the invalidation table's RLS under the `authenticated` role.

For a disposable Supabase database after applying the migration, run the same assertions against PostgreSQL:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/game.sql
```

The script runs as the database owner, simulates user identity using transaction-local JWT claims, and rolls back all fixture data. Additionally test simultaneous requests using separate database connections and exercise Realtime delivery and scheduled jobs on the actual project.
