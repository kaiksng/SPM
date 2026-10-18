-- SPM-77 TC-001: Event Coordinator Lead is routed to the Lead home page on sign-in
-- Acceptance criterion: AC1
-- Run with: pnpm uat:setup spm77_tc001   (from the repo root; see tests/uat_data/README.md)
-- Login: Event Coordinator Lead (tom@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: derived from Test Data (no prose precondition): tom@gmail.com's account has the role Event Coordinator Lead
-- Records restored: profile tom (role reset)
-- Must-not-exist conditions enforced: none
-- Defaults added: none
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Profile and role for tom@gmail.com (Event Coordinator Lead). Auth is only read, never written.
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

COMMIT;
