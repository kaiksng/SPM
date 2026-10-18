-- SPM-87 TC-006: Effective windows with a substantial overlap are a conflict
-- Acceptance criterion: AC2
-- Run with: pnpm uat:setup spm87_tc006   (from the repo root; see tests/uat_data/README.md)
-- Login: Event Coordinator (jonathan@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none typed; jonathan requests Main Auditorium for "Stray Kids Event" (14 Dec 2026 12:30-14:00), which this file prepares but does not request
-- Source: derived from Test Steps and Test Data (no prose precondition): existing Main Auditorium booking 10:00-12:00 with 30/45 (window 09:30-12:45); new request 14 Dec 2026 12:30-14:00, window 12:00-14:45 (the venue's setup and turnaround apply)
-- Records restored: profiles jonathan, jasmine, joyce, daryl; venue "Main Auditorium" (id 00000000-0000-0000-0087-000000000101, setup 30, turnaround 45); event "Jazz Night" (id 00000000-0000-0000-0087-000000000204); approved booking (id 00000000-0000-0000-0087-000000000303) 14 Dec 2026 10:00-12:00; event "Stray Kids Event" (id 00000000-0000-0000-0087-000000000201, 12:30-14:00, coordinator jonathan) with venue requirements Central Area / 100 pax
-- Must-not-exist conditions enforced: other active bookings of Jazz Night (cancelled); blocks on Main Auditorium during the booking (marked removed); active venue requests of Stray Kids Event (cancelled); blocks on Main Auditorium during the new window (marked removed); other people's active bookings overlapping it (file stops)
-- Defaults added: Main Auditorium: Central Area, 200 pax, Mon-Sun 08:00-22:00, Theatre (user decision: SPM-87 has its own venue, not SPM-88's Auditorium); Jazz Night: organiser jasmine, coordinator joyce, Planning, 100 pax, approved by daryl; Stray Kids Event: organiser jasmine, coordinator jonathan, Planning, 100 pax, requirements Central Area / min 100 pax
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

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

-- Clash guard: stop if a real (non-test) venue already uses the name "Main Auditorium" (Central Area).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues
             WHERE name = 'Main Auditorium' AND location = 'Central Area' AND id <> '00000000-0000-0000-0087-000000000101') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Main Auditorium" (Central Area) already exists. Nothing was changed.';
  END IF;
END $$;

-- Venue "Main Auditorium" (Central Area), test id 00000000-0000-0000-0087-000000000101: inserted if missing, reset if changed.
INSERT INTO public.venues AS v (id, name, location, area_tags, capacity, operating_hours,
                                setup_time_minutes, turnaround_time_minutes)
VALUES ('00000000-0000-0000-0087-000000000101', 'Main Auditorium', 'Central Area', ARRAY['Central Area'], 200,
        '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb, 30, 45)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, location = EXCLUDED.location, area_tags = EXCLUDED.area_tags,
    capacity = EXCLUDED.capacity, operating_hours = EXCLUDED.operating_hours,
    setup_time_minutes = EXCLUDED.setup_time_minutes, turnaround_time_minutes = EXCLUDED.turnaround_time_minutes
WHERE (v.name, v.location, v.area_tags, v.capacity, v.operating_hours, v.setup_time_minutes, v.turnaround_time_minutes)
      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.location, EXCLUDED.area_tags, EXCLUDED.capacity,
                        EXCLUDED.operating_hours, EXCLUDED.setup_time_minutes, EXCLUDED.turnaround_time_minutes);

-- Facilities and layouts of the test venue: exactly the listed ones.
DELETE FROM public.venue_facilities
WHERE venue_id = '00000000-0000-0000-0087-000000000101' AND facility_name <> ALL (ARRAY[]::text[]);
INSERT INTO public.venue_facilities (venue_id, facility_name)
SELECT '00000000-0000-0000-0087-000000000101', f FROM unnest(ARRAY[]::text[]) AS f
WHERE NOT EXISTS (SELECT 1 FROM public.venue_facilities x WHERE x.venue_id = '00000000-0000-0000-0087-000000000101' AND x.facility_name = f);

DELETE FROM public.venue_layouts
WHERE venue_id = '00000000-0000-0000-0087-000000000101' AND layout_name::text <> ALL (ARRAY['Theatre']::text[]);
INSERT INTO public.venue_layouts (venue_id, layout_name)
SELECT '00000000-0000-0000-0087-000000000101', l::public.room_layout FROM unnest(ARRAY['Theatre']::text[]) AS l
WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts x WHERE x.venue_id = '00000000-0000-0000-0087-000000000101' AND x.layout_name::text = l);

-- Event "Jazz Night" (fixed id), status planning. A status that can't move to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-0000-0087-000000000204';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-0000-0087-000000000204';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description, purpose,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-0000-0087-000000000204', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Jazz Night', 'UAT event for SPM-87 effective window.', 'Party',
          100, '2026-12-14 10:00:00+08', '2026-12-14 12:00:00+08', 'planning',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description, purpose = EXCLUDED.purpose,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.purpose, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.purpose, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

-- Booking: "Jazz Night" at Main Auditorium, approved, 2026-12-14 10:00 to 12:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := '00000000-0000-0000-0087-000000000101'::uuid;
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-active-booking-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings SET status = 'cancelled'
  WHERE event_id = '00000000-0000-0000-0087-000000000204' AND id <> '00000000-0000-0000-0087-000000000303'
    AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the booking (it would reject the booking).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-14 10:00:00+08', '2026-12-14 12:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id <> '00000000-0000-0000-0087-000000000303' AND b2.event_id <> '00000000-0000-0000-0087-000000000204'
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-14 10:00:00+08', '2026-12-14 12:00:00+08')
  LIMIT 1;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") already occupies Main Auditorium at this time; cancel it before running this file', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at,
                                          status, decided_at, decided_by, expires_at, held_by,
                                          needs_review, needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-0000-0087-000000000303', '00000000-0000-0000-0087-000000000204', v_venue, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-10-01 10:00:00+08',
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
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, '2026-10-02 09:00:00+08',
                          (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), NULL::timestamptz, NULL::uuid, false, NULL::text,
                          NULL::uuid, true);
END $$;

-- Event "Stray Kids Event" (fixed id), status planning. A status that can't move to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-0000-0087-000000000201';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-0000-0087-000000000201';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description, purpose,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-0000-0087-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'Stray Kids Event', 'UAT event for SPM-87 effective window.', 'Conference',
          100, '2026-12-14 12:30:00+08', '2026-12-14 14:00:00+08', 'planning',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description, purpose = EXCLUDED.purpose,
      expected_attendance = EXCLUDED.expected_attendance, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.purpose, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.purpose, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);
END $$;

-- Venue requirements for "Stray Kids Event": Central Area, at least 100 pax, no layout, accessibility or facility needs.
INSERT INTO public.event_venue_requirements AS r (event_id, minimum_capacity, preferred_location, layout_notes, accessibility_notes)
VALUES ('00000000-0000-0000-0087-000000000201', 100, 'Central Area', NULL, NULL)
ON CONFLICT (event_id) DO UPDATE
SET minimum_capacity = EXCLUDED.minimum_capacity, preferred_location = EXCLUDED.preferred_location,
    layout_notes = NULL, accessibility_notes = NULL
WHERE (r.minimum_capacity, r.preferred_location, r.layout_notes, r.accessibility_notes)
      IS DISTINCT FROM (EXCLUDED.minimum_capacity, EXCLUDED.preferred_location, NULL::text, NULL::text);
DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-0000-0087-000000000201';

-- Must not exist: an active venue request for "Stray Kids Event" (e.g. one a tester submitted in an earlier run).
-- It is cancelled, not deleted.
UPDATE public.venue_bookings SET status = 'cancelled'
WHERE event_id = '00000000-0000-0000-0087-000000000201' AND status IN ('pending', 'approved', 'on_hold');

-- Must not exist on Main Auditorium: other active bookings or blocks during the new request window 12:00-14:45.
-- Blocks are marked removed; another person's booking is never changed, the file stops instead.
DO $$
DECLARE
  v_venue uuid := '00000000-0000-0000-0087-000000000101'::uuid;
  v_clash text;
BEGIN
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && public.venue_effective_window(v_venue, '2026-12-14 12:30:00+08', '2026-12-14 14:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id NOT IN ('00000000-0000-0000-0087-000000000303')
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND public.venue_effective_window(b2.venue_id, b2.starts_at, b2.ends_at) && public.venue_effective_window(v_venue, '2026-12-14 12:30:00+08', '2026-12-14 14:00:00+08')
  LIMIT 1;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") occupies Main Auditorium during the new request window 12:00-14:45; cancel it before running this file', v_clash;
  END IF;
END $$;

COMMIT;
