# PB-02 shared event-request form contract

## Ownership boundary

`EventRequestForm` is the single reusable form for PB-02 and PB-03. PB-02 owns draft persistence and draft-mode validation. PB-03 may supply a stricter submission schema and submission action, but must extend this component rather than create a second event-request form.

PB-02 does not submit an event, assign a coordinator, begin review, or send notifications.

## Acceptance criteria

- AC01 — An authenticated Event Organiser can create a draft after entering an event name between 3 and 160 characters. All other submission fields may remain incomplete.
- AC02 — Any optional value that is entered must be valid. Expected attendance must be a positive whole number, and an entered end time must be later than the entered start time.
- AC03 — Saving the draft retains all accepted event, venue, accessibility, facility, equipment, technical and registration information entered by the organiser.
- AC04 — A saved draft has status `Draft`, appears with a visible Draft label in the organiser’s event list, and does not enter the coordinator assignment or review workflow.
- AC05 — The owning organiser can reopen and edit a draft repeatedly. Successful and unsuccessful save attempts display a clear result without discarding entered form values.
- AC06 — The owning organiser can delete a Draft request after confirming the action. Cancelling the confirmation keeps the draft, and a request that is no longer Draft cannot be deleted through this workflow.
- AC07 — Given an organiser has saved a draft, when they sign in later and reopen it, then every previously saved value is available for continued editing.
- AC08 — Given an unauthenticated user, another organiser, or a different role attempts to access the draft, when access is checked, then the operation is denied and no protected draft information is returned.

## Shared data structure

The canonical TypeScript contract is `EventRequestFormValues` in `packages/shared/src/schemas/event-request.ts`.

| Section | Fields |
| --- | --- |
| Event | Event name, purpose, description, category, expected attendance |
| Schedule | Proposed start and end time |
| Venue | Preferred location, minimum capacity, accessibility needs, room layout, facilities |
| Equipment | Equipment name, quantity, technical notes |
| Registration | Registration required, opening and closing time, capacity, waiting-list setting |

## Validation responsibility

| Mode | Behaviour |
| --- | --- |
| Draft (PB-02) | Event name is required and must contain 3–160 characters. Every optional value may be blank, but any entered number or date/time relationship must be valid. |
| Submit (PB-03) | Reuses the fields and draft rules, adds final-submission completeness rules, and changes the request from `draft` to `requested`. See `docs/requirements/pb-03-submit-event-request-contract.md`. |

Blank optional number fields remain empty strings in the form and become database `null` values. Dates become ISO timestamps only at the persistence boundary. The browser never receives or uses a Supabase service-role key.
