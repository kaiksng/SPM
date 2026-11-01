-- SPM-83-TC-015: Going back from the dialog saves nothing
-- Acceptance criterion: AC 9
-- Login: Venue Staff (daryl@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): see Test Data
-- Source: refined Preconditions of docs/Project UAT kk_sher_refined.xlsx
-- Records restored: venue Magnolia Hall; event "Autumn Internship Fair" (id 00000000-0000-4000-8083-000000000201: planning, organiser jasmine, coordinator joyce, bookings: Magnolia Hall approved)
-- Must-not-exist conditions enforced: other UAT test events' venue requests overlapping this case's events at its test venues; other bookings, equipment, change requests, notifications and history on "Autumn Internship Fair"
-- Defaults added: organiser Jasmine and coordinator Joyce unless the case names others; purpose, descriptions, attendance (100) and times not stated in the case; workflow dates 18 Sep - 9 Oct 2026; events that have already ended are dated 15 Oct 2026; test venues open all day unless stated
-- Shared records: cases of a story share its test events and venues: test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm83_tc015   (from the repo root)

BEGIN;

-- Lets this file set assigned coordinators and equipment request fields of its own test events.
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

-- Profile and role for jonathan@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'jonathan@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Jonathan', 'jonathan@gmail.com', 'event_coordinator')
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

-- Profile and role for keith@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'keith@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'keith@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Keith', 'keith@gmail.com', 'venue_staff')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

-- Profile and role for kenneth@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'kenneth@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'kenneth@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Kenneth', 'kenneth@gmail.com', 'event_organiser')
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


-- Venue "Magnolia Hall" (Central Area, 300 pax, open Mon/Tue/Wed/Thu/Fri/Sat/Sun 00:00-23:59, setup 30 min, turnaround 45 min, layouts none, facilities none, accessibility none; id 00000000-0000-4000-8083-000000000101).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues WHERE lower(name) = lower('Magnolia Hall') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "%" exists. Nothing was changed.', 'Magnolia Hall';
  END IF;
  INSERT INTO public.venues AS ve (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes, accessibility_notes, description)
  VALUES ('00000000-0000-4000-8083-000000000101', 'Magnolia Hall', 'Central Area', ARRAY['Central Area'], 300, '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "00:00", "closesAt": "23:59"}]'::jsonb, 30, 45, NULL, 'UAT test venue Magnolia Hall.')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location, area_tags = EXCLUDED.area_tags, capacity = EXCLUDED.capacity, operating_hours = EXCLUDED.operating_hours, setup_time_minutes = EXCLUDED.setup_time_minutes, turnaround_time_minutes = EXCLUDED.turnaround_time_minutes, accessibility_notes = EXCLUDED.accessibility_notes, description = EXCLUDED.description
  WHERE (ve.name, ve.location, ve.area_tags, ve.capacity, ve.operating_hours, ve.setup_time_minutes, ve.turnaround_time_minutes, ve.accessibility_notes, ve.description) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.location, EXCLUDED.area_tags, EXCLUDED.capacity, EXCLUDED.operating_hours, EXCLUDED.setup_time_minutes, EXCLUDED.turnaround_time_minutes, EXCLUDED.accessibility_notes, EXCLUDED.description);
  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities WHERE venue_id = '00000000-0000-4000-8083-000000000101' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.venue_layouts WHERE venue_id = '00000000-0000-4000-8083-000000000101' AND NOT (layout_name::text = ANY (ARRAY[]::text[]));
END $$;

-- Blocks are put back after the bookings below (a booking can't be restored over an active block).
UPDATE public.venue_unavailability SET removed_at = now()
WHERE venue_id = ANY (ARRAY['00000000-0000-4000-8083-000000000101']::uuid[]) AND removed_at IS NULL;

-- Venue requests left by an earlier run or another case: other UAT test events' requests at this case's test venues that
-- overlap its event times, and this case's own stale requests, are released so they can't block or distort it.
UPDATE public.venue_bookings b SET status = 'cancelled', cancelled_at = now()
FROM public.events x
WHERE x.id = b.event_id AND x.status <> 'completed' AND b.status IN ('pending', 'approved', 'on_hold')
  AND (b.event_id::text LIKE '00000000-0000-4000-80%' OR b.event_id::text LIKE '00000000-0000-0000-00%') AND NOT (b.id = ANY (ARRAY['00000000-0000-4000-8083-000000000401']::uuid[]))
  AND (b.event_id = ANY (ARRAY['00000000-0000-4000-8083-000000000201']::uuid[])
       OR (b.venue_id = ANY (ARRAY['00000000-0000-4000-8083-000000000101']::uuid[]) AND (tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz))));

-- Event "Autumn Internship Fair" (Planning, 2027-06-02 10:00 to 2027-06-02 12:00, id 00000000-0000-4000-8083-000000000201). Stops if a real event has this title.
-- A status that can't move back to Planning is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Autumn Internship Fair') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Autumn Internship Fair';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8083-000000000201';
  IF FOUND AND v_status <> 'planning' AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8083-000000000201';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8083-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8083-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Autumn Internship Fair', 'Meeting', 'UAT event Autumn Internship Fair.', 30,
          ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, 'planning', ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
          '00000000-0000-4000-8083-000000000101', false, false, false, NULL)
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id, title = EXCLUDED.title,
      purpose = EXCLUDED.purpose, description = EXCLUDED.description, expected_attendance = EXCLUDED.expected_attendance,
      starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, submitted_at = EXCLUDED.submitted_at,
      submitted_by = EXCLUDED.submitted_by, requirements_acknowledged = EXCLUDED.requirements_acknowledged, venue_id = EXCLUDED.venue_id,
      emergency_access_checked = EXCLUDED.emergency_access_checked, restrictions_checked = EXCLUDED.restrictions_checked,
      crowd_movement_checked = EXCLUDED.crowd_movement_checked, equipment_placement_notes = EXCLUDED.equipment_placement_notes
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.purpose, ev.description, ev.expected_attendance, ev.starts_at,
         ev.ends_at, ev.status, ev.submitted_at, ev.submitted_by, ev.requirements_acknowledged, ev.venue_id,
         ev.emergency_access_checked, ev.restrictions_checked, ev.crowd_movement_checked, ev.equipment_placement_notes)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title, EXCLUDED.purpose,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status,
                          EXCLUDED.submitted_at, EXCLUDED.submitted_by, EXCLUDED.requirements_acknowledged, EXCLUDED.venue_id,
                          EXCLUDED.emergency_access_checked, EXCLUDED.restrictions_checked, EXCLUDED.crowd_movement_checked,
                          EXCLUDED.equipment_placement_notes);
  -- Venue requirements: preferred location Central Area, minimum capacity None, layout Theatre, accessibility step-free.
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity, accessibility_notes, layout_notes)
  VALUES ('00000000-0000-4000-8083-000000000201', 'Central Area', NULL, 'step-free', 'Theatre')
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly ['Air conditioning'].
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8083-000000000201' AND NOT (facility_name = ANY (ARRAY['Air conditioning']::text[]));
  INSERT INTO public.event_required_facilities (event_id, facility_name) SELECT '00000000-0000-4000-8083-000000000201', 'Air conditioning' WHERE NOT EXISTS (SELECT 1 FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8083-000000000201' AND facility_name = 'Air conditioning');
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8083-000000000201';
END $$;
-- Records "Autumn Internship Fair" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8083-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8083-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8083-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8083-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8083-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8083-000000000201' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8083-000000000201';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8083-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8083-000000000201' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY['00000000-0000-4000-8083-000000000401']::uuid[]));
  -- Only one main venue at a time: clear the flag on this case's non-main bookings before the main one is restored.
  UPDATE public.venue_bookings SET is_main_venue = false
  WHERE event_id = '00000000-0000-4000-8083-000000000201' AND is_main_venue AND id = ANY (ARRAY[]::uuid[]);
  -- Approved booking at "Magnolia Hall" 2027-06-02 10:00 to 2027-06-02 12:00 (requested by joyce, decided by daryl).
  IF EXISTS (SELECT 1 FROM public.venue_bookings WHERE venue_id = '00000000-0000-4000-8083-000000000101' AND status IN ('pending', 'approved', 'on_hold')
             AND NOT (event_id::text LIKE '00000000-0000-4000-80%' OR event_id::text LIKE '00000000-0000-0000-00%') AND tstzrange(starts_at, ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz)) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real booking holds "Magnolia Hall" at the time of "Autumn Internship Fair". Nothing was changed.';
  END IF;
  INSERT INTO public.venue_bookings AS vb (id, event_id, venue_id, starts_at, ends_at, status, is_main_venue, label, expected_headcount, layout_notes, accessibility_notes, required_facilities, requested_by, requested_at, decided_by, decided_at, decision_notes, held_by, expires_at, cancelled_at, cancelled_by, cancellation_reason, needs_review, needs_review_reason, replaces_booking_id, advisory_notes)
  VALUES ('00000000-0000-4000-8083-000000000401', '00000000-0000-4000-8083-000000000201', '00000000-0000-4000-8083-000000000101', ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, 'approved', true, 'Main Programme', 30, 'Theatre', 'step-free', ARRAY['Air conditioning']::text[], (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), ('2026-09-23 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), '2026-09-24 10:00:00+08', NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, is_main_venue = EXCLUDED.is_main_venue, label = EXCLUDED.label, expected_headcount = EXCLUDED.expected_headcount, layout_notes = EXCLUDED.layout_notes, accessibility_notes = EXCLUDED.accessibility_notes, required_facilities = EXCLUDED.required_facilities, requested_by = EXCLUDED.requested_by, requested_at = EXCLUDED.requested_at, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at, decision_notes = EXCLUDED.decision_notes, held_by = EXCLUDED.held_by, expires_at = EXCLUDED.expires_at, cancelled_at = EXCLUDED.cancelled_at, cancelled_by = EXCLUDED.cancelled_by, cancellation_reason = EXCLUDED.cancellation_reason, needs_review = EXCLUDED.needs_review, needs_review_reason = EXCLUDED.needs_review_reason, replaces_booking_id = EXCLUDED.replaces_booking_id, advisory_notes = EXCLUDED.advisory_notes
  WHERE (vb.event_id, vb.venue_id, vb.starts_at, vb.ends_at, vb.status, vb.is_main_venue, vb.label, vb.expected_headcount, vb.layout_notes, vb.accessibility_notes, vb.required_facilities, vb.requested_by, vb.requested_at, vb.decided_by, vb.decided_at, vb.decision_notes, vb.held_by, vb.expires_at, vb.cancelled_at, vb.cancelled_by, vb.cancellation_reason, vb.needs_review, vb.needs_review_reason, vb.replaces_booking_id, vb.advisory_notes) IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.is_main_venue, EXCLUDED.label, EXCLUDED.expected_headcount, EXCLUDED.layout_notes, EXCLUDED.accessibility_notes, EXCLUDED.required_facilities, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.decided_by, EXCLUDED.decided_at, EXCLUDED.decision_notes, EXCLUDED.held_by, EXCLUDED.expires_at, EXCLUDED.cancelled_at, EXCLUDED.cancelled_by, EXCLUDED.cancellation_reason, EXCLUDED.needs_review, EXCLUDED.needs_review_reason, EXCLUDED.replaces_booking_id, EXCLUDED.advisory_notes);
  DELETE FROM public.venue_booking_conflicts WHERE booking_id = '00000000-0000-4000-8083-000000000401';
  DELETE FROM public.venue_booking_disruptions WHERE booking_id = '00000000-0000-4000-8083-000000000401';
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8083-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8083-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8083-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8083-000000000201') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8083-000000000201';
    
  END IF;
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8083-000000000201';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8083-000000000201';
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8083-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8083-000000000201') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8083-000000000201'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8083-000000000201'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8083-000000000201'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8083-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8083-000000000201'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8083-000000000201'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8083-000000000201'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8083-000000000201') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8083-000000000201';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8083-000000000201') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8083-000000000201';
    
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8083-000000000201' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8083-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

-- Blocks on "Magnolia Hall": none. Other active blocks on this test venue are removed.
UPDATE public.venue_unavailability SET removed_at = now()
WHERE venue_id = '00000000-0000-4000-8083-000000000101' AND removed_at IS NULL AND NOT (id = ANY (ARRAY[]::uuid[]));


COMMIT;

SELECT 'spm83_tc015_setup.sql: setup complete' AS result;
