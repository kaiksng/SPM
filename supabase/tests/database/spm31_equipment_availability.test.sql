begin;

select plan(13);

-- SPM-31: Check equipment availability for an event's date and time
-- (202610061001_spm31_equipment_availability.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e5000000-0000-0000-0000-000000000001', 'avail-support@example.test', '{"full_name":"Avail Support","role":"technical_support_staff"}'::jsonb),
  ('e5000000-0000-0000-0000-000000000002', 'avail-organiser@example.test', '{"full_name":"Avail Organiser","role":"event_organiser"}'::jsonb),
  ('e5000000-0000-0000-0000-000000000003', 'avail-coordinator@example.test', '{"full_name":"Avail Coordinator","role":"event_coordinator"}'::jsonb);

create temporary table a_ids (name text primary key, id uuid);
grant all on a_ids to authenticated;

-- Setup as the database owner. Projector and Wireless microphone have 100
-- units each; "Smoke machine" is created with 2 units.
insert into a_ids select 'proj', id from public.equipment_items where code = 'proj';
insert into a_ids select 'mic', id from public.equipment_items where code = 'mic';
insert into public.equipment_items (name, category, code, total_quantity) values ('Smoke machine', 'Effects', 'smoke', 0);
insert into a_ids select 'smoke', id from public.equipment_items where code = 'smoke';
insert into public.equipment_units (equipment_item_id, unit_number)
select (select id from a_ids where name = 'smoke'), n from generate_series(1, 2) as n;

insert into public.events (id, organiser_id, title, status, starts_at, ends_at)
values ('e5000000-0000-0000-0000-0000000000e1', 'e5000000-0000-0000-0000-000000000002', 'Availability Gala', 'draft',
        '2099-06-01T10:00:00+08:00', '2099-06-01T14:00:00+08:00');
insert into a_ids values ('event', 'e5000000-0000-0000-0000-0000000000e1');

-- Requirements, all over 10:00-14:00.
insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until, notes)
values
  ((select id from a_ids where name = 'event'), (select id from a_ids where name = 'proj'), 'x', 50, '2099-06-01T10:00:00+08:00', '2099-06-01T14:00:00+08:00', 'HDMI input'),
  ((select id from a_ids where name = 'event'), (select id from a_ids where name = 'proj'), 'x', 80, '2099-06-01T10:00:00+08:00', '2099-06-01T14:00:00+08:00', null),
  ((select id from a_ids where name = 'event'), (select id from a_ids where name = 'smoke'), 'x', 1, '2099-06-01T10:00:00+08:00', '2099-06-01T14:00:00+08:00', null),
  ((select id from a_ids where name = 'event'), (select id from a_ids where name = 'mic'), 'x', 100, '2099-06-01T10:00:00+08:00', '2099-06-01T14:00:00+08:00', null);
insert into a_ids select 'req-proj-50', id from public.event_equipment_requirements where event_id = (select id from a_ids where name = 'event') and quantity = 50;
insert into a_ids select 'req-proj-80', id from public.event_equipment_requirements where event_id = (select id from a_ids where name = 'event') and quantity = 80;
insert into a_ids select 'req-smoke', id from public.event_equipment_requirements where event_id = (select id from a_ids where name = 'event') and quantity = 1;
insert into a_ids select 'req-mic', id from public.event_equipment_requirements where event_id = (select id from a_ids where name = 'event') and quantity = 100;

-- A legacy free-text row (written before the catalogue existed).
alter table public.event_equipment_requirements disable trigger event_equipment_requirements_guard;
insert into public.event_equipment_requirements (event_id, equipment_name, quantity)
values ((select id from a_ids where name = 'event'), 'Old smoke machine', 1);
alter table public.event_equipment_requirements enable trigger event_equipment_requirements_guard;
insert into a_ids select 'req-legacy', id from public.event_equipment_requirements where equipment_name = 'Old smoke machine';

-- SPM-30 AC04: active unavailability reduces what SPM-31 reports as available,
-- and a removed record does not (the projector and smoke machine checks below).
-- Projector commitments:
--   approved reservation of 40, 09:00-11:00   -> counts (overlaps)
--   pending reservation of 50, 10:00-14:00    -> ignored (not confirmed)
--   unavailability of 30, 12:00-13:00         -> counts, but not at the same time as the 40
--   removed unavailability of 60              -> ignored
--   approved reservation of 70, 14:00-15:00   -> ignored (touches, does not overlap)
-- Busiest moment = 40, so 60 projectors are available.
insert into public.equipment_reservations (event_id, equipment_item_id, quantity, requested_by, starts_at, ends_at, status)
values
  ((select id from a_ids where name = 'event'), (select id from a_ids where name = 'proj'), 40, 'e5000000-0000-0000-0000-000000000003', '2099-06-01T09:00:00+08:00', '2099-06-01T11:00:00+08:00', 'approved'),
  ((select id from a_ids where name = 'event'), (select id from a_ids where name = 'proj'), 50, 'e5000000-0000-0000-0000-000000000003', '2099-06-01T10:00:00+08:00', '2099-06-01T14:00:00+08:00', 'pending'),
  ((select id from a_ids where name = 'event'), (select id from a_ids where name = 'proj'), 70, 'e5000000-0000-0000-0000-000000000003', '2099-06-01T14:00:00+08:00', '2099-06-01T15:00:00+08:00', 'approved');
insert into public.equipment_unavailability (equipment_item_id, quantity, reason, starts_at, ends_at, recorded_by, removed_at)
values
  ((select id from a_ids where name = 'proj'), 30, 'Lamp batch', '2099-06-01T12:00:00+08:00', '2099-06-01T13:00:00+08:00', 'e5000000-0000-0000-0000-000000000001', null),
  ((select id from a_ids where name = 'proj'), 60, 'Recorded in error', '2099-06-01T10:00:00+08:00', '2099-06-01T14:00:00+08:00', 'e5000000-0000-0000-0000-000000000001', now());

-- Both smoke machine units are out during the window (named units).
insert into public.equipment_unavailability (equipment_item_id, quantity, reason, starts_at, ends_at, recorded_by)
values ((select id from a_ids where name = 'smoke'), 2, 'Pump failure', '2099-06-01T08:00:00+08:00', '2099-06-01T18:00:00+08:00', 'e5000000-0000-0000-0000-000000000001');
insert into public.equipment_unavailability_units (unavailability_id, unit_id)
select (select id from public.equipment_unavailability where reason = 'Pump failure'), id
from public.equipment_units where equipment_item_id = (select id from a_ids where name = 'smoke');

-- One microphone is out, so 99 of 100 remain.
insert into public.equipment_unavailability (equipment_item_id, quantity, reason, starts_at, ends_at, recorded_by)
values ((select id from a_ids where name = 'mic'), 1, 'Battery', '2099-06-01T13:30:00+08:00', '2099-06-01T16:00:00+08:00', 'e5000000-0000-0000-0000-000000000001');

create temporary table a_result as select * from public.check_event_equipment_availability(array[]::uuid[]) limit 0;
grant all on a_result to authenticated;

-- The coordinator has requested this equipment (202610300007).
select set_config('app.requesting_equipment', 'on', true);
update public.event_equipment_requirements r set requested_at = now()
where r.requested_at is null
  and exists (select 1 from public.events e where e.id = r.event_id and e.status <> 'completed');
select set_config('app.requesting_equipment', 'off', true);

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"e5000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.check_event_equipment_availability(array[(select id from a_ids where name = 'event')])$$,
  '42501', 'Only Technical Support Staff can check equipment availability',
  'only Technical Support Staff can run the check'
);

select set_config('request.jwt.claims', '{"sub":"e5000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$insert into a_result select * from public.check_event_equipment_availability(array[(select id from a_ids where name = 'event')])$$,
  'Technical Support Staff can check an event'
);

select is(
  (select count(*)::integer from a_result),
  5,
  'one result for each requested item (SPM-31 AC01)'
);

-- Projector, 50 requested.
select is(
  (select row(total_units, reserved_quantity, unavailable_quantity, available_quantity, status) from a_result where requirement_id = (select id from a_ids where name = 'req-proj-50')),
  row(100, 40, 30, 60, 'available'::text),
  'confirmed reservations and outages reduce availability at their busiest moment (SPM-31 AC02/AC03)'
);
select is(
  (select technical_requirements from a_result where requirement_id = (select id from a_ids where name = 'req-proj-50')),
  'HDMI input',
  'the required characteristics are returned with the result (SPM-31 AC01)'
);
select is(
  (select row(requested_quantity, required_from) from a_result where requirement_id = (select id from a_ids where name = 'req-proj-50')),
  row(50, '2099-06-01T10:00:00+08:00'::timestamptz),
  'the requested quantity and period are returned (SPM-31 AC01)'
);

-- Projector, 80 requested: only 60 are free.
select is(
  (select row(available_quantity, status) from a_result where requirement_id = (select id from a_ids where name = 'req-proj-80')),
  row(60, 'partially_available'::text),
  'fewer free than requested is Partially Available, with the free quantity (SPM-31 AC04)'
);

-- Smoke machine: both units out.
select is(
  (select row(total_units, unavailable_quantity, available_quantity, status) from a_result where requirement_id = (select id from a_ids where name = 'req-smoke')),
  row(2, 2, 0, 'unavailable'::text),
  'none free is Unavailable (SPM-31 AC03/AC04)'
);

-- Microphone: 99 of the 100 requested.
select is(
  (select row(available_quantity, status) from a_result where requirement_id = (select id from a_ids where name = 'req-mic')),
  row(99, 'partially_available'::text),
  'an outage overlapping only part of the window still counts'
);

-- Legacy free-text row.
select is(
  (select row(equipment_item_id, equipment_name, status) from a_result where requirement_id = (select id from a_ids where name = 'req-legacy')),
  row(null::uuid, 'Old smoke machine'::text, 'unknown'::text),
  'an unknown equipment type is identified, not treated as available (SPM-31 AC05)'
);

-- Retiring a named unit: it leaves the stock and stops counting as out,
-- so it is not subtracted twice.
reset role;
update public.equipment_units set retired_at = now()
where equipment_item_id = (select id from a_ids where name = 'smoke') and unit_number = 2;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (
    select row(total_units, unavailable_quantity, available_quantity)
    from public.check_event_equipment_availability(array[(select id from a_ids where name = 'event')])
    where requirement_id = (select id from a_ids where name = 'req-smoke')
  ),
  row(1, 1, 0),
  'a retired unit on an outage is not subtracted twice'
);

-- A cancelled reservation no longer counts: only the 30-unit outage remains.
reset role;
update public.equipment_reservations set status = 'cancelled' where quantity = 40;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (
    select row(reserved_quantity, unavailable_quantity, available_quantity, status)
    from public.check_event_equipment_availability(array[(select id from a_ids where name = 'event')])
    where requirement_id = (select id from a_ids where name = 'req-proj-80')
  ),
  row(0, 30, 70, 'partially_available'::text),
  'a cancelled reservation no longer reduces availability'
);

-- SPM-31 AC03 + SPM-30 AC05: an outage ended early (the equipment returned)
-- only counts until it was ended. 50 projectors out 11:30-14:00, ended at
-- 12:00: they no longer overlap the 30 out 12:00-13:00, so the busiest moment
-- is 50, leaving 50 (ignoring the early end would leave only 20).
reset role;
insert into public.equipment_unavailability (equipment_item_id, quantity, reason, starts_at, ends_at, recorded_by, ended_at, ended_by)
values (
  (select id from a_ids where name = 'proj'), 50, 'Lamp check',
  '2099-06-01T11:30:00+08:00', '2099-06-01T14:00:00+08:00',
  'e5000000-0000-0000-0000-000000000001',
  '2099-06-01T12:00:00+08:00', 'e5000000-0000-0000-0000-000000000001'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (
    select row(unavailable_quantity, available_quantity, status)
    from public.check_event_equipment_availability(array[(select id from a_ids where name = 'event')])
    where requirement_id = (select id from a_ids where name = 'req-proj-80')
  ),
  row(50, 50, 'partially_available'::text),
  'an outage ended early stops counting when it was ended (SPM-31 AC03)'
);

select * from finish();
rollback;
