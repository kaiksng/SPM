-- SPM-75 TC-007: Expired hold remains visible in the event's change history
-- Acceptance criterion: AC4
-- Login: Event Coordinator (joyce@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): none (view only)
-- Source: Preconditions (key record lines) of the refined workbook; original prose kept in its Change Log
-- Records restored: profile daryl@gmail.com; profile jasmine@gmail.com; profile joyce@gmail.com; venue "Auditorium" (Marina Bay, id 00000000-0000-4000-8078-000000000101); event "Bigbang Event" (id 00000000-0000-4000-8078-000000000201); request Bigbang Event @ Auditorium (id 00000000-0000-4000-8078-000000000301): Expired (expiry 20 Oct 2026 17:00), with its hold notifications
-- Must-not-exist conditions enforced: a test-account copy of venue "Auditorium" at Marina Bay; other active requests of the test events Bigbang Event and BTS Event (cancelled); active blocks on the test venue during 14-16 Dec 2026 (marked removed); the test request's own notifications when they don't match the hold (replaced)
-- Defaults added: Auditorium location Marina Bay, capacity 200, Theatre layout, open Mon-Sun 00:00-23:59, setup/turnaround 0 (agreed in Questions); Events: organiser jasmine@gmail.com, 100 pax, preferred location Marina Bay, submitted 1 Oct 2026; request submitted by joyce 1 Oct 2026 10:00; Hold placed by daryl@gmail.com
-- Shared records: SPM-75 and SPM-78 use the same test records, so test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Workflow records: status history to the event's status; Lead's coordinator assignment (tom@gmail.com) and the coordinator's approval of the request
-- Run with: pnpm uat:setup spm75_tc007   (from the repo root)

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

-- Earlier versions of these files used ids the backend rejects (not valid UUIDs). Remove any test records
-- left under those ids (with their own requests, notifications and history) so they can't clash.
DO $$
DECLARE v_ids uuid[] := ARRAY['00000000-0000-0000-0078-000000000101', '00000000-0000-0000-0078-000000000201', '00000000-0000-0000-0078-000000000202', '00000000-0000-0000-0078-000000000301']::uuid[];
BEGIN
  DELETE FROM public.venue_bookings WHERE id = ANY (v_ids);
  DELETE FROM public.events WHERE id = ANY (v_ids);
  DELETE FROM public.venues WHERE id = ANY (v_ids);
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'UAT setup stopped: an old test venue is still used by a non-test request or event. Nothing was changed.';
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

-- Venue "Auditorium" (Marina Bay): restored on its fixed id; stops if a real venue already has this name and location.
DO $$
DECLARE v_id uuid;
BEGIN
  -- Must not exist: a copy of this venue that a test account created in the app. Removed only when
  -- no booking or event uses it.
  DELETE FROM public.venues v WHERE v.name = 'Auditorium' AND v.location = 'Marina Bay' AND v.id <> '00000000-0000-4000-8078-000000000101'
    AND (v.id::text LIKE '00000000-0000-0000-00%' OR v.id::text LIKE '00000000-0000-4000-80%' OR v.updated_by IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com')))
    AND NOT EXISTS (SELECT 1 FROM public.venue_bookings b WHERE b.venue_id = v.id)
    AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.venue_id = v.id);
  -- Clash guard: a real (non-test) venue already uses this name and location.
  IF EXISTS (SELECT 1 FROM public.venues WHERE name = 'Auditorium' AND location = 'Marina Bay' AND id <> '00000000-0000-4000-8078-000000000101') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Auditorium" at Marina Bay exists. Nothing was changed.';
  END IF;
  SELECT id INTO v_id FROM public.venues WHERE id = '00000000-0000-4000-8078-000000000101';
  IF v_id IS NULL THEN
    INSERT INTO public.venues (id, name, location, area_tags, capacity, operating_hours,
                               setup_time_minutes, turnaround_time_minutes)
    VALUES ('00000000-0000-4000-8078-000000000101', 'Auditorium', 'Marina Bay', ARRAY['Marina Bay'], 200, '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "00:00", "closesAt": "23:59"}]'::jsonb, 0, 0)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.venues
    SET name = 'Auditorium', location = 'Marina Bay', area_tags = ARRAY['Marina Bay'], capacity = 200,
        operating_hours = '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "00:00", "closesAt": "23:59"}]'::jsonb, setup_time_minutes = 0, turnaround_time_minutes = 0
    WHERE id = v_id
      AND (name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
          IS DISTINCT FROM ('Auditorium', 'Marina Bay', ARRAY['Marina Bay'], 200, '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "00:00", "closesAt": "23:59"}]'::jsonb, 0, 0);
  END IF;

  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities WHERE venue_id = v_id;
  DELETE FROM public.venue_layouts WHERE venue_id = v_id AND layout_name <> 'Theatre';
  INSERT INTO public.venue_layouts (venue_id, layout_name)
  SELECT v_id, 'Theatre' WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts WHERE venue_id = v_id AND layout_name = 'Theatre');
END $$;

-- Event "Bigbang Event" (fixed id). A status that can't move back to Planning (e.g. cancelled) is restored by
-- deleting and re-inserting this test event; its own bookings, notifications and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8078-000000000201';
  IF FOUND AND v_status <> 'planning' AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8078-000000000201';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8078-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Bigbang Event', 'UAT event for SPM-75/78 venue holds.',
          100, '2026-12-14 15:10:00+08', '2026-12-16 15:10:00+08', 'planning', '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'))
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id,
      title = EXCLUDED.title, description = EXCLUDED.description, expected_attendance = EXCLUDED.expected_attendance,
      starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.description, ev.expected_attendance,
         ev.starts_at, ev.ends_at, ev.status)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at,
                          EXCLUDED.ends_at, EXCLUDED.status);

  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity, layout_notes, accessibility_notes)
  VALUES ('00000000-0000-4000-8078-000000000201', 'Marina Bay', NULL, NULL, NULL)
  ON CONFLICT (event_id) DO UPDATE
  SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = NULL, layout_notes = NULL, accessibility_notes = NULL
  WHERE (r.preferred_location, r.minimum_capacity, r.layout_notes, r.accessibility_notes)
        IS DISTINCT FROM ('Marina Bay'::text, NULL::integer, NULL::text, NULL::text);
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8078-000000000201';
END $$;

-- Must not exist: an active venue request of the test event "BTS Event" (SPM-75 TC-006 creates one for
-- this same period). Cancelled, not deleted.
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '00000000-0000-4000-8078-000000000202' AND status IN ('pending', 'approved', 'on_hold');

-- Venue request: "Bigbang Event" at Auditorium, 2026-12-14 15:10 to 2026-12-16 15:10 (fixed id), expired.
DO $$
DECLARE
  v_clash text;
  v_expiry timestamptz := '2026-10-20 17:00:00+08'::timestamptz;
  v_ok boolean;
BEGIN
  -- Must not exist: another active request for this test event (e.g. one a tester submitted). Cancelled, not deleted.
  UPDATE public.venue_bookings
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
  WHERE event_id = '00000000-0000-4000-8078-000000000201' AND id <> '00000000-0000-4000-8078-000000000301' AND status IN ('pending', 'approved', 'on_hold');

  -- Must not exist: an active block on this test venue during the request (it would reject the request).
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = '00000000-0000-4000-8078-000000000101' AND removed_at IS NULL AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-14 15:10:00+08', '2026-12-16 15:10:00+08');

  -- Clash guard: a real (non-test) request already occupies this venue for the period.
  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = '00000000-0000-4000-8078-000000000101' AND b2.id <> '00000000-0000-4000-8078-000000000301' AND b2.event_id NOT IN ('00000000-0000-4000-8078-000000000201', '00000000-0000-4000-8078-000000000202')
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-14 15:10:00+08', '2026-12-16 15:10:00+08')
  LIMIT 1;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'UAT setup stopped: a real request ("%") already occupies Auditorium (Marina Bay) at this time. Nothing was changed.', v_clash;
  END IF;

  INSERT INTO public.venue_bookings AS b (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at, status,
                                          decided_at, decided_by, decision_notes, expires_at, held_by, needs_review,
                                          needs_review_reason, replaces_booking_id, is_main_venue)
  VALUES ('00000000-0000-4000-8078-000000000301', '00000000-0000-4000-8078-000000000201', '00000000-0000-4000-8078-000000000101', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-10-01 10:00:00+08',
          '2026-12-14 15:10:00+08', '2026-12-16 15:10:00+08', 'expired', NULL, NULL, NULL, v_expiry, (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), false, NULL, NULL, true)
  ON CONFLICT (id) DO UPDATE
  SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, requested_by = EXCLUDED.requested_by,
      requested_at = EXCLUDED.requested_at, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      status = EXCLUDED.status, decided_at = NULL, decided_by = NULL, decision_notes = NULL,
      expires_at = EXCLUDED.expires_at, held_by = EXCLUDED.held_by, needs_review = false,
      needs_review_reason = NULL, replaces_booking_id = NULL, is_main_venue = true
  WHERE (b.event_id, b.venue_id, b.requested_by, b.requested_at, b.starts_at, b.ends_at, b.status, b.decided_at,
         b.decided_by, b.decision_notes, b.expires_at, b.held_by, b.needs_review, b.needs_review_reason,
         b.replaces_booking_id, b.is_main_venue)
        IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.requested_by, EXCLUDED.requested_at,
                          EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, NULL::timestamptz, NULL::uuid,
                          NULL::text, EXCLUDED.expires_at, EXCLUDED.held_by, false, NULL::text, NULL::uuid, true);

  -- Multi-venue fields: back to their defaults for this test request.
  UPDATE public.venue_bookings
  SET label = 'Main Programme', expected_headcount = NULL, layout_notes = NULL, accessibility_notes = NULL,
      required_facilities = '{}', advisory_notes = NULL, cancellation_reason = NULL, cancelled_by = NULL, cancelled_at = NULL
  WHERE id = '00000000-0000-4000-8078-000000000301'
    AND (label, expected_headcount, layout_notes, accessibility_notes, required_facilities, advisory_notes,
         cancellation_reason, cancelled_by, cancelled_at)
        IS DISTINCT FROM ('Main Programme', NULL::integer, NULL::text, NULL::text, '{}'::text[], NULL::text,
                          NULL::text, NULL::uuid, NULL::timestamptz);

  SELECT count(*) = 3 AND count(*) FILTER (WHERE type = 'venue_hold_expiring_soon' AND scheduled_for = v_expiry - interval '24 hours') = 1
                      AND count(*) FILTER (WHERE type = 'venue_hold_expired' AND scheduled_for = v_expiry) = 1
                      AND count(*) FILTER (WHERE type = 'venue_hold_placed') = 1
    INTO v_ok FROM public.notifications WHERE booking_id = '00000000-0000-4000-8078-000000000301';
  IF NOT v_ok THEN
    DELETE FROM public.notifications WHERE booking_id = '00000000-0000-4000-8078-000000000301';
  INSERT INTO public.notifications (recipient_id, event_id, booking_id, type, title, message, scheduled_for)
  VALUES
    ((SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '00000000-0000-4000-8078-000000000201', '00000000-0000-4000-8078-000000000301', 'venue_hold_placed', 'Venue request on hold',
     'Your venue booking request for Auditorium ("Bigbang Event") has been put on hold. Confirm it before the hold expires to keep your place in the queue.', NULL),
    ((SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '00000000-0000-4000-8078-000000000201', '00000000-0000-4000-8078-000000000301', 'venue_hold_expired', 'Venue hold has expired',
     'Your tentative hold on Auditorium for "Bigbang Event" has expired. Submit a new venue booking request to try again.', v_expiry),
    ((SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '00000000-0000-4000-8078-000000000201', '00000000-0000-4000-8078-000000000301', 'venue_hold_expiring_soon', 'Venue hold expires soon',
     'Your tentative hold on Auditorium for "Bigbang Event" expires at '
       || to_char(v_expiry at time zone 'Asia/Singapore', 'FMHH12:MI AM "on" DD Mon')
       || '. Confirm it to keep your place in the queue.', v_expiry - interval '24 hours');
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
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8078-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8078-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8078-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8078-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8078-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8078-000000000201' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8078-000000000201';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8078-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8078-000000000201')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8078-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8078-000000000201', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

COMMIT;

SELECT 'spm75_tc007_setup.sql: setup complete' AS result;
