begin;

select plan(37);

-- Reserve equipment for an event (202610061002_reserve_equipment.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e6000000-0000-0000-0000-000000000001', 'reserve-support@example.test', '{"full_name":"Reserve Support","role":"technical_support_staff"}'::jsonb),
  ('e6000000-0000-0000-0000-000000000002', 'reserve-organiser@example.test', '{"full_name":"Reserve Organiser","role":"event_organiser"}'::jsonb),
  ('e6000000-0000-0000-0000-000000000003', 'reserve-coordinator@example.test', '{"full_name":"Reserve Coordinator","role":"event_coordinator"}'::jsonb);

create temporary table v_ids (name text primary key, id uuid);
grant all on v_ids to authenticated;
insert into v_ids select 'proj', id from public.equipment_items where code = 'proj';

-- A Planning event with three projector requests over 10:00-14:00 and one
-- legacy free-text request. Projector has 100 units.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values ('e6000000-0000-0000-0000-0000000000e1', 'e6000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-000000000003',
        'Reservation Expo', 'planning', '2099-07-01T10:00:00+08:00', '2099-07-01T14:00:00+08:00');
insert into v_ids values ('event', 'e6000000-0000-0000-0000-0000000000e1');

insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
values
  ((select id from v_ids where name = 'event'), (select id from v_ids where name = 'proj'), 'x', 60, '2099-07-01T10:00:00+08:00', '2099-07-01T14:00:00+08:00'),
  ((select id from v_ids where name = 'event'), (select id from v_ids where name = 'proj'), 'x', 50, '2099-07-01T10:00:00+08:00', '2099-07-01T14:00:00+08:00'),
  ((select id from v_ids where name = 'event'), (select id from v_ids where name = 'proj'), 'x', 1, '2099-07-01T11:00:00+08:00', '2099-07-01T12:00:00+08:00');
insert into v_ids select 'req-60', id from public.event_equipment_requirements where event_id = (select id from v_ids where name = 'event') and quantity = 60;
insert into v_ids select 'req-50', id from public.event_equipment_requirements where event_id = (select id from v_ids where name = 'event') and quantity = 50;
insert into v_ids select 'req-1', id from public.event_equipment_requirements where event_id = (select id from v_ids where name = 'event') and quantity = 1;

alter table public.event_equipment_requirements disable trigger event_equipment_requirements_guard;
insert into public.event_equipment_requirements (event_id, equipment_name, quantity)
values ((select id from v_ids where name = 'event'), 'Old projector', 1);
alter table public.event_equipment_requirements enable trigger event_equipment_requirements_guard;
insert into v_ids select 'req-legacy', id from public.event_equipment_requirements where equipment_name = 'Old projector';

-- A Requested event: still a request, so nothing can be reserved for it yet.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values ('e6000000-0000-0000-0000-0000000000e2', 'e6000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-000000000003',
        'Requested Expo', 'requested', '2099-07-02T10:00:00+08:00', '2099-07-02T14:00:00+08:00');
insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
values ('e6000000-0000-0000-0000-0000000000e2', (select id from v_ids where name = 'proj'), 'x', 1, '2099-07-02T10:00:00+08:00', '2099-07-02T14:00:00+08:00');
insert into v_ids select 'req-requested', id from public.event_equipment_requirements where event_id = 'e6000000-0000-0000-0000-0000000000e2';

-- The coordinator has requested this equipment (202610300007).
select set_config('app.requesting_equipment', 'on', true);
update public.event_equipment_requirements r set requested_at = now()
where r.requested_at is null
  and exists (select 1 from public.events e where e.id = r.event_id and e.status <> 'completed');
select set_config('app.requesting_equipment', 'off', true);

set local role authenticated;

-- Only Technical Support Staff reserve.
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.reserve_equipment((select id from v_ids where name = 'req-60'), 60)$$,
  '42501', 'Only Technical Support Staff can reserve equipment',
  'a coordinator cannot reserve through this path'
);

select set_config('request.jwt.claims', '{"sub":"e6000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.reserve_equipment((select id from v_ids where name = 'req-requested'), 1)$$,
  '23514', 'Equipment can only be reserved for a Planning or Confirmed event',
  'nothing can be reserved for a Requested event until it is in Planning'
);

-- AC1.
select lives_ok(
  $$insert into v_ids select 'res-60', public.reserve_equipment((select id from v_ids where name = 'req-60'), 60)$$,
  'staff reserve 60 projectors when enough are available (SPM-32 AC01)'
);
select is(
  (
    select row(event_id, equipment_item_id, quantity, starts_at, ends_at, status::text, decided_by, decided_at is not null)
    from public.equipment_reservations where id = (select id from v_ids where name = 'res-60')
  ),
  row(
    (select id from v_ids where name = 'event'), (select id from v_ids where name = 'proj'), 60,
    '2099-07-01T10:00:00+08:00'::timestamptz, '2099-07-01T14:00:00+08:00'::timestamptz,
    'approved'::text, 'e6000000-0000-0000-0000-000000000001'::uuid, true
  ),
  'the event, equipment, quantity, period, staff member and time are recorded (SPM-32 AC01)'
);
select is(
  (select row(action, actor) from public.equipment_reservation_events where reservation_id = (select id from v_ids where name = 'res-60')),
  row('reserved'::text, 'e6000000-0000-0000-0000-000000000001'::uuid),
  'the reservation is logged'
);
select throws_ok(
  $$select public.reserve_equipment((select id from v_ids where name = 'req-60'), 10)$$,
  '23514', 'This equipment is already reserved — change the reservation instead',
  'a request cannot be reserved twice'
);
select throws_ok(
  $$select public.reserve_equipment((select id from v_ids where name = 'req-1'), 2)$$,
  '23514', 'Cannot reserve more than the 1 requested',
  'staff cannot reserve more than was requested'
);
select throws_ok(
  $$select public.reserve_equipment((select id from v_ids where name = 'req-legacy'), 1)$$,
  '23514', 'This equipment is not in the catalogue, so it cannot be reserved',
  'unknown equipment cannot be reserved'
);

-- AC2: 50 requested, only 40 left.
select throws_ok(
  $$select public.reserve_equipment((select id from v_ids where name = 'req-50'), 50)$$,
  '23514', 'Only 40 available for this period',
  'a reservation over availability is rejected, stating what is available (SPM-32 AC02)'
);

-- AC3: the reserved 60 no longer count for an overlapping check.
select is(
  (
    select row(available_quantity, status)
    from public.check_event_equipment_availability(array[(select id from v_ids where name = 'event')])
    where requirement_id = (select id from v_ids where name = 'req-50')
  ),
  row(40, 'partially_available'::text),
  'an overlapping check no longer counts the reserved quantity (SPM-32 AC03)'
);
select is(
  (
    select row(available_quantity, status, reservation_quantity, reserved_by_name)
    from public.check_event_equipment_availability(array[(select id from v_ids where name = 'event')])
    where requirement_id = (select id from v_ids where name = 'req-60')
  ),
  row(100, 'available'::text, 60, 'Reserve Support'::text),
  'a reserved request does not count its own reservation against itself, and shows it'
);

select lives_ok(
  $$insert into v_ids select 'res-40', public.reserve_equipment((select id from v_ids where name = 'req-50'), 40)$$,
  'staff can reserve the 40 that remain'
);
select is(
  (
    select available_quantity
    from public.check_event_equipment_availability(array[(select id from v_ids where name = 'event')])
    where requirement_id = (select id from v_ids where name = 'req-1')
  ),
  0,
  'with 100 reserved, nothing is left for another overlapping request'
);

-- AC4: a change to the reserved request flags it.
reset role;
update public.event_equipment_requirements set quantity = 65 where id = (select id from v_ids where name = 'req-60');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select row(needs_recheck, recheck_reason) from public.equipment_reservations where id = (select id from v_ids where name = 'res-60')),
  row(true, 'The requested quantity changed from 60 to 65'::text),
  'a changed requirement marks its reservation for re-checking (SPM-32 AC04)'
);
select is(
  (select needs_recheck from public.equipment_reservations where id = (select id from v_ids where name = 'res-40')),
  false,
  'other reservations are not flagged'
);

-- AC4: a schedule change flags every reservation of the event.
reset role;
update public.events set starts_at = '2099-07-01T09:00:00+08:00' where id = (select id from v_ids where name = 'event');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select row(needs_recheck, recheck_reason) from public.equipment_reservations where id = (select id from v_ids where name = 'res-40')),
  row(true, 'The event date or time changed'::text),
  'a changed event date or time marks its reservations for re-checking (SPM-32 AC04)'
);
select is(
  (select count(*)::integer from public.equipment_reservation_events where action = 'flagged_for_recheck'),
  3,
  'each flag is logged'
);

-- Re-checking clears the flag when it still fits.
select lives_ok(
  $$select public.change_equipment_reservation((select id from v_ids where name = 'res-40'), 40)$$,
  'a flagged reservation can be re-checked'
);
select is(
  (select row(needs_recheck, recheck_reason) from public.equipment_reservations where id = (select id from v_ids where name = 'res-40')),
  row(false, null::text),
  're-checking clears the flag'
);
select is(
  (select action from public.equipment_reservation_events where reservation_id = (select id from v_ids where name = 'res-40') order by id desc limit 1),
  'rechecked',
  'an unchanged re-check is logged as a re-check'
);

-- AC5: changing.
select throws_ok(
  $$select public.change_equipment_reservation((select id from v_ids where name = 'res-60'), 65)$$,
  '23514', 'Only 60 available for this period',
  'a change over availability is rejected, stating what is available'
);
select lives_ok(
  $$select public.change_equipment_reservation((select id from v_ids where name = 'res-60'), 55)$$,
  'a reservation can be reduced'
);
select is(
  (select row(quantity, needs_recheck) from public.equipment_reservations where id = (select id from v_ids where name = 'res-60')),
  row(55, false),
  'the change is applied and the flag cleared'
);
select is(
  (
    select row(action, details #>> '{previous,quantity}', details #>> '{new,quantity}')
    from public.equipment_reservation_events
    where reservation_id = (select id from v_ids where name = 'res-60') order by id desc limit 1
  ),
  row('changed'::text, '60'::text, '55'::text),
  'the change is logged with previous and new quantity (SPM-32 AC05)'
);
select is(
  (
    select available_quantity
    from public.check_event_equipment_availability(array[(select id from v_ids where name = 'event')])
    where requirement_id = (select id from v_ids where name = 'req-1')
  ),
  5,
  'the 5 given back return to the pool (SPM-32 AC05)'
);

-- AC5: releasing.
select lives_ok(
  $$select public.release_equipment_reservation((select id from v_ids where name = 'res-40'), 'Organiser no longer needs them')$$,
  'a reservation can be released'
);
select is(
  (select row(status::text, released_by) from public.equipment_reservations where id = (select id from v_ids where name = 'res-40')),
  row('cancelled'::text, 'e6000000-0000-0000-0000-000000000001'::uuid),
  'the release records who released it'
);
select is(
  (
    select available_quantity
    from public.check_event_equipment_availability(array[(select id from v_ids where name = 'event')])
    where requirement_id = (select id from v_ids where name = 'req-1')
  ),
  45,
  'released units return to the pool (SPM-32 AC05)'
);
select is(
  (
    select row(action, details ->> 'reason')
    from public.equipment_reservation_events
    where reservation_id = (select id from v_ids where name = 'res-40') order by id desc limit 1
  ),
  row('released'::text, 'Organiser no longer needs them'::text),
  'the release is logged with its reason (SPM-32 AC05)'
);

-- A removed request flags its reservation.
reset role;
delete from public.event_equipment_requirements where id = (select id from v_ids where name = 'req-60');
set local role authenticated;

-- The assigned coordinator can see the arrangements and their history (SPM-32 AC01).
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (
    select row(needs_recheck, recheck_reason, requirement_id)
    from public.equipment_reservations where id = (select id from v_ids where name = 'res-60')
  ),
  row(true, 'The equipment request was removed'::text, null::uuid),
  'a removed request flags its reservation, visible to the coordinator (SPM-32 AC01/AC04)'
);
select ok(
  (select count(*) from public.equipment_reservation_events) > 0,
  'the coordinator can read the reservation history'
);

-- A reservation whose request was removed still holds stock, so Technical
-- Support Staff must be able to find it and release it.
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (
    select count(*)::integer from public.equipment_reservations r
    join public.events e on e.id = r.event_id
    where r.status = 'approved' and r.requirement_id is null and e.status = 'planning'
  ),
  1,
  'staff can see the live reservation left by a removed request'
);
select lives_ok(
  $$select public.release_equipment_reservation((select id from v_ids where name = 'res-60'), 'Request removed')$$,
  'staff can release a reservation whose request was removed (SPM-32 AC05)'
);
select is(
  (select row(status::text, needs_recheck) from public.equipment_reservations where id = (select id from v_ids where name = 'res-60')),
  row('cancelled'::text, false),
  'the released reservation no longer holds stock or needs a re-check'
);

-- Releasing stays open while the event awaits its safety check, even though
-- reserving and changing are refused then.
select lives_ok(
  $$insert into v_ids select 'res-safety', public.reserve_equipment((select id from v_ids where name = 'req-1'), 1)$$,
  'staff reserve one projector while the event is in Planning'
);
reset role;
update public.events set status = 'pending_safety_check' where id = (select id from v_ids where name = 'event');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.change_equipment_reservation((select id from v_ids where name = 'res-safety'), 1)$$,
  '23514', 'Equipment can only be reserved for a Planning or Confirmed event',
  'a reservation cannot be changed while the event awaits its safety check'
);
select lives_ok(
  $$select public.release_equipment_reservation((select id from v_ids where name = 'res-safety'), null)$$,
  'a reservation can still be released while the event awaits its safety check'
);

select * from finish();
rollback;
