-- Conflict notifications go to Venue Staff (every profile with that role,
-- same "undifferentiated pool" pattern as submit_venue_booking_request's
-- notification — no per-venue staff assignment exists anywhere in this
-- schema), not the coordinator. Venue Staff is who can actually open the
-- Flagged page this notification links to; a coordinator has no route that
-- shows a single conflict today, so notifying them would be a dead end.
--
-- One notification per venue-staff profile per conflict EVENT (a pair
-- newly flagged, or a pair cleared), not per venue_booking_conflicts row —
-- a booking-vs-booking conflict is always two rows (one each direction),
-- and notifying per row would double every venue-staff member's
-- notification for the same conflict.
create or replace function public.recheck_venue_conflicts(
  p_venue_id uuid,
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
  v_setup integer;
  v_turnaround integer;
  flagged_count integer := 0;
  cleared_count integer := 0;
  active_count integer;
  conflict_row record;
  still_overlaps boolean;
  b1 record;
  b2 record;
  blk record;
  b1_start timestamptz;
  b1_end timestamptz;
  b2_start timestamptz;
  b2_end timestamptz;
  later_booking_id uuid;
  cleared_title text;
  cleared_other_title text;
  cleared_block_reason text;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot re-check conflicts on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to re-check conflicts'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;
  if actor_role is distinct from 'venue_staff'::public.user_role then
    raise exception 'Only Venue Staff can re-check conflicts'
      using errcode = 'insufficient_privilege';
  end if;

  select setup_time_minutes, turnaround_time_minutes
  into v_setup, v_turnaround
  from public.venues
  where id = p_venue_id;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'insufficient_privilege';
  end if;

  -- Pass 1: clear resolved conflicts. A booking-vs-booking pair is two
  -- rows (A->B and B->A); only fire the notification once per pair, on the
  -- row where booking_id < conflicting_booking_id — a booking-vs-block row
  -- has no symmetric counterpart, so it always fires.
  for conflict_row in
    select c.id, c.booking_id, c.conflicting_booking_id, c.conflicting_block_id
    from public.venue_booking_conflicts c
    join public.venue_bookings vb on vb.id = c.booking_id
    where vb.venue_id = p_venue_id and c.resolved_at is null
  loop
    select vb.starts_at - make_interval(mins => v_setup), vb.ends_at + make_interval(mins => v_turnaround)
    into b1_start, b1_end
    from public.venue_bookings vb
    where vb.id = conflict_row.booking_id and vb.status in ('pending', 'approved');

    still_overlaps := false;

    if b1_start is not null then
      if conflict_row.conflicting_booking_id is not null then
        select vb2.starts_at - make_interval(mins => v_setup), vb2.ends_at + make_interval(mins => v_turnaround)
        into b2_start, b2_end
        from public.venue_bookings vb2
        where vb2.id = conflict_row.conflicting_booking_id and vb2.status in ('pending', 'approved');

        if b2_start is not null and tstzrange(b1_start, b1_end) && tstzrange(b2_start, b2_end) then
          still_overlaps := true;
        end if;
      elsif conflict_row.conflicting_block_id is not null then
        still_overlaps := exists (
          select 1 from public.venue_unavailability vu
          where vu.id = conflict_row.conflicting_block_id
            and vu.removed_at is null
            and tstzrange(vu.starts_at, vu.ends_at) && tstzrange(b1_start, b1_end)
        );
      end if;
    end if;

    if not still_overlaps then
      update public.venue_booking_conflicts
      set resolved_at = now(), resolved_by = actor_id
      where id = conflict_row.id;

      cleared_count := cleared_count + 1;

      if conflict_row.conflicting_booking_id is null
        or conflict_row.booking_id < conflict_row.conflicting_booking_id
      then
        select e.title into cleared_title
        from public.venue_bookings vb join public.events e on e.id = vb.event_id
        where vb.id = conflict_row.booking_id;

        if conflict_row.conflicting_booking_id is not null then
          select e.title into cleared_other_title
          from public.venue_bookings vb join public.events e on e.id = vb.event_id
          where vb.id = conflict_row.conflicting_booking_id;

          insert into public.notifications (recipient_id, type, title, message)
          select p.id, 'venue_conflict_resolved'::public.notification_type,
            'Venue conflict cleared',
            'The conflict between "' || coalesce(cleared_title, 'a booking') || '" and "' ||
              coalesce(cleared_other_title, 'another booking') || '" is no longer active.'
          from public.profiles p
          where p.role = 'venue_staff'::public.user_role;
        else
          select vu.reason into cleared_block_reason
          from public.venue_unavailability vu
          where vu.id = conflict_row.conflicting_block_id;

          insert into public.notifications (recipient_id, type, title, message)
          select p.id, 'venue_conflict_resolved'::public.notification_type,
            'Venue conflict cleared',
            'The conflict between "' || coalesce(cleared_title, 'a booking') || '" and the block "' ||
              coalesce(cleared_block_reason, 'Reason not recorded') || '" is no longer active.'
          from public.profiles p
          where p.role = 'venue_staff'::public.user_role;
        end if;
      end if;
    end if;
  end loop;

  -- Pass 2: booking-vs-booking.
  for b1 in
    select vb.id, vb.event_id, vb.requested_by, vb.requested_at, e.title,
      vb.starts_at - make_interval(mins => v_setup) as eff_start,
      vb.ends_at + make_interval(mins => v_turnaround) as eff_end
    from public.venue_bookings vb
    join public.events e on e.id = vb.event_id
    where vb.venue_id = p_venue_id and vb.status in ('pending', 'approved')
  loop
    for b2 in
      select vb.id, vb.event_id, vb.requested_by, vb.requested_at, e.title,
        vb.starts_at - make_interval(mins => v_setup) as eff_start,
        vb.ends_at + make_interval(mins => v_turnaround) as eff_end
      from public.venue_bookings vb
      join public.events e on e.id = vb.event_id
      where vb.venue_id = p_venue_id and vb.status in ('pending', 'approved')
        and vb.id > b1.id
    loop
      if tstzrange(b1.eff_start, b1.eff_end) && tstzrange(b2.eff_start, b2.eff_end)
        and not exists (
          select 1 from public.venue_booking_conflicts
          where booking_id = b1.id and conflicting_booking_id = b2.id and resolved_at is null
        )
      then
        later_booking_id := case when b2.requested_at > b1.requested_at then b2.id else b1.id end;

        insert into public.venue_booking_conflicts
          (booking_id, conflicting_booking_id, cause, is_responsible, flagged_by)
        values
          (b1.id, b2.id, 'Overlaps another booking once setup/turnaround time is applied',
           b1.id = later_booking_id, actor_id),
          (b2.id, b1.id, 'Overlaps another booking once setup/turnaround time is applied',
           b2.id = later_booking_id, actor_id);

        flagged_count := flagged_count + 1;

        insert into public.notifications (recipient_id, event_id, type, title, message)
        select p.id, b1.event_id, 'venue_conflict_flagged'::public.notification_type,
          'Venue booking conflict',
          '"' || b1.title || '" and "' || b2.title ||
            '" now conflict once setup/turnaround time is applied.'
        from public.profiles p
        where p.role = 'venue_staff'::public.user_role;
      end if;
    end loop;
  end loop;

  -- Pass 3: booking-vs-block.
  for b1 in
    select vb.id, vb.event_id, vb.requested_by, e.title,
      vb.starts_at - make_interval(mins => v_setup) as eff_start,
      vb.ends_at + make_interval(mins => v_turnaround) as eff_end
    from public.venue_bookings vb
    join public.events e on e.id = vb.event_id
    where vb.venue_id = p_venue_id and vb.status in ('pending', 'approved')
  loop
    for blk in
      select id, reason
      from public.venue_unavailability
      where venue_id = p_venue_id and removed_at is null
        and tstzrange(starts_at, ends_at) && tstzrange(b1.eff_start, b1.eff_end)
    loop
      if not exists (
        select 1 from public.venue_booking_conflicts
        where booking_id = b1.id and conflicting_block_id = blk.id and resolved_at is null
      ) then
        insert into public.venue_booking_conflicts
          (booking_id, conflicting_block_id, cause, is_responsible, flagged_by)
        values
          (b1.id, blk.id, 'Overlaps a venue block once setup/turnaround time is applied', true, actor_id);

        flagged_count := flagged_count + 1;

        insert into public.notifications (recipient_id, event_id, type, title, message)
        select p.id, b1.event_id, 'venue_conflict_flagged'::public.notification_type,
          'Venue booking conflict',
          '"' || b1.title || '" now conflicts with the block "' ||
            coalesce(blk.reason, 'Reason not recorded') || '" once setup/turnaround time is applied.'
        from public.profiles p
        where p.role = 'venue_staff'::public.user_role;
      end if;
    end loop;
  end loop;

  select count(*) into active_count
  from public.venue_booking_conflicts c
  join public.venue_bookings vb on vb.id = c.booking_id
  where vb.venue_id = p_venue_id and c.resolved_at is null;

  return jsonb_build_object(
    'venueId', p_venue_id,
    'flaggedCount', flagged_count,
    'clearedCount', cleared_count,
    'activeCount', active_count
  );
end;
$$;

revoke all on function public.recheck_venue_conflicts(uuid, uuid) from public, anon;
grant execute on function public.recheck_venue_conflicts(uuid, uuid) to authenticated, service_role;
