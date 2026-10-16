-- An organiser can cancel a Requested event before the Event Coordinator Lead
-- has assigned it a coordinator.
--
-- 202610050003 stopped submission from assigning a coordinator, so a
-- Requested event can now have none, and relaxed
-- events_assignment_after_submission to allow that for 'draft' and
-- 'requested' only. cancel_event_request (202609270002) moves a Requested
-- event to 'cancelled', which the constraint still required a coordinator
-- for — so cancelling an unassigned request failed with a check violation.
--
-- 'cancelled' is terminal (no transition leaves it), so allowing it without a
-- coordinator cannot let an unassigned event reach any active status. Every
-- other status past Requested still requires one.
alter table public.events
  drop constraint events_assignment_after_submission;
alter table public.events
  add constraint events_assignment_after_submission
  check (status in ('draft', 'requested', 'cancelled') or assigned_coordinator_id is not null)
  not valid;
alter table public.events
  validate constraint events_assignment_after_submission;
