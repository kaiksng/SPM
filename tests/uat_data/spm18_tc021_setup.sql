-- SPM-18 TC-021: Accept a venue creation with an similar name but different location
-- Acceptance criterion: AC01, AC07
-- Login: Venue Staff (daryl@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): new venue "SMU Seminar Room 3-1" (North)
-- Source: Logged in as Venue Staff.
--         "SMU Seminar Room 3-1" exists at South. No "SMU Seminar Room 3-1" exists at North.
-- Records restored: profile daryl@gmail.com; venue "SMU Seminar Room 3-1" (South, key 00000000-0000-4000-8018-000000000131)
-- Must-not-exist conditions enforced: venue "SMU Seminar Room 3-1" at North
-- Defaults added: Venue values beyond name/location reuse TC-001/TC-002 Test Data: 100 pax, Classroom, Mon-Sun 09:00-18:00 (agreed in Questions)
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

-- Must not exist: venue "SMU Seminar Room 3-1" at North (created by an earlier run of this case).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues v
             WHERE lower(trim(v.name)) = lower('SMU Seminar Room 3-1') AND (v.location IN ('North') OR v.area_tags = ARRAY['North'])
               AND (EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
                    OR EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id))) THEN
    RAISE EXCEPTION 'Venue SMU Seminar Room 3-1 at North has bookings or linked events; remove it by hand before running this file';
  END IF;
  DELETE FROM public.venues v WHERE lower(trim(v.name)) = lower('SMU Seminar Room 3-1') AND (v.location IN ('North') OR v.area_tags = ARRAY['North']);
END $$;

-- Venue "SMU Seminar Room 3-1" (South): found by name + location (unique), else by its fixed id, else inserted.
DO $$
DECLARE v_id uuid := (SELECT id FROM public.venues WHERE name = 'SMU Seminar Room 3-1' AND location = 'South');
BEGIN
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8018-000000000131';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.venues (id, name, location, area_tags, capacity, operating_hours,
                               setup_time_minutes, turnaround_time_minutes)
    VALUES ('00000000-0000-4000-8018-000000000131', 'SMU Seminar Room 3-1', 'South', ARRAY['South'], 100,
            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "09:00", "closesAt": "18:00"}]'::jsonb, 0, 0)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.venues
    SET name = 'SMU Seminar Room 3-1', location = 'South', area_tags = ARRAY['South'],
        capacity = 100, operating_hours = '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "09:00", "closesAt": "18:00"}]'::jsonb,
        setup_time_minutes = 0, turnaround_time_minutes = 0
    WHERE id = v_id
      AND (name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
          IS DISTINCT FROM ('SMU Seminar Room 3-1', 'South', ARRAY['South'], 100,
                            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "09:00", "closesAt": "18:00"}]'::jsonb, 0, 0);
  END IF;

  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities
  WHERE venue_id = v_id AND facility_name <> ALL (ARRAY[]::text[]);
  INSERT INTO public.venue_facilities (venue_id, facility_name)
  SELECT v_id, f FROM unnest(ARRAY[]::text[]) AS f
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_facilities x WHERE x.venue_id = v_id AND x.facility_name = f);

  DELETE FROM public.venue_layouts
  WHERE venue_id = v_id AND layout_name <> ALL (ARRAY['Classroom']::text[]);
  INSERT INTO public.venue_layouts (venue_id, layout_name)
  SELECT v_id, l FROM unnest(ARRAY['Classroom']::text[]) AS l
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts x WHERE x.venue_id = v_id AND x.layout_name = l);
END $$;

COMMIT;

SELECT 'spm18_tc021_setup.sql: setup complete' AS result;
