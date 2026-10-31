# ConnectSphere

ConnectSphere is an event-planning workspace for organisers, event coordinators, venue staff, technical support staff, and attendees.

## Stack

- React 19 + Vite + TypeScript for the frontend (`apps/frontend`)
- Node.js + Express + TypeScript for the backend (`apps/backend`)
- Tailwind CSS for styling
- One shared Supabase project for authentication and PostgreSQL
- A shared workspace package (`packages/shared`) for types, zod schemas, and domain logic used by both apps
- Vitest, Playwright, pgTAP, and GitHub Actions for pull-request checks

The project is a pnpm monorepo split into a frontend and a backend. The frontend talks to Supabase directly for authentication and for reads/writes protected by Row Level Security; the backend exists for privileged operations (using the Supabase `service_role` key) and business logic that shouldn't run in the browser. Supabase provides the shared backend database and final authorization boundary via RLS policies. Prisma is intentionally not used.

## Start developing

Install Node.js 24 and pnpm 11, then run:

```bash
git clone https://github.com/kaiksng/SPM.git
cd SPM
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/backend/.env.example apps/backend/.env
```

Ask the team database owner for the Supabase **publishable key** (frontend) and the **service role key** (backend, keep this secret) and place them in the files above:

```text
# apps/frontend/.env.local
VITE_SUPABASE_URL=https://qqyvnlznjgupmxfqutff.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_team_publishable_key
VITE_BACKEND_URL=http://localhost:3001

# apps/backend/.env
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173
SUPABASE_URL=https://qqyvnlznjgupmxfqutff.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_team_service_role_key
```

Run both apps (in separate terminals):

```bash
pnpm dev:frontend         # http://localhost:5173
pnpm dev:backend          # http://localhost:3001
```

Do not commit `.env.local` or `.env`. Only the backend needs the Supabase service role key; the frontend only ever uses the publishable key plus Row Level Security.

## How the code is organised

```text
apps/
  frontend/               React + Vite + Tailwind SPA
    src/
      routes/              Route components and layouts (React Router)
      features/            Complete product feature slices (components, actions)
      components/ui/       Shared UI primitives
      context/             Auth session context
      guards/               Route guards (e.g. require an authenticated session)
      lib/                 Supabase browser client, backend API client, utils
  backend/                Node.js + Express API
    src/
      routes/              HTTP routes for privileged/business-logic operations
      middleware/          Auth verification, error handling
      lib/                 Supabase service-role client
      errors/              Application error types
packages/
  shared/                 Types, zod schemas, and domain logic shared by both apps
supabase/
  migrations/             Version-controlled shared database changes
  tests/database/         Database and Row Level Security tests
docs/                     Architecture, testing, API, and traceability
tests/e2e/                Browser journeys (Playwright)
```

Each feature keeps its own components, validation, and actions. Simple reads/writes go straight from the frontend to Supabase, protected by RLS; the backend is for privileged operations (the `service_role` key) and business logic that shouldn't run client-side. See `packages/shared` for anything used by both apps.

## Daily commands

```bash
pnpm dev:frontend         # Start the frontend (Vite dev server)
pnpm dev:backend          # Start the backend (Express)
pnpm typecheck:frontend   # Typecheck the frontend
pnpm typecheck:backend    # Typecheck the backend
pnpm typecheck:shared     # Typecheck the shared package
pnpm test:e2e             # Run browser tests against both apps
```

Run `pnpm --filter @spm/frontend test`, `pnpm --filter @spm/backend test`, or `pnpm --filter @spm/shared test` for unit/component tests in a specific package.

For application integration tests against a separate disposable local Supabase
stack, see [integration testing](docs/testing/integration-testing.md). Use
`pnpm test:integration` and `pnpm typecheck:integration`; Docker is required only
for the integration run, not for `pnpm check`.

Teammates can follow the [numbered integration-testing guide](docs/testing/integration-team-guide.md)
and invoke the shared `spm-integration-testing` skill to add one story at a time.

Use pnpm consistently. Do not run `npm install` or commit a `package-lock.json`.

## Git workflow

Start each item from an updated `main` branch:

```bash
git switch main
git pull origin main
git switch -c feature/PB-XX-short-description
```

Use names such as:

- `feature/PB-03-event-request-form`
- `fix/PB-03-date-validation`
- `chore/update-ci`

Include the Jira ID in the branch, commits, pull-request title, and traceability document. Keep each pull request focused, obtain at least one review, and merge only after CI passes.

## Shared Supabase rules

The shared project reference is `qqyvnlznjgupmxfqutff`.

- One appointed database owner manages schema changes.
- Do not manually add, rename, or delete tables without coordinating with the team.
- Never reset the shared hosted database.
- Never expose or distribute the Supabase secret key.
- All normal application access uses the publishable key plus Row Level Security.
- Prefix temporary records with your name, for example `[Kai Test] Orientation`.
- Keep agreed demonstration records stable before sprint reviews.
- Every schema change must have a migration committed to Git.

### Database-owner workflow

Only the database owner needs to authenticate and link the CLI:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref qqyvnlznjgupmxfqutff
```

Create and edit a migration:

```bash
pnpm exec supabase migration new describe_change
```

Preview the remote change before applying it:

```bash
pnpm db:push:preview
pnpm db:push
pnpm db:types
```

Commit the migration and regenerated `database.types.ts` (in `packages/shared/src/types/database.types.ts`) together, then run `pnpm check` and fix any type errors in the same commit. CI validates migrations against a temporary database so the shared team data is never reset.

## Definition of Done

A story is done only when its acceptance criteria are demonstrated, relevant tests pass, authorization is enforced in both the application and Supabase RLS, errors and empty states are handled, tests are tagged with the acceptance criteria they cover, and the reviewed pull request is merged.

See [System architecture](docs/architecture/README.md) and [API contract](docs/api/openapi.yaml).
