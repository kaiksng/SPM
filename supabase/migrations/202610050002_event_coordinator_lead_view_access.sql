-- Event Coordinator Lead: view-only access.
--
-- The Lead's dashboard lists every submitted event and who it's assigned
-- to, so the role needs the same "see any event" access as an Event
-- Coordinator / Venue Staff / Technical Support Staff member, plus enough
-- profile visibility to resolve organiser and assigned-coordinator names.
-- Deliberately out of scope here: editing event requirements, approving
-- events, submitting venue/equipment requests, and assigning/reassigning a
-- coordinator — those stay unavailable to this role until a later change.

create or replace function public.can_view_event(target_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and (
        e.organiser_id = auth.uid()
        or e.assigned_coordinator_id = auth.uid()
        or public.current_user_role() in (
          'event_coordinator'::public.user_role,
          'venue_staff'::public.user_role,
          'technical_support_staff'::public.user_role,
          'event_coordinator_lead'::public.user_role
        )
      )
  );
$function$;

-- Mirrors 202609270003_venue_staff_view_requester_profiles.sql: RLS
-- policies for the same command combine with OR, so this is additive and
-- does not change what any existing policy already allows. Scoped to any
-- profile referenced as organiser or assigned coordinator on any events
-- row, matching the Lead's own can_view_event read access to the table.
create policy "event coordinator lead views profiles tied to events" on public.profiles
for select to authenticated
using (
  public.current_user_role() = 'event_coordinator_lead'::public.user_role
  and exists (
    select 1 from public.events e
    where e.organiser_id = profiles.id or e.assigned_coordinator_id = profiles.id
  )
);
