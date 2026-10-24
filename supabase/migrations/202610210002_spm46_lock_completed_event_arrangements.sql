-- SPM-46 AC07: once an event is Completed, nothing about its planning or
-- arrangements can change — not through any function, and not through a
-- direct table write that RLS would otherwise allow (a coordinator
-- inserting a venue booking or reservation, Venue Staff or Technical
-- Support Staff updating one, an organiser inserting a change request, an
-- attendee registering or withdrawing).
--
-- One guard on every planning/arrangement table instead of a status check
-- in each function and policy: it also covers tables later stories write to
-- (e.g. change requests, SPM-38). Logs the system writes as part of
-- completing (event_status_history, notifications, audit trails) are left
-- out on purpose. Coordinator assignment has no direct-write policy and its
-- functions already refuse Completed events.
--
-- AFTER, not BEFORE: RLS rejects an unauthorised insert first, with its
-- usual error, and this guard rejects whatever RLS lets through.
create or replace function public.block_changes_to_completed_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_ids uuid[];
begin
  -- The system's own release of equipment reservations when the event
  -- completes (release_reservations_for_ended_event) is the one write
  -- allowed after the status changes.
  if current_setting('spm.releasing_ended_event', true) = 'on' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_event_ids := array[old.event_id];
  elsif tg_op = 'UPDATE' then
    v_event_ids := array[old.event_id, new.event_id];
  else
    v_event_ids := array[new.event_id];
  end if;

  if exists (
    select 1 from public.events
    where id = any (v_event_ids) and status = 'completed'
  ) then
    raise exception 'This event is completed and can no longer be changed'
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

revoke all on function public.block_changes_to_completed_event() from public, anon, authenticated;

create trigger venue_bookings_block_completed_event
after insert or update or delete on public.venue_bookings
for each row execute function public.block_changes_to_completed_event();

create trigger equipment_reservations_block_completed_event
after insert or update or delete on public.equipment_reservations
for each row execute function public.block_changes_to_completed_event();

create trigger event_equipment_requirements_block_completed_event
after insert or update or delete on public.event_equipment_requirements
for each row execute function public.block_changes_to_completed_event();

create trigger event_venue_requirements_block_completed_event
after insert or update or delete on public.event_venue_requirements
for each row execute function public.block_changes_to_completed_event();

create trigger event_required_facilities_block_completed_event
after insert or update or delete on public.event_required_facilities
for each row execute function public.block_changes_to_completed_event();

create trigger event_registration_requirements_block_completed_event
after insert or update or delete on public.event_registration_requirements
for each row execute function public.block_changes_to_completed_event();

create trigger event_registrations_block_completed_event
after insert or update or delete on public.event_registrations
for each row execute function public.block_changes_to_completed_event();

create trigger clarifications_block_completed_event
after insert or update or delete on public.clarifications
for each row execute function public.block_changes_to_completed_event();

create trigger event_change_requests_block_completed_event
after insert or update or delete on public.event_change_requests
for each row execute function public.block_changes_to_completed_event();

create trigger equipment_arrangement_updates_block_completed_event
after insert or update or delete on public.equipment_arrangement_updates
for each row execute function public.block_changes_to_completed_event();

create trigger event_safety_check_submissions_block_completed_event
after insert or update or delete on public.event_safety_check_submissions
for each row execute function public.block_changes_to_completed_event();

create trigger event_safety_check_decisions_block_completed_event
after insert or update or delete on public.event_safety_check_decisions
for each row execute function public.block_changes_to_completed_event();

-- Based on 202610150002; only the two set_config calls are new. The flag is
-- transaction-local and switched off again straight after the loop, so it
-- covers nothing but this release.
create or replace function public.release_reservations_for_ended_event(p_event_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_reservation public.equipment_reservations;
begin
  perform set_config('spm.releasing_ended_event', 'on', true);

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

  perform set_config('spm.releasing_ended_event', 'off', true);
end;
$$;

revoke all on function public.release_reservations_for_ended_event(uuid, text) from public, anon, authenticated;
