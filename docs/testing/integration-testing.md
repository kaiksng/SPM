# Integration testing

Application integration coverage currently includes **SPM-2 (drafts)**,
**SPM-13 (sign-in)**, **SPM-14 (organiser ownership)** **SPM-86 (venue buffers)** **SPM-87 (buffered availability)**, **SPM-20 (availability calendar data)** and **SPM-81 (coordinator assignment)**. The [coverage matrix](integration-coverage-matrix.md)
tracks all 57 non-retired stories against Jira export (6). The remaining 50
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
  migrations, runs all story suites, checks fixture cleanup, then removes its
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
and open its details. The test step should report **7 files / 48 tests passed**
for the current SPM-2/SPM-13/SPM-14/SPM-86/SPM-87/SPM-20/SPM-81 coverage. A green job verifies this suite on GitHub;
it does not verify the hosted website or every story. Requiring that check
before merging is a separate repository-protection setting, not configured here.

The workflow addition is checked locally; its first GitHub execution must be
verified after the workflow commit is pushed.

The project identifier is `connectsphere-integration-<worktree-path-hash>`.
The runtime directory `.integration-runtime/` is ignored and generated from
current migrations/tests and an isolated config. It contains no copied
application dotenv files, hosted linkage or development seed files.

API port **15321**, Postgres **15322**, shadow port **15320**, mail capture
**15324** and backend **15398** are reserved for the test stack. Startup refuses occupied ports,
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

The backend URL is pinned to the reserved test port **15398**. SPM-13 starts
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

## SPM-14 evidence

The [organiser access suite](../../tests/integration/spm14-organiser-access.integration.test.ts)
adds 12 cases: eight lifecycle read cases and four list/action/ownership cases.
It uses real organisers, services, queries, RLS, history loaders and backend
authentication. SPM-2's existing cross-organiser draft save/delete denial is
reused as evidence rather than copied into this suite.

| AC | Integration evidence | Separate responsibility |
| --- | --- | --- |
| AC1 | Both organisers have nonempty own lists. Owner detail/requirements/history reads succeed in Draft, Requested, Planning, Pending Safety Check, Confirmed, Completed, Rejected and Cancelled | Screen rendering and navigation stay UI |
| AC2 | A non-owner cannot submit a draft, cancel a Requested event, impersonate the owner or take ownership through a direct table update. The owner's permitted actions succeed as positive controls. Owning a terminal event does not permit a draft edit | Other stories cover their specific organiser actions and lifecycle rules |
| AC3 | Spoofed list filters, direct event-id access, child requirements and field/status history queries expose no other organiser's records. Rejected reads/actions leave a full stored snapshot unchanged | UI displays the access-denial state |

All lifecycle read fixtures are created as genuine drafts with related records
and a real save generating nonempty field history. Administrative fixture setup
then follows legal status edges with database triggers enabled and a synthetic
assigned coordinator where required by the database constraint. These states
are test preparation, not proof of coordinator assignment, readiness or safety
approval workflows. The Completed fixture uses fixed past dates. Owner and
non-owner queries use real authenticated application clients; administrative
snapshots independently check records, history, notifications and audit rows.

Cancellation here is the organiser's pre-decision Requested-event withdrawal,
not the coordinator's whole-event cancellation under SPM-45. The acceptance
criteria do not grant owners unrestricted actions or bypass terminal locks.
The existing ownership and visibility rules are tested without changing them.

### SPM-14 execution record — 2026-10-31

| Check | Result |
| --- | --- |
| Corrected clean run 1 | 3 files / 30 tests passed (12 SPM-14 + 18 existing); Vitest execution 13.07s, excluding stack startup/reset |
| Corrected clean run 2 | 3 files / 30 tests passed; Vitest execution 12.42s, excluding stack startup/reset |
| Destination safety checks | 8/8 passed on each run |
| Integration typecheck | Passed |
| `pnpm check` | Passed: shared 463, backend 185, frontend 1,540 tests; three typechecks and both builds |
| Cleanup | Fixture residue checks passed; no dedicated containers/volumes remain; normal local Supabase retained |
| Documentation validation | All links resolve; 57 story headings and 336 AC rows retained |

Initial run: 25 passes and five fixture-setup failures in
`protects details, requirements and history for a ... event`, for **planning**,
**pending_safety_check**, **confirmed**, **completed** and **rejected**:

```text
new row for relation "events" violates check constraint "events_assignment_after_submission"
```

Those fixtures omitted the coordinator required for these states. Fixture
preparation was corrected to create/assign a synthetic coordinator, with the
constraint and all triggers retained. Both subsequent clean runs passed.
The initial failed run also completed its zero-residue cleanup check.
These were setup errors, not timing flakes or product defects.

No pilot tests were skipped and no timing flakes were observed. The existing
frontend chunk-size build warning remains. No production code, migration,
hosted data or GitHub workflow was changed in this increment. No separate
pgTAP/browser E2E/hosted UAT run was performed. Git history records the current
commit/merge status; the existing CI job discovers the new suite when pushed.

## SPM-86 execution record — 2026-10-31

Four integration cases cover default and changed values, reads, audit history, invalid values, and all non-venue-staff roles plus anonymous access. UI rendering remains covered separately. The full disposable suite passed 34/34 after the final access-control assertions; eight target-safety checks passed. An earlier version also passed twice (34/34). Integration typecheck and `pnpm check` passed. The initial integration command failed before setup because the shell used Node 22; rerunning with Node 24 passed. `pnpm check` produced the existing bundle-size warning. No hosted database was used.

## SPM-87 execution record — 2026-10-31

Two integration cases exercise the real availability service, local Auth and database with overlapping and exactly touching effective windows, updated buffer settings, opening/closing boundaries and closed days. Calendar appearance remains covered by VenueAvailabilityPage component tests. The integration stack ports moved to 15320–15324 and 15398 after unrelated outbound connections occupied the prior range; destination guards continue to require the exact dedicated project and loopback URLs. Two earlier startup attempts stopped before reset because ports were occupied. The prior pnpm check failed once in the existing event-completion UI test; a wait for the asynchronous call fixes that race. The full project check passed after the fix.

Final verification: integration typecheck passed; the full integration suite passed 36/36 twice on clean disposable databases, with 8/8 safety checks each time. `pnpm check` passed after the asynchronous UI assertion was corrected. No tests were skipped.

## SPM-20 execution record — 2026-10-31

Two integration cases exercise the real availability service against local Auth and Postgres. They verify an empty venue and staff/coordinator reads of pending and confirmed bookings plus an operational block, including distinct types and stored times. The coordinator case uses another coordinator’s booking and a staff positive control. Calendar date selection, rendering and available-all-day presentation are separately covered by VenueAvailabilityPage component tests; operating hours still apply. Integration typecheck passed; the clean disposable run passed 38/38 with 8/8 safety checks. An initially suspected cross-coordinator visibility issue was not reproduced.

`pnpm check` passed after the integration run. No tests were skipped.

## SPM-81 evidence

The [coordinator assignment suite](../../tests/integration/spm81-assign-coordinator.integration.test.ts)
adds 10 cases (seven scenarios; the blocked-status scenario runs once each for
Draft, Rejected, Cancelled and Completed). The Lead's real `assignEventCoordinator`
service calls `reassign_event_coordinator` through local Auth/PostgREST; results
are read back through the real Lead roster/event list, history, coordinator list
and per-recipient notification services, and independently through SQL.
Requested events are created by a real organiser save and the real submission
route, so they start genuinely unassigned.

| AC | Integration evidence | Separate responsibility |
| --- | --- | --- |
| AC01 | Lead assigns one coordinator; status stays Requested. Organiser and coordinator attempts are refused with an unchanged snapshot, then the Lead's assignment succeeds as a control | The assign control on the page |
| AC02 | Roster contains the coordinators and excludes organiser, Lead, Safety Officer and Venue Staff; assigning each of those is refused with no change | Dropdown rendering |
| AC03 | One open history entry: no previous coordinator, new coordinator, the Lead as changer, timestamp within the test's window | History display |
| AC04 | Coordinator's own list returns the event; the Lead's event data moves from unassigned to assigned | Queue filtering and tabs in `EventsPage.test.tsx` |
| AC05 | Coordinator and organiser each read one unread assignment notification in their own session; no other recipient | Bell rendering and wording |
| AC06 | Reason-less assign to another or the same coordinator is refused; stored event, history and notifications unchanged | Directing the user to reassignment |
| AC07 | Draft, Rejected, Cancelled and Completed each refused with unchanged snapshot | — |
| AC08 | Counts are 2 and 0 (Cancelled/Completed excluded) and the idle coordinator's count becomes 1 after assignment. Two independently constructed Lead clients assign concurrently: exactly one succeeds, the other is refused, one history row and notifications only for the winner and organiser; the winner is not predetermined | Count display in `assign-coordinator-dialog.test.tsx` |

Agreed interpretation: AC06 and the AC08 race refusal apply to an assignment
with no reason. A Lead who supplies a reason on an already-assigned event is
performing a valid SPM-84 reassignment, so that path is not treated as a defect.
Gap recorded, not asserted: the organiser's first-assignment notification says
the event "is now coordinated by a different Event Coordinator".

Non-draft AC07/AC08 fixtures are administrative preparation along legal status
edges with triggers and constraints enabled; they do not prove planning, safety,
cancellation or completion workflows. The concurrency case builds a second
application client and service module with `vi.resetModules()`, verifies it is
signed in as the second Lead, and signs it out in teardown.

### SPM-81 execution record — 2026-10-31

| Check | Result |
| --- | --- |
| Integration typecheck | Passed |
| First attempt | Exit 1 before setup: Docker daemon not running. No stack or fixtures created |
| Clean run 1 | 7 files / 48 tests passed (10 SPM-81 + 38 existing); 8/8 safety checks; Vitest 39.30s |
| Clean run 2 | 7 files / 48 tests passed; 8/8 safety checks; Vitest 45.76s |
| `pnpm check` | Passed: shared 463, backend 185, frontend 1,572 tests; three typechecks and both builds |
| Cleanup | Suite residue check passed; no dedicated containers left |
| Documentation validation | 57 story headings and 336 AC rows retained |

No test failures, skips or flakes. The existing frontend chunk-size build
warning remains. No production code, migration, hosted data or workflow was
changed. No separate pgTAP, browser E2E or hosted UAT run was performed.
