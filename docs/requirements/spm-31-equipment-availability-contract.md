# SPM-31: Check equipment availability — contract

## Story

"As a Technical Support Staff member, I want to check equipment availability for an event's date and time, so that I can determine whether the requested quantity can be provided."

**Scenario:** given the required suitable quantity is unavailable, when the check is completed, then the shortage is shown before reservation is attempted.

- AC01 — Availability is calculated for each requested equipment type, required characteristics, quantity, and period.
- AC02 — Confirmed overlapping reservations reduce the available quantity.
- AC03 — Quantities recorded as unavailable under SPM-30 for an overlapping period are not counted as freely available.
- AC04 — The result shows Available, Partially Available, or Unavailable and states the available quantity.
- AC05 — Unknown equipment types are identified instead of being treated as available.

## Calculation (`202610061001_spm31_equipment_availability.sql`)

`check_event_equipment_availability(p_event_ids uuid[])` can only be run by Technical Support Staff. It returns one row per `event_equipment_requirements` row.

1. **Period.** The requirement's own `required_from`–`required_until`. This covers setup through cleanup, so it can extend beyond the event's schedule.
2. **Supply.** The item's in-service units (`total_quantity`; retired units are already excluded).
3. **Commitments that reduce supply:**
   - **Approved reservations** (AC02). Pending, rejected and cancelled ones don't count.
   - **Active SPM-30 records** over `[starts_at, coalesce(ended_at, ends_at))`, excluding removed ones (AC03). A record that names units counts only those still in service, so a retired unit isn't subtracted twice.
4. **Busiest moment.** Commitments are counted at the single busiest moment inside the period, not summed across it. Two 2-unit outages on different days of a 3-day period leave `total − 2`, not `total − 4`. Only starts matter, so the load is checked at the period start and at each commitment start within it. Periods that merely touch (one ends as the other starts) don't overlap.
5. **Result.** `available = max(total − busiest load, 0)`, then:
   - `available` if it covers the requested quantity;
   - `partially_available` if it's above 0 but short;
   - `unavailable` if it's 0;
   - `unknown` for a legacy free-text row with no catalogue item (AC05).

**Required characteristics** (the requirement's technical requirements) are free text. They're returned with each result so staff can judge suitability; they aren't matched automatically, as decided at refinement. The result also includes the reserved and out-of-service quantities, for context.

## Page

The `/equipment` page for Technical Support Staff now opens on an **Event requests** tab, which shows a count of events with a shortage.

- It lists Requested, Planning and Confirmed events that have equipment requirements, soonest first.
- **Each event card:** its status, its schedule, and an overall summary ("All equipment available" or "N of M items need attention").
- **Each item on the card:** the requested quantity, the period, its technical requirements, the in service / reserved / out-of-service figures, and the result.
  - For a shortfall, it states "Short by N". That's the scenario: the shortage is visible before any reservation.
  - Unknown items say "Not in the catalogue — check manually".
- **Filters:** search by event name, and "Only events with a shortage".

Availability reloads after any stock or outage change on the page.

## Dependencies

- **Reservations.** Nothing creates `equipment_reservations` yet. AC02 is implemented and tested, but has no visible effect until the reservation story exists.
- **SPM-30.** SPM-30's AC04 ("active unavailable quantities reduce the quantity shown by SPM-31") is met by this story.

## Tests

- `supabase/tests/database/spm31_equipment_availability.test.sql` (12 checks).
- `packages/shared/src/domain/equipment-availability.test.ts`.
- `apps/frontend/src/routes/EquipmentPage.test.tsx` ("event requests (SPM-31)").
