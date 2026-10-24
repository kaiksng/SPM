-- Event waitlist: an attendee can join a waiting list once a confirmed
-- event is full, with a first-come-first-served position recorded via
-- registered_at. When a registered attendee withdraws (the only
-- vacancy-creating action in the app so far), the longest-waiting
-- attendee is promoted straight to 'registered' — no invite/accept step.

-- 1. join_event_waitlist — only once the event is genuinely full and the
--    organiser enabled a waitlist; records FCFS order via registered_at.
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

  if exists (
    select 1 from public.event_registrations
    where event_id = p_event_id and attendee_id = p_actor_id
  ) then
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

  insert into public.event_registrations (event_id, attendee_id, status)
  values (p_event_id, p_actor_id, 'waitlisted')
  returning * into v_registration;

  return v_registration;
end;
$function$;

revoke all on function public.join_event_waitlist(uuid, uuid) from public, anon;
grant execute on function public.join_event_waitlist(uuid, uuid) to authenticated, service_role;

-- 2. leave_event_waitlist — only while still waitlisted; deletes the row
--    (not a status flip) so the attendee's unique (event_id, attendee_id)
--    slot is free again if they ever want to rejoin.
create or replace function public.leave_event_waitlist(p_event_id uuid, p_actor_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
begin
  select status into v_status
  from public.event_registrations
  where event_id = p_event_id and attendee_id = p_actor_id;

  if v_status is null then
    raise exception 'You are not on the waiting list for this event' using errcode = 'P0002';
  end if;

  if v_status <> 'waitlisted' then
    raise exception 'You are not currently on the waiting list for this event' using errcode = '23514';
  end if;

  delete from public.event_registrations
  where event_id = p_event_id and attendee_id = p_actor_id;
end;
$function$;

revoke all on function public.leave_event_waitlist(uuid, uuid) from public, anon;
grant execute on function public.leave_event_waitlist(uuid, uuid) to authenticated, service_role;

-- 3. withdraw_registration — minimal on purpose: exists only because the
--    waitlist story's own scenario ("a registered attendee withdraws") is
--    the one vacancy-creating action in the app so far. Gated on
--    withdrawal_permitted (SPM-40). Promotes the longest-waiting attendee
--    straight to 'registered' in the same transaction — no invite/accept
--    step.
create or replace function public.withdraw_registration(p_event_id uuid, p_actor_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_withdrawal_permitted boolean;
  v_next_id uuid;
begin
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
  set status = 'withdrawn', withdrawn_at = now()
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

revoke all on function public.withdraw_registration(uuid, uuid) from public, anon;
grant execute on function public.withdraw_registration(uuid, uuid) to authenticated, service_role;
