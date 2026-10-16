-- SPM-18 TC-013: Accept the smallest positive whole-number capacity
-- Acceptance criterion: AC04
-- Login: Venue Staff (daryl@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): new venue "SMU Seminar Room 2-5" (Central Area, capacity 1)
-- Source: Logged in as Venue Staff. 
--         No venue named "SMU Seminar Room 2-5" exists
-- Records restored: profile daryl@gmail.com
-- Must-not-exist conditions enforced: venue "SMU Seminar Room 2-5" at Central Area
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

-- Must not exist: venue "SMU Seminar Room 2-5" at Central Area (created by an earlier run of this case).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues v
             WHERE lower(trim(v.name)) = lower('SMU Seminar Room 2-5') AND (v.location IN ('Central Area') OR v.area_tags = ARRAY['Central Area'])
               AND (EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
                    OR EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id))) THEN
    RAISE EXCEPTION 'Venue SMU Seminar Room 2-5 at Central Area has bookings or linked events; remove it by hand before running this file';
  END IF;
  DELETE FROM public.venues v WHERE lower(trim(v.name)) = lower('SMU Seminar Room 2-5') AND (v.location IN ('Central Area') OR v.area_tags = ARRAY['Central Area']);
END $$;

COMMIT;

SELECT 'spm18_tc013_setup.sql: setup complete' AS result;
