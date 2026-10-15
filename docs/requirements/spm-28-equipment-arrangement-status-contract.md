# SPM-28: Update equipment arrangement status and notes — contract

## Story

"As a Technical Support Staff member, I want to update the arrangement status and add a note on an event's equipment requirement as I work on it, so that other staff can see how far sourcing and arranging has progressed."

Checklist criteria:

- AC01 — Each equipment requirement has an arrangement status, chosen from a fixed list: Not started, In progress, Arranged, Issue.
- AC02 — A requirement nobody has updated by hand shows an automatic status: Arranged if reserved in full, In progress if partly reserved, Issue if its reservation needs re-checking or it can't be reserved in full (short, unavailable, not in the catalogue, retired, or the event is awaiting its safety check), otherwise Not started. *(Revised 15 October 2026; originally "shows the starting status: Not started".)*
- AC03 — Each update records who made it, when, and the status and note it set. Earlier entries are kept and can be viewed in order.

Scenario criteria:

- AC04 — Given I am Technical Support Staff viewing a recorded equipment requirement, when I change its arrangement status and/or note and save, then the new status and note are shown on that requirement.
- AC05 — Given a requirement already has an arrangement status, when I update it again, then the change is saved and added to its history. Status can be changed any number of times, including back to an earlier value.
- AC06 — Given I am not Technical Support Staff, when I try to update a requirement's arrangement status or note, then the update is refused and nothing changes.

Decisions agreed at refinement (15 October 2026):

- Until staff set a status by hand, it is worked out automatically (AC02) and marked "(automatic)". Once staff set one, theirs is shown from then on, so they can still record what the system can't see (for example, Reserved but a unit is faulty: Issue). Automatic statuses are not stored and add no history; only staff updates do.
- The note is optional for every status, up to 1,000 characters (the same limit as technical requirements).
- Saving with nothing changed adds no history entry.
- Visible to Technical Support Staff and the event's assigned coordinator.
- Updates are allowed for Requested, Planning, Pending Safety Check and Confirmed events.

## Database (`202610150001_spm28_equipment_arrangement_status.sql`)

- **`equipment_arrangement_updates`** is an append-only log: `requirement_id`, `event_id`, `status`, `note`, `updated_by`, `updated_at`.
  - The current arrangement is the latest row. No row means the automatic status, worked out in the frontend (AC02). The rows are the history (AC03).
  - It's a separate table, not columns on `event_equipment_requirements`, for two reasons. Organisers can write that table directly ("equipment editable by organiser"). And its `notes` column already holds the coordinator's technical requirements.
  - Removing a requirement removes its arrangement history (`on delete cascade`). The removal itself stays in `event_equipment_changes`.
- **`update_equipment_arrangement(requirement, status, note)`** is the only write path. The table has no write policy (AC06). The function:
  - refuses anyone but Technical Support Staff (`42501`);
  - refuses a status outside the list, a note over 1,000 characters, a missing requirement, or an event that isn't Requested, Planning, Pending Safety Check or Confirmed (`23514`);
  - trims the note, and stores an empty one as null;
  - locks the requirement, so two staff saving at once are compared in turn;
  - returns the new entry's id, or null when nothing changed.
- **Read access:** Technical Support Staff, or the event's assigned coordinator. A matching `profiles` policy lets Technical Support Staff read the names of people in the history, the same shape as the equipment-changes policy.

## Shared (`packages/shared`)

- `domain/equipment-arrangement.ts`: the statuses, their labels, the starting status, and `currentEquipmentArrangement` (latest entry, history oldest first).
- `schemas/equipment-arrangement.ts`: the form schema, mirroring the database.
- `domain/equipment-reservation.ts`: `isEquipmentReservationAllowed` mirrors the reservation functions' event-status rule (Requested, Planning, Confirmed).

## Frontend

- **Technical Support Staff → `/equipment` → Event requests.**
  - Items are sorted into tabs by arrangement status: Not started (opens first), In progress, Arranged, Issue, each with a count. An item moves to its new tab when its status changes.
  - Each requested item shows an "Arrangement: …" badge, the latest note, "Updated by [name] · [time]", and a collapsible arrangement history.
  - **Update arrangement** opens a pop-up with the status and note, starting from the current values. "No changes to save." appears when nothing changed. A refusal from the database appears in the pop-up.
  - Pending Safety Check events are now listed too. Their Reserve, Change, Re-check and Release actions are hidden with "Reservations can't be changed while the event awaits its safety check", because the reservation functions refuse them.
- **Event → Planning → Equipment** (`/events/:id/equipment`). The assigned coordinator sees each item's arrangement status, note and history, read-only. Other viewers don't see the status, rather than seeing every item as Not started.
- Service: `features/equipment/services/equipment-arrangement-status.ts`. It calls Supabase directly. No backend route is needed, because no notification is created.

## Tests

- `supabase/tests/database/spm28_equipment_arrangement_status.test.sql` (28 checks: permissions, direct-write refusal, status and note rules, no-change saves, repeat updates and history order, event statuses, read access by role).
- `packages/shared/src/domain/equipment-arrangement.test.ts`, `schemas/equipment-arrangement.test.ts`, `domain/equipment-reservation.test.ts`.
- `apps/frontend/src/features/equipment/services/equipment-arrangement-status.test.ts`.
- `apps/frontend/src/routes/EquipmentPage.test.tsx` ("arrangement status (SPM-28)").
- `apps/frontend/src/routes/EventEquipmentPage.test.tsx` ("SPM-28 arrangement status").

## Known limits

- Migration `202610150001` has not been applied to the shared environment. The database owner applies it.
- `database.types.ts` was updated with the new table and function, matching `supabase gen types --local`. Regenerate it from the linked project once the migration is applied.
- No notifications are sent when a status changes (not in this story).
- Reservations for Pending Safety Check events are still refused. That rule belongs to the reservation story.
- The coordinator's Equipment page can't see stock levels (the availability check is Technical Support Staff only), so there an unreserved catalogue item shows Not started even if it is short. Technical Support Staff see Issue for it.
