begin;

select plan(10);

-- Equipment reservations are released when their event ends
-- (202610150002_release_reservations_when_event_ends.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e9000000-0000-0000-0000-000000000001', 'ended-support@example.test', '{"full_name":"Ended Support","role":"technical_support_staff"}'::jsonb),
  ('e9000000-0000-0000-0000-000000000002', 'ended-organiser@example.test', '{"full_name":"Ended Organiser","role":"event_organiser"}'::jsonb),
  ('e9000000-0000-0000-0000-000000000003', 'ended-coordinator@example.test', '{"full_name":"Ended Coordinator","role":"event_coordinator"}'::jsonb);

create temporary table v_ids (name text primary key, id uuid);
grant all on v_ids to authenticated;
insert into v_ids select 'proj', id from public.equipment_items where code = 'proj';

-- Three Planning events at the same time, each requesting 30 projectors.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values
  ('e9000000-0000-0000-0000-0000000000e1', 'e9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000003',
   'To Be Cancelled', 'planning', '2099-09-01T10:00:00+08:00', '2099-09-01T14:00:00+08:00'),
  ('e9000000-0000-0000-0000-0000000000e2', 'e9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000003',
   'Still Running', 'planning', '2099-09-01T10:00:00+08:00', '2099-09-01T14:00:00+08:00'),
  ('e9000000-0000-0000-0000-0000000000e3', 'e9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000003',
   'Already Cancelled', 'planning', '2099-09-01T10:00:00+08:00', '2099-09-01T14:00:00+08:00');

insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
select e.id, (select id from v_ids where name = 'proj'), 'x', 30, e.starts_at, e.ends_at
from public.events e where e.id::text like 'e9000000-%';
insert into v_ids select 'req-cancel', id from public.event_equipment_requirements where event_id = 'e9000000-0000-0000-0000-0000000000e1';
insert into v_ids select 'req-running', id from public.event_equipment_requirements where event_id = 'e9000000-0000-0000-0000-0000000000e2';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e9000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into v_ids select 'res-cancel', public.reserve_equipment((select id from v_ids where name = 'req-cancel'), 30);
insert into v_ids select 'res-running', public.reserve_equipment((select id from v_ids where name = 'req-running'), 30);

select is(
  (
    select available_quantity from public.check_event_equipment_availability(array['e9000000-0000-0000-0000-0000000000e2'::uuid])
  ),
  70,
  'while both events are planned, the other event''s 30 are held'
);

-- Cancelling the event releases its reservation.
reset role;
update public.events set status = 'cancelled' where id = 'e9000000-0000-0000-0000-0000000000e1';
select is(
  (select row(status::text, needs_recheck, released_at is not null) from public.equipment_reservations where id = (select id from v_ids where name = 'res-cancel')),
  row('cancelled'::text, false, true),
  'cancelling an event releases its reservation'
);
select is(
  (
    select row(action, details ->> 'reason', (details ->> 'quantity')::integer)
    from public.equipment_reservation_events
    where reservation_id = (select id from v_ids where name = 'res-cancel') order by id desc limit 1
  ),
  row('released'::text, 'The event was cancelled'::text, 30),
  'the release is recorded with the reason (AC5)'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e9000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (
    select available_quantity from public.check_event_equipment_availability(array['e9000000-0000-0000-0000-0000000000e2'::uuid])
  ),
  100,
  'the released units return to the pool for the other event'
);
select is(
  (select status::text from public.equipment_reservations where id = (select id from v_ids where name = 'res-running')),
  'approved',
  'another event''s reservation is untouched'
);

-- Completing an event releases too.
reset role;
update public.events set status = 'pending_safety_check' where id = 'e9000000-0000-0000-0000-0000000000e2';
update public.events set status = 'confirmed' where id = 'e9000000-0000-0000-0000-0000000000e2';
select is(
  (select status::text from public.equipment_reservations where id = (select id from v_ids where name = 'res-running')),
  'approved',
  'a status change that does not end the event keeps the reservation'
);
update public.events set status = 'completed' where id = 'e9000000-0000-0000-0000-0000000000e2';
select is(
  (
    select row(r.status::text, ev.details ->> 'reason')
    from public.equipment_reservations r
    join public.equipment_reservation_events ev on ev.reservation_id = r.id
    where r.id = (select id from v_ids where name = 'res-running')
    order by ev.id desc limit 1
  ),
  row('cancelled'::text, 'The event was completed'::text),
  'completing an event releases its reservation, recording why'
);

-- Rejecting a Requested event releases too.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values ('e9000000-0000-0000-0000-0000000000e4', 'e9000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000003', 'To Be Rejected', 'requested',
        '2099-09-02T10:00:00+08:00', '2099-09-02T14:00:00+08:00');
insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
values ('e9000000-0000-0000-0000-0000000000e4', (select id from v_ids where name = 'proj'), 'x', 5,
        '2099-09-02T10:00:00+08:00', '2099-09-02T14:00:00+08:00');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e9000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into v_ids select 'res-reject', public.reserve_equipment(
  (select id from public.event_equipment_requirements where event_id = 'e9000000-0000-0000-0000-0000000000e4'), 5);
reset role;
update public.events set status = 'rejected' where id = 'e9000000-0000-0000-0000-0000000000e4';
select is(
  (select status::text from public.equipment_reservations where id = (select id from v_ids where name = 'res-reject')),
  'cancelled',
  'rejecting an event releases its reservation'
);

-- A reservation already stuck on an ended event (as before the fix) is
-- released by the same routine the migration ran once.
alter table public.events disable trigger events_release_equipment_reservations;
insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
values ('e9000000-0000-0000-0000-0000000000e3', (select id from v_ids where name = 'proj'), 'x', 1,
        '2099-09-01T10:00:00+08:00', '2099-09-01T14:00:00+08:00');
insert into public.equipment_reservations (event_id, equipment_item_id, quantity, starts_at, ends_at, status, requested_by, decided_by, decided_at)
values ('e9000000-0000-0000-0000-0000000000e3', (select id from v_ids where name = 'proj'), 1,
        '2099-09-01T10:00:00+08:00', '2099-09-01T14:00:00+08:00', 'approved',
        'e9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001', now());
update public.events set status = 'cancelled' where id = 'e9000000-0000-0000-0000-0000000000e3';
alter table public.events enable trigger events_release_equipment_reservations;
select is(
  (select count(*)::integer from public.equipment_reservations where event_id = 'e9000000-0000-0000-0000-0000000000e3' and status = 'approved'),
  1,
  'set-up: a reservation is stuck on an already-cancelled event'
);
select public.release_reservations_for_ended_event('e9000000-0000-0000-0000-0000000000e3', 'The event was cancelled');
select is(
  (select count(*)::integer from public.equipment_reservations where event_id = 'e9000000-0000-0000-0000-0000000000e3' and status = 'approved'),
  0,
  'the clean-up releases a reservation stuck on an ended event'
);

select * from finish();
rollback;
