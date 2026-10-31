begin;

select plan(14);

-- SPM-28: an equipment requirement's arrangement status always follows its
-- reservation, and its history is recorded by the system, never set by hand
-- (202610150001, 202610290003, 202610310005).

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e8000000-0000-0000-0000-000000000001', 'arrange-support@example.test', '{"full_name":"Arrange Support","role":"technical_support_staff"}'::jsonb),
  ('e8000000-0000-0000-0000-000000000002', 'arrange-organiser@example.test', '{"full_name":"Arrange Organiser","role":"event_organiser"}'::jsonb),
  ('e8000000-0000-0000-0000-000000000003', 'arrange-coordinator@example.test', '{"full_name":"Arrange Coordinator","role":"event_coordinator"}'::jsonb),
  ('e8000000-0000-0000-0000-000000000004', 'arrange-other-coordinator@example.test', '{"full_name":"Other Coordinator","role":"event_coordinator"}'::jsonb),
  ('e8000000-0000-0000-0000-000000000005', 'arrange-support-two@example.test', '{"full_name":"Second Support","role":"technical_support_staff"}'::jsonb);

create temporary table v_ids (name text primary key, id uuid);
grant all on v_ids to authenticated;
insert into v_ids select 'mic', id from public.equipment_items where code = 'mic';

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values ('e8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000003',
        'Arrangement Planning', 'planning', '2099-08-01T10:00:00+08:00', '2099-08-01T14:00:00+08:00');

-- full: reserved in full. part: reserved in part. open: not reserved yet.
insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until, notes)
values
  ('e8000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 2, '2099-08-01T10:00:00+08:00', '2099-08-01T14:00:00+08:00', 'full'),
  ('e8000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 4, '2099-08-01T10:00:00+08:00', '2099-08-01T14:00:00+08:00', 'part'),
  ('e8000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 1, '2099-08-01T10:00:00+08:00', '2099-08-01T14:00:00+08:00', 'open');
insert into v_ids select notes, id from public.event_equipment_requirements where event_id = 'e8000000-0000-0000-0000-0000000000e1';

-- The coordinator has requested this equipment (202610300007).
select set_config('app.requesting_equipment', 'on', true);
update public.event_equipment_requirements set requested_at = now()
where event_id = 'e8000000-0000-0000-0000-0000000000e1';
select set_config('app.requesting_equipment', 'off', true);

create function pg_temp.readiness_status(p_requirement text) returns text language sql as $$
  select item ->> 'status'
  from jsonb_array_elements(public.event_readiness('e8000000-0000-0000-0000-0000000000e1') -> 'equipment') item
  where (item ->> 'requirementId')::uuid = (select id from v_ids where name = p_requirement)
$$;

-- AC04-AC06: nobody sets a status or note by hand.
select hasnt_function('public', 'update_equipment_arrangement', 'there is no function to set an arrangement status by hand (SPM-28 AC06)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.equipment_arrangement_updates (requirement_id, event_id, status, updated_by)
    values ((select id from v_ids where name = 'open'), 'e8000000-0000-0000-0000-0000000000e1', 'arranged', auth.uid())$$,
  '42501', null,
  'not even Technical Support Staff can write the history directly (SPM-28 AC06)'
);

-- AC02 + AC03: reserving records the status it leads to.
select is(
  (select count(*)::integer from public.equipment_arrangement_updates where requirement_id = (select id from v_ids where name = 'open')),
  0,
  'a requirement nothing has happened to has no history (SPM-28 AC02)'
);
insert into v_ids select 'res-full', public.reserve_equipment((select id from v_ids where name = 'full'), 2);
insert into v_ids select 'res-part', public.reserve_equipment((select id from v_ids where name = 'part'), 1);
select is(
  (select row(status, note, updated_by) from public.equipment_arrangement_updates
   where requirement_id = (select id from v_ids where name = 'full') order by id desc limit 1),
  row('arranged'::text, 'Reserved 2 of 2'::text, 'e8000000-0000-0000-0000-000000000001'::uuid),
  'reserving in full records Arranged, and who did it (SPM-28 AC03)'
);
select is(
  (select status from public.equipment_arrangement_updates
   where requirement_id = (select id from v_ids where name = 'part') order by id desc limit 1),
  'in_progress',
  'reserving in part records In progress (SPM-28 AC02)'
);
reset role;

-- AC02: readiness works the status out from the reservation, whatever the
-- history last said (an Issue left from before hand-set statuses were
-- removed changes nothing).
insert into public.equipment_arrangement_updates (requirement_id, event_id, status, note, updated_by)
values ((select id from v_ids where name = 'full'), 'e8000000-0000-0000-0000-0000000000e1', 'issue', 'faulty',
        'e8000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(pg_temp.readiness_status('full'), 'complete', 'reserved in full is Arranged, so readiness counts it complete (SPM-28 AC02)');
select is(pg_temp.readiness_status('part'), 'pending', 'reserved in part is In progress, so still pending (SPM-28 AC02)');
select is(pg_temp.readiness_status('open'), 'pending', 'not reserved but reservable is Not started, so still pending (SPM-28 AC02)');
reset role;

-- AC02: once it can't be reserved in full, an unreserved item is an Issue.
update public.equipment_items set retired_at = now() where id = (select id from v_ids where name = 'mic');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(pg_temp.readiness_status('open'), 'needs_review', 'an unreserved item that can no longer be reserved is an Issue (SPM-28 AC02)');
select is(pg_temp.readiness_status('full'), 'complete', 'an item already reserved in full stays Arranged');

-- AC07: who can read the history.
select is(
  (select count(*)::integer from public.equipment_arrangement_updates where event_id = 'e8000000-0000-0000-0000-0000000000e1'),
  3,
  'the assigned coordinator sees the history (SPM-28 AC07)'
);
select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.equipment_arrangement_updates where event_id = 'e8000000-0000-0000-0000-0000000000e1'),
  3,
  'other Technical Support Staff see the history'
);
select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.equipment_arrangement_updates),
  0,
  'a coordinator not assigned to the event sees nothing'
);
select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.equipment_arrangement_updates),
  0,
  'the organiser sees nothing'
);
reset role;

select * from finish();
rollback;
