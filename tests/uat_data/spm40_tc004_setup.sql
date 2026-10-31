-- SPM-40-TC-004: Organiser changes registration on a Confirmed event sent back to Planning
-- Acceptance criterion: AC 2
-- Login: Event Organiser (jasmine@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): see Test Data
-- Source: refined Preconditions of docs/Project Planning_refined_v2.xlsx
-- Records restored: profiles daryl, jasmine, jonathan, joyce, sally, tom; event "E19 Music Festival" (id 00000000-0000-4000-8040-000000000201: planning, organiser jasmine, coordinator joyce, 2099-07-01 10:00-12:00, approved request at Registration Hall, registration capacity 80, history draft > requested > planning > pending_safety_check > confirmed > planning)
-- Must-not-exist conditions enforced: other UAT test events' venue requests overlapping this case's events at its test venues; other clarifications, change requests, notifications, venue requests and equipment on "E19 Music Festival"
-- Defaults added: Central Area test venues (Venue A 200 pax, Angel Hall 300, Registration Hall 100, Small Studio 50; open all day); event descriptions and times not stated in the case; workflow dates 18 Sep - 28 Oct 2026
-- Shared records: cases of a story use the same test events (E1, E3, E18, E19, Venue A...): test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm40_tc004   (from the repo root)

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

-- Venue "Registration Hall" (Central Area, 100 pax, open all day, setup 0 min, turnaround 0 min; id 00000000-0000-4000-8040-000000000101).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues WHERE lower(name) = lower('Registration Hall') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "%" exists. Nothing was changed.', 'Registration Hall';
  END IF;
  INSERT INTO public.venues AS ve (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
  VALUES ('00000000-0000-4000-8040-000000000101', 'Registration Hall', 'Central Area', ARRAY['Central Area'], 100, '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "00:00", "closesAt": "23:59"}]'::jsonb, 0, 0)
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
  AND NOT (b.id = ANY (ARRAY['00000000-0000-4000-8040-000000000401']::uuid[]))
  AND (b.event_id = ANY (ARRAY['00000000-0000-4000-8040-000000000201']::uuid[])
       OR (b.venue_id = ANY (ARRAY['00000000-0000-4000-8040-000000000101']::uuid[]) AND (tstzrange(b.starts_at, b.ends_at) && tstzrange('2099-07-01 10:00:00+08', '2099-07-01 12:00:00+08'))));

-- Event "E19 Music Festival" (Planning, id 00000000-0000-4000-8040-000000000201). Stops if a real event has this title.
-- A status that can't move back to Planning is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('E19 Music Festival') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')
             AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'E19 Music Festival';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8040-000000000201';
  IF FOUND AND v_status <> 'planning' AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8040-000000000201';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8040-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id)
  VALUES ('00000000-0000-4000-8040-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'E19 Music Festival', 'Meeting', 'UAT event E19 Music Festival.', 80,
          '2099-07-01 10:00:00+08', '2099-07-01 12:00:00+08', 'planning', '2026-09-20 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
          '00000000-0000-4000-8040-000000000101')
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
  VALUES ('00000000-0000-4000-8040-000000000201', 'Central Area', NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, accessibility_notes = NULL
  WHERE (r.preferred_location, r.accessibility_notes) IS DISTINCT FROM (EXCLUDED.preferred_location, NULL::text);
  -- Registration settings: registration_required=true, attendee_capacity=80, registration_opens_at='2099-06-01 09:00:00+08', registration_closes_at='2099-06-20 18:00:00+08', waitlist_enabled=true, withdrawal_permitted=true.
  INSERT INTO public.event_registration_requirements AS s (event_id, registration_required, attendee_capacity, registration_opens_at, registration_closes_at, waitlist_enabled, withdrawal_permitted)
  VALUES ('00000000-0000-4000-8040-000000000201', true, 80, '2099-06-01 09:00:00+08', '2099-06-20 18:00:00+08', true, true)
  ON CONFLICT (event_id) DO UPDATE SET registration_required = EXCLUDED.registration_required, attendee_capacity = EXCLUDED.attendee_capacity, registration_opens_at = EXCLUDED.registration_opens_at, registration_closes_at = EXCLUDED.registration_closes_at, waitlist_enabled = EXCLUDED.waitlist_enabled, withdrawal_permitted = EXCLUDED.withdrawal_permitted
  WHERE (s.registration_required, s.attendee_capacity, s.registration_opens_at, s.registration_closes_at, s.waitlist_enabled, s.withdrawal_permitted) IS DISTINCT FROM (EXCLUDED.registration_required, EXCLUDED.attendee_capacity, EXCLUDED.registration_opens_at, EXCLUDED.registration_closes_at, EXCLUDED.waitlist_enabled, EXCLUDED.withdrawal_permitted);
END $$;
-- Records "E19 Music Festival" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8040-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8040-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8040-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8040-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8040-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8040-000000000201' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8040-000000000201';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8040-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- Approved venue request at "Registration Hall" 2099-07-01 10:00 to 12:00 (requested by joyce, approved by Daryl).
  IF EXISTS (SELECT 1 FROM public.venue_bookings WHERE venue_id = '00000000-0000-4000-8040-000000000101' AND status IN ('pending', 'approved', 'on_hold')
             AND NOT (event_id::text LIKE '00000000-0000-4000-80%' OR event_id::text LIKE '00000000-0000-0000-00%') AND tstzrange(starts_at, ends_at) && tstzrange('2099-07-01 10:00:00+08', '2099-07-01 12:00:00+08')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real booking holds "Registration Hall" at the time of "E19 Music Festival". Nothing was changed.';
  END IF;
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8040-000000000201' AND id <> '00000000-0000-4000-8040-000000000401' AND status IN ('pending', 'approved', 'on_hold');
  INSERT INTO public.venue_bookings AS vb (id, event_id, venue_id, starts_at, ends_at, status, is_main_venue, expected_headcount,
                                           requested_by, requested_at, decided_by, decided_at, decision_notes, held_by, expires_at,
                                           cancelled_at, cancelled_by, cancellation_reason, needs_review, needs_review_reason)
  VALUES ('00000000-0000-4000-8040-000000000401', '00000000-0000-4000-8040-000000000201', '00000000-0000-4000-8040-000000000101', '2099-07-01 10:00:00+08', '2099-07-01 12:00:00+08', 'approved', true, 80, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-09-23 10:00:00+08',
          (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), '2026-09-24 10:00:00+08', NULL, NULL, NULL, NULL, NULL, NULL, false, NULL)
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
  DELETE FROM public.venue_booking_conflicts WHERE booking_id = '00000000-0000-4000-8040-000000000401';
  DELETE FROM public.venue_booking_disruptions WHERE booking_id = '00000000-0000-4000-8040-000000000401';
  -- Equipment requirements: exactly the listed ones.
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8040-000000000201';
  DELETE FROM public.equipment_arrangement_updates WHERE event_id = '00000000-0000-4000-8040-000000000201';
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8040-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Safety check: 1 submission(s), decided by Sally.
  IF (SELECT count(*) FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8040-000000000201') <> 1
     OR (SELECT count(*) FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8040-000000000201') <> 1
     OR NOT (EXISTS (SELECT 1 FROM public.event_safety_check_submissions s WHERE s.event_id = '00000000-0000-4000-8040-000000000201' AND s.round = 1 AND s.submitted_at = '2026-09-26 10:00:00+08' AND s.coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')) AND EXISTS (SELECT 1 FROM public.event_safety_check_decisions x WHERE x.event_id = '00000000-0000-4000-8040-000000000201' AND x.outcome = 'approved' AND x.decided_at = '2026-09-29 10:00:00+08')) THEN
    DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8040-000000000201';
    DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8040-000000000201';
    INSERT INTO public.event_safety_check_submissions (event_id, coordinator_id, round, venues_snapshot, period_snapshot,
                                                       attendance_snapshot, equipment_snapshot, submitted_at)
    VALUES ('00000000-0000-4000-8040-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 1, jsonb_build_array(jsonb_build_object('bookingId', '00000000-0000-4000-8040-000000000401', 'venueName', 'Registration Hall', 'isMainVenue', true, 'status', 'complete', 'needsReviewReason', NULL)), jsonb_build_object('startsAt', '2099-07-01 10:00:00+08'::timestamptz, 'endsAt', '2099-07-01 12:00:00+08'::timestamptz),
            80, '[]'::jsonb, '2026-09-26 10:00:00+08')
    RETURNING id INTO v_sub;
    INSERT INTO public.event_safety_check_decisions (event_id, submission_id, decided_by, outcome, reason, decided_at)
    VALUES ('00000000-0000-4000-8040-000000000201', v_sub, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com'), 'approved', NULL, '2026-09-29 10:00:00+08');
  END IF;
  -- Clarifications: exactly the listed ones.
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8040-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8040-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8040-000000000201')
     IS DISTINCT FROM (SELECT array_agg(row(f.at, f.who, f.fr, f.t)::text ORDER BY f.at) FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-09-22 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status),
      ('2026-09-26 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'planning'::public.event_status, 'pending_safety_check'::public.event_status),
      ('2026-09-29 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com'), 'pending_safety_check'::public.event_status, 'confirmed'::public.event_status),
      ('2026-10-05 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'confirmed'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8040-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8040-000000000201', f.at, f.who, f.fr, f.t FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-09-22 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status),
      ('2026-09-26 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'planning'::public.event_status, 'pending_safety_check'::public.event_status),
      ('2026-09-29 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com'), 'pending_safety_check'::public.event_status, 'confirmed'::public.event_status),
      ('2026-10-05 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'confirmed'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8040-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

COMMIT;

SELECT 'spm40_tc004_setup.sql: setup complete' AS result;
