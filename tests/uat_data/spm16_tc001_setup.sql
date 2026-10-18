-- SPM-16 TC-001: View information permitted for Venue Staff
-- Acceptance criterion: AC1
-- Run with: pnpm uat:setup spm16_tc001   (from the repo root; see tests/uat_data/README.md)
-- Login: Venue Staff (daryl@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: Venue Staff user is signed in.
-- Records restored: profile daryl; venue "Lecture Theatre 2" (Central Area, id 00000000-0000-0000-0016-000000000101)
-- Must-not-exist conditions enforced: none
-- Defaults added: Venue "Lecture Theatre 2": Central Area, 150 pax, Mon-Fri 08:00-20:00, setup/turnaround 15 min, Theatre, Projector
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Profile and role for daryl@gmail.com (Venue Staff). Auth is only read, never written.
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

-- Clash guard: stop if a real (non-test) venue already uses the name "Lecture Theatre 2" (Central Area).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues
             WHERE name = 'Lecture Theatre 2' AND location = 'Central Area' AND id <> '00000000-0000-0000-0016-000000000101') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Lecture Theatre 2" (Central Area) already exists. Nothing was changed.';
  END IF;
END $$;

-- Venue "Lecture Theatre 2" (Central Area), test id 00000000-0000-0000-0016-000000000101: inserted if missing, reset if changed.
INSERT INTO public.venues AS v (id, name, location, area_tags, capacity, operating_hours,
                                setup_time_minutes, turnaround_time_minutes)
VALUES ('00000000-0000-0000-0016-000000000101', 'Lecture Theatre 2', 'Central Area', ARRAY['Central Area'], 150,
        '[{"days": ["mon", "tue", "wed", "thu", "fri"], "opensAt": "08:00", "closesAt": "20:00"}]'::jsonb, 15, 15)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, location = EXCLUDED.location, area_tags = EXCLUDED.area_tags,
    capacity = EXCLUDED.capacity, operating_hours = EXCLUDED.operating_hours,
    setup_time_minutes = EXCLUDED.setup_time_minutes, turnaround_time_minutes = EXCLUDED.turnaround_time_minutes
WHERE (v.name, v.location, v.area_tags, v.capacity, v.operating_hours, v.setup_time_minutes, v.turnaround_time_minutes)
      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.location, EXCLUDED.area_tags, EXCLUDED.capacity,
                        EXCLUDED.operating_hours, EXCLUDED.setup_time_minutes, EXCLUDED.turnaround_time_minutes);

-- Facilities and layouts of the test venue: exactly the listed ones.
DELETE FROM public.venue_facilities
WHERE venue_id = '00000000-0000-0000-0016-000000000101' AND facility_name <> ALL (ARRAY['Projector']::text[]);
INSERT INTO public.venue_facilities (venue_id, facility_name)
SELECT '00000000-0000-0000-0016-000000000101', f FROM unnest(ARRAY['Projector']::text[]) AS f
WHERE NOT EXISTS (SELECT 1 FROM public.venue_facilities x WHERE x.venue_id = '00000000-0000-0000-0016-000000000101' AND x.facility_name = f);

DELETE FROM public.venue_layouts
WHERE venue_id = '00000000-0000-0000-0016-000000000101' AND layout_name::text <> ALL (ARRAY['Theatre']::text[]);
INSERT INTO public.venue_layouts (venue_id, layout_name)
SELECT '00000000-0000-0000-0016-000000000101', l::public.room_layout FROM unnest(ARRAY['Theatre']::text[]) AS l
WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts x WHERE x.venue_id = '00000000-0000-0000-0016-000000000101' AND x.layout_name::text = l);

COMMIT;
