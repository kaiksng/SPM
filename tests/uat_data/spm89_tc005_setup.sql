-- SPM-89-TC-005: Request Changes/Reject is unavailable for an event that is not Pending Safety Check
-- Acceptance criterion: AC 2, AC 3
-- Login: Safety Officer (sally@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): see Test Data (reasons, choices)
-- Source: refined Preconditions and Test Data of docs/Project Planning_refined_v2.xlsx; dates and shared events per its Questions tab
-- Records restored: profiles andy, daniel, daryl, jasmine, joseph, joyce, sally, tom; event "Autumn Fest 2026" (planning, id 00000000-0000-4000-8089-000000000203, organiser jasmine, coordinator joyce, 0 safety round(s), history draft > requested > planning)
-- Must-not-exist conditions enforced: notifications, extra venue requests and extra equipment rows on "Autumn Fest 2026"
-- Defaults added: Marina Bay test venues (300 pax, open all day); December 2026 evening event times; workflow dates 18 Sep - 28 Oct 2026
-- Shared records: SPM-43/44 share their events, and SPM-44/89 share Grand Ballroom and PA Sound System; test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm89_tc005   (from the repo root)

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

-- Event "Autumn Fest 2026" (Planning; fixed id 00000000-0000-4000-8089-000000000203). Stops if a real event has this title.
-- A status that can't move back (e.g. Cancelled) is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Autumn Fest 2026') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Autumn Fest 2026';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8089-000000000203';
  IF FOUND AND v_status <> 'planning' AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8089-000000000203';
  END IF;
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged)
  VALUES ('00000000-0000-4000-8089-000000000203', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Autumn Fest 2026', 'Autumn festival still being planned.', 100, '2026-12-17 18:00:00+08', '2026-12-17 21:00:00+08', 'planning',
          '2026-09-20 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true)
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id, title = EXCLUDED.title,
      description = EXCLUDED.description, expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, requirements_acknowledged = true
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance, ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title, EXCLUDED.description,
                          EXCLUDED.expected_attendance, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status);
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location)
  VALUES ('00000000-0000-4000-8089-000000000203', 'Marina Bay')
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location
  WHERE r.preferred_location IS DISTINCT FROM EXCLUDED.preferred_location;
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8089-000000000203';
END $$;
-- Records "Autumn Fest 2026" has as if it went through the app (only rows of this test event are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom); the coordinator approved the request.
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8089-000000000203') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8089-000000000203' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8089-000000000203';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8089-000000000203', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8089-000000000203') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8089-000000000203' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-09-22 10:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8089-000000000203';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8089-000000000203', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-09-22 10:00:00+08');
  END IF;

  -- Planning, not yet booked: no active venue request.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8089-000000000203' AND status IN ('pending', 'approved', 'on_hold');
  UPDATE public.events SET venue_id = NULL WHERE id = '00000000-0000-4000-8089-000000000203' AND venue_id IS NOT NULL;

  -- Equipment: exactly the listed requirements, each sent to Technical Support and reserved in full by Andy.
  DELETE FROM public.equipment_arrangement_updates WHERE event_id = '00000000-0000-4000-8089-000000000203' AND NOT (requirement_id = ANY (ARRAY[]::uuid[]));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8089-000000000203' AND (requirement_id IS NULL OR NOT (requirement_id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8089-000000000203' AND NOT (id = ANY (ARRAY[]::uuid[]));

  -- Not yet submitted for the safety check.
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8089-000000000203';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8089-000000000203';

  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8089-000000000203')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t)::text ORDER BY f.at) FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-09-22 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8089-000000000203';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8089-000000000203', f.at, f.who, f.fr, f.t FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-09-22 10:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
  -- Must not exist: notifications left on this test event by an earlier run.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8089-000000000203';
END $$;

COMMIT;

SELECT 'spm89_tc005_setup.sql: setup complete' AS result;
