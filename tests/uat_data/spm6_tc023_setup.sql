-- SPM-6-TC-023: Several clarification rounds appear in order in the change history
-- Acceptance criterion: AC 7
-- Login: Event Coordinator (joyce@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): see Test Data
-- Source: refined Preconditions of docs/Project Planning_refined_v2.xlsx
-- Records restored: profiles daryl, jasmine, jonathan, joyce, sally, tom; event "E1 Planning Meeting" (id 00000000-0000-4000-8006-000000000201: requested, organiser jasmine, coordinator joyce, 2026-11-20 10:00-12:00, clarification resolved, clarification resolved, history draft > requested)
-- Must-not-exist conditions enforced: other clarifications, change requests, notifications, venue requests and equipment on "E1 Planning Meeting"
-- Defaults added: Central Area test venues (Venue A 200 pax, Angel Hall 300, Registration Hall 100, Small Studio 50; open all day); event descriptions and times not stated in the case; workflow dates 18 Sep - 28 Oct 2026
-- Shared records: cases of a story use the same test events (E1, E3, E18, E19, Venue A...): test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm6_tc023   (from the repo root)

BEGIN;

-- Lets this file set assigned coordinators and equipment request fields of its own test events.
SET LOCAL app.coordinator_reassignment = 'on';
SET LOCAL app.requesting_equipment = 'on';

-- Profile and role for daryl@gmail.com. Auth is only read, never written.
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

-- Profile and role for jasmine@gmail.com. Auth is only read, never written.
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

-- Profile and role for jonathan@gmail.com. Auth is only read, never written.
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

-- Profile and role for joyce@gmail.com. Auth is only read, never written.
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

-- Profile and role for sally@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'sally@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Sally', 'sally@gmail.com', 'safety_officer')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

-- Profile and role for tom@gmail.com. Auth is only read, never written.
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


-- Venue requests left by an earlier run or another case: this case's own stale requests, and other UAT test events'
-- requests at this case's test venues that overlap its event times, are released so they can't block or distort it.
UPDATE public.venue_bookings b SET status = 'cancelled', cancelled_at = now()
FROM public.events x
WHERE x.id = b.event_id AND x.status <> 'completed' AND b.status IN ('pending', 'approved', 'on_hold')
  AND (b.event_id::text LIKE '00000000-0000-4000-80%' OR b.event_id::text LIKE '00000000-0000-0000-00%')
  AND NOT (b.id = ANY (ARRAY[]::uuid[]))
  AND (b.event_id = ANY (ARRAY['00000000-0000-4000-8006-000000000201']::uuid[])
       OR (b.venue_id = ANY (ARRAY[]::uuid[]) AND (tstzrange(b.starts_at, b.ends_at) && tstzrange('2026-11-20 10:00:00+08', '2026-11-20 12:00:00+08'))));

-- Event "E1 Planning Meeting" (Requested, id 00000000-0000-4000-8006-000000000201). Stops if a real event has this title.
-- A status that can't move back to Requested is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('E1 Planning Meeting') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')
             AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'E1 Planning Meeting';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8006-000000000201';
  IF FOUND AND v_status <> 'requested' AND NOT public.event_status_transition_allowed(v_status, 'requested') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8006-000000000201';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8006-000000000201' AND NOT (id = ANY (ARRAY['00000000-0000-4000-8006-000000000303', '00000000-0000-4000-8006-000000000304']::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id)
  VALUES ('00000000-0000-4000-8006-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'E1 Planning Meeting', 'Meeting', 'Planning meeting for the quarter ahead.', 80,
          '2026-11-20 10:00:00+08', '2026-11-20 12:00:00+08', 'requested', '2026-09-20 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
          NULL)
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id, title = EXCLUDED.title,
      purpose = EXCLUDED.purpose, description = EXCLUDED.description, expected_attendance = EXCLUDED.expected_attendance,
      starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, submitted_at = EXCLUDED.submitted_at,
      submitted_by = EXCLUDED.submitted_by, requirements_acknowledged = EXCLUDED.requirements_acknowledged, venue_id = EXCLUDED.venue_id
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.purpose, ev.description, ev.expected_attendance, ev.starts_at,
         ev.ends_at, ev.status, ev.submitted_at, ev.submitted_by, ev.requirements_acknowledged, ev.venue_id)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title, EXCLUDED.purpose,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status,
                          EXCLUDED.submitted_at, EXCLUDED.submitted_by, EXCLUDED.requirements_acknowledged, EXCLUDED.venue_id);
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, accessibility_notes)
  VALUES ('00000000-0000-4000-8006-000000000201', 'Central Area', NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, accessibility_notes = NULL
  WHERE (r.preferred_location, r.accessibility_notes) IS DISTINCT FROM (EXCLUDED.preferred_location, NULL::text);
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8006-000000000201';
END $$;
-- Records "E1 Planning Meeting" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8006-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8006-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8006-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8006-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8006-000000000201';
  -- No active venue request for this event.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8006-000000000201' AND status IN ('pending', 'approved', 'on_hold');
  -- Equipment requirements: exactly the listed ones.
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8006-000000000201';
  DELETE FROM public.equipment_arrangement_updates WHERE event_id = '00000000-0000-4000-8006-000000000201';
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8006-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8006-000000000201';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8006-000000000201';
  -- Clarifications: exactly the listed ones.
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8006-000000000201' AND NOT (id = ANY (ARRAY['00000000-0000-4000-8006-000000000303', '00000000-0000-4000-8006-000000000304']::uuid[]));
  INSERT INTO public.clarifications AS c (id, event_id, question, permitted_fields, requested_by, requested_at, status, response, responded_by, responded_at, resolved_by, resolved_at)
  VALUES ('00000000-0000-4000-8006-000000000303', '00000000-0000-4000-8006-000000000201', 'Please confirm the expected attendance.', ARRAY['expectedAttendance']::text[], (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-09-25 10:00:00+08', 'resolved', '80 attendees.', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), '2026-09-26 10:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-09-27 10:00:00+08')
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, question = EXCLUDED.question, permitted_fields = EXCLUDED.permitted_fields, requested_by = EXCLUDED.requested_by, requested_at = EXCLUDED.requested_at, status = EXCLUDED.status, response = EXCLUDED.response, responded_by = EXCLUDED.responded_by, responded_at = EXCLUDED.responded_at, resolved_by = EXCLUDED.resolved_by, resolved_at = EXCLUDED.resolved_at
  WHERE (c.event_id, c.question, c.permitted_fields, c.requested_by, c.requested_at, c.status, c.response, c.responded_by, c.responded_at, c.resolved_by, c.resolved_at) IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.question, EXCLUDED.permitted_fields, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.status, EXCLUDED.response, EXCLUDED.responded_by, EXCLUDED.responded_at, EXCLUDED.resolved_by, EXCLUDED.resolved_at);
  INSERT INTO public.clarifications AS c (id, event_id, question, permitted_fields, requested_by, requested_at, status, response, responded_by, responded_at, resolved_by, resolved_at)
  VALUES ('00000000-0000-4000-8006-000000000304', '00000000-0000-4000-8006-000000000201', 'Please confirm the preferred venue.', ARRAY['venue']::text[], (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-09-28 10:00:00+08', 'resolved', 'Central Area, any hall.', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), '2026-09-29 10:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), '2026-09-30 10:00:00+08')
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, question = EXCLUDED.question, permitted_fields = EXCLUDED.permitted_fields, requested_by = EXCLUDED.requested_by, requested_at = EXCLUDED.requested_at, status = EXCLUDED.status, response = EXCLUDED.response, responded_by = EXCLUDED.responded_by, responded_at = EXCLUDED.responded_at, resolved_by = EXCLUDED.resolved_by, resolved_at = EXCLUDED.resolved_at
  WHERE (c.event_id, c.question, c.permitted_fields, c.requested_by, c.requested_at, c.status, c.response, c.responded_by, c.responded_at, c.resolved_by, c.resolved_at) IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.question, EXCLUDED.permitted_fields, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.status, EXCLUDED.response, EXCLUDED.responded_by, EXCLUDED.responded_at, EXCLUDED.resolved_by, EXCLUDED.resolved_at);
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8006-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8006-000000000201')
     IS DISTINCT FROM (SELECT array_agg(row(f.at, f.who, f.fr, f.t)::text ORDER BY f.at) FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8006-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8006-000000000201', f.at, f.who, f.fr, f.t FROM (VALUES
      ('2026-09-18 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-09-20 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status)) f(at, who, fr, t);
  END IF;
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8006-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

COMMIT;

SELECT 'spm6_tc023_setup.sql: setup complete' AS result;
