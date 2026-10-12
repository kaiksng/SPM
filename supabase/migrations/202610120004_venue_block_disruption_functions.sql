-- SPM-83: Venue Staff can record a venue block even when bookings already
-- overlap it. Overlapping Pending/Approved bookings and active tentative
-- holds are flagged (venue_booking_disruptions) instead of the block being
-- refused; nothing is cancelled and no event or booking status changes.
-- Overlap uses each booking's occupied window including the venue's setup
-- and turnaround time (venue_effective_window) against the block's raw
-- period.

-- Internal: the bookings a block over [p_starts_at, p_ends_at) would
-- disrupt. Not granted to API roles; the callers below are security definer.
create function public.venue_block_affected_bookings(
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns table (
  booking_id uuid,
  event_id uuid,
  event_title text,
  coordinator_id uuid,
  coordinator_name text,
  venue_name text,
  status public.request_status,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.event_id, e.title, e.assigned_coordinator_id, p.full_name,
    v.name, b.status, b.starts_at, b.ends_at
  from public.venue_bookings b
  join public.events e on e.id = b.event_id
  join public.venues v on v.id = b.venue_id
  left join public.profiles p on p.id = e.assigned_coordinator_id
  where b.venue_id = p_venue_id
    and (
      b.status in ('pending', 'approved')
      or (b.status = 'on_hold' and (b.expires_at is null or b.expires_at > now()))
    )
    and public.venue_effective_window(b.venue_id, b.starts_at, b.ends_at)
      && tstzrange(p_starts_at, p_ends_at, '[)')
  order by b.starts_at, b.id
$$;

revoke all on function public.venue_block_affected_bookings(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- "Before saving an unavailability that overlaps bookings, Venue Staff are
-- shown the affected bookings (event, coordinator, period) and must confirm."
create function public.preview_venue_block_impact(
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns table (
  booking_id uuid,
  event_id uuid,
  event_title text,
  coordinator_id uuid,
  coordinator_name text,
  venue_name text,
  status public.request_status,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.current_user_role() <> 'venue_staff'::public.user_role then
    raise exception 'Only Venue Staff can preview a block' using errcode = '42501';
  end if;
  if p_venue_id is null then
    raise exception 'Select a venue' using errcode = '23514';
  end if;
  if p_starts_at is null then
    raise exception 'Enter a start time' using errcode = '23514';
  end if;
  if p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time' using errcode = '23514';
  end if;

  return query select * from public.venue_block_affected_bookings(p_venue_id, p_starts_at, p_ends_at);
end;
$$;

revoke all on function public.preview_venue_block_impact(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.preview_venue_block_impact(uuid, timestamptz, timestamptz) to authenticated;

-- Singapore-time label used in notification text.
create function public.format_sg_time(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_at at time zone 'Asia/Singapore', 'DD Mon YYYY HH24:MI')
$$;

-- create_venue_block used to refuse any overlap with a booking. It now saves
-- the block, flags the overlapping bookings and tells each affected event's
-- currently assigned coordinator once.
drop function public.create_venue_block(uuid, text, timestamptz, timestamptz);

create function public.create_venue_block(
  p_venue_id uuid,
  p_reason text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason_category public.venue_block_reason_category default 'other'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_affected jsonb := '[]'::jsonb;
  v_venue_name text;
  v_category_label text;
  v_block_period text;
  r record;
  v_coordinator uuid;
  v_event_status public.event_status;
  v_notified uuid[] := '{}';
begin
  if auth.uid() is null or public.current_user_role() <> 'venue_staff'::public.user_role then
    raise exception 'Only Venue Staff can create blocks' using errcode = '42501';
  end if;
  if p_venue_id is null then
    raise exception 'Select a venue' using errcode = '23514';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Enter a reason' using errcode = '23514';
  end if;
  if p_starts_at is null then
    raise exception 'Enter a start time' using errcode = '23514';
  end if;
  if p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time' using errcode = '23514';
  end if;

  -- Booking writes take the same lock in check_booking_against_blocks.
  select name into v_venue_name from public.venues where id = p_venue_id for update;
  if not found then
    raise exception 'Venue not found' using errcode = '23514';
  end if;

  perform public.expire_stale_venue_holds(p_venue_id);

  insert into public.venue_unavailability (venue_id, reason, reason_category, starts_at, ends_at)
  values (p_venue_id, trim(p_reason), coalesce(p_reason_category, 'other'), p_starts_at, p_ends_at)
  returning id into v_id;

  v_category_label := replace(coalesce(p_reason_category, 'other')::text, '_', ' ');
  v_block_period := public.format_sg_time(p_starts_at) || ' to ' || public.format_sg_time(p_ends_at);

  for r in
    select * from public.venue_block_affected_bookings(p_venue_id, p_starts_at, p_ends_at)
  loop
    insert into public.venue_booking_disruptions (booking_id, block_id, flagged_by)
    values (r.booking_id, v_id, auth.uid())
    on conflict (booking_id, block_id) do nothing;

    v_affected := v_affected || jsonb_build_object(
      'bookingId', r.booking_id,
      'eventId', r.event_id,
      'eventTitle', r.event_title,
      'coordinatorId', r.coordinator_id,
      'coordinatorName', r.coordinator_name,
      'status', r.status,
      'startsAt', r.starts_at,
      'endsAt', r.ends_at
    );

    -- One notification per affected event, to whoever is assigned now.
    if not (r.event_id = any (v_notified)) then
      v_notified := v_notified || r.event_id;
      select assigned_coordinator_id, status into v_coordinator, v_event_status
      from public.events where id = r.event_id;

      if v_coordinator is not null then
        insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
        values (
          v_coordinator,
          r.event_id,
          r.booking_id,
          'venue_booking_disrupted'::public.notification_type,
          'Venue booking disrupted - alternative required',
          'The venue booking for "' || r.event_title || '" at ' || v_venue_name ||
            ' (' || public.format_sg_time(r.starts_at) || ' to ' || public.format_sg_time(r.ends_at) ||
            ') is affected by a venue block: ' || v_category_label || ' - ' || trim(p_reason) ||
            ', ' || v_block_period || '. Alternative arrangements are required. ' ||
            'The event has not been cancelled.'
        );
      end if;

      -- A disrupted booking invalidates a safety review in progress: the
      -- event goes back to Planning and the Safety Officer is told.
      if v_event_status = 'pending_safety_check' then
        update public.events set status = 'planning' where id = r.event_id;

        insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
        select p.id, r.event_id, r.booking_id,
          'venue_booking_disrupted'::public.notification_type,
          'Safety check interrupted by a venue disruption',
          '"' || r.event_title || '" returned to Planning because its venue booking at ' ||
            v_venue_name || ' is affected by a venue block (' || v_category_label || ', ' ||
            v_block_period || ').'
        from public.profiles p
        where p.role = 'safety_officer'::public.user_role;
      end if;
    end if;
  end loop;

  return jsonb_build_object('blockId', v_id, 'affected', v_affected);
end;
$$;

revoke all on function public.create_venue_block(uuid, text, timestamptz, timestamptz, public.venue_block_reason_category) from public, anon;
grant execute on function public.create_venue_block(uuid, text, timestamptz, timestamptz, public.venue_block_reason_category) to authenticated;

-- Internal: after a block is shortened or removed, clear the disruptions it
-- no longer justifies and tell each event's coordinator once. A booking that
-- is no longer active (cancelled, rejected, expired hold, ...) is cleared
-- silently; its coordinator already knows.
create function public.clear_block_disruptions(p_block_id uuid, p_block_removed boolean)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_block public.venue_unavailability;
  v_active boolean;
  v_still_overlaps boolean;
  v_cleared integer := 0;
  v_notified uuid[] := '{}';
  v_coordinator uuid;
begin
  select * into v_block from public.venue_unavailability where id = p_block_id;

  for r in
    select d.id as disruption_id, b.id as booking_id, b.event_id, b.venue_id,
      b.status, b.expires_at, b.starts_at, b.ends_at, e.title as event_title,
      e.assigned_coordinator_id, v.name as venue_name
    from public.venue_booking_disruptions d
    join public.venue_bookings b on b.id = d.booking_id
    join public.events e on e.id = b.event_id
    join public.venues v on v.id = b.venue_id
    where d.block_id = p_block_id and d.cleared_at is null
  loop
    v_active := r.status in ('pending', 'approved')
      or (r.status = 'on_hold' and (r.expires_at is null or r.expires_at > now()));
    v_still_overlaps := not p_block_removed
      and public.venue_effective_window(r.venue_id, r.starts_at, r.ends_at)
        && tstzrange(v_block.starts_at, v_block.ends_at, '[)');

    if v_active and v_still_overlaps then
      continue;
    end if;

    update public.venue_booking_disruptions
    set cleared_at = now(), cleared_by = auth.uid()
    where id = r.disruption_id;
    v_cleared := v_cleared + 1;

    if v_active and not (r.event_id = any (v_notified)) then
      v_notified := v_notified || r.event_id;
      -- Whoever is assigned now, not whoever was assigned when it was flagged.
      select assigned_coordinator_id into v_coordinator from public.events where id = r.event_id;
      if v_coordinator is not null then
        insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
        values (
          v_coordinator,
          r.event_id,
          r.booking_id,
          'venue_disruption_cleared'::public.notification_type,
          'Venue issue cleared',
          'The venue issue affecting "' || r.event_title || '" at ' || r.venue_name ||
            ' (' || public.format_sg_time(r.starts_at) || ' to ' || public.format_sg_time(r.ends_at) ||
            ') has been cleared. No alternative arrangement is needed.'
        );
      end if;
    end if;
  end loop;

  return v_cleared;
end;
$$;

revoke all on function public.clear_block_disruptions(uuid, boolean) from public, anon, authenticated;

-- Shorten an active block (the new period must lie inside the old one).
create function public.update_venue_block(
  p_block_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_block public.venue_unavailability;
  v_cleared integer;
begin
  if auth.uid() is null or public.current_user_role() <> 'venue_staff'::public.user_role then
    raise exception 'Only Venue Staff can edit blocks' using errcode = '42501';
  end if;

  select * into v_block from public.venue_unavailability where id = p_block_id for update;
  if not found then
    raise exception 'Block not found' using errcode = '23514';
  end if;
  if v_block.removed_at is not null then
    raise exception 'This block has already been removed' using errcode = '23514';
  end if;
  if v_block.ends_at <= now() then
    raise exception 'Past blocks cannot be changed' using errcode = '23514';
  end if;
  if p_starts_at is null then
    raise exception 'Enter a start time' using errcode = '23514';
  end if;
  if p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time' using errcode = '23514';
  end if;
  if p_starts_at < v_block.starts_at or p_ends_at > v_block.ends_at then
    raise exception 'A block can only be shortened' using errcode = '23514';
  end if;

  perform 1 from public.venues where id = v_block.venue_id for update;

  update public.venue_unavailability
  set starts_at = p_starts_at, ends_at = p_ends_at
  where id = p_block_id;

  v_cleared := public.clear_block_disruptions(p_block_id, false);

  return jsonb_build_object('blockId', p_block_id, 'clearedCount', v_cleared);
end;
$$;

revoke all on function public.update_venue_block(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.update_venue_block(uuid, timestamptz, timestamptz) to authenticated;

-- Removing a block clears every disruption it caused.
create or replace function public.remove_venue_block(p_block_id uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_block public.venue_unavailability;
begin
  if auth.uid() is null or public.current_user_role() <> 'venue_staff'::public.user_role then
    raise exception 'Only Venue Staff can remove blocks' using errcode = '42501';
  end if;
  select * into v_block from public.venue_unavailability where id = p_block_id for update;
  if not found then
    raise exception 'Block not found' using errcode = '23514';
  end if;
  if v_block.removed_at is not null then
    raise exception 'This block has already been removed' using errcode = '23514';
  end if;
  if v_block.ends_at <= now() then
    raise exception 'Past blocks cannot be removed' using errcode = '23514';
  end if;
  update public.venue_unavailability
  set removed_at = now(), removed_by = auth.uid()
  where id = p_block_id;

  perform public.clear_block_disruptions(p_block_id, true);
  return p_block_id;
end;
$$;
