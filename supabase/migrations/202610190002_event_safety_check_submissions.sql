-- SPM: each submission for the Operational Safety Check records the
-- coordinator, timestamp, and a snapshot of the venues, period, attendance
-- and equipment at that moment (AC06). Append-only, keyed by an
-- event-scoped round so a resubmission after a return to Planning starts a
-- new review round rather than overwriting the last one.
create table public.event_safety_check_submissions (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  coordinator_id uuid not null references public.profiles (id),
  round integer not null check (round > 0),
  submitted_at timestamptz not null default now(),
  venues_snapshot jsonb not null,
  period_snapshot jsonb not null,
  attendance_snapshot integer,
  equipment_snapshot jsonb not null
);

create unique index event_safety_check_submissions_event_round_idx
  on public.event_safety_check_submissions (event_id, round);
create index event_safety_check_submissions_event_idx
  on public.event_safety_check_submissions (event_id, submitted_at);

alter table public.event_safety_check_submissions enable row level security;

-- No insert/update/delete policy: only submit_event_for_safety_check
-- (security definer) writes this table, same "RPC-only" shape as
-- equipment_arrangement_updates.
create policy "safety check submissions visible to the event's people"
on public.event_safety_check_submissions
for select to authenticated using (
  exists (
    select 1 from public.events e
    where e.id = event_safety_check_submissions.event_id
      and (e.organiser_id = auth.uid() or e.assigned_coordinator_id = auth.uid())
  )
  or public.current_user_role() = 'event_coordinator_lead'::public.user_role
);
