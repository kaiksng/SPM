-- SPM-43-TC-004: An attendee cannot withdraw another attendee's registration
-- Acceptance criterion: AC 1
-- Login: Attendee (daniel@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): see Test Data (reasons, choices)
-- Source: refined Preconditions and Test Data of docs/Project Planning_refined_v2.xlsx; dates and shared events per its Questions tab
-- Records restored: profiles andy, daniel, daryl, jasmine, joseph, joyce, sally, tom; event "Townhall 2026" (confirmed, id 00000000-0000-4000-8044-000000000201, organiser jasmine, coordinator joyce, approved booking at Grand Ballroom, equipment PA Sound System x1 reserved, 1 safety round(s), history draft > requested > planning > pending_safety_check > confirmed); registrations on "Townhall 2026": joseph registered
-- Must-not-exist conditions enforced: notifications, extra venue requests and extra equipment rows on "Townhall 2026"; other test-account registrations on "Townhall 2026"
-- Defaults added: Marina Bay test venues (300 pax, open all day); December 2026 evening event times; workflow dates 18 Sep - 28 Oct 2026
-- Shared records: SPM-43/44 share their events, and SPM-44/89 share Grand Ballroom and PA Sound System; test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm43_tc004   (from the repo root)

BEGIN;

-- Lets this file set assigned coordinators and the equipment request fields of its own test events.
SET LOCAL app.coordinator_reassignment = 'on';
SET LOCAL app.requesting_equipment = 'on';

-- Profile and role for andy@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'andy@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Andy', 'andy@gmail.com', 'technical_support_staff')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

-- Profile and role for daniel@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'daniel@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'daniel@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Daniel', 'daniel@gmail.com', 'attendee')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

-- Profile and role for daryl@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'daryl@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Daryl', 'daryl@gmail.com', 'venue_staff')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

-- Profile and role for jasmine@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'jasmine@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Jasmine', 'jasmine@gmail.com', 'event_organiser')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

-- Profile and role for joseph@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'joseph@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'joseph@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Joseph', 'joseph@gmail.com', 'attendee')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

-- Profile and role for joyce@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'joyce@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Joyce', 'joyce@gmail.com', 'event_coordinator')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

-- Profile and role for sally@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'sally@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Sally', 'sally@gmail.com', 'safety_officer')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

-- Profile and role for tom@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'tom@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Tom', 'tom@gmail.com', 'event_coordinator_lead')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

-- Venue "Grand Ballroom" (Marina Bay, 300 pax, open all day; fixed id 00000000-0000-4000-8044-000000000101). Stops if a real venue has this name.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues WHERE lower(name) = lower('Grand Ballroom') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Grand Ballroom" exists. Nothing was changed.';
  END IF;
  INSERT INTO public.venues AS ve (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
  VALUES ('00000000-0000-4000-8044-000000000101', 'Grand Ballroom', 'Marina Bay', ARRAY['Marina Bay'], 300, '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "00:00", "closesAt": "23:59"}]'::jsonb, 0, 0)
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, location = EXCLUDED.location, area_tags = EXCLUDED.area_tags, capacity = EXCLUDED.capacity,
      operating_hours = EXCLUDED.operating_hours, setup_time_minutes = 0, turnaround_time_minutes = 0
  WHERE (ve.name, ve.location, ve.area_tags, ve.capacity, ve.operating_hours, ve.setup_time_minutes, ve.turnaround_time_minutes)
        IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.location, EXCLUDED.area_tags, EXCLUDED.capacity, EXCLUDED.operating_hours, 0, 0);
END $$;

-- Equipment catalogue item "PA Sound System" (Audio, 4 units; fixed id 00000000-0000-4000-8089-000000000502). Stops if a real item has this name.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.equipment_items WHERE (lower(trim(name)) = lower('PA Sound System') OR code = 'uat-pa-sound-system') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real equipment item named "PA Sound System" exists. Nothing was changed.';
  END IF;
  INSERT INTO public.equipment_items AS it (id, name, code, category, total_quantity, retired_at, retired_by)
  VALUES ('00000000-0000-4000-8089-000000000502', 'PA Sound System', 'uat-pa-sound-system', 'Audio', 0, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, category = EXCLUDED.category, retired_at = NULL, retired_by = NULL
  WHERE (it.name, it.code, it.category, it.retired_at) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.code, EXCLUDED.category, NULL::timestamptz);
  -- Units 1-4 in service (the item's total follows its units).
  INSERT INTO public.equipment_units (equipment_item_id, unit_number)
  SELECT '00000000-0000-4000-8089-000000000502', n FROM generate_series(1, 4) n
  ON CONFLICT (equipment_item_id, unit_number) DO NOTHING;
  UPDATE public.equipment_units SET retired_at = NULL, retired_by = NULL
  WHERE equipment_item_id = '00000000-0000-4000-8089-000000000502' AND unit_number <= 4 AND retired_at IS NOT NULL;
END $$;

-- Event "Townhall 2026" (Confirmed; fixed id 00000000-0000-4000-8044-000000000201). Stops if a real event has this title.
-- A status that can't move back (e.g. Cancelled) is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Townhall 2026') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Townhall 2026';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8044-000000000201';
  IF FOUND AND v_status <> 'confirmed' AND NOT public.event_status_transition_allowed(v_status, 'confirmed') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8044-000000000201';
  END IF;
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged)
  VALUES ('00000000-0000-4000-8044-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Townhall 2026', 'Annual townhall with the leadership team.', 50, '2026-12-10 19:00:00+08', '2026-12-10 21:00:00+08', 'confirmed',
          '2026-09-20 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true)
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id, title = EXCLUDED.title,
      description = EXCLUDED.description, expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, requirements_acknowledged = true
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance, ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title, EXCLUDED.description,
                          EXCLUDED.expected_attendance, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status);
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location)
  VALUES ('00000000-0000-4000-8044-000000000201', 'Marina Bay')
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location
  WHERE r.preferred_location IS DISTINCT FROM EXCLUDED.preferred_location;
  -- Registration: required, capacity 50, open 2026-10-01 to 2026-11-30, waiting list off, withdrawal allowed.
  INSERT INTO public.event_registration_requirements AS s (event_id, registration_required, attendee_capacity, registration_opens_at,
                                                           registration_closes_at, waitlist_enabled, withdrawal_permitted)
  VALUES ('00000000-0000-4000-8044-000000000201', true, 50, '2026-10-01 09:00:00+08', '2026-11-30 18:00:00+08', false, true)
  ON CONFLICT (event_id) DO UPDATE
  SET registration_required = true, attendee_capacity = EXCLUDED.attendee_capacity, registration_opens_at = EXCLUDED.registration_opens_at,
      registration_closes_at = EXCLUDED.registration_closes_at, waitlist_enabled = EXCLUDED.waitlist_enabled, withdrawal_permitted = true
  WHERE (s.registration_required, s.attendee_capacity, s.registration_opens_at, s.registration_closes_at, s.waitlist_enabled, s.withdrawal_permitted)
        IS DISTINCT FROM (true, EXCLUDED.attendee_capacity, EXCLUDED.registration_opens_at, EXCLUDED.registration_closes_at,
                          EXCLUDED.waitlist_enabled, true);
END $$;
-- Records "Townhall 2026" has as if it went through the app (only rows of this test event are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom); the coordinator approved the request.
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8044-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8044-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8044-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8044-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8044-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8044-000000000201' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-09-22 10:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8044-000000000201';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8044-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-09-22 10:00:00+08');
  END IF;

  -- Approved main-venue booking at "Grand Ballroom" for the event's time (requested by the coordinator, approved by Daryl).
  IF EXISTS (SELECT 1 FROM public.venue_bookings WHERE venue_id = '00000000-0000-4000-8044-000000000101' AND status IN ('pending', 'approved', 'on_hold')
             AND NOT (event_id::text LIKE '00000000-0000-4000-80%' OR event_id::text LIKE '00000000-0000-0000-00%') AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-10 19:00:00+08', '2026-12-10 21:00:00+08')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real booking holds "Grand Ballroom" at the time of "Townhall 2026". Nothing was changed.';
  END IF;
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8044-000000000201' AND id <> '00000000-0000-4000-8044-000000000401' AND status IN ('pending', 'approved', 'on_hold');
  INSERT INTO public.venue_bookings AS vb (id, event_id, venue_id, starts_at, ends_at, status, is_main_venue, expected_headcount,
                                           requested_by, requested_at, decided_by, decided_at, held_by, expires_at,
                                           cancelled_at, cancelled_by, cancellation_reason, needs_review, needs_review_reason)
  VALUES ('00000000-0000-4000-8044-000000000401', '00000000-0000-4000-8044-000000000201', '00000000-0000-4000-8044-000000000101', '2026-12-10 19:00:00+08', '2026-12-10 21:00:00+08', 'approved', true, 50, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-09-23 10:00:00+08',
          (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), '2026-09-24 10:00:00+08', NULL, NULL, NULL, NULL, NULL, false, NULL)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = 'approved', is_main_venue = true, expected_headcount = EXCLUDED.expected_headcount, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at, held_by = NULL,
      expires_at = NULL, cancelled_at = NULL, cancelled_by = NULL, cancellation_reason = NULL, needs_review = false, needs_review_reason = NULL
  WHERE (vb.event_id, vb.venue_id, vb.starts_at, vb.ends_at, vb.status, vb.is_main_venue, vb.expected_headcount, vb.requested_by,
         vb.requested_at, vb.decided_by, vb.decided_at, vb.held_by, vb.expires_at, vb.cancelled_at, vb.needs_review)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.starts_at, EXCLUDED.ends_at, 'approved'::public.request_status,
                          true, EXCLUDED.expected_headcount, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.decided_by,
                          EXCLUDED.decided_at, NULL::uuid, NULL::timestamptz, NULL::timestamptz, false);
  UPDATE public.events SET venue_id = '00000000-0000-4000-8044-000000000101' WHERE id = '00000000-0000-4000-8044-000000000201' AND venue_id IS DISTINCT FROM '00000000-0000-4000-8044-000000000101';
  -- Must not exist: open conflict or disruption flags on this booking.
  DELETE FROM public.venue_booking_conflicts WHERE booking_id = '00000000-0000-4000-8044-000000000401';
  DELETE FROM public.venue_booking_disruptions WHERE booking_id = '00000000-0000-4000-8044-000000000401';

  -- Equipment: exactly the listed requirements, each sent to Technical Support and reserved in full by Andy.
  DELETE FROM public.equipment_arrangement_updates WHERE event_id = '00000000-0000-4000-8044-000000000201' AND requirement_id NOT IN ('00000000-0000-4000-8044-000000000611');
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8044-000000000201' AND (requirement_id IS NULL OR requirement_id NOT IN ('00000000-0000-4000-8044-000000000611'));
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8044-000000000201' AND id NOT IN ('00000000-0000-4000-8044-000000000611');

  INSERT INTO public.event_equipment_requirements AS q (id, event_id, equipment_item_id, equipment_name, quantity, required_from,
                                                       required_until, notes, needs_review, needs_review_reason, requested_at, requested_by)
  VALUES ('00000000-0000-4000-8044-000000000611', '00000000-0000-4000-8044-000000000201', '00000000-0000-4000-8089-000000000502', 'PA Sound System', 1, '2026-12-10 19:00:00+08', '2026-12-10 21:00:00+08', NULL, false, NULL, '2026-09-23 10:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET equipment_item_id = EXCLUDED.equipment_item_id, quantity = EXCLUDED.quantity, required_from = EXCLUDED.required_from,
      required_until = EXCLUDED.required_until, notes = NULL, needs_review = false, needs_review_reason = NULL,
      requested_at = EXCLUDED.requested_at, requested_by = EXCLUDED.requested_by
  WHERE (q.equipment_item_id, q.quantity, q.required_from, q.required_until, q.notes, q.needs_review, q.requested_at, q.requested_by)
        IS DISTINCT FROM (EXCLUDED.equipment_item_id, EXCLUDED.quantity, EXCLUDED.required_from, EXCLUDED.required_until, NULL::text,
                          false, EXCLUDED.requested_at, EXCLUDED.requested_by);
  -- Must not exist: a manual arrangement status set by a tester (the reservation decides it).
  DELETE FROM public.equipment_arrangement_updates WHERE requirement_id = '00000000-0000-4000-8044-000000000611' AND status <> 'arranged';
  INSERT INTO public.equipment_reservations AS rs (id, event_id, requirement_id, equipment_item_id, quantity, starts_at, ends_at, status,
                                                   requested_by, requested_at, decided_by, decided_at, needs_recheck, recheck_reason,
                                                   released_at, released_by)
  VALUES ('00000000-0000-4000-8044-000000000711', '00000000-0000-4000-8044-000000000201', '00000000-0000-4000-8044-000000000611', '00000000-0000-4000-8089-000000000502', 1, '2026-12-10 19:00:00+08', '2026-12-10 21:00:00+08', 'approved', (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com'), '2026-09-25 10:00:00+08',
          (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com'), '2026-09-25 10:00:00+08', false, NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, requirement_id = EXCLUDED.requirement_id, equipment_item_id = EXCLUDED.equipment_item_id,
      quantity = EXCLUDED.quantity, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = 'approved',
      needs_recheck = false, recheck_reason = NULL, released_at = NULL, released_by = NULL
  WHERE (rs.event_id, rs.requirement_id, rs.equipment_item_id, rs.quantity, rs.starts_at, rs.ends_at, rs.status, rs.needs_recheck, rs.released_at)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.requirement_id, EXCLUDED.equipment_item_id, EXCLUDED.quantity, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, 'approved'::public.request_status, false, NULL::timestamptz);

  -- Safety check: 1 round(s) submitted by the coordinator, decided by Sally.
  IF (SELECT count(*) FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8044-000000000201') <> 1
     OR (SELECT count(*) FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8044-000000000201') <> 1
     OR NOT (EXISTS (SELECT 1 FROM public.event_safety_check_submissions s WHERE s.event_id = '00000000-0000-4000-8044-000000000201' AND s.round = 1
                    AND s.coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND s.submitted_at = '2026-09-26 10:00:00+08' AND s.venues_snapshot = jsonb_build_array(jsonb_build_object('bookingId', '00000000-0000-4000-8044-000000000401', 'venueName', 'Grand Ballroom', 'isMainVenue', true, 'status', 'complete', 'needsReviewReason', NULL))
                    AND s.equipment_snapshot = jsonb_build_array(jsonb_build_object('requirementId', '00000000-0000-4000-8044-000000000611', 'equipmentName', 'PA Sound System', 'quantity', 1, 'status', 'complete', 'needsReviewReason', NULL)) AND s.attendance_snapshot = 50) AND EXISTS (SELECT 1 FROM public.event_safety_check_decisions d JOIN public.event_safety_check_submissions s ON s.id = d.submission_id
                    WHERE d.event_id = '00000000-0000-4000-8044-000000000201' AND s.round = 1 AND d.outcome = 'approved' AND d.decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com')
                    AND d.decided_at = '2026-09-29 10:00:00+08' AND d.reason IS NOT DISTINCT FROM NULL)) THEN
    DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8044-000000000201';
    DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8044-000000000201';
    INSERT INTO public.event_safety_check_submissions (event_id, coordinator_id, round, venues_snapshot, period_snapshot,
                                                       attendance_snapshot, equipment_snapshot, submitted_at)
    VALUES ('00000000-0000-4000-8044-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 1, jsonb_build_array(jsonb_build_object('bookingId', '00000000-0000-4000-8044-000000000401', 'venueName', 'Grand Ballroom', 'isMainVenue', true, 'status', 'complete', 'needsReviewReason', NULL)), jsonb_build_object('startsAt', '2026-12-10 19:00:00+08'::timestamptz, 'endsAt', '2026-12-10 21:00:00+08'::timestamptz),
            50, jsonb_build_array(jsonb_build_object('requirementId', '00000000-0000-4000-8044-000000000611', 'equipmentName', 'PA Sound System', 'quantity', 1, 'status', 'complete', 'needsReviewReason', NULL)), '2026-09-26 10:00:00+08')
    RETURNING id INTO v_sub;
    INSERT INTO public.event_safety_check_decisions (event_id, submission_id, decided_by, outcome, reason, decided_at,
                                                     flagged_booking_ids, flagged_requirement_ids)
    VALUES ('00000000-0000-4000-8044-000000000201', v_sub, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com'), 'approved', NULL, '2026-09-29 10:00:00+08', '{}'::uuid[], '{}'::uuid[]);
  END IF;

  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8044-000000000201')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t)::text ORDER BY f.at) FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-09-22 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status),
      ('2026-09-26 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'planning'::public.event_status, 'pending_safety_check'::public.event_status),
      ('2026-09-29 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com'), 'pending_safety_check'::public.event_status, 'confirmed'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8044-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8044-000000000201', f.at, f.who, f.fr, f.t FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-09-22 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status),
      ('2026-09-26 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'planning'::public.event_status, 'pending_safety_check'::public.event_status),
      ('2026-09-29 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com'), 'pending_safety_check'::public.event_status, 'confirmed'::public.event_status)) f(at, who, fr, t);
  END IF;
  -- Must not exist: notifications left on this test event by an earlier run.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8044-000000000201';
END $$;

-- Registrations on "Townhall 2026": joseph registered. Stops if a real attendee is registered.
DO $$
DECLARE v_real text;
BEGIN
  SELECT u.email INTO v_real FROM public.event_registrations g JOIN auth.users u ON u.id = g.attendee_id
  WHERE g.event_id = '00000000-0000-4000-8044-000000000201' AND g.attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')) LIMIT 1;
  IF v_real IS NOT NULL THEN
    RAISE EXCEPTION 'UAT setup stopped: a real attendee (%) has a registration on a test event. Nothing was changed.', v_real;
  END IF;
  -- Must not exist: any other registration by a test account on this test event.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8044-000000000201' AND attendee_id IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')) AND attendee_id NOT IN ((SELECT id FROM auth.users WHERE lower(email) = 'joseph@gmail.com'));
  INSERT INTO public.event_registrations AS g (id, event_id, attendee_id, status, registered_at, withdrawn_at, withdrawal_reason)
  VALUES ('00000000-0000-4000-8044-000000000301', '00000000-0000-4000-8044-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joseph@gmail.com'), 'registered', '2026-10-10 10:00:00+08', NULL, NULL)
  ON CONFLICT (event_id, attendee_id) DO UPDATE
  SET status = EXCLUDED.status, registered_at = EXCLUDED.registered_at, withdrawn_at = EXCLUDED.withdrawn_at, withdrawal_reason = NULL
  WHERE (g.status, g.registered_at, g.withdrawn_at, g.withdrawal_reason)
        IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.registered_at, EXCLUDED.withdrawn_at, NULL::text);
END $$;

COMMIT;

SELECT 'spm43_tc004_setup.sql: setup complete' AS result;
