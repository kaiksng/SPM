-- SPM-49 TC-001: Attendee views the attendee landing page
-- Acceptance criterion: AC1
-- Run with: pnpm uat:setup spm49_tc001   (from the repo root; see tests/uat_data/README.md)
-- Login: Attendee (joseph@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: derived from Test Steps and Expected Result (user decision: the attendee landing page is the attendee-facing information)
-- Records restored: profile joseph (role reset)
-- Must-not-exist conditions enforced: none
-- Defaults added: none
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Profile and role for joseph@gmail.com (Attendee). Auth is only read, never written.
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

COMMIT;
