-- Attendee Registration.
create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  attendee_id uuid not null references public.profiles (id),
  status text not null default 'registered' check (status in ('registered', 'waitlisted', 'withdrawn')),
  registered_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (event_id, attendee_id)
);

create index event_registrations_event_idx on public.event_registrations (event_id, status);
create index event_registrations_attendee_idx on public.event_registrations (attendee_id);

alter table public.event_registrations enable row level security;

-- The attendee sees their own registration; organisers/coordinators see
-- registrations for events they manage ("appropriate registration
-- information for the events they manage").
create policy "attendees view their own registrations" on public.event_registrations
for select to authenticated
using (attendee_id = auth.uid() or public.can_view_event(event_id));

create policy "attendees register themselves" on public.event_registrations
for insert to authenticated
with check (
  attendee_id = auth.uid()
  and public.current_user_role() = 'attendee'
  and public.can_view_event(event_id)
);

create policy "attendees withdraw their own registration" on public.event_registrations
for update to authenticated
using (attendee_id = auth.uid())
with check (attendee_id = auth.uid());
