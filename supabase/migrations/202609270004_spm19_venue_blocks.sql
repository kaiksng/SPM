-- SPM-19: retain removed blocks while only active blocks affect availability.
alter table public.venue_unavailability
  add column removed_at timestamptz,
  add column removed_by uuid references public.profiles (id);

create index venue_unavailability_active_period_idx
  on public.venue_unavailability using gist
  (venue_id, tstzrange(starts_at, ends_at))
  where removed_at is null;

-- Writes go through the functions below so history cannot be deleted or edited.
drop policy "venue unavailability managed by venue staff" on public.venue_unavailability;

create function public.create_venue_block(
  p_venue_id uuid, p_reason text, p_starts_at timestamptz, p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
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
  perform 1 from public.venues where id = p_venue_id for update;
  if not found then
    raise exception 'Venue not found' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.venue_bookings b
    where b.venue_id = p_venue_id and b.status in ('pending', 'approved')
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'This block overlaps a Pending or Confirmed booking'
      using errcode = '23514';
  end if;
  insert into public.venue_unavailability (venue_id, reason, starts_at, ends_at)
  values (p_venue_id, trim(p_reason), p_starts_at, p_ends_at)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.remove_venue_block(p_block_id uuid) returns uuid
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
  return p_block_id;
end;
$$;

-- Protect the invariant even if a booking is written outside the normal RPC.
create function public.check_booking_against_blocks() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status not in ('pending', 'approved') then return new; end if;
  perform 1 from public.venues where id = new.venue_id for update;
  if exists (
    select 1 from public.venue_unavailability u
    where u.venue_id = new.venue_id and u.removed_at is null
      and tstzrange(u.starts_at, u.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'This venue is unavailable for part of this event''s schedule'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger venue_bookings_check_blocks
before insert or update of venue_id, starts_at, ends_at, status on public.venue_bookings
for each row execute function public.check_booking_against_blocks();

revoke all on function public.create_venue_block(uuid, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.remove_venue_block(uuid) from public, anon;
grant execute on function public.create_venue_block(uuid, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.remove_venue_block(uuid) to authenticated;
