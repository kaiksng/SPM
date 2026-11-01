---
name: spm-integration-testing
description: "Plan, implement and verify ConnectSphere application integration tests for one business WORKFLOW (a group of related Jira stories) using the existing disposable local Supabase harness. Use for IS212 SPM integration coverage and AC traceability, not manual UAT or hosted database setup."
---

# ConnectSphere integration testing

Test real collaborating components, following Week 9's controlled-boundary
approach. Reuse the existing harness; do not build a parallel test framework.

**Test workflows, not stories.** One suite covers one business workflow that
spans several stories (for example intake-to-planning: SPM-3, 6, 7, 80, 84,
15). Do not create a file per story: that is slow, repeats setup and misses the
hand-offs between features. A case can support several stories; tag it with all
of them. Integration tests prove cross-feature hand-offs, permissions and
failure/race invariants. Validation rules, rendering and single-function SQL
rules already have unit and pgTAP tests, so do not repeat them. The workflow
list and status are in the [coverage matrix](../../../docs/testing/integration-coverage-matrix.md).

## Ground the request

1. Locate the repository with `git rev-parse --show-toplevel`. Read its
   `AGENTS.md`, applicable local overrides, and the current human's instructions.
   Read `.claude/project-knowledge.md` only if present; it is private local
   context, not a prerequisite teammates must copy or commit.
2. Obtain one workflow (its story keys) and the latest supplied Jira export
   with descriptions and acceptance criteria. If either is missing, ask one focused question.
   An export without Description cannot establish the ACs. Preserve explicit
   AC numbering; number unnumbered acceptance bullets in source order and
   retain separately labelled scenarios.
3. Read that story in the [coverage matrix](../../../docs/testing/integration-coverage-matrix.md),
   the [harness guide](../../../docs/testing/integration-testing.md), and its
   current services/routes, shared schemas, migrations and tests. Jira Done is
   not evidence of integration coverage. Matrix links identify evidence to
   inspect, not proof each AC passes.
4. Establish the current branch, destination branch and local commit/merge
   authorization. Do not assume a teammate uses `staging-kk`, Kai's worktree,
   machine paths or personal merge permissions. Preserve unrelated local work.
   Fetch and merge `origin/main` as repository instructions require, then run
   `pnpm install` with Node 24/pnpm 11. If refresh fails, disclose it and do not
   claim to have validated the latest base or automatically merge.

## Agree the story before coding

Present the workflow goal, the stories it covers, current code, ACs by theme, interactions with other
stories, contradictions/gaps with recommendations, and decisions needed.
Then give numbered business-use-case steps and wait for approval, as required
by the repository. Reuse an approval already given for this specific scope.

Separate application integration from existing unit, database and UI evidence.
Assign each AC to the layer that can prove it. Do not duplicate existing cases
just to get a new file per story. Do not change the requirements to match the
implementation, drop an unimplemented AC, or silently resolve conflicting Jira,
briefing or Week 7 requirements. Resolve the affected scope with the user.

## Use the isolated harness

- Work in the user's chosen checkout. Reuse an authorized worktree when useful;
  create or switch branches/worktrees only under that user's applicable
  authorization. A code worktree and a disposable database are separate kinds
  of isolation; the harness supplies the latter in either checkout.
- Use `pnpm test:integration` for application tests. It generates
  `.integration-runtime`, copies current migrations, resets only its dedicated
  local database, obtains local credentials in memory and tears down its stack.
  Do not replace it with a bare Vitest invocation, `db:test`, or app startup
  that reads the normal hosted dotenv files.
- Preserve the destination guards and generated project identity. Never point
  this suite at hosted Supabase, copy hosted keys, or weaken guards to make a
  run pass. An invocation of this skill does not authorize hosted writes.
- Docker is required. Fixed test ports are shared across worktrees on one
  computer: run one integration command at a time. If a port/lock conflicts,
  identify the existing run; do not kill unrelated services, reset the normal
  local database or use global Docker prune.
- Reuse [fixtures.ts](../../../tests/integration/fixtures.ts) for synthetic users,
  real sessions and tracked cleanup. It currently cleans its users, their
  events and tracked equipment; extend cleanup explicitly for new fixtures
  such as venues, blocks, units or Storage objects. Never assume it covers
  every future entity.
- Reuse [backend.ts](../../../tests/integration/backend.ts) for HTTP operations:
  it starts real `createApp()` on the test-only port with local credentials.
  Close it in teardown. Do not start the normal development backend.

## Implement meaningful cases

Use `tests/integration/<workflow>.workflow.integration.test.ts`; the config and
CI job discover the `.integration.test.ts` suffix automatically (older
`spm<key>-*.integration.test.ts` story files remain valid). Tag each case with
every story and AC it proves, for example `// SPM-7 AC2, SPM-6 AC5: ...`.
Reuse [support/workflow.ts](../../../tests/integration/support/workflow.ts)
(actors, real-route event submission, snapshot oracle, notification recipients)
and `fixture.venue()`; extend it rather than copying setup into each suite.
Prefer a few ordered business-step tests per suite over many tiny ones.

Keep the components across the tested boundary real:

- Direct operations: real frontend service/shared transformations → Supabase
  client → local Auth/PostgREST/RPC/RLS/Postgres.
- Privileged operations: real service/apiFetch → real Express authentication
  and validation → local Auth and RPC/Postgres.
- Storage features: use real local Storage plus the application's metadata
  operations; inserting SQL metadata alone does not create a real file.

Existing unit tests still mock service boundaries. In the integration suite,
do not mock the application service, authentication, RPC or database boundary
being tested. Double a genuinely external dependency only when needed and
record what that exclusion means.

Use small, independent fixtures per test, fixed dates and Singapore time.
Generated identifiers may provide uniqueness; expected outcomes must not
depend on random ordering. Prepare all schema prerequisites from current
migrations. For example, later lifecycle read fixtures need a coordinator
where the database requires one. Keep constraints/triggers enabled.
Administrative SQL is for fixture preparation and independent assertions,
not a replacement for the business action under test. Prepared lifecycle
states do not prove the real transition workflow.

Assert persisted state and returned outcomes, relevant history/notifications,
and the unchanged state after rejected actions. Give negative access tests a
successful authorized control and nonempty protected data; a broken endpoint
or empty fixture must not falsely prove denial. Distinguish authorization
errors from network/query failures. Query before deleting when testing cascade
removal. For concurrency requirements, use independent clients and assert
invariants such as one remaining place or no overlapping commitment, not a
predetermined winner. Wait for conditions instead of arbitrary sleeps.

Inspect the [intake-to-planning workflow](../../../tests/integration/intake-to-planning.workflow.integration.test.ts)
first as the model suite, then [SPM-2](../../../tests/integration/spm2-drafts.integration.test.ts) for
persistence and cleanup, [SPM-13](../../../tests/integration/spm13-login.integration.test.ts)
for real login/backend controls, and [SPM-14](../../../tests/integration/spm14-organiser-access.integration.test.ts)
for cross-user access and stored-state snapshots, when those examples exist
on the checkout. Reuse their patterns, not their story-specific expectations.

## Validate and report

Run the relevant integration suite, then the required project checks:

```sh
pnpm typecheck:integration
pnpm test:integration
pnpm check
```

The integration command already runs destination-safety tests. If database
test verification is needed, use `pnpm test:integration:db`, which resets its
dedicated database before pgTAP. Repeat a clean run when new fixtures, cleanup,
shared listeners, clock behaviour or observed failures warrant it. Do not
retry unchanged failures until green or conceal earlier failures/skips.

Fix faulty test setup when evidence supports it. For a product defect, retain
the meaningful assertion and report it; change product behaviour only when
that fix is requested or already authorized within scope. Do not silently add
schema fixes or edit an applied migration to get passing tests.

Update only the relevant coverage-matrix rows and the harness guide's current
count/evidence. Keep historical run records intact. Recalculate counts from
current evidence, not this skill's creation snapshot. Record passed/failed/
skipped cases, setup corrections and flakes, cleanup, checks not run, and
remaining UI or hosted-verification limits. Update local project knowledge if
repository rules call for it; never commit private context or credentials.

## Handoff without expanding permissions

Use the current human's explicit or standing commit/merge instructions. If
local commit/merge is authorized, do it only after scoped checks pass and no
unresolved requirements, failures, flakes or merge conflicts remain. Confirm
the destination and verify the merged checkout as appropriate. Otherwise
leave a reviewable diff. Do not transfer another developer's permission.

Pushes, PR creation, merges into `main`, deployment and hosted verification
are separate actions requiring their own authorization. Local success is not
proof of GitHub/Linux success or hosted correctness. Tell the user which
branch contains the work, its commit state, actual test counts, unresolved
items and the next human action. Stop before starting another workflow.
