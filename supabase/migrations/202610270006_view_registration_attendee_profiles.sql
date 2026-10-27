-- View Event Registration Information: the organiser and the Event
-- Coordinator Lead need an attendee's name alongside their registration
-- row. event_registrations' own SELECT policy already delegates to
-- can_view_event (organiser via organiser_id, assigned coordinator via
-- assigned_coordinator_id, Lead via a blanket role check), so the row
-- itself is already readable — only the attendee's profiles row is not.
-- event_coordinator already has a blanket (if broader than this story
-- needs) grant via "profiles readable by owner and staff"; organiser and
-- Lead have none. Same shape as the safety-officer precedent
-- (202610200008): a profile is visible when it's tied to a registration on
-- an event the viewer can currently see.
create policy "organiser and lead view profiles tied to a registration" on public.profiles
for select to authenticated using (
  public.current_user_role() in ('event_organiser'::public.user_role, 'event_coordinator_lead'::public.user_role)
  and exists (
    select 1 from public.event_registrations er
    where er.attendee_id = profiles.id and public.can_view_event(er.event_id)
  )
);
