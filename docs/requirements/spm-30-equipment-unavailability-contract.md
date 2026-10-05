# SPM-30: Record equipment as unavailable — contract

## Story

"As a Technical Support Staff member, I want to record equipment as unavailable for a period, so that unavailable equipment is excluded from event planning."

- AC01 — Technical Support Staff can record equipment type, positive whole-number quantity, unavailable start and end time, and reason.
- AC02 — The end time must be later than the start time.
- AC03 — Overlapping unavailability records and reservations are visible before saving.
- AC04 — Active unavailable quantities reduce the quantity shown by SPM-31.
- AC05 — Technical Support Staff can end or remove an unavailability record when the equipment returns to service.
- AC06 — Current and past unavailability records retain the actor, reason, and time.

## Database (`202610060001_spm30_equipment_unavailability.sql`)

- **Table.** `equipment_unavailability` stores a catalogue item, quantity (> 0), reason (1–500 characters), `starts_at`/`ends_at` (end after start), and `recorded_by`/`recorded_at`. Two optional pairs record later actions: `ended_by`/`ended_at` and `removed_by`/`removed_at`.
- **Who can read and write.** Only Technical Support Staff can read the table. There are no write policies, so every write goes through the three security-definer functions below, which check the role themselves. This follows SPM-19's venue blocks. Nothing is ever edited in place or deleted (AC06).
- **The three functions:**
  - `record_equipment_unavailability(item, quantity, reason, starts_at, ends_at)` covers AC01 and AC02.
  - `end_equipment_unavailability(id)` is for equipment that returns early (AC05). It is allowed only while the record is in progress, and sets `ended_at = now()`. The original `ends_at` is kept.
  - `remove_equipment_unavailability(id)` is for a record that should never have counted (AC05). It is allowed for upcoming or in-progress records, and keeps the row.
- **"Active" (AC04):** a record that hasn't been removed, counted over `[starts_at, coalesce(ended_at, ends_at))`. A partial GiST index covers this, ready for SPM-31.
- **Names.** A `profiles` policy lets Technical Support Staff see the names of whoever recorded, ended or removed a record.
- **Stock.** Each item's total stock is `equipment_items.total_quantity`, which Technical Support Staff could already update through RLS.

## Frontend

The `/equipment` page shows `TechnicalSupportEquipment` (`apps/frontend/src/features/equipment`) to Technical Support Staff. Other roles keep the existing view. The page has three sections:

- **Catalogue and stock.** Each item's total can be edited in place, next to the number of units out of service right now.
- **Record form.** Once an item and a valid period are chosen, it lists overlapping unavailability records and Pending/Confirmed reservations before saving (AC03).
- **Unavailability records.** Every record, with its status (Upcoming, In progress, Returned early, Past, Removed), who/when for each action, and End now/Remove with a confirmation step.

The status rules and the half-open overlap rule are in `packages/shared/src/domain/equipment-unavailability.ts`. The form schema is in `packages/shared/src/schemas/equipment-unavailability.ts`.

## Not yet done

- **AC04** is met once SPM-31 (the availability check) is built. That check will subtract active records using `effectiveUnavailabilityEnd`.
- **Reservations** show in the overlap list, but nothing creates them yet. That's a later story.
- **Quantity versus stock.** A record may exceed the item's current stock; the story doesn't ask for that check.

## Tests

- `supabase/tests/database/spm30_equipment_unavailability.test.sql` (24 checks).
- `packages/shared/src/domain/equipment-unavailability.test.ts`.
- `apps/frontend/src/routes/EquipmentPage.test.tsx`.
