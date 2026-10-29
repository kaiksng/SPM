-- SPM-44 View Event Registration Information: registration rows were
-- readable by anyone can_view_event lets see the event — every attendee on a
-- confirmed event, every coordinator (assigned or not), venue staff and
-- technical support staff. The story allows only the event's organiser, its
-- assigned coordinator and the Event Coordinator Lead, plus each attendee
-- for their own row.

create or replace function public.can_manage_event_registrations(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and (
        e.organiser_id = auth.uid()
        or e.assigned_coordinator_id = auth.uid()
        or public.current_user_role() = 'event_coordinator_lead'::public.user_role
      )
  );
$$;

revoke all on function public.can_manage_event_registrations(uuid) from public, anon;
grant execute on function public.can_manage_event_registrations(uuid) to authenticated, service_role;

drop policy if exists "attendees view their own registrations" on public.event_registrations;
create policy "attendees view their own registrations" on public.event_registrations
for select to authenticated
using (attendee_id = auth.uid() or public.can_manage_event_registrations(event_id));

-- Attendee pages still need two numbers that used to be computed from other
-- attendees' rows: how many places are taken, and the caller's own place on
-- the waiting list. This returns only those numbers, never anyone's row,
-- and only for events the caller can see. The waiting list is ordered the
-- same way the pages ordered it: oldest registered_at first.
create or replace function public.event_registration_counts(p_event_ids uuid[])
returns table (
  event_id uuid,
  registered_count integer,
  own_waitlist_position integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    (
      select count(*)::integer
      from public.event_registrations r
      where r.event_id = e.id and r.status = 'registered'
    ),
    (
      select w.position::integer
      from (
        select r.attendee_id, row_number() over (order by r.registered_at, r.id) as position
        from public.event_registrations r
        where r.event_id = e.id and r.status = 'waitlisted'
      ) w
      where w.attendee_id = auth.uid()
    )
  from public.events e
  where e.id = any (p_event_ids)
    and public.can_view_event(e.id);
$$;

revoke all on function public.event_registration_counts(uuid[]) from public, anon;
grant execute on function public.event_registration_counts(uuid[]) to authenticated, service_role;
