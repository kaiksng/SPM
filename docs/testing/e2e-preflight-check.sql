-- Read-only preflight for docs/testing/manual-e2e-journeys.md.
-- Run in the Supabase SQL editor (shared project). Contains only SELECTs; changes nothing.
-- Each query answers one precondition. "FAIL" rows mean a teammate would get stuck.

-- 1. Roles: each role needs at least one account (the guide needs 7 logins).
select r.role,
       count(p.id) as accounts,
       case when count(p.id) >= 1 then 'OK' else 'FAIL: no account' end as result
from (values ('event_organiser'),('event_coordinator_lead'),('event_coordinator'),
             ('venue_staff'),('technical_support_staff'),('safety_officer'),('attendee')) as r(role)
left join public.profiles p on p.role::text = r.role
group by r.role order by r.role;

-- 2. Venues that satisfy every journey: capacity >= 40, Classroom layout, North area,
--    step-free access, open 08:00-18:00, setup 30 min, turnaround 45 min.
--    Journeys 1,2,3,5 need one such venue; Journey 4 needs TWO (main + replacement).
select v.name, v.capacity, v.area_tags, v.setup_time_minutes, v.turnaround_time_minutes,
       v.operating_hours,
       (select string_agg(l.layout_name, ', ') from public.venue_layouts l where l.venue_id = v.id) as layouts,
       (select string_agg(f.facility_name, ', ') from public.venue_facilities f where f.venue_id = v.id) as facilities,
       v.accessibility_notes,
       case when v.capacity >= 40
             and v.setup_time_minutes = 30 and v.turnaround_time_minutes = 45
             and 'North' = any (v.area_tags)
             and exists (select 1 from public.venue_layouts l where l.venue_id = v.id and l.layout_name::text ilike 'classroom')
             and v.accessibility_notes ilike '%step-free%'
            then 'CANDIDATE' else 'no' end as fits
from public.venues v
order by fits, v.name;

-- 3. Equipment: an active item with >= 4 in-service units.
select i.code, i.name, i.category,
       count(u.id) filter (where u.retired_at is null) as active_units,
       case when i.retired_at is null and count(u.id) filter (where u.retired_at is null) >= 4
            then 'CANDIDATE' else 'no' end as fits
from public.equipment_items i
left join public.equipment_units u on u.equipment_item_id = i.id
group by i.id order by fits, i.name;

-- 4. Name clashes: none of the six guide event names should already exist.
select n.name,
       (select count(*) from public.events e where e.title = n.name) as existing_events,
       case when (select count(*) from public.events e where e.title = n.name) = 0 then 'OK' else 'CLASH: use the " 2" rule' end as result
from (values ('Year-End Team Planning Meeting'),('Product Launch Briefing'),('Sales Kickoff Workshop'),
             ('Quarterly Strategy Review'),('Department Planning Retreat'),('Customer Feedback Roundtable')) as n(name);

-- 5. Busy dates on each venue from today (pick guide dates that are NOT listed here;
--    a date also needs no other tester on the same venue).
select v.name as venue, (b.starts_at at time zone 'Asia/Singapore')::date as busy_date, b.status::text as kind
from public.venue_bookings b join public.venues v on v.id = b.venue_id
where b.status::text in ('pending','approved','on_hold') and b.ends_at > now()
union all
select v.name, (u.starts_at at time zone 'Asia/Singapore')::date, 'block'
from public.venue_unavailability u join public.venues v on v.id = u.venue_id
where u.removed_at is null and u.ends_at > now()
order by 1, 2;
