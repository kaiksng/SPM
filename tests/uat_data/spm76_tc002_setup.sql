-- SPM-76 TC-002: Unread count badge in navigation matches the number of unread notifications
-- Acceptance criterion: AC2
-- Workflow records: status history to the event's status; Lead's coordinator assignment (tom@gmail.com) and the coordinator's approval of the request
-- Run with: pnpm uat:setup spm76_tc002   (from the repo root; see tests/uat_data/README.md)
-- Login: Event Coordinator (joyce@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: derived from Test Data and Expected Result (no prose precondition); notifications follow what the app sends (user decision)
-- Records restored: profiles joyce, jasmine; events "Townhall 2026" (id 00000000-0000-4000-8076-000000000201) and "Charity Gala 2026" (id 00000000-0000-4000-8076-000000000202), both coordinated by joyce; notifications N1 (read), N2, N3 (unread) for joyce
-- Must-not-exist conditions enforced: every other notification of joyce@gmail.com (deleted)
-- Defaults added: Events: organiser jasmine, coordinator joyce, Planning; Townhall 2026 18 Dec 2026 10:00-12:00 (150 pax), Charity Gala 2026 19 Dec 2026 18:00-22:00 (200 pax); notification titles and messages are the ones the app's own functions send (N1 venue booking decision, N2 hold reminder, N3 and D1 coordinator assignment)
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

-- Earlier versions of these files used ids the backend rejects (not valid UUIDs). Remove any test records
-- left under those ids (with their own requests, notifications and history) so they can't clash.
DO $$
DECLARE v_ids uuid[] := ARRAY['00000000-0000-0000-0076-000000000201', '00000000-0000-0000-0076-000000000202', '00000000-0000-0000-0076-000000000401', '00000000-0000-0000-0076-000000000402', '00000000-0000-0000-0076-000000000403']::uuid[];
BEGIN
  DELETE FROM public.notifications WHERE id = ANY (v_ids);
  DELETE FROM public.events WHERE id = ANY (v_ids);
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'UAT setup stopped: an old test record is still used by non-test data. Nothing was changed.';
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

-- Event "Townhall 2026" (fixed id), status planning. A status that can't move to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8076-000000000201';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8076-000000000201';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description, purpose,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8076-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Townhall 2026', 'UAT event for SPM-76 and SPM-77.', 'Meeting',
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

-- Event "Charity Gala 2026" (fixed id), status planning. A status that can't move to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8076-000000000202';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8076-000000000202';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description, purpose,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8076-000000000202', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Charity Gala 2026', 'UAT event for SPM-76 and SPM-77.', 'Company Dinner and Dance',
          200, '2026-12-19 18:00:00+08', '2026-12-19 22:00:00+08', 'planning',
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

-- Notification N1 for joyce@gmail.com: "Venue booking approved", read, created 2 days ago (fixed id).
-- Its time is relative to now, so it is recalculated on every run.
INSERT INTO public.notifications AS n (id, recipient_id, event_id, booking_id, type, title, message, read_at, created_at, scheduled_for)
VALUES ('00000000-0000-4000-8076-000000000401', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '00000000-0000-4000-8076-000000000201', NULL, 'venue_decision', 'Venue booking approved', 'Your venue booking request has been approved. The venue is now a confirmed booking for this period.',
        now() - interval '1 day', now() - interval '2 days', NULL)
ON CONFLICT (id) DO UPDATE
SET recipient_id = EXCLUDED.recipient_id, event_id = EXCLUDED.event_id, booking_id = NULL, type = EXCLUDED.type,
    title = EXCLUDED.title, message = EXCLUDED.message, read_at = EXCLUDED.read_at,
    created_at = EXCLUDED.created_at, scheduled_for = NULL
WHERE (n.recipient_id, n.event_id, n.type, n.title, n.message, n.read_at, n.created_at, n.booking_id, n.scheduled_for)
      IS DISTINCT FROM (EXCLUDED.recipient_id, '00000000-0000-4000-8076-000000000201', EXCLUDED.type, EXCLUDED.title, EXCLUDED.message,
                        now() - interval '1 day', EXCLUDED.created_at, NULL::uuid, NULL::timestamptz);

-- Notification N2 for joyce@gmail.com: "Venue hold expires soon", unread, created 1 day ago (fixed id).
-- Its time is relative to now, so it is recalculated on every run.
INSERT INTO public.notifications AS n (id, recipient_id, event_id, booking_id, type, title, message, read_at, created_at, scheduled_for)
VALUES ('00000000-0000-4000-8076-000000000402', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '00000000-0000-4000-8076-000000000201', NULL, 'venue_hold_expiring_soon', 'Venue hold expires soon', 'Your tentative hold on Hall 3 for "Townhall 2026" expires at 5:00 PM on 17 Dec. Confirm it to keep your place in the queue.',
        NULL, now() - interval '1 day', NULL)
ON CONFLICT (id) DO UPDATE
SET recipient_id = EXCLUDED.recipient_id, event_id = EXCLUDED.event_id, booking_id = NULL, type = EXCLUDED.type,
    title = EXCLUDED.title, message = EXCLUDED.message, read_at = EXCLUDED.read_at,
    created_at = EXCLUDED.created_at, scheduled_for = NULL
WHERE (n.recipient_id, n.event_id, n.type, n.title, n.message, n.read_at, n.created_at, n.booking_id, n.scheduled_for)
      IS DISTINCT FROM (EXCLUDED.recipient_id, '00000000-0000-4000-8076-000000000201', EXCLUDED.type, EXCLUDED.title, EXCLUDED.message,
                        NULL::timestamptz, EXCLUDED.created_at, NULL::uuid, NULL::timestamptz);

-- Notification N3 for joyce@gmail.com: "New event request assigned to you", unread, created 3 hours ago (fixed id).
-- Its time is relative to now, so it is recalculated on every run.
INSERT INTO public.notifications AS n (id, recipient_id, event_id, booking_id, type, title, message, read_at, created_at, scheduled_for)
VALUES ('00000000-0000-4000-8076-000000000403', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '00000000-0000-4000-8076-000000000202', NULL, 'assignment', 'New event request assigned to you', 'Event "Charity Gala 2026" has been assigned to you for review.',
        NULL, now() - interval '3 hours', NULL)
ON CONFLICT (id) DO UPDATE
SET recipient_id = EXCLUDED.recipient_id, event_id = EXCLUDED.event_id, booking_id = NULL, type = EXCLUDED.type,
    title = EXCLUDED.title, message = EXCLUDED.message, read_at = EXCLUDED.read_at,
    created_at = EXCLUDED.created_at, scheduled_for = NULL
WHERE (n.recipient_id, n.event_id, n.type, n.title, n.message, n.read_at, n.created_at, n.booking_id, n.scheduled_for)
      IS DISTINCT FROM (EXCLUDED.recipient_id, '00000000-0000-4000-8076-000000000202', EXCLUDED.type, EXCLUDED.title, EXCLUDED.message,
                        NULL::timestamptz, EXCLUDED.created_at, NULL::uuid, NULL::timestamptz);

-- Must not exist: any notification other than 00000000-0000-4000-8076-000000000401, 00000000-0000-4000-8076-000000000402, 00000000-0000-4000-8076-000000000403 for joyce@gmail.com (the case expects exactly N1, N2 and N3).
DELETE FROM public.notifications
WHERE recipient_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND id NOT IN ('00000000-0000-4000-8076-000000000401', '00000000-0000-4000-8076-000000000402', '00000000-0000-4000-8076-000000000403');

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

-- "Townhall 2026" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8076-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8076-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8076-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8076-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8076-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8076-000000000201' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8076-000000000201';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8076-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8076-000000000201')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8076-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8076-000000000201', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

-- "Charity Gala 2026" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8076-000000000202') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8076-000000000202' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8076-000000000202';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8076-000000000202', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8076-000000000202') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8076-000000000202' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8076-000000000202';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8076-000000000202', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8076-000000000202')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8076-000000000202';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8076-000000000202', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

COMMIT;
