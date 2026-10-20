-- Extends can_view_event so a Safety Officer can read an event (and, via
-- the same function, venue_bookings/event_equipment_requirements/
-- event_venue_requirements/event_required_facilities — every table whose
-- SELECT policy already delegates to can_view_event) while it's awaiting
-- their review. Deliberately scoped to pending_safety_check only — unlike
-- venue_staff/technical_support_staff/event_coordinator_lead, who see every
-- event regardless of status, a Safety Officer has no reason to browse
-- drafts or unrelated confirmed events; reviewing is their only job here.
--
-- Two overloads of can_view_event now exist (202610190008 added the
-- actor-aware one, single-argument kept for every existing RLS
-- policy/function) — both need the same safety_officer grant, since
-- event_readiness calls the two-argument form while RLS policies on
-- events/venue_bookings/event_equipment_requirements etc. still call the
-- single-argument one.
create or replace function public.can_view_event(target_event_id uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
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
        or (
          public.current_user_role() = 'safety_officer'::public.user_role
          and e.status = 'pending_safety_check'::public.event_status
        )
      )
  );
$$;

create or replace function public.can_view_event(target_event_id uuid, p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and (
        e.organiser_id = p_actor_id
        or e.assigned_coordinator_id = p_actor_id
        or exists (
          select 1 from public.profiles p
          where p.id = p_actor_id
            and p.role in (
              'event_coordinator'::public.user_role,
              'venue_staff'::public.user_role,
              'technical_support_staff'::public.user_role,
              'event_coordinator_lead'::public.user_role
            )
        )
        or (
          exists (
            select 1 from public.profiles p
            where p.id = p_actor_id and p.role = 'safety_officer'::public.user_role
          )
          and e.status = 'pending_safety_check'::public.event_status
        )
      )
  );
$function$;

revoke all on function public.can_view_event(uuid, uuid) from public, anon;
grant execute on function public.can_view_event(uuid, uuid) to authenticated, service_role;

-- event_safety_check_submissions has its own bespoke policy (not
-- can_view_event-based), so it needs the same grant added directly —
-- a Safety Officer can read a submission while its event awaits their
-- review (same scoping as can_view_event above, for the same reason).
create policy "safety check submissions visible to safety officers reviewing"
on public.event_safety_check_submissions
for select to authenticated using (
  public.current_user_role() = 'safety_officer'::public.user_role
  and exists (
    select 1 from public.events e
    where e.id = event_safety_check_submissions.event_id
      and e.status = 'pending_safety_check'::public.event_status
  )
);
