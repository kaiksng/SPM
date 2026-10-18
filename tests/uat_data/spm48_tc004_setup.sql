-- SPM-48 TC-004: Venue Staff-only information is not accessible to Technical Support
-- Acceptance criterion: AC2
-- Run with: pnpm uat:setup spm48_tc004   (from the repo root; see tests/uat_data/README.md)
-- Login: Technical Support Staff (andy@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: Technical Support Staff user is signed in. Information exists that only Venue Staff may access.
-- Records restored: profile andy. The Venue Staff-only information is the venue Requests page (/venue-requests), a page-level restriction, so no rows are added
-- Must-not-exist conditions enforced: none
-- Defaults added: none
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Profile and role for andy@gmail.com (Technical Support Staff). Auth is only read, never written.
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

COMMIT;
