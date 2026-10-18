-- SPM-77 TC-004: Lead attempting an out-of-scope action is denied with a clear message
-- Acceptance criterion: AC2 / AC4
-- Run with: pnpm uat:setup spm77_tc004   (from the repo root; see tests/uat_data/README.md)
-- Login: Event Coordinator Lead (tom@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: derived from Test Data (no prose precondition): Townhall 2026 exists with a Pending venue request; tom has the Lead role; the same Townhall 2026 / Charity Gala 2026 records as SPM-76 (same fixed ids), here with Townhall coordinated by jonathan
-- Records restored: profiles tom, jasmine, jonathan, daryl; venue "Hall 3" (id 00000000-0000-0000-0087-000000000103, shared with SPM-87); event "Townhall 2026" (id 00000000-0000-0000-0076-000000000201); pending venue request (id 00000000-0000-0000-0077-000000000301) for Hall 3, 18 Dec 2026 10:00-12:00
-- Must-not-exist conditions enforced: other active venue requests of Townhall 2026 (cancelled); blocks on Hall 3 during the booking (marked removed)
-- Defaults added: Events: organiser jasmine, Planning; Townhall 2026 18 Dec 2026 10:00-12:00 (150 pax), Charity Gala 2026 19 Dec 2026 18:00-22:00 (200 pax); pending request at Hall 3 (Central Area, 200 pax, Mon-Fri 09:00-17:00, setup/turnaround 15 min, Theatre) by jonathan
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

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

-- Clash guard: stop if a real (non-test) venue already uses the name "Hall 3" (Central Area).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues
             WHERE name = 'Hall 3' AND location = 'Central Area' AND id <> '00000000-0000-0000-0087-000000000103') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Hall 3" (Central Area) already exists. Nothing was changed.';
  END IF;
END $$;

-- Venue "Hall 3" (Central Area), test id 00000000-0000-0000-0087-000000000103: inserted if missing, reset if changed.
INSERT INTO public.venues AS v (id, name, location, area_tags, capacity, operating_hours,
                                setup_time_minutes, turnaround_time_minutes)
VALUES ('00000000-0000-0000-0087-000000000103', 'Hall 3', 'Central Area', ARRAY['Central Area'], 200,
        '[{"days": ["mon", "tue", "wed", "thu", "fri"], "opensAt": "09:00", "closesAt": "17:00"}]'::jsonb, 15, 15)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, location = EXCLUDED.location, area_tags = EXCLUDED.area_tags,
    capacity = EXCLUDED.capacity, operating_hours = EXCLUDED.operating_hours,
    setup_time_minutes = EXCLUDED.setup_time_minutes, turnaround_time_minutes = EXCLUDED.turnaround_time_minutes
WHERE (v.name, v.location, v.area_tags, v.capacity, v.operating_hours, v.setup_time_minutes, v.turnaround_time_minutes)
      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.location, EXCLUDED.area_tags, EXCLUDED.capacity,
                        EXCLUDED.operating_hours, EXCLUDED.setup_time_minutes, EXCLUDED.turnaround_time_minutes);

-- Facilities and layouts of the test venue: exactly the listed ones.
DELETE FROM public.venue_facilities
WHERE venue_id = '00000000-0000-0000-0087-000000000103' AND facility_name <> ALL (ARRAY[]::text[]);
INSERT INTO public.venue_facilities (venue_id, facility_name)
SELECT '00000000-0000-0000-0087-000000000103', f FROM unnest(ARRAY[]::text[]) AS f
WHERE NOT EXISTS (SELECT 1 FROM public.venue_facilities x WHERE x.venue_id = '00000000-0000-0000-0087-000000000103' AND x.facility_name = f);

DELETE FROM public.venue_layouts
WHERE venue_id = '00000000-0000-0000-0087-000000000103' AND layout_name::text <> ALL (ARRAY['Theatre']::text[]);
INSERT INTO public.venue_layouts (venue_id, layout_name)
SELECT '00000000-0000-0000-0087-000000000103', l::public.room_layout FROM unnest(ARRAY['Theatre']::text[]) AS l
WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts x WHERE x.venue_id = '00000000-0000-0000-0087-000000000103' AND x.layout_name::text = l);

-- Event "Townhall 2026" (fixed id), status planning. A status that can't move to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-0000-0076-000000000201';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-0000-0076-000000000201';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description, purpose,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-0000-0076-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'Townhall 2026', 'UAT event for SPM-76 and SPM-77.', 'Meeting',
          150, '2026-12-18 10:00:00+08', '2026-12-18 12:00:00+08', 'planning',
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

-- Booking: "Townhall 2026" at Hall 3, pending, 2026-12-18 10:00 to 12:00 (fixed id).
DO $$
DECLARE
  v_venue uuid := '00000000-0000-0000-0087-000000000103'::uuid;
  v_clash text;
BEGIN
  -- Must not exist: another active booking for this test event (e.g. one a tester requested),
  -- which the one-active-booking-per-event rule would reject. It is cancelled, not deleted.
  UPDATE public.venue_bookings SET status = 'cancelled'
  WHERE event_id = '00000000-0000-0000-0076-000000000201' AND id <> '00000000-0000-0000-0077-000000000301'
    AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the booking (it would reject the booking).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-18 10:00:00+08', '2026-12-18 12:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id <> '00000000-0000-0000-0077-000000000301' AND b2.event_id <> '00000000-0000-0000-0076-000000000201'
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-18 10:00:00+08', '2026-12-18 12:00:00+08')
  LIMIT 1;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") already occupies Hall 3 at this time; cancel it before running this file', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at,
                                          status, decided_at, decided_by, expires_at, held_by,
                                          needs_review, needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-0000-0077-000000000301', '00000000-0000-0000-0076-000000000201', v_venue, (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), '2026-10-05 10:00:00+08',
          '2026-12-18 10:00:00+08', '2026-12-18 12:00:00+08', 'pending', NULL, NULL,
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
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, NULL::timestamptz,
                          NULL::uuid, NULL::timestamptz, NULL::uuid, false, NULL::text,
                          NULL::uuid, true);
END $$;

COMMIT;
