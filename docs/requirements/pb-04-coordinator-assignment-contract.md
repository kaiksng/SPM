# PB-04 automatic coordinator assignment contract

## Ownership boundary

PB-04 owns coordinator assignment only. It runs as the last step inside `public.submit_event_request` (PB-03), in the same transaction as the status change to `requested`, so a submission can never succeed without an assignment (AC01). It does not build a coordinator queue or review UI (PB-05/PB-06), and it does not support reassignment — that is explicitly out of Release 1 scope (AC05) and is enforced, not just omitted.

## Acceptance criteria

- AC01 — Every successfully submitted event is automatically assigned to exactly one Event Coordinator.
- AC02 — The assigned coordinator is visible to the organiser and internal coordinators.
- AC03 — A second coordinator cannot simultaneously become the accountable owner.
- AC04 — The assigned coordinator receives a notification.
- AC05 — Reassignment is outside Release 1 scope.

## Selection rule

The Event Coordinator with the fewest currently active events (status in `requested`, `submitted`, `clarification_requested`, `under_review`, or `approved`) is chosen; ties are broken by profile id, ascending, so the result is deterministic. See `docs/architecture/adr/0003-submission-through-backend.md` for why least-loaded was chosen over round-robin or random selection.

The rule is written twice on purpose:

| Where | Role |
| --- | --- |
| `public.assign_event_coordinator` (`supabase/migrations/202609140001_pb04_coordinator_assignment.sql`) | Authoritative. Uses `FOR UPDATE SKIP LOCKED` so two concurrent submissions cannot select the same coordinator (AC01/AC03). |
| `selectLeastLoadedCoordinator` (`packages/shared/src/domain/coordinator-assignment.ts`) | A pure mirror for unit testing the rule (including the tie-break) without a database. It is not called by any code path — it exists so the rule's logic has fast, deterministic test coverage alongside the slower pgTAP suite. |

## Enforcement of AC01 and AC03

- `events_assignment_after_submission` — a `CHECK` constraint: an event may only be outside `draft` status if `assigned_coordinator_id is not null`. Enforced on every write, not only through the submission path.
- `events_prevent_coordinator_reassignment` — a `BEFORE UPDATE OF assigned_coordinator_id` trigger that raises `insufficient_privilege` (`42501`) if a non-null assignment would change. This is what makes AC05 a guarantee rather than a UI omission, and it is the mechanism that ultimately backs AC03.
- If no Event Coordinator exists at all, `assign_event_coordinator` raises `check_violation` (`23514`) with the message `No Event Coordinator is available to take this request`, and — because assignment runs before the status-changing `UPDATE` inside `submit_event_request` — the event is left exactly as it was (Draft), never partially transitioned.

## Visibility (AC02)

No new policy is needed: `events visible to participants` (via `can_view_event`) already lets any Event Coordinator see any event, and `assigned_coordinator_id` was already a selectable column. PB-04 only adds the frontend display — `EventsPage.tsx` shows the assigned coordinator's name on the organiser's card via a `profiles` join keyed by the `events_assigned_coordinator_id_fkey` relationship.
