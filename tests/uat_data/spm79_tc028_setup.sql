-- SPM-79-TC-028: Events display each of the eight supported status names
-- Acceptance criterion: AC 1
-- Login: Event Coordinator Lead (tom@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): see Test Data
-- Source: refined Preconditions of docs/Project UAT kk_sher_refined.xlsx
-- Records restored: venue Peony Hall; event "Lantern Festival" (id 00000000-0000-4000-8079-000000000217: draft, organiser jasmine, coordinator none); event "Startup Clinic" (id 00000000-0000-4000-8079-000000000218: requested, organiser jasmine, coordinator none); event "Robotics Week" (id 00000000-0000-4000-8079-000000000219: planning, organiser jasmine, coordinator joyce); event "Bouldering Session" (id 00000000-0000-4000-8079-000000000220: pending safety check, organiser jasmine, coordinator joyce, bookings: Peony Hall approved); event "Prize Giving Dinner" (id 00000000-0000-4000-8079-000000000221: confirmed, organiser jasmine, coordinator joyce, bookings: Peony Hall approved); event "Orientation Day" (id 00000000-0000-4000-8079-000000000222: completed, organiser jasmine, coordinator joyce, bookings: Peony Hall approved); event "Archery Taster" (id 00000000-0000-4000-8079-000000000223: rejected, organiser jasmine, coordinator joyce); event "Quiz Night" (id 00000000-0000-4000-8079-000000000224: cancelled, organiser jasmine, coordinator joyce)
-- Must-not-exist conditions enforced: other UAT test events' venue requests overlapping this case's events at its test venues; other bookings, equipment, change requests, notifications and history on "Lantern Festival"; other bookings, equipment, change requests, notifications and history on "Startup Clinic"; other bookings, equipment, change requests, notifications and history on "Robotics Week"; other bookings, equipment, change requests, notifications and history on "Bouldering Session"; other bookings, equipment, change requests, notifications and history on "Prize Giving Dinner"; other bookings, equipment, change requests, notifications and history on "Orientation Day"; other bookings, equipment, change requests, notifications and history on "Archery Taster"; other bookings, equipment, change requests, notifications and history on "Quiz Night"
-- Defaults added: organiser Jasmine and coordinator Joyce unless the case names others; purpose, descriptions, attendance (100) and times not stated in the case; workflow dates 18 Sep - 9 Oct 2026; events that have already ended are dated 15 Oct 2026; test venues open all day unless stated
-- Shared records: cases of a story share its test events and venues: test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm79_tc028   (from the repo root)

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

-- Profile and role for kenneth@gmail.com. Auth is only read, never written.
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


-- A Completed event's arrangements are locked by the app; its own completion process sets this flag to
-- write them. This file sets it only inside this transaction, to restore this test event's records.
SET LOCAL spm.releasing_ended_event = 'on';

-- Venue "Peony Hall" (Central Area, 300 pax, open Mon/Tue/Wed/Thu/Fri/Sat/Sun 00:00-23:59, setup 0 min, turnaround 0 min, layouts none, facilities none, accessibility none; id 00000000-0000-4000-8079-000000000101).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues WHERE lower(name) = lower('Peony Hall') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "%" exists. Nothing was changed.', 'Peony Hall';
  END IF;
  INSERT INTO public.venues AS ve (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes, accessibility_notes, description)
  VALUES ('00000000-0000-4000-8079-000000000101', 'Peony Hall', 'Central Area', ARRAY['Central Area'], 300, '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "00:00", "closesAt": "23:59"}]'::jsonb, 0, 0, NULL, 'UAT test venue Peony Hall.')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location, area_tags = EXCLUDED.area_tags, capacity = EXCLUDED.capacity, operating_hours = EXCLUDED.operating_hours, setup_time_minutes = EXCLUDED.setup_time_minutes, turnaround_time_minutes = EXCLUDED.turnaround_time_minutes, accessibility_notes = EXCLUDED.accessibility_notes, description = EXCLUDED.description
  WHERE (ve.name, ve.location, ve.area_tags, ve.capacity, ve.operating_hours, ve.setup_time_minutes, ve.turnaround_time_minutes, ve.accessibility_notes, ve.description) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.location, EXCLUDED.area_tags, EXCLUDED.capacity, EXCLUDED.operating_hours, EXCLUDED.setup_time_minutes, EXCLUDED.turnaround_time_minutes, EXCLUDED.accessibility_notes, EXCLUDED.description);
  -- Facilities and layouts: exactly the listed ones.
  DELETE FROM public.venue_facilities WHERE venue_id = '00000000-0000-4000-8079-000000000101' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.venue_layouts WHERE venue_id = '00000000-0000-4000-8079-000000000101' AND NOT (layout_name::text = ANY (ARRAY[]::text[]));
END $$;

-- Blocks are put back after the bookings below (a booking can't be restored over an active block).
UPDATE public.venue_unavailability SET removed_at = now()
WHERE venue_id = ANY (ARRAY['00000000-0000-4000-8079-000000000101']::uuid[]) AND removed_at IS NULL;

-- Venue requests left by an earlier run or another case: other UAT test events' requests at this case's test venues that
-- overlap its event times, and this case's own stale requests, are released so they can't block or distort it.
UPDATE public.venue_bookings b SET status = 'cancelled', cancelled_at = now()
FROM public.events x
WHERE x.id = b.event_id AND x.status <> 'completed' AND b.status IN ('pending', 'approved', 'on_hold')
  AND (b.event_id::text LIKE '00000000-0000-4000-80%' OR b.event_id::text LIKE '00000000-0000-0000-00%') AND NOT (b.id = ANY (ARRAY['00000000-0000-4000-8079-000000000410', '00000000-0000-4000-8079-000000000411', '00000000-0000-4000-8079-000000000412']::uuid[]))
  AND (b.event_id = ANY (ARRAY['00000000-0000-4000-8079-000000000217', '00000000-0000-4000-8079-000000000218', '00000000-0000-4000-8079-000000000219', '00000000-0000-4000-8079-000000000220', '00000000-0000-4000-8079-000000000221', '00000000-0000-4000-8079-000000000222', '00000000-0000-4000-8079-000000000223', '00000000-0000-4000-8079-000000000224']::uuid[])
       OR (b.venue_id = ANY (ARRAY['00000000-0000-4000-8079-000000000101']::uuid[]) AND (tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 16:00:00+08')::timestamptz, ('2027-06-02 18:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2026-10-12 10:00:00+08')::timestamptz, ('2026-10-12 12:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 13:00:00+08')::timestamptz, ('2027-06-02 15:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2027-06-02 16:00:00+08')::timestamptz, ('2027-06-02 18:00:00+08')::timestamptz) OR tstzrange(b.starts_at, b.ends_at) && tstzrange(('2026-10-12 10:00:00+08')::timestamptz, ('2026-10-12 12:00:00+08')::timestamptz))));

-- Event "Lantern Festival" (Draft, 2027-06-02 10:00 to 2027-06-02 12:00, id 00000000-0000-4000-8079-000000000217). Stops if a real event has this title.
-- A status that can't move back to Draft is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Lantern Festival') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Lantern Festival';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8079-000000000217';
  IF FOUND AND v_status <> 'draft' AND NOT public.event_status_transition_allowed(v_status, 'draft') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8079-000000000217';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8079-000000000217' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8079-000000000217', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL, 'Lantern Festival', 'Meeting', 'UAT event Lantern Festival.', 100,
          ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, 'draft', NULL, NULL, false,
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
  -- Venue requirements: preferred location Central Area, minimum capacity None, layout None, accessibility None.
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity, accessibility_notes, layout_notes)
  VALUES ('00000000-0000-4000-8079-000000000217', 'Central Area', NULL, NULL, NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly none.
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8079-000000000217' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8079-000000000217';
END $$;
-- Records "Lantern Festival" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000217';
  DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000217';
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8079-000000000217' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Only one main venue at a time: clear the flag on this case's non-main bookings before the main one is restored.
  UPDATE public.venue_bookings SET is_main_venue = false
  WHERE event_id = '00000000-0000-4000-8079-000000000217' AND is_main_venue AND id = ANY (ARRAY[]::uuid[]);
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8079-000000000217' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000217' AND NOT (id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000217' AND NOT (id = ANY (ARRAY[]::uuid[]));
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000217') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000217';
    
  END IF;
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8079-000000000217';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8079-000000000217';
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8079-000000000217' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000217') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8079-000000000217'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000217';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8079-000000000217'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000217') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000217';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000217') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000217';
    
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8079-000000000217' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8079-000000000217' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

-- Event "Startup Clinic" (Requested, 2027-06-02 10:00 to 2027-06-02 12:00, id 00000000-0000-4000-8079-000000000218). Stops if a real event has this title.
-- A status that can't move back to Requested is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Startup Clinic') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Startup Clinic';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8079-000000000218';
  IF FOUND AND v_status <> 'requested' AND NOT public.event_status_transition_allowed(v_status, 'requested') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8079-000000000218';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8079-000000000218' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8079-000000000218', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), NULL, 'Startup Clinic', 'Meeting', 'UAT event Startup Clinic.', 100,
          ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, 'requested', ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
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
  -- Venue requirements: preferred location Central Area, minimum capacity None, layout None, accessibility None.
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity, accessibility_notes, layout_notes)
  VALUES ('00000000-0000-4000-8079-000000000218', 'Central Area', NULL, NULL, NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly none.
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8079-000000000218' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8079-000000000218';
END $$;
-- Records "Startup Clinic" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000218';
  DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000218';
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8079-000000000218' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Only one main venue at a time: clear the flag on this case's non-main bookings before the main one is restored.
  UPDATE public.venue_bookings SET is_main_venue = false
  WHERE event_id = '00000000-0000-4000-8079-000000000218' AND is_main_venue AND id = ANY (ARRAY[]::uuid[]);
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8079-000000000218' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000218' AND NOT (id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000218' AND NOT (id = ANY (ARRAY[]::uuid[]));
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000218') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000218';
    
  END IF;
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8079-000000000218';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8079-000000000218';
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8079-000000000218' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000218') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8079-000000000218'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000218'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000218';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8079-000000000218'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000218'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000218') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000218';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000218') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000218';
    
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8079-000000000218' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8079-000000000218' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

-- Event "Robotics Week" (Planning, 2027-06-02 10:00 to 2027-06-02 12:00, id 00000000-0000-4000-8079-000000000219). Stops if a real event has this title.
-- A status that can't move back to Planning is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Robotics Week') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Robotics Week';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8079-000000000219';
  IF FOUND AND v_status <> 'planning' AND NOT public.event_status_transition_allowed(v_status, 'planning') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8079-000000000219';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8079-000000000219' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8079-000000000219', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Robotics Week', 'Meeting', 'UAT event Robotics Week.', 100,
          ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, 'planning', ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
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
  -- Venue requirements: preferred location Central Area, minimum capacity None, layout None, accessibility None.
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity, accessibility_notes, layout_notes)
  VALUES ('00000000-0000-4000-8079-000000000219', 'Central Area', NULL, NULL, NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly none.
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8079-000000000219' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8079-000000000219';
END $$;
-- Records "Robotics Week" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000219') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000219' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000219';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8079-000000000219', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000219') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000219' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000219';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8079-000000000219', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8079-000000000219' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Only one main venue at a time: clear the flag on this case's non-main bookings before the main one is restored.
  UPDATE public.venue_bookings SET is_main_venue = false
  WHERE event_id = '00000000-0000-4000-8079-000000000219' AND is_main_venue AND id = ANY (ARRAY[]::uuid[]);
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8079-000000000219' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000219' AND NOT (id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000219' AND NOT (id = ANY (ARRAY[]::uuid[]));
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000219') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000219';
    
  END IF;
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8079-000000000219';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8079-000000000219';
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8079-000000000219' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000219') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8079-000000000219'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000219'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8079-000000000219'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000219';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8079-000000000219'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000219'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8079-000000000219'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000219') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000219';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000219') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000219';
    
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8079-000000000219' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8079-000000000219' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

-- Event "Bouldering Session" (Pending Safety Check, 2027-06-02 10:00 to 2027-06-02 12:00, id 00000000-0000-4000-8079-000000000220). Stops if a real event has this title.
-- A status that can't move back to Pending Safety Check is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Bouldering Session') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Bouldering Session';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8079-000000000220';
  IF FOUND AND v_status <> 'pending_safety_check' AND NOT public.event_status_transition_allowed(v_status, 'pending_safety_check') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8079-000000000220';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8079-000000000220' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8079-000000000220', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Bouldering Session', 'Meeting', 'UAT event Bouldering Session.', 100,
          ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, 'pending_safety_check', ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
          '00000000-0000-4000-8079-000000000101', true, true, true, NULL)
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
  -- Venue requirements: preferred location Central Area, minimum capacity None, layout None, accessibility None.
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity, accessibility_notes, layout_notes)
  VALUES ('00000000-0000-4000-8079-000000000220', 'Central Area', NULL, NULL, NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly none.
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8079-000000000220' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8079-000000000220';
END $$;
-- Records "Bouldering Session" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000220') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000220' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000220';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8079-000000000220', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000220') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000220' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000220';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8079-000000000220', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8079-000000000220' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY['00000000-0000-4000-8079-000000000410']::uuid[]));
  -- Only one main venue at a time: clear the flag on this case's non-main bookings before the main one is restored.
  UPDATE public.venue_bookings SET is_main_venue = false
  WHERE event_id = '00000000-0000-4000-8079-000000000220' AND is_main_venue AND id = ANY (ARRAY[]::uuid[]);
  -- Approved booking at "Peony Hall" 2027-06-02 13:00 to 2027-06-02 15:00 (requested by joyce, decided by daryl).
  IF EXISTS (SELECT 1 FROM public.venue_bookings WHERE venue_id = '00000000-0000-4000-8079-000000000101' AND status IN ('pending', 'approved', 'on_hold')
             AND NOT (event_id::text LIKE '00000000-0000-4000-80%' OR event_id::text LIKE '00000000-0000-0000-00%') AND tstzrange(starts_at, ends_at) && tstzrange(('2027-06-02 13:00:00+08')::timestamptz, ('2027-06-02 15:00:00+08')::timestamptz)) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real booking holds "Peony Hall" at the time of "Bouldering Session". Nothing was changed.';
  END IF;
  INSERT INTO public.venue_bookings AS vb (id, event_id, venue_id, starts_at, ends_at, status, is_main_venue, label, expected_headcount, layout_notes, accessibility_notes, required_facilities, requested_by, requested_at, decided_by, decided_at, decision_notes, held_by, expires_at, cancelled_at, cancelled_by, cancellation_reason, needs_review, needs_review_reason, replaces_booking_id, advisory_notes)
  VALUES ('00000000-0000-4000-8079-000000000410', '00000000-0000-4000-8079-000000000220', '00000000-0000-4000-8079-000000000101', ('2027-06-02 13:00:00+08')::timestamptz, ('2027-06-02 15:00:00+08')::timestamptz, 'approved', true, 'Main Programme', 100, NULL, NULL, ARRAY[]::text[], (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), ('2026-09-23 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), '2026-09-24 10:00:00+08', NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, is_main_venue = EXCLUDED.is_main_venue, label = EXCLUDED.label, expected_headcount = EXCLUDED.expected_headcount, layout_notes = EXCLUDED.layout_notes, accessibility_notes = EXCLUDED.accessibility_notes, required_facilities = EXCLUDED.required_facilities, requested_by = EXCLUDED.requested_by, requested_at = EXCLUDED.requested_at, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at, decision_notes = EXCLUDED.decision_notes, held_by = EXCLUDED.held_by, expires_at = EXCLUDED.expires_at, cancelled_at = EXCLUDED.cancelled_at, cancelled_by = EXCLUDED.cancelled_by, cancellation_reason = EXCLUDED.cancellation_reason, needs_review = EXCLUDED.needs_review, needs_review_reason = EXCLUDED.needs_review_reason, replaces_booking_id = EXCLUDED.replaces_booking_id, advisory_notes = EXCLUDED.advisory_notes
  WHERE (vb.event_id, vb.venue_id, vb.starts_at, vb.ends_at, vb.status, vb.is_main_venue, vb.label, vb.expected_headcount, vb.layout_notes, vb.accessibility_notes, vb.required_facilities, vb.requested_by, vb.requested_at, vb.decided_by, vb.decided_at, vb.decision_notes, vb.held_by, vb.expires_at, vb.cancelled_at, vb.cancelled_by, vb.cancellation_reason, vb.needs_review, vb.needs_review_reason, vb.replaces_booking_id, vb.advisory_notes) IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.is_main_venue, EXCLUDED.label, EXCLUDED.expected_headcount, EXCLUDED.layout_notes, EXCLUDED.accessibility_notes, EXCLUDED.required_facilities, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.decided_by, EXCLUDED.decided_at, EXCLUDED.decision_notes, EXCLUDED.held_by, EXCLUDED.expires_at, EXCLUDED.cancelled_at, EXCLUDED.cancelled_by, EXCLUDED.cancellation_reason, EXCLUDED.needs_review, EXCLUDED.needs_review_reason, EXCLUDED.replaces_booking_id, EXCLUDED.advisory_notes);
  DELETE FROM public.venue_booking_conflicts WHERE booking_id = '00000000-0000-4000-8079-000000000410';
  DELETE FROM public.venue_booking_disruptions WHERE booking_id = '00000000-0000-4000-8079-000000000410';
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8079-000000000220' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000220' AND NOT (id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000220' AND NOT (id = ANY (ARRAY[]::uuid[]));
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000220') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000220';
    
  END IF;
  -- Safety check: 1 submission(s).
  IF (SELECT count(*) FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8079-000000000220') <> 1
     OR (SELECT count(*) FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8079-000000000220') <> 0
     OR NOT (EXISTS (SELECT 1 FROM public.event_safety_check_submissions s WHERE s.event_id = '00000000-0000-4000-8079-000000000220' AND s.round = 1 AND s.submitted_at = ('2026-10-01 10:00:00+08')::timestamptz AND s.coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'))) THEN
    DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8079-000000000220';
    DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8079-000000000220';
    INSERT INTO public.event_safety_check_submissions (event_id, coordinator_id, round, venues_snapshot, period_snapshot,
                                                       attendance_snapshot, equipment_snapshot, submitted_at)
    VALUES ('00000000-0000-4000-8079-000000000220', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 1, jsonb_build_array(jsonb_build_object('bookingId', '00000000-0000-4000-8079-000000000410', 'venueName', 'Peony Hall', 'isMainVenue', true, 'status', 'complete', 'needsReviewReason', NULL)), jsonb_build_object('startsAt', ('2027-06-02 10:00:00+08')::timestamptz, 'endsAt', ('2027-06-02 12:00:00+08')::timestamptz),
            100, '[]'::jsonb, ('2026-10-01 10:00:00+08')::timestamptz)
    RETURNING id INTO v_sub;
  END IF;
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8079-000000000220' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000220') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8079-000000000220'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000220'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8079-000000000220'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status),
      ('00000000-0000-4000-8079-000000000220'::uuid, ('2026-10-01 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'planning'::public.event_status, 'pending_safety_check'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000220';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8079-000000000220'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000220'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8079-000000000220'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status),
      ('00000000-0000-4000-8079-000000000220'::uuid, ('2026-10-01 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'planning'::public.event_status, 'pending_safety_check'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000220') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000220';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000220') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000220';
    
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8079-000000000220' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8079-000000000220' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

-- Event "Prize Giving Dinner" (Confirmed, 2027-06-02 16:00 to 2027-06-02 18:00, id 00000000-0000-4000-8079-000000000221). Stops if a real event has this title.
-- A status that can't move back to Confirmed is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Prize Giving Dinner') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Prize Giving Dinner';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8079-000000000221';
  IF FOUND AND v_status <> 'confirmed' AND NOT public.event_status_transition_allowed(v_status, 'confirmed') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8079-000000000221';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8079-000000000221' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8079-000000000221', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Prize Giving Dinner', 'Meeting', 'UAT event Prize Giving Dinner.', 100,
          ('2027-06-02 16:00:00+08')::timestamptz, ('2027-06-02 18:00:00+08')::timestamptz, 'confirmed', ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
          '00000000-0000-4000-8079-000000000101', true, true, true, NULL)
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
  -- Venue requirements: preferred location Central Area, minimum capacity None, layout None, accessibility None.
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity, accessibility_notes, layout_notes)
  VALUES ('00000000-0000-4000-8079-000000000221', 'Central Area', NULL, NULL, NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly none.
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8079-000000000221' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8079-000000000221';
END $$;
-- Records "Prize Giving Dinner" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000221') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000221' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000221';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8079-000000000221', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000221') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000221' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000221';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8079-000000000221', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8079-000000000221' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY['00000000-0000-4000-8079-000000000411']::uuid[]));
  -- Only one main venue at a time: clear the flag on this case's non-main bookings before the main one is restored.
  UPDATE public.venue_bookings SET is_main_venue = false
  WHERE event_id = '00000000-0000-4000-8079-000000000221' AND is_main_venue AND id = ANY (ARRAY[]::uuid[]);
  -- Approved booking at "Peony Hall" 2027-06-02 16:00 to 2027-06-02 18:00 (requested by joyce, decided by daryl).
  IF EXISTS (SELECT 1 FROM public.venue_bookings WHERE venue_id = '00000000-0000-4000-8079-000000000101' AND status IN ('pending', 'approved', 'on_hold')
             AND NOT (event_id::text LIKE '00000000-0000-4000-80%' OR event_id::text LIKE '00000000-0000-0000-00%') AND tstzrange(starts_at, ends_at) && tstzrange(('2027-06-02 16:00:00+08')::timestamptz, ('2027-06-02 18:00:00+08')::timestamptz)) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real booking holds "Peony Hall" at the time of "Prize Giving Dinner". Nothing was changed.';
  END IF;
  INSERT INTO public.venue_bookings AS vb (id, event_id, venue_id, starts_at, ends_at, status, is_main_venue, label, expected_headcount, layout_notes, accessibility_notes, required_facilities, requested_by, requested_at, decided_by, decided_at, decision_notes, held_by, expires_at, cancelled_at, cancelled_by, cancellation_reason, needs_review, needs_review_reason, replaces_booking_id, advisory_notes)
  VALUES ('00000000-0000-4000-8079-000000000411', '00000000-0000-4000-8079-000000000221', '00000000-0000-4000-8079-000000000101', ('2027-06-02 16:00:00+08')::timestamptz, ('2027-06-02 18:00:00+08')::timestamptz, 'approved', true, 'Main Programme', 100, NULL, NULL, ARRAY[]::text[], (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), ('2026-09-23 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), '2026-09-24 10:00:00+08', NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, is_main_venue = EXCLUDED.is_main_venue, label = EXCLUDED.label, expected_headcount = EXCLUDED.expected_headcount, layout_notes = EXCLUDED.layout_notes, accessibility_notes = EXCLUDED.accessibility_notes, required_facilities = EXCLUDED.required_facilities, requested_by = EXCLUDED.requested_by, requested_at = EXCLUDED.requested_at, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at, decision_notes = EXCLUDED.decision_notes, held_by = EXCLUDED.held_by, expires_at = EXCLUDED.expires_at, cancelled_at = EXCLUDED.cancelled_at, cancelled_by = EXCLUDED.cancelled_by, cancellation_reason = EXCLUDED.cancellation_reason, needs_review = EXCLUDED.needs_review, needs_review_reason = EXCLUDED.needs_review_reason, replaces_booking_id = EXCLUDED.replaces_booking_id, advisory_notes = EXCLUDED.advisory_notes
  WHERE (vb.event_id, vb.venue_id, vb.starts_at, vb.ends_at, vb.status, vb.is_main_venue, vb.label, vb.expected_headcount, vb.layout_notes, vb.accessibility_notes, vb.required_facilities, vb.requested_by, vb.requested_at, vb.decided_by, vb.decided_at, vb.decision_notes, vb.held_by, vb.expires_at, vb.cancelled_at, vb.cancelled_by, vb.cancellation_reason, vb.needs_review, vb.needs_review_reason, vb.replaces_booking_id, vb.advisory_notes) IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.is_main_venue, EXCLUDED.label, EXCLUDED.expected_headcount, EXCLUDED.layout_notes, EXCLUDED.accessibility_notes, EXCLUDED.required_facilities, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.decided_by, EXCLUDED.decided_at, EXCLUDED.decision_notes, EXCLUDED.held_by, EXCLUDED.expires_at, EXCLUDED.cancelled_at, EXCLUDED.cancelled_by, EXCLUDED.cancellation_reason, EXCLUDED.needs_review, EXCLUDED.needs_review_reason, EXCLUDED.replaces_booking_id, EXCLUDED.advisory_notes);
  DELETE FROM public.venue_booking_conflicts WHERE booking_id = '00000000-0000-4000-8079-000000000411';
  DELETE FROM public.venue_booking_disruptions WHERE booking_id = '00000000-0000-4000-8079-000000000411';
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8079-000000000221' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000221' AND NOT (id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000221' AND NOT (id = ANY (ARRAY[]::uuid[]));
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000221') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000221';
    
  END IF;
  -- Safety check: 1 submission(s), decided by Sally.
  IF (SELECT count(*) FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8079-000000000221') <> 1
     OR (SELECT count(*) FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8079-000000000221') <> 1
     OR NOT (EXISTS (SELECT 1 FROM public.event_safety_check_submissions s WHERE s.event_id = '00000000-0000-4000-8079-000000000221' AND s.round = 1 AND s.submitted_at = ('2026-10-01 10:00:00+08')::timestamptz AND s.coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')) AND EXISTS (SELECT 1 FROM public.event_safety_check_decisions x WHERE x.event_id = '00000000-0000-4000-8079-000000000221' AND x.outcome = 'approved' AND x.decided_at = ('2026-10-02 10:00:00+08')::timestamptz)) THEN
    DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8079-000000000221';
    DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8079-000000000221';
    INSERT INTO public.event_safety_check_submissions (event_id, coordinator_id, round, venues_snapshot, period_snapshot,
                                                       attendance_snapshot, equipment_snapshot, submitted_at)
    VALUES ('00000000-0000-4000-8079-000000000221', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 1, jsonb_build_array(jsonb_build_object('bookingId', '00000000-0000-4000-8079-000000000411', 'venueName', 'Peony Hall', 'isMainVenue', true, 'status', 'complete', 'needsReviewReason', NULL)), jsonb_build_object('startsAt', ('2027-06-02 16:00:00+08')::timestamptz, 'endsAt', ('2027-06-02 18:00:00+08')::timestamptz),
            100, '[]'::jsonb, ('2026-10-01 10:00:00+08')::timestamptz)
    RETURNING id INTO v_sub;
    INSERT INTO public.event_safety_check_decisions (event_id, submission_id, decided_by, outcome, reason, decided_at)
    VALUES ('00000000-0000-4000-8079-000000000221', v_sub, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com'), 'approved', NULL, ('2026-10-02 10:00:00+08')::timestamptz);
  END IF;
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8079-000000000221' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000221') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8079-000000000221'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000221'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8079-000000000221'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status),
      ('00000000-0000-4000-8079-000000000221'::uuid, ('2026-10-01 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'planning'::public.event_status, 'pending_safety_check'::public.event_status),
      ('00000000-0000-4000-8079-000000000221'::uuid, ('2026-10-02 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com')::uuid, 'pending_safety_check'::public.event_status, 'confirmed'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000221';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8079-000000000221'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000221'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8079-000000000221'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status),
      ('00000000-0000-4000-8079-000000000221'::uuid, ('2026-10-01 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'planning'::public.event_status, 'pending_safety_check'::public.event_status),
      ('00000000-0000-4000-8079-000000000221'::uuid, ('2026-10-02 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com')::uuid, 'pending_safety_check'::public.event_status, 'confirmed'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000221') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000221';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000221') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000221';
    
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8079-000000000221' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8079-000000000221' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

-- Event "Orientation Day" (Completed, 2026-10-12 10:00 to 2026-10-12 12:00, id 00000000-0000-4000-8079-000000000222). Stops if a real event has this title.
-- A status that can't move back to Completed is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Orientation Day') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Orientation Day';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8079-000000000222';
  IF FOUND AND v_status <> 'completed' AND NOT public.event_status_transition_allowed(v_status, 'completed') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8079-000000000222';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8079-000000000222' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8079-000000000222', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Orientation Day', 'Meeting', 'UAT event Orientation Day.', 100,
          ('2026-10-12 10:00:00+08')::timestamptz, ('2026-10-12 12:00:00+08')::timestamptz, 'completed', ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
          '00000000-0000-4000-8079-000000000101', true, true, true, NULL)
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
  -- Venue requirements: preferred location Central Area, minimum capacity None, layout None, accessibility None.
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity, accessibility_notes, layout_notes)
  VALUES ('00000000-0000-4000-8079-000000000222', 'Central Area', NULL, NULL, NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly none.
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8079-000000000222' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8079-000000000222';
END $$;
-- Records "Orientation Day" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Moving the event to Completed runs the app's own release, which switches this flag off when it ends; switch it
  -- back on (this transaction only) to restore this test event's records.
  PERFORM set_config('spm.releasing_ended_event', 'on', true);
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000222') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000222' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000222';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8079-000000000222', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000222') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000222' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000222';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8079-000000000222', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8079-000000000222' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY['00000000-0000-4000-8079-000000000412']::uuid[]));
  -- Only one main venue at a time: clear the flag on this case's non-main bookings before the main one is restored.
  UPDATE public.venue_bookings SET is_main_venue = false
  WHERE event_id = '00000000-0000-4000-8079-000000000222' AND is_main_venue AND id = ANY (ARRAY[]::uuid[]);
  -- Approved booking at "Peony Hall" 2026-10-12 10:00 to 2026-10-12 12:00 (requested by joyce, decided by daryl).
  IF EXISTS (SELECT 1 FROM public.venue_bookings WHERE venue_id = '00000000-0000-4000-8079-000000000101' AND status IN ('pending', 'approved', 'on_hold')
             AND NOT (event_id::text LIKE '00000000-0000-4000-80%' OR event_id::text LIKE '00000000-0000-0000-00%') AND tstzrange(starts_at, ends_at) && tstzrange(('2026-10-12 10:00:00+08')::timestamptz, ('2026-10-12 12:00:00+08')::timestamptz)) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real booking holds "Peony Hall" at the time of "Orientation Day". Nothing was changed.';
  END IF;
  INSERT INTO public.venue_bookings AS vb (id, event_id, venue_id, starts_at, ends_at, status, is_main_venue, label, expected_headcount, layout_notes, accessibility_notes, required_facilities, requested_by, requested_at, decided_by, decided_at, decision_notes, held_by, expires_at, cancelled_at, cancelled_by, cancellation_reason, needs_review, needs_review_reason, replaces_booking_id, advisory_notes)
  VALUES ('00000000-0000-4000-8079-000000000412', '00000000-0000-4000-8079-000000000222', '00000000-0000-4000-8079-000000000101', ('2026-10-12 10:00:00+08')::timestamptz, ('2026-10-12 12:00:00+08')::timestamptz, 'approved', true, 'Main Programme', 100, NULL, NULL, ARRAY[]::text[], (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), ('2026-09-23 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'daryl@gmail.com'), '2026-09-24 10:00:00+08', NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, venue_id = EXCLUDED.venue_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, is_main_venue = EXCLUDED.is_main_venue, label = EXCLUDED.label, expected_headcount = EXCLUDED.expected_headcount, layout_notes = EXCLUDED.layout_notes, accessibility_notes = EXCLUDED.accessibility_notes, required_facilities = EXCLUDED.required_facilities, requested_by = EXCLUDED.requested_by, requested_at = EXCLUDED.requested_at, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at, decision_notes = EXCLUDED.decision_notes, held_by = EXCLUDED.held_by, expires_at = EXCLUDED.expires_at, cancelled_at = EXCLUDED.cancelled_at, cancelled_by = EXCLUDED.cancelled_by, cancellation_reason = EXCLUDED.cancellation_reason, needs_review = EXCLUDED.needs_review, needs_review_reason = EXCLUDED.needs_review_reason, replaces_booking_id = EXCLUDED.replaces_booking_id, advisory_notes = EXCLUDED.advisory_notes
  WHERE (vb.event_id, vb.venue_id, vb.starts_at, vb.ends_at, vb.status, vb.is_main_venue, vb.label, vb.expected_headcount, vb.layout_notes, vb.accessibility_notes, vb.required_facilities, vb.requested_by, vb.requested_at, vb.decided_by, vb.decided_at, vb.decision_notes, vb.held_by, vb.expires_at, vb.cancelled_at, vb.cancelled_by, vb.cancellation_reason, vb.needs_review, vb.needs_review_reason, vb.replaces_booking_id, vb.advisory_notes) IS DISTINCT FROM (EXCLUDED.event_id, EXCLUDED.venue_id, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.status, EXCLUDED.is_main_venue, EXCLUDED.label, EXCLUDED.expected_headcount, EXCLUDED.layout_notes, EXCLUDED.accessibility_notes, EXCLUDED.required_facilities, EXCLUDED.requested_by, EXCLUDED.requested_at, EXCLUDED.decided_by, EXCLUDED.decided_at, EXCLUDED.decision_notes, EXCLUDED.held_by, EXCLUDED.expires_at, EXCLUDED.cancelled_at, EXCLUDED.cancelled_by, EXCLUDED.cancellation_reason, EXCLUDED.needs_review, EXCLUDED.needs_review_reason, EXCLUDED.replaces_booking_id, EXCLUDED.advisory_notes);
  DELETE FROM public.venue_booking_conflicts WHERE booking_id = '00000000-0000-4000-8079-000000000412';
  DELETE FROM public.venue_booking_disruptions WHERE booking_id = '00000000-0000-4000-8079-000000000412';
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8079-000000000222' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000222' AND NOT (id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000222' AND NOT (id = ANY (ARRAY[]::uuid[]));
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000222') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000222';
    
  END IF;
  -- Safety check: 1 submission(s), decided by Sally.
  IF (SELECT count(*) FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8079-000000000222') <> 1
     OR (SELECT count(*) FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8079-000000000222') <> 1
     OR NOT (EXISTS (SELECT 1 FROM public.event_safety_check_submissions s WHERE s.event_id = '00000000-0000-4000-8079-000000000222' AND s.round = 1 AND s.submitted_at = ('2026-10-01 10:00:00+08')::timestamptz AND s.coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')) AND EXISTS (SELECT 1 FROM public.event_safety_check_decisions x WHERE x.event_id = '00000000-0000-4000-8079-000000000222' AND x.outcome = 'approved' AND x.decided_at = ('2026-10-02 10:00:00+08')::timestamptz)) THEN
    DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8079-000000000222';
    DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8079-000000000222';
    INSERT INTO public.event_safety_check_submissions (event_id, coordinator_id, round, venues_snapshot, period_snapshot,
                                                       attendance_snapshot, equipment_snapshot, submitted_at)
    VALUES ('00000000-0000-4000-8079-000000000222', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 1, jsonb_build_array(jsonb_build_object('bookingId', '00000000-0000-4000-8079-000000000412', 'venueName', 'Peony Hall', 'isMainVenue', true, 'status', 'complete', 'needsReviewReason', NULL)), jsonb_build_object('startsAt', ('2026-10-12 10:00:00+08')::timestamptz, 'endsAt', ('2026-10-12 12:00:00+08')::timestamptz),
            100, '[]'::jsonb, ('2026-10-01 10:00:00+08')::timestamptz)
    RETURNING id INTO v_sub;
    INSERT INTO public.event_safety_check_decisions (event_id, submission_id, decided_by, outcome, reason, decided_at)
    VALUES ('00000000-0000-4000-8079-000000000222', v_sub, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com'), 'approved', NULL, ('2026-10-02 10:00:00+08')::timestamptz);
  END IF;
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8079-000000000222' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000222') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8079-000000000222'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000222'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8079-000000000222'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status),
      ('00000000-0000-4000-8079-000000000222'::uuid, ('2026-10-01 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'planning'::public.event_status, 'pending_safety_check'::public.event_status),
      ('00000000-0000-4000-8079-000000000222'::uuid, ('2026-10-02 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com')::uuid, 'pending_safety_check'::public.event_status, 'confirmed'::public.event_status),
      ('00000000-0000-4000-8079-000000000222'::uuid, ('2026-10-12 14:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'confirmed'::public.event_status, 'completed'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000222';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8079-000000000222'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000222'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8079-000000000222'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status),
      ('00000000-0000-4000-8079-000000000222'::uuid, ('2026-10-01 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'planning'::public.event_status, 'pending_safety_check'::public.event_status),
      ('00000000-0000-4000-8079-000000000222'::uuid, ('2026-10-02 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'sally@gmail.com')::uuid, 'pending_safety_check'::public.event_status, 'confirmed'::public.event_status),
      ('00000000-0000-4000-8079-000000000222'::uuid, ('2026-10-12 14:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'confirmed'::public.event_status, 'completed'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000222') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000222';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000222') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000222';
    
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8079-000000000222' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8079-000000000222' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

-- Event "Archery Taster" (Rejected, 2027-06-02 10:00 to 2027-06-02 12:00, id 00000000-0000-4000-8079-000000000223). Stops if a real event has this title.
-- A status that can't move back to Rejected is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Archery Taster') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Archery Taster';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8079-000000000223';
  IF FOUND AND v_status <> 'rejected' AND NOT public.event_status_transition_allowed(v_status, 'rejected') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8079-000000000223';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8079-000000000223' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8079-000000000223', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Archery Taster', 'Meeting', 'UAT event Archery Taster.', 100,
          ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, 'rejected', ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
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
  -- Venue requirements: preferred location Central Area, minimum capacity None, layout None, accessibility None.
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity, accessibility_notes, layout_notes)
  VALUES ('00000000-0000-4000-8079-000000000223', 'Central Area', NULL, NULL, NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly none.
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8079-000000000223' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8079-000000000223';
END $$;
-- Records "Archery Taster" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000223') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000223' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000223';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8079-000000000223', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: rejected.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000223') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000223' AND decision = 'rejected' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM 'Outside this term''s events calendar.') THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000223';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8079-000000000223', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'rejected', 'Outside this term''s events calendar.', '2026-09-22 10:00:00+08');
  END IF;
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8079-000000000223' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Only one main venue at a time: clear the flag on this case's non-main bookings before the main one is restored.
  UPDATE public.venue_bookings SET is_main_venue = false
  WHERE event_id = '00000000-0000-4000-8079-000000000223' AND is_main_venue AND id = ANY (ARRAY[]::uuid[]);
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8079-000000000223' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000223' AND NOT (id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000223' AND NOT (id = ANY (ARRAY[]::uuid[]));
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000223') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000223';
    
  END IF;
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8079-000000000223';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8079-000000000223';
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8079-000000000223' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000223') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8079-000000000223'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000223'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8079-000000000223'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'rejected'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000223';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8079-000000000223'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000223'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8079-000000000223'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'rejected'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000223') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000223';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000223') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000223';
    
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8079-000000000223' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8079-000000000223' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

-- Event "Quiz Night" (Cancelled, 2027-06-02 10:00 to 2027-06-02 12:00, id 00000000-0000-4000-8079-000000000224). Stops if a real event has this title.
-- A status that can't move back to Cancelled is restored by deleting and re-inserting this test event.
DO $$
DECLARE v_status public.event_status;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE lower(title) = lower('Quiz Night') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%') AND organiser_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN ('joseph@gmail.com', 'daniel@gmail.com', 'bernard@gmail.com', 'jasmine@gmail.com', 'kenneth@gmail.com', 'joyce@gmail.com', 'jonathan@gmail.com', 'daryl@gmail.com', 'keith@gmail.com', 'andy@gmail.com', 'benny@gmail.com', 'tom@gmail.com', 'sally@gmail.com'))) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real event named "%" exists. Nothing was changed.', 'Quiz Night';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = '00000000-0000-4000-8079-000000000224';
  IF FOUND AND v_status <> 'cancelled' AND NOT public.event_status_transition_allowed(v_status, 'cancelled') THEN
    DELETE FROM public.events WHERE id = '00000000-0000-4000-8079-000000000224';
  END IF;
  -- Must not exist: clarifications this case doesn't list (an unresolved one would block the status below).
  DELETE FROM public.clarifications WHERE event_id = '00000000-0000-4000-8079-000000000224' AND NOT (id = ANY (ARRAY[]::uuid[]));
  INSERT INTO public.events AS ev (id, organiser_id, assigned_coordinator_id, title, purpose, description, expected_attendance,
                                   starts_at, ends_at, status, submitted_at, submitted_by, requirements_acknowledged, venue_id,
                                   emergency_access_checked, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
  VALUES ('00000000-0000-4000-8079-000000000224', (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'Quiz Night', 'Meeting', 'UAT event Quiz Night.', 100,
          ('2027-06-02 10:00:00+08')::timestamptz, ('2027-06-02 12:00:00+08')::timestamptz, 'cancelled', ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com'), true,
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
  -- Venue requirements: preferred location Central Area, minimum capacity None, layout None, accessibility None.
  INSERT INTO public.event_venue_requirements AS r (event_id, preferred_location, minimum_capacity, accessibility_notes, layout_notes)
  VALUES ('00000000-0000-4000-8079-000000000224', 'Central Area', NULL, NULL, NULL)
  ON CONFLICT (event_id) DO UPDATE SET preferred_location = EXCLUDED.preferred_location, minimum_capacity = EXCLUDED.minimum_capacity,
      accessibility_notes = EXCLUDED.accessibility_notes, layout_notes = EXCLUDED.layout_notes
  WHERE (r.preferred_location, r.minimum_capacity, r.accessibility_notes, r.layout_notes)
        IS DISTINCT FROM (EXCLUDED.preferred_location, EXCLUDED.minimum_capacity, EXCLUDED.accessibility_notes, EXCLUDED.layout_notes);
  -- Required facilities: exactly none.
  DELETE FROM public.event_required_facilities WHERE event_id = '00000000-0000-4000-8079-000000000224' AND NOT (facility_name = ANY (ARRAY[]::text[]));
  DELETE FROM public.event_registration_requirements WHERE event_id = '00000000-0000-4000-8079-000000000224';
END $$;
-- Records "Quiz Night" has for its status, as if it went through the app (only this test event's rows are touched).
DO $$
DECLARE v_sub bigint;
BEGIN
  -- Coordinator assigned by the Lead (Tom).
  IF (SELECT count(*) FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000224') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000224' AND previous_coordinator_id IS NULL
                    AND new_coordinator_id = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com') AND changed_by = (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com') AND changed_at = '2026-09-21 10:00:00+08' AND ended_at IS NULL) THEN
    DELETE FROM public.event_coordinator_assignments WHERE event_id = '00000000-0000-4000-8079-000000000224';
    INSERT INTO public.event_coordinator_assignments (event_id, previous_coordinator_id, new_coordinator_id, changed_by, changed_at)
    VALUES ('00000000-0000-4000-8079-000000000224', NULL, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), (SELECT id FROM auth.users WHERE lower(email) = 'tom@gmail.com'), '2026-09-21 10:00:00+08');
  END IF;
  -- The coordinator's decision on the request: approved.
  IF (SELECT count(*) FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000224') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000224' AND decision = 'approved' AND decided_by = (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')
                    AND decided_at = '2026-09-22 10:00:00+08' AND rationale IS NOT DISTINCT FROM NULL) THEN
    DELETE FROM public.event_decisions WHERE event_id = '00000000-0000-4000-8079-000000000224';
    INSERT INTO public.event_decisions (event_id, decided_by, decision, rationale, decided_at)
    VALUES ('00000000-0000-4000-8079-000000000224', (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com'), 'approved', NULL, '2026-09-22 10:00:00+08');
  END IF;
  -- Venue bookings: exactly the listed ones are active.
  UPDATE public.venue_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE event_id = '00000000-0000-4000-8079-000000000224' AND status IN ('pending', 'approved', 'on_hold') AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Only one main venue at a time: clear the flag on this case's non-main bookings before the main one is restored.
  UPDATE public.venue_bookings SET is_main_venue = false
  WHERE event_id = '00000000-0000-4000-8079-000000000224' AND is_main_venue AND id = ANY (ARRAY[]::uuid[]);
  -- Equipment requests: exactly the listed ones.
  DELETE FROM public.event_equipment_requirements WHERE event_id = '00000000-0000-4000-8079-000000000224' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Equipment reservations: exactly the listed ones.
  DELETE FROM public.equipment_reservation_events WHERE reservation_id IN (SELECT id FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000224' AND NOT (id = ANY (ARRAY[]::uuid[])));
  DELETE FROM public.equipment_reservations WHERE event_id = '00000000-0000-4000-8079-000000000224' AND NOT (id = ANY (ARRAY[]::uuid[]));
  IF (SELECT array_agg(row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text ORDER BY t.updated_at, row(t.requirement_id, t.event_id, t.status, t.note, t.updated_by, t.updated_at)::text) FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000224') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.equipment_arrangement_updates t WHERE t.event_id = '00000000-0000-4000-8079-000000000224';
    
  END IF;
  DELETE FROM public.event_safety_check_decisions WHERE event_id = '00000000-0000-4000-8079-000000000224';
  DELETE FROM public.event_safety_check_submissions WHERE event_id = '00000000-0000-4000-8079-000000000224';
  -- Change requests: exactly the listed ones.
  DELETE FROM public.event_change_requests WHERE event_id = '00000000-0000-4000-8079-000000000224' AND NOT (id = ANY (ARRAY[]::uuid[]));
  -- Status history through each allowed step, each by the person who did it.
  IF (SELECT array_agg(row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text ORDER BY t.changed_at, row(t.event_id, t.changed_at, t.changed_by, t.from_status, t.to_status)::text) FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000224') IS DISTINCT FROM (SELECT array_agg(row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text ORDER BY v.changed_at, row(v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status)::text) FROM (VALUES
      ('00000000-0000-4000-8079-000000000224'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000224'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8079-000000000224'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status),
      ('00000000-0000-4000-8079-000000000224'::uuid, ('2026-10-06 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'planning'::public.event_status, 'cancelled'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status)) THEN
    DELETE FROM public.event_status_history t WHERE t.event_id = '00000000-0000-4000-8079-000000000224';
    INSERT INTO public.event_status_history (event_id, changed_at, changed_by, from_status, to_status) SELECT v.event_id, v.changed_at, v.changed_by, v.from_status, v.to_status FROM (VALUES
      ('00000000-0000-4000-8079-000000000224'::uuid, ('2026-09-18 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, NULL::public.event_status, 'draft'::public.event_status),
      ('00000000-0000-4000-8079-000000000224'::uuid, ('2026-09-20 09:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'draft'::public.event_status, 'requested'::public.event_status),
      ('00000000-0000-4000-8079-000000000224'::uuid, ('2026-09-22 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'joyce@gmail.com')::uuid, 'requested'::public.event_status, 'planning'::public.event_status),
      ('00000000-0000-4000-8079-000000000224'::uuid, ('2026-10-06 10:00:00+08')::timestamptz, (SELECT id FROM auth.users WHERE lower(email) = 'jasmine@gmail.com')::uuid, 'planning'::public.event_status, 'cancelled'::public.event_status)) v(event_id, changed_at, changed_by, from_status, to_status);
  END IF;
  -- Field-change history: exactly the listed edits.
  IF (SELECT array_agg(row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.field_name, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000224') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_field_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000224';
    
  END IF;
  -- Equipment change history: exactly the listed entries.
  IF (SELECT array_agg(row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text ORDER BY t.changed_at, row(t.event_id, t.requirement_id, t.change_type, t.previous_value, t.new_value, t.changed_by, t.changed_at)::text) FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000224') IS DISTINCT FROM NULL::text[] THEN
    DELETE FROM public.event_equipment_changes t WHERE t.event_id = '00000000-0000-4000-8079-000000000224';
    
  END IF;
  -- Registrations: exactly none.
  DELETE FROM public.event_registrations WHERE event_id = '00000000-0000-4000-8079-000000000224' AND attendee_id NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''));
  -- Notifications on this event: exactly the listed ones.
  DELETE FROM public.notifications WHERE event_id = '00000000-0000-4000-8079-000000000224' AND NOT (id = ANY (ARRAY[]::uuid[]));
END $$;

-- Blocks on "Peony Hall": none. Other active blocks on this test venue are removed.
UPDATE public.venue_unavailability SET removed_at = now()
WHERE venue_id = '00000000-0000-4000-8079-000000000101' AND removed_at IS NULL AND NOT (id = ANY (ARRAY[]::uuid[]));









COMMIT;

SELECT 'spm79_tc028_setup.sql: setup complete' AS result;
