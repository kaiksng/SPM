-- SPM-17 TC-005: Block direct entry of the Event Details address for a role without access
-- Acceptance criterion: AC2 & AC3
-- Login: Event Organiser (jasmine@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): URL "/events/0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1"
-- Source: An event exists. The signed-in role (Event Organiser) has no access to Event Details that is not access to them
-- Records restored: profile jasmine@gmail.com; profile kenneth@gmail.com; event "Annual Partner Appreciation Dinner" (id 0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1)
-- Must-not-exist conditions enforced: none
-- Defaults added: Event title, date (Thu 10 Dec 2026 18:00-21:00), 50 pax, status Requested, organiser kenneth@gmail.com (agreed in Questions)
-- Safe to re-run: restores this case's records only; all other data is left untouched.
-- Not a migration: run it by hand (Supabase SQL editor on testDB, or psql) right before the test.

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

-- Profile and role for jasmine@gmail.com (Event Organiser). Auth is only read, never written.
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

-- Profile and role for kenneth@gmail.com (Event Organiser). Auth is only read, never written.
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

-- Event "Annual Partner Appreciation Dinner" (fixed id). A status that can't move back to requested (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1';
  IF FOUND AND v_status <> 'requested'
     AND NOT public.event_status_transition_allowed(v_status, 'requested') THEN
    DELETE FROM public.events WHERE id = '0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1', (SELECT id FROM auth.users WHERE lower(email) = 'kenneth@gmail.com'), NULL, 'Annual Partner Appreciation Dinner', 'Private appreciation dinner for partner organisations.',
          50, '2026-12-10 18:00:00+08', '2026-12-10 21:00:00+08', 'requested',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'kenneth@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

COMMIT;

SELECT 'spm17_tc005_setup.sql: setup complete' AS result;
