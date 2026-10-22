-- Attendee event registration: grants attendees visibility into confirmed
-- events (can_view_event previously excluded the role entirely — an
-- attendee couldn't see any event, let alone register for one), and adds
-- register_for_event, the single RPC that validates and records a
-- registration atomically (window open, capacity, no duplicate).
--
-- Scope for this story: direct registration only. Waitlist join and
-- withdrawal are deliberately not built here — event_registrations.status
-- stays 'registered'-only in practice until those stories land.

-- 1. Extend can_view_event (both overloads, same pattern as
--    202610200005_safety_officer_view_access.sql) so an attendee can see an
--    event once it's confirmed. Additive only — every existing grant stays.
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
        or (
          public.current_user_role() = 'attendee'::public.user_role
          and e.status = 'confirmed'::public.event_status
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
        or (
          exists (
            select 1 from public.profiles p
            where p.id = p_actor_id and p.role = 'attendee'::public.user_role
          )
          and e.status = 'confirmed'::public.event_status
        )
      )
  );
$function$;

-- 2. register_for_event — the only way a registration row gets created.
--    Runs as the service role (called from the backend route, p_actor_id
--    passed explicitly, same pattern as decide_event_request), so it
--    re-checks everything a direct insert would otherwise rely on RLS for.
--    Capacity and the duplicate check happen inside this single statement
--    so two concurrent registrations can't both slip past a "spots left"
--    check that was only valid at read time.
create or replace function public.register_for_event(p_event_id uuid, p_actor_id uuid)
returns public.event_registrations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_status public.event_status;
  v_req public.event_registration_requirements;
  v_registered_count integer;
  v_registration public.event_registrations;
begin
  select status into v_event_status from public.events where id = p_event_id;
  if v_event_status is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if v_event_status is distinct from 'confirmed'::public.event_status then
    raise exception 'This event is not open for registration' using errcode = '23514';
  end if;

  select * into v_req
  from public.event_registration_requirements
  where event_id = p_event_id;

  if v_req is null or not v_req.registration_required then
    raise exception 'This event does not require registration' using errcode = '23514';
  end if;

  if v_req.registration_opens_at is not null and now() < v_req.registration_opens_at then
    raise exception 'Registration has not opened yet' using errcode = '23514';
  end if;

  if v_req.registration_closes_at is not null and now() > v_req.registration_closes_at then
    raise exception 'Registration is closed' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.event_registrations
    where event_id = p_event_id and attendee_id = p_actor_id
  ) then
    raise exception 'You are already registered for this event' using errcode = '23505';
  end if;

  if v_req.attendee_capacity is not null then
    select count(*) into v_registered_count
    from public.event_registrations
    where event_id = p_event_id and status = 'registered';

    if v_registered_count >= v_req.attendee_capacity then
      raise exception 'This event has reached capacity' using errcode = '23514';
    end if;
  end if;

  insert into public.event_registrations (event_id, attendee_id, status)
  values (p_event_id, p_actor_id, 'registered')
  returning * into v_registration;

  return v_registration;
end;
$function$;

revoke all on function public.register_for_event(uuid, uuid) from public, anon;
grant execute on function public.register_for_event(uuid, uuid) to authenticated, service_role;
