-- Release equipment reservations when their event ends.
--
-- Bug: cancelling, completing or rejecting an event left its approved
-- equipment reservations in place. They kept counting as commitments in
-- equipment_commitment_peaks, so those units stayed unavailable to every
-- other event, and the event no longer appeared on the Technical Support
-- Staff Event requests page (open events only), so nobody could release
-- them.
--
-- Fix: when an event moves to Cancelled, Completed or Rejected, each of its
-- live reservations is released the same way release_equipment_reservation
-- does it (status 'cancelled', released_at, flag cleared), and the release
-- is logged in equipment_reservation_events with the reason (reserve
-- equipment AC5: "the quantity returns to the available pool ... and the
-- action is recorded"). Reservations already stuck on ended events are
-- released once below.

create or replace function public.release_reservations_for_ended_event(p_event_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_reservation public.equipment_reservations;
begin
  for v_reservation in
    select * from public.equipment_reservations
    where event_id = p_event_id and status = 'approved'
    for update
  loop
    update public.equipment_reservations
    -- auth.uid() is null when the change comes through the backend's service
    -- client; the release is then recorded without an actor.
    set status = 'cancelled', released_at = now(), released_by = auth.uid(), needs_recheck = false
    where id = v_reservation.id;

    insert into public.equipment_reservation_events (reservation_id, action, details, actor)
    values (
      v_reservation.id,
      'released',
      public.reservation_snapshot(v_reservation) || jsonb_build_object('reason', p_reason),
      auth.uid()
    );
  end loop;
end;
$$;

revoke all on function public.release_reservations_for_ended_event(uuid, text) from public, anon, authenticated;

create or replace function public.release_reservations_on_event_end()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is not distinct from old.status
    or new.status not in ('cancelled', 'completed', 'rejected')
  then
    return new;
  end if;

  perform public.release_reservations_for_ended_event(
    new.id,
    case new.status
      when 'cancelled' then 'The event was cancelled'
      when 'completed' then 'The event was completed'
      else 'The event was rejected'
    end
  );
  return new;
end;
$$;

create trigger events_release_equipment_reservations
after update of status on public.events
for each row execute function public.release_reservations_on_event_end();

-- Release what is already stuck on events that ended before this fix.
do $$
declare
  v_event record;
begin
  for v_event in
    select distinct e.id, e.status
    from public.events e
    join public.equipment_reservations r on r.event_id = e.id and r.status = 'approved'
    where e.status in ('cancelled', 'completed', 'rejected')
  loop
    perform public.release_reservations_for_ended_event(
      v_event.id,
      case v_event.status
        when 'cancelled' then 'The event was cancelled'
        when 'completed' then 'The event was completed'
        else 'The event was rejected'
      end
    );
  end loop;
end;
$$;
