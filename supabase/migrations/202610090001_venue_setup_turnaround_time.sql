-- Venue Setup & Turnaround Time.
--
-- "As a Venue Staff member, I want to set a venue's setup time and
-- turnaround time, so that availability reflects the time needed to
-- prepare and reset the room."
--
-- AC: Venue Staff can enter setup time and turnaround time in whole
--     minutes for each venue; both default to 0.
-- AC: Negative or non-numeric values are rejected and the affected field
--     is identified. (Enforced in create_venue/update_venue, same
--     collect-every-issue-then-report shape every other venue field uses.)
-- AC: Saved values are shown on the venue details page and venue
--     catalogue. (Frontend-only change — both already read every other
--     venues column through the same queries.)
-- AC: Each change records the staff member, previous value, new value,
--     and timestamp. A dedicated history table, not a repurposed
--     needs_review-style flag — mirrors event_field_changes
--     (202609150003), the same previous/new/actor/timestamp shape this
--     app already uses for exactly this kind of log.
-- AC: Only Venue Staff can change these values — already true for every
--     venue field, since create_venue/update_venue both already require
--     actor_role = 'venue_staff'.
alter table public.venues
  add column setup_time_minutes integer not null default 0 check (setup_time_minutes >= 0),
  add column turnaround_time_minutes integer not null default 0 check (turnaround_time_minutes >= 0);

comment on column public.venues.setup_time_minutes is
  'Minutes this venue needs blocked immediately before a booking starts, for staging/AV checks. Whole minutes, default 0.';
comment on column public.venues.turnaround_time_minutes is
  'Minutes this venue needs blocked immediately after a booking ends, for teardown/cleaning. Whole minutes, default 0.';

create table public.venue_buffer_time_changes (
  id bigint generated always as identity primary key,
  venue_id uuid not null references public.venues (id) on delete cascade,
  field_name text not null check (field_name in ('setup_time_minutes', 'turnaround_time_minutes')),
  previous_value integer not null,
  new_value integer not null,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);

create index venue_buffer_time_changes_venue_idx
  on public.venue_buffer_time_changes (venue_id, changed_at desc);

alter table public.venue_buffer_time_changes enable row level security;

-- No insert/update/delete policy for authenticated users — only
-- update_venue (security definer) writes here, same reasoning as
-- event_field_changes having no write policy of its own.
create policy "venue staff view buffer time history" on public.venue_buffer_time_changes
for select to authenticated
using (public.current_user_role() = 'venue_staff'::public.user_role);
