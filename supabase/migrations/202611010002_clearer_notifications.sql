-- Clearer notifications.
--
-- Reasons (cancellation, rejection, safety check, withdrawal) were tacked
-- onto messages unlabelled, e.g. 'The event "X" was cancelled: R'. They are
-- left out; the reason stays on the event and in its change history.
-- Other fixes:
--   * the organiser and the previous coordinator are told who the new
--     coordinator is after a reassignment;
--   * venue booking (and replacement) approved/rejected messages name the
--     event and venue, and go to the event's current coordinator;
--   * a venue conflict flagged or cleared by recheck_venue_conflicts is
--     also sent to each affected event's assigned coordinator (before, only
--     Venue Staff were told), and the cleared ones are tied to the event.
-- Venue hold notifications still go to the coordinator who made the
-- booking: only they can confirm a hold (venue hold AC02).
--
-- Each function is its current definition with only the notification text,
-- recipient or added coordinator notifications changed.

-- cancel_event: the cancellation reason is no longer added to its messages.
CREATE OR REPLACE FUNCTION public.cancel_event(p_event_id uuid, p_reason text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  event_row public.events;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_booking public.venue_bookings;
  v_released_booking boolean := false;
  v_released_reservation boolean := false;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot cancel an event on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to cancel an event'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC1.
  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the assigned coordinator can cancel this event'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC2.
  if event_row.status not in ('requested', 'planning', 'pending_safety_check', 'confirmed') then
    raise exception 'An event with status % cannot be cancelled', event_row.status
      using errcode = 'check_violation';
  end if;

  -- AC3.
  if v_reason is null then
    raise exception 'Give a reason for cancelling this event'
      using errcode = 'check_violation';
  end if;

  -- AC4. Fires enforce_event_status_transition and record_event_status_change
  -- (history row) and events_release_equipment_reservations (equipment
  -- auto-release) as side effects.
  update public.events set status = 'cancelled' where id = p_event_id;

  update public.event_status_history
  set changed_by = coalesce(changed_by, actor_id), reason = v_reason
  where event_id = p_event_id
    and to_status = 'cancelled'
    and changed_at = now()
    and reason is null;

  -- AC5: equipment release attribution. events_release_equipment_reservations
  -- already set status/released_at; auth.uid() is null here (service role),
  -- so stamp the actor it couldn't.
  if exists (
    select 1 from public.equipment_reservations
    where event_id = p_event_id and status = 'cancelled' and released_at = now()
  ) then
    v_released_reservation := true;

    update public.equipment_reservations
    set released_by = actor_id
    where event_id = p_event_id and status = 'cancelled' and released_at = now() and released_by is null;

    update public.equipment_reservation_events ev
    set actor = actor_id
    from public.equipment_reservations r
    where ev.reservation_id = r.id
      and r.event_id = p_event_id
      and ev.action = 'released'
      and ev.actor is null
      and ev.occurred_at = now();
  end if;

  -- AC5/AC6: release every active venue booking/hold in one place.
  for v_booking in
    select * from public.venue_bookings
    where event_id = p_event_id and status in ('pending', 'approved', 'on_hold')
    for update
  loop
    v_released_booking := true;

    update public.venue_bookings
    set status = 'cancelled',
        cancellation_reason = v_reason,
        cancelled_by = actor_id,
        cancelled_at = now()
    where id = v_booking.id;

    update public.venue_booking_disruptions
    set cleared_at = now(), cleared_by = actor_id
    where booking_id = v_booking.id and cleared_at is null;

    -- A hold's "confirm before it expires" reminders no longer apply.
    delete from public.notifications
    where booking_id = v_booking.id and scheduled_for > now();
  end loop;

  -- AC7.
  insert into public.notifications (recipient_id, event_id, type, title, message)
  values
    (event_row.organiser_id, p_event_id, 'cancellation'::public.notification_type,
     'Event cancelled',
     'The event "' || event_row.title || '" was cancelled.'),
    (actor_id, p_event_id, 'cancellation'::public.notification_type,
     'Event cancelled',
     'You cancelled the event "' || event_row.title || '".');

  insert into public.notifications (recipient_id, event_id, type, title, message)
  select
    r.attendee_id,
    p_event_id,
    'cancellation'::public.notification_type,
    'Event cancelled',
    'The event "' || event_row.title || '" you registered for was cancelled.'
  from public.event_registrations r
  where r.event_id = p_event_id and r.status = 'registered';

  if v_released_booking then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      p_event_id,
      'cancellation'::public.notification_type,
      'Event cancelled',
      'The event "' || event_row.title || '" was cancelled and its venue booking(s) released.'
    from public.profiles p
    where p.role = 'venue_staff'::public.user_role;
  end if;

  if v_released_reservation then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      p_event_id,
      'cancellation'::public.notification_type,
      'Event cancelled',
      'The event "' || event_row.title || '" was cancelled and its equipment reservation(s) released.'
    from public.profiles p
    where p.role = 'technical_support_staff'::public.user_role;
  end if;

  if event_row.status = 'pending_safety_check' then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      p_event_id,
      'cancellation'::public.notification_type,
      'Event cancelled',
      'The event "' || event_row.title || '" was cancelled before its safety check was completed.'
    from public.profiles p
    where p.role = 'safety_officer'::public.user_role;
  end if;

  return jsonb_build_object('eventId', p_event_id, 'status', 'cancelled', 'cancelledAt', now());
end;
$function$;

-- decide_event_request: no rejection reason; "Planning" capitalised as everywhere else.
CREATE OR REPLACE FUNCTION public.decide_event_request(p_event_id uuid, p_decision event_decision_type, p_rationale text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  actor_role public.user_role;
  event_row public.events;
  venue_row public.event_venue_requirements;
  registration_row public.event_registration_requirements;
  rationale_value text := nullif(trim(coalesce(p_rationale, '')), '');
  new_status public.event_status;
  issues jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot decide an event request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to decide an event request'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  -- AC03: only rejection requires a reason.
  if p_decision = 'rejected' and rationale_value is null then
    raise exception 'Explain the reason for rejecting this event'
      using errcode = 'check_violation';
  end if;

  select * into event_row
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the assigned coordinator can decide this event request'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'requested' then
    raise exception 'Only a Requested event can be approved or rejected'
      using errcode = 'check_violation';
  end if;

  -- AC01: a genuinely open (unanswered) clarification blocks any decision.
  -- This mirrors enforce_event_status_transition's own guard, which fires as
  -- defense-in-depth on the status update below regardless of this check.
  if exists (
    select 1 from public.clarifications
    where event_id = p_event_id and status = 'open'
  ) then
    raise exception 'This event has an unresolved clarification and cannot be approved or rejected until it is closed'
      using errcode = 'check_violation';
  end if;

  -- AC01: approval additionally requires the event to still be complete —
  -- a permitted clarification edit can leave a required field blank since
  -- save_event_draft only locks which buckets change, not that they stay
  -- non-empty. Mirrors submit_event_request's own checks; rejection has no
  -- such requirement; an incomplete request is itself a valid reason to
  -- reject.
  if p_decision = 'approved' then
    select * into venue_row
    from public.event_venue_requirements
    where event_id = p_event_id;

    select * into registration_row
    from public.event_registration_requirements
    where event_id = p_event_id;

    if char_length(trim(coalesce(event_row.title, ''))) < 3
      or char_length(trim(coalesce(event_row.title, ''))) > 160
    then
      issues := issues || jsonb_build_object(
        'field', 'title',
        'message', 'Event name must contain between 3 and 160 characters');
    end if;

    if coalesce(trim(event_row.purpose), '') = '' then
      issues := issues || jsonb_build_object(
        'field', 'purpose',
        'message', 'Describe the purpose of the event before approving');
    end if;

    if coalesce(trim(event_row.description), '') = '' then
      issues := issues || jsonb_build_object(
        'field', 'description',
        'message', 'Describe the event before approving');
    end if;

    if event_row.starts_at is null then
      issues := issues || jsonb_build_object(
        'field', 'startsAt',
        'message', 'The proposed start date and time is missing');
    end if;

    if event_row.ends_at is null then
      issues := issues || jsonb_build_object(
        'field', 'endsAt',
        'message', 'The proposed end date and time is missing');
    elsif event_row.starts_at is not null and event_row.ends_at <= event_row.starts_at then
      issues := issues || jsonb_build_object(
        'field', 'endsAt',
        'message', 'End time must be after the start time');
    end if;

    if event_row.expected_attendance is null or event_row.expected_attendance <= 0 then
      issues := issues || jsonb_build_object(
        'field', 'expectedAttendance',
        'message', 'Expected attendance is missing or invalid');
    end if;

    if venue_row.event_id is null
      or (
        coalesce(trim(venue_row.preferred_location), '') = ''
        and venue_row.minimum_capacity is null
        and coalesce(trim(venue_row.accessibility_notes), '') = ''
        and coalesce(trim(venue_row.layout_notes), '') = ''
      )
    then
      issues := issues || jsonb_build_object(
        'field', 'venue.preferredLocation',
        'message', 'No venue requirement is recorded');
    end if;


    if jsonb_array_length(issues) > 0 then
      raise exception 'This event does not have enough information to approve'
        using errcode = 'check_violation', detail = issues::text;
    end if;
  end if;

  -- AC06: deciding on an answered clarification is itself how the
  -- coordinator closes it — reading the response is what the decision acts on.
  update public.clarifications
  set status = 'resolved', resolved_at = now(), resolved_by = actor_id
  where event_id = p_event_id and status = 'answered';

  insert into public.event_decisions (event_id, decided_by, decision, rationale)
  values (p_event_id, actor_id, p_decision, rationale_value);

  -- AC02/AC04: the decision (event_decisions.decision) records the outcome
  -- as approved/rejected; the resulting lifecycle status is Planning/Rejected.
  new_status := case p_decision when 'approved' then 'planning' else 'rejected' end;

  update public.events
  set status = new_status
  where id = p_event_id;

  -- The status history trigger records auth.uid(), which is null when the
  -- backend calls this with the service role (every decision made in the
  -- app). Record the deciding coordinator instead, the same way
  -- submit_event_request does (SPM-12 AC03).
  update public.event_status_history
  set changed_by = actor_id
  where event_id = p_event_id
    and to_status = new_status
    and changed_at = now()
    and changed_by is null;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    event_row.organiser_id,
    p_event_id,
    'decision'::public.notification_type,
    case p_decision when 'approved' then 'Event approved' else 'Event rejected' end,
    case p_decision
      when 'approved' then 'Your event "' || event_row.title || '" was approved and has moved to Planning.'
      else 'Your event "' || event_row.title || '" was rejected.'
    end
  );

  return jsonb_build_object('eventId', p_event_id, 'status', new_status::text, 'decidedAt', now());
end;
$function$;

-- decide_event_change_request: no rejection notes.
CREATE OR REPLACE FUNCTION public.decide_event_change_request(p_change_request_id uuid, p_decision event_decision_type, p_review_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  actor_role public.user_role;
  request_row public.event_change_requests;
  event_row public.events;
  notes_value text := nullif(trim(coalesce(p_review_notes, '')), '');
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot decide a change request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to decide a change request'
      using errcode = 'insufficient_privilege';
  end if;

  if p_decision = 'rejected' and notes_value is null then
    raise exception 'Explain the reason for rejecting this change request'
      using errcode = 'check_violation';
  end if;

  select * into request_row from public.event_change_requests where id = p_change_request_id for update;

  if not found then
    raise exception 'Change request not found'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = request_row.event_id;
  select role into actor_role from public.profiles where id = actor_id;

  if event_row.assigned_coordinator_id is not null then
    if event_row.assigned_coordinator_id <> actor_id then
      raise exception 'Only the assigned coordinator can decide this change request'
        using errcode = 'insufficient_privilege';
    end if;
  elsif actor_role is distinct from 'event_coordinator_lead'::public.user_role then
    raise exception 'Only the Coordinator Lead can decide this change request while the event has no assigned coordinator'
      using errcode = 'insufficient_privilege';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Only a change request Pending Review can be decided'
      using errcode = 'check_violation';
  end if;

  if p_decision = 'approved' and notes_value is null then
    raise exception 'Add implementation notes before approving this change request'
      using errcode = 'check_violation';
  end if;

  update public.event_change_requests
  set status = p_decision::text,
      reviewed_by = actor_id,
      review_notes = notes_value,
      reviewed_at = now()
  where id = p_change_request_id;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    request_row.requested_by,
    request_row.event_id,
    'event_change'::public.notification_type,
    case when p_decision = 'approved' then 'Change request approved' else 'Change request rejected' end,
    case when p_decision = 'approved'
      then 'Your change request for "' || event_row.title || '" was approved.'
      else 'Your change request for "' || event_row.title || '" was rejected.'
    end
  );

  return jsonb_build_object('id', p_change_request_id, 'status', p_decision::text);
end;
$function$;

-- decide_event_safety_check: no reason or note in its messages.
CREATE OR REPLACE FUNCTION public.decide_event_safety_check(p_event_id uuid, p_decision event_safety_check_decision_type, p_reason text, p_flagged_booking_ids uuid[] DEFAULT '{}'::uuid[], p_flagged_requirement_ids uuid[] DEFAULT '{}'::uuid[], p_actor_id uuid DEFAULT NULL::uuid, p_flagged_safety_checks text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  actor_role public.user_role;
  event_row public.events;
  reason_value text := nullif(trim(coalesce(p_reason, '')), '');
  submission_id bigint;
  v_flagged_booking_ids uuid[] := '{}'::uuid[];
  v_flagged_requirement_ids uuid[] := '{}'::uuid[];
  v_flagged_safety_checks text[] := '{}'::text[];
  v_new_status public.event_status := case
    when p_decision = 'approved'::public.event_safety_check_decision_type then 'confirmed'::public.event_status
    else 'planning'::public.event_status
  end;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot decide this event''s safety check on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to decide this event''s safety check'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;
  if actor_role is distinct from 'safety_officer'::public.user_role then
    raise exception 'Only a Safety Officer can decide an event''s safety check'
      using errcode = 'insufficient_privilege';
  end if;

  -- Reason is mandatory for Request Changes/Reject, optional for Approve.
  if p_decision <> 'approved'::public.event_safety_check_decision_type and reason_value is null then
    raise exception 'Explain the reason for this decision'
      using errcode = 'check_violation';
  end if;

  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'pending_safety_check' then
    raise exception 'Only an event Pending Safety Check can be decided'
      using errcode = 'check_violation';
  end if;

  select id into submission_id
  from public.event_safety_check_submissions
  where event_id = p_event_id
  order by round desc
  limit 1;

  if submission_id is null then
    raise exception 'No safety check submission was found for this event'
      using errcode = 'insufficient_privilege';
  end if;

  if p_decision = 'changes_requested'::public.event_safety_check_decision_type then
    if exists (
      select 1 from unnest(coalesce(p_flagged_booking_ids, '{}'::uuid[])) as flagged_id
      where not exists (
        select 1 from public.venue_bookings vb where vb.id = flagged_id and vb.event_id = p_event_id
      )
    ) then
      raise exception 'One or more selected venue bookings do not belong to this event'
        using errcode = 'check_violation';
    end if;

    if exists (
      select 1 from unnest(coalesce(p_flagged_requirement_ids, '{}'::uuid[])) as flagged_id
      where not exists (
        select 1 from public.event_equipment_requirements r where r.id = flagged_id and r.event_id = p_event_id
      )
    ) then
      raise exception 'One or more selected equipment arrangements do not belong to this event'
        using errcode = 'check_violation';
    end if;

    -- SPM-90: the coordinator's safety checks can be flagged too.
    select coalesce(array_agg(distinct flag order by flag), '{}'::text[]) into v_flagged_safety_checks
    from unnest(coalesce(p_flagged_safety_checks, '{}'::text[])) as flag;

    if exists (
      select 1 from unnest(v_flagged_safety_checks) as flag
      where flag not in ('emergency_access', 'restrictions', 'crowd_movement', 'equipment_placement')
    ) then
      raise exception 'One or more selected safety checks are not recognised'
        using errcode = 'check_violation';
    end if;

    if 'equipment_placement' = any (v_flagged_safety_checks)
      and not exists (select 1 from public.event_equipment_requirements r where r.event_id = p_event_id)
    then
      raise exception 'This event has no equipment, so equipment placement cannot be flagged'
        using errcode = 'check_violation';
    end if;

    if coalesce(array_length(p_flagged_booking_ids, 1), 0) = 0
      and coalesce(array_length(p_flagged_requirement_ids, 1), 0) = 0
      and coalesce(array_length(v_flagged_safety_checks, 1), 0) = 0
    then
      raise exception 'Select at least one safety check, venue booking or equipment arrangement to flag'
        using errcode = 'check_violation';
    end if;

    v_flagged_booking_ids := coalesce(p_flagged_booking_ids, '{}'::uuid[]);
    v_flagged_requirement_ids := coalesce(p_flagged_requirement_ids, '{}'::uuid[]);

    update public.venue_bookings
    set needs_review = true, needs_review_reason = reason_value
    where id = any(v_flagged_booking_ids);

    update public.event_equipment_requirements
    set needs_review = true, needs_review_reason = reason_value
    where id = any(v_flagged_requirement_ids);

    -- A flagged venue check is unticked, so the coordinator must check it
    -- again; its details are kept. Flagged equipment placement keeps its
    -- text but must be saved again. Either clears its flag.
    if coalesce(array_length(v_flagged_safety_checks, 1), 0) > 0 then
      update public.events
      set safety_check_flags = v_flagged_safety_checks,
          safety_check_flag_reason = reason_value,
          emergency_access_checked = emergency_access_checked and not ('emergency_access' = any (v_flagged_safety_checks)),
          restrictions_checked = restrictions_checked and not ('restrictions' = any (v_flagged_safety_checks)),
          crowd_movement_checked = crowd_movement_checked and not ('crowd_movement' = any (v_flagged_safety_checks))
      where id = p_event_id;
    end if;
  elsif p_decision = 'rejected'::public.event_safety_check_decision_type then
    -- 'rejected': every active venue booking and every equipment
    -- requirement of the event is flagged, regardless of what (if
    -- anything) was passed in — AC3.
    select coalesce(array_agg(vb.id), '{}'::uuid[]) into v_flagged_booking_ids
    from public.venue_bookings vb
    where vb.event_id = p_event_id and vb.status in ('pending', 'approved', 'on_hold');

    select coalesce(array_agg(r.id), '{}'::uuid[]) into v_flagged_requirement_ids
    from public.event_equipment_requirements r
    where r.event_id = p_event_id;

    update public.venue_bookings
    set needs_review = true, needs_review_reason = reason_value
    where event_id = p_event_id and status in ('pending', 'approved', 'on_hold');

    update public.event_equipment_requirements
    set needs_review = true, needs_review_reason = reason_value
    where event_id = p_event_id;
  end if;
  -- 'approved': nothing is flagged — v_flagged_*_ids stay at their '{}' default.

  insert into public.event_safety_check_decisions (
    event_id, submission_id, decided_by, outcome, reason,
    flagged_booking_ids, flagged_requirement_ids, flagged_safety_checks
  ) values (
    p_event_id, submission_id, actor_id, p_decision, reason_value,
    v_flagged_booking_ids, v_flagged_requirement_ids, v_flagged_safety_checks
  );

  -- Request Changes/Reject return the event to Planning; Approve sends it
  -- to Confirmed — the only two non-terminal-or-cancelled targets from
  -- pending_safety_check.
  update public.events set status = v_new_status where id = p_event_id;

  update public.event_status_history
  set changed_by = actor_id, reason = reason_value
  where event_id = p_event_id
    and to_status = v_new_status
    and changed_by is null;

  -- AC7: the coordinator is always notified.
  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    event_row.assigned_coordinator_id,
    p_event_id,
    'safety_check_decision'::public.notification_type,
    case p_decision
      when 'changes_requested'::public.event_safety_check_decision_type then 'Safety check: changes requested'
      when 'approved'::public.event_safety_check_decision_type then 'Safety check: approved'
      else 'Safety check: rejected'
    end,
    case p_decision
      when 'changes_requested'::public.event_safety_check_decision_type
        then 'The Safety Officer requested changes to "' || event_row.title || '"''s safety arrangement.'
      when 'approved'::public.event_safety_check_decision_type
        then 'The Safety Officer approved "' || event_row.title || '"''s safety arrangement. It is now Confirmed.'
      else 'The Safety Officer rejected "' || event_row.title || '"''s safety arrangement.'
    end
  );

  -- AC7, extended: the organiser is notified on Reject and now Approve too
  -- (not on Request Changes) — their event's outcome, not just something
  -- for the coordinator to act on.
  if p_decision in ('rejected'::public.event_safety_check_decision_type, 'approved'::public.event_safety_check_decision_type) then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    values (
      event_row.organiser_id,
      p_event_id,
      'safety_check_decision'::public.notification_type,
      case p_decision
        when 'approved'::public.event_safety_check_decision_type then 'Safety check: approved'
        else 'Safety check: rejected'
      end,
      case p_decision
        when 'approved'::public.event_safety_check_decision_type
          then 'Your event "' || event_row.title || '" passed its safety check and is now Confirmed.'
        else 'The Safety Officer rejected "' || event_row.title || '"''s safety arrangement.'
      end
    );
  end if;

  return jsonb_build_object(
    'eventId', p_event_id,
    'status', v_new_status,
    'outcome', p_decision,
    'flaggedBookingCount', coalesce(array_length(v_flagged_booking_ids, 1), 0),
    'flaggedRequirementCount', coalesce(array_length(v_flagged_requirement_ids, 1), 0),
    'flaggedSafetyCheckCount', coalesce(array_length(v_flagged_safety_checks, 1), 0)
  );
end;
$function$;

-- decide_venue_booking_request: names the event and venue, goes to the event's current coordinator, no rejection reason.
CREATE OR REPLACE FUNCTION public.decide_venue_booking_request(p_booking_id uuid, p_decision venue_booking_decision_type, p_reason text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  actor_role public.user_role;
  booking_row public.venue_bookings;
  reason_value text := nullif(trim(coalesce(p_reason, '')), '');
  new_status public.request_status;
  v_availability jsonb;
  v_event public.events;
  v_original public.venue_bookings;
  v_original_venue_name text;
  v_is_replacement boolean;
  v_venue_name text;
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

  v_is_replacement := booking_row.replaces_booking_id is not null;

  if p_decision = 'approved' then
    perform 1 from public.venues where id = booking_row.venue_id for update;

    v_availability := public.check_venue_booking_availability(
      booking_row.venue_id, booking_row.event_id,
      booking_row.starts_at, booking_row.ends_at, booking_row.id
    );
    if not (v_availability ->> 'available')::boolean then
      raise exception '%', (v_availability ->> 'reason')
        using errcode = 'check_violation';
    end if;
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

  if v_is_replacement then
    select * into v_original from public.venue_bookings where id = booking_row.replaces_booking_id for update;
    select name into v_original_venue_name from public.venues where id = v_original.venue_id;
  end if;

  if v_is_replacement and p_decision = 'approved' then
    -- The replaced booking is cancelled (only that one; the event's other
    -- bookings are untouched) and its disruption is resolved.
    update public.venue_bookings
    set status = 'cancelled'
    where id = v_original.id
      and status in ('pending', 'approved', 'on_hold');

    update public.venue_booking_disruptions
    set cleared_at = now(), cleared_by = actor_id
    where booking_id = v_original.id and cleared_at is null;

    select * into v_event from public.events where id = booking_row.event_id;
    if v_event.status in ('confirmed', 'pending_safety_check') then
      update public.events set status = 'planning' where id = v_event.id;

      if v_event.assigned_coordinator_id is not null then
        insert into public.notifications (recipient_id, event_id, type, title, message)
        values (
          v_event.assigned_coordinator_id,
          v_event.id,
          'status_change'::public.notification_type,
          'Event returned to Planning',
          '"' || v_event.title || '" returned to Planning because its venue changed. It needs to go through readiness and the safety check again.'
        );
      end if;
    end if;
  end if;

  -- AC04: the event's coordinator is notified either way: whoever is
  -- assigned now, so a reassignment since the request doesn't send it to
  -- someone no longer on the event (the requester if none is assigned).
  select * into v_event from public.events where id = booking_row.event_id;
  select name into v_venue_name from public.venues where id = booking_row.venue_id;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    coalesce(v_event.assigned_coordinator_id, booking_row.requested_by),
    booking_row.event_id,
    'venue_decision'::public.notification_type,
    case
      when v_is_replacement and p_decision = 'approved' then 'Replacement venue approved'
      when v_is_replacement then 'Replacement venue rejected'
      when p_decision = 'approved' then 'Venue booking approved'
      else 'Venue booking rejected'
    end,
    case
      when v_is_replacement and p_decision = 'approved'
        then 'The replacement venue booking at ' || v_venue_name || ' for "' || v_event.title
          || '" has been approved. The earlier booking at ' || v_original_venue_name || ' has been cancelled.'
      when v_is_replacement
        then 'The replacement venue booking request at ' || v_venue_name || ' for "' || v_event.title
          || '" was rejected. The booking at ' || v_original_venue_name
          || ' is still disrupted; you can request another venue.'
      when p_decision = 'approved'
        then 'The venue booking request at ' || v_venue_name || ' for "' || v_event.title
          || '" has been approved. It is now a confirmed booking for this period.'
      else 'The venue booking request at ' || v_venue_name || ' for "' || v_event.title || '" was rejected.'
    end
  );

  return jsonb_build_object('bookingId', p_booking_id, 'status', new_status::text, 'decidedAt', now());
end;
$function$;

-- withdraw_venue_booking_request: no reason.
CREATE OR REPLACE FUNCTION public.withdraw_venue_booking_request(p_booking_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  booking_row public.venue_bookings;
  event_row public.events;
  venue_row public.venues;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_was_approved boolean;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot withdraw a venue booking request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to withdraw a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  select * into booking_row from public.venue_bookings where id = p_booking_id for update;

  if not found then
    raise exception 'Venue booking request not found'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = booking_row.event_id;

  -- The event's current coordinator (not whoever submitted the request), so a
  -- reassignment hands pending bookings over (SPM-84 AC8, 202610160005).
  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the event''s assigned coordinator can withdraw this request'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status = 'pending_safety_check' then
    raise exception 'Venue bookings cannot be changed while the event is Pending Safety Check'
      using errcode = 'check_violation';
  end if;

  if booking_row.status not in ('pending', 'approved') then
    raise exception 'Only a Pending or Approved venue booking can be withdrawn or cancelled'
      using errcode = 'check_violation';
  end if;

  if v_reason is null then
    raise exception 'Give a reason for withdrawing or cancelling this venue booking'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.venue_bookings r
    where r.replaces_booking_id = booking_row.id
      and r.status in ('pending', 'approved', 'on_hold')
  ) then
    raise exception 'This booking has a pending replacement. Withdraw the replacement first'
      using errcode = 'check_violation';
  end if;

  v_was_approved := booking_row.status = 'approved';

  update public.venue_bookings
  set status = 'cancelled',
      cancellation_reason = v_reason,
      cancelled_by = actor_id,
      cancelled_at = now()
  where id = p_booking_id;

  -- A released booking no longer needs a replacement.
  update public.venue_booking_disruptions
  set cleared_at = now(), cleared_by = actor_id
  where booking_id = p_booking_id and cleared_at is null;

  select * into venue_row from public.venues where id = booking_row.venue_id;

  insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
  select
    p.id,
    booking_row.event_id,
    p_booking_id,
    'venue_request_withdrawn'::public.notification_type,
    case when v_was_approved then 'Venue booking cancelled' else 'Venue booking request withdrawn' end,
    case when v_was_approved
      then 'The confirmed booking "' || booking_row.label || '" at ' || venue_row.name
        || ' for "' || event_row.title || '" was cancelled by the coordinator.'
      else 'The request "' || booking_row.label || '" for ' || venue_row.name
        || ' for "' || event_row.title || '" was withdrawn by the coordinator.'
    end
  from public.profiles p
  where p.role = 'venue_staff'::public.user_role;

  return p_booking_id;
end;
$function$;

-- reassign_event_coordinator: the organiser and the previous coordinator are told who the new coordinator is.
CREATE OR REPLACE FUNCTION public.reassign_event_coordinator(p_event_id uuid, p_new_coordinator_id uuid, p_reason text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  actor_role public.user_role;
  target_role public.user_role;
  event_row public.events;
  clean_reason text := trim(coalesce(p_reason, ''));
  v_new_coordinator_name text;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot assign an event on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to assign an event'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role is distinct from 'event_coordinator_lead'::public.user_role then
    raise exception 'Only the Event Coordinator Lead can assign or reassign an event'
      using errcode = 'insufficient_privilege';
  end if;

  select role into target_role from public.profiles where id = p_new_coordinator_id;

  if target_role is null then
    raise exception 'That user does not exist'
      using errcode = 'check_violation';
  end if;

  if target_role is distinct from 'event_coordinator'::public.user_role then
    raise exception 'An event can only be assigned to an Event Coordinator'
      using errcode = 'check_violation';
  end if;

  if char_length(clean_reason) > 500 then
    raise exception 'The reason must be 500 characters or fewer'
      using errcode = 'check_violation';
  end if;

  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'check_violation';
  end if;

  if event_row.status in ('draft', 'rejected', 'cancelled', 'completed') then
    raise exception 'An event with status % cannot be assigned', event_row.status
      using errcode = 'check_violation';
  end if;

  if event_row.assigned_coordinator_id = p_new_coordinator_id then
    raise exception 'That coordinator is already assigned to this event'
      using errcode = 'check_violation';
  end if;

  if event_row.assigned_coordinator_id is not null and clean_reason = '' then
    raise exception 'Explain why this event is being reassigned'
      using errcode = 'check_violation';
  end if;

  perform set_config('app.coordinator_reassignment', 'on', true);

  update public.events
  set assigned_coordinator_id = p_new_coordinator_id
  where id = p_event_id;

  perform set_config('app.coordinator_reassignment', 'off', true);

  -- Close the interval the previous coordinator held (a no-op when there
  -- wasn't one — the first assignment has nothing open to close).
  update public.event_coordinator_assignments
  set ended_at = now()
  where event_id = p_event_id and ended_at is null;

  insert into public.event_coordinator_assignments (
    event_id, previous_coordinator_id, new_coordinator_id, changed_by, reason
  )
  values (
    p_event_id,
    event_row.assigned_coordinator_id,
    p_new_coordinator_id,
    actor_id,
    nullif(clean_reason, '')
  );

  select full_name into v_new_coordinator_name from public.profiles where id = p_new_coordinator_id;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    p_new_coordinator_id,
    p_event_id,
    'assignment'::public.notification_type,
    case when event_row.assigned_coordinator_id is null
      then 'New event request assigned to you'
      else 'An event has been assigned to you' end,
    case when event_row.assigned_coordinator_id is null
      then 'Event "' || event_row.title || '" has been assigned to you for review.'
      else 'Event "' || event_row.title || '" has been reassigned to you.' end
  );

  if event_row.assigned_coordinator_id is not null then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    values (
      event_row.assigned_coordinator_id,
      p_event_id,
      'assignment'::public.notification_type,
      'An event has been reassigned',
      'Event "' || event_row.title || '" is no longer assigned to you. It is now coordinated by '
        || coalesce(v_new_coordinator_name, 'another Event Coordinator') || '.'
    );
  end if;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    event_row.organiser_id,
    p_event_id,
    'assignment'::public.notification_type,
    'Your event has a new coordinator',
    'Event "' || event_row.title || '" is now coordinated by '
      || coalesce(v_new_coordinator_name, 'a different Event Coordinator') || '.'
  );

  return jsonb_build_object(
    'eventId', p_event_id,
    'previousCoordinatorId', event_row.assigned_coordinator_id,
    'newCoordinatorId', p_new_coordinator_id
  );
end;
$function$;

-- recheck_venue_conflicts: the events' assigned coordinators are told when a conflict is flagged or cleared, and the cleared notifications name the event.
CREATE OR REPLACE FUNCTION public.recheck_venue_conflicts(p_venue_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  actor_role public.user_role;
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

  if not exists (select 1 from public.venues where id = p_venue_id) then
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
    select lower(public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at)),
           upper(public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at))
    into b1_start, b1_end
    from public.venue_bookings vb
    where vb.id = conflict_row.booking_id and vb.status in ('pending', 'approved', 'on_hold');

    still_overlaps := false;

    if b1_start is not null then
      if conflict_row.conflicting_booking_id is not null then
        select lower(public.venue_effective_window(vb2.venue_id, vb2.starts_at, vb2.ends_at)),
               upper(public.venue_effective_window(vb2.venue_id, vb2.starts_at, vb2.ends_at))
        into b2_start, b2_end
        from public.venue_bookings vb2
        where vb2.id = conflict_row.conflicting_booking_id and vb2.status in ('pending', 'approved', 'on_hold');

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

          insert into public.notifications (recipient_id, event_id, type, title, message)
          select p.id, (select event_id from public.venue_bookings where id = conflict_row.booking_id),
            'venue_conflict_resolved'::public.notification_type,
            'Venue conflict cleared',
            'The conflict between "' || coalesce(cleared_title, 'a booking') || '" and "' ||
              coalesce(cleared_other_title, 'another booking') || '" is no longer active.'
          from public.profiles p
          where p.role = 'venue_staff'::public.user_role;

          insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
          select e.assigned_coordinator_id, e.id, vb.id, 'venue_conflict_resolved'::public.notification_type,
            'Venue conflict cleared',
            'The venue booking for "' || e.title || '" at ' || v.name || ' no longer overlaps the booking for "' ||
              coalesce(case when vb.id = conflict_row.booking_id then cleared_other_title else cleared_title end, 'another event')
              || '". No change is needed.'
          from public.venue_bookings vb
          join public.events e on e.id = vb.event_id
          join public.venues v on v.id = vb.venue_id
          where vb.id in (conflict_row.booking_id, conflict_row.conflicting_booking_id)
            and e.assigned_coordinator_id is not null;
        else
          select vu.reason into cleared_block_reason
          from public.venue_unavailability vu
          where vu.id = conflict_row.conflicting_block_id;

          insert into public.notifications (recipient_id, event_id, type, title, message)
          select p.id, (select event_id from public.venue_bookings where id = conflict_row.booking_id),
            'venue_conflict_resolved'::public.notification_type,
            'Venue conflict cleared',
            'The conflict between "' || coalesce(cleared_title, 'a booking') || '" and the block "' ||
              coalesce(cleared_block_reason, 'Reason not recorded') || '" is no longer active.'
          from public.profiles p
          where p.role = 'venue_staff'::public.user_role;

          insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
          select e.assigned_coordinator_id, e.id, vb.id, 'venue_conflict_resolved'::public.notification_type,
            'Venue conflict cleared',
            'The venue booking for "' || e.title || '" at ' || v.name || ' no longer overlaps the venue block "' ||
              coalesce(cleared_block_reason, 'Reason not recorded') || '". No change is needed.'
          from public.venue_bookings vb
          join public.events e on e.id = vb.event_id
          join public.venues v on v.id = vb.venue_id
          where vb.id = conflict_row.booking_id
            and e.assigned_coordinator_id is not null;
        end if;
      end if;
    end if;
  end loop;

  -- Pass 2: booking-vs-booking.
  for b1 in
    select vb.id, vb.event_id, vb.requested_by, vb.requested_at, e.title,
      lower(public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at)) as eff_start,
      upper(public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at)) as eff_end
    from public.venue_bookings vb
    join public.events e on e.id = vb.event_id
    where vb.venue_id = p_venue_id and vb.status in ('pending', 'approved', 'on_hold')
      and e.status <> 'completed'
  loop
    for b2 in
      select vb.id, vb.event_id, vb.requested_by, vb.requested_at, e.title,
        lower(public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at)) as eff_start,
        upper(public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at)) as eff_end
      from public.venue_bookings vb
      join public.events e on e.id = vb.event_id
      where vb.venue_id = p_venue_id and vb.status in ('pending', 'approved', 'on_hold')
        and vb.id > b1.id
        and e.status <> 'completed'
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

        insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
        select e.assigned_coordinator_id, e.id, vb.id, 'venue_conflict_flagged'::public.notification_type,
          'Venue booking conflict',
          'The venue booking for "' || e.title || '" at ' || v.name || ' now overlaps the booking for "' ||
            case when vb.id = b1.id then b2.title else b1.title end ||
            '" once setup/turnaround time is applied. One of the bookings needs to move.'
        from public.venue_bookings vb
        join public.events e on e.id = vb.event_id
        join public.venues v on v.id = vb.venue_id
        where vb.id in (b1.id, b2.id)
          and e.assigned_coordinator_id is not null;
      end if;
    end loop;
  end loop;

  -- Pass 3: booking-vs-block.
  for b1 in
    select vb.id, vb.event_id, vb.requested_by, e.title,
      lower(public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at)) as eff_start,
      upper(public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at)) as eff_end
    from public.venue_bookings vb
    join public.events e on e.id = vb.event_id
    where vb.venue_id = p_venue_id and vb.status in ('pending', 'approved', 'on_hold')
      and e.status <> 'completed'
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

        insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
        select e.assigned_coordinator_id, e.id, vb.id, 'venue_conflict_flagged'::public.notification_type,
          'Venue booking conflict',
          'The venue booking for "' || e.title || '" at ' || v.name || ' now overlaps the venue block "' ||
            coalesce(blk.reason, 'Reason not recorded') ||
            '" once setup/turnaround time is applied. The booking needs to move to another time or venue.'
        from public.venue_bookings vb
        join public.events e on e.id = vb.event_id
        join public.venues v on v.id = vb.venue_id
        where vb.id = b1.id
          and e.assigned_coordinator_id is not null;
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
$function$;
