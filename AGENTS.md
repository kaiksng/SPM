# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot) working in this repository. Humans: see [README.md](README.md) for setup and team workflow.

## Project overview

ConnectSphere is an event-planning workspace (organisers, event coordinators, venue staff, technical support staff, attendees). It is a pnpm monorepo:

| Path | What it is |
| --- | --- |
| `apps/frontend` | React 19 + Vite + Tailwind SPA. Talks to Supabase directly for RLS-protected reads/writes, and to the backend for privileged operations |
| `apps/backend` | Node.js + Express API. Thin layer: authenticate, validate with zod, call a Postgres function with the service-role client, map errors |
| `packages/shared` | Types, zod schemas and domain logic used by both apps. Import as `@spm/shared`; export new modules from `src/index.ts` |
| `supabase/migrations` | Version-controlled schema. Business rules live in Postgres functions (RPC) protected by RLS |
| `supabase/tests/database` | pgTAP database and RLS tests |
| `tests/e2e` | Playwright browser journeys |
| `docs/requirements` | Story contracts and acceptance criteria. Read the relevant one before changing a feature |

Frontend code is organised by feature: `apps/frontend/src/features/<feature>/{components,services,hooks,utils}`. Pages live in `src/routes`.

## Commands

Use **pnpm only** (Node 24, pnpm 11). Never use npm or commit a `package-lock.json`.

```bash
pnpm install                              # install
pnpm dev:frontend                         # http://localhost:5173
pnpm dev:backend                          # http://localhost:3001
pnpm --filter @spm/<frontend|backend|shared> test       # unit tests for one package
pnpm --filter @spm/<frontend|backend|shared> typecheck  # typecheck one package
pnpm check                                # everything CI's checks job runs: 3 typechecks, 3 unit test suites, 2 builds
pnpm test:e2e                             # Playwright (starts both apps)
pnpm db:test                              # pgTAP tests (needs Docker + local Supabase)
```

**Before you finish any change, run `pnpm check` and make sure it passes.** A change that passes its own tests but breaks typecheck elsewhere still breaks CI for everyone.

## Code conventions

- TypeScript strict everywhere. Match the style, naming and comment density of the surrounding code.
- Validation rules live in `packages/shared/src/schemas` (zod) so the frontend and backend reject the same input. The database re-checks them; it is the final authority.
- Backend routes follow the existing pattern in `apps/backend/src/routes`: `requireAuth` → zod-validate params/body → `getServiceClient().rpc(...)` → map Postgres errors to `ApplicationError` (`42501` → 403, `23514` → 422 with field errors). The service-role client bypasses RLS, so a route must re-check that the caller may access the resource.
- Frontend services (`features/*/services`) are the only place that calls `supabase` or `apiFetch`. Components and pages call services, never the client directly.
- Event and booking times are entered in Singapore local time; use the shared helpers (e.g. `singaporeLocalToIso`) rather than hand-rolled date maths.

## Testing instructions

### Unit tests (Vitest)

Unit tests must pass the same way on every laptop and in CI, without any `.env` file and without network access.

- **Never use the real Supabase client or the real backend in a unit test.** Mock at the service boundary:
  ```ts
  vi.mock("@/features/venues/services/venue-bookings", () => ({
    listVenueBookingsForEvent: vi.fn().mockResolvedValue([]),
  }));
  ```
- **For a page or component test, mock every service the page _and its child components_ import.** A child component that imports an unmocked service pulls in the real client.
- When a test keeps a real module via `importOriginal` (e.g. for a pure helper), also add `vi.mock("@/lib/supabase-client", () => ({ supabase: {} }))`.
- When testing a service itself, mock `@/lib/supabase-client` and use the chainable fake from `src/test/supabase-mock.ts` (`queryBuilder({ data, error })`).
- Never rely on `.env.local`. `apps/frontend/vitest.config.ts` gives tests fixed fake Supabase settings, so a forgotten mock fails with a connection error instead of reaching the shared database.
- **Anything that appears after a click, a load or a timer** (Base UI selects, menus, popovers, fetched data, success messages) must be queried with `await screen.findBy…`. Use `getBy…` only for content already on screen. Don't add per-call timeouts; `src/test/setup.ts` sets a global 3s limit.
- No real clock: use fixed future dates such as `2099-01-01T10:00`, or `vi.setSystemTime(...)`.
- Each test sets up its own data (`beforeEach` resets mocks); tests must not depend on order or on rows in any database.
- Put tests next to the code: `foo.ts` → `foo.test.ts`, `Bar.tsx` → `Bar.test.tsx`. Mirror the patterns in existing tests (e.g. `routes/EventDetailPage.test.tsx`, `features/venues/services/venues.test.ts`).
- Backend route tests use Supertest against `createApp()` with `getServiceClient` mocked (see `event-decisions.route.test.ts`). Cover 401 without a token, 422 for invalid input before any RPC call, and each SQLSTATE mapping.
- Assert outcomes (payload sent, text shown, navigation), not just that code ran. Tag acceptance criteria in comments, e.g. `// AC03: ...`.

### Database tests (pgTAP)

- Wrap every file in `begin; ... select * from finish(); rollback;` so nothing persists.
- Create test users with `@example.test` emails inside the transaction. Cover each role that should and should not have access.

### End-to-end tests (Playwright)

- Only for journeys that need the real browser, backend and database together. Validation rules and edge cases belong in unit tests.
- Specs ending in `-shared.spec.ts` write to the hosted project and only run when credential variables are set. Anything they create must be deleted in a `finally` block.

## Supabase and data safety

There is **one shared hosted Supabase project** (`qqyvnlznjgupmxfqutff`) used by the whole team. Treat it as production.

- **Never run `supabase db push`, `migration repair`, or any write, drop or alter against the hosted database** unless the user explicitly asks in that turn.
- Never create users, profiles or other records in the hosted project from scripts or tests. Verification scripts that sign up accounts have left fake coordinators in the assignment pool before.
- Never edit a migration that has already been applied; Supabase tracks migrations by filename and will skip it. Add a new migration (`pnpm exec supabase migration new <name>`) using `create or replace`.
- After a schema change, regenerate `packages/shared/src/types/database.types.ts` (`pnpm db:types`), fix any type errors it causes in the same change, and run `pnpm check`.
- The service-role key is backend-only. Frontend code uses the publishable key plus RLS.
- Never commit `.env`, `.env.local`, keys or passwords, including in tests, screenshots or docs.
