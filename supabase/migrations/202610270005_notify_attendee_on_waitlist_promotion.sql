-- The attendee automatically promoted from the waiting list to registered
-- (withdraw_registration's existing auto-promote step, no invite/accept
-- step) was never told it happened — they'd only find out by revisiting
-- the event. Same signature as 202610270003; only the promotion branch at
-- the end gains a notification insert.
create or replace function public.withdraw_registration(
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
  v_next_attendee_id uuid;
  v_event_title text;
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

  select id, attendee_id into v_next_id, v_next_attendee_id
  from public.event_registrations
  where event_id = p_event_id and status = 'waitlisted'
  order by registered_at
  limit 1;

  if v_next_id is not null then
    update public.event_registrations
    set status = 'registered', registered_at = now()
    where id = v_next_id;

    select title into v_event_title from public.events where id = p_event_id;

    insert into public.notifications (recipient_id, event_id, type, title, message)
    values (
      v_next_attendee_id,
      p_event_id,
      'waitlist_promoted'::public.notification_type,
      'You''re registered!',
      'A place opened up for "' || v_event_title || '" and you''ve been automatically registered from the waiting list.'
    );
  end if;
end;
$function$;

revoke all on function public.withdraw_registration(uuid, uuid, text) from public, anon;
grant execute on function public.withdraw_registration(uuid, uuid, text) to authenticated, service_role;
