-- register_for_event and join_event_waitlist both blocked re-registration
-- forever once an attendee withdrew: their duplicate check matched any
-- existing row for (event_id, attendee_id) regardless of status, and
-- event_registrations' unique(event_id, attendee_id) constraint means a
-- fresh insert would violate it even if the check were loosened. Fix: treat
-- 'withdrawn' as no active registration, and reuse that row (update it back
-- to 'registered'/'waitlisted') instead of inserting a new one. Everyone
-- else's behaviour — window/capacity/waitlist checks, error codes — is
-- unchanged.

create or replace function public.register_for_event(p_event_id uuid, p_actor_id uuid default null)
returns public.event_registrations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_status public.event_status;
  v_req public.event_registration_requirements;
  v_registered_count integer;
  v_existing_status text;
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

  select status into v_existing_status
  from public.event_registrations
  where event_id = p_event_id and attendee_id = p_actor_id;

  if v_existing_status is not null and v_existing_status <> 'withdrawn' then
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

  if v_existing_status = 'withdrawn' then
    update public.event_registrations
    set status = 'registered', registered_at = now(), withdrawn_at = null
    where event_id = p_event_id and attendee_id = p_actor_id
    returning * into v_registration;
  else
    insert into public.event_registrations (event_id, attendee_id, status)
    values (p_event_id, p_actor_id, 'registered')
    returning * into v_registration;
  end if;

  return v_registration;
end;
$function$;

revoke all on function public.register_for_event(uuid, uuid) from public, anon;
grant execute on function public.register_for_event(uuid, uuid) to authenticated, service_role;

create or replace function public.join_event_waitlist(p_event_id uuid, p_actor_id uuid default null)
returns public.event_registrations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_status public.event_status;
  v_req public.event_registration_requirements;
  v_registered_count integer;
  v_existing_status text;
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

  if not v_req.waitlist_enabled then
    raise exception 'This event does not have a waiting list' using errcode = '23514';
  end if;

  if v_req.registration_opens_at is not null and now() < v_req.registration_opens_at then
    raise exception 'Registration has not opened yet' using errcode = '23514';
  end if;

  if v_req.registration_closes_at is not null and now() > v_req.registration_closes_at then
    raise exception 'Registration is closed' using errcode = '23514';
  end if;

  select status into v_existing_status
  from public.event_registrations
  where event_id = p_event_id and attendee_id = p_actor_id;

  if v_existing_status is not null and v_existing_status <> 'withdrawn' then
    raise exception 'You are already registered for this event' using errcode = '23505';
  end if;

  if v_req.attendee_capacity is null then
    raise exception 'This event has not reached capacity' using errcode = '23514';
  end if;

  select count(*) into v_registered_count
  from public.event_registrations
  where event_id = p_event_id and status = 'registered';

  if v_registered_count < v_req.attendee_capacity then
    raise exception 'This event has not reached capacity' using errcode = '23514';
  end if;

  if v_existing_status = 'withdrawn' then
    update public.event_registrations
    set status = 'waitlisted', registered_at = now(), withdrawn_at = null
    where event_id = p_event_id and attendee_id = p_actor_id
    returning * into v_registration;
  else
    insert into public.event_registrations (event_id, attendee_id, status)
    values (p_event_id, p_actor_id, 'waitlisted')
    returning * into v_registration;
  end if;

  return v_registration;
end;
$function$;

revoke all on function public.join_event_waitlist(uuid, uuid) from public, anon;
grant execute on function public.join_event_waitlist(uuid, uuid) to authenticated, service_role;
