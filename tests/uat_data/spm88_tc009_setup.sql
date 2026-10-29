-- SPM-88 TC-009: Check all venues flags overlaps in every venue without duplicating existing flags
-- Acceptance criterion: AC1, AC4
-- Login: Venue Staff (daryl@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): click "Re-check all venues"
-- Source: derived from Test Steps, Test Data and Expected Result (no prose precondition)
-- Records restored: profile daryl@gmail.com; profile jasmine@gmail.com; profile joyce@gmail.com; profile jonathan@gmail.com; venue "Auditorium" (Central Area, key 00000000-0000-4000-8088-000000000101); venue "Lecture Theatre 1" (Central Area, key 00000000-0000-4000-8088-000000000102); venue "Seminar Room 1" (Central Area, key 00000000-0000-4000-8088-000000000103); venue "Seminar Room 2" (Central Area, key 00000000-0000-4000-8088-000000000104); venue "Function Hall" (Central Area, key 00000000-0000-4000-8088-000000000105); event "Bigbang Event" (id 00000000-0000-4000-8088-000000000201); event "BTS Event" (id 00000000-0000-4000-8088-000000000202); event "Coldplay Event" (id 00000000-0000-4000-8088-000000000204); event "Twice Event" (id 00000000-0000-4000-8088-000000000205); event "Seventeen Event" (id 00000000-0000-4000-8088-000000000206); event "NewJeans Event" (id 00000000-0000-4000-8088-000000000207); event "Aespa Event" (id 00000000-0000-4000-8088-000000000208); event "IVE Event" (id 00000000-0000-4000-8088-000000000209); event "EXO Event" (id 00000000-0000-4000-8088-000000000210); event "ITZY Event" (id 00000000-0000-4000-8088-000000000211); booking Bigbang Event @ Auditorium (id 00000000-0000-4000-8088-000000000301); booking BTS Event @ Auditorium (id 00000000-0000-4000-8088-000000000302); booking Coldplay Event @ Lecture Theatre 1 (id 00000000-0000-4000-8088-000000000304); booking Twice Event @ Lecture Theatre 1 (id 00000000-0000-4000-8088-000000000305); booking Seventeen Event @ Seminar Room 1 (id 00000000-0000-4000-8088-000000000306); booking NewJeans Event @ Seminar Room 1 (id 00000000-0000-4000-8088-000000000307); booking Aespa Event @ Seminar Room 2 (id 00000000-0000-4000-8088-000000000308); booking IVE Event @ Seminar Room 2 (id 00000000-0000-4000-8088-000000000309); booking EXO Event @ Function Hall (id 00000000-0000-4000-8088-000000000310); booking ITZY Event @ Function Hall (id 00000000-0000-4000-8088-000000000311); active flag pair EXO Event / ITZY Event
-- Must-not-exist conditions enforced: conflict flags on Bigbang Event, BTS Event, Coldplay Event, Twice Event, Seventeen Event, NewJeans Event, Aespa Event, IVE Event; other active bookings of these test events (cancelled); active blocks on these test venues during the bookings (removed)
-- Defaults added: Venue location Central Area, capacity 200, Theatre layout, Mon-Sun 08:00-22:00 (agreed in Questions); Events: organiser jasmine@gmail.com, coordinator joyce@gmail.com (ITZY: jonathan@gmail.com), status Planning, 100 pax; Requested times: the approved booking 1 Oct 2026 10:00, the pending one 10:05 (so the pending one is the later booking); Seminar Room 1 bookings on 15 Dec 2026, Seminar Room 2 on 16 Dec 2026 (dates not stated); Auditorium and Lecture Theatre 1 restored with 0/0 buffers (Expected Result 3)
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Workflow records: status history to the event's status; Lead's coordinator assignment (tom@gmail.com) and the coordinator's approval of the request
-- Run with: pnpm uat:setup spm88_tc009   (from the repo root; see tests/uat_data/README.md)

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

-- Earlier versions of these files used another reserved id range. Remove any test records
-- left under those ids (with their own bookings, flags and history) so they can't clash.
DO $$
DECLARE v_ids uuid[] := ARRAY[
  '00000000-0000-0000-0088-000000000101',
  '00000000-0000-0000-0088-000000000102',
  '00000000-0000-0000-0088-000000000103',
  '00000000-0000-0000-0088-000000000104',
  '00000000-0000-0000-0088-000000000105',
  '00000000-0000-0000-0088-000000000201',
  '00000000-0000-0000-0088-000000000202',
  '00000000-0000-0000-0088-000000000204',
  '00000000-0000-0000-0088-000000000205',
  '00000000-0000-0000-0088-000000000206',
  '00000000-0000-0000-0088-000000000207',
  '00000000-0000-0000-0088-000000000208',
  '00000000-0000-0000-0088-000000000209',
  '00000000-0000-0000-0088-000000000210',
  '00000000-0000-0000-0088-000000000211',
  '00000000-0000-0000-0088-000000000301',
  '00000000-0000-0000-0088-000000000302',
  '00000000-0000-0000-0088-000000000304',
  '00000000-0000-0000-0088-000000000305',
  '00000000-0000-0000-0088-000000000306',
  '00000000-0000-0000-0088-000000000307',
  '00000000-0000-0000-0088-000000000308',
  '00000000-0000-0000-0088-000000000309',
  '00000000-0000-0000-0088-000000000310',
  '00000000-0000-0000-0088-000000000311'
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

-- Profile and role for jasmine@gmail.com (Event Organiser). Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'jasmine@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Jasmine', 'jasmine@gmail.com', 'event_organiser')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

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

-- Profile and role for jonathan@gmail.com (Event Coordinator). Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'jonathan@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Jonathan', 'jonathan@gmail.com', 'event_coordinator')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

-- Venue "Auditorium" (Central Area): restored on its fixed id; stops if a real venue already has this name and location.
DO $$
DECLARE v_id uuid;
BEGIN
  -- Must not exist: a copy of this venue that a test account created in the app (e.g. in a
  -- create case). Removed only when no booking or event uses it.
  DELETE FROM public.venues v WHERE v.name = 'Auditorium' AND v.location = 'Central Area' AND v.id <> '00000000-0000-4000-8088-000000000101'
    AND (v.id::text LIKE '00000000-0000-0000-00%' OR v.id::text LIKE '00000000-0000-4000-80%' OR v.updated_by IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')))
    AND NOT EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
    AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id);
  -- Clash guard: a real (non-test) venue already uses this name and location.
  IF EXISTS (SELECT 1 FROM public.venues WHERE name = 'Auditorium' AND location = 'Central Area'
             AND id <> '00000000-0000-4000-8088-000000000101') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Auditorium" at Central Area exists. Nothing was changed.';
  END IF;
  SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8088-000000000101';
  IF v_id IS NULL THEN
    INSERT INTO public.venues (id, name, location, area_tags, capacity, operating_hours,
                               setup_time_minutes, turnaround_time_minutes)
    VALUES ('00000000-0000-4000-8088-000000000101', 'Auditorium', 'Central Area', ARRAY['Central Area'], 200,
            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb, 0, 0)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.venues
    SET name = 'Auditorium', location = 'Central Area', area_tags = ARRAY['Central Area'],
        capacity = 200, operating_hours = '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb,
        setup_time_minutes = 0, turnaround_time_minutes = 0
    WHERE id = v_id
      AND (name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
          IS DISTINCT FROM ('Auditorium', 'Central Area', ARRAY['Central Area'], 200,
                            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb, 0, 0);
  END IF;

  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities
  WHERE venue_id = v_id AND facility_name <> ALL (ARRAY[]::text[]);
  INSERT INTO public.venue_facilities (venue_id, facility_name)
  SELECT v_id, f FROM unnest(ARRAY[]::text[]) AS f
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_facilities x WHERE x.venue_id = v_id AND x.facility_name = f);

  DELETE FROM public.venue_layouts
  WHERE venue_id = v_id AND layout_name <> ALL (ARRAY['Theatre']::text[]);
  INSERT INTO public.venue_layouts (venue_id, layout_name)
  SELECT v_id, l FROM unnest(ARRAY['Theatre']::text[]) AS l
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts x WHERE x.venue_id = v_id AND x.layout_name = l);
END $$;

-- Venue "Lecture Theatre 1" (Central Area): restored on its fixed id; stops if a real venue already has this name and location.
DO $$
DECLARE v_id uuid;
BEGIN
  -- Must not exist: a copy of this venue that a test account created in the app (e.g. in a
  -- create case). Removed only when no booking or event uses it.
  DELETE FROM public.venues v WHERE v.name = 'Lecture Theatre 1' AND v.location = 'Central Area' AND v.id <> '00000000-0000-4000-8088-000000000102'
    AND (v.id::text LIKE '00000000-0000-0000-00%' OR v.id::text LIKE '00000000-0000-4000-80%' OR v.updated_by IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')))
    AND NOT EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
    AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id);
  -- Clash guard: a real (non-test) venue already uses this name and location.
  IF EXISTS (SELECT 1 FROM public.venues WHERE name = 'Lecture Theatre 1' AND location = 'Central Area'
             AND id <> '00000000-0000-4000-8088-000000000102') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Lecture Theatre 1" at Central Area exists. Nothing was changed.';
  END IF;
  SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8088-000000000102';
  IF v_id IS NULL THEN
    INSERT INTO public.venues (id, name, location, area_tags, capacity, operating_hours,
                               setup_time_minutes, turnaround_time_minutes)
    VALUES ('00000000-0000-4000-8088-000000000102', 'Lecture Theatre 1', 'Central Area', ARRAY['Central Area'], 200,
            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb, 0, 0)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.venues
    SET name = 'Lecture Theatre 1', location = 'Central Area', area_tags = ARRAY['Central Area'],
        capacity = 200, operating_hours = '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb,
        setup_time_minutes = 0, turnaround_time_minutes = 0
    WHERE id = v_id
      AND (name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
          IS DISTINCT FROM ('Lecture Theatre 1', 'Central Area', ARRAY['Central Area'], 200,
                            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb, 0, 0);
  END IF;

  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities
  WHERE venue_id = v_id AND facility_name <> ALL (ARRAY[]::text[]);
  INSERT INTO public.venue_facilities (venue_id, facility_name)
  SELECT v_id, f FROM unnest(ARRAY[]::text[]) AS f
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_facilities x WHERE x.venue_id = v_id AND x.facility_name = f);

  DELETE FROM public.venue_layouts
  WHERE venue_id = v_id AND layout_name <> ALL (ARRAY['Theatre']::text[]);
  INSERT INTO public.venue_layouts (venue_id, layout_name)
  SELECT v_id, l FROM unnest(ARRAY['Theatre']::text[]) AS l
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts x WHERE x.venue_id = v_id AND x.layout_name = l);
END $$;

-- Venue "Seminar Room 1" (Central Area): restored on its fixed id; stops if a real venue already has this name and location.
DO $$
DECLARE v_id uuid;
BEGIN
  -- Must not exist: a copy of this venue that a test account created in the app (e.g. in a
  -- create case). Removed only when no booking or event uses it.
  DELETE FROM public.venues v WHERE v.name = 'Seminar Room 1' AND v.location = 'Central Area' AND v.id <> '00000000-0000-4000-8088-000000000103'
    AND (v.id::text LIKE '00000000-0000-0000-00%' OR v.id::text LIKE '00000000-0000-4000-80%' OR v.updated_by IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')))
    AND NOT EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
    AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id);
  -- Clash guard: a real (non-test) venue already uses this name and location.
  IF EXISTS (SELECT 1 FROM public.venues WHERE name = 'Seminar Room 1' AND location = 'Central Area'
             AND id <> '00000000-0000-4000-8088-000000000103') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Seminar Room 1" at Central Area exists. Nothing was changed.';
  END IF;
  SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8088-000000000103';
  IF v_id IS NULL THEN
    INSERT INTO public.venues (id, name, location, area_tags, capacity, operating_hours,
                               setup_time_minutes, turnaround_time_minutes)
    VALUES ('00000000-0000-4000-8088-000000000103', 'Seminar Room 1', 'Central Area', ARRAY['Central Area'], 200,
            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb, 0, 90)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.venues
    SET name = 'Seminar Room 1', location = 'Central Area', area_tags = ARRAY['Central Area'],
        capacity = 200, operating_hours = '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb,
        setup_time_minutes = 0, turnaround_time_minutes = 90
    WHERE id = v_id
      AND (name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
          IS DISTINCT FROM ('Seminar Room 1', 'Central Area', ARRAY['Central Area'], 200,
                            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb, 0, 90);
  END IF;

  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities
  WHERE venue_id = v_id AND facility_name <> ALL (ARRAY[]::text[]);
  INSERT INTO public.venue_facilities (venue_id, facility_name)
  SELECT v_id, f FROM unnest(ARRAY[]::text[]) AS f
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_facilities x WHERE x.venue_id = v_id AND x.facility_name = f);

  DELETE FROM public.venue_layouts
  WHERE venue_id = v_id AND layout_name <> ALL (ARRAY['Theatre']::text[]);
  INSERT INTO public.venue_layouts (venue_id, layout_name)
  SELECT v_id, l FROM unnest(ARRAY['Theatre']::text[]) AS l
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts x WHERE x.venue_id = v_id AND x.layout_name = l);
END $$;

-- Venue "Seminar Room 2" (Central Area): restored on its fixed id; stops if a real venue already has this name and location.
DO $$
DECLARE v_id uuid;
BEGIN
  -- Must not exist: a copy of this venue that a test account created in the app (e.g. in a
  -- create case). Removed only when no booking or event uses it.
  DELETE FROM public.venues v WHERE v.name = 'Seminar Room 2' AND v.location = 'Central Area' AND v.id <> '00000000-0000-4000-8088-000000000104'
    AND (v.id::text LIKE '00000000-0000-0000-00%' OR v.id::text LIKE '00000000-0000-4000-80%' OR v.updated_by IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')))
    AND NOT EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
    AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id);
  -- Clash guard: a real (non-test) venue already uses this name and location.
  IF EXISTS (SELECT 1 FROM public.venues WHERE name = 'Seminar Room 2' AND location = 'Central Area'
             AND id <> '00000000-0000-4000-8088-000000000104') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Seminar Room 2" at Central Area exists. Nothing was changed.';
  END IF;
  SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8088-000000000104';
  IF v_id IS NULL THEN
    INSERT INTO public.venues (id, name, location, area_tags, capacity, operating_hours,
                               setup_time_minutes, turnaround_time_minutes)
    VALUES ('00000000-0000-4000-8088-000000000104', 'Seminar Room 2', 'Central Area', ARRAY['Central Area'], 200,
            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb, 0, 90)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.venues
    SET name = 'Seminar Room 2', location = 'Central Area', area_tags = ARRAY['Central Area'],
        capacity = 200, operating_hours = '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb,
        setup_time_minutes = 0, turnaround_time_minutes = 90
    WHERE id = v_id
      AND (name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
          IS DISTINCT FROM ('Seminar Room 2', 'Central Area', ARRAY['Central Area'], 200,
                            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb, 0, 90);
  END IF;

  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities
  WHERE venue_id = v_id AND facility_name <> ALL (ARRAY[]::text[]);
  INSERT INTO public.venue_facilities (venue_id, facility_name)
  SELECT v_id, f FROM unnest(ARRAY[]::text[]) AS f
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_facilities x WHERE x.venue_id = v_id AND x.facility_name = f);

  DELETE FROM public.venue_layouts
  WHERE venue_id = v_id AND layout_name <> ALL (ARRAY['Theatre']::text[]);
  INSERT INTO public.venue_layouts (venue_id, layout_name)
  SELECT v_id, l FROM unnest(ARRAY['Theatre']::text[]) AS l
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts x WHERE x.venue_id = v_id AND x.layout_name = l);
END $$;

-- Venue "Function Hall" (Central Area): restored on its fixed id; stops if a real venue already has this name and location.
DO $$
DECLARE v_id uuid;
BEGIN
  -- Must not exist: a copy of this venue that a test account created in the app (e.g. in a
  -- create case). Removed only when no booking or event uses it.
  DELETE FROM public.venues v WHERE v.name = 'Function Hall' AND v.location = 'Central Area' AND v.id <> '00000000-0000-4000-8088-000000000105'
    AND (v.id::text LIKE '00000000-0000-0000-00%' OR v.id::text LIKE '00000000-0000-4000-80%' OR v.updated_by IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')))
    AND NOT EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
    AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id);
  -- Clash guard: a real (non-test) venue already uses this name and location.
  IF EXISTS (SELECT 1 FROM public.venues WHERE name = 'Function Hall' AND location = 'Central Area'
             AND id <> '00000000-0000-4000-8088-000000000105') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Function Hall" at Central Area exists. Nothing was changed.';
  END IF;
  SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8088-000000000105';
  IF v_id IS NULL THEN
    INSERT INTO public.venues (id, name, location, area_tags, capacity, operating_hours,
                               setup_time_minutes, turnaround_time_minutes)
    VALUES ('00000000-0000-4000-8088-000000000105', 'Function Hall', 'Central Area', ARRAY['Central Area'], 200,
            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb, 0, 90)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.venues
    SET name = 'Function Hall', location = 'Central Area', area_tags = ARRAY['Central Area'],
        capacity = 200, operating_hours = '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb,
        setup_time_minutes = 0, turnaround_time_minutes = 90
    WHERE id = v_id
      AND (name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
          IS DISTINCT FROM ('Function Hall', 'Central Area', ARRAY['Central Area'], 200,
                            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb, 0, 90);
  END IF;

  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities
  WHERE venue_id = v_id AND facility_name <> ALL (ARRAY[]::text[]);
  INSERT INTO public.venue_facilities (venue_id, facility_name)
  SELECT v_id, f FROM unnest(ARRAY[]::text[]) AS f
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_facilities x WHERE x.venue_id = v_id AND x.facility_name = f);

  DELETE FROM public.venue_layouts
  WHERE venue_id = v_id AND layout_name <> ALL (ARRAY['Theatre']::text[]);
  INSERT INTO public.venue_layouts (venue_id, layout_name)
  SELECT v_id, l FROM unnest(ARRAY['Theatre']::text[]) AS l
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts x WHERE x.venue_id = v_id AND x.layout_name = l);
END $$;

-- Event "Bigbang Event" (fixed id). A status that can't move back to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8088-000000000201';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8088-000000000201';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8088-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Bigbang Event', 'UAT event for SPM-88 conflict flags.',
          100, '2026-12-14 10:00:00+08', '2026-12-14 12:00:00+08', 'planning',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

-- Must not exist: other active bookings of this test event (cancelled, not deleted).
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '00000000-0000-4000-8088-000000000201' AND status IN ('pending', 'approved', 'on_hold')
  AND id <> ALL (ARRAY['00000000-0000-4000-8088-000000000301']::uuid[]);

-- Event "BTS Event" (fixed id). A status that can't move back to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8088-000000000202';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8088-000000000202';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8088-000000000202', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'BTS Event', 'UAT event for SPM-88 conflict flags.',
          100, '2026-12-14 13:00:00+08', '2026-12-14 15:00:00+08', 'planning',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

-- Must not exist: other active bookings of this test event (cancelled, not deleted).
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '00000000-0000-4000-8088-000000000202' AND status IN ('pending', 'approved', 'on_hold')
  AND id <> ALL (ARRAY['00000000-0000-4000-8088-000000000302']::uuid[]);

-- Event "Coldplay Event" (fixed id). A status that can't move back to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8088-000000000204';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8088-000000000204';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8088-000000000204', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Coldplay Event', 'UAT event for SPM-88 conflict flags.',
          100, '2026-12-14 10:00:00+08', '2026-12-14 12:00:00+08', 'planning',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

-- Must not exist: other active bookings of this test event (cancelled, not deleted).
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '00000000-0000-4000-8088-000000000204' AND status IN ('pending', 'approved', 'on_hold')
  AND id <> ALL (ARRAY['00000000-0000-4000-8088-000000000304']::uuid[]);

-- Event "Twice Event" (fixed id). A status that can't move back to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8088-000000000205';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8088-000000000205';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8088-000000000205', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Twice Event', 'UAT event for SPM-88 conflict flags.',
          100, '2026-12-14 13:00:00+08', '2026-12-14 15:00:00+08', 'planning',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

-- Must not exist: other active bookings of this test event (cancelled, not deleted).
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '00000000-0000-4000-8088-000000000205' AND status IN ('pending', 'approved', 'on_hold')
  AND id <> ALL (ARRAY['00000000-0000-4000-8088-000000000305']::uuid[]);

-- Event "Seventeen Event" (fixed id). A status that can't move back to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8088-000000000206';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8088-000000000206';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8088-000000000206', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Seventeen Event', 'UAT event for SPM-88 conflict flags.',
          100, '2026-12-15 10:00:00+08', '2026-12-15 12:00:00+08', 'planning',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

-- Must not exist: other active bookings of this test event (cancelled, not deleted).
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '00000000-0000-4000-8088-000000000206' AND status IN ('pending', 'approved', 'on_hold')
  AND id <> ALL (ARRAY['00000000-0000-4000-8088-000000000306']::uuid[]);

-- Event "NewJeans Event" (fixed id). A status that can't move back to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8088-000000000207';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8088-000000000207';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8088-000000000207', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'NewJeans Event', 'UAT event for SPM-88 conflict flags.',
          100, '2026-12-15 13:00:00+08', '2026-12-15 15:00:00+08', 'planning',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

-- Must not exist: other active bookings of this test event (cancelled, not deleted).
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '00000000-0000-4000-8088-000000000207' AND status IN ('pending', 'approved', 'on_hold')
  AND id <> ALL (ARRAY['00000000-0000-4000-8088-000000000307']::uuid[]);

-- Event "Aespa Event" (fixed id). A status that can't move back to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8088-000000000208';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8088-000000000208';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8088-000000000208', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Aespa Event', 'UAT event for SPM-88 conflict flags.',
          100, '2026-12-16 10:00:00+08', '2026-12-16 12:00:00+08', 'planning',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

-- Must not exist: other active bookings of this test event (cancelled, not deleted).
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '00000000-0000-4000-8088-000000000208' AND status IN ('pending', 'approved', 'on_hold')
  AND id <> ALL (ARRAY['00000000-0000-4000-8088-000000000308']::uuid[]);

-- Event "IVE Event" (fixed id). A status that can't move back to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8088-000000000209';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8088-000000000209';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8088-000000000209', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'IVE Event', 'UAT event for SPM-88 conflict flags.',
          100, '2026-12-16 13:00:00+08', '2026-12-16 15:00:00+08', 'planning',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

-- Must not exist: other active bookings of this test event (cancelled, not deleted).
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '00000000-0000-4000-8088-000000000209' AND status IN ('pending', 'approved', 'on_hold')
  AND id <> ALL (ARRAY['00000000-0000-4000-8088-000000000309']::uuid[]);

-- Event "EXO Event" (fixed id). A status that can't move back to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8088-000000000210';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8088-000000000210';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8088-000000000210', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'EXO Event', 'UAT event for SPM-88 conflict flags.',
          100, '2026-12-17 10:00:00+08', '2026-12-17 12:00:00+08', 'planning',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

-- Must not exist: other active bookings of this test event (cancelled, not deleted).
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '00000000-0000-4000-8088-000000000210' AND status IN ('pending', 'approved', 'on_hold')
  AND id <> ALL (ARRAY['00000000-0000-4000-8088-000000000310']::uuid[]);

-- Event "ITZY Event" (fixed id). A status that can't move back to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8088-000000000211';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8088-000000000211';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8088-000000000211', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'ITZY Event', 'UAT event for SPM-88 conflict flags.',
          100, '2026-12-17 13:00:00+08', '2026-12-17 15:00:00+08', 'planning',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

-- Must not exist: other active bookings of this test event (cancelled, not deleted).
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '00000000-0000-4000-8088-000000000211' AND status IN ('pending', 'approved', 'on_hold')
  AND id <> ALL (ARRAY['00000000-0000-4000-8088-000000000311']::uuid[]);

-- Booking: "Bigbang Event" at Auditorium, approved, 2026-12-14 10:00 to 12:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := '00000000-0000-4000-8088-000000000101'::uuid;
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-main-venue-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
  WHERE event_id = '00000000-0000-4000-8088-000000000201' AND id <> '00000000-0000-4000-8088-000000000301'
    AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the booking (it would reject the booking).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-14 10:00:00+08', '2026-12-14 12:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id <> '00000000-0000-4000-8088-000000000301' AND b2.event_id <> '00000000-0000-4000-8088-000000000201'
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-14 10:00:00+08', '2026-12-14 12:00:00+08')
  LIMIT 1;
  IF 'approved' IN ('pending', 'approved', 'on_hold') AND v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") already occupies Auditorium at this time; cancel it before running this file', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at,
                                          status, decided_at, decided_by, expires_at, held_by,
                                          needs_review, needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-4000-8088-000000000301', '00000000-0000-4000-8088-000000000201', v_venue, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-10-01 10:00:00+08',
          '2026-12-14 10:00:00+08', '2026-12-14 12:00:00+08', 'approved', '2026-10-02 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'),
          NULL, NULL, false, NULL, NULL, true)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, decided_by = EXCLUDED.decided_by,
      expires_at = NULL, held_by = NULL, needs_review = false, needs_review_reason = NULL,
      replaces_booking_id = NULL, is_main_venue = true
  WHERE (b.event_id, b.venue_id, b.requested_by, b.requested_at, b.starts_at, b.ends_at, b.status,
         b.decided_at, b.decided_by, b.expires_at, b.held_by, b.needs_review, b.needs_review_reason,
         b.replaces_booking_id, b.is_main_venue)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.requested_by, EXCLUDED.requested_at,
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.decided_at,
                          EXCLUDED.decided_by, NULL::timestamptz, NULL::uuid, false, NULL::text,
                          NULL::uuid, true);

  -- Multi-venue fields: back to their defaults for this test booking.
  UPDATE public.venue_bookings
  SET label = 'Main Programme', expected_headcount = NULL, layout_notes = NULL,
      accessibility_notes = NULL, required_facilities = '{}', advisory_notes = NULL,
      cancellation_reason = NULL, cancelled_by = NULL, cancelled_at = NULL
  WHERE id = '00000000-0000-4000-8088-000000000301'
    AND (label, expected_headcount, layout_notes, accessibility_notes, required_facilities,
         advisory_notes, cancellation_reason, cancelled_by, cancelled_at)
        IS DISTINCT FROM ('Main Programme', NULL::integer, NULL::text, NULL::text, '{}'::text[],
                          NULL::text, NULL::text, NULL::uuid, NULL::timestamptz);
END $$;

-- Booking: "BTS Event" at Auditorium, pending, 2026-12-14 13:00 to 15:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := '00000000-0000-4000-8088-000000000101'::uuid;
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-main-venue-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
  WHERE event_id = '00000000-0000-4000-8088-000000000202' AND id <> '00000000-0000-4000-8088-000000000302'
    AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the booking (it would reject the booking).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-14 13:00:00+08', '2026-12-14 15:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id <> '00000000-0000-4000-8088-000000000302' AND b2.event_id <> '00000000-0000-4000-8088-000000000202'
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-14 13:00:00+08', '2026-12-14 15:00:00+08')
  LIMIT 1;
  IF 'pending' IN ('pending', 'approved', 'on_hold') AND v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") already occupies Auditorium at this time; cancel it before running this file', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at,
                                          status, decided_at, decided_by, expires_at, held_by,
                                          needs_review, needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-4000-8088-000000000302', '00000000-0000-4000-8088-000000000202', v_venue, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-10-01 10:05:00+08',
          '2026-12-14 13:00:00+08', '2026-12-14 15:00:00+08', 'pending', NULL, NULL,
          NULL, NULL, false, NULL, NULL, true)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, decided_by = EXCLUDED.decided_by,
      expires_at = NULL, held_by = NULL, needs_review = false, needs_review_reason = NULL,
      replaces_booking_id = NULL, is_main_venue = true
  WHERE (b.event_id, b.venue_id, b.requested_by, b.requested_at, b.starts_at, b.ends_at, b.status,
         b.decided_at, b.decided_by, b.expires_at, b.held_by, b.needs_review, b.needs_review_reason,
         b.replaces_booking_id, b.is_main_venue)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.requested_by, EXCLUDED.requested_at,
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.decided_at,
                          EXCLUDED.decided_by, NULL::timestamptz, NULL::uuid, false, NULL::text,
                          NULL::uuid, true);

  -- Multi-venue fields: back to their defaults for this test booking.
  UPDATE public.venue_bookings
  SET label = 'Main Programme', expected_headcount = NULL, layout_notes = NULL,
      accessibility_notes = NULL, required_facilities = '{}', advisory_notes = NULL,
      cancellation_reason = NULL, cancelled_by = NULL, cancelled_at = NULL
  WHERE id = '00000000-0000-4000-8088-000000000302'
    AND (label, expected_headcount, layout_notes, accessibility_notes, required_facilities,
         advisory_notes, cancellation_reason, cancelled_by, cancelled_at)
        IS DISTINCT FROM ('Main Programme', NULL::integer, NULL::text, NULL::text, '{}'::text[],
                          NULL::text, NULL::text, NULL::uuid, NULL::timestamptz);
END $$;

-- Booking: "Coldplay Event" at Lecture Theatre 1, approved, 2026-12-14 10:00 to 12:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := '00000000-0000-4000-8088-000000000102'::uuid;
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-main-venue-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
  WHERE event_id = '00000000-0000-4000-8088-000000000204' AND id <> '00000000-0000-4000-8088-000000000304'
    AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the booking (it would reject the booking).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-14 10:00:00+08', '2026-12-14 12:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id <> '00000000-0000-4000-8088-000000000304' AND b2.event_id <> '00000000-0000-4000-8088-000000000204'
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-14 10:00:00+08', '2026-12-14 12:00:00+08')
  LIMIT 1;
  IF 'approved' IN ('pending', 'approved', 'on_hold') AND v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") already occupies Lecture Theatre 1 at this time; cancel it before running this file', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at,
                                          status, decided_at, decided_by, expires_at, held_by,
                                          needs_review, needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-4000-8088-000000000304', '00000000-0000-4000-8088-000000000204', v_venue, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-10-01 10:00:00+08',
          '2026-12-14 10:00:00+08', '2026-12-14 12:00:00+08', 'approved', '2026-10-02 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'),
          NULL, NULL, false, NULL, NULL, true)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, decided_by = EXCLUDED.decided_by,
      expires_at = NULL, held_by = NULL, needs_review = false, needs_review_reason = NULL,
      replaces_booking_id = NULL, is_main_venue = true
  WHERE (b.event_id, b.venue_id, b.requested_by, b.requested_at, b.starts_at, b.ends_at, b.status,
         b.decided_at, b.decided_by, b.expires_at, b.held_by, b.needs_review, b.needs_review_reason,
         b.replaces_booking_id, b.is_main_venue)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.requested_by, EXCLUDED.requested_at,
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.decided_at,
                          EXCLUDED.decided_by, NULL::timestamptz, NULL::uuid, false, NULL::text,
                          NULL::uuid, true);

  -- Multi-venue fields: back to their defaults for this test booking.
  UPDATE public.venue_bookings
  SET label = 'Main Programme', expected_headcount = NULL, layout_notes = NULL,
      accessibility_notes = NULL, required_facilities = '{}', advisory_notes = NULL,
      cancellation_reason = NULL, cancelled_by = NULL, cancelled_at = NULL
  WHERE id = '00000000-0000-4000-8088-000000000304'
    AND (label, expected_headcount, layout_notes, accessibility_notes, required_facilities,
         advisory_notes, cancellation_reason, cancelled_by, cancelled_at)
        IS DISTINCT FROM ('Main Programme', NULL::integer, NULL::text, NULL::text, '{}'::text[],
                          NULL::text, NULL::text, NULL::uuid, NULL::timestamptz);
END $$;

-- Booking: "Twice Event" at Lecture Theatre 1, rejected, 2026-12-14 13:00 to 15:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := '00000000-0000-4000-8088-000000000102'::uuid;
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-main-venue-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
  WHERE event_id = '00000000-0000-4000-8088-000000000205' AND id <> '00000000-0000-4000-8088-000000000305'
    AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the booking (it would reject the booking).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-14 13:00:00+08', '2026-12-14 15:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id <> '00000000-0000-4000-8088-000000000305' AND b2.event_id <> '00000000-0000-4000-8088-000000000205'
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-14 13:00:00+08', '2026-12-14 15:00:00+08')
  LIMIT 1;
  IF 'rejected' IN ('pending', 'approved', 'on_hold') AND v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") already occupies Lecture Theatre 1 at this time; cancel it before running this file', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at,
                                          status, decided_at, decided_by, expires_at, held_by,
                                          needs_review, needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-4000-8088-000000000305', '00000000-0000-4000-8088-000000000205', v_venue, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-10-01 10:05:00+08',
          '2026-12-14 13:00:00+08', '2026-12-14 15:00:00+08', 'rejected', '2026-10-02 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'),
          NULL, NULL, false, NULL, NULL, true)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, decided_by = EXCLUDED.decided_by,
      expires_at = NULL, held_by = NULL, needs_review = false, needs_review_reason = NULL,
      replaces_booking_id = NULL, is_main_venue = true
  WHERE (b.event_id, b.venue_id, b.requested_by, b.requested_at, b.starts_at, b.ends_at, b.status,
         b.decided_at, b.decided_by, b.expires_at, b.held_by, b.needs_review, b.needs_review_reason,
         b.replaces_booking_id, b.is_main_venue)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.requested_by, EXCLUDED.requested_at,
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.decided_at,
                          EXCLUDED.decided_by, NULL::timestamptz, NULL::uuid, false, NULL::text,
                          NULL::uuid, true);

  -- Multi-venue fields: back to their defaults for this test booking.
  UPDATE public.venue_bookings
  SET label = 'Main Programme', expected_headcount = NULL, layout_notes = NULL,
      accessibility_notes = NULL, required_facilities = '{}', advisory_notes = NULL,
      cancellation_reason = NULL, cancelled_by = NULL, cancelled_at = NULL
  WHERE id = '00000000-0000-4000-8088-000000000305'
    AND (label, expected_headcount, layout_notes, accessibility_notes, required_facilities,
         advisory_notes, cancellation_reason, cancelled_by, cancelled_at)
        IS DISTINCT FROM ('Main Programme', NULL::integer, NULL::text, NULL::text, '{}'::text[],
                          NULL::text, NULL::text, NULL::uuid, NULL::timestamptz);
END $$;

-- Booking: "Seventeen Event" at Seminar Room 1, approved, 2026-12-15 10:00 to 12:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := '00000000-0000-4000-8088-000000000103'::uuid;
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-main-venue-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
  WHERE event_id = '00000000-0000-4000-8088-000000000206' AND id <> '00000000-0000-4000-8088-000000000306'
    AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the booking (it would reject the booking).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-15 10:00:00+08', '2026-12-15 12:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id <> '00000000-0000-4000-8088-000000000306' AND b2.event_id <> '00000000-0000-4000-8088-000000000206'
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-15 10:00:00+08', '2026-12-15 12:00:00+08')
  LIMIT 1;
  IF 'approved' IN ('pending', 'approved', 'on_hold') AND v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") already occupies Seminar Room 1 at this time; cancel it before running this file', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at,
                                          status, decided_at, decided_by, expires_at, held_by,
                                          needs_review, needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-4000-8088-000000000306', '00000000-0000-4000-8088-000000000206', v_venue, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-10-01 10:00:00+08',
          '2026-12-15 10:00:00+08', '2026-12-15 12:00:00+08', 'approved', '2026-10-02 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'),
          NULL, NULL, false, NULL, NULL, true)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, decided_by = EXCLUDED.decided_by,
      expires_at = NULL, held_by = NULL, needs_review = false, needs_review_reason = NULL,
      replaces_booking_id = NULL, is_main_venue = true
  WHERE (b.event_id, b.venue_id, b.requested_by, b.requested_at, b.starts_at, b.ends_at, b.status,
         b.decided_at, b.decided_by, b.expires_at, b.held_by, b.needs_review, b.needs_review_reason,
         b.replaces_booking_id, b.is_main_venue)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.requested_by, EXCLUDED.requested_at,
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.decided_at,
                          EXCLUDED.decided_by, NULL::timestamptz, NULL::uuid, false, NULL::text,
                          NULL::uuid, true);

  -- Multi-venue fields: back to their defaults for this test booking.
  UPDATE public.venue_bookings
  SET label = 'Main Programme', expected_headcount = NULL, layout_notes = NULL,
      accessibility_notes = NULL, required_facilities = '{}', advisory_notes = NULL,
      cancellation_reason = NULL, cancelled_by = NULL, cancelled_at = NULL
  WHERE id = '00000000-0000-4000-8088-000000000306'
    AND (label, expected_headcount, layout_notes, accessibility_notes, required_facilities,
         advisory_notes, cancellation_reason, cancelled_by, cancelled_at)
        IS DISTINCT FROM ('Main Programme', NULL::integer, NULL::text, NULL::text, '{}'::text[],
                          NULL::text, NULL::text, NULL::uuid, NULL::timestamptz);
END $$;

-- Booking: "NewJeans Event" at Seminar Room 1, pending, 2026-12-15 13:00 to 15:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := '00000000-0000-4000-8088-000000000103'::uuid;
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-main-venue-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
  WHERE event_id = '00000000-0000-4000-8088-000000000207' AND id <> '00000000-0000-4000-8088-000000000307'
    AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the booking (it would reject the booking).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-15 13:00:00+08', '2026-12-15 15:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id <> '00000000-0000-4000-8088-000000000307' AND b2.event_id <> '00000000-0000-4000-8088-000000000207'
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-15 13:00:00+08', '2026-12-15 15:00:00+08')
  LIMIT 1;
  IF 'pending' IN ('pending', 'approved', 'on_hold') AND v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") already occupies Seminar Room 1 at this time; cancel it before running this file', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at,
                                          status, decided_at, decided_by, expires_at, held_by,
                                          needs_review, needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-4000-8088-000000000307', '00000000-0000-4000-8088-000000000207', v_venue, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-10-01 10:05:00+08',
          '2026-12-15 13:00:00+08', '2026-12-15 15:00:00+08', 'pending', NULL, NULL,
          NULL, NULL, false, NULL, NULL, true)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, decided_by = EXCLUDED.decided_by,
      expires_at = NULL, held_by = NULL, needs_review = false, needs_review_reason = NULL,
      replaces_booking_id = NULL, is_main_venue = true
  WHERE (b.event_id, b.venue_id, b.requested_by, b.requested_at, b.starts_at, b.ends_at, b.status,
         b.decided_at, b.decided_by, b.expires_at, b.held_by, b.needs_review, b.needs_review_reason,
         b.replaces_booking_id, b.is_main_venue)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.requested_by, EXCLUDED.requested_at,
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.decided_at,
                          EXCLUDED.decided_by, NULL::timestamptz, NULL::uuid, false, NULL::text,
                          NULL::uuid, true);

  -- Multi-venue fields: back to their defaults for this test booking.
  UPDATE public.venue_bookings
  SET label = 'Main Programme', expected_headcount = NULL, layout_notes = NULL,
      accessibility_notes = NULL, required_facilities = '{}', advisory_notes = NULL,
      cancellation_reason = NULL, cancelled_by = NULL, cancelled_at = NULL
  WHERE id = '00000000-0000-4000-8088-000000000307'
    AND (label, expected_headcount, layout_notes, accessibility_notes, required_facilities,
         advisory_notes, cancellation_reason, cancelled_by, cancelled_at)
        IS DISTINCT FROM ('Main Programme', NULL::integer, NULL::text, NULL::text, '{}'::text[],
                          NULL::text, NULL::text, NULL::uuid, NULL::timestamptz);
END $$;

-- Booking: "Aespa Event" at Seminar Room 2, approved, 2026-12-16 10:00 to 12:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := '00000000-0000-4000-8088-000000000104'::uuid;
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-main-venue-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
  WHERE event_id = '00000000-0000-4000-8088-000000000208' AND id <> '00000000-0000-4000-8088-000000000308'
    AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the booking (it would reject the booking).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-16 10:00:00+08', '2026-12-16 12:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id <> '00000000-0000-4000-8088-000000000308' AND b2.event_id <> '00000000-0000-4000-8088-000000000208'
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-16 10:00:00+08', '2026-12-16 12:00:00+08')
  LIMIT 1;
  IF 'approved' IN ('pending', 'approved', 'on_hold') AND v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") already occupies Seminar Room 2 at this time; cancel it before running this file', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at,
                                          status, decided_at, decided_by, expires_at, held_by,
                                          needs_review, needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-4000-8088-000000000308', '00000000-0000-4000-8088-000000000208', v_venue, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-10-01 10:00:00+08',
          '2026-12-16 10:00:00+08', '2026-12-16 12:00:00+08', 'approved', '2026-10-02 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'),
          NULL, NULL, false, NULL, NULL, true)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, decided_by = EXCLUDED.decided_by,
      expires_at = NULL, held_by = NULL, needs_review = false, needs_review_reason = NULL,
      replaces_booking_id = NULL, is_main_venue = true
  WHERE (b.event_id, b.venue_id, b.requested_by, b.requested_at, b.starts_at, b.ends_at, b.status,
         b.decided_at, b.decided_by, b.expires_at, b.held_by, b.needs_review, b.needs_review_reason,
         b.replaces_booking_id, b.is_main_venue)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.requested_by, EXCLUDED.requested_at,
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.decided_at,
                          EXCLUDED.decided_by, NULL::timestamptz, NULL::uuid, false, NULL::text,
                          NULL::uuid, true);

  -- Multi-venue fields: back to their defaults for this test booking.
  UPDATE public.venue_bookings
  SET label = 'Main Programme', expected_headcount = NULL, layout_notes = NULL,
      accessibility_notes = NULL, required_facilities = '{}', advisory_notes = NULL,
      cancellation_reason = NULL, cancelled_by = NULL, cancelled_at = NULL
  WHERE id = '00000000-0000-4000-8088-000000000308'
    AND (label, expected_headcount, layout_notes, accessibility_notes, required_facilities,
         advisory_notes, cancellation_reason, cancelled_by, cancelled_at)
        IS DISTINCT FROM ('Main Programme', NULL::integer, NULL::text, NULL::text, '{}'::text[],
                          NULL::text, NULL::text, NULL::uuid, NULL::timestamptz);
END $$;

-- Booking: "IVE Event" at Seminar Room 2, pending, 2026-12-16 13:00 to 15:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := '00000000-0000-4000-8088-000000000104'::uuid;
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-main-venue-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
  WHERE event_id = '00000000-0000-4000-8088-000000000209' AND id <> '00000000-0000-4000-8088-000000000309'
    AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the booking (it would reject the booking).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-16 13:00:00+08', '2026-12-16 15:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id <> '00000000-0000-4000-8088-000000000309' AND b2.event_id <> '00000000-0000-4000-8088-000000000209'
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-16 13:00:00+08', '2026-12-16 15:00:00+08')
  LIMIT 1;
  IF 'pending' IN ('pending', 'approved', 'on_hold') AND v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") already occupies Seminar Room 2 at this time; cancel it before running this file', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at,
                                          status, decided_at, decided_by, expires_at, held_by,
                                          needs_review, needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-4000-8088-000000000309', '00000000-0000-4000-8088-000000000209', v_venue, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-10-01 10:05:00+08',
          '2026-12-16 13:00:00+08', '2026-12-16 15:00:00+08', 'pending', NULL, NULL,
          NULL, NULL, false, NULL, NULL, true)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, decided_by = EXCLUDED.decided_by,
      expires_at = NULL, held_by = NULL, needs_review = false, needs_review_reason = NULL,
      replaces_booking_id = NULL, is_main_venue = true
  WHERE (b.event_id, b.venue_id, b.requested_by, b.requested_at, b.starts_at, b.ends_at, b.status,
         b.decided_at, b.decided_by, b.expires_at, b.held_by, b.needs_review, b.needs_review_reason,
         b.replaces_booking_id, b.is_main_venue)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.requested_by, EXCLUDED.requested_at,
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.decided_at,
                          EXCLUDED.decided_by, NULL::timestamptz, NULL::uuid, false, NULL::text,
                          NULL::uuid, true);

  -- Multi-venue fields: back to their defaults for this test booking.
  UPDATE public.venue_bookings
  SET label = 'Main Programme', expected_headcount = NULL, layout_notes = NULL,
      accessibility_notes = NULL, required_facilities = '{}', advisory_notes = NULL,
      cancellation_reason = NULL, cancelled_by = NULL, cancelled_at = NULL
  WHERE id = '00000000-0000-4000-8088-000000000309'
    AND (label, expected_headcount, layout_notes, accessibility_notes, required_facilities,
         advisory_notes, cancellation_reason, cancelled_by, cancelled_at)
        IS DISTINCT FROM ('Main Programme', NULL::integer, NULL::text, NULL::text, '{}'::text[],
                          NULL::text, NULL::text, NULL::uuid, NULL::timestamptz);
END $$;

-- Booking: "EXO Event" at Function Hall, approved, 2026-12-17 10:00 to 12:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := '00000000-0000-4000-8088-000000000105'::uuid;
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-main-venue-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
  WHERE event_id = '00000000-0000-4000-8088-000000000210' AND id <> '00000000-0000-4000-8088-000000000310'
    AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the booking (it would reject the booking).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-17 10:00:00+08', '2026-12-17 12:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id <> '00000000-0000-4000-8088-000000000310' AND b2.event_id <> '00000000-0000-4000-8088-000000000210'
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-17 10:00:00+08', '2026-12-17 12:00:00+08')
  LIMIT 1;
  IF 'approved' IN ('pending', 'approved', 'on_hold') AND v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") already occupies Function Hall at this time; cancel it before running this file', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at,
                                          status, decided_at, decided_by, expires_at, held_by,
                                          needs_review, needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-4000-8088-000000000310', '00000000-0000-4000-8088-000000000210', v_venue, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-10-01 10:00:00+08',
          '2026-12-17 10:00:00+08', '2026-12-17 12:00:00+08', 'approved', '2026-10-02 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'),
          NULL, NULL, false, NULL, NULL, true)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, decided_by = EXCLUDED.decided_by,
      expires_at = NULL, held_by = NULL, needs_review = false, needs_review_reason = NULL,
      replaces_booking_id = NULL, is_main_venue = true
  WHERE (b.event_id, b.venue_id, b.requested_by, b.requested_at, b.starts_at, b.ends_at, b.status,
         b.decided_at, b.decided_by, b.expires_at, b.held_by, b.needs_review, b.needs_review_reason,
         b.replaces_booking_id, b.is_main_venue)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.requested_by, EXCLUDED.requested_at,
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.decided_at,
                          EXCLUDED.decided_by, NULL::timestamptz, NULL::uuid, false, NULL::text,
                          NULL::uuid, true);

  -- Multi-venue fields: back to their defaults for this test booking.
  UPDATE public.venue_bookings
  SET label = 'Main Programme', expected_headcount = NULL, layout_notes = NULL,
      accessibility_notes = NULL, required_facilities = '{}', advisory_notes = NULL,
      cancellation_reason = NULL, cancelled_by = NULL, cancelled_at = NULL
  WHERE id = '00000000-0000-4000-8088-000000000310'
    AND (label, expected_headcount, layout_notes, accessibility_notes, required_facilities,
         advisory_notes, cancellation_reason, cancelled_by, cancelled_at)
        IS DISTINCT FROM ('Main Programme', NULL::integer, NULL::text, NULL::text, '{}'::text[],
                          NULL::text, NULL::text, NULL::uuid, NULL::timestamptz);
END $$;

-- Booking: "ITZY Event" at Function Hall, pending, 2026-12-17 13:00 to 15:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := '00000000-0000-4000-8088-000000000105'::uuid;
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-main-venue-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
  WHERE event_id = '00000000-0000-4000-8088-000000000211' AND id <> '00000000-0000-4000-8088-000000000311'
    AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the booking (it would reject the booking).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-17 13:00:00+08', '2026-12-17 15:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id <> '00000000-0000-4000-8088-000000000311' AND b2.event_id <> '00000000-0000-4000-8088-000000000211'
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-17 13:00:00+08', '2026-12-17 15:00:00+08')
  LIMIT 1;
  IF 'pending' IN ('pending', 'approved', 'on_hold') AND v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") already occupies Function Hall at this time; cancel it before running this file', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at,
                                          status, decided_at, decided_by, expires_at, held_by,
                                          needs_review, needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-4000-8088-000000000311', '00000000-0000-4000-8088-000000000211', v_venue, (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), '2026-10-01 10:05:00+08',
          '2026-12-17 13:00:00+08', '2026-12-17 15:00:00+08', 'pending', NULL, NULL,
          NULL, NULL, false, NULL, NULL, true)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, decided_by = EXCLUDED.decided_by,
      expires_at = NULL, held_by = NULL, needs_review = false, needs_review_reason = NULL,
      replaces_booking_id = NULL, is_main_venue = true
  WHERE (b.event_id, b.venue_id, b.requested_by, b.requested_at, b.starts_at, b.ends_at, b.status,
         b.decided_at, b.decided_by, b.expires_at, b.held_by, b.needs_review, b.needs_review_reason,
         b.replaces_booking_id, b.is_main_venue)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.requested_by, EXCLUDED.requested_at,
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.decided_at,
                          EXCLUDED.decided_by, NULL::timestamptz, NULL::uuid, false, NULL::text,
                          NULL::uuid, true);

  -- Multi-venue fields: back to their defaults for this test booking.
  UPDATE public.venue_bookings
  SET label = 'Main Programme', expected_headcount = NULL, layout_notes = NULL,
      accessibility_notes = NULL, required_facilities = '{}', advisory_notes = NULL,
      cancellation_reason = NULL, cancelled_by = NULL, cancelled_at = NULL
  WHERE id = '00000000-0000-4000-8088-000000000311'
    AND (label, expected_headcount, layout_notes, accessibility_notes, required_facilities,
         advisory_notes, cancellation_reason, cancelled_by, cancelled_at)
        IS DISTINCT FROM ('Main Programme', NULL::integer, NULL::text, NULL::text, '{}'::text[],
                          NULL::text, NULL::text, NULL::uuid, NULL::timestamptz);
END $$;

-- Must not exist: conflict flags on Bigbang Event, BTS Event, Coldplay Event, Twice Event, Seventeen Event, NewJeans Event, Aespa Event, IVE Event (they start not flagged).
DELETE FROM public.venue_booking_conflicts
WHERE booking_id IN ('00000000-0000-4000-8088-000000000301', '00000000-0000-4000-8088-000000000302', '00000000-0000-4000-8088-000000000304', '00000000-0000-4000-8088-000000000305', '00000000-0000-4000-8088-000000000306', '00000000-0000-4000-8088-000000000307', '00000000-0000-4000-8088-000000000308', '00000000-0000-4000-8088-000000000309') OR conflicting_booking_id IN ('00000000-0000-4000-8088-000000000301', '00000000-0000-4000-8088-000000000302', '00000000-0000-4000-8088-000000000304', '00000000-0000-4000-8088-000000000305', '00000000-0000-4000-8088-000000000306', '00000000-0000-4000-8088-000000000307', '00000000-0000-4000-8088-000000000308', '00000000-0000-4000-8088-000000000309');

-- EXO Event and ITZY Event: already flagged, exactly one active flag each way.
DO $$
BEGIN
  IF NOT (
    (SELECT count(*) FROM public.venue_booking_conflicts
     WHERE booking_id IN ('00000000-0000-4000-8088-000000000310', '00000000-0000-4000-8088-000000000311') OR conflicting_booking_id IN ('00000000-0000-4000-8088-000000000310', '00000000-0000-4000-8088-000000000311')) = 2
    AND EXISTS (SELECT 1 FROM public.venue_booking_conflicts
                WHERE booking_id = '00000000-0000-4000-8088-000000000310' AND conflicting_booking_id = '00000000-0000-4000-8088-000000000311' AND resolved_at IS NULL AND NOT is_responsible)
    AND EXISTS (SELECT 1 FROM public.venue_booking_conflicts
                WHERE booking_id = '00000000-0000-4000-8088-000000000311' AND conflicting_booking_id = '00000000-0000-4000-8088-000000000310' AND resolved_at IS NULL AND is_responsible)
  ) THEN
    DELETE FROM public.venue_booking_conflicts
    WHERE booking_id IN ('00000000-0000-4000-8088-000000000310', '00000000-0000-4000-8088-000000000311') OR conflicting_booking_id IN ('00000000-0000-4000-8088-000000000310', '00000000-0000-4000-8088-000000000311');
    INSERT INTO public.venue_booking_conflicts (booking_id, conflicting_booking_id, cause, is_responsible,
                                                flagged_at, flagged_by)
    VALUES ('00000000-0000-4000-8088-000000000310', '00000000-0000-4000-8088-000000000311', 'Overlaps another booking once setup/turnaround time is applied', false, '2026-10-03 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com')),
           ('00000000-0000-4000-8088-000000000311', '00000000-0000-4000-8088-000000000310', 'Overlaps another booking once setup/turnaround time is applied', true,  '2026-10-03 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'));
  END IF;
END $$;

-- Workflow records (valid business state): what the event's status implies, as if it went through the app.
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

-- "Bigbang Event" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8088-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000201' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000201';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8088-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8088-000000000201')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8088-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8088-000000000201', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

-- "BTS Event" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000202') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000202' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000202';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8088-000000000202', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000202') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000202' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000202';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8088-000000000202', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8088-000000000202')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8088-000000000202';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8088-000000000202', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

-- "Coldplay Event" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000204') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000204' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000204';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8088-000000000204', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000204') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000204' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000204';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8088-000000000204', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8088-000000000204')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8088-000000000204';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8088-000000000204', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

-- "Twice Event" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000205') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000205' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000205';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8088-000000000205', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000205') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000205' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000205';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8088-000000000205', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8088-000000000205')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8088-000000000205';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8088-000000000205', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

-- "Seventeen Event" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000206') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000206' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000206';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8088-000000000206', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000206') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000206' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000206';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8088-000000000206', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8088-000000000206')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8088-000000000206';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8088-000000000206', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

-- "NewJeans Event" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000207') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000207' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000207';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8088-000000000207', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000207') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000207' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000207';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8088-000000000207', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8088-000000000207')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8088-000000000207';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8088-000000000207', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

-- "Aespa Event" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000208') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000208' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000208';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8088-000000000208', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000208') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000208' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000208';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8088-000000000208', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8088-000000000208')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8088-000000000208';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8088-000000000208', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

-- "IVE Event" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000209') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000209' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000209';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8088-000000000209', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000209') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000209' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000209';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8088-000000000209', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8088-000000000209')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8088-000000000209';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8088-000000000209', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

-- "EXO Event" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000210') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000210' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000210';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8088-000000000210', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000210') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000210' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000210';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8088-000000000210', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8088-000000000210')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8088-000000000210';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8088-000000000210', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

-- "ITZY Event" (Planning): status history Draft -> Requested -> Planning, Tom assigned Jonathan and Jonathan approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000211') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000211' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8088-000000000211';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8088-000000000211', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000211') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000211' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8088-000000000211';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8088-000000000211', (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8088-000000000211')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8088-000000000211';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8088-000000000211', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

COMMIT;

SELECT 'spm88_tc009_setup.sql: setup complete' AS result;
