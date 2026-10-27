-- AC: a withdrawn registration may include an optional withdrawal reason.
-- Adds the column and threads an optional p_reason through
-- withdraw_registration. A third parameter changes the function's
-- signature (Postgres identifies a function by name + parameter types, not
-- defaults), so create or replace alone would add a second, unused
-- (uuid, uuid) overload instead of actually changing the one the app
-- calls — drop the old signature first.
alter table public.event_registrations
  add column withdrawal_reason text;

drop function if exists public.withdraw_registration(uuid, uuid);

create function public.withdraw_registration(
  p_event_id uuid,
  p_actor_id uuid default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_withdrawal_permitted boolean;
  v_next_id uuid;
  v_reason_value text := nullif(trim(coalesce(p_reason, '')), '');
begin
  -- Same per-event lock as register_for_event / join_event_waitlist, taken first,
  -- so freeing a place and promoting the first waiting attendee can't overlap a
  -- registration that would take the same place.
  perform 1
  from public.event_registration_requirements
  where event_id = p_event_id
  for update;

  select status into v_status
  from public.event_registrations
  where event_id = p_event_id and attendee_id = p_actor_id;

  if v_status is null then
    raise exception 'You do not have a registration for this event' using errcode = 'P0002';
  end if;

  if v_status <> 'registered' then
    raise exception 'Only a confirmed registration can be withdrawn' using errcode = '23514';
  end if;

  select withdrawal_permitted into v_withdrawal_permitted
  from public.event_registration_requirements
  where event_id = p_event_id;

  if not coalesce(v_withdrawal_permitted, false) then
    raise exception 'Withdrawal is not permitted for this event' using errcode = '23514';
  end if;

  update public.event_registrations
  set status = 'withdrawn', withdrawn_at = now(), withdrawal_reason = v_reason_value
  where event_id = p_event_id and attendee_id = p_actor_id;

  select id into v_next_id
  from public.event_registrations
  where event_id = p_event_id and status = 'waitlisted'
  order by registered_at
  limit 1;

  if v_next_id is not null then
    update public.event_registrations
    set status = 'registered', registered_at = now()
    where id = v_next_id;
  end if;
end;
$function$;

revoke all on function public.withdraw_registration(uuid, uuid, text) from public, anon;
grant execute on function public.withdraw_registration(uuid, uuid, text) to authenticated, service_role;

-- Rejoining after a withdrawal (202610250003) reused the same row but left
-- its withdrawal_reason in place — a fresh registration shouldn't carry a
-- reason from a previous one. Signatures are unchanged, so a plain
-- create or replace is enough here.
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
  where event_id = p_event_id
  for update;

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
    set status = 'registered', registered_at = now(), withdrawn_at = null, withdrawal_reason = null
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
  where event_id = p_event_id
  for update;

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
    set status = 'waitlisted', registered_at = now(), withdrawn_at = null, withdrawal_reason = null
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
