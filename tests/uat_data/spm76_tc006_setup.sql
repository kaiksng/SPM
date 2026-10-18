-- SPM-76 TC-006: Notification centre with zero notifications shows an empty state and no badge
-- Acceptance criterion: AC1 / AC2
-- Run with: pnpm uat:setup spm76_tc006   (from the repo root; see tests/uat_data/README.md)
-- Login: Event Coordinator (joyce@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: derived from Test Data and Expected Result (no prose precondition); notifications follow what the app sends (user decision)
-- Records restored: profile joyce
-- Must-not-exist conditions enforced: every notification of joyce@gmail.com (deleted)
-- Defaults added: none
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

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

-- Must not exist: any notification for joyce@gmail.com (the case expects none at all).
DELETE FROM public.notifications
WHERE recipient_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com');

COMMIT;
