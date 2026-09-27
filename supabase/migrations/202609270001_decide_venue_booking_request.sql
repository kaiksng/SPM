-- Approve or Reject a Venue Booking Request.
--
-- AC01 Pending -> Approved -> the venue period becomes a Confirmed Booking
--      (still stored as request_status 'approved' — "Confirmed Booking" is a
--      display label, the same way event_status 'requested' displays as
--      "Pending"; see status-badges.tsx's STATUS_LABELS convention).
-- AC02 Rejection requires a reason; the period is released (a rejected
--      booking already falls outside venue_bookings_no_overlap/
--      venue_bookings_one_active_per_event, both scoped to
--      pending/approved, so nothing further is needed to "release" it).
-- AC03 Every decision records the deciding Venue Staff member, the outcome,
--      the reason where applicable, and the timestamp.
-- AC04 The requesting coordinator is notified on either outcome.
--
-- Deliberately out of scope: auto-rejecting other overlapping Pending
-- requests. venue_bookings_no_overlap (202609220004) and
-- submit_venue_booking_request's own AC03 check (202609260001) already
-- guarantee a venue/period can have at most one Pending or Approved booking
-- at a time — the first coordinator to submit a request holds that slot, and
-- every later overlapping request is rejected at submission time, not left
-- Pending. That existing behaviour is unchanged by this migration.

create type public.venue_booking_decision_type as enum ('approved', 'rejected');

-- AC01/AC02/AC03/AC04. Mirrors decide_event_request's shape (actor
-- resolution, row lock, reason-required-for-rejection), applied to
-- venue_bookings instead of events.
create or replace function public.decide_venue_booking_request(
  p_booking_id uuid,
  p_decision public.venue_booking_decision_type,
  p_reason text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_role public.user_role;
  booking_row public.venue_bookings;
  reason_value text := nullif(trim(coalesce(p_reason, '')), '');
  new_status public.request_status;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot decide a venue booking request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to decide a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role is distinct from 'venue_staff'::public.user_role then
    raise exception 'Only Venue Staff can decide a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC02: only rejection requires a reason.
  if p_decision = 'rejected' and reason_value is null then
    raise exception 'Explain the reason for rejecting this venue booking request'
      using errcode = 'check_violation';
  end if;

  select * into booking_row
  from public.venue_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Venue booking request not found'
      using errcode = 'insufficient_privilege';
  end if;

  if booking_row.status <> 'pending' then
    raise exception 'Only a Pending venue booking request can be approved or rejected'
      using errcode = 'check_violation';
  end if;

  new_status := case p_decision when 'approved' then 'approved' else 'rejected' end;

  -- AC01/AC02/AC03: record the outcome, the decider, the reason (if any),
  -- and the timestamp in one place, same columns either way.
  update public.venue_bookings
  set status = new_status,
      decided_by = actor_id,
      decision_notes = reason_value,
      decided_at = now()
  where id = p_booking_id;

  -- AC04: the requesting coordinator is notified either way.
  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    booking_row.requested_by,
    booking_row.event_id,
    'venue_decision'::public.notification_type,
    case p_decision when 'approved' then 'Venue booking approved' else 'Venue booking rejected' end,
    case p_decision
      when 'approved' then 'Your venue booking request has been approved. The venue is now a confirmed booking for this period.'
      else 'Your venue booking request was rejected. ' || coalesce(reason_value, '')
    end
  );

  return jsonb_build_object('bookingId', p_booking_id, 'status', new_status::text, 'decidedAt', now());
end;
$$;

revoke all on function public.decide_venue_booking_request(uuid, public.venue_booking_decision_type, text, uuid) from public;
revoke all on function public.decide_venue_booking_request(uuid, public.venue_booking_decision_type, text, uuid) from anon;
grant execute on function public.decide_venue_booking_request(uuid, public.venue_booking_decision_type, text, uuid) to authenticated;
grant execute on function public.decide_venue_booking_request(uuid, public.venue_booking_decision_type, text, uuid) to service_role;
