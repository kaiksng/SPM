-- Approve is about to become a real outcome of decide_event_safety_check
-- (next migration), and its reason is optional — there's nothing to justify
-- when everything checks out. event_safety_check_decisions.reason was
-- `not null check (char_length(trim(reason)) > 0)` (202610200003), which
-- only ever had to cover Request Changes/Reject, where a reason is always
-- mandatory. Relaxed to allow null, with the same non-blank check applied
-- only when a reason is actually given.
alter table public.event_safety_check_decisions
  alter column reason drop not null;

alter table public.event_safety_check_decisions
  drop constraint event_safety_check_decisions_reason_check;

alter table public.event_safety_check_decisions
  add constraint event_safety_check_decisions_reason_check
  check (reason is null or char_length(trim(reason)) > 0);
