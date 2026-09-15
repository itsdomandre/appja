# raio — Definition of Done

This project uses spec-driven, test-first development (botelho-dev doctrine).
A sub-task is done only when all of the following are green.

## Setup

```
npm install
npx supabase start   # local Supabase stack (Postgres + Storage), required for tests
```

Local Supabase env vars (URL, anon key, service role key, DB URL) come from
`.env.test`, loaded automatically by `vitest.setup.ts` via `dotenv`. These are
the well-known Supabase CLI local-dev demo credentials — they only work
against `127.0.0.1` and are not secrets.

If the stack is already running but appears stale, `npx supabase status` shows
current state; `npx supabase stop` / `npx supabase start` to cycle it.

## Definition of Done

Run from the repo root, in this order:

```
npm run typecheck   # tsc --noEmit — must be clean
npm run lint         # eslint . — must be clean
npx supabase status  # confirm local stack is up (npx supabase start if not)
npx vitest run        # all tests green (requires local Supabase running)
npx next build        # production build must succeed
```

All five must pass with no errors before a sub-task is considered complete.

## Notes

- Tests in `app/api/registrations/route.test.ts` run against the real local
  Postgres/Storage (no mocking) — they need `npx supabase start` first.
- `supabase/migrations/0001_create_registrations.sql` and
  `supabase/config.toml` are contract/spec artifacts — do not edit them to
  make tests pass; if they seem wrong, stop and report instead.
