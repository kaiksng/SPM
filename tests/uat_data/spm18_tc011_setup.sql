-- SPM-18 TC-011: Reject an opening time equal to the closing time
-- Acceptance criterion: AC06, AC09
-- Login: Venue Staff (daryl@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): an invalid "Fish tank" venue (not saved)
-- Source: Logged in as Venue Staff. 
--         No venue named "Fish tank" exists.
-- Records restored: profile daryl@gmail.com
-- Must-not-exist conditions enforced: venue "Fish tank" at North
-- Defaults added: none
-- Safe to re-run: restores this case's records only; all other data is left untouched.
-- Not a migration: run it by hand (Supabase SQL editor on testDB, or psql) right before the test.

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

-- Must not exist: venue "Fish tank" at North (created by an earlier run of this case).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues v
             WHERE lower(trim(v.name)) = lower('Fish tank') AND (v.location IN ('North') OR v.area_tags = ARRAY['North'])
               AND (EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
                    OR EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id))) THEN
    RAISE EXCEPTION 'Venue Fish tank at North has bookings or linked events; remove it by hand before running this file';
  END IF;
  DELETE FROM public.venues v WHERE lower(trim(v.name)) = lower('Fish tank') AND (v.location IN ('North') OR v.area_tags = ARRAY['North']);
END $$;

COMMIT;

SELECT 'spm18_tc011_setup.sql: setup complete' AS result;
