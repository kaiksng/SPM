# ConnectSphere

ConnectSphere is an event-planning workspace for organisers, event coordinators, venue staff, technical support staff, and attendees.

## Stack

- Next.js 16, React 19, and TypeScript
- Tailwind CSS and shadcn/ui components
- One shared Supabase project for authentication and PostgreSQL
- Vitest, Playwright, pgTAP, ESLint, and Prettier
- GitHub Actions for pull-request checks

The project is a modular monolith. Next.js contains the frontend and server-side operations; Supabase provides the shared backend database and final authorization boundary. Prisma is intentionally not used.

## Start developing

Install Node.js 24 and pnpm 11, then run:

```bash
git clone https://github.com/kaiksng/SPM.git
cd SPM
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install
cp .env.example .env.local
pnpm dev
```

Ask the team database owner for the Supabase **publishable key** and place it in `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=https://qqyvnlznjgupmxfqutff.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_team_publishable_key
NEXT_PUBLIC_APP_NAME=ConnectSphere
APP_TIMEZONE=Asia/Singapore
```

Open [http://localhost:3000](http://localhost:3000).

Do not commit `.env.local`. Team members do not need Docker, a local Supabase instance, the database password, or the Supabase secret key for normal development.

## How the code is organised

```text
src/
  app/                    Thin routes and page composition
    (public)/             Public pages
    (auth)/               Authentication pages
    (workspace)/          Signed-in workspace pages
    api/                  External HTTP endpoints
  components/             Shared UI and layout components
  features/               Complete product feature slices
  lib/supabase/           Browser/server Supabase clients and generated types
  server/                 Shared authentication, authorization, audit, and errors
  test/                   Shared test setup
supabase/
  migrations/             Version-controlled shared database changes
  tests/database/         Database and Row Level Security tests
docs/                     Architecture, testing, API, and traceability
tests/e2e/                Browser journeys
```

Each feature keeps its own components, validation, queries, actions, domain rules, types, and tests. Pages should compose features rather than contain database or business logic.

## Daily commands

```bash
pnpm dev                  # Start the application
pnpm test:unit            # Run unit and component tests
pnpm test:e2e             # Run browser tests
pnpm check                # Format check, lint, types, unit tests, and build
```

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

Commit the migration and regenerated `database.types.ts` together. CI validates migrations against a temporary database so the shared team data is never reset.

## Definition of Done

A story is done only when its acceptance criteria are demonstrated, relevant tests pass, authorization is enforced in both the application and Supabase RLS, errors and empty states are handled, traceability is updated, and the reviewed pull request is merged.

See [System architecture](docs/architecture/README.md), [API contract](docs/api/openapi.yaml), and [Sprint 1 traceability](docs/requirements/sprint-1-traceability.md).
