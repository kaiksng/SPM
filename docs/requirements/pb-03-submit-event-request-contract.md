# PB-03 submit an event request contract

## Ownership boundary

PB-03 extends `EventRequestForm` (owned jointly with PB-02 — see `docs/requirements/pb-02-event-request-form-contract.md`) with a stricter `eventSubmissionSchema` and a submission action beside Save Draft. It does not create a second event-request form.

Submission is one Postgres transaction, `public.submit_event_request`, called through `apps/backend`'s `POST /events/:eventId/submit` route rather than directly from the browser — see `docs/architecture/adr/0003-submission-through-backend.md`. The database function is authoritative; the frontend's zod schema exists only so the organiser sees every problem before a round trip (AC06).

PB-03 does not assign a coordinator (PB-04), start coordinator review (PB-05/PB-06), or change which fields may be edited once an event leaves Draft (PB-07 owns ordinary vs. significant edits). It only widens the existing draft-edit policy far enough to satisfy AC07.

## Acceptance criteria

- AC01 — The request records event name, purpose, description, proposed date, valid start and end time, and positive whole-number expected attendance.
- AC02 — The organiser records venue and accessibility needs, equipment requirements, and whether attendee registration is required where relevant. A blank optional equipment section or unchecked registration box means it is not required.
- AC03 — Preferred location, room layout, required facilities, accessibility notes, and equipment notes may be recorded where relevant.
- AC04 — After submission, the organiser can view the submission date, time, and request status.
- AC05 — Given all mandatory information is valid, when the organiser submits the request, then it is accepted, its status becomes `requested`, and it becomes available for coordinator assignment and review.
- AC06 — Given mandatory information is missing or invalid, when submission is attempted, then submission is blocked and every affected field is identified.
- AC07 — Given a Requested event has not been approved, when its organiser edits permitted information, then the changes, actor, and time are recorded for review.

## Shared data structure

`eventSubmissionSchema` in `packages/shared/src/schemas/event-request.ts` extends `eventDraftSchema` (the same `EventRequestFormValues` shape) with:

| Field | Draft (PB-02) | Submission (PB-03) |
| --- | --- | --- |
| `purpose`, `description` | optional | required |
| `expectedAttendance` | optional | required, positive whole number |
| `startsAt`, `endsAt` | optional | required, `startsAt` in the future, `endsAt` after `startsAt` |
| `venue.preferredLocation`, `venue.layoutNotes`, `venue.accessibilityNotes` | optional | at least one venue requirement is required |
| `venue.facilities` | optional | recorded when relevant |
| `equipment` | optional | each added item needs a name and positive whole-number quantity |
| `registration.required` | defaults to unchecked | checked only when attendee registration is required |

Event category, organiser-entered minimum venue capacity, registration dates,
registration capacity, and waiting-list setup are not part of the Week 4
Release 1 event-request form. Existing stored values remain backwards compatible
but are not requested from organisers in this workflow.

`public.submit_event_request` re-validates the same rules against the stored row and raises `check_violation` (`23514`) with a `detail` payload of `{field, message}[]` covering every failing field, matching the zod issue paths so the frontend highlights fields identically whether the failure was local or server-side.

## Dropdown update (1 October 2026)

The submission form presents Purpose and Preferred Location as single-select choices and Required Facilities as a multi-select of venue amenities. These retain the existing `purpose`, `preferredLocation`, and `facilities` storage fields. A blank facilities selection remains valid where other venue requirements are supplied. Previously saved free-text values remain selectable when a request is reopened; submission validation and history keep the stored values rather than silently rewriting them.

## Validation responsibility

| Layer | Responsibility |
| --- | --- |
| Browser (`eventSubmissionSchema`) | Immediate feedback without a round trip; the same field paths as `eventDraftSchema` plus the submission rules above. |
| Backend route (`event-submissions.route.ts`) | Authenticates the caller and maps the database's SQLSTATE to an HTTP status; performs no business validation of its own. |
| Database (`submit_event_request`) | Authoritative. Re-checks role, ownership, draft status, and every AC01/AC02 rule inside the same transaction that flips the status, so a submission can never be accepted with incomplete data even if the browser or route were bypassed. |
