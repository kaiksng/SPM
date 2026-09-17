# Event lifecycle status — contract

## Story

"As an authorised user, I want to see an event's current lifecycle status, so that I understand its progress and available next actions."

- AC01 — Supports Draft, Requested, Planning, Confirmed, Completed, and Rejected statuses.
- AC02 — The current status is visible to authorised users.
- AC03 — Every successful status change records the previous status, new status, actor or system action, and timestamp.
- Scenario — An invalid status transition is rejected and the current status remains unchanged.

## What already existed vs. what this adds

Almost all of AC02, AC03, and the scenario were already built, since the very first migration (`202609060001_initial_schema.sql`):

- `event_status_history` + `record_event_status_change` (an `AFTER INSERT/UPDATE OF status` trigger) already logs every transition — previous status, new status, `changed_by` (actor), `changed_at` — regardless of which RPC or caller produced it.
- `enforce_event_status_transition` (a `BEFORE UPDATE OF status` trigger, calling `event_status_transition_allowed`) already rejects an invalid transition before the row is touched, satisfying the scenario.
- `EventStatusBadge`/`StatusBadge` already display the current status on both the events list and the event detail page (AC02) — already scoped to "authorised users" by the same RLS (`can_view_event`) and `RoleGate` that already gate every event view.

What was missing:

1. **"Completed" didn't exist.** Added via its own migration (`202609170001_add_completed_status.sql`) — a new enum value needs its own transaction before anything can reference it, the same constraint `requested` and `planning` hit before it.
2. **Nothing ever reaches "Completed."** `public.complete_event` (`202609170002_lifecycle_status_management.sql`) is the write path: the assigned coordinator (or an administrator) can mark a **Confirmed** event Completed. Same shape as `update_event_as_coordinator` — its own internal authorisation and status checks, not reliant on RLS.
3. **"submitted" and "under_review" were still listed as reachable targets** despite nothing ever producing either — flagged as this story's job to retire back when PB-03 and "Approve or Reject an Event Request" first left them in place (see the history in `packages/shared/src/domain/event-status.ts`). Retiring them is what makes AC01's six-status list an accurate description of what the system actually reaches, not just a list nothing happens to contradict. `"approved"` is left exactly as those stories left it — unreachable, but retiring it isn't this story's call either, matching the same "add, don't remove an already-listed arm outside what's actually asked" policy used throughout this codebase.
4. **The status timeline was never shown anywhere.** `event_status_history` had zero UI surface before this — `EventHistoryButton`'s dialog (`event-history-dialog.tsx`) gains a new "Lifecycle" section, using the same `StatusBadge` component as everywhere else, showing every hop with its actor and timestamp.

## Where it's used

- DB: `public.event_status_transition_allowed` (recreated, retiring two targets and adding `confirmed -> completed`), `public.complete_event` (new).
- Shared: `packages/shared/src/domain/event-status.ts` — `eventStatuses`, `allowedEventStatusTransitions` kept in step with the database.
- Frontend: `status-badges.tsx` (new "completed" colour), `event-lifecycle.ts` (new service: `listEventStatusHistory`, `completeEvent`), `event-history-dialog.tsx` (new "Lifecycle" section), `EventDetailPage.tsx` ("Mark as completed" button, assigned coordinator only, Confirmed events only).
