-- SPM-13 TC-002: Sign in as Event Coordinator with valid credentials and lands on different view
-- Acceptance criterion: AC1 / Scenario 1
-- Login: Event Coordinator (joyce@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: Active Event Coordinator account exists. User is not signed in.
-- Records restored: profile joyce@gmail.com
-- Must-not-exist conditions enforced: none
-- Defaults added: none
-- Safe to re-run: restores this case's records only; all other data is left untouched.
-- Not a migration: run it by hand (Supabase SQL editor on testDB, or psql) right before the test.

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

-- Profile and role for joyce@gmail.com (Event Coordinator). Auth is only read, never written.
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

COMMIT;

SELECT 'spm13_tc002_setup.sql: setup complete' AS result;
