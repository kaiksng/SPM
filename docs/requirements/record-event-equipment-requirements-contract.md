# Record equipment requirements for an event — contract

## Story

"As an Event Coordinator, I want to record the equipment required for an event I am assigned to, so that Technical Support Staff can assess and arrange the required resources."

Checklist criteria:

- AC01 — An equipment requirement records the associated event, the equipment item, the quantity, the required period (start and end), and any technical requirements.
- AC02 — The equipment item is chosen from a dropdown of catalogue items grouped by category (e.g. Audio). Free-text equipment is not accepted from organisers or coordinators.
- AC03 — Equipment item, quantity, period start and period end are mandatory whenever an item is added. Technical requirements are optional. Saving a draft event still only requires the event name.
- AC04 — Quantity must be a positive whole number.
- AC05 — The required period's end must be after its start. The period covers setup through cleanup, so it may start before the event starts and end after the event ends.
- AC06 — If mandatory information is missing or invalid, nothing is saved and each affected field is identified.
- AC07 — When an organiser or coordinator adds, changes or removes an equipment requirement, a history entry records who did it, when, and what changed. Earlier entries are kept.
- AC08 — Equipment history is visible only to the assigned coordinator and to Technical Support Staff.
- AC09 — Only Technical Support Staff can maintain the equipment catalogue. Organisers and coordinators can only select from it.
- AC10 — The same catalogue item may appear more than once on an event, for example with different periods.

Scenario criteria:

- AC11 — Given I am the assigned coordinator and the event is in Planning, when I save valid equipment requirements, then they are saved and a history entry is recorded.
- AC12 — Given I am not the assigned coordinator for the event, when I try to save its equipment requirements, then the save is refused and nothing changes.
- AC13 — Given an event has an older free-text equipment entry, when it is opened for editing, then the entry is shown as legacy and can be kept or replaced with a catalogue item, and any new entry must come from the catalogue.

Out of scope: a catalogue-management screen for Technical Support Staff, stock/availability checking, `equipment_reservations`, and Technical Support Staff reviewing and arranging equipment.

## Data model (`202610050004_record_event_equipment_requirements.sql`)

- **Catalogue.** Reuses `equipment_items` (created in `202609220005`, already readable by every signed-in user and writable only by Technical Support Staff — AC09). The migration seeds a starter list in five categories (Audio, Visual, Computing, Lighting, Connectivity) with `total_quantity = 0` until real stock figures are supplied.
- **Requirements.** `event_equipment_requirements` gains `equipment_item_id`, `required_from` and `required_until`. A check constraint allows exactly two shapes: a catalogue row (all three set) or a legacy row (all three null). `required_until > required_from`; technical requirements (the existing `notes` column) are capped at 1,000 characters for new writes.
- **Guard trigger** (`guard_event_equipment_requirement`, before insert/update). Applies to every write path, including the organiser's direct RLS access: a new row must reference the catalogue, a legacy row may only stay as it is or become a catalogue row, and `equipment_name` is always overwritten with the catalogue item's name so existing readers of that column keep working.
- **History.** `event_equipment_changes` stores one row per add/change/remove with a jsonb snapshot of the previous and new values, `changed_by` and `changed_at`. It is written only by the security-definer trigger `record_event_equipment_change`; an update that changes nothing logs nothing. Read access (AC08): Technical Support Staff, or the event's assigned coordinator. A matching `profiles` policy lets Technical Support Staff read the names of people who appear in that history, mirroring the venue-staff policy from `202609270003`.

## Write path

`save_event_equipment_requirements(p_event_id, p_equipment)` is the single place equipment is validated and written. Both `save_event_draft` (organiser) and `update_event_as_coordinator` (assigned coordinator, Planning only) now call it instead of deleting and re-inserting every row. It is security invoker, so it never grants more than the caller already has.

Payload items: `{ id?, equipmentItemId?, quantity, requiredFrom, requiredUntil, notes? }`.

- With an `id`, that row is updated in place, but only if something actually changed.
- Without an `id`, a new row is added.
- Any existing row whose `id` is not sent is removed.
- An `id` with no `equipmentItemId` keeps a legacy row exactly as it is (AC13).

The function returns how many rows were added, changed or removed. `save_event_draft` uses that count for the clarification lock: if equipment is locked and the count is above zero, it raises, which rolls back the write and its history. The old up-front comparison of free-text lists has been removed.

**This reverses PB-07's scope exclusion for equipment.** That exclusion existed because delete-then-reinsert gave rows no stable identity, so a trigger would have logged churn on every save. Rows now keep their ids, so a plain row trigger records real history. Facilities are still delete-then-reinsert and still not audited.

## Frontend

- `packages/shared/src/schemas/event-request.ts`:
  - The equipment row is now `{ id, equipmentItemId, legacyName, quantity, requiredFrom, requiredUntil, notes }`.
  - Validation mirrors the database and reports each problem against its own field (AC06).
  - `isLegacyEquipmentRequirement` identifies a kept free-text row. `toEventDraftPayload` sends such a row by `id` alone.
- `packages/shared/src/domain/equipment-history.ts` holds the snapshot shape, labels, and changed-field diffing used by the history view.
- `apps/frontend/src/features/event-requests/services/equipment.ts` covers:
  - loading the catalogue,
  - mapping saved rows to form values (`toEquipmentRequirements`, `toEquipmentFormValues`),
  - reading history (`loadEquipmentHistory`).
- `EventRequestForm`, used by organisers and by `CoordinatorEventEditPage`:
  - a catalogue dropdown grouped by category,
  - quantity, required from/until (a new row starts with the event's schedule), and technical requirements,
  - legacy rows shown read-only, with a "Replace with catalogue equipment" option.
- `EventHistoryPage` shows an **Equipment** section to everyone except the organiser.
- Both save services now show the database's `check_violation` message instead of a generic error, so a server-side rejection still names the affected item.

## Known gap

Technical Support Staff can read equipment history in the database, but the role gate only gives them `/equipment`. They cannot open `/events/:id/history`, so there is not yet a screen where they see it. That belongs with the "Technical Support Staff assess and arrange equipment" view, which is out of scope here.

## Tests

- `supabase/tests/database/record_event_equipment_requirements.test.sql` covers AC01–AC13 at the database level.
- `clarification_requirement_buckets.test.sql` and `pb02_event_drafts.test.sql` were updated to the catalogue payload.
- `packages/shared/src/schemas/event-request.test.ts` and `packages/shared/src/domain/equipment-history.test.ts` cover the shared validation, payload and history helpers.
- `event-request-form.test.tsx`, `EventHistoryPage.test.tsx` and `EventDetailPage.test.tsx` cover the UI.
