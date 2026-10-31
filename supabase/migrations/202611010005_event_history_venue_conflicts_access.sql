-- Renumbered from 202611010001: that number was already taken on the hosted
-- project by 202611010001_public_events_without_registration, so this
-- migration was skipped there. Unchanged otherwise.
--
-- SPM-9: an event's change history lists the venue conflicts its bookings
-- were flagged with (and when they were cleared), next to the disruptions.
--
-- Until now a conflict was readable only by Venue Staff and the coordinator
-- who made the booking ("coordinator views conflicts on their own bookings",
-- 202610090004), so after a reassignment the event's current coordinator,
-- and the Event Coordinator Lead, saw no conflicts in its history. This
-- grants them read access, matching who can read the event's disruptions
-- ("disruptions visible to staff, lead and assigned coordinator",
-- 202610120003). Organisers are left out, as for disruptions. Read only:
-- conflicts are still written by recheck_venue_conflicts alone.

create policy "assigned coordinator and lead view conflicts on their events"
on public.venue_booking_conflicts
for select to authenticated
using (
  public.current_user_role() = 'event_coordinator_lead'::public.user_role
  or exists (
    select 1
    from public.venue_bookings b
    join public.events e on e.id = b.event_id
    where b.id = venue_booking_conflicts.booking_id
      and e.assigned_coordinator_id = auth.uid()
  )
);
