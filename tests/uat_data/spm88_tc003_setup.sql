-- SPM-88 TC-003: Buffer change that still leaves a gap does not flag bookings
-- Acceptance criterion: AC4
-- Login: Venue Staff (daryl@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): Auditorium turnaround 30 min
-- Source: derived from Test Steps, Test Data and Expected Result (no prose precondition)
-- Records restored: profile daryl@gmail.com; profile jasmine@gmail.com; profile joyce@gmail.com; venue "Auditorium" (Central Area, key 00000000-0000-4000-8088-000000000101); event "Bigbang Event" (id 00000000-0000-4000-8088-000000000201); event "BTS Event" (id 00000000-0000-4000-8088-000000000202); booking Bigbang Event @ Auditorium (id 00000000-0000-4000-8088-000000000301); booking BTS Event @ Auditorium (id 00000000-0000-4000-8088-000000000302)
-- Must-not-exist conditions enforced: conflict flags on Bigbang Event, BTS Event; other active bookings of these test events (cancelled); active blocks on these test venues during the bookings (removed)
-- Defaults added: Venue location Central Area, capacity 200, Theatre layout, Mon-Sun 08:00-22:00 (agreed in Questions); Events: organiser jasmine@gmail.com, coordinator joyce@gmail.com (ITZY: jonathan@gmail.com), status Planning, 100 pax; Requested times: the approved booking 1 Oct 2026 10:00, the pending one 10:05 (so the pending one is the later booking)
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

-- Must not exist: conflict flags on Bigbang Event, BTS Event (they start not flagged).
DELETE FROM public.venue_booking_conflicts
WHERE booking_id IN ('00000000-0000-4000-8088-000000000301', '00000000-0000-4000-8088-000000000302') OR conflicting_booking_id IN ('00000000-0000-4000-8088-000000000301', '00000000-0000-4000-8088-000000000302');

COMMIT;

SELECT 'spm88_tc003_setup.sql: setup complete' AS result;
