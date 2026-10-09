-- The Flagged page shows each conflicting booking's CURRENT assigned
-- coordinator (events.assigned_coordinator_id), not venue_bookings.
-- requested_by — a coordinator reassignment after the request was
-- submitted would otherwise leave the card naming someone no longer on the
-- event. "venue staff view profiles tied to venue bookings" (202610060007)
-- covers requested_by/decided_by/held_by and the organiser, but not
-- assigned_coordinator_id, so that join would silently read null under RLS
-- for any event reassigned since its booking was requested — the same
-- class of bug that migration already fixed once for held_by/organiser.
drop policy "venue staff view profiles tied to venue bookings" on public.profiles;

create policy "venue staff view profiles tied to venue bookings" on public.profiles
for select to authenticated
using (
  public.current_user_role() = 'venue_staff'::public.user_role
  and (
    exists (
      select 1 from public.venue_bookings vb
      where vb.requested_by = profiles.id or vb.decided_by = profiles.id or vb.held_by = profiles.id
    )
    or exists (
      select 1 from public.events e
      join public.venue_bookings vb on vb.event_id = e.id
      where e.organiser_id = profiles.id or e.assigned_coordinator_id = profiles.id
    )
  )
);
