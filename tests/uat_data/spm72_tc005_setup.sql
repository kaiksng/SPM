-- SPM-72 TC-005: Show "No matching venues" when no venue meets the requirements
-- Acceptance criterion: AC03
-- Login: Event Coordinator (joyce@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): none
-- Source: Logged in as Event Coordinator.
--         No venue has a capacity of 1,000 or more.
--         The event is approved and in Planning stage.
--          - Thu 12 Nov 2026, 10:00–14:00
--          - 1,000 pax
--          - Location: South
--          - Layout: No preference · Facilities: none
-- Records restored: profile joyce@gmail.com; profile jasmine@gmail.com; event "Venue Suggestion Test Event" (id 00000000-0000-4000-8072-000000000201)
-- Must-not-exist conditions enforced: any venue suggested for the 1,000-pax event (checked only; the file stops and names it); other active bookings of these test events (cancelled)
-- Defaults added: Event title "Venue Suggestion Test Event", organiser jasmine@gmail.com, coordinator joyce@gmail.com (agreed in Questions); Venue setup and turnaround 0 min (so the effective window equals the event time)
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Workflow records: status history to the event's status; Lead's coordinator assignment (tom@gmail.com) and the coordinator's approval of the request
-- Run with: pnpm uat:setup spm72_tc005   (from the repo root; see tests/uat_data/README.md)

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

-- Earlier versions of these files used another reserved id range. Remove any test records
-- left under those ids (with their own bookings, flags and history) so they can't clash.
DO $$
DECLARE v_ids uuid[] := ARRAY[
  '00000000-0000-0000-0072-000000000201'
]::uuid[];
BEGIN
  DELETE FROM public.venue_bookings WHERE id = ANY (v_ids);
  DELETE FROM public.events WHERE id = ANY (v_ids);
  DELETE FROM public.venues WHERE id = ANY (v_ids);
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'UAT setup stopped: an old test venue is still used by a non-test booking or event. Nothing was changed.';
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
          1000, '2026-11-12 10:00:00+08', '2026-11-12 14:00:00+08', 'planning',
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

-- Must not exist: other active bookings of this test event (cancelled, not deleted).
UPDATE public.venue_bookings
SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Reset by UAT setup'
WHERE event_id = '00000000-0000-4000-8072-000000000201' AND status IN ('pending', 'approved', 'on_hold')
  AND id <> ALL ('{}'::uuid[]);

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

-- Must not exist: any venue that would be suggested for the 1,000-pax event (other people's venues are
-- never deleted, so the file stops and names them instead).
DO $$
DECLARE v_names text;
BEGIN
  SELECT string_agg(name, ', ') INTO v_names FROM public.find_matching_venues('00000000-0000-4000-8072-000000000201');
  IF v_names IS NOT NULL THEN
    RAISE EXCEPTION 'These venues would be suggested, so "No matching venues" cannot be shown: %', v_names;
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

-- "Venue Suggestion Test Event" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8072-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8072-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8072-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8072-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8072-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8072-000000000201' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8072-000000000201';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8072-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8072-000000000201')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8072-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8072-000000000201', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

COMMIT;

SELECT 'spm72_tc005_setup.sql: setup complete' AS result;
