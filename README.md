# raio

Public registration form + password-protected backoffice for reviewing
submissions.

- **`/cadastro`** — public form: name, phone, date of birth, school year,
  location, optional email/Instagram/TikTok/notes, and a required photo
  upload (auto-compressed/resized on submit). Consent is required before
  submitting. Every submission is stored with status `pendente`.
- **`/backoffice`** — single shared-password login; lists all registrations
  with search/filter by name, location, school year and status; a detail
  view per registration shows every field + photo and lets an admin change
  the status (`pendente` / `aprovado` / `rejeitado`).

Stack: Next.js (App Router, TypeScript) deployed on Vercel; Postgres +
Storage on Supabase. Chosen to stay on free tiers.

See `specs/registration-backoffice/` for the full spec and decisions log.

## Local development

```
npm install
npx supabase start   # local Postgres + Storage via Docker
npm run dev
```

Local env vars (Supabase URL/keys, admin password) are read from
`.env.test` / `.env.local`. See `CLAUDE.md` for the full local Definition of
Done (typecheck, lint, tests, build) and setup notes — this README doesn't
duplicate it.

## Production deploy

The app needs three environment variables in production, read from:

- `lib/supabase/server.ts` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `app/api/admin/login/route.ts` / `lib/auth/session.ts` — `ADMIN_PASSWORD`
  (the shared backoffice login secret; use a strong value distinct from any
  local/test value)

None of these are set in this repo — only the variable *names* are
documented here. Actual values live in Supabase's dashboard and in Vercel's
environment variable store.

The steps below are the runbook actually followed to provision the current
production environment, written so a new environment can be reproduced (or
this one redeployed) from scratch.

### 1. Create a Supabase project

Either:

- **Dashboard** (used for this deployment): supabase.com/dashboard → New
  project. This was the path actually used here because direct CLI project
  creation (below) returned `403 Forbidden`, most likely because the
  organization needed a payment method / verification on file first.
- **CLI**:
  ```
  npx supabase login --token <personal-access-token>
  npx supabase projects create <name> --org-id <org-id> --db-password <password> --region <region>
  ```

### 2. Link the local repo to the project

```
npx supabase link --project-ref <project-ref>
```

### 3. Apply migrations

Normally:

```
npx supabase db push --linked
```

**Operational note from this deployment**: this environment's outbound
network blocked direct Postgres ports (5432/6543) to the Supabase pooler, so
`db push` hung/timed out. Fallback used instead — apply the migration SQL
directly via Supabase's Management API over HTTPS:

```
POST https://api.supabase.com/v1/projects/<project-ref>/database/query
Authorization: Bearer <personal-access-token>
Content-Type: application/json

{ "query": "<contents of supabase/migrations/0001_create_registrations.sql>" }
```

Use this as the fallback for any environment where direct Postgres ports
aren't reachable. If you do, also manually record the migration as applied
in `supabase_migrations.schema_migrations` (create the schema/table if it
doesn't exist yet, insert a row for the version) so the CLI's own migration
tracking stays consistent for future `supabase db push` / `supabase
migration list` runs from an environment that does have DB connectivity.

### 4. Get the project's API URL and keys

- Project URL: `https://<project-ref>.supabase.co`
- Keys: dashboard → Project Settings → API, or
  `npx supabase projects api-keys --project-ref <ref>` (requires the CLI to
  be logged in)

The app specifically needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
(see `lib/supabase/server.ts`).

### 5. Create/link a Vercel project

```
npx vercel login   # device-flow login, prints a URL to visit
npx vercel link     # run from the repo root; creates the project if needed
```

**Naming note**: the Vercel project created here was initially named `raio`
and was later renamed to `appja` (to match the GitHub repo `itsdomandre/appja`
and the Supabase project name `appja`). Renaming a Vercel project (`npx
vercel project rename <old-name> <new-name>`, or via the dashboard) does
**not** move the auto-generated `<name>.vercel.app` alias — the original
alias from the first deploy (e.g. `raio-topaz.vercel.app`) keeps pointing at
new deployments even after the rename. To get a clean alias matching the new
name, assign it explicitly after a deploy:

```
npx vercel alias set <deployment-url> <new-name>.vercel.app
```

Concretely, for this deployment: `npx vercel alias set <deployment-url>
appja.vercel.app`, giving a production URL of `https://appja.vercel.app`
(the old `raio-topaz.vercel.app` alias remains live too, pointing at the
same deployments).

**Troubleshooting — duplicate empty project after renaming**: re-running
`npx vercel link` after the rename above accidentally created a second,
empty Vercel project named `raio`. This happens because `vercel link` (with
no `--project` flag) auto-detects the project by matching the local
directory name (`raio`) against existing project names; once the real
project was renamed to `appja`, that lookup no longer found a match and
`vercel link` silently created a fresh `raio` project instead of linking to
the existing (renamed) one. Symptom: `npx vercel project ls` shows two
projects, the real `appja` one and an empty `raio` one. Fix: remove the
duplicate with `npx vercel project remove raio` — note this prompts for an
interactive `y/N` confirmation that `--non-interactive` alone does **not**
suppress in this CLI version, so pipe the confirmation via stdin instead:
`echo y | npx vercel project remove raio`. To avoid recreating the
duplicate, always re-link explicitly by name after a rename rather than
relying on directory-name auto-detection:

```
npx vercel link --yes --project appja
```

### 6. Connect GitHub for auto-deploy (follow-up, not done yet here)

Connecting the Vercel project to the GitHub repo for deploy-on-push requires
the Vercel account to have GitHub linked as a connection first (Vercel
account settings → Connections). That wasn't set up yet for this
deployment, so the initial deploy was a direct CLI upload (step 8) rather
than a git-triggered deploy. Once GitHub is connected as a login/connection
method, enable auto-deploy with:

```
npx vercel git connect
```

(or via the Vercel dashboard, Project Settings → Git).

### 7. Set production environment variables

```
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add ADMIN_PASSWORD production
```

Pipe each value via stdin (e.g. `printf '%s' "$VALUE" | npx vercel env add
NAME production`) rather than typing it interactively, so it isn't stored in
shell history.

### 8. Deploy

```
npx vercel deploy --prod --yes
```

### 9. Disable Vercel SSO deployment protection (public-facing app gotcha)

**Discovered here**: new Vercel projects default to **SSO deployment
protection** enabled, which redirects *all* visitors — not just
teammates — to a `vercel.com/login?next=...sso-api...` page before they can
reach the app. For a public registration form on `/cadastro`, this silently
blocks every real visitor, which defeats the point of the deployment.

Check whether it's on:

```
npx vercel project protection <project-name> --json
```

Look for `"ssoProtection"` in the output — e.g. this deployment initially
showed `"ssoProtection": {"deploymentType": "all_except_custom_domains"}`,
meaning it was blocking the `<name>.vercel.app` alias. Disabled looks like
`"ssoProtection": null` (key present, value `null` — this Vercel CLI
version's actual representation of "off"; not `false` and not absent).

If it's on, disable it for a public app:

```
npx vercel project protection disable <project-name> --sso
```

Concretely, for this deployment: `npx vercel project protection disable
appja --sso`. Re-run the `--json` check afterward to confirm `ssoProtection`
is now `null`, then re-verify (step 10) — the smoke tests fail against the
login-redirect page until this is disabled.

### 10. Verify

```
PLAYWRIGHT_BASE_URL=<production-url> npx playwright test tests/e2e/production.spec.ts
```

Should pass (covers the production smoke-test acceptance criteria).
Concretely, for this deployment: `PLAYWRIGHT_BASE_URL=https://appja.vercel.app
npx playwright test tests/e2e/production.spec.ts`. Both AC24 and AC25
initially failed here because of the SSO protection gotcha above (step 9);
after disabling it, both passed cleanly against `https://appja.vercel.app`.
