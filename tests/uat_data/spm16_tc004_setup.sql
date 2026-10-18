-- SPM-16 TC-004: Technical Support-only information is not accessible to Venue Staff
-- Acceptance criterion: AC2
-- Run with: pnpm uat:setup spm16_tc004   (from the repo root; see tests/uat_data/README.md)
-- Login: Venue Staff (daryl@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: Venue Staff user is signed in. Information exists that only Technical Support may access
-- Records restored: profile daryl. The Technical Support-only information is the equipment Inventory page; its catalogue is seeded by the migrations, so no rows are added
-- Must-not-exist conditions enforced: none
-- Defaults added: none
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Profile and role for daryl@gmail.com (Venue Staff). Auth is only read, never written.
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

COMMIT;
