-- SPM-74-TC-030: Equipment search and filters are kept in the page URL
-- Acceptance criterion: AC 5
-- Login: Technical Support Staff (andy@gmail.com) - password is in the test case's Test Data / Test accounts
-- Inputs entered during the test (not inserted): see Test Data
-- Source: refined Preconditions of docs/Project UAT kk_sher_refined.xlsx
-- Records restored: test catalogue item Mixer A (active); test catalogue item Mixer B (retired); test catalogue item Mixer L (retired); test catalogue item Speaker (retired)
-- Must-not-exist conditions enforced: none
-- Defaults added: organiser Jasmine and coordinator Joyce unless the case names others; purpose, descriptions, attendance (100) and times not stated in the case; workflow dates 18 Sep - 9 Oct 2026; events that have already ended are dated 15 Oct 2026; test venues open all day unless stated
-- Shared records: cases of a story share its test events and venues: test one story at a time.
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm74_tc030   (from the repo root)

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


-- Test catalogue item "Mixer A" (Audio, code uat74-mixer-a, active, 2 units; id 00000000-0000-4000-8074-000000000801).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.equipment_items WHERE (lower(name) = lower('Mixer A') OR code = 'uat74-mixer-a') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real catalogue item named "%" exists. Nothing was changed.', 'Mixer A';
  END IF;
  INSERT INTO public.equipment_items AS i (id, name, category, code, total_quantity, retired_at, retired_by)
  VALUES ('00000000-0000-4000-8074-000000000801', 'Mixer A', 'Audio', 'uat74-mixer-a', 0, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, code = EXCLUDED.code, retired_at = EXCLUDED.retired_at,
      retired_by = EXCLUDED.retired_by
  WHERE (i.name, i.category, i.code, i.retired_at) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.category, EXCLUDED.code, EXCLUDED.retired_at);
  INSERT INTO public.equipment_units (equipment_item_id, unit_number)
  SELECT '00000000-0000-4000-8074-000000000801', n FROM generate_series(1, 2) n
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment_units x WHERE x.equipment_item_id = '00000000-0000-4000-8074-000000000801' AND x.unit_number = n);
END $$;

-- Test catalogue item "Mixer B" (Audio, code uat74-mixer-b, retired, 2 units; id 00000000-0000-4000-8074-000000000802).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.equipment_items WHERE (lower(name) = lower('Mixer B') OR code = 'uat74-mixer-b') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real catalogue item named "%" exists. Nothing was changed.', 'Mixer B';
  END IF;
  INSERT INTO public.equipment_items AS i (id, name, category, code, total_quantity, retired_at, retired_by)
  VALUES ('00000000-0000-4000-8074-000000000802', 'Mixer B', 'Audio', 'uat74-mixer-b', 0, '2026-10-01 10:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com'))
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, code = EXCLUDED.code, retired_at = EXCLUDED.retired_at,
      retired_by = EXCLUDED.retired_by
  WHERE (i.name, i.category, i.code, i.retired_at) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.category, EXCLUDED.code, EXCLUDED.retired_at);
  INSERT INTO public.equipment_units (equipment_item_id, unit_number)
  SELECT '00000000-0000-4000-8074-000000000802', n FROM generate_series(1, 2) n
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment_units x WHERE x.equipment_item_id = '00000000-0000-4000-8074-000000000802' AND x.unit_number = n);
END $$;

-- Test catalogue item "Mixer L" (Lighting, code uat74-mixer-l, retired, 2 units; id 00000000-0000-4000-8074-000000000803).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.equipment_items WHERE (lower(name) = lower('Mixer L') OR code = 'uat74-mixer-l') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real catalogue item named "%" exists. Nothing was changed.', 'Mixer L';
  END IF;
  INSERT INTO public.equipment_items AS i (id, name, category, code, total_quantity, retired_at, retired_by)
  VALUES ('00000000-0000-4000-8074-000000000803', 'Mixer L', 'Lighting', 'uat74-mixer-l', 0, '2026-10-01 10:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com'))
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, code = EXCLUDED.code, retired_at = EXCLUDED.retired_at,
      retired_by = EXCLUDED.retired_by
  WHERE (i.name, i.category, i.code, i.retired_at) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.category, EXCLUDED.code, EXCLUDED.retired_at);
  INSERT INTO public.equipment_units (equipment_item_id, unit_number)
  SELECT '00000000-0000-4000-8074-000000000803', n FROM generate_series(1, 2) n
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment_units x WHERE x.equipment_item_id = '00000000-0000-4000-8074-000000000803' AND x.unit_number = n);
END $$;

-- Test catalogue item "Speaker" (Audio, code uat74-speaker, retired, 2 units; id 00000000-0000-4000-8074-000000000804).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.equipment_items WHERE (lower(name) = lower('Speaker') OR code = 'uat74-speaker') AND NOT (id::text LIKE '00000000-0000-4000-80%' OR id::text LIKE '00000000-0000-0000-00%')) THEN
    RAISE EXCEPTION 'UAT setup stopped: a real catalogue item named "%" exists. Nothing was changed.', 'Speaker';
  END IF;
  INSERT INTO public.equipment_items AS i (id, name, category, code, total_quantity, retired_at, retired_by)
  VALUES ('00000000-0000-4000-8074-000000000804', 'Speaker', 'Audio', 'uat74-speaker', 0, '2026-10-01 10:00:00+08', (SELECT id FROM auth.users WHERE lower(email) = 'andy@gmail.com'))
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, code = EXCLUDED.code, retired_at = EXCLUDED.retired_at,
      retired_by = EXCLUDED.retired_by
  WHERE (i.name, i.category, i.code, i.retired_at) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.category, EXCLUDED.code, EXCLUDED.retired_at);
  INSERT INTO public.equipment_units (equipment_item_id, unit_number)
  SELECT '00000000-0000-4000-8074-000000000804', n FROM generate_series(1, 2) n
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment_units x WHERE x.equipment_item_id = '00000000-0000-4000-8074-000000000804' AND x.unit_number = n);
END $$;

COMMIT;

SELECT 'spm74_tc030_setup.sql: setup complete' AS result;
