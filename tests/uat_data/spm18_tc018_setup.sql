-- SPM-18 TC-018: Save an entry with several room layouts
-- Acceptance criterion: AC05
-- Login: Venue Staff (daryl@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): new venue "Flex Room" (Ang Mo Kio)
-- Source: Logged in as Venue Staff.
--         plus derived from Test Steps and Test Data
-- Records restored: profile daryl@gmail.com
-- Must-not-exist conditions enforced: venue "Flex Room" at Ang Mo Kio
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

-- Must not exist: venue "Flex Room" at Ang Mo Kio (created by an earlier run of this case).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues v
             WHERE lower(trim(v.name)) = lower('Flex Room') AND (v.location IN ('Ang Mo Kio') OR v.area_tags = ARRAY['Ang Mo Kio'])
               AND (EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
                    OR EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id))) THEN
    RAISE EXCEPTION 'Venue Flex Room at Ang Mo Kio has bookings or linked events; remove it by hand before running this file';
  END IF;
  DELETE FROM public.venues v WHERE lower(trim(v.name)) = lower('Flex Room') AND (v.location IN ('Ang Mo Kio') OR v.area_tags = ARRAY['Ang Mo Kio']);
END $$;

COMMIT;

SELECT 'spm18_tc018_setup.sql: setup complete' AS result;
