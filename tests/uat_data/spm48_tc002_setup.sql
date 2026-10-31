-- SPM-48 TC-002: Access to information outside scope is denied
-- Acceptance criterion: AC2
-- Workflow records: status history to the event's status; Lead's coordinator assignment (tom@gmail.com) and the coordinator's approval of the request
-- Run with: pnpm uat:setup spm48_tc002   (from the repo root; see tests/uat_data/README.md)
-- Login: Technical Support Staff (andy@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: Technical Support Staff user is signed in. Internal planning information exists that is outside this role's scope [TBC].
-- Records restored: profiles andy, jasmine, joyce; event "Tech Fair 2026" (id 00000000-0000-4000-8048-000000000201); equipment requirement (id 00000000-0000-4000-8048-000000000501) for 2 x Projector (its event detail page is the out-of-scope information)
-- Must-not-exist conditions enforced: none
-- Defaults added: Event "Tech Fair 2026": organiser jasmine, coordinator joyce, Planning, 10 Dec 2026 13:00-17:00, 150 pax; equipment requirement 2 x Projector (catalogue item)
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';
-- Lets this file set when the coordinator sent the equipment request to Technical Support.
SET LOCAL app.requesting_equipment = 'on';

-- Earlier versions of these files used ids the backend rejects (not valid UUIDs). Remove any test records
-- left under those ids (with their own requests, notifications and history) so they can't clash.
DO $$
DECLARE v_ids uuid[] := ARRAY['00000000-0000-0000-0048-000000000201', '00000000-0000-0000-0048-000000000501', '00000000-0000-0000-0048-000000000601']::uuid[];
BEGIN
  DELETE FROM public.event_equipment_requirements WHERE id = ANY (v_ids);
  DELETE FROM public.events WHERE id = ANY (v_ids);
  DELETE FROM public.equipment_items WHERE id = ANY (v_ids);
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'UAT setup stopped: an old test record is still used by non-test data. Nothing was changed.';
END $$;

-- Profile and role for andy@gmail.com (Technical Support Staff). Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'andy@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Andy', 'andy@gmail.com', 'technical_support_staff')
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

-- Event "Tech Fair 2026" (fixed id), status planning. A status that can't move to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8048-000000000201';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8048-000000000201';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description, purpose,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-4000-8048-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Tech Fair 2026', 'UAT event for SPM-48 technical support access.', 'Product Launch',
          150, '2026-12-10 13:00:00+08', '2026-12-10 17:00:00+08', 'planning',
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

-- Equipment catalogue item "Projector" (seeded by the migrations): found by name, inserted only if missing.
-- An existing item is never changed; the file stops if it was retired (a retired item can't be requested).
DO $$
DECLARE v_item uuid; v_retired timestamptz;
BEGIN
  SELECT id, retired_at INTO v_item, v_retired FROM public.equipment_items WHERE lower(trim(name)) = 'projector';
  IF v_item IS NULL THEN
    INSERT INTO public.equipment_items (id, name, category, code, total_quantity)
    VALUES ('00000000-0000-4000-8048-000000000601', 'Projector', 'Visual', 'projector', 0);
  ELSIF v_retired IS NOT NULL THEN
    RAISE EXCEPTION 'Equipment item "Projector" is retired; ask Technical Support to restore it before running this file';
  END IF;
END $$;

-- Equipment requirement: 2 x Projector for "Tech Fair 2026" (fixed id).
-- Needed for the whole event: 2026-12-10 13:00 to 17:00.
-- Sent to Technical Support by the coordinator on 4 Oct 2026 (equipment only reaches Technical Support once requested).
INSERT INTO public.event_equipment_requirements AS r (id, event_id, equipment_item_id, equipment_name, quantity, notes,
                                                     required_from, required_until, requested_at, requested_by)
VALUES ('00000000-0000-4000-8048-000000000501', '00000000-0000-4000-8048-000000000201', (SELECT id FROM public.equipment_items WHERE lower(trim(name)) = 'projector'), 'Projector', 2, NULL, '2026-12-10 13:00:00+08', '2026-12-10 17:00:00+08',
        '2026-10-04 10:00:00+08', (SELECT assigned_coordinator_id FROM public.events WHERE id = '00000000-0000-4000-8048-000000000201'))
ON CONFLICT (id) DO UPDATE
SET equipment_item_id = EXCLUDED.equipment_item_id, quantity = EXCLUDED.quantity, notes = NULL,
    required_from = EXCLUDED.required_from, required_until = EXCLUDED.required_until,
    requested_at = EXCLUDED.requested_at, requested_by = EXCLUDED.requested_by
WHERE (r.equipment_item_id, r.quantity, r.notes, r.required_from, r.required_until, r.requested_at, r.requested_by)
      IS DISTINCT FROM (EXCLUDED.equipment_item_id, EXCLUDED.quantity, NULL::text,
                        EXCLUDED.required_from, EXCLUDED.required_until, EXCLUDED.requested_at, EXCLUDED.requested_by);

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

-- "Tech Fair 2026" (Planning): status history Draft -> Requested -> Planning, Tom assigned Joyce and Joyce approved the request.
-- Only rows of this test event; each set is rewritten only when it differs from the starting state.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8048-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8048-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com')
                    AND changed_at = '2026-10-02 09:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8048-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8048-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-10-02 09:00:00+08');
  END IF;
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8048-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8048-000000000201' AND decision = 'approved'
                    AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND decided_at = '2026-10-03 09:00:00+08') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8048-000000000201';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8048-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', 'Request is complete; approved for planning.', '2026-10-03 09:00:00+08');
  END IF;
  IF (SELECT coalesce(array_agg(row(h.changed_at, h.changed_by, h.from_status, h.to_status, h.reason)::text ORDER BY h.changed_at), '{}')
      FROM public.event_status_history h WHERE h.event_id = '00000000-0000-4000-8048-000000000201')
     IS DISTINCT FROM
     (SELECT array_agg(row(f.at, f.who, f.fr, f.t, NULL::text)::text ORDER BY f.at)
      FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t)) THEN
    DELETE FROM public.event_status_history WHERE event_id = '00000000-0000-4000-8048-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status)
    SELECT '00000000-0000-4000-8048-000000000201', f.at, f.who, f.fr, f.t
    FROM (VALUES
      ('2026-09-29 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL::public.event_status, 'draft'::public.event_status),
      ('2026-10-01 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), 'draft'::public.event_status, 'requested'::public.event_status),
      ('2026-10-03 09:00:00+08'::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'requested'::public.event_status, 'planning'::public.event_status)) f(at, who, fr, t);
  END IF;
END $$;

COMMIT;
