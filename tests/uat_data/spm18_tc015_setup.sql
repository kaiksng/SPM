-- SPM-18 TC-015: Reject negative capacity
-- Acceptance criterion: AC04, AC06
-- Login: Venue Staff (daryl@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): an invalid "SMU Seminar Room 2-7" venue (not saved)
-- Source: Logged in as Venue Staff.
--         No venue named "SMU Seminar Room 2-7" exists
-- Records restored: profile daryl@gmail.com
-- Must-not-exist conditions enforced: venue "SMU Seminar Room 2-7" at North
-- Defaults added: none
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm18_tc015   (from the repo root; see tests/uat_data/README.md)

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

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

-- Must not exist: venue "SMU Seminar Room 2-7" at North (created by an earlier run of this case).
-- Only a venue saved by a test account is removed; any other venue with this name stops the file.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues v
             WHERE lower(trim(v.name)) = lower('SMU Seminar Room 2-7') AND (v.location IN ('North') OR v.area_tags = ARRAY['North'])
               AND NOT (v.id::text LIKE '00000000-0000-0000-00%' OR v.updated_by IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a venue named SMU Seminar Room 2-7 exists that was not created by a test account. Nothing was changed.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.venues v
             WHERE lower(trim(v.name)) = lower('SMU Seminar Room 2-7') AND (v.location IN ('North') OR v.area_tags = ARRAY['North'])
               AND (EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
                    OR EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id))) THEN
    RAISE EXCEPTION 'Venue SMU Seminar Room 2-7 at North has bookings or linked events; remove it by hand before running this file';
  END IF;
  DELETE FROM public.venues v WHERE lower(trim(v.name)) = lower('SMU Seminar Room 2-7') AND (v.location IN ('North') OR v.area_tags = ARRAY['North'])
    AND (v.id::text LIKE '00000000-0000-0000-00%' OR v.updated_by IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')));
END $$;

COMMIT;

SELECT 'spm18_tc015_setup.sql: setup complete' AS result;
