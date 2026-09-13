-- PB-04 AC02: "The assigned coordinator is visible to the organiser and
-- internal coordinators."
--
-- events.assigned_coordinator_id was already selectable by the organiser
-- (via "events visible to participants"), but "profiles readable by owner
-- and staff" only grants read access based on the VIEWER's own role, not the
-- relationship between the viewer and the target profile. An Event
-- Organiser viewing a coordinator's profile satisfies neither
-- `id = auth.uid()` nor `current_user_role() in ('event_coordinator',
-- 'administrator')`, so PostgREST's embedded
-- `profiles!events_assigned_coordinator_id_fkey` select silently returns
-- null for that relation — the id is visible, but the coordinator's name is
-- not.
--
-- RLS policies for the same command are combined with OR, so this is
-- additive: it does not change what the existing policy already allows.
create policy "organisers view their assigned coordinator" on public.profiles
for select to authenticated
using (
  role = 'event_coordinator'
  and exists (
    select 1 from public.events e
    where e.assigned_coordinator_id = profiles.id
      and e.organiser_id = auth.uid()
  )
);
