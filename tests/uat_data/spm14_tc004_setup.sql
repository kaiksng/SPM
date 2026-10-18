-- SPM-14 TC-004: An action on an unauthorised event is denied and changes nothing
-- Acceptance criterion: AC2
-- Run with: pnpm uat:setup spm14_tc004   (from the repo root; see tests/uat_data/README.md)
-- Login: Event Organiser (jasmine@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: Organiser is signed in. Event Z exists that the Organiser is not authorised on, with known details.
-- Records restored: profiles jasmine, kenneth; event "Event Z" (id 00000000-0000-0000-0014-000000000203, Requested, organiser kenneth, known details)
-- Must-not-exist conditions enforced: none
-- Defaults added: Event Z: organiser kenneth@gmail.com (second Event Organiser), Requested, 3 Dec 2026 10:00-12:00, 60 pax, purpose "Networking"
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

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

-- Event "Event Z" (fixed id), status requested. A status that can't move to requested (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-0000-0014-000000000203';
  IF FOUND AND v_status <> 'requested'
     AND NOT public.event_status_transition_allowed(v_status, 'requested') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-0000-0014-000000000203';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description, purpose,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-0000-0014-000000000203', (SELECT id FROM auth.users WHERE lower(email) = 'kenneth@gmail.com'), NULL, 'Event Z', 'UAT event for SPM-14 organiser access.', 'Networking',
          60, '2026-12-03 10:00:00+08', '2026-12-03 12:00:00+08', 'requested',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'kenneth@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description, purpose = EXCLUDED.purpose,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.purpose, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.purpose, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

COMMIT;
