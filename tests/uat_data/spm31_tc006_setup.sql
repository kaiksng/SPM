-- SPM-31-TC-006: Available quantity equal to the request counts as Available
-- Acceptance criterion: AC 4
-- Login: Technical Support Staff (andy@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): see Test Data
-- Source: refined Preconditions of docs/Project Planning_refined_v2.xlsx
-- Records restored: event "UAT Expo" (id 00000000-0000-4000-8031-000000000201: planning, organiser jasmine, coordinator joyce, equipment: mic x 80); event "UAT Talk" (id 00000000-0000-4000-8031-000000000209: planning, organiser jasmine, coordinator joyce, equipment: mic x 20, reserved: mic x 20)
-- Must-not-exist conditions enforced: other UAT test events' equipment requests and reservations on proj, mic, laptop, hdmi, uat-projector, uat-smoke-machine between 2026-12-01 and 2026-12-31; other clarifications, change requests, notifications, bookings, equipment and history on "UAT Expo"; other clarifications, change requests, notifications, bookings, equipment and history on "UAT Talk"
-- Defaults added: organiser Jasmine and coordinator Joyce unless the case names others; event times, attendance (100), purpose and descriptions not stated in the case; workflow dates 18 Sep - 6 Oct 2026; test venues UAT Events Hall, UAT Hall, Main Hall, Room 2, UAT Seminar Hall, UAT Turnaround Hall; catalogue items Projector and Wireless microphone are the real ones (never changed)
-- Shared records: cases of a story use the same test events (UAT Expo, UAT Gala, UAT Hall...): test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm31_tc006   (from the repo root)

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

-- Profile and role for benny@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'benny@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'benny@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Benny', 'benny@gmail.com', 'technical_support_staff')
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


-- Equipment counted by this case (proj, mic, laptop, hdmi, uat-projector, uat-smoke-machine), 2026-12-01 00:00 to 2026-12-01 23:59: stop if a real reservation overlaps;
-- release other UAT test events' requests and reservations that overlap, so the availability figures are exactly the case's.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.equipment_reservations r WHERE r.equipment_item_id IN (SELECT id FROM public.equipment_items WHERE code IN ('proj', 'mic', 'laptop', 'hdmi', 'uat-projector', 'uat-smoke-machine'))
             AND r.status = 'approved' AND NOT (r.event_id::text LIKE '00000000-0000-4000-80%' OR r.event_id::text LIKE '00000000-0000-0000-00%') AND tstzrange(r.starts_at, r.ends_at) && tstzrange(('2026-12-01 00:00:00+08')::timestamptz, ('2026-12-01 23:59:00+08')::timestamptz)) THEN
    RAISE EXCEPTION 'UAT setup stopped: real equipment reservations overlap this case''s period. Nothing was changed.';
  END IF;
  UPDATE public.equipment_reservations r SET status = 'cancelled', released_at = now(), needs_recheck = false
  WHERE r.equipment_item_id IN (SELECT id FROM public.equipment_items WHERE code IN ('proj', 'mic', 'laptop', 'hdmi', 'uat-projector', 'uat-smoke-machine')) AND r.status = 'approved'
    AND (r.event_id::text LIKE '00000000-0000-4000-80%' OR r.event_id::text LIKE '00000000-0000-0000-00%') AND NOT (r.event_id = ANY (ARRAY['00000000-0000-4000-8031-000000000201', '00000000-0000-4000-8031-000000000209']::uuid[])) AND NOT (r.id = ANY (ARRAY['00000000-0000-4000-8031-000000000659']::uuid[]))
    AND tstzrange(r.starts_at, r.ends_at) && tstzrange(('2026-12-01 00:00:00+08')::timestamptz, ('2026-12-31 23:59:00+08')::timestamptz)
    AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = r.event_id AND e.status = 'completed');
  DELETE FROM public.event_equipment_requirements q
  WHERE q.equipment_item_id IN (SELECT id FROM public.equipment_items WHERE code IN ('proj', 'mic', 'laptop', 'hdmi', 'uat-projector', 'uat-smoke-machine'))
    AND (q.event_id::text LIKE '00000000-0000-4000-80%' OR q.event_id::text LIKE '00000000-0000-0000-00%') AND NOT (q.event_id = ANY (ARRAY['00000000-0000-4000-8031-000000000201', '00000000-0000-4000-8031-000000000209']::uuid[]))
    AND tstzrange(q.required_from, q.required_until) && tstzrange(('2026-12-01 00:00:00+08')::timestamptz, ('2026-12-31 23:59:00+08')::timestamptz)
    AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = q.event_id AND e.status = 'completed');
END $$;

-- Event "UAT Expo" (Planning, 2026-12-01 10:00 to 2026-12-01 14:00, id 00000000-0000-4000-8031-000000000201). Stops if a real event has this title.
-- A status that can't move back to Planning is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('UAT Expo') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'UAT Expo';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8031-000000000201';
  IF FOUND AND v_status <> 'planning' AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8031-000000000201';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8031-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8031-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'UAT Expo', 'Meeting', 'UAT event UAT Expo.', 100,
          ('2026-12-01 10:00:00+08')::timestamptz, ('2026-12-01 14:00:00+08')::timestamptz, 'planning', ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
          NULL, false, false, false, NULL)
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
  VALUES ('00000000-0000-4000-8031-000000000201', 'Central Area', NULL, NULL, NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly none.
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8031-000000000201' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8031-000000000201';
END $$;
-- Records "UAT Expo" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8031-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8031-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8031-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8031-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8031-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8031-000000000201' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8031-000000000201';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8031-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8031-000000000201' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8031-000000000201' AND NOT (id = ANY (ARRAY['00000000-0000-4000-8031-000000000601']::uuid[]));
  -- mic x 80, 2026-12-01 10:00 to 2026-12-01 14:00, sent to Technical Support.
  INSERT INTO public.event_equipment_requirements AS rq (id, event_id, equipment_item_id, equipment_name, quantity, required_from,
                                                        required_until, notes, needs_review, needs_review_reason, requested_at, requested_by)
  VALUES ('00000000-0000-4000-8031-000000000601', '00000000-0000-4000-8031-000000000201', (SELECT id FROM public.equipment_items WHERE code = 'mic'), (SELECT name FROM public.equipment_items WHERE code = 'mic'), 80,
          ('2026-12-01 10:00:00+08')::timestamptz, ('2026-12-01 14:00:00+08')::timestamptz, NULL, false, NULL,
          '2026-09-25 10:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET equipment_item_id = EXCLUDED.equipment_item_id, quantity = EXCLUDED.quantity, required_from = EXCLUDED.required_from,
      required_until = EXCLUDED.required_until, notes = EXCLUDED.notes, needs_review = EXCLUDED.needs_review,
      needs_review_reason = EXCLUDED.needs_review_reason, requested_at = EXCLUDED.requested_at, requested_by = EXCLUDED.requested_by
  WHERE (rq.equipment_item_id, rq.quantity, rq.required_from, rq.required_until, rq.notes, rq.needs_review, rq.needs_review_reason, rq.requested_at, rq.requested_by)
        IS DISTINCT FROM (EXCLUDED.equipment_item_id, EXCLUDED.quantity, EXCLUDED.required_from, EXCLUDED.required_until, EXCLUDED.notes,
                          EXCLUDED.needs_review, EXCLUDED.needs_review_reason, EXCLUDED.requested_at, EXCLUDED.requested_by);
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8031-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8031-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8031-000000000201') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8031-000000000201';
    
  END IF;
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8031-000000000201';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8031-000000000201';
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8031-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8031-000000000201') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8031-000000000201'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8031-000000000201'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8031-000000000201'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8031-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8031-000000000201'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8031-000000000201'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8031-000000000201'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8031-000000000201') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8031-000000000201';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8031-000000000201') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.requirement_id, v.change_type, v.previous_value, v.new_value, v.changed_by, v.changed_at)::text ORDER BY v.changed_at, row(v.event_id, v.requirement_id, v.change_type, v.previous_value, v.new_value, v.changed_by, v.changed_at)::text) FROM (VALUES
      ('00000000-0000-4000-8031-000000000201'::uuid, '00000000-0000-4000-8031-000000000601'::uuid, 'added', NULL::jsonb, (SELECT public.event_equipment_snapshot(x) FROM public.event_equipment_requirements x WHERE x.id = '00000000-0000-4000-8031-000000000601'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, ('2026-09-25 10:00:00+08')::timestamptz)) v(event_id, requirement_id, change_type, previous_value, new_value, changed_by, changed_at)) THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8031-000000000201';
    INSERT INTO public.event_equipment_changes (event_id, requirement_id, change_type, previous_value, new_value, changed_by, changed_at) SELECT v.event_id, v.requirement_id, v.change_type, v.previous_value, v.new_value, v.changed_by, v.changed_at FROM (VALUES
      ('00000000-0000-4000-8031-000000000201'::uuid, '00000000-0000-4000-8031-000000000601'::uuid, 'added', NULL::jsonb, (SELECT public.event_equipment_snapshot(x) FROM public.event_equipment_requirements x WHERE x.id = '00000000-0000-4000-8031-000000000601'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, ('2026-09-25 10:00:00+08')::timestamptz)) v(event_id, requirement_id, change_type, previous_value, new_value, changed_by, changed_at);
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8031-000000000201' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8031-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

-- Event "UAT Talk" (Planning, 2026-12-01 09:00 to 2026-12-01 15:00, id 00000000-0000-4000-8031-000000000209). Stops if a real event has this title.
-- A status that can't move back to Planning is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('UAT Talk') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'UAT Talk';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8031-000000000209';
  IF FOUND AND v_status <> 'planning' AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8031-000000000209';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8031-000000000209' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8031-000000000209', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'UAT Talk', 'Meeting', 'UAT event UAT Talk.', 100,
          ('2026-12-01 09:00:00+08')::timestamptz, ('2026-12-01 15:00:00+08')::timestamptz, 'planning', ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
          NULL, false, false, false, NULL)
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
  VALUES ('00000000-0000-4000-8031-000000000209', 'Central Area', NULL, NULL, NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly none.
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8031-000000000209' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8031-000000000209';
END $$;
-- Records "UAT Talk" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8031-000000000209') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8031-000000000209' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8031-000000000209';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8031-000000000209', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8031-000000000209') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8031-000000000209' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8031-000000000209';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8031-000000000209', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8031-000000000209' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8031-000000000209' AND NOT (id = ANY (ARRAY['00000000-0000-4000-8031-000000000609']::uuid[]));
  -- mic x 20, 2026-12-01 09:00 to 2026-12-01 15:00, sent to Technical Support.
  INSERT INTO public.event_equipment_requirements AS rq (id, event_id, equipment_item_id, equipment_name, quantity, required_from,
                                                        required_until, notes, needs_review, needs_review_reason, requested_at, requested_by)
  VALUES ('00000000-0000-4000-8031-000000000609', '00000000-0000-4000-8031-000000000209', (SELECT id FROM public.equipment_items WHERE code = 'mic'), (SELECT name FROM public.equipment_items WHERE code = 'mic'), 20,
          ('2026-12-01 09:00:00+08')::timestamptz, ('2026-12-01 15:00:00+08')::timestamptz, NULL, false, NULL,
          '2026-09-25 10:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET equipment_item_id = EXCLUDED.equipment_item_id, quantity = EXCLUDED.quantity, required_from = EXCLUDED.required_from,
      required_until = EXCLUDED.required_until, notes = EXCLUDED.notes, needs_review = EXCLUDED.needs_review,
      needs_review_reason = EXCLUDED.needs_review_reason, requested_at = EXCLUDED.requested_at, requested_by = EXCLUDED.requested_by
  WHERE (rq.equipment_item_id, rq.quantity, rq.required_from, rq.required_until, rq.notes, rq.needs_review, rq.needs_review_reason, rq.requested_at, rq.requested_by)
        IS DISTINCT FROM (EXCLUDED.equipment_item_id, EXCLUDED.quantity, EXCLUDED.required_from, EXCLUDED.required_until, EXCLUDED.notes,
                          EXCLUDED.needs_review, EXCLUDED.needs_review_reason, EXCLUDED.requested_at, EXCLUDED.requested_by);
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8031-000000000209' AND NOT (id = ANY (ARRAY['00000000-0000-4000-8031-000000000659']::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8031-000000000209' AND NOT (id = ANY (ARRAY['00000000-0000-4000-8031-000000000659']::uuid[]));
  -- mic x 20 reserved by andy.
  INSERT INTO public.equipment_reservations AS er (id, event_id, equipment_item_id, requirement_id, quantity, starts_at, ends_at, status, requested_by, requested_at, decided_by, decided_at, needs_recheck, recheck_reason, released_at, released_by)
  VALUES ('00000000-0000-4000-8031-000000000659', '00000000-0000-4000-8031-000000000209', (SELECT id FROM public.equipment_items WHERE code = 'mic'), '00000000-0000-4000-8031-000000000609', 20, ('2026-12-01 09:00:00+08')::timestamptz, ('2026-12-01 15:00:00+08')::timestamptz, 'approved', (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com'), ('2026-10-01 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com'), ('2026-10-01 10:00:00+08')::timestamptz, false, NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, equipment_item_id = EXCLUDED.equipment_item_id, requirement_id = EXCLUDED.requirement_id, quantity = EXCLUDED.quantity, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, requested_by = EXCLUDED.requested_by, requested_at = EXCLUDED.requested_at, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at, needs_recheck = EXCLUDED.needs_recheck, recheck_reason = EXCLUDED.recheck_reason, released_at = EXCLUDED.released_at, released_by = EXCLUDED.released_by
  WHERE (er.event_id, er.equipment_item_id, er.requirement_id, er.quantity, er.starts_at, er.ends_at, er.status, er.requested_by, er.requested_at, er.decided_by, er.decided_at, er.needs_recheck, er.recheck_reason, er.released_at, er.released_by) IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.equipment_item_id, EXCLUDED.requirement_id, EXCLUDED.quantity, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.decided_by, EXCLUDED.decided_at, EXCLUDED.needs_recheck, EXCLUDED.recheck_reason, EXCLUDED.released_at, EXCLUDED.released_by);
  IF (SELECT array_agg(row(t.reservation_id, t.action, t.details, t.actor, t.occurred_at)::text ORDER BY t.occurred_at, row(t.reservation_id, t.action, t.details, t.actor, t.occurred_at)::text) FROM public.equipment_reservation_events t WHERE t.reservation_id = '00000000-0000-4000-8031-000000000659') IS DISTINCT FROM (SELECT array_agg(row(v.reservation_id, v.action, v.details, v.actor, v.occurred_at)::text ORDER BY v.occurred_at, row(v.reservation_id, v.action, v.details, v.actor, v.occurred_at)::text) FROM (VALUES
      ('00000000-0000-4000-8031-000000000659'::uuid, 'reserved', jsonb_build_object('quantity', 20, 'startsAt', to_char(('2026-12-01 09:00:00+08')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'endsAt', to_char(('2026-12-01 15:00:00+08')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com')::uuid, ('2026-10-01 10:00:00+08')::timestamptz)) v(reservation_id, action, details, actor, occurred_at)) THEN
    DELETE FROM public.equipment_reservation_events t WHERE t.reservation_id = '00000000-0000-4000-8031-000000000659';
    INSERT INTO public.equipment_reservation_events (reservation_id, action, details, actor, occurred_at) SELECT v.reservation_id, v.action, v.details, v.actor, v.occurred_at FROM (VALUES
      ('00000000-0000-4000-8031-000000000659'::uuid, 'reserved', jsonb_build_object('quantity', 20, 'startsAt', to_char(('2026-12-01 09:00:00+08')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'endsAt', to_char(('2026-12-01 15:00:00+08')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com')::uuid, ('2026-10-01 10:00:00+08')::timestamptz)) v(reservation_id, action, details, actor, occurred_at);
  END IF;
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8031-000000000209') IS DISTINCT FROM (SELECT array_agg(row(v.requirement_id, v.event_id, v.status, v.note, v.updated_by, v.updated_at)::text ORDER BY v.updated_at, row(v.requirement_id, v.event_id, v.status, v.note, v.updated_by, v.updated_at)::text) FROM (VALUES
      ('00000000-0000-4000-8031-000000000609'::uuid, '00000000-0000-4000-8031-000000000209'::uuid, 'arranged', 'Reserved 20 of 20'::text, (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com')::uuid, ('2026-10-01 10:00:00+08')::timestamptz)) v(requirement_id, event_id, status, note, updated_by, updated_at)) THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8031-000000000209';
    INSERT INTO public.equipment_arrangement_updates (requirement_id, event_id, status, note, updated_by, updated_at) SELECT v.requirement_id, v.event_id, v.status, v.note, v.updated_by, v.updated_at FROM (VALUES
      ('00000000-0000-4000-8031-000000000609'::uuid, '00000000-0000-4000-8031-000000000209'::uuid, 'arranged', 'Reserved 20 of 20'::text, (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com')::uuid, ('2026-10-01 10:00:00+08')::timestamptz)) v(requirement_id, event_id, status, note, updated_by, updated_at);
  END IF;
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8031-000000000209';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8031-000000000209';
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8031-000000000209' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8031-000000000209') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8031-000000000209'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8031-000000000209'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8031-000000000209'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8031-000000000209';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8031-000000000209'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8031-000000000209'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8031-000000000209'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8031-000000000209') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8031-000000000209';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8031-000000000209') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.requirement_id, v.change_type, v.previous_value, v.new_value, v.changed_by, v.changed_at)::text ORDER BY v.changed_at, row(v.event_id, v.requirement_id, v.change_type, v.previous_value, v.new_value, v.changed_by, v.changed_at)::text) FROM (VALUES
      ('00000000-0000-4000-8031-000000000209'::uuid, '00000000-0000-4000-8031-000000000609'::uuid, 'added', NULL::jsonb, (SELECT public.event_equipment_snapshot(x) FROM public.event_equipment_requirements x WHERE x.id = '00000000-0000-4000-8031-000000000609'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, ('2026-09-25 10:00:00+08')::timestamptz)) v(event_id, requirement_id, change_type, previous_value, new_value, changed_by, changed_at)) THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8031-000000000209';
    INSERT INTO public.event_equipment_changes (event_id, requirement_id, change_type, previous_value, new_value, changed_by, changed_at) SELECT v.event_id, v.requirement_id, v.change_type, v.previous_value, v.new_value, v.changed_by, v.changed_at FROM (VALUES
      ('00000000-0000-4000-8031-000000000209'::uuid, '00000000-0000-4000-8031-000000000609'::uuid, 'added', NULL::jsonb, (SELECT public.event_equipment_snapshot(x) FROM public.event_equipment_requirements x WHERE x.id = '00000000-0000-4000-8031-000000000609'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, ('2026-09-25 10:00:00+08')::timestamptz)) v(event_id, requirement_id, change_type, previous_value, new_value, changed_by, changed_at);
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8031-000000000209' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8031-000000000209' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

COMMIT;

SELECT 'spm31_tc006_setup.sql: setup complete' AS result;
