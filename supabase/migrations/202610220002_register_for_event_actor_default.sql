-- register_for_event's p_actor_id had no default, unlike every other
-- actor-id RPC param in this codebase (e.g. decide_event_request's
-- `p_actor_id uuid default null`) — that default exists purely so the
-- generated TypeScript type comes out optional, matching req.userId's
-- `string | undefined` type without a cast at every call site. Same
-- signature, same body: only the default is new.
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
