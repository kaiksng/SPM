-- SPM-39: applying a change request no longer marks arrangements Needs Review.
--
-- The coordinator sees the change request at the top of the event and,
-- having applied it, updates the affected venue bookings and equipment
-- themselves. So apply_event_change_request (last 202610300005) now:
--   * no longer sets needs_review on venue bookings or equipment
--     requirements, and no longer re-checks booking windows to mark
--     "Conflict" (former AC08/AC09);
--   * still tells Venue Staff and Technical Support Staff what changed
--     (AC02), still returns a Confirmed or Pending Safety Check event to
--     Planning for a safety-relevant change (AC10), and still never changes
--     a booking or reservation (AC11);
--   * still marks an affected equipment reservation for re-checking
--     (SPM-32 AC04), which is a separate flag from Needs Review.
-- Otherwise unchanged.
--
-- Flags earlier change requests left are cleared, so they no longer block
-- readiness. Flags set for other reasons (a venue's capacity reduction, a
-- safety check decision) are kept: only rows whose reason is the change
-- request's own wording are cleared.

CREATE OR REPLACE FUNCTION public.apply_event_change_request(p_change_request_id uuid, p_updates jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  request_row public.event_change_requests;
  event_row public.events;
  old_venue public.event_venue_requirements;
  new_venue public.event_venue_requirements;
  old_registration public.event_registration_requirements;
  new_registration public.event_registration_requirements;
  old_facilities text[];
  new_facilities text[];
  prior_reservation_ids uuid[];
  prior_requirements jsonb;
  title_value text := trim(coalesce(p_updates ->> 'title', ''));
  purpose_value text := nullif(trim(p_updates ->> 'purpose'), '');
  description_value text := nullif(trim(p_updates ->> 'description'), '');
  event_type_value text := nullif(trim(p_updates ->> 'eventType'), '');
  attendance_text text := nullif(trim(p_updates ->> 'expectedAttendance'), '');
  minimum_capacity_text text := nullif(trim(p_updates #>> '{venue,minimumCapacity}'), '');
  registration_capacity_text text := nullif(trim(p_updates #>> '{registration,capacity}'), '');
  starts_at_value timestamptz;
  ends_at_value timestamptz;
  registration_opens_value timestamptz;
  registration_closes_value timestamptz;
  time_changed boolean;
  attendance_changed boolean;
  venue_changed boolean;
  equipment_changed boolean;
  registration_changed boolean;
  returned_to_planning boolean := false;
  changed_parts text[] := array[]::text[];
  base_reason text;
  booking_reason text;
  b record;
  affected_booking_ids uuid[] := array[]::uuid[];
  affected_requirement_ids uuid[] := array[]::uuid[];
  orphaned_reservation_count integer;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot apply a change request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to apply a change request'
      using errcode = 'insufficient_privilege';
  end if;

  select * into request_row from public.event_change_requests where id = p_change_request_id for update;

  if not found then
    raise exception 'Change request not found'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = request_row.event_id for update;

  -- AC07: applying is the assigned coordinator's job only — a Lead who
  -- approved on an unassigned event assigns a coordinator first (AC03).
  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the assigned coordinator can apply this change request'
      using errcode = 'insufficient_privilege';
  end if;

  if request_row.status <> 'approved' then
    raise exception 'Only an Approved change request can be applied'
      using errcode = 'check_violation';
  end if;

  if event_row.status not in ('requested', 'planning', 'confirmed', 'pending_safety_check') then
    raise exception 'Changes can only be applied to a Requested, Planning, Confirmed or Pending Safety Check event'
      using errcode = 'check_violation';
  end if;

  -- Same field rules as update_event_as_coordinator, without its Planning locks.
  if char_length(title_value) < 3 or char_length(title_value) > 160 then
    raise exception 'Event name must contain between 3 and 160 characters'
      using errcode = 'check_violation';
  end if;

  if attendance_text is not null and attendance_text !~ '^[1-9][0-9]*$' then
    raise exception 'Expected attendance must be a positive whole number'
      using errcode = 'check_violation';
  end if;

  if minimum_capacity_text is not null and minimum_capacity_text !~ '^[1-9][0-9]*$' then
    raise exception 'Minimum capacity must be a positive whole number'
      using errcode = 'check_violation';
  end if;

  if registration_capacity_text is not null and registration_capacity_text !~ '^[1-9][0-9]*$' then
    raise exception 'Registration capacity must be a positive whole number'
      using errcode = 'check_violation';
  end if;

  starts_at_value := nullif(p_updates ->> 'startsAt', '')::timestamptz;
  ends_at_value := nullif(p_updates ->> 'endsAt', '')::timestamptz;
  registration_opens_value := nullif(p_updates #>> '{registration,opensAt}', '')::timestamptz;
  registration_closes_value := nullif(p_updates #>> '{registration,closesAt}', '')::timestamptz;

  if starts_at_value is null or ends_at_value is null then
    raise exception 'Enter the event start and end time'
      using errcode = 'check_violation';
  end if;

  if ends_at_value <= starts_at_value then
    raise exception 'End time must be after the start time'
      using errcode = 'check_violation';
  end if;

  if starts_at_value is distinct from event_row.starts_at and starts_at_value <= now() then
    raise exception 'The new start time must be in the future'
      using errcode = 'check_violation';
  end if;

  if registration_opens_value is not null
    and registration_closes_value is not null
    and registration_closes_value <= registration_opens_value
  then
    raise exception 'Registration closing time must be after its opening time'
      using errcode = 'check_violation';
  end if;

  if coalesce(jsonb_typeof(p_updates #> '{venue,facilities}'), 'null') not in ('array', 'null') then
    raise exception 'Facilities must be a list'
      using errcode = 'check_violation';
  end if;

  -- Snapshot what the event looks like before the change.
  select * into old_venue from public.event_venue_requirements where event_id = event_row.id;
  select * into old_registration from public.event_registration_requirements where event_id = event_row.id;
  select coalesce(array_agg(facility_name order by facility_name), array[]::text[]) into old_facilities
  from public.event_required_facilities where event_id = event_row.id;
  select coalesce(array_agg(id), array[]::uuid[]) into prior_reservation_ids
  from public.equipment_reservations
  where event_id = event_row.id and status in ('pending', 'approved') and requirement_id is not null;

  -- SPM-40 AC07 / SPM-39 AC01: registration settings can't be changed from
  -- Pending Safety Check onward, including through a change request. The
  -- form always sends them, so only a real change is refused. Times are
  -- compared to the minute, the precision the form works in.
  if event_row.status in ('pending_safety_check', 'confirmed')
    and (
      coalesce((p_updates #>> '{registration,required}')::boolean, false)
        is distinct from coalesce(old_registration.registration_required, false)
      or date_trunc('minute', registration_opens_value)
        is distinct from date_trunc('minute', old_registration.registration_opens_at)
      or date_trunc('minute', registration_closes_value)
        is distinct from date_trunc('minute', old_registration.registration_closes_at)
      or registration_capacity_text::integer is distinct from old_registration.attendee_capacity
      or coalesce((p_updates #>> '{registration,waitlistEnabled}')::boolean, false)
        is distinct from coalesce(old_registration.waitlist_enabled, false)
    ) then
    raise exception 'Registration settings can''t be changed once the event has been submitted for its safety check'
      using errcode = 'check_violation';
  end if;
  select coalesce(jsonb_object_agg(
    id::text, jsonb_build_array(equipment_item_id, quantity, required_from, required_until, notes)
  ), '{}'::jsonb) into prior_requirements
  from public.event_equipment_requirements where event_id = event_row.id;

  update public.events
  set
    title = title_value,
    purpose = purpose_value,
    description = description_value,
    event_type = event_type_value,
    expected_attendance = attendance_text::integer,
    starts_at = starts_at_value,
    ends_at = ends_at_value
  where id = event_row.id;

  insert into public.event_venue_requirements (
    event_id, preferred_location, minimum_capacity, accessibility_notes, layout_notes
  )
  values (
    event_row.id,
    nullif(trim(p_updates #>> '{venue,preferredLocation}'), ''),
    minimum_capacity_text::integer,
    nullif(trim(p_updates #>> '{venue,accessibilityNotes}'), ''),
    nullif(trim(p_updates #>> '{venue,layoutNotes}'), '')
  )
  on conflict (event_id) do update
  set
    preferred_location = excluded.preferred_location,
    minimum_capacity = excluded.minimum_capacity,
    accessibility_notes = excluded.accessibility_notes,
    layout_notes = excluded.layout_notes
  returning * into new_venue;

  delete from public.event_required_facilities where event_id = event_row.id;

  insert into public.event_required_facilities (event_id, facility_name)
  select distinct event_row.id, trim(value)
  from jsonb_array_elements_text(coalesce(p_updates #> '{venue,facilities}', '[]'::jsonb))
  where trim(value) <> '';

  select coalesce(array_agg(facility_name order by facility_name), array[]::text[]) into new_facilities
  from public.event_required_facilities where event_id = event_row.id;

  equipment_changed := public.save_event_equipment_requirements(event_row.id, p_updates -> 'equipment') > 0;

  insert into public.event_registration_requirements (
    event_id, registration_required, registration_opens_at, registration_closes_at,
    attendee_capacity, waitlist_enabled
  )
  values (
    event_row.id,
    coalesce((p_updates #>> '{registration,required}')::boolean, false),
    registration_opens_value,
    registration_closes_value,
    registration_capacity_text::integer,
    coalesce((p_updates #>> '{registration,waitlistEnabled}')::boolean, false)
  )
  on conflict (event_id) do update
  set
    registration_required = excluded.registration_required,
    registration_opens_at = excluded.registration_opens_at,
    registration_closes_at = excluded.registration_closes_at,
    attendee_capacity = excluded.attendee_capacity,
    waitlist_enabled = excluded.waitlist_enabled
  returning * into new_registration;

  -- AC01: what did the change actually touch?
  time_changed := starts_at_value is distinct from event_row.starts_at
    or ends_at_value is distinct from event_row.ends_at;
  attendance_changed := attendance_text::integer is distinct from event_row.expected_attendance;
  venue_changed := new_venue.preferred_location is distinct from old_venue.preferred_location
    or new_venue.minimum_capacity is distinct from old_venue.minimum_capacity
    or new_venue.accessibility_notes is distinct from old_venue.accessibility_notes
    or new_venue.layout_notes is distinct from old_venue.layout_notes
    or new_facilities is distinct from old_facilities;
  registration_changed := new_registration.registration_required is distinct from old_registration.registration_required
    or new_registration.registration_opens_at is distinct from old_registration.registration_opens_at
    or new_registration.registration_closes_at is distinct from old_registration.registration_closes_at
    or new_registration.attendee_capacity is distinct from old_registration.attendee_capacity
    or new_registration.waitlist_enabled is distinct from old_registration.waitlist_enabled;

  if time_changed then changed_parts := changed_parts || 'the event time'::text; end if;
  if attendance_changed then changed_parts := changed_parts || 'the expected attendance'::text; end if;
  if venue_changed then changed_parts := changed_parts || 'the venue requirements'::text; end if;

  -- AC01/AC02/AC11: the coordinator updates the bookings themselves, from
  -- the change shown at the top of the event; Venue Staff are told what
  -- changed. Nothing is flagged or re-checked, and no booking is changed.
  if time_changed or attendance_changed or venue_changed then
    base_reason := 'An approved change request changed ' || array_to_string(changed_parts, ', ') || '.';

    for b in
      select vb.id, vb.venue_id, vb.starts_at, vb.ends_at, vb.needs_review, vb.needs_review_reason
      from public.venue_bookings vb
      where vb.event_id = event_row.id and vb.status in ('pending', 'approved', 'on_hold')
    loop
      affected_booking_ids := affected_booking_ids || b.id;

      insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
      select
        p.id,
        event_row.id,
        b.id,
        'venue_change_review'::public.notification_type,
        'Venue booking affected by a change',
        '"' || title_value || '": ' || base_reason || ' Its coordinator will update this booking if needed.'
      from public.profiles p
      where p.role = 'venue_staff'::public.user_role;
    end loop;
  end if;

  -- AC01: a time change affects every requirement; an equipment change
  -- affects only the ones it added or changed.
  if time_changed then
    select coalesce(array_agg(id), array[]::uuid[]) into affected_requirement_ids
    from public.event_equipment_requirements where event_id = event_row.id;
  elsif equipment_changed then
    select coalesce(array_agg(r.id), array[]::uuid[]) into affected_requirement_ids
    from public.event_equipment_requirements r
    where r.event_id = event_row.id
      and (prior_requirements -> r.id::text) is distinct from
        jsonb_build_array(r.equipment_item_id, r.quantity, r.required_from, r.required_until, r.notes);
  end if;

  -- SPM-32 AC04: a reservation the change affects is marked for re-checking
  -- by Technical Support Staff. The requirement itself is not flagged.
  if array_length(affected_requirement_ids, 1) is not null then
    update public.equipment_reservations
    set needs_recheck = true,
        recheck_reason = 'An approved change request changed this requirement. Check the reservation still fits.'
    where requirement_id = any (affected_requirement_ids) and status in ('pending', 'approved');
  end if;

  -- AC11: a reservation whose requirement was removed is kept (its
  -- requirement_id is set null by the foreign key), only marked for recheck.
  update public.equipment_reservations
  set needs_recheck = true,
      recheck_reason = 'An approved change request removed the equipment requirement this reservation was for.'
  where id = any (prior_reservation_ids) and requirement_id is null;

  get diagnostics orphaned_reservation_count = row_count;

  if array_length(affected_requirement_ids, 1) is not null or orphaned_reservation_count > 0 then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      event_row.id,
      'equipment_change_review'::public.notification_type,
      'Equipment needs review',
      'An approved change request for "' || title_value || '" changed its equipment arrangements. Review them.'
    from public.profiles p
    where p.role = 'technical_support_staff'::public.user_role;
  end if;

  -- AC10: a safety-relevant change sends the event back for a new review.
  if event_row.status in ('confirmed', 'pending_safety_check')
    and (time_changed or attendance_changed or venue_changed or equipment_changed)
  then
    update public.events set status = 'planning' where id = event_row.id;

    update public.event_status_history
    set changed_by = actor_id, reason = 'An approved change request was applied'
    where event_id = event_row.id
      and to_status = 'planning'
      and changed_by is null
      and changed_at = now();

    returned_to_planning := true;

    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      event_row.id,
      'safety_review_reset'::public.notification_type,
      'Event returned for a new safety review',
      '"' || title_value || '" was returned to Planning after an approved change. It needs a new safety review once resubmitted.'
    from public.profiles p
    where p.role = 'safety_officer'::public.user_role;
  end if;

  -- PB-07 history names who made each change.
  update public.event_field_changes
  set changed_by = actor_id
  where event_id = event_row.id and changed_by is null and changed_at = now();

  update public.event_equipment_changes
  set changed_by = actor_id
  where event_id = event_row.id and changed_by is null and changed_at = now();

  update public.event_change_requests
  set status = 'implemented', implemented_by = actor_id, implemented_at = now()
  where id = p_change_request_id;

  return jsonb_build_object(
    'id', p_change_request_id,
    'status', 'implemented',
    'eventStatus', case when returned_to_planning then 'planning' else event_row.status::text end,
    'returnedToPlanning', returned_to_planning,
    'affectedBookingIds', to_jsonb(affected_booking_ids),
    'affectedRequirementIds', to_jsonb(affected_requirement_ids),
    'registrationChanged', registration_changed
  );
end;
$function$;

update public.venue_bookings
set needs_review = false, needs_review_reason = null
where needs_review
  and (needs_review_reason like 'An approved change request changed %'
    or needs_review_reason like 'Conflict – %An approved change request changed %');

update public.event_equipment_requirements
set needs_review = false, needs_review_reason = null
where needs_review
  and needs_review_reason in (
    'An approved change request changed the event time. Review this equipment.',
    'An approved change request changed this equipment requirement.'
  );
