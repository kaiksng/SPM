-- SPM-33-TC-002: Disrupted, conflicted, on-hold and issue-flagged items all surface as Needs Review
-- Acceptance criterion: AC 2
-- Login: Event Coordinator (joyce@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): see Test Data
-- Source: refined Preconditions of docs/Project UAT kk_sher_refined.xlsx
-- Records restored: venue Marina Hall; venue Birch Room; venue Aspen Room; event "Alumni Networking Night" (id 00000000-0000-4000-8033-000000000202: planning, organiser jasmine, coordinator joyce, bookings: Marina Hall approved, Birch Room approved, Aspen Room on_hold, equipment: uat-pa-sound-system x 1); block "Maintenance" on Marina Hall 2027-06-02 09:00-13:00
-- Must-not-exist conditions enforced: other UAT test events' venue requests overlapping this case's events at its test venues; other UAT test events' equipment requests and reservations on uat-pa-sound-system on 2027-06-02; other bookings, equipment, change requests, notifications and history on "Alumni Networking Night"
-- Defaults added: organiser Jasmine and coordinator Joyce unless the case names others; purpose, descriptions, attendance (100) and times not stated in the case; workflow dates 18 Sep - 9 Oct 2026; events that have already ended are dated 15 Oct 2026; test venues open all day unless stated
-- Shared records: cases of a story share its test events and venues: test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm33_tc002   (from the repo root)

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


-- Venue "Marina Hall" (Central Area, 400 pax, open Mon/Tue/Wed/Thu/Fri/Sat/Sun 00:00-23:59, setup 0 min, turnaround 0 min, layouts none, facilities none, accessibility none; id 00000000-0000-4000-8033-000000000101).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues WHERE lower(name) = lower('Marina Hall') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "%" exists. Nothing was changed.', 'Marina Hall';
  END IF;
  INSERT INTO public.venues AS ve (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes, accessibility_notes, description)
  VALUES ('00000000-0000-4000-8033-000000000101', 'Marina Hall', 'Central Area', ARRAY['Central Area'], 400, '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "00:00", "closesAt": "23:59"}]'::jsonb, 0, 0, NULL, 'UAT test venue Marina Hall.')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location, area_tags = EXCLUDED.area_tags, capacity = EXCLUDED.capacity, operating_hours = EXCLUDED.operating_hours, setup_time_minutes = EXCLUDED.setup_time_minutes, turnaround_time_minutes = EXCLUDED.turnaround_time_minutes, accessibility_notes = EXCLUDED.accessibility_notes, description = EXCLUDED.description
  WHERE (ve.name, ve.location, ve.area_tags, ve.capacity, ve.operating_hours, ve.setup_time_minutes, ve.turnaround_time_minutes, ve.accessibility_notes, ve.description) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.location, EXCLUDED.area_tags, EXCLUDED.capacity, EXCLUDED.operating_hours, EXCLUDED.setup_time_minutes, EXCLUDED.turnaround_time_minutes, EXCLUDED.accessibility_notes, EXCLUDED.description);
  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities WHERE venue_id = '00000000-0000-4000-8033-000000000101' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.venue_layouts WHERE venue_id = '00000000-0000-4000-8033-000000000101' AND NOT (layout_name::text = ANY (ARRAY[]::text[]));
END $$;

-- Venue "Birch Room" (Central Area, 60 pax, open Mon/Tue/Wed/Thu/Fri/Sat/Sun 00:00-23:59, setup 0 min, turnaround 0 min, layouts none, facilities none, accessibility none; id 00000000-0000-4000-8033-000000000102).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues WHERE lower(name) = lower('Birch Room') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "%" exists. Nothing was changed.', 'Birch Room';
  END IF;
  INSERT INTO public.venues AS ve (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes, accessibility_notes, description)
  VALUES ('00000000-0000-4000-8033-000000000102', 'Birch Room', 'Central Area', ARRAY['Central Area'], 60, '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "00:00", "closesAt": "23:59"}]'::jsonb, 0, 0, NULL, 'UAT test venue Birch Room.')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location, area_tags = EXCLUDED.area_tags, capacity = EXCLUDED.capacity, operating_hours = EXCLUDED.operating_hours, setup_time_minutes = EXCLUDED.setup_time_minutes, turnaround_time_minutes = EXCLUDED.turnaround_time_minutes, accessibility_notes = EXCLUDED.accessibility_notes, description = EXCLUDED.description
  WHERE (ve.name, ve.location, ve.area_tags, ve.capacity, ve.operating_hours, ve.setup_time_minutes, ve.turnaround_time_minutes, ve.accessibility_notes, ve.description) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.location, EXCLUDED.area_tags, EXCLUDED.capacity, EXCLUDED.operating_hours, EXCLUDED.setup_time_minutes, EXCLUDED.turnaround_time_minutes, EXCLUDED.accessibility_notes, EXCLUDED.description);
  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities WHERE venue_id = '00000000-0000-4000-8033-000000000102' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.venue_layouts WHERE venue_id = '00000000-0000-4000-8033-000000000102' AND NOT (layout_name::text = ANY (ARRAY[]::text[]));
END $$;

-- Venue "Aspen Room" (Central Area, 60 pax, open Mon/Tue/Wed/Thu/Fri/Sat/Sun 00:00-23:59, setup 0 min, turnaround 0 min, layouts none, facilities none, accessibility none; id 00000000-0000-4000-8033-000000000103).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues WHERE lower(name) = lower('Aspen Room') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "%" exists. Nothing was changed.', 'Aspen Room';
  END IF;
  INSERT INTO public.venues AS ve (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes, accessibility_notes, description)
  VALUES ('00000000-0000-4000-8033-000000000103', 'Aspen Room', 'Central Area', ARRAY['Central Area'], 60, '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "00:00", "closesAt": "23:59"}]'::jsonb, 0, 0, NULL, 'UAT test venue Aspen Room.')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location, area_tags = EXCLUDED.area_tags, capacity = EXCLUDED.capacity, operating_hours = EXCLUDED.operating_hours, setup_time_minutes = EXCLUDED.setup_time_minutes, turnaround_time_minutes = EXCLUDED.turnaround_time_minutes, accessibility_notes = EXCLUDED.accessibility_notes, description = EXCLUDED.description
  WHERE (ve.name, ve.location, ve.area_tags, ve.capacity, ve.operating_hours, ve.setup_time_minutes, ve.turnaround_time_minutes, ve.accessibility_notes, ve.description) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.location, EXCLUDED.area_tags, EXCLUDED.capacity, EXCLUDED.operating_hours, EXCLUDED.setup_time_minutes, EXCLUDED.turnaround_time_minutes, EXCLUDED.accessibility_notes, EXCLUDED.description);
  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities WHERE venue_id = '00000000-0000-4000-8033-000000000103' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.venue_layouts WHERE venue_id = '00000000-0000-4000-8033-000000000103' AND NOT (layout_name::text = ANY (ARRAY[]::text[]));
END $$;

-- Blocks are put back after the bookings below (a booking can't be restored over an active block).
UPDATE public.venue_unavailability SET removed_at = now()
WHERE venue_id = ANY (ARRAY['00000000-0000-4000-8033-000000000101', '00000000-0000-4000-8033-000000000102', '00000000-0000-4000-8033-000000000103']::uuid[]) AND removed_at IS NULL;

-- Venue requests left by an earlier run or another case: other UAT test events' requests at this case's test venues that
-- overlap its event times, and this case's own stale requests, are released so they can't block or distort it.
UPDATE public.venue_bookings b SET status = 'cancelled', cancelled_at = now()
FROM public.events x
WHERE x.id = b.event_id AND x.status <> 'completed' AND b.status IN ('pending', 'approved', 'on_hold')
  AND (b.event_id::text LIKE '00000000-0000-4000-80%' OR b.event_id::text LIKE '00000000-0000-0000-00%') AND NOT (b.id = ANY (ARRAY['00000000-0000-4000-8033-000000000403', '00000000-0000-4000-8033-000000000404', '00000000-0000-4000-8033-000000000405']::uuid[]))
  AND (b.event_id = ANY (ARRAY['00000000-0000-4000-8033-000000000202']::uuid[])
       OR (b.venue_id = ANY (ARRAY['00000000-0000-4000-8033-000000000101', '00000000-0000-4000-8033-000000000102', '00000000-0000-4000-8033-000000000103']::uuid[]) AND (tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz))));

-- Equipment counted by this case (uat-pa-sound-system), 2027-06-02 00:00 to 2027-06-02 23:59: stop if a real reservation overlaps;
-- release other UAT test events' requests and reservations that overlap, so the availability figures are exactly the case's.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.equipment_reservations r WHERE r.equipment_item_id IN (SELECT id FROM public.equipment_items WHERE code IN ('uat-pa-sound-system'))
             AND r.status = 'approved' AND NOT (r.event_id::text LIKE '00000000-0000-4000-80%' OR r.event_id::text LIKE '00000000-0000-0000-00%') AND tstzrange(r.starts_at, r.ends_at) && tstzrange(('2027-06-02 00:00:00+08')::timestamptz, ('2027-06-02 23:59:00+08')::timestamptz)) THEN
    RAISE EXCEPTION 'UAT setup stopped: real equipment reservations overlap this case''s period. Nothing was changed.';
  END IF;
  UPDATE public.equipment_reservations r SET status = 'cancelled', released_at = now(), needs_recheck = false
  WHERE r.equipment_item_id IN (SELECT id FROM public.equipment_items WHERE code IN ('uat-pa-sound-system')) AND r.status = 'approved'
    AND (r.event_id::text LIKE '00000000-0000-4000-80%' OR r.event_id::text LIKE '00000000-0000-0000-00%') AND NOT (r.event_id = ANY (ARRAY['00000000-0000-4000-8033-000000000202']::uuid[])) AND NOT (r.id = ANY (ARRAY[]::uuid[]))
    AND tstzrange(r.starts_at, r.ends_at) && tstzrange(('2027-06-02 00:00:00+08')::timestamptz, ('2027-06-02 23:59:00+08')::timestamptz)
    AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = r.event_id AND e.status = 'completed');
  DELETE FROM public.event_equipment_requirements q
  WHERE q.equipment_item_id IN (SELECT id FROM public.equipment_items WHERE code IN ('uat-pa-sound-system'))
    AND (q.event_id::text LIKE '00000000-0000-4000-80%' OR q.event_id::text LIKE '00000000-0000-0000-00%') AND NOT (q.event_id = ANY (ARRAY['00000000-0000-4000-8033-000000000202']::uuid[]))
    AND tstzrange(q.required_from, q.required_until) && tstzrange(('2027-06-02 00:00:00+08')::timestamptz, ('2027-06-02 23:59:00+08')::timestamptz)
    AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = q.event_id AND e.status = 'completed');
END $$;

-- Event "Alumni Networking Night" (Planning, 2027-06-02 10:00 to 2027-06-02 12:00, id 00000000-0000-4000-8033-000000000202). Stops if a real event has this title.
-- A status that can't move back to Planning is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Alumni Networking Night') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Alumni Networking Night';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8033-000000000202';
  IF FOUND AND v_status <> 'planning' AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8033-000000000202';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8033-000000000202' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8033-000000000202', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Alumni Networking Night', 'Meeting', 'UAT event Alumni Networking Night.', 100,
          ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, 'planning', ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
          '00000000-0000-4000-8033-000000000101', false, false, false, NULL)
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
  -- Venue requirements: preferred location Central Area, minimum capacity None, layout None, accessibility None.
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity, accessibility_notes, layout_notes)
  VALUES ('00000000-0000-4000-8033-000000000202', 'Central Area', NULL, NULL, NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly none.
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8033-000000000202' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8033-000000000202';
END $$;
-- Records "Alumni Networking Night" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8033-000000000202') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8033-000000000202' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8033-000000000202';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8033-000000000202', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8033-000000000202') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8033-000000000202' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8033-000000000202';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8033-000000000202', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8033-000000000202' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY['00000000-0000-4000-8033-000000000403', '00000000-0000-4000-8033-000000000404', '00000000-0000-4000-8033-000000000405']::uuid[]));
  -- Only one main venue at a time: clear the flag on this case's non-main bookings before the main one is restored.
  UPDATE public.venue_bookings SET is_main_venue = false
  WHERE event_id = '00000000-0000-4000-8033-000000000202' AND is_main_venue AND id = ANY (ARRAY['00000000-0000-4000-8033-000000000404', '00000000-0000-4000-8033-000000000405']::uuid[]);
  -- Approved booking at "Marina Hall" 2027-06-02 10:00 to 2027-06-02 12:00 (requested by joyce, decided by daryl).
  IF EXISTS (SELECT 1 FROM public.venue_bookings WHERE venue_id = '00000000-0000-4000-8033-000000000101' AND status IN ('pending', 'approved', 'on_hold')
             AND NOT (event_id::text LIKE '00000000-0000-4000-80%' OR event_id::text LIKE '00000000-0000-0000-00%') AND tstzrange(starts_at, ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz)) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real booking holds "Marina Hall" at the time of "Alumni Networking Night". Nothing was changed.';
  END IF;
  INSERT INTO public.venue_bookings AS vb (id, event_id, venue_id, starts_at, ends_at, status, is_main_venue, label, expected_headcount, layout_notes, accessibility_notes, required_facilities, requested_by, requested_at, decided_by, decided_at, decision_notes, held_by, expires_at, cancelled_at, cancelled_by, cancellation_reason, needs_review, needs_review_reason, replaces_booking_id, advisory_notes)
  VALUES ('00000000-0000-4000-8033-000000000403', '00000000-0000-4000-8033-000000000202', '00000000-0000-4000-8033-000000000101', ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, 'approved', true, 'Booking A', 100, NULL, NULL, ARRAY[]::text[], (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), ('2026-09-23 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), '2026-09-24 10:00:00+08', NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, is_main_venue = EXCLUDED.is_main_venue, label = EXCLUDED.label, expected_headcount = EXCLUDED.expected_headcount, layout_notes = EXCLUDED.layout_notes, accessibility_notes = EXCLUDED.accessibility_notes, required_facilities = EXCLUDED.required_facilities, requested_by = EXCLUDED.requested_by, requested_at = EXCLUDED.requested_at, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at, decision_notes = EXCLUDED.decision_notes, held_by = EXCLUDED.held_by, expires_at = EXCLUDED.expires_at, cancelled_at = EXCLUDED.cancelled_at, cancelled_by = EXCLUDED.cancelled_by, cancellation_reason = EXCLUDED.cancellation_reason, needs_review = EXCLUDED.needs_review, needs_review_reason = EXCLUDED.needs_review_reason, replaces_booking_id = EXCLUDED.replaces_booking_id, advisory_notes = EXCLUDED.advisory_notes
  WHERE (vb.event_id, vb.venue_id, vb.starts_at, vb.ends_at, vb.status, vb.is_main_venue, vb.label, vb.expected_headcount, vb.layout_notes, vb.accessibility_notes, vb.required_facilities, vb.requested_by, vb.requested_at, vb.decided_by, vb.decided_at, vb.decision_notes, vb.held_by, vb.expires_at, vb.cancelled_at, vb.cancelled_by, vb.cancellation_reason, vb.needs_review, vb.needs_review_reason, vb.replaces_booking_id, vb.advisory_notes) IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.is_main_venue, EXCLUDED.label, EXCLUDED.expected_headcount, EXCLUDED.layout_notes, EXCLUDED.accessibility_notes, EXCLUDED.required_facilities, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.decided_by, EXCLUDED.decided_at, EXCLUDED.decision_notes, EXCLUDED.held_by, EXCLUDED.expires_at, EXCLUDED.cancelled_at, EXCLUDED.cancelled_by, EXCLUDED.cancellation_reason, EXCLUDED.needs_review, EXCLUDED.needs_review_reason, EXCLUDED.replaces_booking_id, EXCLUDED.advisory_notes);
  DELETE FROM public.venue_booking_conflicts WHERE booking_id = '00000000-0000-4000-8033-000000000403';
  DELETE FROM public.venue_booking_disruptions WHERE booking_id = '00000000-0000-4000-8033-000000000403';
  -- Approved booking at "Birch Room" 2027-06-02 10:00 to 2027-06-02 12:00 (requested by joyce, decided by daryl, needs review).
  IF EXISTS (SELECT 1 FROM public.venue_bookings WHERE venue_id = '00000000-0000-4000-8033-000000000102' AND status IN ('pending', 'approved', 'on_hold')
             AND NOT (event_id::text LIKE '00000000-0000-4000-80%' OR event_id::text LIKE '00000000-0000-0000-00%') AND tstzrange(starts_at, ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz)) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real booking holds "Birch Room" at the time of "Alumni Networking Night". Nothing was changed.';
  END IF;
  INSERT INTO public.venue_bookings AS vb (id, event_id, venue_id, starts_at, ends_at, status, is_main_venue, label, expected_headcount, layout_notes, accessibility_notes, required_facilities, requested_by, requested_at, decided_by, decided_at, decision_notes, held_by, expires_at, cancelled_at, cancelled_by, cancellation_reason, needs_review, needs_review_reason, replaces_booking_id, advisory_notes)
  VALUES ('00000000-0000-4000-8033-000000000404', '00000000-0000-4000-8033-000000000202', '00000000-0000-4000-8033-000000000102', ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, 'approved', false, 'Booking B', 100, NULL, NULL, ARRAY[]::text[], (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), ('2026-09-23 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), '2026-09-24 10:00:00+08', NULL, NULL, NULL, NULL, NULL, NULL, true, 'Conflict with another booking', NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, is_main_venue = EXCLUDED.is_main_venue, label = EXCLUDED.label, expected_headcount = EXCLUDED.expected_headcount, layout_notes = EXCLUDED.layout_notes, accessibility_notes = EXCLUDED.accessibility_notes, required_facilities = EXCLUDED.required_facilities, requested_by = EXCLUDED.requested_by, requested_at = EXCLUDED.requested_at, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at, decision_notes = EXCLUDED.decision_notes, held_by = EXCLUDED.held_by, expires_at = EXCLUDED.expires_at, cancelled_at = EXCLUDED.cancelled_at, cancelled_by = EXCLUDED.cancelled_by, cancellation_reason = EXCLUDED.cancellation_reason, needs_review = EXCLUDED.needs_review, needs_review_reason = EXCLUDED.needs_review_reason, replaces_booking_id = EXCLUDED.replaces_booking_id, advisory_notes = EXCLUDED.advisory_notes
  WHERE (vb.event_id, vb.venue_id, vb.starts_at, vb.ends_at, vb.status, vb.is_main_venue, vb.label, vb.expected_headcount, vb.layout_notes, vb.accessibility_notes, vb.required_facilities, vb.requested_by, vb.requested_at, vb.decided_by, vb.decided_at, vb.decision_notes, vb.held_by, vb.expires_at, vb.cancelled_at, vb.cancelled_by, vb.cancellation_reason, vb.needs_review, vb.needs_review_reason, vb.replaces_booking_id, vb.advisory_notes) IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.is_main_venue, EXCLUDED.label, EXCLUDED.expected_headcount, EXCLUDED.layout_notes, EXCLUDED.accessibility_notes, EXCLUDED.required_facilities, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.decided_by, EXCLUDED.decided_at, EXCLUDED.decision_notes, EXCLUDED.held_by, EXCLUDED.expires_at, EXCLUDED.cancelled_at, EXCLUDED.cancelled_by, EXCLUDED.cancellation_reason, EXCLUDED.needs_review, EXCLUDED.needs_review_reason, EXCLUDED.replaces_booking_id, EXCLUDED.advisory_notes);
  DELETE FROM public.venue_booking_conflicts WHERE booking_id = '00000000-0000-4000-8033-000000000404';
  DELETE FROM public.venue_booking_disruptions WHERE booking_id = '00000000-0000-4000-8033-000000000404';
  -- On Hold booking at "Aspen Room" 2027-06-02 10:00 to 2027-06-02 12:00 (requested by joyce, decided by daryl).
  IF EXISTS (SELECT 1 FROM public.venue_bookings WHERE venue_id = '00000000-0000-4000-8033-000000000103' AND status IN ('pending', 'approved', 'on_hold')
             AND NOT (event_id::text LIKE '00000000-0000-4000-80%' OR event_id::text LIKE '00000000-0000-0000-00%') AND tstzrange(starts_at, ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz)) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real booking holds "Aspen Room" at the time of "Alumni Networking Night". Nothing was changed.';
  END IF;
  INSERT INTO public.venue_bookings AS vb (id, event_id, venue_id, starts_at, ends_at, status, is_main_venue, label, expected_headcount, layout_notes, accessibility_notes, required_facilities, requested_by, requested_at, decided_by, decided_at, decision_notes, held_by, expires_at, cancelled_at, cancelled_by, cancellation_reason, needs_review, needs_review_reason, replaces_booking_id, advisory_notes)
  VALUES ('00000000-0000-4000-8033-000000000405', '00000000-0000-4000-8033-000000000202', '00000000-0000-4000-8033-000000000103', ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, 'on_hold', false, 'Booking C', 100, NULL, NULL, ARRAY[]::text[], (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), ('2026-09-23 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), '2026-09-24 10:00:00+08', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), ((date_trunc('hour', now()) + interval '72 hours'))::timestamptz, NULL, NULL, NULL, false, NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, is_main_venue = EXCLUDED.is_main_venue, label = EXCLUDED.label, expected_headcount = EXCLUDED.expected_headcount, layout_notes = EXCLUDED.layout_notes, accessibility_notes = EXCLUDED.accessibility_notes, required_facilities = EXCLUDED.required_facilities, requested_by = EXCLUDED.requested_by, requested_at = EXCLUDED.requested_at, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at, decision_notes = EXCLUDED.decision_notes, held_by = EXCLUDED.held_by, expires_at = EXCLUDED.expires_at, cancelled_at = EXCLUDED.cancelled_at, cancelled_by = EXCLUDED.cancelled_by, cancellation_reason = EXCLUDED.cancellation_reason, needs_review = EXCLUDED.needs_review, needs_review_reason = EXCLUDED.needs_review_reason, replaces_booking_id = EXCLUDED.replaces_booking_id, advisory_notes = EXCLUDED.advisory_notes
  WHERE (vb.event_id, vb.venue_id, vb.starts_at, vb.ends_at, vb.status, vb.is_main_venue, vb.label, vb.expected_headcount, vb.layout_notes, vb.accessibility_notes, vb.required_facilities, vb.requested_by, vb.requested_at, vb.decided_by, vb.decided_at, vb.decision_notes, vb.held_by, vb.expires_at, vb.cancelled_at, vb.cancelled_by, vb.cancellation_reason, vb.needs_review, vb.needs_review_reason, vb.replaces_booking_id, vb.advisory_notes) IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.is_main_venue, EXCLUDED.label, EXCLUDED.expected_headcount, EXCLUDED.layout_notes, EXCLUDED.accessibility_notes, EXCLUDED.required_facilities, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.decided_by, EXCLUDED.decided_at, EXCLUDED.decision_notes, EXCLUDED.held_by, EXCLUDED.expires_at, EXCLUDED.cancelled_at, EXCLUDED.cancelled_by, EXCLUDED.cancellation_reason, EXCLUDED.needs_review, EXCLUDED.needs_review_reason, EXCLUDED.replaces_booking_id, EXCLUDED.advisory_notes);
  DELETE FROM public.venue_booking_conflicts WHERE booking_id = '00000000-0000-4000-8033-000000000405';
  DELETE FROM public.venue_booking_disruptions WHERE booking_id = '00000000-0000-4000-8033-000000000405';
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8033-000000000202' AND NOT (id = ANY (ARRAY['00000000-0000-4000-8033-000000000702']::uuid[]));
  -- uat-pa-sound-system x 1, 2027-06-02 10:00 to 2027-06-02 12:00, sent to Technical Support.
  INSERT INTO public.event_equipment_requirements AS rq (id, event_id, equipment_item_id, equipment_name, quantity, required_from,
                                                        required_until, notes, needs_review, needs_review_reason, requested_at, requested_by)
  VALUES ('00000000-0000-4000-8033-000000000702', '00000000-0000-4000-8033-000000000202', (SELECT id FROM public.equipment_items WHERE code = 'uat-pa-sound-system'), (SELECT name FROM public.equipment_items WHERE code = 'uat-pa-sound-system'), 1,
          ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, NULL, false, NULL,
          '2026-09-25 10:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET equipment_item_id = EXCLUDED.equipment_item_id, quantity = EXCLUDED.quantity, required_from = EXCLUDED.required_from,
      required_until = EXCLUDED.required_until, notes = EXCLUDED.notes, needs_review = EXCLUDED.needs_review,
      needs_review_reason = EXCLUDED.needs_review_reason, requested_at = EXCLUDED.requested_at, requested_by = EXCLUDED.requested_by
  WHERE (rq.equipment_item_id, rq.quantity, rq.required_from, rq.required_until, rq.notes, rq.needs_review, rq.needs_review_reason, rq.requested_at, rq.requested_by)
        IS DISTINCT FROM (EXCLUDED.equipment_item_id, EXCLUDED.quantity, EXCLUDED.required_from, EXCLUDED.required_until, EXCLUDED.notes,
                          EXCLUDED.needs_review, EXCLUDED.needs_review_reason, EXCLUDED.requested_at, EXCLUDED.requested_by);
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8033-000000000202' AND NOT (id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8033-000000000202' AND NOT (id = ANY (ARRAY[]::uuid[]));
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8033-000000000202') IS DISTINCT FROM (SELECT array_agg(row(v.requirement_id, v.event_id, v.status, v.note, v.updated_by, v.updated_at)::text ORDER BY v.updated_at, row(v.requirement_id, v.event_id, v.status, v.note, v.updated_by, v.updated_at)::text) FROM (VALUES
      ('00000000-0000-4000-8033-000000000702'::uuid, '00000000-0000-4000-8033-000000000202'::uuid, 'issue', 'Unit failed testing'::text, (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com')::uuid, ('2026-10-03 10:00:00+08')::timestamptz)) v(requirement_id, event_id, status, note, updated_by, updated_at)) THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8033-000000000202';
    INSERT INTO public.equipment_arrangement_updates (requirement_id, event_id, status, note, updated_by, updated_at) SELECT v.requirement_id, v.event_id, v.status, v.note, v.updated_by, v.updated_at FROM (VALUES
      ('00000000-0000-4000-8033-000000000702'::uuid, '00000000-0000-4000-8033-000000000202'::uuid, 'issue', 'Unit failed testing'::text, (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com')::uuid, ('2026-10-03 10:00:00+08')::timestamptz)) v(requirement_id, event_id, status, note, updated_by, updated_at);
  END IF;
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8033-000000000202';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8033-000000000202';
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8033-000000000202' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8033-000000000202') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8033-000000000202'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8033-000000000202'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8033-000000000202'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8033-000000000202';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8033-000000000202'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8033-000000000202'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8033-000000000202'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8033-000000000202') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8033-000000000202';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8033-000000000202') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.requirement_id, v.change_type, v.previous_value, v.new_value, v.changed_by, v.changed_at)::text ORDER BY v.changed_at, row(v.event_id, v.requirement_id, v.change_type, v.previous_value, v.new_value, v.changed_by, v.changed_at)::text) FROM (VALUES
      ('00000000-0000-4000-8033-000000000202'::uuid, '00000000-0000-4000-8033-000000000702'::uuid, 'added', NULL::jsonb, (SELECT public.event_equipment_snapshot(x) FROM public.event_equipment_requirements x WHERE x.id = '00000000-0000-4000-8033-000000000702'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, ('2026-09-25 10:00:00+08')::timestamptz)) v(event_id, requirement_id, change_type, previous_value, new_value, changed_by, changed_at)) THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8033-000000000202';
    INSERT INTO public.event_equipment_changes (event_id, requirement_id, change_type, previous_value, new_value, changed_by, changed_at) SELECT v.event_id, v.requirement_id, v.change_type, v.previous_value, v.new_value, v.changed_by, v.changed_at FROM (VALUES
      ('00000000-0000-4000-8033-000000000202'::uuid, '00000000-0000-4000-8033-000000000702'::uuid, 'added', NULL::jsonb, (SELECT public.event_equipment_snapshot(x) FROM public.event_equipment_requirements x WHERE x.id = '00000000-0000-4000-8033-000000000702'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, ('2026-09-25 10:00:00+08')::timestamptz)) v(event_id, requirement_id, change_type, previous_value, new_value, changed_by, changed_at);
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8033-000000000202' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8033-000000000202' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

-- Blocks on "Marina Hall": 2027-06-02 09:00 to 13:00 (Maintenance). Other active blocks on this test venue are removed.
UPDATE public.venue_unavailability SET removed_at = now()
WHERE venue_id = '00000000-0000-4000-8033-000000000101' AND removed_at IS NULL AND NOT (id = ANY (ARRAY['00000000-0000-4000-8033-000000000601']::uuid[]));
INSERT INTO public.venue_unavailability AS b (id, venue_id, starts_at, ends_at, reason, reason_category, removed_at, removed_by)
VALUES ('00000000-0000-4000-8033-000000000601', '00000000-0000-4000-8033-000000000101', '2027-06-02 09:00:00+08', '2027-06-02 13:00:00+08', 'Maintenance', 'maintenance', NULL, NULL)
ON CONFLICT (id) DO UPDATE SET venue_id = EXCLUDED.venue_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
    reason = EXCLUDED.reason, reason_category = EXCLUDED.reason_category, removed_at = NULL, removed_by = NULL
WHERE (b.venue_id, b.starts_at, b.ends_at, b.reason, b.reason_category, b.removed_at)
      IS DISTINCT FROM (EXCLUDED.venue_id, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.reason, EXCLUDED.reason_category, NULL::timestamptz);

-- Blocks on "Birch Room": none. Other active blocks on this test venue are removed.
UPDATE public.venue_unavailability SET removed_at = now()
WHERE venue_id = '00000000-0000-4000-8033-000000000102' AND removed_at IS NULL AND NOT (id = ANY (ARRAY[]::uuid[]));

-- Blocks on "Aspen Room": none. Other active blocks on this test venue are removed.
UPDATE public.venue_unavailability SET removed_at = now()
WHERE venue_id = '00000000-0000-4000-8033-000000000103' AND removed_at IS NULL AND NOT (id = ANY (ARRAY[]::uuid[]));

-- "Booking A" at Marina Hall is Disrupted - Alternative Required by block 601.
INSERT INTO public.venue_booking_disruptions AS x (id, booking_id, block_id, flagged_at, flagged_by, cleared_at, cleared_by)
VALUES ('00000000-0000-4000-8033-000000000903', '00000000-0000-4000-8033-000000000403', '00000000-0000-4000-8033-000000000601', '2026-10-07 10:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), NULL, NULL)
ON CONFLICT (id) DO UPDATE SET booking_id = EXCLUDED.booking_id, block_id = EXCLUDED.block_id, flagged_at = EXCLUDED.flagged_at,
    flagged_by = EXCLUDED.flagged_by, cleared_at = EXCLUDED.cleared_at, cleared_by = EXCLUDED.cleared_by
WHERE (x.booking_id, x.block_id, x.flagged_at, x.flagged_by, x.cleared_at, x.cleared_by)
      IS DISTINCT FROM (EXCLUDED.booking_id, EXCLUDED.block_id, EXCLUDED.flagged_at, EXCLUDED.flagged_by, EXCLUDED.cleared_at, EXCLUDED.cleared_by);

COMMIT;

SELECT 'spm33_tc002_setup.sql: setup complete' AS result;
