-- SPM-72 TC-002: Include a venue at exactly the expected attendance and exclude one just below
-- Acceptance criterion: AC01
-- Login: Event Coordinator (joyce@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: Logged in as Event Coordinator.
--         Venues Suggest Room B and C exist.
--          - Room B: South, 100 pax, Classroom, Air-conditioning, Mon–Sun 09:00–18:00
--          - Room C: South, 99 pax, Classroom, no facilities, Mon–Sun 09:00–18:00
--         The event is approved and in Planning stage.
--          - Thu 12 Nov 2026, 10:00–14:00
--          - 100 pax
--          - Location: South
--          - Layout: No preference · Facilities: none
-- Records restored: profile joyce@gmail.com; profile jasmine@gmail.com; venue "Suggest Room B" (South, key 00000000-0000-4000-8072-000000000102); venue "Suggest Room C" (South, key 00000000-0000-4000-8072-000000000103); event "Venue Suggestion Test Event" (id 00000000-0000-4000-8072-000000000201)
-- Must-not-exist conditions enforced: none
-- Defaults added: Event title "Venue Suggestion Test Event", organiser jasmine@gmail.com, coordinator joyce@gmail.com (agreed in Questions); Venue setup and turnaround 0 min (so the effective window equals the event time)
-- Safe to re-run: restores this case's records only; all other data is left untouched.
-- Not a migration: run it by hand (Supabase SQL editor on testDB, or psql) right before the test.

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

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

-- Venue "Suggest Room B" (South): found by name + location (unique), else by its fixed id, else inserted.
DO $$
DECLARE v_id uuid := (SELECT id FROM public.venues WHERE name = 'Suggest Room B' AND location = 'South');
BEGIN
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8072-000000000102';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.venues (id, name, location, area_tags, capacity, operating_hours,
                               setup_time_minutes, turnaround_time_minutes)
    VALUES ('00000000-0000-4000-8072-000000000102', 'Suggest Room B', 'South', ARRAY['South'], 100,
            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "09:00", "closesAt": "18:00"}]'::jsonb, 0, 0)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.venues
    SET name = 'Suggest Room B', location = 'South', area_tags = ARRAY['South'],
        capacity = 100, operating_hours = '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "09:00", "closesAt": "18:00"}]'::jsonb,
        setup_time_minutes = 0, turnaround_time_minutes = 0
    WHERE id = v_id
      AND (name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
          IS DISTINCT FROM ('Suggest Room B', 'South', ARRAY['South'], 100,
                            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "09:00", "closesAt": "18:00"}]'::jsonb, 0, 0);
  END IF;

  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities
  WHERE venue_id = v_id AND facility_name <> ALL (ARRAY['Air conditioning']::text[]);
  INSERT INTO public.venue_facilities (venue_id, facility_name)
  SELECT v_id, f FROM unnest(ARRAY['Air conditioning']::text[]) AS f
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_facilities x WHERE x.venue_id = v_id AND x.facility_name = f);

  DELETE FROM public.venue_layouts
  WHERE venue_id = v_id AND layout_name <> ALL (ARRAY['Classroom']::text[]);
  INSERT INTO public.venue_layouts (venue_id, layout_name)
  SELECT v_id, l FROM unnest(ARRAY['Classroom']::text[]) AS l
  WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts x WHERE x.venue_id = v_id AND x.layout_name = l);
END $$;

-- Venue "Suggest Room C" (South): found by name + location (unique), else by its fixed id, else inserted.
DO $$
DECLARE v_id uuid := (SELECT id FROM public.venues WHERE name = 'Suggest Room C' AND location = 'South');
BEGIN
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8072-000000000103';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.venues (id, name, location, area_tags, capacity, operating_hours,
                               setup_time_minutes, turnaround_time_minutes)
    VALUES ('00000000-0000-4000-8072-000000000103', 'Suggest Room C', 'South', ARRAY['South'], 99,
            '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "09:00", "closesAt": "18:00"}]'::jsonb, 0, 0)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.venues
    SET name = 'Suggest Room C', location = 'South', area_tags = ARRAY['South'],
        capacity = 99, operating_hours = '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "09:00", "closesAt": "18:00"}]'::jsonb,
        setup_time_minutes = 0, turnaround_time_minutes = 0
    WHERE id = v_id
      AND (name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
          IS DISTINCT FROM ('Suggest Room C', 'South', ARRAY['South'], 99,
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

-- Event "Venue Suggestion Test Event" (fixed id). A status that can't move back to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8072-000000000201';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8072-000000000201';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8072-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Venue Suggestion Test Event', 'UAT event for SPM-72 venue suggestions.',
          100, '2026-11-12 10:00:00+08', '2026-11-12 14:00:00+08', 'planning',
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

-- Venue requirements for "Venue Suggestion Test Event": location South, layout no preference,
-- facilities none.
INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity,
                                                  layout_notes, accessibility_notes)
VALUES ('00000000-0000-4000-8072-000000000201', 'South', NULL, NULL, NULL)
ON CONFLICT (event_id) DO UPDATE
SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
    layout_notes = EXCLUDED.layout_notes, accessibility_notes = EXCLUDED.accessibility_notes
WHERE (r.preferred_location, r.minimum_capacity, r.layout_notes, r.accessibility_notes)
      IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity,
                        EXCLUDED.layout_notes, EXCLUDED.accessibility_notes);

DELETE FROM public.event_required_facilities
WHERE event_id = '00000000-0000-4000-8072-000000000201' AND facility_name <> ALL (ARRAY[]::text[]);
INSERT INTO public.event_required_facilities (event_id, facility_name)
SELECT '00000000-0000-4000-8072-000000000201', f FROM unnest(ARRAY[]::text[]) AS f
WHERE NOT EXISTS (SELECT 1 FROM public.event_required_facilities x
                  WHERE x.event_id = '00000000-0000-4000-8072-000000000201' AND x.facility_name = f);

COMMIT;

SELECT 'spm72_tc002_setup.sql: setup complete' AS result;
