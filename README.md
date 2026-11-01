# ConnectSphere

[![CI](https://github.com/kaiksng/SPM/actions/workflows/ci.yml/badge.svg)](https://github.com/kaiksng/SPM/actions/workflows/ci.yml)

ConnectSphere is an event-planning workspace built for the IS212 Software Project Management Scrum project. Event organisers request events; an Event Coordinator Lead assigns each to a coordinator; coordinators book venues and equipment; venue staff and technical support staff decide those requests; a Safety Officer reviews operational safety before an event is confirmed; attendees register.

**Git repository:** <https://github.com/kaiksng/SPM>

## Contents

- [Submission map](#submission-map)
- [Roles and what is built](#roles-and-what-is-built) · [Stack and design](#stack-and-design)
- [Run it](#run-it) · [Commands](#commands)
- [Testing and traceability](#testing-and-traceability) · [Continuous integration](#continuous-integration)
- [Known limitations](#known-limitations) · [How the code is organised](#how-the-code-is-organised)
- [Contributing](#git-workflow)

## Submission map

How the seven Week 12 deliverables relate to this repository.

| # | Deliverable | Where |
| --- | --- | --- |
| 1 | Final product backlog export | Submitted separately (Jira export); not in the repository |
| 2 | System design (C4 model) | [docs/architecture](docs/architecture/README.md): context, container and component diagrams plus ADRs |
| 3 | Test cases traceable to stories and acceptance criteria | [Testing and traceability](#testing-and-traceability), the [integration coverage matrix](docs/testing/integration-coverage-matrix.md), [manual journeys](docs/testing/manual-e2e-journeys.md); UAT workbook submitted separately |
| 4 | Sprint meeting evidence and final-sprint recordings | Submitted separately; not in the repository |
| 5 | Slide deck (PDF) | Submitted separately; not in the repository |
| 6 | Software release | This repository: code, tests, [CI pipeline](.github/workflows/ci.yml) and this README |
| 7 | README with repository link | This file: [repository link](#connectsphere) |

## Roles and what is built

| Role | What they do |
| --- | --- |
| Event Organiser | Creates and saves draft event requests, submits them, answers clarifications, requests changes, tracks status |
| Event Coordinator Lead | Sees the unassigned queue, assigns and reassigns coordinators, oversees active events |
| Event Coordinator | Reviews assigned events (clarify, approve, reject), plans them, requests venues and equipment, processes change requests, cancels or completes events |
| Venue Staff | Maintains the venue catalogue, setup/turnaround times and unavailability blocks; approves, rejects or holds booking requests |
| Technical Support Staff | Maintains equipment, reviews equipment requests, reserves equipment |
| Safety Officer | Reviews the safety of an event's arrangements and approves, rejects or requests changes |
| Attendee | Browses public events, registers, joins a waiting list, withdraws |

All 20 core features of the project brief are implemented: role-based access, event requests and drafts, review and approval, coordinator assignment, event status management, event information and change requests, venue catalogue, availability calendar, search, suitability and booking, booking approval and conflict detection, equipment requests, availability and reservation, attendee registration, and notifications.

The six Week 7 customer changes are implemented:

1. **Venue setup and turnaround time:** each venue has configurable buffers; availability and conflicts use the effective window (`venue_effective_window`).
2. **Venue becomes unavailable after booking:** blocks flag affected bookings instead of cancelling them, and coordinators request a replacement venue.
3. **Multiple venues per event:** each booking is checked independently, with one main venue.
4. **Tentative holds expire:** venue staff place holds with an expiry; expired holds free the venue.
5. **Event Coordinator Lead role:** submitted requests enter an unassigned queue; the Lead assigns and reassigns.
6. **Safety Officer check:** an event cannot be confirmed until the safety review is approved; requested changes return it to planning.

## Stack and design

- React 19 + Vite + TypeScript + Tailwind CSS frontend (`apps/frontend`)
- Node.js + Express + TypeScript backend (`apps/backend`)
- Shared types, zod schemas and domain logic (`packages/shared`, imported as `@spm/shared`)
- One Supabase project (Auth, PostgreSQL, Storage). Business rules live in Postgres functions protected by Row Level Security, which is the final authorization boundary. Prisma is intentionally not used.
- Vitest, pgTAP, Playwright and GitHub Actions for testing and CI

The frontend talks to Supabase directly for reads and writes protected by RLS, and to the backend for privileged operations that use the service-role key. The backend is a thin layer: authenticate, validate with zod, call a Postgres function, map errors.

Design documents: [System architecture](docs/architecture/README.md); C4 model as PlantUML: [context](docs/architecture/c4-context.puml), [containers](docs/architecture/c4-container.puml), [components](docs/architecture/c4-component.puml); [architecture decision records](docs/architecture/adr/); [API contract](docs/api/openapi.yaml).

## Run it

Prerequisites: Node.js 24 (see `.nvmrc`), pnpm 11, and Docker only for the local-database path and the database/integration tests.

```bash
git clone https://github.com/kaiksng/SPM.git
cd SPM
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/backend/.env.example apps/backend/.env
```

Then choose where the data comes from.

### Option A: the team's shared Supabase project

Ask the team database owner for the Supabase **publishable key** (frontend) and the **service role key** (backend, keep this secret):

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

This is a shared project treated as production; see [Shared Supabase rules](#shared-supabase-rules).

### Option B: a private local database (needs Docker)

```bash
pnpm exec supabase start     # applies every migration in supabase/migrations
pnpm exec supabase status    # prints the local API URL and keys
```

Put the local API URL (normally `http://127.0.0.1:54321`), the publishable/anon key and the service-role key from `supabase status` into the two env files above. A local database starts empty: create accounts through the sign-up page, or use `supabase/dev-seed/venues.sql` for a venue catalogue (`pnpm exec supabase db query --local -f supabase/dev-seed/venues.sql`).

### Start the apps (separate terminals)

```bash
pnpm dev:frontend         # http://localhost:5173
pnpm dev:backend          # http://localhost:3001
```

Do not commit `.env.local` or `.env`. Only the backend uses the service-role key; the frontend only ever uses the publishable key plus Row Level Security.

### Demo accounts (shared project)

These test accounts exist on the shared project (they are not created by a local `supabase start`). All use the password **`ConnectSphere@SPM`**.

| Role | Email | Second account |
| --- | --- | --- |
| Event Organiser | jasmine@gmail.com | kenneth@gmail.com |
| Event Coordinator Lead | tom@gmail.com | |
| Event Coordinator | joyce@gmail.com | jonathan@gmail.com |
| Venue Staff | daryl@gmail.com | keith@gmail.com |
| Technical Support Staff | andy@gmail.com | benny@gmail.com |
| Safety Officer | sally@gmail.com | |
| Attendee | joseph@gmail.com | daniel@gmail.com, bernard@gmail.com |

Use a separate browser profile per account; two people signed in to the same account at once will interfere with each other's journeys.

The [manual end-to-end journeys](docs/testing/manual-e2e-journeys.md) walk through a full event across all seven roles.

## Commands

Use **pnpm only**. Do not run `npm install` or commit a `package-lock.json`.

| Command | What it does |
| --- | --- |
| `pnpm dev:frontend` / `pnpm dev:backend` | Start the Vite dev server / the Express API |
| `pnpm check` | Everything CI's `checks` job runs: 3 typechecks, 3 unit test suites, 2 builds. Run before finishing any change |
| `pnpm typecheck:frontend` / `:backend` / `:shared` | Typecheck one package |
| `pnpm --filter @spm/<frontend\|backend\|shared> test` | Unit/component/route tests for one package |
| `pnpm --filter @spm/<frontend\|backend\|shared> test:coverage` | Same, with a v8 coverage report |
| `pnpm test:integration` | Application integration tests against a disposable local Supabase stack (Docker) |
| `pnpm test:integration:db` | The pgTAP suite against that disposable stack |
| `pnpm test:integration:safety` | Checks the integration runner can never target a hosted database |
| `pnpm typecheck:integration` | Typecheck the integration tests |
| `pnpm db:test` | pgTAP database and RLS tests against the normal local Supabase (Docker) |
| `pnpm test:e2e` | Playwright browser tests (starts both apps) |
| `pnpm uat:setup <case>` | Restore the starting data for one UAT case (see [tests/uat_data](tests/uat_data/README.md)) |
| `pnpm db:types` | Regenerate `packages/shared/src/types/database.types.ts` |
| `pnpm db:push:preview` / `pnpm db:push` | Database owner only: preview / apply migrations to the linked project |

## Testing and traceability

Tests are layered so each kind of rule is checked where it is cheapest to check:

| Layer | Where | What it covers |
| --- | --- | --- |
| Unit, component and route tests (Vitest) | next to the code (`foo.ts` → `foo.test.ts`) in `apps/frontend`, `apps/backend`, `packages/shared` | Validation, domain rules, UI behaviour, backend routes (401, 422, each SQLSTATE mapping). Services are mocked; no `.env` or network is needed |
| Database tests (pgTAP) | [supabase/tests/database](supabase/tests/database) | Postgres functions, constraints, triggers and RLS for every role that should and should not have access |
| Integration tests (Vitest + local Supabase) | [tests/integration](tests/integration) | Real application code, Auth, PostgREST and Postgres together: one suite per business workflow plus a role-access matrix. See [integration testing](docs/testing/integration-testing.md) and the [coverage matrix](docs/testing/integration-coverage-matrix.md) |
| End-to-end tests (Playwright) | [tests/e2e](tests/e2e) | Journeys that need the real browser, backend and database |
| Manual UAT and journeys | [tests/uat_data](tests/uat_data/README.md), [manual journeys](docs/testing/manual-e2e-journeys.md) | Business-level acceptance cases with repeatable setup data |

**Traceability:** acceptance criteria are tagged in test comments, for example `// AC03: ...`, and Jira story keys (`SPM-nn`) appear in test file names, describe blocks and migrations, so a requirement can be followed to its code and tests. The integration matrix maps stories to suites.

**Latest results** (Node 24, from a clean checkout of this branch): `pnpm check` passes with 453 shared, 187 backend and 1627 frontend tests; 115 integration tests pass; 74 pgTAP files with 1512 checks pass.

**Coverage:** run `pnpm --filter @spm/<package> test:coverage` for the report. Measured line coverage is about 96% for `@spm/shared`, 95% for `@spm/backend` and 94% for `@spm/frontend`. We did **not** reach 100%, and do not claim it. What remains uncovered is mainly:

- process entry points and thin client wrappers that need a live Supabase connection (`apps/backend/src/index.ts`, the service-role client, `api-client.ts`, `supabase-client.ts`), which unit tests deliberately never create;
- defensive guards and fallbacks that cannot be reached through the public interface (for example `if (!x) return` behind state that is always set);
- a few UI branches (some dialog and filter error paths) not yet exercised.

Business rules written in SQL (RPCs, constraints, RLS) are outside v8 coverage; they are covered by the pgTAP and integration suites above instead.

## Continuous integration

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every pull request and on pushes to `main`:

| Job | What it runs | Secrets |
| --- | --- | --- |
| `checks` | Install with a frozen lockfile, typecheck all packages, run the shared, backend and frontend unit tests, build backend and frontend | none |
| `integration` | Typecheck and run the integration tests against a disposable local Supabase stack on the runner | none |
| `e2e` | Build the frontend and run the Playwright journeys | Supabase URL, publishable key and service-role key |
| `database` | Apply every migration to a throwaway local database and run the pgTAP tests | none |

The hosted shared database is never reset or written to by CI.

## Known limitations

- **Hosted database migrations are applied by the database owner.** A checkout can be ahead of the shared project; check `pnpm db:push:preview` (database owner) before relying on a newer feature there. A local database (`supabase start`) always has every migration.
- **Release 1 scope:** the build targets the 20 core features and the Week 7 changes; anything beyond them is not part of this release.
- **Test coverage is below 100%**, for the reasons given under [Testing and traceability](#testing-and-traceability).

## How the code is organised

```text
apps/
  frontend/               React + Vite + Tailwind SPA
    src/
      routes/              Pages and layouts (React Router), wrapped in RoleGate
      features/            One folder per feature: components, services, hooks, utils
      components/ui/       Shared UI primitives
      context/, guards/    Auth session and route guards
      lib/                 Supabase browser client, backend API client
  backend/                Node.js + Express API
    src/
      routes/              Privileged operations: validate, call an RPC, map errors
      middleware/, lib/, errors/
packages/
  shared/                 Types, zod schemas and domain logic used by both apps
supabase/
  migrations/             Version-controlled schema, RLS and Postgres functions
  tests/database/         pgTAP database and RLS tests
  dev-seed/               Optional local seed data (venue catalogue)
tests/
  integration/            Workflow integration tests (local Supabase)
  e2e/                    Playwright browser journeys
  uat_data/               SQL that restores starting data for UAT cases
scripts/                  Integration runner, its safety tests, UAT setup
docs/                     Architecture, API contract, testing
.github/workflows/        CI pipeline
```

Frontend services under `features/*/services` are the only place that calls Supabase or the backend; components and pages call services. Shared validation lives in `packages/shared/src/schemas`, so the browser and the API reject the same input and the database re-checks it.

## Git workflow

Start each item from an updated `main` branch:

```bash
git switch main
git pull origin main
git switch -c feature/SPM-XX-short-description
```

Use names such as `feature/SPM-03-event-request-form`, `fix/SPM-03-date-validation` or `chore/update-ci`. Include the Jira key in the branch, commits, pull-request title and tests. Keep each pull request focused, obtain at least one review, and merge only after CI passes.

## Shared Supabase rules

The shared project reference is `qqyvnlznjgupmxfqutff`.

- One appointed database owner manages schema changes.
- Do not manually add, rename, or delete tables without coordinating with the team.
- Never reset the shared hosted database.
- Never expose or distribute the Supabase service-role key.
- All normal application access uses the publishable key plus Row Level Security.
- Prefix temporary records with your name, for example `[Kai Test] Orientation`.
- Keep agreed demonstration records stable before sprint reviews.
- Every schema change must have a migration committed to Git. Never edit a migration that has already been applied; add a new one.

### Database-owner workflow

Only the database owner needs to authenticate and link the CLI:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref qqyvnlznjgupmxfqutff
pnpm exec supabase migration new describe_change
```

Preview the remote change before applying it:

```bash
pnpm db:push:preview
pnpm db:push
pnpm db:types
```

Commit the migration and the regenerated `database.types.ts` together, then run `pnpm check` and fix any type errors in the same commit. CI validates migrations against a temporary database so the shared team data is never reset.
