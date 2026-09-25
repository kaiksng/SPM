-- Event Change Requests. Organiser-initiated, post-submission — distinct
-- from clarifications (coordinator-initiated, pre-decision questions) and
-- event_field_changes (the resulting audit trail once a change is applied).
create table public.event_change_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  requested_changes jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id),
  review_notes text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index event_change_requests_event_idx on public.event_change_requests (event_id, status);

alter table public.event_change_requests enable row level security;

create policy "change requests visible to event participants" on public.event_change_requests
for select to authenticated using (public.can_view_event(event_id));

create policy "organisers submit change requests" on public.event_change_requests
for insert to authenticated
with check (
  requested_by = auth.uid()
  and public.current_user_role() = 'event_organiser'
  and exists (
    select 1 from public.events e
    where e.id = event_id and e.organiser_id = auth.uid()
  )
);

-- Same "authorised coordinator" shape as decide_event_request/
-- request_event_clarification: the assigned coordinator specifically, or an
-- administrator.
create policy "assigned coordinators review change requests" on public.event_change_requests
for update to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (e.assigned_coordinator_id = auth.uid() or public.current_user_role() = 'administrator')
  )
)
with check (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (e.assigned_coordinator_id = auth.uid() or public.current_user_role() = 'administrator')
  )
);
