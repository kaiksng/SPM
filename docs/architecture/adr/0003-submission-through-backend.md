# ADR 0003: Submit an event request through the backend, with least-loaded coordinator assignment

- Status: Accepted for the submission route; the assignment part was superseded (see below)

> **Amendment (Week 7 customer change):** the customer introduced the Event Coordinator Lead role. Newly submitted requests are no longer auto-assigned to the least-loaded coordinator; they enter an unassigned queue and the Lead assigns and reassigns coordinators (migrations `202610050001`-`202610050005`, `202609280001`). The decision to submit through one Postgres transaction behind a backend route still stands. The least-loaded rule and the "reassignment not supported" consequence below describe the original Release 1 design and are kept for history.

- Date: 2026-09-13

## Decision

PB-03's submission and PB-04's coordinator assignment happen in one Postgres transaction (`public.submit_event_request`), called through `apps/backend`'s `POST /events/:eventId/submit` route rather than directly from the browser via `supabase-js`. Coordinator assignment picks the Event Coordinator with the fewest currently active events (least-loaded), breaking ties by id for a deterministic, testable result.

## Why

PB-04 AC01 requires that **every** successfully submitted event is assigned to exactly one coordinator, and AC03 requires that a second coordinator can never simultaneously become the accountable owner. Only a single transaction can guarantee both under concurrent submissions: the row lock taken while validating the submission (`... for update`) serialises a double submit, and `for update skip locked` on the coordinator search prevents two concurrent submissions from selecting the same least-loaded coordinator. Doing assignment as a separate step (a second API call, a queued job) would leave a window where a submitted event has no coordinator, or where a race could double-assign.

Routing through `apps/backend` — rather than calling the RPC directly from the browser — follows `apps/backend/src/README.md`: the service-role client is how a `security definer` write (a `notifications` insert, since that table has no insert RLS policy) gets authorized without weakening the client's own Row Level Security. The route itself performs no business validation; it authenticates the caller and translates the function's `SQLSTATE` into an HTTP response, so `packages/shared`'s `eventSubmissionSchema` (for immediate browser feedback) and the SQL function (as the authoritative check) are the only two places the submission rules are written down.

Least-loaded assignment was chosen over round-robin or random selection because it is fair under an uneven backlog, deterministic enough to unit test (`packages/shared/src/domain/coordinator-assignment.ts` mirrors the SQL `order by count(...), id` rule), and easy to justify to the customer and in the Week 13 Q&A without hidden state (round-robin needs a stored pointer; random is not explainable case by case).

## Consequences

A submission is slightly higher latency than a direct Supabase write (one extra network hop through Express), which is acceptable at Release 1 scale and is the same trade-off ADR 0001 already accepts for privileged operations. Reassignment is deliberately not supported in Release 1 (PB-04 AC05): `assigned_coordinator_id` is enforced immutable once set, by a trigger, not just by omission in the UI, so a future story that wants reassignment must explicitly change this decision rather than merely add a button.
