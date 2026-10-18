-- SPM-76 TC-005: Selecting a notification opens the related event when the user has access to it
-- Acceptance criterion: AC4
-- Run with: pnpm uat:setup spm76_tc005   (from the repo root; see tests/uat_data/README.md)
-- Login: Event Coordinator (joyce@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: derived from Test Data and Expected Result (no prose precondition); notifications follow what the app sends (user decision)
-- Records restored: profiles joyce, jasmine; event "Townhall 2026" (id 00000000-0000-0000-0076-000000000201, coordinator joyce); notification N1 (unread)
-- Must-not-exist conditions enforced: none
-- Defaults added: Events: organiser jasmine, coordinator joyce, Planning; Townhall 2026 18 Dec 2026 10:00-12:00 (150 pax), Charity Gala 2026 19 Dec 2026 18:00-22:00 (200 pax); notification titles and messages are the ones the app's own functions send (N1 venue booking decision, N2 hold reminder, N3 and D1 coordinator assignment)
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

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
  VALUES ('00000000-0000-0000-0076-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Townhall 2026', 'UAT event for SPM-76 and SPM-77.', 'Meeting',
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

-- Notification N1 for joyce@gmail.com: "Venue booking approved", unread, created 2 days ago (fixed id).
-- Its time is relative to now, so it is recalculated on every run.
INSERT INTO public.notifications AS n (id, recipient_id, event_id, booking_id, type, title, message, read_at, created_at, scheduled_for)
VALUES ('00000000-0000-0000-0076-000000000401', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '00000000-0000-0000-0076-000000000201', NULL, 'venue_decision', 'Venue booking approved', 'Your venue booking request has been approved. The venue is now a confirmed booking for this period.',
        NULL, now() - interval '2 days', NULL)
ON CONFLICT (id) DO UPDATE
SET recipient_id = EXCLUDED.recipient_id, event_id = EXCLUDED.event_id, booking_id = NULL, type = EXCLUDED.type,
    title = EXCLUDED.title, message = EXCLUDED.message, read_at = EXCLUDED.read_at,
    created_at = EXCLUDED.created_at, scheduled_for = NULL
WHERE (n.recipient_id, n.event_id, n.type, n.title, n.message, n.read_at, n.created_at, n.booking_id, n.scheduled_for)
      IS DISTINCT FROM (EXCLUDED.recipient_id, '00000000-0000-0000-0076-000000000201', EXCLUDED.type, EXCLUDED.title, EXCLUDED.message,
                        NULL::timestamptz, EXCLUDED.created_at, NULL::uuid, NULL::timestamptz);

COMMIT;
