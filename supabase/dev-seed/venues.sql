-- ConnectSphere main venue catalogue (16 venues).
--
-- One single statement (so it is atomic and works with `supabase db query`).
-- Not a migration and never run automatically (supabase/config.toml has
-- seeding disabled). Insert-only and safe to re-run: each venue has a fixed
-- id, and a venue, layout or facility that already exists is left untouched.
-- Nothing is updated or deleted, so existing venues are never changed.
--
-- Local:   pnpm exec supabase db query --local -f supabase/dev-seed/venues.sql
-- Shared:  only when the team agrees; see "Supabase and data safety" in AGENTS.md.
--
-- The set is built to exercise the whole backlog: capacity from 6 to 800,
-- weekday-only / weekend-only / daily hours, setup and turnaround from none to
-- 120 / 90 minutes, a venue with no facilities, venues with and without
-- accessibility notes, and a multi-room convention centre.
with seed as materialized (
  select * from (values
('b1000000-0000-4000-8000-000000000001', 'Grand Auditorium', 'City Hall', 500,
  'Flagship tiered auditorium for keynotes, ceremonies and large briefings.',
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"08:00","closesAt":"22:00"}]',
  'Step-free entrance, lifts to all levels, wheelchair spaces and a hearing loop.', 30, 45,
  array['Auditorium','Theatre'], array['Air conditioning','Restrooms','Parking','Storage room']),
 ('b1000000-0000-4000-8000-000000000002', 'Innovation Hall', 'Marina Bay', 200,
  'Flexible hall for talks, workshops and dinners, reconfigurable between layouts.',
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"08:00","closesAt":"22:00"}]',
  'Step-free entrance and accessible restrooms.', 15, 15,
  array['Theatre','Classroom','Banquet'], array['Air conditioning','Restrooms','Pantry']),
 ('b1000000-0000-4000-8000-000000000003', 'Seminar Room A', 'Bras Basah', 40,
  'Compact seminar room for training sessions and small workshops.',
  '[{"days":["mon","tue","wed","thu","fri"],"opensAt":"09:00","closesAt":"18:00"}]',
  'Ground floor, wheelchair accessible.', 0, 0,
  array['Classroom','Boardroom'], array['Air conditioning','Restrooms']),
 ('b1000000-0000-4000-8000-000000000004', 'Executive Boardroom', 'Raffles Place', 16,
  'Private boardroom for leadership meetings and interviews.',
  '[{"days":["mon","tue","wed","thu","fri"],"opensAt":"08:00","closesAt":"20:00"}]',
  'Lift access.', 10, 10,
  array['Boardroom'], array['Air conditioning','Pantry','Restrooms']),
 ('b1000000-0000-4000-8000-000000000005', 'Banquet Ballroom', 'Orchard', 350,
  'Ballroom with a full catering kitchen for galas, receptions and award dinners.',
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"10:00","closesAt":"23:00"}]',
  'Lifts, ramps and accessible restrooms.', 45, 60,
  array['Banquet','Theatre'], array['Kitchen','Pantry','Restrooms','Parking','Air conditioning']),
 ('b1000000-0000-4000-8000-000000000006', 'Community Hall', 'Tampines', 120,
  'Open multipurpose hall for community events, fairs and classes.',
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"09:00","closesAt":"21:00"}]',
  null, 0, 0,
  array['Open Floor','Classroom'], array['Parking','Restrooms','Storage room']),
 ('b1000000-0000-4000-8000-000000000007', 'Lecture Theatre North', 'Ang Mo Kio', 150,
  'Raked lecture theatre for talks and presentations.',
  '[{"days":["mon","tue","wed","thu","fri","sat"],"opensAt":"08:00","closesAt":"20:00"}]',
  null, 15, 15,
  array['Theatre'], array['Air conditioning','Restrooms']),
 ('b1000000-0000-4000-8000-000000000008', 'Exhibition Pavilion', 'Sentosa', 800,
  'Large pavilion for trade shows and exhibitions, with long set-up and pack-down times.',
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"10:00","closesAt":"20:00"}]',
  'Step-free throughout.', 120, 90,
  array['Exhibition','Open Floor'], array['Parking','Outdoor space','Storage room','Restrooms']),
 ('b1000000-0000-4000-8000-000000000009', 'Meeting Pod', 'Tanjong Pagar', 6,
  'Small pod for one-to-one meetings and calls.',
  '[{"days":["mon","tue","wed","thu","fri"],"opensAt":"09:00","closesAt":"18:00"}]',
  null, 0, 0,
  array['Boardroom'], array['Air conditioning']),
 ('b1000000-0000-4000-8000-000000000010', 'Weekend Studio', 'Bugis', 60,
  'Activity studio open at weekends for classes, fitness and workshops.',
  '[{"days":["sat","sun"],"opensAt":"10:00","closesAt":"18:00"}]',
  null, 0, 0,
  array['Open Floor','Classroom'], array['Air conditioning','Changing rooms','Showers','Restrooms']),
 ('b1000000-0000-4000-8000-000000000011', 'Open Studio', 'Jurong West', 100,
  'Bare open-plan space available around the clock, with no built-in facilities.',
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]',
  null, 0, 0,
  array['Open Floor'], array[]::text[]),
 ('b1000000-0000-4000-8000-000000000012', 'Training Room', 'Paya Lebar', 30,
  'Training room that needs a full hour to set up and reset between sessions.',
  '[{"days":["mon","tue","wed","thu","fri"],"opensAt":"08:00","closesAt":"20:00"}]',
  'Lift access.', 60, 60,
  array['Classroom'], array['Air conditioning','Restrooms']),
 ('b1000000-0000-4000-8000-000000000013', 'Convention Centre - Main Hall', 'Marina Bay', 600,
  'Main plenary hall of the convention centre; breakout rooms are booked separately.',
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"08:00","closesAt":"22:00"}]',
  'Step-free, lifts and a hearing loop.', 30, 30,
  array['Auditorium','Theatre'], array['Air conditioning','Restrooms','Parking','Storage room']),
 ('b1000000-0000-4000-8000-000000000014', 'Convention Centre - Breakout Room 1', 'Marina Bay', 40,
  'Breakout room beside the main hall.',
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"08:00","closesAt":"22:00"}]',
  'Step-free.', 5, 5,
  array['Classroom'], array['Air conditioning','Restrooms']),
 ('b1000000-0000-4000-8000-000000000015', 'Convention Centre - Breakout Room 2', 'Marina Bay', 40,
  'Breakout room beside the main hall.',
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"08:00","closesAt":"22:00"}]',
  'Step-free.', 5, 5,
  array['Classroom'], array['Air conditioning','Restrooms']),
 ('b1000000-0000-4000-8000-000000000016', 'Convention Centre - Breakout Room 3', 'Marina Bay', 40,
  'Breakout room beside the main hall.',
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"08:00","closesAt":"22:00"}]',
  'Step-free.', 5, 5,
  array['Classroom'], array['Air conditioning','Restrooms'])
  ) as t(id, name, area, capacity, description, hours, accessibility, setup, turnaround, layouts, facilities)
),
typed as materialized (
  select id::uuid, name::text, area::text, capacity::int, description::text, hours::jsonb,
         accessibility::text, setup::int, turnaround::int, layouts::text[], facilities::text[]
  from seed
),
-- A venue is only added when neither its id nor its name + location exists.
new_venues as (
  insert into public.venues
    (id, name, location, area_tags, capacity, description, operating_hours,
     accessibility_notes, setup_time_minutes, turnaround_time_minutes)
  select id, name, area, array[area], capacity, description, hours,
         accessibility, setup, turnaround
  from typed
  on conflict do nothing
  returning id
),
-- Layouts and facilities are added only for venues this script owns (just
-- created, or created by an earlier run), and only when missing.
owned as (
  select t.* from typed t
  where t.id in (select id from new_venues)
     or exists (select 1 from public.venues v where v.id = t.id and v.name = t.name)
),
new_layouts as (
  insert into public.venue_layouts (venue_id, layout_name)
  select o.id, layout
  from owned o cross join lateral unnest(o.layouts) as layout
  where not exists (
    select 1 from public.venue_layouts l where l.venue_id = o.id and l.layout_name::text = layout
  )
  returning 1
),
new_facilities as (
  insert into public.venue_facilities (venue_id, facility_name)
  select o.id, facility
  from owned o cross join lateral unnest(o.facilities) as facility
  where not exists (
    select 1 from public.venue_facilities f where f.venue_id = o.id and f.facility_name = facility
  )
  returning 1
)
select
  (select count(*) from new_venues) as venues_added,
  (select count(*) from new_layouts) as layouts_added,
  (select count(*) from new_facilities) as facilities_added;
