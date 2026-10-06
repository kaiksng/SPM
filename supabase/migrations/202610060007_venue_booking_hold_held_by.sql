-- Records which Venue Staff member placed a hold — missed in 202610060004
-- even though the original AC calls for it ("A hold records the venue,
-- event, coordinator, period, Venue Staff member, created time and
-- expiry"). Kept separate from decided_by: that column means "who made the
-- final approve/reject decision", a different actor/moment, and a hold
-- that later gets decided would otherwise have decided_by overwrite who
-- held it.
--
-- (202610060006 was taken by a teammate's add_safety_officer_role
-- migration during a merge — this is a fresh file, not a retry of a
-- numbering collision.)
-- Already physically applied by this file's first push (before it was
-- consolidated with what's now below); `if not exists` makes this safe to
-- re-run after the migration-repair below reset only the tracking record,
-- not the actual column.
alter table public.venue_bookings
  add column if not exists held_by uuid references public.profiles (id);

create or replace function public.place_venue_booking_hold(
  p_booking_id uuid,
  p_expires_at timestamptz,
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
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot place a hold on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to place a hold'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role is distinct from 'venue_staff'::public.user_role then
    raise exception 'Only Venue Staff can place a hold'
      using errcode = 'insufficient_privilege';
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
    raise exception 'Only a Pending venue booking request can be put on hold'
      using errcode = 'check_violation';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Enter an expiry date and time in the future'
      using errcode = 'check_violation';
  end if;

  if p_expires_at >= booking_row.starts_at then
    raise exception 'The expiry must be before the requested period starts'
      using errcode = 'check_violation';
  end if;

  update public.venue_bookings
  set status = 'on_hold',
      expires_at = p_expires_at,
      held_by = actor_id
  where id = p_booking_id;

  return jsonb_build_object(
    'bookingId', p_booking_id,
    'status', 'on_hold',
    'expiresAt', p_expires_at
  );
end;
$$;

-- Venue Staff already see requested_by/decided_by names tied to a booking
-- they can read (202609270003); held_by and the event's organiser need the
-- same treatment or they silently read as null under RLS, the same class of
-- bug that migration fixed. The venue availability calendar shows both
-- alongside the assigned coordinator. Event Coordinators need no equivalent
-- addition — "profiles readable by owner and staff" already lets any
-- event_coordinator read any profile.
drop policy "venue staff view profiles tied to venue bookings" on public.profiles;

create policy "venue staff view profiles tied to venue bookings" on public.profiles
for select to authenticated
using (
  public.current_user_role() = 'venue_staff'::public.user_role
  and (
    exists (
      select 1 from public.venue_bookings vb
      where vb.requested_by = profiles.id or vb.decided_by = profiles.id or vb.held_by = profiles.id
    )
    or exists (
      select 1 from public.events e
      join public.venue_bookings vb on vb.event_id = e.id
      where e.organiser_id = profiles.id
    )
  )
);
