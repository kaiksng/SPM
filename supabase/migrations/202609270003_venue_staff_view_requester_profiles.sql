-- Venue Staff could not see the name of the coordinator who requested a
-- venue booking, or of the Venue Staff member who decided one — the
-- "Requests" list's `profiles!venue_bookings_requested_by_fkey` /
-- `...decided_by_fkey` embedded selects silently return null under RLS,
-- rendering as "Unknown coordinator" — the same class of bug
-- 202609140002 fixed for an organiser viewing their assigned coordinator.
-- "profiles readable by owner and staff" only grants read access based on
-- the viewer's own role, not the relationship between the viewer and the
-- target profile: a Venue Staff member viewing a coordinator's (or another
-- Venue Staff member's) profile satisfies neither `id = auth.uid()` nor
-- `current_user_role() = 'event_coordinator'`.
--
-- Venue Staff already has unrestricted select on every venue_bookings row
-- ("venue bookings visible to participants"), so this is scoped the same
-- way — any profile referenced as requested_by or decided_by on any
-- venue_bookings row — rather than narrowed to "their own" request the way
-- the organiser-facing policy is (an organiser only ever has one assigned
-- coordinator per event to see; Venue Staff need to see every requester and
-- decider across every request, matching their own read access to the
-- table).
--
-- RLS policies for the same command are combined with OR, so this is
-- additive: it does not change what the existing policy already allows.
create policy "venue staff view profiles tied to venue bookings" on public.profiles
for select to authenticated
using (
  public.current_user_role() = 'venue_staff'::public.user_role
  and exists (
    select 1 from public.venue_bookings vb
    where vb.requested_by = profiles.id or vb.decided_by = profiles.id
  )
);
