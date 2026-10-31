-- SPM-87 TC-008: A venue is available when its effective window exactly matches the operating-hours boundary
-- Acceptance criterion: AC3
-- Workflow records: status history to the event's status; Lead's coordinator assignment (tom@gmail.com) and the coordinator's approval of the request
-- Run with: pnpm uat:setup spm87_tc008   (from the repo root; see tests/uat_data/README.md)
-- Login: Event Coordinator (jonathan@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none typed; jonathan checks Hall 3 for "Hall 3 Check Event" (14 Dec 2026 09:15-16:45), which this file prepares
-- Source: derived from Test Steps and Test Data (no prose precondition): Hall 3 operating hours Mon-Fri 09:00-17:00, setup 15 min, turnaround 15 min; request 09:15-16:45 -> window 09:00-17:00
-- Records restored: profiles jonathan, jasmine; venue "Hall 3" (id 00000000-0000-4000-8087-000000000103, setup 15); event "Hall 3 Check Event" (id 00000000-0000-4000-8087-000000000203, 14 Dec 2026 09:15-16:45) with venue requirements Central Area / 100 pax
-- Must-not-exist conditions enforced: active venue requests of Hall 3 Check Event (cancelled); blocks on Hall 3 during the window (marked removed); other people's active bookings overlapping it (file stops)
-- Defaults added: Request date Mon 14 Dec 2026 (inside Hall 3's Mon-Fri hours); Hall 3: Central Area, 200 pax, Theatre; Hall 3 Check Event: organiser jasmine, coordinator jonathan, Planning, 100 pax, requirements Central Area / min 100 pax
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

-- Earlier versions of these files used ids the backend rejects (not valid UUIDs). Remove any test records
-- left under those ids (with their own requests, notifications and history) so they can't clash.
DO $$
DECLARE v_ids uuid[] := ARRAY['00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0087-000000000103', '00000000-0000-0000-0087-000000000203']::uuid[];
BEGIN
  DELETE FROM public.events WHERE id = ANY (v_ids);
  DELETE FROM public.venues WHERE id = ANY (v_ids);
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'UAT setup stopped: an old test record is still used by non-test data. Nothing was changed.';
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

-- Clash guard: stop if a real (non-test) venue already uses the name "Hall 3" (Central Area).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues
             WHERE name = 'Hall 3' AND location = 'Central Area' AND id <> '00000000-0000-4000-8087-000000000103') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Hall 3" (Central Area) already exists. Nothing was changed.';
  END IF;
END $$;

-- Venue "Hall 3" (Central Area), test id 00000000-0000-4000-8087-000000000103: inserted if missing, reset if changed.
INSERT INTO public.venues AS v (id, name, location, area_tags, capacity, operating_hours,
                                setup_time_minutes, turnaround_time_minutes)
VALUES ('00000000-0000-4000-8087-000000000103', 'Hall 3', 'Central Area', ARRAY['Central Area'], 200,
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
WHERE venue_id = '00000000-0000-4000-8087-000000000103' AND facility_name <> ALL (ARRAY[]::text[]);
INSERT INTO public.venue_facilities (venue_id, facility_name)
SELECT '00000000-0000-4000-8087-000000000103', f FROM unnest(ARRAY[]::text[]) AS f
WHERE NOT EXISTS (SELECT 1 FROM public.venue_facilities x WHERE x.venue_id = '00000000-0000-4000-8087-000000000103' AND x.facility_name = f);

DELETE FROM public.venue_layouts
WHERE venue_id = '00000000-0000-4000-8087-000000000103' AND layout_name::text <> ALL (ARRAY['Theatre']::text[]);
INSERT INTO public.venue_layouts (venue_id, layout_name)
SELECT '00000000-0000-4000-8087-000000000103', l::public.room_layout FROM unnest(ARRAY['Theatre']::text[]) AS l
WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts x WHERE x.venue_id = '00000000-0000-4000-8087-000000000103' AND x.layout_name::text = l);

-- Event "Hall 3 Check Event" (fixed id), status planning. A status that can't move to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8087-000000000203';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8087-000000000203';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description, purpose,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8087-000000000203', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'Hall 3 Check Event', 'UAT event for SPM-87 operating hours.', 'Workshop',
          100, '2026-12-14 09:15:00+08', '2026-12-14 16:45:00+08', 'planning',
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

-- Venue requirements for "Hall 3 Check Event": Central Area, at least 100 pax, no layout, accessibility or facility needs.
INSERT INTO public.event_venue_requirements AS r (event_id, minimum_capacity, preferred_location, layout_notes, accessibility_notes)
VALUES ('00000000-0000-4000-8087-000000000203', 100, 'Central Area', NULL, NULL)
ON CONFLICT (event_id) DO UPDATE
SET minimum_capacity = EXCLUDED.minimum_capacity, preferred_location = EXCLUDED.preferred_location,
    layout_notes = NULL, accessibility_notes = NULL
WHERE (r.minimum_capacity, r.preferred_location, r.layout_notes, r.accessibility_notes)
      IS DISTINCT FROM (EXCLUDED.minimum_capacity, EXCLUDED.preferred_location, NULL::text, NULL::text);
DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8087-000000000203';

-- Must not exist: an active venue request for "Hall 3 Check Event" (e.g. one a tester submitted in an earlier run).
-- It is cancelled, not deleted.
UPDATE public.venue_bookings SET status = 'cancelled'
WHERE event_id = '00000000-0000-4000-8087-000000000203' AND status IN ('pending', 'approved', 'on_hold');

-- Must not exist on Hall 3: other active bookings or blocks during the request window 09:00-17:00.
-- Blocks are marked removed; another person's booking is never changed, the file stops instead.
DO $$
DECLARE
  v_venue uuid := '00000000-0000-4000-8087-000000000103'::uuid;
  v_clash text;
BEGIN
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && public.venue_effective_window(v_venue, '2026-12-14 09:15:00+08', '2026-12-14 16:45:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id NOT IN ('00000000-0000-4000-8000-000000000000')
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND public.venue_effective_window(b2.venue_id, b2.starts_at, b2.ends_at) && public.venue_effective_window(v_venue, '2026-12-14 09:15:00+08', '2026-12-14 16:45:00+08')
  LIMIT 1;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") occupies Hall 3 during the request window 09:00-17:00; cancel it before running this file', v_clash;
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

-- "Hall 3 Check Event" (Planning): status history Draft -> Requested -> Planning, Tom assigned Jonathan and Jonathan approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8087-000000000203') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8087-000000000203' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8087-000000000203';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8087-000000000203', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8087-000000000203') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8087-000000000203' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8087-000000000203';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8087-000000000203', (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8087-000000000203')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8087-000000000203';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8087-000000000203', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jonathan@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

COMMIT;
