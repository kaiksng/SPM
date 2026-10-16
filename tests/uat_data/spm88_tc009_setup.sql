-- SPM-88 TC-009: Check all venues flags overlaps in every venue without duplicating existing flags
-- Acceptance criterion: AC1, AC4
-- Login: Venue Staff (daryl@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): click "Re-check all venues"
-- Source: derived from Test Steps, Test Data and Expected Result (no prose precondition)
-- Records restored: profile daryl@gmail.com; profile jasmine@gmail.com; profile joyce@gmail.com; profile jonathan@gmail.com; venue "Auditorium" (Central Area, key 00000000-0000-4000-8088-000000000101); venue "Lecture Theatre 1" (Central Area, key 00000000-0000-4000-8088-000000000102); venue "Seminar Room 1" (Central Area, key 00000000-0000-4000-8088-000000000103); venue "Seminar Room 2" (Central Area, key 00000000-0000-4000-8088-000000000104); venue "Function Hall" (Central Area, key 00000000-0000-4000-8088-000000000105); event "Bigbang Event" (id 00000000-0000-4000-8088-000000000201); event "BTS Event" (id 00000000-0000-4000-8088-000000000202); event "Coldplay Event" (id 00000000-0000-4000-8088-000000000204); event "Twice Event" (id 00000000-0000-4000-8088-000000000205); event "Seventeen Event" (id 00000000-0000-4000-8088-000000000206); event "NewJeans Event" (id 00000000-0000-4000-8088-000000000207); event "Aespa Event" (id 00000000-0000-4000-8088-000000000208); event "IVE Event" (id 00000000-0000-4000-8088-000000000209); event "EXO Event" (id 00000000-0000-4000-8088-000000000210); event "ITZY Event" (id 00000000-0000-4000-8088-000000000211); booking Bigbang Event @ Auditorium (id 00000000-0000-4000-8088-000000000301); booking BTS Event @ Auditorium (id 00000000-0000-4000-8088-000000000302); booking Coldplay Event @ Lecture Theatre 1 (id 00000000-0000-4000-8088-000000000304); booking Twice Event @ Lecture Theatre 1 (id 00000000-0000-4000-8088-000000000305); booking Seventeen Event @ Seminar Room 1 (id 00000000-0000-4000-8088-000000000306); booking NewJeans Event @ Seminar Room 1 (id 00000000-0000-4000-8088-000000000307); booking Aespa Event @ Seminar Room 2 (id 00000000-0000-4000-8088-000000000308); booking IVE Event @ Seminar Room 2 (id 00000000-0000-4000-8088-000000000309); booking EXO Event @ Function Hall (id 00000000-0000-4000-8088-000000000310); booking ITZY Event @ Function Hall (id 00000000-0000-4000-8088-000000000311); active flag pair EXO Event / ITZY Event
-- Must-not-exist conditions enforced: conflict flags on Bigbang Event, BTS Event, Coldplay Event, Twice Event, Seventeen Event, NewJeans Event, Aespa Event, IVE Event; other active bookings of these test events (cancelled); active blocks on these test venues during the bookings (removed)
-- Defaults added: Venue location Central Area, capacity 200, Theatre layout, Mon-Sun 08:00-22:00 (agreed in Questions); Events: organiser jasmine@gmail.com, coordinator joyce@gmail.com (ITZY: jonathan@gmail.com), status Planning, 100 pax; Requested times: the approved booking 1 Oct 2026 10:00, the pending one 10:05 (so the pending one is the later booking); Seminar Room 1 bookings on 15 Dec 2026, Seminar Room 2 on 16 Dec 2026 (dates not stated); Auditorium and Lecture Theatre 1 restored with 0/0 buffers (Expected Result 3)
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

-- Venue "Auditorium" (Central Area): found by name + location (unique), else by its fixed id, else inserted.
DO $$
DECLARE v_id uuid := (SELECT id FROM public.venues WHERE name = 'Auditorium' AND location = 'Central Area');
BEGIN
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8088-000000000101';
  END IF;
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

-- Venue "Lecture Theatre 1" (Central Area): found by name + location (unique), else by its fixed id, else inserted.
DO $$
DECLARE v_id uuid := (SELECT id FROM public.venues WHERE name = 'Lecture Theatre 1' AND location = 'Central Area');
BEGIN
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8088-000000000102';
  END IF;
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

-- Venue "Seminar Room 1" (Central Area): found by name + location (unique), else by its fixed id, else inserted.
DO $$
DECLARE v_id uuid := (SELECT id FROM public.venues WHERE name = 'Seminar Room 1' AND location = 'Central Area');
BEGIN
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8088-000000000103';
  END IF;
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

-- Venue "Seminar Room 2" (Central Area): found by name + location (unique), else by its fixed id, else inserted.
DO $$
DECLARE v_id uuid := (SELECT id FROM public.venues WHERE name = 'Seminar Room 2' AND location = 'Central Area');
BEGIN
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8088-000000000104';
  END IF;
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

-- Venue "Function Hall" (Central Area): found by name + location (unique), else by its fixed id, else inserted.
DO $$
DECLARE v_id uuid := (SELECT id FROM public.venues WHERE name = 'Function Hall' AND location = 'Central Area');
BEGIN
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8088-000000000105';
  END IF;
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

-- Booking: "Bigbang Event" at Auditorium, approved, 2026-12-14 10:00 to 12:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := (SELECT id FROM public.venues WHERE name = 'Auditorium' AND location = 'Central Area');
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-active-booking-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings SET status = 'cancelled'
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
END $$;

-- Booking: "BTS Event" at Auditorium, pending, 2026-12-14 13:00 to 15:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := (SELECT id FROM public.venues WHERE name = 'Auditorium' AND location = 'Central Area');
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-active-booking-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings SET status = 'cancelled'
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
END $$;

-- Booking: "Coldplay Event" at Lecture Theatre 1, approved, 2026-12-14 10:00 to 12:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := (SELECT id FROM public.venues WHERE name = 'Lecture Theatre 1' AND location = 'Central Area');
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-active-booking-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings SET status = 'cancelled'
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
END $$;

-- Booking: "Twice Event" at Lecture Theatre 1, rejected, 2026-12-14 13:00 to 15:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := (SELECT id FROM public.venues WHERE name = 'Lecture Theatre 1' AND location = 'Central Area');
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-active-booking-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings SET status = 'cancelled'
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
END $$;

-- Booking: "Seventeen Event" at Seminar Room 1, approved, 2026-12-15 10:00 to 12:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := (SELECT id FROM public.venues WHERE name = 'Seminar Room 1' AND location = 'Central Area');
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-active-booking-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings SET status = 'cancelled'
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
END $$;

-- Booking: "NewJeans Event" at Seminar Room 1, pending, 2026-12-15 13:00 to 15:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := (SELECT id FROM public.venues WHERE name = 'Seminar Room 1' AND location = 'Central Area');
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-active-booking-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings SET status = 'cancelled'
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
END $$;

-- Booking: "Aespa Event" at Seminar Room 2, approved, 2026-12-16 10:00 to 12:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := (SELECT id FROM public.venues WHERE name = 'Seminar Room 2' AND location = 'Central Area');
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-active-booking-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings SET status = 'cancelled'
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
END $$;

-- Booking: "IVE Event" at Seminar Room 2, pending, 2026-12-16 13:00 to 15:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := (SELECT id FROM public.venues WHERE name = 'Seminar Room 2' AND location = 'Central Area');
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-active-booking-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings SET status = 'cancelled'
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
END $$;

-- Booking: "EXO Event" at Function Hall, approved, 2026-12-17 10:00 to 12:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := (SELECT id FROM public.venues WHERE name = 'Function Hall' AND location = 'Central Area');
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-active-booking-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings SET status = 'cancelled'
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
END $$;

-- Booking: "ITZY Event" at Function Hall, pending, 2026-12-17 13:00 to 15:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := (SELECT id FROM public.venues WHERE name = 'Function Hall' AND location = 'Central Area');
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-active-booking-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings SET status = 'cancelled'
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

COMMIT;

SELECT 'spm88_tc009_setup.sql: setup complete' AS result;
