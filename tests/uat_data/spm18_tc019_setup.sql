-- SPM-18 TC-019: Accept a venue creation with an similar name but different location
-- Acceptance criterion: AC01, AC07
-- Login: Venue Staff (daryl@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): new venue "SMU Seminar Room 3-1" (North)
-- Source: Logged in as Venue Staff.
--         "SMU Seminar Room 3-1" exists at South. No "SMU Seminar Room 3-1" exists at North.
-- Records restored: profile daryl@gmail.com; venue "SMU Seminar Room 3-1" (South, key 00000000-0000-4000-8018-000000000131)
-- Must-not-exist conditions enforced: venue "SMU Seminar Room 3-1" at North
-- Defaults added: Venue values beyond name/location reuse TC-001/TC-002 Test Data: 100 pax, Classroom, Mon-Sun 09:00-18:00 (agreed in Questions)
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm18_tc019   (from the repo root; see tests/uat_data/README.md)

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

-- Earlier versions of these files used another reserved id range. Remove any test records
-- left under those ids (with their own bookings, flags and history) so they can't clash.
DO $$
DECLARE v_ids uuid[] := ARRAY[
  '00000000-0000-0000-0018-000000000131'
]::uuid[];
BEGIN
  DELETE FROM public.venue_bookings WHERE id = ANY (v_ids);
  DELETE FROM public.events WHERE id = ANY (v_ids);
  DELETE FROM public.venues WHERE id = ANY (v_ids);
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'UAT setup stopped: an old test venue is still used by a non-test booking or event. Nothing was changed.';
END $$;

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
-- Only a venue saved by a test account is removed; any other venue with this name stops the file.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues v
             WHERE lower(trim(v.name)) = lower('SMU Seminar Room 3-1') AND (v.location IN ('North') OR v.area_tags = ARRAY['North'])
               AND NOT (v.id::text LIKE '00000000-0000-0000-00%' OR v.id::text LIKE '00000000-0000-4000-80%' OR v.updated_by IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a venue named SMU Seminar Room 3-1 exists that was not created by a test account. Nothing was changed.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.venues v
             WHERE lower(trim(v.name)) = lower('SMU Seminar Room 3-1') AND (v.location IN ('North') OR v.area_tags = ARRAY['North'])
               AND (EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
                    OR EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id))) THEN
    RAISE EXCEPTION 'Venue SMU Seminar Room 3-1 at North has bookings or linked events; remove it by hand before running this file';
  END IF;
  DELETE FROM public.venues v WHERE lower(trim(v.name)) = lower('SMU Seminar Room 3-1') AND (v.location IN ('North') OR v.area_tags = ARRAY['North'])
    AND (v.id::text LIKE '00000000-0000-0000-00%' OR v.id::text LIKE '00000000-0000-4000-80%' OR v.updated_by IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')));
END $$;

-- Venue "SMU Seminar Room 3-1" (South): restored on its fixed id; stops if a real venue already has this name and location.
DO $$
DECLARE v_id uuid;
BEGIN
  -- Must not exist: a copy of this venue that a test account created in the app (e.g. in a
  -- create case). Removed only when no booking or event uses it.
  DELETE FROM public.venues v WHERE v.name = 'SMU Seminar Room 3-1' AND v.location = 'South' AND v.id <> '00000000-0000-4000-8018-000000000131'
    AND (v.id::text LIKE '00000000-0000-0000-00%' OR v.id::text LIKE '00000000-0000-4000-80%' OR v.updated_by IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')))
    AND NOT EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
    AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id);
  -- Clash guard: a real (non-test) venue already uses this name and location.
  IF EXISTS (SELECT 1 FROM public.venues WHERE name = 'SMU Seminar Room 3-1' AND location = 'South'
             AND id <> '00000000-0000-4000-8018-000000000131') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "SMU Seminar Room 3-1" at South exists. Nothing was changed.';
  END IF;
  SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8018-000000000131';
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

SELECT 'spm18_tc019_setup.sql: setup complete' AS result;
