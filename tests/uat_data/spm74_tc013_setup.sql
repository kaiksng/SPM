-- SPM-74-TC-013: Filter equipment by Category
-- Acceptance criterion: AC 1, AC 2
-- Login: Technical Support Staff (andy@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): see Test Data
-- Source: refined Preconditions of docs/Project UAT kk_sher_refined.xlsx
-- Records restored: test catalogue item Wireless Mic (active); test catalogue item Spotlight (active)
-- Must-not-exist conditions enforced: none
-- Defaults added: organiser Jasmine and coordinator Joyce unless the case names others; purpose, descriptions, attendance (100) and times not stated in the case; workflow dates 18 Sep - 9 Oct 2026; events that have already ended are dated 15 Oct 2026; test venues open all day unless stated
-- Shared records: cases of a story share its test events and venues: test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm74_tc013   (from the repo root)

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


-- Test catalogue item "Wireless Mic" (Audio, code uat74-wireless-mic, active, 2 units; id 00000000-0000-4000-8074-000000000805).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.equipment_items WHERE (lower(name) = lower('Wireless Mic') OR code = 'uat74-wireless-mic') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real catalogue item named "%" exists. Nothing was changed.', 'Wireless Mic';
  END IF;
  INSERT INTO public.equipment_items AS i (id, name, category, code, total_quantity, retired_at, retired_by)
  VALUES ('00000000-0000-4000-8074-000000000805', 'Wireless Mic', 'Audio', 'uat74-wireless-mic', 0, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, code = EXCLUDED.code, retired_at = EXCLUDED.retired_at,
      retired_by = EXCLUDED.retired_by
  WHERE (i.name, i.category, i.code, i.retired_at) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.category, EXCLUDED.code, EXCLUDED.retired_at);
  INSERT INTO public.equipment_units (equipment_item_id, unit_number)
  SELECT '00000000-0000-4000-8074-000000000805', n FROM generate_series(1, 2) n
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment_units x WHERE x.equipment_item_id = '00000000-0000-4000-8074-000000000805' AND x.unit_number = n);
END $$;

-- Test catalogue item "Spotlight" (Lighting, code uat74-spotlight, active, 2 units; id 00000000-0000-4000-8074-000000000806).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.equipment_items WHERE (lower(name) = lower('Spotlight') OR code = 'uat74-spotlight') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real catalogue item named "%" exists. Nothing was changed.', 'Spotlight';
  END IF;
  INSERT INTO public.equipment_items AS i (id, name, category, code, total_quantity, retired_at, retired_by)
  VALUES ('00000000-0000-4000-8074-000000000806', 'Spotlight', 'Lighting', 'uat74-spotlight', 0, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, code = EXCLUDED.code, retired_at = EXCLUDED.retired_at,
      retired_by = EXCLUDED.retired_by
  WHERE (i.name, i.category, i.code, i.retired_at) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.category, EXCLUDED.code, EXCLUDED.retired_at);
  INSERT INTO public.equipment_units (equipment_item_id, unit_number)
  SELECT '00000000-0000-4000-8074-000000000806', n FROM generate_series(1, 2) n
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment_units x WHERE x.equipment_item_id = '00000000-0000-4000-8074-000000000806' AND x.unit_number = n);
END $$;

COMMIT;

SELECT 'spm74_tc013_setup.sql: setup complete' AS result;
