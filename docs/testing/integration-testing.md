# Integration testing

This is the first increment of project-wide application integration testing:
the dedicated harness and **SPM-2 only**. The [coverage matrix](integration-coverage-matrix.md)
tracks all 57 non-retired stories against Jira export (6). Later stories remain
planned and need their own walkthrough and implementation instruction.

## What these tests prove

Week 9 slides 19–25 and the supplied `test_topup_integration.py` keep the
collaborating application components real, control external boundaries,
start with known data, and assert persisted outcomes. The same principle here is:

```text
real draft service → shared validation/serialization → Supabase client
    → local Auth / PostgREST → Postgres RPC / RLS / triggers / related tables
```

The database is disposable PostgreSQL 17, matching the repository config.
There is no SQLite substitute, mocked RPC, fake auth token or browser in this
pilot. Administrative access creates synthetic fixtures and independently
reads stored state; tested operations use the real application client signed
in as the relevant actor. No production application module was changed.

Existing unit/component tests isolate application behaviour. Existing pgTAP
tests integrate database functions, tables, triggers and RLS but do not run
the application's serializers, loaders or HTTP clients. Browser tests remain
responsible for complete user journeys. These layers complement each other.

## Running safely

Use Node 24, pnpm 11 and Docker. Run from this worktree:

```sh
pnpm install
pnpm typecheck:integration
pnpm test:integration:safety
pnpm test:integration:db
pnpm test:integration
pnpm check
```

- `test:integration` creates the stack, resets its database to the current
  migrations, runs the SPM-2 tests, checks fixture cleanup, then removes its
  containers and volumes. A nonzero test/setup/cleanup result fails the command.
- `test:integration:db` performs the same isolated startup/reset, then runs the
  existing pgTAP suite **before any application fixtures**. Do not substitute
  the ordinary development-stack `db:test` command here.
- `test:integration:safety` tests destination guards without Docker or network.
- `pnpm check` keeps its existing fast, Docker-independent meaning. No CI jobs
  have been changed. Integration typechecking is an explicit additional check.

The project identifier is `connectsphere-integration-<worktree-path-hash>`.
The runtime directory `.integration-runtime/` is ignored and generated from
current migrations/tests and an isolated config. It contains no copied
application dotenv files, hosted linkage or development seed files.

API port **55321**, Postgres **55322**, shadow port **55320** and mail capture
**55324** are reserved for the test stack. Startup refuses occupied ports,
and an exclusive lock prevents overlapping runs in the same worktree. Separate
worktrees still share these ports and must run serially. The existing
`connectsphere` development project uses different container names and ports.
Local Storage starts because existing venue/document migrations depend on its
schema; the SPM-2 pilot does not claim file-upload coverage.

The runner discards inherited Supabase, Vite, Postgres and database settings.
It reads credentials from its own stack into child-process memory, validates
the exact loopback API, Postgres port/database and test-project identifier,
and only then resets or runs tests. The Vitest config repeats the destination
check before loading application modules. Do not run the integration config
directly or point it at another database.

The backend URL is pinned to the reserved test port **55398**. No backend
listener is needed for SPM-2; future HTTP-route increments must add a dedicated
listener there. An accidentally invoked backend operation cannot fall back to
the normal development server on port 3001.

Tests run serially with `TZ=Asia/Singapore` and dates in 2099. Every test creates
its own synthetic `@example.test` accounts and any equipment it needs. Cleanup
signs out, removes dependent events/audit records/equipment/accounts, verifies
no fixture residue, and closes the pool. Database commits through HTTP cannot
be undone by wrapping an unrelated setup connection in a transaction.

## Cleanup failure probe

```sh
pnpm test:integration:cleanup-probe
```

This deliberately adds a test that writes a draft and throws
`INTENTIONAL_CLEANUP_PROBE`. **Exit code 1 is expected.** The successful
`Dedicated fixture cleanup verified` message and absence of the dedicated
containers/volumes demonstrate cleanup after a test failure. This probe is
opt-in and is not a skipped test in the normal suite.

Ordinary failures trigger runner teardown; SIGINT/SIGTERM also request teardown
by terminating the active command. A forced kill or
Docker outage can prevent teardown; after verifying no runner is active, use
`pnpm exec supabase --workdir .integration-runtime stop --no-backup` and remove
only `.integration-runtime/run.lock` before another run. Never use a global
Docker prune, the regular project's reset, `--linked`, or a hosted connection.

## SPM-2 evidence

The new [pilot](../../tests/integration/spm2-drafts.integration.test.ts) covers:

| AC | Integration evidence | Separate existing UI evidence |
| --- | --- | --- |
| AC1 | Name-only save and real reload | Form permits incomplete drafts |
| AC2 | Rich round-trip, Singapore UTC mapping, repeated replacement, rejected-save preservation | Reopening and displaying saved values |
| AC3 | Draft status, no submission/assignment/planning/decision/notification work | Draft label on the list |
| AC4 | Owner deletion and non-vacuous cascade checks | Confirmation precedes the delete service call |
| AC5 | No additional database test: cancellation is a UI action that sends no delete | `EventsPage.test.tsx`: cancelling deletion and dismissing with Escape |
| AC6 | Real other-organiser and anonymous read/edit/delete denial, stored owner data preserved | Protected editor and page rendering tests |

The delete cascade test first proves its child records exist. Rejected saves
check the last successful parent and child values rather than merely expecting
an error. RLS checks use actual anonymous/other-user sessions; a service-role
read is used only to independently verify unchanged data.

## Execution record — 2026-10-31

| Check | Result |
| --- | --- |
| Final SPM-2 clean run 1 | 7/7 passed; Vitest execution 2.42s, excluding stack startup/reset |
| Final SPM-2 clean run 2 | 7/7 passed; Vitest execution 2.34s, excluding stack startup/reset |
| Destination safety tests | 8/8 passed; hosted/development/malformed targets rejected before connections |
| Deliberate failure probe | Expected exit 1: 7 pilot tests passed, 1 deliberate failure; cleanup verified zero fixtures and Docker inspection found no dedicated containers/volumes |
| Dedicated fresh-database pgTAP | 67 files / 1,432 checks passed |
| Integration typecheck | Passed |
| Final `pnpm check` | Passed: shared 463, backend 185, frontend 1,540 tests; all three typechecks and both builds |
| Matrix validation | 57 unique active stories, 336 AC rows, 21 scenario rows; all evidence links resolve |

No timing flakes or skipped pilot tests were observed. The frontend production
build retains its existing warning about chunks larger than 500 kB. Browser
E2E and hosted UAT were not run; this increment adds no browser journeys or CI
configuration.

Failure-probe evidence (expected, opt-in):

```text
Dedicated fixture cleanup verified: zero accounts, events or equipment left behind.
FAIL intentional failure after a write still cleans all fixtures
Error: INTENTIONAL_CLEANUP_PROBE
Tests  1 failed | 7 passed (8)
Removing only the disposable integration containers and volumes.
```

The initial pilot run had four passes and three fixture-setup failures with
`null value in column "code" of relation "equipment_items" violates not-null constraint`:

- `reopens the latest rich values, including Singapore times and equipment`
- `replaces removed facilities and equipment on another save`
- `deletes the owner's draft and cascades its associated draft records`

The fixture was corrected to supply a unique valid equipment code. Cleanup
verified zero fixture residue even on that failed run. The corrected pilot and
both final clean runs passed; the application/schema were not changed.

The root Vite dependency is pinned to the existing lockfile's 8.2.2 test-tool
version so adding the harness does not change existing workspace resolutions.

Initial harness setup findings: TypeScript needed a root Vite dependency for
`vite/client` types; that was added. The first local stack startup failed while
applying the venue-image migration with Storage disabled; enabling local
Storage allowed all migrations and all 67 pgTAP files / 1,432 checks to pass.
No production migration was changed to accommodate the harness.
