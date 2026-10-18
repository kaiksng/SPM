-- SPM-77 TC-006: Safety Officer attempting to reach the Lead home page directly is denied
-- Acceptance criterion: AC3 / AC4
-- Run with: pnpm uat:setup spm77_tc006   (from the repo root; see tests/uat_data/README.md)
-- Login: Safety Officer (sally@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: derived from Test Data (no prose precondition): sally@gmail.com has the Safety Officer role only
-- Records restored: profile sally (role reset)
-- Must-not-exist conditions enforced: none
-- Defaults added: none
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Profile and role for sally@gmail.com (Safety Officer). Auth is only read, never written.
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

COMMIT;
