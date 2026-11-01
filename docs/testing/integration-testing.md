# Integration testing

Integration coverage is organised by **business workflow** (see the [coverage matrix](integration-coverage-matrix.md)). Done so far: the **intake-to-planning** (SPM-3, 6, 7, 80, 84, 15) **venue-booking-lifecycle** (SPM-72, 24, 25, 26, 78, 75, 85, 82) and **safety-and-confirmation** (SPM-33, 89, 90, 11, 35, 79, 12) **change-cancel-complete** (SPM-38, 39, 45, 46, 76) and **equipment-arrangements** (SPM-27, 28, 31, 32) **registration** (SPM-40, 41, 42, 43, 44) and **role-access matrix** (SPM-15, 16, 17, 48, 49, 77) workflows plus earlier per-story suites for SPM-2, 13, 14, 86, 87, 20, 21, 88, 19, 83 and 81. All planned workflows are built.

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
and open its details. The test step should report **18 files / 115 tests passed**
for the current story suites plus the intake-to-planning, venue-booking-lifecycle and safety-and-confirmation workflows. A green job verifies this suite on GitHub;
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

## SPM-21 execution record — 2026-10-31

Two local integration cases cover matching filters, optional filters, result details, occupied and closed venues, active requests, changed search dates without event mutation, validation, and another coordinator being denied. The full integration suite passed 40/40 with 8/8 safety checks and integration typechecking passed. `pnpm check` initially failed in the existing `venue-management.route.test.ts` 42501 mapping case with `socket hang up` while the integration suite was also running; a subsequent standalone `pnpm check` passed. The cause is not confirmed. The user subsequently requested a local commit after reviewing the mitigation. UI-only requirements remain assigned to existing component tests.

The affected backend test file passed five standalone runs. An attempted diagnostic using Vitest `--repeatEach` failed before running tests because this Vitest version does not support that option; the five runs used the normal command instead. The original socket error remains unexplained.

Follow-up verification: 12 further runs of the affected backend file passed during disposable integration startup; a second complete integration run passed 40/40. The original socket hang-up did not recur, but its cause remains unconfirmed.

Socket mitigation: the venue-management route test now starts one loopback server and waits for it before making requests, then closes it after the file. Its 23 cases passed, as did 12 repeated runs while `pnpm check` and integration setup ran concurrently. The full `pnpm check` and 40/40 integration suite passed concurrently afterward. This reduces server start/stop churn; the original one-off error did not recur, so its precise cause and whether this change prevents it cannot be proven.

## SPM-88 execution record — 2026-10-31

Two integration cases exercise automatic flagging after buffer changes, staff rechecks, booking and block conflict details, status preservation, clearing, staff notification and coordinator denial. The full integration suite passed 42/42 twice from clean disposable stacks, with 8/8 safety checks each time. Integration typechecking and `pnpm check` passed. An initial integration typecheck reported two TypeScript errors in the newly written test; these were corrected before the successful checks. No tests were skipped. The earlier intermittent backend socket error and its mitigation remain documented under SPM-21.

## SPM-19 partial execution record — 2026-10-31

Eight integration cases cover non-overlapping block creation and removal, current/past history, Singapore time conversion, required-field and date validation, and non-staff denial. The full integration suite passed 50/50 with 8/8 safety checks; integration typechecking passed. The source scenario requiring rejection of blocks that overlap existing bookings conflicts with SPM-83 AC2 requiring saving and disruption flags. That scenario is not implemented and the story is not counted complete pending a product decision.

`pnpm check` also passed. The partial SPM-19 work is left uncommitted pending the overlap requirement decision.

## SPM-19 overlap follow-up — 2026-10-31

At the user’s request, an additional application integration case covers the current SPM-83 overlap behaviour: staff preview pending and approved bookings, save the block, create disruption records and notifications, and retain booking statuses. Existing VenueBlocksPage component tests cover the confirmation UI. The full suite passed 51/51 and the 8/8 target-safety checks passed. The original Jira export still has the conflicting reject-overlap scenario; the user confirmed Jira was updated; the amended export has not been supplied.

The follow-up `pnpm check` passed. No tests were skipped.

The user confirmed the SPM-19 Jira wording was updated to reflect the save-and-flag behaviour; the available CSV predates that update.

## SPM-83 execution record — 2026-10-31

Two integration cases cover preview and saving blocks affecting pending/approved bookings and an active hold, buffered overlap, persistent disruptions, booking and existing approval-history preservation, coordinator notifications and permissions, readiness, rejection of a new request in an otherwise-free blocked period, replacement-request state, shortening/removal, clearance notifications, and the pending-safety-check transition and notification. Existing UI tests cover the confirmation screen; lifecycle states and historical approval data are prepared fixtures and do not prove their separate business workflows. Three clean integration runs passed 53/53 as assertions were expanded; the final run passed 8/8 safety checks and integration typecheck. `pnpm check` passed. No tests were skipped.

## Workflow 1: intake-to-planning

The [suite](../../tests/integration/intake-to-planning.workflow.integration.test.ts) has 7 tests over one event's early life, using real services, the real Express routes, local Auth and the database: a submitted request queues for the Lead and cannot be reviewed until assigned; a full clarification round (locked fields, response, blocked decision, resolution); approval with its decision record and organiser notice; rejection requiring a reason plus a refused venue request on the rejected event (with a planning-event control); reassignment (closed/open history, immediate access hand-over, open clarification kept, three notifications, refusals); coordinator lists and the Lead's active-work counts. Shared setup is in `tests/integration/support/workflow.ts`; `fixture.venue()` creates and removes venues.

Requirement decision (2026-11-01, user): SPM-6 AC5/AC6/S04 are reworded so a decision is blocked while a clarification is open and unanswered, and deciding on an answered one closes it, matching `decide_event_request` and its pgTAP test. The suite asserts this for approve and reject; Jira still needs the wording change (the user's action). Finding: (2) Any coordinator can read any event by design (`can_view_event`); only actions are restricted to the assigned coordinator. UI-only: queue tabs, "No unassigned events", oversight filters, wording.

### Execution record 2026-11-01

Integration typecheck passed. Full run **12 files / 69 tests passed** (6 new + 63 existing), safety guards 8/8, no dedicated containers left, `pnpm check` passed (shared 450, backend 187, frontend 1,613). Two earlier failed runs were test errors, corrected before the final pass: an assumed coordinator read restriction that the product deliberately does not have, and an incorrect notification count (assignment notifications accumulate across the first assignment and the handover). The first run used the shell's Node 22; later runs used Node 24.20.0.

## Workflow 2: venue-booking-lifecycle

The [suite](../../tests/integration/venue-booking-lifecycle.workflow.integration.test.ts) has 8 tests, using real services, the real Express routes, local Auth and the database. Events reach Planning through the real submit, assign and approve flow.

1. Suggestions list only matching venues (an oversized event gets none); a request makes a Pending booking with the event's period, headcount and main flag, and tells Venue Staff.
2. Overlapping Pending and blocked requests are refused with no record; an exactly-touching period is allowed; two coordinators requesting one free slot at once leave exactly one commitment.
3. Only Venue Staff decide; rejection needs a reason and releases the period; decision, actor and time are stored and the coordinator is notified.
4. Holds: staff-only, expiry must be future and before the period; an On Hold period refuses another request; expiring-soon notice; only the requesting coordinator confirms; a past-due hold is released for another event and stays in history.
5. Multi-venue (agreed 12 ACs): additional venues, period inside the event, capacity below headcount refused, same venue overlapping refused but a later period allowed, independent decisions, main moves, withdraw and cancel need a reason and release only that booking.
6. Replacement approved: only the assigned coordinator, only a Disrupted booking, one pending replacement, linked, the original cancelled, the other booking untouched.
7. Replacement rejected or withdrawn: the original stays Disrupted and another try is allowed.
8. Actor rules: organiser and other coordinators refused for request, withdraw and replace; non-staff refused for decisions; each with an assigned-coordinator success control.

Setup-only steps, not tested actions: staff blocks (SPM-83 covers flagging), and one test moves a hold's deadline into the past because a real wait is impossible. Not asserted: the SPM-33 "designate another main before Ready" rule (workflow 4), whole-event cancellation (workflow 5), and a Pending/On Hold booking overlapping an active block, which cannot be approved (known limit). The Jira export lists 14 SPM-85 ACs; the agreed 12 are used. UI-only: calendar colours, dialogs, wording.

### Execution record 2026-11-01

Integration typecheck passed. Full run **13 files / 77 tests passed**, twice on clean disposable stacks (8 new + 69 existing), safety guards 8/8, `pnpm check` passed (shared 450, backend 187, frontend 1,613), no dedicated containers left. No failures, skips or flakes were observed in this increment. Node 24.20.0.

## Workflow 4: safety-and-confirmation

The [suite](../../tests/integration/safety-and-confirmation.workflow.integration.test.ts) has 6 tests with real services, routes, local Auth and the database. Events reach Planning through the real flow; venue bookings are requested by the coordinator and approved by staff.

1. Readiness is derived: no main venue, unticked safety checks, a Pending booking, an active hold (Needs Review) and an unreserved equipment requirement each block; a stored check cannot be set by hand; submission is refused with the outstanding items and the status unchanged; non-assigned actors are refused.
2. Submission: round 1, coordinator, time and a snapshot of venues/period/attendance; Safety Officers notified; transition recorded; while pending, withdraw, main change, safety-check edits and a second submission are refused with a full snapshot unchanged.
3. Approval: only a Safety Officer; review facts (capacity against headcount, the coordinator's checks); read-only for the officer; reviewer, note and time stored; Confirmed; coordinator and organiser notified; a second approval is refused.
4. Request changes: reason and at least one flag required; only the chosen booking is flagged; back to Planning; not Ready until the coordinator resolves the flag; resubmission is round 2; history keeps both rounds.
5. Reject: reason required; every booking flagged; back to Planning; recorded and notified.
6. Confirmed event: edit forms and raw updates by organiser and coordinator change nothing and write no field-change audit; an invalid transition is refused; the lifecycle is recorded in order; the owner lists every booking with its own period and another organiser sees none.

Observations, not defects: request changes notifies only the coordinator (the organiser is told on approve and reject; SPM-89 AC5 does not require more). After a decision the Safety Officer can no longer read the event, its status history or submission rounds (RLS admits them only while Pending Safety Check), so those are read as the coordinator; the officer's own history is the safety review history RPC. Equipment reservation is workflow 3 and the disruption return to Planning is covered by the SPM-83 suite. SPM-12's exact-eight-status AC (legacy enum values remain) is not asserted. UI-only: readiness badges, the change-request message, timeline display, review highlighting.

### Execution record 2026-11-01

Integration typecheck passed. Full run **14 files / 83 tests passed**, twice on clean disposable stacks (6 new + 77 existing), safety guards 8/8, `pnpm check` passed (shared 450, backend 187, frontend 1,613), no containers left. Earlier runs had test-assumption failures, fixed before the final pass: wrong submission result shape, an assumed outstanding-item code for unreserved equipment, reads attempted as the Safety Officer after the event left Pending Safety Check, and an assumed organiser notification on request changes. No product code was changed. Node 24.20.0.

### Update 2026-11-01: SPM-6 decision asserted

After the requirement decision above, the intake-to-planning suite gained one test (7 total): a decision on an open, unanswered clarification is blocked with nothing changed, and a decision (approve or reject) on an answered one succeeds and closes the round, recording the coordinator who closed it. Full run **14 files / 84 tests passed** twice, safety guards 8/8, `pnpm check` passed (shared 450, backend 187, frontend 1,613), no containers left. No product code changed.

## Workflow 5: change-cancel-complete

The [suite](../../tests/integration/change-cancel-complete.workflow.integration.test.ts) has 7 tests with real services, routes, local Auth and the database. Planning and Confirmed events come from the real flows of workflows 1, 2 and 4 (`confirmedEvent` in `support/workflow.ts`).

1. Change request lifecycle: organiser-only submit, one pending at a time, coordinator notified, event unchanged while pending, withdraw rules, decide rules (approval needs notes, rejection a reason), organiser notified of each decision.
2. Applying a date change on a Confirmed event: only the assigned coordinator; every active booking flagged Needs Review (the clash marked Conflict), none cancelled; Venue Staff notified per booking; back to Planning with history and Safety Officer notice; not Ready; the request becomes Implemented and cannot be applied twice.
3. A change that does not affect arrangements leaves the event Confirmed and flags nothing.
4. Unassigned event: the Lead is notified and can decide but not apply; after assignment the new coordinator is notified and applies it.
5. Cancel: assigned coordinator only, reason required, pending and on-hold bookings released with actor/reason/time and kept readable, organiser/coordinator/Venue Staff notified, later booking and change requests refused; a Pending Safety Check cancellation notifies the Safety Officer; a Rejected event cannot be cancelled.
6. Complete: not Confirmed, wrong coordinator and too early are refused (earliest time returned); completion records the coordinator in the history; bookings, safety decisions and decisions stay readable; cancel, clarification, booking, edit, assignment, change request and draft save are all refused with nothing changed.
7. Notification centre: own notifications only, newest first, unread count, mark one and mark all, another user sees none and cannot mark them.

Setup-only steps: the completed event's schedule is moved into the past with an administrative update while the event is still in Planning (a Confirmed event is locked even against direct SQL); a competing booking creates the date clash. Deferred by agreement: releasing equipment reservations and notifying registered attendees on cancellation, and the released-reservation label on completion (SPM-46 AC6), are asserted in workflows 3 and 6, which build that setup. UI-only: the bell badge, wording and click-through. A non-assigned coordinator's completion attempt returns a generic message because only check violations carry their text.

### Execution record 2026-11-01

Integration typecheck passed. Full run **15 files / 91 tests passed** twice on clean disposable stacks (7 new + 84 existing), safety guards 8/8, `pnpm check` passed (shared 450, backend 187, frontend 1,613), no containers left. Earlier runs had test-assumption failures, fixed before the final pass: apply responses carry more fields than assumed, the completion error for a non-assigned coordinator is generic, and the schedule shift had to happen in Planning rather than on a Confirmed event. No product code changed. Node 24.20.0.

## Workflow 3: equipment-arrangements

The [suite](../../tests/integration/equipment-arrangements.workflow.integration.test.ts) has 4 tests with real services, local Auth and the database. Technical Support creates the catalogue items and units through the real inventory service (`fixture.trackEquipment` removes them and their units); coordinators record and request equipment through the real services.

1. Request and reserve: a non-assigned coordinator cannot change or request another coordinator's equipment; an unrequested item cannot be reserved; Technical Support is notified of requests; availability shows the stock; the reservation records event, item, quantity, period, staff member and time; the reserved quantity is no longer available to another event; an over-reservation is refused with "Only 1 available" and nothing changes; two Technical Support users reserving the last units for different events at once leave exactly one reservation and the stock is never exceeded.
2. Retired units are not stock: availability and the reservable quantity drop, and a reservation above what is left is refused.
3. Status and history: the arrangement status follows the reservation (Not started, In progress, Arranged); each step is recorded with actor, time and status in order; the coordinator can read status and history but cannot reserve, change or release; the hand-set status function no longer exists; changing the requirement after reserving marks the reservation for re-check (status Issue, readiness lists it); release returns the stock and is recorded, and reserving again restores Arranged.
4. Carried from workflow 5: cancelling an event releases its reservation (released, reason not "completed", Technical Support notified, stock returned); completing an event with fully reserved equipment releases it with the reason "The event was completed" (SPM-46 AC6).

Requirement decision (2026-11-01): SPM-30 (equipment unavailability) and the hand-set parts of SPM-28 (reporting issues, notes, AC3/AC5, the manual-update refusal of AC6) were deliberately removed by migration `202610310009`. The suite follows the current code. Jira needs: SPM-30 retired; SPM-31's AC about SPM-30 unavailability deleted; SPM-28 reworded (status follows the reservation, history is automatic, nothing is set by hand). These are the user's actions.

UI-only: tables, badges, shortage layout. Not covered here: SPM-27 AC2-AC8 field validation (unit and pgTAP), and reservation release by Technical Support as a separate story-level action beyond the status test.

### Execution record 2026-11-01

Integration typecheck passed. Full run **16 files / 95 tests passed** twice on clean disposable stacks (4 new + 91 existing), safety guards 8/8, `pnpm check` passed (shared 450, backend 187, frontend 1,613), no containers left. The first run of the new suite passed, so no test corrections were needed. No product code changed. Node 24.20.0.

## Workflow 6: registration

The [suite](../../tests/integration/registration.workflow.integration.test.ts) has 3 tests with real services, routes, local Auth and the database. Confirmed events come from the real flow (`confirmedEvent`); the organiser sets the registration rules in Planning through a hook before the safety check.

1. Rules, registering and roster: an invalid window is refused and nothing is saved; only the owner can configure; attendees cannot register before the event is Confirmed; settings lock after the safety check; registering inside the window works and a duplicate creates nothing; before opening and after closing are refused with the count unchanged; the organiser, assigned coordinator and Lead see the roster (name, status, time) and a second organiser, another coordinator and an attendee see none.
2. Last place and waiting list: joining the list before the event is full is refused; two attendees registering for the last place at once leave exactly one registered and the other refused as full; the loser joins at position 1; the winner and a repeat joiner are refused.
3. Withdraw, promote, leave, cancel: A registered, B/C/D at list positions 1/2/3; A's withdrawal (with reason) sets Withdrawn, promotes B automatically with a notice and moves C and D up; C leaving moves D to position 1; A registering again is evaluated afresh (full, so A joins the list); cancelling notifies only the registered attendee.

Clock note: registration must be open now, so the window is built from the real current time (opened a day ago, closing in 30 days) while the events stay in 2099. The window is moved with an administrative update to test "not yet open" and "closed" (setup only; it worked, so no gap). Observation: organiser `registration_update` notices are for registration setup and a smaller venue being approved, not for each withdrawal; SPM-43 does not require one. Not covered here: SPM-40 AC8 capacity against the main venue (pgTAP `lock_event_registration_capacity`), SPM-49 attendee access (role-access matrix), UI display (registration panel, remaining places, My Registrations).

### Execution record 2026-11-01

Integration typecheck passed. Full run **17 files / 98 tests passed** twice on clean disposable stacks (3 new + 95 existing), safety guards 8/8, no containers left. `pnpm check` passed on rerun (shared 450, backend 187, frontend 1,613). One earlier run failed in the existing `venue-booking-hold.route.test.ts` (a 5-second timeout in a mocked route test, run straight after a heavy integration run); the file then passed 3 of 3 alone and the full check passed, so it is a recurring timing flake, not caused by this increment. A first run of the new suite had one wrong assumption (an organiser notice on withdrawal), corrected before the final pass. No product code changed. Node 24.20.0.

### Update 2026-11-01: backend route test flake fixed

The recurring backend route-test flakes (a 5-second timeout in `venue-booking-hold.route.test.ts`, earlier `socket hang up` and `Parse Error`) came from `request(createApp())`, which builds an app and opens a new server for every request; under load that churn exceeded the limits. All 11 route test files that still used it now share one loopback server per file through `apps/backend/src/test/app-server.ts` (`useAppServer`), the approach `venue-management.route.test.ts` already used. Verified: backend tests passed 3 of 3 alone and 6 of 6 while the Docker integration suite was running, the integration suite passed (17 files / 98 tests), and `pnpm check` passed. The earlier flakes were never reproduced on demand, so this removes the identified cause and cannot be proven to remove every possible cause.

## Workflow 7: role-access matrix

The [suite](../../tests/integration/role-access-matrix.workflow.integration.test.ts) has 17 tests, all passing against the real database, backend and Auth. State is built once (a Planning event holding a booking, an equipment requirement, a clarification, a decision and a change request, plus a Confirmed event) and nine synthetic actors read it.

- **Reading:** eight roles (owner organiser, other organiser, assigned and other coordinator, Lead, Venue Staff, Technical Support, Safety Officer) each see exactly the records their role allows, across event details, venue bookings, decisions, status history, equipment requirements, clarifications, change requests and safety review details; mismatches are listed by name. The owner and assigned coordinator are the positive controls. An attendee sees the published information of a Confirmed event and nothing of an event that is not Confirmed yet.
- **Acting:** each of the other eight roles is refused, with the stored snapshot unchanged, and then the authorised role succeeds, for: assigning a coordinator (Lead), deciding an event (assigned coordinator), deciding a venue booking (Venue Staff), creating equipment (Technical Support) and deciding a safety check (Safety Officer).
- **Expectations:** current `can_view_event` rules for the owner, coordinators, Lead, Venue Staff and Technical Support; the change history is narrower (organiser, assigned coordinator, Lead, SPM-12 AC02); other organisers, the Safety Officer outside Pending Safety Check, and attendees follow the acceptance criteria.

**Product gap found and fixed (SPM-49 AC2/AC3):** this suite found that once an event was Confirmed, the policies built on `can_view_event` admitted an attendee, so an attendee calling the API directly could read the full event row, bookings, decisions and safety review details. Migration `202611010013_restrict_attendee_event_access.sql` removed the attendee branch from `can_view_event` and gave attendees a single published-fields read path (`attendee_visible_events`). The test that asserts the criterion is now an ordinary passing test, and `restrict_attendee_event_access.test.sql` covers it in pgTAP.

Not covered here: landing page per role (SPM-13 suite), the coordinator's own list (intake-to-planning), the message and redirect for denied pages (UI), and registering for an event as a non-attendee role.

### Execution record 2026-11-01

Integration typecheck passed. Full run **18 files / 114 tests passed plus 1 expected failure** twice on clean disposable stacks (17 new + 98 existing), safety guards 8/8, `pnpm check` passed (shared 450, backend 187, frontend 1,613), no containers left. The first run had two wrong expectations of mine: status history is limited to the organiser, assigned coordinator and Lead (not every coordinator, Venue Staff or Technical Support). The attendee gap was a genuine finding, not a test error. Node 24.20.0.

After migration `202611010013` closed that gap, the suite passes **18 files / 115 tests with no expected failure**, pgTAP passes 74 files / 1,512 checks, and `pnpm check` passes (shared 453, backend 187, frontend 1,627).
