# Reserve equipment for an event — contract

## Story

"As a Technical Support Staff member, I want to reserve available equipment for an event, so that it is not simultaneously committed elsewhere."

- AC1 — Given sufficient equipment is available for the required period, when Technical Support Staff reserve it, then the event, equipment type, quantity, period, staff member and timestamp are recorded and visible in the event's arrangements.
- AC2 — Given the requested quantity exceeds availability, when reservation is attempted, then the reservation is rejected and the available quantity is shown.
- AC3 — Given a reservation succeeds, when another overlapping availability check occurs, then the reserved quantity is no longer counted as available.
- AC4 — Given an event's date, time or equipment requirement changes through an approved change request, when the affected arrangements are reviewed, then the existing reservation is marked for re-checking rather than silently left unchanged.
- AC5 — Given a reservation is released or changed, when the update succeeds, then the quantity returns to the available pool where applicable and the action is recorded.

## Database (`202610061002_reserve_equipment.sql`)

- **Reservations.**
  - Each reservation belongs to one event equipment requirement (`equipment_reservations.requirement_id`) and covers that requirement's period. An event can have only one live (`approved`) reservation per requirement.
  - New columns: `needs_recheck`, `recheck_reason`, `released_at`, `released_by`.
  - Who reserved it and when are `decided_by` and `decided_at`.
- **History.** `equipment_reservation_events` records every reservation, change, re-check, release and re-check flag, with details, actor and time (AC5). It's readable by anyone who can see the reservation.
- **One shared availability calculation.** `equipment_commitment_peaks` is the single place availability is worked out. Both the SPM-31 check and the reservation functions use it.
  - It counts approved reservations plus active SPM-30 outages at the busiest moment within the period.
  - A requirement's own reservation is excluded from its own figure, so a reserved item doesn't report itself as short.
- **Staff functions** (Technical Support Staff only; each locks the item so two people can't take the last units):
  - **`reserve_equipment(requirement, quantity)`** — up to the requested quantity, for Requested/Planning/Confirmed events, catalogue items only. If there aren't enough it rejects with "Only N available for this period" (AC2). It records `approved` with the staff member and time (AC1).
  - **`change_equipment_reservation(reservation, quantity)`** — changes the quantity and realigns the period with the request's current one. With the same quantity it's a re-check, which clears the flag if the reservation still fits. Logged as `changed` or `rechecked` (AC5).
  - **`release_equipment_reservation(reservation, reason)`** — sets the status to `cancelled`, which no longer counts as a commitment, so the units return to the pool (AC3/AC5). Logged with the reason.
- **Re-check flags (AC4).** Triggers mark live reservations "needs re-check", with a reason, when:
  - the event's start or end time changes;
  - the reserved requirement's item, quantity or period changes;
  - the requirement is removed.

  **No change-request approval flow exists yet.** `event_change_requests` isn't used anywhere. So the flag is raised on the change itself, by whatever path it happens. That also covers coordinator edits during Planning, and will cover change requests once that flow is built.
- **Existing reservation permissions are unchanged,** including the coordinator insert policy from `202610050005`.

## Frontend

- **Technical Support Staff → `/equipment` → Event requests.** Each requested item shows its availability and, if reserved, "Reserved N of M by [name] · [time]". Actions:
  - **Reserve** opens a pop-up with the quantity, defaulting to the lesser of what was requested and what's available. A rejection appears in the pop-up (AC2).
  - **Change** adjusts the quantity.
  - **Release** asks for an optional reason.
  - **Re-check** appears on a flagged reservation, with the flag's reason shown.

  Each event card shows "N of M reserved"; flagged items count as needing attention.

  On a reserved item, the "reserved" and "available" figures include its own reservation (e.g. 100 in service, 7 reserved here: "93 available · 7 reserved for this event"). The database leaves the item's own reservation out, so its status and "Short by" stay correct; the page adds it back for display (15 October 2026).
- **Event → Planning → Equipment** (`/events/:id/equipment`). The sidebar step that used to say "Coming soon" now opens the event's arrangements (AC1):
  - each requested item marked Reserved, Needs re-check (with the reason) or Not reserved yet;
  - for reservations, who reserved how many, for which period and when;
  - each reservation's history;
  - released reservations, kept on record.

## Tests

- `supabase/tests/database/reserve_equipment.test.sql` (30 checks).
- `packages/shared/src/domain/equipment-reservation.test.ts`.
- `apps/frontend/src/routes/EquipmentPage.test.tsx` ("reserving equipment").
- `apps/frontend/src/routes/EventEquipmentPage.test.tsx`.
- `EventDetailPage.test.tsx` was updated for the Equipment sidebar link.

## Reservations whose request was removed (15 October 2026)

When a coordinator removes an equipment request that has a live reservation, the reservation is flagged "The equipment request was removed" (AC4) but still holds its units. It has no request row, so it used to be missing from the Technical Support Staff Event requests page, and nobody there could release it.

- The Event requests page now also loads live reservations with no request on open events (`listOrphanedReservations` in `equipment-availability.ts`), including events with no requests left.
- They appear under the **Issue** tab on the event's card as "[item] × N reserved", with the flag, "Still held from the available pool until released", and a **Release** button (with an optional reason). Change and Re-check aren't offered, because `change_equipment_reservation` refuses a reservation without a request.
- **Release is allowed for Pending Safety Check events** too, for these and ordinary reservations. `release_equipment_reservation` has no event-status rule; only reserving, changing and re-checking are limited to Requested, Planning and Confirmed.
- No database change. Tests: `reserve_equipment.test.sql` (releasing a removed-request reservation; release allowed and change refused during Pending Safety Check), `equipment-availability.test.ts`, `request-groups.test.ts`, `EquipmentPage.test.tsx`.

## Reservations released when the event ends (15 October 2026)

Bug: cancelling, completing or rejecting an event left its approved reservations in place. They still counted against stock for every other event, and the ended event no longer appeared on the Event requests page, so nobody could release them.

- `202610150002_release_reservations_when_event_ends.sql` adds a trigger: when an event becomes Cancelled, Completed or Rejected, each live reservation is released (status `cancelled`, `released_at`, flag cleared) and logged in `equipment_reservation_events` as `released` with the reason "The event was cancelled / completed / rejected" (AC5). The actor is whoever made the change, or none when it came through the backend's service client.
- The migration also releases, once, any reservations already stuck on events that ended before the fix.
- Tests: `release_reservations_when_event_ends.test.sql` (10 checks).
