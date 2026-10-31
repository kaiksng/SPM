begin;

select plan(10);

-- Technical Support Staff's reservation actions record the arrangement status
-- (202610290003_record_arrangement_on_reservation.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  ('ea000000-0000-0000-0000-000000000001', 'flow-support@example.test', '{"full_name":"Flow Support","role":"technical_support_staff"}'::jsonb),
  ('ea000000-0000-0000-0000-000000000002', 'flow-organiser@example.test', '{"full_name":"Flow Organiser","role":"event_organiser"}'::jsonb),
  ('ea000000-0000-0000-0000-000000000003', 'flow-coordinator@example.test', '{"full_name":"Flow Coordinator","role":"event_coordinator"}'::jsonb);

create temporary table v_ids (name text primary key, id uuid);
grant all on v_ids to authenticated;
insert into v_ids select 'mic', id from public.equipment_items where code = 'mic';

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values
  ('ea000000-0000-0000-0000-0000000000e1', 'ea000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000003',
   'Flow Expo', 'planning', '2099-11-01T10:00:00+08:00', '2099-11-01T14:00:00+08:00'),
  ('ea000000-0000-0000-0000-0000000000e2', 'ea000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000003',
   'Flow Review', 'planning', '2099-11-02T10:00:00+08:00', '2099-11-02T14:00:00+08:00');

insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until, notes)
values
  ('ea000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 2, '2099-11-01T10:00:00+08:00', '2099-11-01T14:00:00+08:00', 'two'),
  ('ea000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 5, '2099-11-01T10:00:00+08:00', '2099-11-01T14:00:00+08:00', 'five'),
  ('ea000000-0000-0000-0000-0000000000e2', (select id from v_ids where name = 'mic'), 'x', 1, '2099-11-02T10:00:00+08:00', '2099-11-02T14:00:00+08:00', 'review');
insert into v_ids select notes, id from public.event_equipment_requirements where event_id in ('ea000000-0000-0000-0000-0000000000e1', 'ea000000-0000-0000-0000-0000000000e2');

create function pg_temp.latest(p_name text) returns record language sql as $$
  select row(status, note) from public.equipment_arrangement_updates
  where requirement_id = (select id from v_ids where name = p_name) order by id desc limit 1
$$;

-- The coordinator has requested this equipment (202610300007).
select set_config('app.requesting_equipment', 'on', true);
update public.event_equipment_requirements r set requested_at = now()
where r.requested_at is null
  and exists (select 1 from public.events e where e.id = r.event_id and e.status <> 'completed');
select set_config('app.requesting_equipment', 'off', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ea000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into v_ids select 'res-two', public.reserve_equipment((select id from v_ids where name = 'two'), 2);
select is(pg_temp.latest('two'), row('arranged'::text, 'Reserved 2 of 2'::text), 'reserving in full records Arranged');
select is(
  (select updated_by from public.equipment_arrangement_updates where requirement_id = (select id from v_ids where name = 'two') order by id desc limit 1),
  'ea000000-0000-0000-0000-000000000001'::uuid,
  'recorded as the staff member who reserved it (SPM-28 AC03)'
);

insert into v_ids select 'res-five', public.reserve_equipment((select id from v_ids where name = 'five'), 3);
select is(pg_temp.latest('five'), row('in_progress'::text, 'Reserved 3 of 5'::text), 'reserving in part records In progress');

select public.change_equipment_reservation((select id from v_ids where name = 'res-five'), 5);
select is(pg_temp.latest('five'), row('arranged'::text, 'Reserved 5 of 5'::text), 'topping it up to the request records Arranged');

select public.release_equipment_reservation((select id from v_ids where name = 'res-five'), 'Not needed');
select is(pg_temp.latest('five'), row('not_started'::text, 'Reservation released'::text), 'releasing records Not started, until the next action');
select is(
  (select count(*)::int from public.equipment_arrangement_updates where requirement_id = (select id from v_ids where name = 'five')),
  3,
  'every step stays in the history (SPM-28 AC03)'
);

-- A coordinator's change is recorded once, by 202610290002, not again here.
reset role;
select set_config('request.jwt.claims', '{"sub":"ea000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
update public.event_equipment_requirements set notes = 'two, with stands' where id = (select id from v_ids where name = 'two');
select is(
  (select count(*)::int from public.equipment_arrangement_updates where requirement_id = (select id from v_ids where name = 'two')),
  2,
  'the coordinator''s change adds only its own Issue entry'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ea000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.change_equipment_reservation((select id from v_ids where name = 'res-two'), 2);
select is(pg_temp.latest('two'), row('arranged'::text, 'Re-checked: 2 of 2 reserved'::text), 're-checking a flagged reservation records Arranged again');

-- Pending Safety Check freezes arrangements: a release then records nothing.
insert into v_ids select 'res-review', public.reserve_equipment((select id from v_ids where name = 'review'), 1);
reset role;
update public.events set status = 'pending_safety_check' where id = 'ea000000-0000-0000-0000-0000000000e2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ea000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.release_equipment_reservation((select id from v_ids where name = 'res-review'), 'Not needed')$$,
  'staff can still release while the event awaits its safety check'
);
select is(
  (select count(*)::int from public.equipment_arrangement_updates where requirement_id = (select id from v_ids where name = 'review')),
  1,
  'but no arrangement status is recorded for it then'
);

select * from finish();
rollback;
