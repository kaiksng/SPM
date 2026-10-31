-- SPM-26-TC-001: Coordinator cannot request a venue that another booking already occupies
-- Acceptance criterion: AC 1, AC 4
-- Login: Event Coordinator (joyce@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): see Test Data
-- Source: refined Preconditions of docs/Project Planning_refined_v2.xlsx
-- Records restored: profiles daryl, jasmine, jonathan, joyce, sally, tom; blocks on Venue A: none; event "E10 Leadership Workshop" (id 00000000-0000-4000-8026-000000000201: planning, organiser jasmine, coordinator jonathan, 2026-11-10 10:00-12:00, pending request at Venue A, history draft > requested > planning); event "E11 Data Bootcamp" (id 00000000-0000-4000-8026-000000000202: planning, organiser jasmine, coordinator joyce, 2026-11-10 11:00-13:00, history draft > requested > planning)
-- Must-not-exist conditions enforced: other UAT test events' venue requests overlapping this case's events at its test venues; other clarifications, change requests, notifications, venue requests and equipment on "E10 Leadership Workshop"; other clarifications, change requests, notifications, venue requests and equipment on "E11 Data Bootcamp"
-- Defaults added: Central Area test venues (Venue A 200 pax, Angel Hall 300, Registration Hall 100, Small Studio 50; open all day); event descriptions and times not stated in the case; workflow dates 18 Sep - 28 Oct 2026
-- Shared records: cases of a story use the same test events (E1, E3, E18, E19, Venue A...): test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm26_tc001   (from the repo root)

BEGIN;

-- Lets this file set assigned coordinators and equipment request fields of its own test events.
SET LOCAL app.coordinator_reassignment = 'on';
SET LOCAL app.requesting_equipment = 'on';

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

-- Venue "Venue A" (Central Area, 200 pax, open all day, setup 0 min, turnaround 0 min; id 00000000-0000-4000-8026-000000000101).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues WHERE lower(name) = lower('Venue A') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "%" exists. Nothing was changed.', 'Venue A';
  END IF;
  INSERT INTO public.venues AS ve (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
  VALUES ('00000000-0000-4000-8026-000000000101', 'Venue A', 'Central Area', ARRAY['Central Area'], 200, '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "00:00", "closesAt": "23:59"}]'::jsonb, 0, 0)
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, location = EXCLUDED.location, area_tags = EXCLUDED.area_tags, capacity = EXCLUDED.capacity,
      operating_hours = EXCLUDED.operating_hours, setup_time_minutes = EXCLUDED.setup_time_minutes,
      turnaround_time_minutes = EXCLUDED.turnaround_time_minutes
  WHERE (ve.name, ve.location, ve.area_tags, ve.capacity, ve.operating_hours, ve.setup_time_minutes, ve.turnaround_time_minutes)
        IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.location, EXCLUDED.area_tags, EXCLUDED.capacity, EXCLUDED.operating_hours,
                          EXCLUDED.setup_time_minutes, EXCLUDED.turnaround_time_minutes);
END $$;

-- Venue requests left by an earlier run or another case: this case's own stale requests, and other UAT test events'
-- requests at this case's test venues that overlap its event times, are released so they can't block or distort it.
UPDATE public.venue_bookings b SET status = 'cancelled', cancelled_at = now()
FROM public.events x
WHERE x.id = b.event_id AND x.status <> 'completed' AND b.status IN ('pending', 'approved', 'on_hold')
  AND (b.event_id::text LIKE '00000000-0000-4000-80%' OR b.event_id::text LIKE '00000000-0000-0000-00%')
  AND NOT (b.id = ANY (ARRAY['00000000-0000-4000-8026-000000000401']::uuid[]))
  AND (b.event_id = ANY (ARRAY['00000000-0000-4000-8026-000000000201', '00000000-0000-4000-8026-000000000202']::uuid[])
       OR (b.venue_id = ANY (ARRAY['00000000-0000-4000-8026-000000000101']::uuid[]) AND (tstzrange(b.starts_at, b.ends_at) && tstzrange('2026-11-10 10:00:00+08', '2026-11-10 12:00:00+08') OR tstzrange(b.starts_at, b.ends_at) && tstzrange('2026-11-10 11:00:00+08', '2026-11-10 13:00:00+08'))));

-- Blocks on "Venue A": none. Other active blocks on this test venue are removed.
UPDATE public.venue_unavailability SET removed_at = now()
WHERE venue_id = '00000000-0000-4000-8026-000000000101' AND removed_at IS NULL AND NOT (id = ANY (ARRAY[]::uuid[]));

-- Event "E10 Leadership Workshop" (Planning, id 00000000-0000-4000-8026-000000000201). Stops if a real event has this title.
-- A status that can't move back to Planning is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('E10 Leadership Workshop') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')
             AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'E10 Leadership Workshop';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8026-000000000201';
  IF FOUND AND v_status <> 'planning' AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8026-000000000201';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8026-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id)
  VALUES ('00000000-0000-4000-8026-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'E10 Leadership Workshop', 'Meeting', 'UAT event E10 Leadership Workshop.', 80,
          '2026-11-10 10:00:00+08', '2026-11-10 12:00:00+08', 'planning', '2026-09-20 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
          NULL)
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id, title = EXCLUDED.title,
      purpose = EXCLUDED.purpose, description = EXCLUDED.description, expected_attendance = EXCLUDED.expected_attendance,
      starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, submitted_at = EXCLUDED.submitted_at,
      submitted_by = EXCLUDED.submitted_by, requirements_acknowledged = EXCLUDED.requirements_acknowledged, venue_id = EXCLUDED.venue_id
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.purpose, ev.description, ev.expected_attendance, ev.starts_at,
         ev.ends_at, ev.status, ev.submitted_at, ev.submitted_by, ev.requirements_acknowledged, ev.venue_id)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title, EXCLUDED.purpose,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status,
                          EXCLUDED.submitted_at, EXCLUDED.submitted_by, EXCLUDED.requirements_acknowledged, EXCLUDED.venue_id);
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, accessibility_notes)
  VALUES ('00000000-0000-4000-8026-000000000201', 'Central Area', NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, accessibility_notes = NULL
  WHERE (r.preferred_location, r.accessibility_notes) IS DISTINCT FROM (EXCLUDED.preferred_location, NULL::text);
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8026-000000000201';
END $$;
-- Records "E10 Leadership Workshop" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8026-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8026-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8026-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8026-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8026-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8026-000000000201' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8026-000000000201';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8026-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- Pending venue request at "Venue A" 2026-11-10 10:00 to 12:00 (requested by jonathan).
  IF EXISTS (SELECT 1 FROM public.venue_bookings WHERE venue_id = '00000000-0000-4000-8026-000000000101' AND status IN ('pending', 'approved', 'on_hold')
             AND NOT (event_id::text LIKE '00000000-0000-4000-80%' OR event_id::text LIKE '00000000-0000-0000-00%') AND tstzrange(starts_at, ends_at) && tstzrange('2026-11-10 10:00:00+08', '2026-11-10 12:00:00+08')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real booking holds "Venue A" at the time of "E10 Leadership Workshop". Nothing was changed.';
  END IF;
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8026-000000000201' AND id <> '00000000-0000-4000-8026-000000000401' AND status IN ('pending', 'approved', 'on_hold');
  INSERT INTO public.venue_bookings AS vb (id, event_id, venue_id, starts_at, ends_at, status, is_main_venue, expected_headcount,
                                           requested_by, requested_at, decided_by, decided_at, decision_notes, held_by, expires_at,
                                           cancelled_at, cancelled_by, cancellation_reason, needs_review, needs_review_reason)
  VALUES ('00000000-0000-4000-8026-000000000401', '00000000-0000-4000-8026-000000000201', '00000000-0000-4000-8026-000000000101', '2026-11-10 10:00:00+08', '2026-11-10 12:00:00+08', 'pending', true, 80, (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), '2026-09-23 10:00:00+08',
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status, is_main_venue = true, expected_headcount = EXCLUDED.expected_headcount, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at, decision_notes = NULL,
      held_by = NULL, expires_at = NULL, cancelled_at = NULL, cancelled_by = NULL, cancellation_reason = NULL,
      needs_review = false, needs_review_reason = NULL
  WHERE (vb.event_id, vb.venue_id, vb.starts_at, vb.ends_at, vb.status, vb.is_main_venue, vb.expected_headcount, vb.requested_by,
         vb.requested_at, vb.decided_by, vb.decided_at, vb.decision_notes, vb.held_by, vb.expires_at, vb.cancelled_at, vb.needs_review)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, true,
                          EXCLUDED.expected_headcount, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.decided_by,
                          EXCLUDED.decided_at, NULL::text, NULL::uuid, NULL::timestamptz, NULL::timestamptz, false);
  DELETE FROM public.venue_booking_conflicts WHERE booking_id = '00000000-0000-4000-8026-000000000401';
  DELETE FROM public.venue_booking_disruptions WHERE booking_id = '00000000-0000-4000-8026-000000000401';
  -- Equipment requirements: exactly the listed ones.
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8026-000000000201';
  DELETE FROM public.equipment_arrangement_updates WHERE event_id = '00000000-0000-4000-8026-000000000201';
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8026-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8026-000000000201';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8026-000000000201';
  -- Clarifications: exactly the listed ones.
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8026-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8026-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8026-000000000201')
     IS DISTINCT FROM (SELECT array_agg(row(f.at, f.who, f.fr, f.t)::text ORDER BY f.at) FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-09-22 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8026-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8026-000000000201', f.at, f.who, f.fr, f.t FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-09-22 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8026-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

-- Event "E11 Data Bootcamp" (Planning, id 00000000-0000-4000-8026-000000000202). Stops if a real event has this title.
-- A status that can't move back to Planning is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('E11 Data Bootcamp') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')
             AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'E11 Data Bootcamp';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8026-000000000202';
  IF FOUND AND v_status <> 'planning' AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8026-000000000202';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8026-000000000202' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id)
  VALUES ('00000000-0000-4000-8026-000000000202', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'E11 Data Bootcamp', 'Meeting', 'UAT event E11 Data Bootcamp.', 80,
          '2026-11-10 11:00:00+08', '2026-11-10 13:00:00+08', 'planning', '2026-09-20 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
          NULL)
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id, title = EXCLUDED.title,
      purpose = EXCLUDED.purpose, description = EXCLUDED.description, expected_attendance = EXCLUDED.expected_attendance,
      starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, submitted_at = EXCLUDED.submitted_at,
      submitted_by = EXCLUDED.submitted_by, requirements_acknowledged = EXCLUDED.requirements_acknowledged, venue_id = EXCLUDED.venue_id
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.purpose, ev.description, ev.expected_attendance, ev.starts_at,
         ev.ends_at, ev.status, ev.submitted_at, ev.submitted_by, ev.requirements_acknowledged, ev.venue_id)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title, EXCLUDED.purpose,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status,
                          EXCLUDED.submitted_at, EXCLUDED.submitted_by, EXCLUDED.requirements_acknowledged, EXCLUDED.venue_id);
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, accessibility_notes)
  VALUES ('00000000-0000-4000-8026-000000000202', 'Central Area', NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, accessibility_notes = NULL
  WHERE (r.preferred_location, r.accessibility_notes) IS DISTINCT FROM (EXCLUDED.preferred_location, NULL::text);
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8026-000000000202';
END $$;
-- Records "E11 Data Bootcamp" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8026-000000000202') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8026-000000000202' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8026-000000000202';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8026-000000000202', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8026-000000000202') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8026-000000000202' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8026-000000000202';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8026-000000000202', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- No active venue request for this event.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8026-000000000202' AND status IN ('pending', 'approved', 'on_hold');
  -- Equipment requirements: exactly the listed ones.
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8026-000000000202';
  DELETE FROM public.equipment_arrangement_updates WHERE event_id = '00000000-0000-4000-8026-000000000202';
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8026-000000000202' AND NOT (id = ANY (ARRAY[]::uuid[]));
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8026-000000000202';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8026-000000000202';
  -- Clarifications: exactly the listed ones.
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8026-000000000202' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8026-000000000202' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8026-000000000202')
     IS DISTINCT FROM (SELECT array_agg(row(f.at, f.who, f.fr, f.t)::text ORDER BY f.at) FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-09-22 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8026-000000000202';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8026-000000000202', f.at, f.who, f.fr, f.t FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-09-22 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8026-000000000202' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

COMMIT;

SELECT 'spm26_tc001_setup.sql: setup complete' AS result;
