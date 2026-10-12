-- SPM-83: a booking (or active tentative hold) that overlaps a venue block is
-- flagged "Disrupted - Alternative Required" by a row here. Nothing about the
-- booking, its event or their histories changes; the flag lives alongside the
-- booking so a booking hit by several blocks is cleared block by block.
-- Written only by the security-definer block functions.
create table public.venue_booking_disruptions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.venue_bookings (id) on delete cascade,
  block_id uuid not null references public.venue_unavailability (id) on delete cascade,
  flagged_at timestamptz not null default now(),
  flagged_by uuid references public.profiles (id),
  cleared_at timestamptz,
  cleared_by uuid references public.profiles (id),
  unique (booking_id, block_id)
);

create index venue_booking_disruptions_active_booking_idx
  on public.venue_booking_disruptions (booking_id) where cleared_at is null;
create index venue_booking_disruptions_block_idx
  on public.venue_booking_disruptions (block_id);

alter table public.venue_booking_disruptions enable row level security;

-- Venue staff and the coordinator lead see every disruption; a coordinator
-- sees those on events currently assigned to them. No write policy.
create policy "disruptions visible to staff, lead and assigned coordinator"
on public.venue_booking_disruptions
for select to authenticated
using (
  public.current_user_role() in (
    'venue_staff'::public.user_role,
    'event_coordinator_lead'::public.user_role
  )
  or exists (
    select 1
    from public.venue_bookings b
    join public.events e on e.id = b.event_id
    where b.id = venue_booking_disruptions.booking_id
      and e.assigned_coordinator_id = auth.uid()
  )
);
