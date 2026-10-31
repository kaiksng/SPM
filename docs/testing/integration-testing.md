# Integration testing

Application integration coverage currently includes **SPM-2 (drafts)** and
**SPM-13 (sign-in)**. The [coverage matrix](integration-coverage-matrix.md)
tracks all 57 non-retired stories against Jira export (6). The remaining 55
stories need their own coverage review, walkthrough and implementation instruction.

## What these tests prove

Week 9 slides 19–25 and the supplied `test_topup_integration.py` keep the
collaborating application components real, control external boundaries,
start with known data, and assert persisted outcomes. The same principle here is:

```text
real draft service → shared validation/serialization → Supabase client
    → local Auth / PostgREST → Postgres RPC / RLS / triggers / related tables
```

SPM-13 also exercises the real login action → local Auth → profile query →
landing-page destination, and apiFetch → Express authentication → local Auth
→ protected RPC. Actual screen navigation remains a UI assertion.

The database is disposable PostgreSQL 17, matching the repository config.
The suites keep application functions, RPCs and authentication real. Successful
sign-ins use tokens issued by local Auth. Administrative access creates synthetic fixtures and independently
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
  migrations, runs both story suites, checks fixture cleanup, then removes its
  containers and volumes. A nonzero test/setup/cleanup result fails the command.
- `test:integration:db` performs the same isolated startup/reset, then runs the
  existing pgTAP suite **before any application fixtures**. Do not substitute
  the ordinary development-stack `db:test` command here.
- `test:integration:safety` tests destination guards without Docker or network.
- `pnpm check` keeps its existing fast, Docker-independent meaning. Integration
  typechecking is an explicit additional check.

### Automatic GitHub execution

The `integration` job in `.github/workflows/ci.yml` runs on pull requests and
pushes to `main`, alongside the existing jobs. It installs locked dependencies
with Node 24/pnpm, runs `pnpm typecheck:integration`, then `pnpm test:integration`
on its own Ubuntu runner. Docker and the disposable Supabase stack are on that
runner; no hosted Supabase secrets, database deployment or real team data are
used by this job. The test runner owns setup and teardown.

After pushing the workflow change to an open PR, look for **CI / integration**
and open its details. The test step should report **2 files / 18 tests passed**
for the current SPM-2/SPM-13 coverage. A green job verifies this suite on GitHub;
it does not verify the hosted website or every story. Requiring that check
before merging is a separate repository-protection setting, not configured here.

The workflow addition is checked locally; its first GitHub execution must be
verified after the workflow commit is pushed.

The project identifier is `connectsphere-integration-<worktree-path-hash>`.
The runtime directory `.integration-runtime/` is ignored and generated from
current migrations/tests and an isolated config. It contains no copied
application dotenv files, hosted linkage or development seed files.

API port **55321**, Postgres **55322**, shadow port **55320**, mail capture
**55324** and backend **55398** are reserved for the test stack. Startup refuses occupied ports,
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

The backend URL is pinned to the reserved test port **55398**. SPM-13 starts
the real Express app there, verifies it uses the same dedicated Supabase URL
and service credentials, and closes the listener afterwards. It imports the
app factory directly, so no backend dotenv file or normal development server
is used. SPM-2 does not need the listener.

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

The following table records the original SPM-2 increment. SPM-13 results are
recorded separately below.

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

## SPM-13 evidence

The [sign-in suite](../../tests/integration/spm13-login.integration.test.ts)
adds 11 cases, keeping the real login action, Auth, profiles and backend
authentication. The shared fixture now creates users for any supported role;
SPM-2 retains its organiser convenience helper and existing seven cases.

| AC | Integration evidence | Separate UI responsibility |
| --- | --- | --- |
| AC1 | Seven independently created role accounts sign in; local Auth verifies the session's user identity; a real profile query returns the stored role; login returns the explicit expected destination | The login form navigates to that destination |
| AC2 | Wrong password and unknown email each return exactly `Invalid email or password.` with no session | The form displays the message without navigating |
| AC3 | The real protected event-submission path accepts a valid session far enough to return incomplete-draft validation; after sign-out, draft reads are denied and the same action returns 401 without changing the draft. A separate case verifies local Auth rejects an invalid bearer token | A protected page redirects to sign-in and does not render protected data |

The incomplete-draft control does not submit an event or implement SPM-3.
It prevents a broken/always-401 backend from falsely proving authentication.
These representative protected-path checks do not prove every resource's role
permissions; those remain mapped to their own stories. No login/product/schema
behaviour was changed, including the existing attendee-destination fallback
when a profile cannot be read.

### SPM-13 execution record — 2026-10-31

| Check | Result |
| --- | --- |
| Combined clean run 1 | 2 files / 18 tests passed (11 SPM-13 + 7 SPM-2); Vitest execution 5.85s, excluding stack startup/reset |
| Combined clean run 2 | 2 files / 18 tests passed; Vitest execution 5.95s, excluding stack startup/reset |
| Destination safety tests | 8/8 passed on both runs |
| Integration typecheck | Passed |
| `pnpm check` | Passed: shared 463, backend 185, frontend 1,540 tests; three typechecks and both builds |
| Cleanup | Suite residue checks passed; no dedicated test containers or volumes remain; normal local Supabase retained |
| Documentation checks | All links resolve; 57 story headings and 336 AC rows retained |

No failures, retries, flakes or skipped tests were observed in this increment.
The existing frontend chunk-size build warning remains. No separate pgTAP,
browser E2E or hosted UAT run was performed for this increment; migrations
and production application code are unchanged. The earlier SPM-2 execution
record preserves its initial fixture-setup failures.

This guide records tested behaviour. Use Git history to check the current
commit and merge status of each increment.
