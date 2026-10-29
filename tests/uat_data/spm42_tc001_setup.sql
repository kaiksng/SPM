-- SPM-42-TC-001: Waiting-list option is offered when the event is full, registration is open and the waiting list is enabled
-- Acceptance criterion: AC01
-- Login: Attendee (daniel@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): none (registering, joining, withdrawing or leaving happens in the app)
-- Source: Preconditions (key record lines) of docs/Attendee Registration Test Cases_refined.xlsx
-- Records restored: profile jasmine@gmail.com; profile joyce@gmail.com; profile tom@gmail.com; profile daryl@gmail.com; profile sally@gmail.com; profile daniel@gmail.com; profile joseph@gmail.com; venue "Bayside Lawn" (id 00000000-0000-4000-8042-000000000101); event "Jazz by the Bay Concert" (Confirmed, id 00000000-0000-4000-8042-000000000201) with its registration settings and location; its approved main-venue booking (id 00000000-0000-4000-8042-000000000401), coordinator assignment and decision, safety-check submission and approval, and status history Draft -> Requested -> Planning -> Pending Safety Check -> Confirmed; registrations: joseph registered (id 00000000-0000-4000-8042-000000000311)
-- Must-not-exist conditions enforced: other registrations by test accounts on "Jazz by the Bay Concert"; notifications on "Jazz by the Bay Concert"; other active venue requests on "Jazz by the Bay Concert" (cancelled)
-- Defaults added: Organiser jasmine@gmail.com, coordinator joyce@gmail.com, location Marina Bay, event date and description (agreed in Questions); Valid business state for Confirmed: venue Bayside Lawn (capacity 200, open all day), booking approved by daryl@gmail.com, assigned by tom@gmail.com, safety check approved by sally@gmail.com, all between 18 and 29 Sep 2026; Queue order by registration time 5 Oct 2026 10:00, 10:01, 10:02 (first listed = earliest)
-- Shared records: cases of a story use the same test events, so test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm42_tc001   (from the repo root)

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

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

-- Venue "Bayside Lawn" (Marina Bay, fixed id 00000000-0000-4000-8042-000000000101): the test event's main venue. Stops if a real venue has this name.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues WHERE lower(name) = lower('Bayside Lawn') AND id <> '00000000-0000-4000-8042-000000000101') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Bayside Lawn" exists. Nothing was changed.';
  END IF;
  INSERT INTO public.venues AS ve (id, name, location, area_tags, capacity, operating_hours,
                                   setup_time_minutes, turnaround_time_minutes)
  VALUES ('00000000-0000-4000-8042-000000000101', 'Bayside Lawn', 'Marina Bay', ARRAY['Marina Bay'], 200, '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "00:00", "closesAt": "23:59"}]'::jsonb, 0, 0)
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, location = EXCLUDED.location, area_tags = EXCLUDED.area_tags, capacity = EXCLUDED.capacity,
      operating_hours = EXCLUDED.operating_hours, setup_time_minutes = 0, turnaround_time_minutes = 0
  WHERE (ve.name, ve.location, ve.area_tags, ve.capacity, ve.operating_hours, ve.setup_time_minutes, ve.turnaround_time_minutes)
        IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.location, EXCLUDED.area_tags, EXCLUDED.capacity, EXCLUDED.operating_hours, 0, 0);
END $$;

-- Event "Jazz by the Bay Concert" (fixed id 00000000-0000-4000-8042-000000000201), Confirmed. Stops if a real event already uses this title.
-- A status that can't move back to Confirmed (e.g. cancelled) is restored by deleting and re-inserting this test event;
-- its own registrations, notifications and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Jazz by the Bay Concert')
             AND id::text NOT LIKE '00000000-0000-4000-80%' AND id::text NOT LIKE '00000000-0000-0000-00%') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Jazz by the Bay Concert';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8042-000000000201';
  IF FOUND AND v_status <> 'confirmed' AND NOT public.event_status_transition_allowed(v_status, 'confirmed') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8042-000000000201';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged)
  VALUES ('00000000-0000-4000-8042-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Jazz by the Bay Concert', 'An open-air evening of live jazz by the bay.', 1,
          '2026-12-18 19:30:00+08', '2026-12-18 21:30:00+08', 'confirmed', '2026-09-20 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true)
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description, expected_attendance = EXCLUDED.expected_attendance,
      starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status,
      requirements_acknowledged = EXCLUDED.requirements_acknowledged
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status, ev.requirements_acknowledged)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title, EXCLUDED.description,
                          EXCLUDED.expected_attendance, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status,
                          EXCLUDED.requirements_acknowledged);

  -- Location shown on the attendee pages (the event's preferred location).
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location)
  VALUES ('00000000-0000-4000-8042-000000000201', 'Marina Bay')
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location
  WHERE r.preferred_location IS DISTINCT FROM EXCLUDED.preferred_location;

  -- Registration settings: required, capacity 1, window 2026-10-01 09:00 to 2026-11-30 18:00,
  -- waiting list on, withdrawal allowed.
  INSERT INTO public.event_registration_requirements AS s (event_id, registration_required, attendee_capacity,
                                                           registration_opens_at, registration_closes_at,
                                                           waitlist_enabled, withdrawal_permitted)
  VALUES ('00000000-0000-4000-8042-000000000201', true, 1, '2026-10-01 09:00:00+08', '2026-11-30 18:00:00+08', true, true)
  ON CONFLICT (event_id) DO UPDATE
  SET registration_required = true, attendee_capacity = EXCLUDED.attendee_capacity,
      registration_opens_at = EXCLUDED.registration_opens_at, registration_closes_at = EXCLUDED.registration_closes_at,
      waitlist_enabled = EXCLUDED.waitlist_enabled, withdrawal_permitted = EXCLUDED.withdrawal_permitted
  WHERE (s.registration_required, s.attendee_capacity, s.registration_opens_at, s.registration_closes_at,
         s.waitlist_enabled, s.withdrawal_permitted)
        IS DISTINCT FROM (true, EXCLUDED.attendee_capacity, EXCLUDED.registration_opens_at,
                          EXCLUDED.registration_closes_at, EXCLUDED.waitlist_enabled, EXCLUDED.withdrawal_permitted);
END $$;

-- Records a real Confirmed event has, as if it went through the app: Tom assigned Joyce, Joyce approved the request,
-- Daryl approved the main-venue booking, Joyce submitted the safety check and Sally approved it. Only rows of this
-- test event are touched; each set is rewritten only when it differs from the starting state.
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Stops if a real booking (not on a test event) holds the test venue at this event's time.
  IF EXISTS (SELECT 1 FROM public.venue_bookings
             WHERE venue_id = '00000000-0000-4000-8042-000000000101' AND status IN ('pending', 'approved', 'on_hold')
               AND event_id::text NOT LIKE '00000000-0000-4000-80%' AND event_id::text NOT LIKE '00000000-0000-0000-00%'
               AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-18 19:30:00+08', '2026-12-18 21:30:00+08')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real booking holds "Bayside Lawn" at the time of "Jazz by the Bay Concert". Nothing was changed.';
  END IF;

  -- Must not exist: other active venue requests on this test event (e.g. one a tester made).
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8042-000000000201' AND id <> '00000000-0000-4000-8042-000000000401' AND status IN ('pending', 'approved', 'on_hold');

  INSERT INTO public.venue_bookings AS vb (id, event_id, venue_id, starts_at, ends_at, status, is_main_venue, expected_headcount,
                                           requested_by, requested_at, decided_by, decided_at, held_by, expires_at,
                                           cancelled_at, cancelled_by, cancellation_reason, needs_review, needs_review_reason)
  VALUES ('00000000-0000-4000-8042-000000000401', '00000000-0000-4000-8042-000000000201', '00000000-0000-4000-8042-000000000101', '2026-12-18 19:30:00+08', '2026-12-18 21:30:00+08', 'approved', true, 1,
          (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-09-23 10:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), '2026-09-24 10:00:00+08', NULL, NULL,
          NULL, NULL, NULL, false, NULL)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = 'approved', is_main_venue = true, expected_headcount = EXCLUDED.expected_headcount,
      requested_by = EXCLUDED.requested_by, requested_at = EXCLUDED.requested_at, decided_by = EXCLUDED.decided_by,
      decided_at = EXCLUDED.decided_at, held_by = NULL, expires_at = NULL, cancelled_at = NULL, cancelled_by = NULL,
      cancellation_reason = NULL, needs_review = false, needs_review_reason = NULL
  WHERE (vb.event_id, vb.venue_id, vb.starts_at, vb.ends_at, vb.status, vb.is_main_venue, vb.expected_headcount, vb.requested_by,
         vb.requested_at, vb.decided_by, vb.decided_at, vb.held_by, vb.expires_at, vb.cancelled_at, vb.needs_review)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.starts_at, EXCLUDED.ends_at, 'approved'::public.request_status,
                          true, EXCLUDED.expected_headcount, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.decided_by,
                          EXCLUDED.decided_at, NULL::uuid, NULL::timestamptz, NULL::timestamptz, false);
  UPDATE public.events SET venue_id = '00000000-0000-4000-8042-000000000101' WHERE id = '00000000-0000-4000-8042-000000000201' AND venue_id IS DISTINCT FROM '00000000-0000-4000-8042-000000000101';

  -- Coordinator assignment by the Lead (Tom), and Joyce's decision approving the request.
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8042-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8042-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8042-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8042-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8042-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8042-000000000201' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-09-22 10:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8042-000000000201';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8042-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-09-22 10:00:00+08');
  END IF;

  -- Safety check: round 1 submitted by Joyce, approved by Sally.
  IF (SELECT count(*) FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8042-000000000201') <> 1
     OR (SELECT count(*) FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8042-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_safety_check_submissions s JOIN public.event_safety_check_decisions d ON d.submission_id = s.id
                    WHERE s.event_id = '00000000-0000-4000-8042-000000000201' AND s.round = 1 AND s.coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                      AND s.submitted_at = '2026-09-28 10:00:00+08' AND s.venues_snapshot = jsonb_build_array(jsonb_build_object('bookingId', '00000000-0000-4000-8042-000000000401', 'venueName', 'Bayside Lawn', 'isMainVenue', true, 'status', 'complete', 'needsReviewReason', NULL))
                      AND s.attendance_snapshot = 1 AND s.equipment_snapshot = '[]'::jsonb
                      AND s.period_snapshot = jsonb_build_object('startsAt', '2026-12-18 19:30:00+08'::timestamptz, 'endsAt', '2026-12-18 21:30:00+08'::timestamptz)
                      AND d.outcome = 'approved' AND d.decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com') AND d.decided_at = '2026-09-29 10:00:00+08'
                      AND d.reason IS NULL AND d.flagged_booking_ids = '{}' AND d.flagged_requirement_ids = '{}') THEN
    DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8042-000000000201';
    DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8042-000000000201';
    INSERT INTO public.event_safety_check_submissions (event_id, coordinator_id, round, venues_snapshot, period_snapshot,
                                                       attendance_snapshot, equipment_snapshot, submitted_at)
    VALUES ('00000000-0000-4000-8042-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 1, jsonb_build_array(jsonb_build_object('bookingId', '00000000-0000-4000-8042-000000000401', 'venueName', 'Bayside Lawn', 'isMainVenue', true, 'status', 'complete', 'needsReviewReason', NULL)),
            jsonb_build_object('startsAt', '2026-12-18 19:30:00+08'::timestamptz, 'endsAt', '2026-12-18 21:30:00+08'::timestamptz), 1, '[]'::jsonb,
            '2026-09-28 10:00:00+08')
    RETURNING id INTO v_sub;
    INSERT INTO public.event_safety_check_decisions (event_id, submission_id, decided_by, outcome, reason, decided_at)
    VALUES ('00000000-0000-4000-8042-000000000201', v_sub, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com'), 'approved', NULL, '2026-09-29 10:00:00+08');
  END IF;

  -- Status history: Draft -> Requested -> Planning -> Pending Safety Check -> Confirmed, each by the person who did it.
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8042-000000000201')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-09-22 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status),
      ('2026-09-28 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'planning'::public.event_status, 'pending_safety_check'::public.event_status),
      ('2026-09-29 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com'), 'pending_safety_check'::public.event_status, 'confirmed'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8042-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8042-000000000201', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-09-22 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status),
      ('2026-09-28 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'planning'::public.event_status, 'pending_safety_check'::public.event_status),
      ('2026-09-29 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com'), 'pending_safety_check'::public.event_status, 'confirmed'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

-- Registrations on "Jazz by the Bay Concert" (joseph registered, in queue order). Stops if a real attendee is registered.
DO $$
DECLARE v_real text;
BEGIN
  SELECT u.email INTO v_real
  FROM public.event_registrations g JOIN auth.users u ON u.id = g.attendee_id
  WHERE g.event_id = '00000000-0000-4000-8042-000000000201' AND g.attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))
  LIMIT 1;
  IF v_real IS NOT NULL THEN
    RAISE EXCEPTION 'UAT setup stopped: a real attendee (%) has a registration on a test event. Nothing was changed.', v_real;
  END IF;

  -- Must not exist: any other registration by a test account on this test event (e.g. one a tester made).
  DELETE FROM public.event_registrations
  WHERE event_id = '00000000-0000-4000-8042-000000000201' AND attendee_id IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')) AND attendee_id NOT IN ((SELECT id FROM auth.users WHERE lower(email) = 'joseph@gmail.com'));

  -- Must not exist: notifications left on this test event by an earlier run (e.g. "waitlist promoted").
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8042-000000000201';

  INSERT INTO public.event_registrations AS g (id, event_id, attendee_id, status, registered_at, withdrawn_at, withdrawal_reason)
  VALUES ('00000000-0000-4000-8042-000000000311', '00000000-0000-4000-8042-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joseph@gmail.com'), 'registered', '2026-10-05 10:00:00+08', NULL, NULL)
  ON CONFLICT (event_id, attendee_id) DO UPDATE
  SET status = EXCLUDED.status, registered_at = EXCLUDED.registered_at, withdrawn_at = NULL, withdrawal_reason = NULL
  WHERE (g.status, g.registered_at, g.withdrawn_at, g.withdrawal_reason)
        IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.registered_at, NULL::timestamptz, NULL::text);
END $$;

COMMIT;

SELECT 'spm42_tc001_setup.sql: setup complete' AS result;
