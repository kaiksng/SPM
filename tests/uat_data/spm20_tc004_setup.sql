-- SPM-20 TC-004: A venue with no bookings or blocks shows as fully Available
-- Acceptance criterion: AC4
-- Run with: pnpm uat:setup spm20_tc004   (from the repo root; see tests/uat_data/README.md)
-- Login: Venue Staff (daryl@gmail.com) - shared UAT password (kept with the team)
-- Inputs entered during the test (not inserted): none
-- Source: Venue W has no bookings and no blocks anywhere in date range D.
-- Records restored: profile daryl; venue "Venue W" (id 00000000-0000-4000-8020-000000000102)
-- Must-not-exist conditions enforced: blocks on Venue W during 7-13 Dec 2026 (marked removed); active bookings on Venue W that week (file stops)
-- Defaults added: Venues V and W: Central Area, 120 pax, Mon-Sun 08:00-22:00, setup/turnaround 0, Classroom; date range D = 7-13 Dec 2026; booking T1-T2 = 8 Dec 2026 14:00-16:00 (approved, event "Board Meeting", organiser jasmine, coordinator joyce); block T3-T4 = 8 Dec 2026 09:00-11:00 (maintenance, "Aircon servicing")
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

-- Earlier versions of these files used ids the backend rejects (not valid UUIDs). Remove any test records
-- left under those ids (with their own requests, notifications and history) so they can't clash.
DO $$
DECLARE v_ids uuid[] := ARRAY['00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0020-000000000102']::uuid[];
BEGIN
  DELETE FROM public.venues WHERE id = ANY (v_ids);
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'UAT setup stopped: an old test record is still used by non-test data. Nothing was changed.';
END $$;

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

-- Clash guard: stop if a real (non-test) venue already uses the name "Venue W" (Central Area).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues
             WHERE name = 'Venue W' AND location = 'Central Area' AND id <> '00000000-0000-4000-8020-000000000102') THEN
    RAISE EXCEPTION 'UAT setup stopped: a real venue named "Venue W" (Central Area) already exists. Nothing was changed.';
  END IF;
END $$;

-- Venue "Venue W" (Central Area), test id 00000000-0000-4000-8020-000000000102: inserted if missing, reset if changed.
INSERT INTO public.venues AS v (id, name, location, area_tags, capacity, operating_hours,
                                setup_time_minutes, turnaround_time_minutes)
VALUES ('00000000-0000-4000-8020-000000000102', 'Venue W', 'Central Area', ARRAY['Central Area'], 120,
        '[{"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "opensAt": "08:00", "closesAt": "22:00"}]'::jsonb, 0, 0)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, location = EXCLUDED.location, area_tags = EXCLUDED.area_tags,
    capacity = EXCLUDED.capacity, operating_hours = EXCLUDED.operating_hours,
    setup_time_minutes = EXCLUDED.setup_time_minutes, turnaround_time_minutes = EXCLUDED.turnaround_time_minutes
WHERE (v.name, v.location, v.area_tags, v.capacity, v.operating_hours, v.setup_time_minutes, v.turnaround_time_minutes)
      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.location, EXCLUDED.area_tags, EXCLUDED.capacity,
                        EXCLUDED.operating_hours, EXCLUDED.setup_time_minutes, EXCLUDED.turnaround_time_minutes);

-- Facilities and layouts of the test venue: exactly the listed ones.
DELETE FROM public.venue_facilities
WHERE venue_id = '00000000-0000-4000-8020-000000000102' AND facility_name <> ALL (ARRAY[]::text[]);
INSERT INTO public.venue_facilities (venue_id, facility_name)
SELECT '00000000-0000-4000-8020-000000000102', f FROM unnest(ARRAY[]::text[]) AS f
WHERE NOT EXISTS (SELECT 1 FROM public.venue_facilities x WHERE x.venue_id = '00000000-0000-4000-8020-000000000102' AND x.facility_name = f);

DELETE FROM public.venue_layouts
WHERE venue_id = '00000000-0000-4000-8020-000000000102' AND layout_name::text <> ALL (ARRAY['Classroom']::text[]);
INSERT INTO public.venue_layouts (venue_id, layout_name)
SELECT '00000000-0000-4000-8020-000000000102', l::public.room_layout FROM unnest(ARRAY['Classroom']::text[]) AS l
WHERE NOT EXISTS (SELECT 1 FROM public.venue_layouts x WHERE x.venue_id = '00000000-0000-4000-8020-000000000102' AND x.layout_name::text = l);

-- Must not exist on Venue W: other active bookings or blocks during 7-13 Dec 2026.
-- Blocks are marked removed; another person's booking is never changed, the file stops instead.
DO $$
DECLARE
  v_venue uuid := '00000000-0000-4000-8020-000000000102'::uuid;
  v_clash text;
BEGIN
  UPDATE public.venue_unavailability SET removed_at = now()
  WHERE venue_id = v_venue AND removed_at IS NULL
    AND tstzrange(starts_at, ends_at) && tstzrange('2026-12-07 00:00:00+08', '2026-12-14 00:00:00+08');

  SELECT e2.title INTO v_clash
  FROM public.venue_bookings b2 JOIN public.events e2 ON e2.id = b2.event_id
  WHERE b2.venue_id = v_venue AND b2.id NOT IN ('00000000-0000-4000-8000-000000000000')
    AND b2.status IN ('pending', 'approved', 'on_hold')
    AND tstzrange(b2.starts_at, b2.ends_at) && tstzrange('2026-12-07 00:00:00+08', '2026-12-14 00:00:00+08')
  LIMIT 1;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another booking ("%") occupies Venue W during 7-13 Dec 2026; cancel it before running this file', v_clash;
  END IF;
END $$;

COMMIT;
