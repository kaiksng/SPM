-- AC06: each review round's outcome, reason, reviewer and time, kept
-- end-to-end — append-only, one row per submission round (a round can be
-- decided at most once; a fresh decision always follows a fresh
-- submission). flagged_*_ids records which items were flagged on a
-- 'changes_requested' outcome (empty arrays for 'rejected', where every
-- active item is flagged instead — recorded on venue_bookings/
-- event_equipment_requirements themselves, not duplicated here).
create table public.event_safety_check_decisions (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  submission_id bigint not null references public.event_safety_check_submissions (id),
  decided_by uuid not null references public.profiles (id),
  outcome public.event_safety_check_decision_type not null,
  reason text not null check (char_length(trim(reason)) > 0),
  flagged_booking_ids uuid[] not null default '{}',
  flagged_requirement_ids uuid[] not null default '{}',
  decided_at timestamptz not null default now()
);

create unique index event_safety_check_decisions_submission_idx
  on public.event_safety_check_decisions (submission_id);
create index event_safety_check_decisions_event_idx
  on public.event_safety_check_decisions (event_id, decided_at);

alter table public.event_safety_check_decisions enable row level security;

-- No insert/update/delete policy: only decide_event_safety_check (security
-- definer) writes this table, same "RPC-only" shape as
-- event_safety_check_submissions. Safety Officers can read every decision
-- regardless of the event's current status — unlike can_view_event's
-- pending_safety_check-only grant, a decision is this role's own audit
-- record and should stay visible after the event moves on.
create policy "safety check decisions visible to the event's people and safety officers"
on public.event_safety_check_decisions
for select to authenticated using (
  exists (
    select 1 from public.events e
    where e.id = event_safety_check_decisions.event_id
      and (e.organiser_id = auth.uid() or e.assigned_coordinator_id = auth.uid())
  )
  or public.current_user_role() in ('event_coordinator_lead'::public.user_role, 'safety_officer'::public.user_role)
);
