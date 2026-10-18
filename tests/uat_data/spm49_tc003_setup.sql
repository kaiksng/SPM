-- SPM-49 TC-003: Direct entry of an internal planning page's URL is denied
-- Acceptance criterion: AC3
-- Run with: pnpm uat:setup spm49_tc003   (from the repo root; see tests/uat_data/README.md)
-- Login: Attendee (joseph@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: Attendee is signed in. An internal planning details exists for the event.
-- Records restored: profiles joseph, jasmine, joyce; event "Campus Open Day 2026" (id 00000000-0000-0000-0049-000000000201, Planning) with an equipment requirement (id 00000000-0000-0000-0049-000000000501, 1 x Projector: internal planning)
-- Must-not-exist conditions enforced: none
-- Defaults added: Event: organiser jasmine, coordinator joyce, Planning, 12 Dec 2026 10:00-16:00, 300 pax; equipment 1 x Projector
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

-- Profile and role for joseph@gmail.com (Attendee). Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'joseph@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'joseph@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Joseph', 'joseph@gmail.com', 'attendee')
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

-- Event "Campus Open Day 2026" (fixed id), status planning. A status that can't move to planning (e.g. cancelled)
-- is restored by deleting and re-inserting this test event; its own bookings, flags and history go with it.
DO $$
DECLARE v_status public.event_status;
BEGIN
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-0000-0049-000000000201';
  IF FOUND AND v_status <> 'planning'
     AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-0000-0049-000000000201';
  END IF;

  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, description, purpose,
                                   expected_attendance, starts_at, ends_at, status, submitted_at, submitted_by)
  VALUES ('00000000-0000-0000-0049-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Campus Open Day 2026', 'Tour the campus, meet faculty and join taster classes.', 'Conference',
          300, '2026-12-12 10:00:00+08', '2026-12-12 16:00:00+08', 'planning',
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
    VALUES ('00000000-0000-0000-0048-000000000601', 'Projector', 'Visual', 'projector', 0);
  ELSIF v_retired IS NOT NULL THEN
    RAISE EXCEPTION 'Equipment item "Projector" is retired; ask Technical Support to restore it before running this file';
  END IF;
END $$;

-- Equipment requirement: 1 x Projector for "Campus Open Day 2026" (fixed id).
-- Needed for the whole event: 2026-12-12 10:00 to 16:00.
INSERT INTO public.event_equipment_requirements AS r (id, event_id, equipment_item_id, equipment_name, quantity, notes,
                                                     required_from, required_until)
VALUES ('00000000-0000-0000-0049-000000000501', '00000000-0000-0000-0049-000000000201', (SELECT id FROM public.equipment_items WHERE lower(trim(name)) = 'projector'), 'Projector', 1, NULL, '2026-12-12 10:00:00+08', '2026-12-12 16:00:00+08')
ON CONFLICT (id) DO UPDATE
SET equipment_item_id = EXCLUDED.equipment_item_id, quantity = EXCLUDED.quantity, notes = NULL,
    required_from = EXCLUDED.required_from, required_until = EXCLUDED.required_until
WHERE (r.equipment_item_id, r.quantity, r.notes, r.required_from, r.required_until)
      IS DISTINCT FROM (EXCLUDED.equipment_item_id, EXCLUDED.quantity, NULL::text,
                        EXCLUDED.required_from, EXCLUDED.required_until);

COMMIT;
