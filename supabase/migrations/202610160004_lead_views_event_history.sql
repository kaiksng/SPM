-- The Event Coordinator Lead can read every event's change history.
--
-- The Lead's dashboard links to each event's history page (navigation.ts
-- allows /events/:id/history for the Lead), and the Lead can already read the
-- event itself, its clarifications, decisions and venue bookings through
-- can_view_event (202610050002). The three history tables, though, only let
-- the organiser and the assigned coordinator read them, so the Lead saw an
-- empty Lifecycle, Planning and Equipment history for every event.
--
-- Read-only and additive: policies for the same command combine with OR, so
-- these change nothing for any other role. A coordinator who is not assigned
-- to an event still cannot read its history (SPM-09 AC02).
create policy "event coordinator lead views status history"
on public.event_status_history
for select to authenticated
using (public.current_user_role() = 'event_coordinator_lead'::public.user_role);

create policy "event coordinator lead views field change history"
on public.event_field_changes
for select to authenticated
using (public.current_user_role() = 'event_coordinator_lead'::public.user_role);

create policy "event coordinator lead views equipment history"
on public.event_equipment_changes
for select to authenticated
using (public.current_user_role() = 'event_coordinator_lead'::public.user_role);
