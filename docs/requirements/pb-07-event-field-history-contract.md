# PB-07 requirements and change history contract

## Ownership boundary

PB-07 owns the field-level previous/new value history that PB-03 (`202609130003`) and the clarification work (`202609140003`) deliberately deferred: neither organiser edits to a Requested event nor clarification responses log a diff themselves, on the understanding that this story would add it once. It does not add any new way to *edit* an event — it only observes edits made through the existing `save_event_draft` path and reports them. It does not track `event_required_facilities` or `event_equipment_requirements` (see "Scope exclusion" below).

## Acceptance criteria

- AC01 — An authorised coordinator can view the latest requirements for any event in Planning status.
- AC02 — The change history displays each prior update with previous value, new value, actor, and timestamp, in sequence.
- AC03 — An unauthorised user attempting to view the event's details or history is denied access.
- AC04 — Only an authorised coordinator can access this view.

"Latest requirements" (the first half of AC01) already existed before this story — `loadEventDetail`/`EventDetailPage` read the live `events` and requirement rows directly, for both the organiser and the assigned coordinator. This story adds the second half: the change history.

## "Authorised coordinator" (AC03/AC04)

The story itself flags this as a recurring definition gap. It is resolved here the same way the two other coordinator-only actions in this codebase already resolved it — `decide_event_request` and `request_event_clarification` (`202609140003`, `202609150002`) — rather than inventing a third rule:

- **Authorised** = the event's `assigned_coordinator_id`.
- This is narrower than `can_view_event`, which lets *any* `event_coordinator`-role user see the event's own fields. An unassigned coordinator can open the event (via the broader policy) but sees no change history — they are not accountable for it.
- The organiser, who can also view the event via `can_view_event`, is likewise not "authorised" for this specific view — they can see their own event, but not the internal review trail.

Enforcement is entirely in Postgres RLS (`event_field_changes`' only policy, "assigned coordinator views field change history"), not in the frontend: an unauthorised caller's `select` returns zero rows rather than an error, the same behaviour `event_status_history` already has. `RequirementHistoryPanel` additionally only renders for `role === "coordinator"` and `eventStatus === "planning"`, matching the story's given/when scenario, but that is a display choice, not the authorisation boundary.

## What is captured, and how (AC02)

`event_field_changes` (`supabase/migrations/202609150003_pb07_event_field_history.sql`) stores one row per changed field: `field_name`, `previous_value`, `new_value`, `changed_by`, `changed_at`. Three `AFTER UPDATE` trigger functions populate it:

| Trigger | Table | Fields watched |
| --- | --- | --- |
| `record_event_field_change` | `events` | `title`, `purpose`, `description`, `event_type`, `expected_attendance`, `starts_at`, `ends_at` |
| `record_event_venue_change` | `event_venue_requirements` | `preferred_location`, `minimum_capacity`, `accessibility_notes`, `layout_notes` |
| `record_event_registration_change` | `event_registration_requirements` | `registration_required`, `registration_opens_at`, `registration_closes_at`, `attendee_capacity`, `waitlist_enabled` |

Each trigger compares `OLD` and `NEW` per column with `is distinct from` and inserts a row only for columns that actually changed — so a `save_event_draft` call that only touches the title logs exactly one row, not one per watched column. Triggers fire on `UPDATE` only, not `INSERT`: a freshly created draft has no prior value to diff against, so the very first save is not itself "a change."

Non-obvious detail: `now()` is fixed for the whole transaction in Postgres, so several fields changed in one `save_event_draft` call can share an identical `changed_at`. Ordering by `changed_at` alone cannot reliably preserve "in sequence" (AC02) in that case, so both the frontend query (`loadEventFieldHistory`) and the pgTAP test order by `(changed_at, id)` — `id` is a strictly increasing identity column that reflects true insertion order.

## Scope exclusion: facilities and equipment

> **Update:** equipment is now tracked. See `record-event-equipment-requirements-contract.md`. Equipment rows keep stable ids, and changes are logged to their own table, `event_equipment_changes`. Facilities remain excluded for the reason below.

`event_required_facilities` and `event_equipment_requirements` are not tracked. `save_event_draft` rewrites both by deleting every row for the event and re-inserting the submitted list on **every** save (`202609120001`), regardless of whether the list actually changed. A naive insert/delete trigger on those tables would log a spurious "removed X / added X" pair on every single save, which is noise, not history. Diffing them meaningfully needs a set comparison (what was actually added vs. removed) that this story does not ask for; left to whichever future story needs it.

## Where it's read

`apps/frontend/src/features/event-requests/services/field-history.ts` (`loadEventFieldHistory`) reads `event_field_changes` directly via the Supabase client, protected entirely by RLS — the same "reads go straight to Supabase" pattern `loadEventDetail` already uses, since this is a read with no privileged/service-role step. `RequirementHistoryPanel` (`apps/frontend/src/features/event-requests/components/requirement-history-panel.tsx`) renders it on `EventDetailPage`, formatting date-like and boolean-like values via `packages/shared/src/domain/event-field-history.ts`'s field metadata (kept in step with the database `CHECK` constraint on `event_field_changes.field_name`).
