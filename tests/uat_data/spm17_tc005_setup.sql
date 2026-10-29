-- SPM-17 TC-005: Block direct entry of the Event Details address for a role without access
-- Acceptance criterion: AC2 & AC3
-- Login: Event Organiser (jasmine@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): URL "/events/0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1"
-- Source: An event exists. The signed-in role (Event Organiser) has no access to Event Details that is not access to them
-- Records restored: profile jasmine@gmail.com; profile kenneth@gmail.com; event "Annual Partner Appreciation Dinner" (id 0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1)
-- Must-not-exist conditions enforced: other active bookings of these test events (cancelled)
-- Defaults added: Event title, date (Thu 10 Dec 2026 18:00-21:00), 50 pax, status Requested, organiser kenneth@gmail.com (agreed in Questions)
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Workflow records: status history to the event's status
-- Run with: pnpm uat:setup spm17_tc005   (from the repo root; see tests/uat_data/README.md)

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

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

-- Profile and role for kenneth@gmail.com (Event Organiser). Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'kenneth@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'kenneth@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Kenneth', 'kenneth@gmail.com', 'event_organiser')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

-- Clash guard: id 0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1 comes from the case's Test Data (a URL). Stop if a real event,
-- not organised by a test account, already has it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE id = '0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1'
             AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event already has id 0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1. Nothing was changed.';
  END IF;
END $$;

-- Event "Annual Partner Appreciation Dinner" (fixed id). A status that can't move back to requested (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1';
  IF FOUND AND v_status <> 'requested'
     AND NOT public.event_status_transition_allowed(v_status, 'requested') THEN
    DELETE FROM public.events WHERE id = '0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1', (SELECT id FROM auth.users WHERE lower(email) = 'kenneth@gmail.com'), NULL, 'Annual Partner Appreciation Dinner', 'Private appreciation dinner for partner organisations.',
          50, '2026-12-10 18:00:00+08', '2026-12-10 21:00:00+08', 'requested',
          '2026-10-01 09:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'kenneth@gmail.com'))
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

-- Must not exist: other active bookings of this test event (cancelled, not deleted).
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1' AND status IN ('pending', 'approved', 'on_hold')
  AND id <> ALL ('{}'::uuid[]);

-- Workflow records (valid business state): what the event's status implies, as if it went through the app.
-- "Annual Partner Appreciation Dinner" (Requested): status history Draft -> Requested.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'kenneth@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'kenneth@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '0f3ef1fb-631d-4eaf-8e7c-fe3882cbb1a1', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'kenneth@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'kenneth@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

COMMIT;

SELECT 'spm17_tc005_setup.sql: setup complete' AS result;
