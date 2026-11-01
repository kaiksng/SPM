-- SPM-39-TC-006: The Lead cannot decide a change request once the event is assigned
-- Acceptance criterion: AC 4
-- Login: Event Coordinator Lead (tom@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): see Test Data
-- Source: refined Preconditions of docs/Project Planning_refined_v2.xlsx
-- Records restored: event "UAT Change Event" (id 00000000-0000-4000-8039-000000000201: planning, organiser jasmine, coordinator joyce, change request pending)
-- Must-not-exist conditions enforced: other clarifications, change requests, notifications, bookings, equipment and history on "UAT Change Event"
-- Defaults added: organiser Jasmine and coordinator Joyce unless the case names others; event times, attendance (100), purpose and descriptions not stated in the case; workflow dates 18 Sep - 6 Oct 2026; test venues UAT Events Hall, UAT Hall, Main Hall, Room 2, UAT Seminar Hall, UAT Turnaround Hall; catalogue items Projector and Wireless microphone are the real ones (never changed)
-- Shared records: cases of a story use the same test events (UAT Expo, UAT Gala, UAT Hall...): test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm39_tc006   (from the repo root)

BEGIN;

-- Lets this file set assigned coordinators and equipment request fields of its own test events.
SET LOCAL app.coordinator_reassignment = 'on';
SET LOCAL app.requesting_equipment = 'on';

-- Profile and role for andy@gmail.com. Auth is only read, never written.
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

-- Profile and role for benny@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'benny@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'benny@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Benny', 'benny@gmail.com', 'technical_support_staff')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
  WHERE p.role IS DISTINCT FROM EXCLUDED.role;
END $$;

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

-- Profile and role for keith@gmail.com. Auth is only read, never written.
DO $$
DECLARE v_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'keith@gmail.com');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Test account % is missing from Supabase Auth; ask the team to create it (this file never creates Auth users)', 'keith@gmail.com';
  END IF;
  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_id, 'Keith', 'keith@gmail.com', 'venue_staff')
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


-- Event "UAT Change Event" (Planning, 2099-01-01 10:00 to 2099-01-01 12:00, id 00000000-0000-4000-8039-000000000201). Stops if a real event has this title.
-- A status that can't move back to Planning is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('UAT Change Event') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'UAT Change Event';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8039-000000000201';
  IF FOUND AND v_status <> 'planning' AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8039-000000000201';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8039-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8039-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'UAT Change Event', 'Meeting', 'UAT event UAT Change Event.', 100,
          ('2099-01-01 10:00:00+08')::timestamptz, ('2099-01-01 12:00:00+08')::timestamptz, 'planning', ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
          NULL, false, false, false, NULL)
  ON CONFLICT (id) DO UPDATE
  SET organiser_id = EXCLUDED.organiser_id, assigned_coordinator_id = EXCLUDED.assigned_coordinator_id, title = EXCLUDED.title,
      purpose = EXCLUDED.purpose, description = EXCLUDED.description, expected_attendance = EXCLUDED.expected_attendance,
      starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, submitted_at = EXCLUDED.submitted_at,
      submitted_by = EXCLUDED.submitted_by, requirements_acknowledged = EXCLUDED.requirements_acknowledged, venue_id = EXCLUDED.venue_id,
      emergency_access_checked = EXCLUDED.emergency_access_checked, restrictions_checked = EXCLUDED.restrictions_checked,
      crowd_movement_checked = EXCLUDED.crowd_movement_checked, equipment_placement_notes = EXCLUDED.equipment_placement_notes
  WHERE (ev.organiser_id, ev.assigned_coordinator_id, ev.title, ev.purpose, ev.description, ev.expected_attendance, ev.starts_at,
         ev.ends_at, ev.status, ev.submitted_at, ev.submitted_by, ev.requirements_acknowledged, ev.venue_id,
         ev.emergency_access_checked, ev.restrictions_checked, ev.crowd_movement_checked, ev.equipment_placement_notes)
        IS DISTINCT FROM (EXCLUDED.organiser_id, EXCLUDED.assigned_coordinator_id, EXCLUDED.title, EXCLUDED.purpose,
                          EXCLUDED.description, EXCLUDED.expected_attendance, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status,
                          EXCLUDED.submitted_at, EXCLUDED.submitted_by, EXCLUDED.requirements_acknowledged, EXCLUDED.venue_id,
                          EXCLUDED.emergency_access_checked, EXCLUDED.restrictions_checked, EXCLUDED.crowd_movement_checked,
                          EXCLUDED.equipment_placement_notes);
  -- Venue requirements: preferred location Central Area, minimum capacity None, layout Theatre, accessibility None.
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity, accessibility_notes, layout_notes)
  VALUES ('00000000-0000-4000-8039-000000000201', 'Central Area', NULL, NULL, 'Theatre')
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly none.
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8039-000000000201' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  -- Registration settings: registration_required=true, attendee_capacity=100, registration_opens_at=('2098-12-01 09:00:00+08')::timestamptz, registration_closes_at=('2098-12-30 18:00:00+08')::timestamptz, waitlist_enabled=false, withdrawal_permitted=true.
  INSERT INTO public.event_registration_requirements AS s (event_id, registration_required, attendee_capacity, registration_opens_at, registration_closes_at, waitlist_enabled, withdrawal_permitted)
  VALUES ('00000000-0000-4000-8039-000000000201', true, 100, ('2098-12-01 09:00:00+08')::timestamptz, ('2098-12-30 18:00:00+08')::timestamptz, false, true)
  ON CONFLICT (event_id) DO UPDATE SET registration_required = EXCLUDED.registration_required, attendee_capacity = EXCLUDED.attendee_capacity, registration_opens_at = EXCLUDED.registration_opens_at, registration_closes_at = EXCLUDED.registration_closes_at, waitlist_enabled = EXCLUDED.waitlist_enabled, withdrawal_permitted = EXCLUDED.withdrawal_permitted
  WHERE (s.registration_required, s.attendee_capacity, s.registration_opens_at, s.registration_closes_at, s.waitlist_enabled, s.withdrawal_permitted) IS DISTINCT FROM (EXCLUDED.registration_required, EXCLUDED.attendee_capacity, EXCLUDED.registration_opens_at, EXCLUDED.registration_closes_at, EXCLUDED.waitlist_enabled, EXCLUDED.withdrawal_permitted);
END $$;
-- Records "UAT Change Event" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8039-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8039-000000000201' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8039-000000000201';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8039-000000000201', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8039-000000000201') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8039-000000000201' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8039-000000000201';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8039-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8039-000000000201' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8039-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8039-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8039-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8039-000000000201') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8039-000000000201';
    
  END IF;
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8039-000000000201';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8039-000000000201';
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8039-000000000201' AND NOT (id = ANY (ARRAY['00000000-0000-4000-8039-000000000301']::uuid[]));
  -- Change request (pending): Move the start time from 10:00 to 14:00.
  INSERT INTO public.event_change_requests AS cr (id, event_id, requested_by, requested_at, requested_changes, reason, status, review_notes, reviewed_by, reviewed_at, withdrawn_at, implemented_by, implemented_at)
  VALUES ('00000000-0000-4000-8039-000000000301', '00000000-0000-4000-8039-000000000201', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), '2026-10-04 10:00:00+08', jsonb_build_object('description', 'Move the start time from 10:00 to 14:00.'), 'Keynote speaker rescheduled.', 'pending', NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, requested_by = EXCLUDED.requested_by, requested_at = EXCLUDED.requested_at, requested_changes = EXCLUDED.requested_changes, reason = EXCLUDED.reason, status = EXCLUDED.status, review_notes = EXCLUDED.review_notes, reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at, withdrawn_at = EXCLUDED.withdrawn_at, implemented_by = EXCLUDED.implemented_by, implemented_at = EXCLUDED.implemented_at
  WHERE (cr.event_id, cr.requested_by, cr.requested_at, cr.requested_changes, cr.reason, cr.status, cr.review_notes, cr.reviewed_by, cr.reviewed_at, cr.withdrawn_at, cr.implemented_by, cr.implemented_at) IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.requested_changes, EXCLUDED.reason, EXCLUDED.status, EXCLUDED.review_notes, EXCLUDED.reviewed_by, EXCLUDED.reviewed_at, EXCLUDED.withdrawn_at, EXCLUDED.implemented_by, EXCLUDED.implemented_at);
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8039-000000000201') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8039-000000000201'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8039-000000000201'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8039-000000000201'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8039-000000000201';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8039-000000000201'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8039-000000000201'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8039-000000000201'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8039-000000000201') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8039-000000000201';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8039-000000000201') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8039-000000000201';
    
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8039-000000000201' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8039-000000000201' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

COMMIT;

SELECT 'spm39_tc006_setup.sql: setup complete' AS result;
