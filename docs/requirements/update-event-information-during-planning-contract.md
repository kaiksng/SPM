# Update event information during planning — contract

## Story

"As an Event Coordinator, I want to update event information during planning, so that changes are captured accurately and all teams stay aligned on the latest requirements."

- AC01 — A field update on a Planning event records the previous value, new value, actor, and timestamp.
- AC02 — Multiple fields changed in one save are logged as separate audit entries.
- AC03 — A save with no actual changes creates no audit log entry.

## What this actually adds

Almost nothing new on the audit side. AC01–AC03 are already fully satisfied by PB-07's existing triggers (`docs/requirements/pb-07-event-field-history-contract.md`, `supabase/migrations/202609150003_pb07_event_field_history.sql`) — `record_event_field_change`, `record_event_venue_change`, and `record_event_registration_change` already log one row per changed scalar column, only when it actually changed, stamped with `changed_by` and `changed_at`, regardless of who performed the `UPDATE`.

What was actually missing was a **write path**: nothing in the codebase let a coordinator update an event's fields at all — `save_event_draft` is organiser-only and restricted to `draft`/`requested` status, and the RLS policies backing it never granted a coordinator write access to the requirement tables. This story adds exactly that write path — `public.update_event_as_coordinator` (`supabase/migrations/202609150006_coordinator_update_planning_event.sql`) — which the existing triggers then log automatically, the same way they already log an organiser's edits.

## Field lock (202609150008)

Overview (event name, purpose, description, event type, expected attendance), schedule (start/end time), and every registration field are **locked once the event is Planning** — for both roles. The organiser needed no change (already fully locked out of a Planning event by `save_event_draft`'s own status gate). For the coordinator, `update_event_as_coordinator` now compares each of those fields against what is currently stored and rejects the call if any of them would actually change, the same compare-and-reject pattern `save_event_draft` already uses for a clarification's `permitted_fields` (`202609140003`). Only **venue requirements** and **equipment** remain editable by the coordinator at this stage.

On the frontend, `CoordinatorEventEditPage` locks the same sections by passing a fixed `permittedFields={["venue", "equipment"]}` into `EventRequestForm` — reusing the exact mechanism already built for the clarification-lock UI, not a second one.

## Authorisation and scope

- Restricted to the event's **assigned coordinator** — the same rule already established for `decide_event_request` and `request_event_clarification`.
- Only reachable while the event is in **Planning** status; a `check_violation` is raised otherwise. This is a coordinator write path for planning-stage adjustments, not a substitute for `save_event_draft`'s draft/requested editing flow.
- Field-level validation mirrors `save_event_draft` exactly (title length, attendance/capacity format, date ordering, equipment shape) — it is `security definer` (needed since a coordinator has no RLS write access to the requirement tables otherwise) with its own internal authorisation checks in place of relying on RLS.
- *(Equipment superseded by `record-event-equipment-requirements-contract.md`: it is now written in place by id through `save_event_equipment_requirements`, and audited in `event_equipment_changes`.)* Facilities and equipment are written via the same delete-then-reinsert approach `save_event_draft` already uses, and are **not** field-level audited — the same scope exclusion PB-07 already made, for the same reason (no stable per-item identity to diff against; a naive trigger would just log churn on every save).

## Where it's used

- `apps/frontend/src/features/event-requests/services/coordinator-event-edit.ts` — `loadEventForCoordinatorEdit` (a Planning-scoped read, reusing `EventRequestFormValues`' shape) and `updateEventAsCoordinator` (calls the RPC with the same payload shape `toEventDraftPayload` already produces for `save_event_draft`).
- `apps/frontend/src/routes/CoordinatorEventEditPage.tsx` — reuses `EventRequestForm` as-is (the fields being edited are identical to the organiser's own form); route `events/:eventId/coordinator-edit`.
- `EventDetailPage.tsx` shows an "Edit event" link to the coordinator only once the event is Planning.
- The edit immediately becomes visible via PB-07's own `RequirementHistoryPanel` on the same event detail page, with no additional wiring — it reads the same `event_field_changes` table.
