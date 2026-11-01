begin;

select plan(9);

-- A change to an equipment request goes back to Technical Support Staff
-- (202610290002_equipment_change_needs_recheck.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  ('ec000000-0000-0000-0000-000000000001', 'recheck-support@example.test', '{"full_name":"Recheck Support","role":"technical_support_staff"}'::jsonb),
  ('ec000000-0000-0000-0000-000000000002', 'recheck-organiser@example.test', '{"full_name":"Recheck Organiser","role":"event_organiser"}'::jsonb),
  ('ec000000-0000-0000-0000-000000000003', 'recheck-coordinator@example.test', '{"full_name":"Recheck Coordinator","role":"event_coordinator"}'::jsonb);

create temporary table v_ids (name text primary key, id uuid);
grant all on v_ids to authenticated;
insert into v_ids select 'mic', id from public.equipment_items where code = 'mic';

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values ('ec000000-0000-0000-0000-0000000000e1', 'ec000000-0000-0000-0000-000000000002', 'ec000000-0000-0000-0000-000000000003',
        'Recheck Expo', 'planning', '2099-10-01T10:00:00+08:00', '2099-10-01T14:00:00+08:00');

-- worked: reserved in full (Arranged). notes-only: reserved. untouched: nothing done yet.
insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until, notes)
values
  ('ec000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 2, '2099-10-01T10:00:00+08:00', '2099-10-01T14:00:00+08:00', 'worked'),
  ('ec000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 1, '2099-10-01T10:00:00+08:00', '2099-10-01T14:00:00+08:00', 'notes-only'),
  ('ec000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 1, '2099-10-01T10:00:00+08:00', '2099-10-01T14:00:00+08:00', 'untouched');
insert into v_ids select notes, id from public.event_equipment_requirements where event_id = 'ec000000-0000-0000-0000-0000000000e1';

-- The coordinator has requested this equipment (202610300007).
select set_config('app.requesting_equipment', 'on', true);
update public.event_equipment_requirements r set requested_at = now()
where r.requested_at is null
  and exists (select 1 from public.events e where e.id = r.event_id and e.status <> 'completed');
select set_config('app.requesting_equipment', 'off', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ec000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into v_ids select 'res-worked', public.reserve_equipment((select id from v_ids where name = 'worked'), 2);
insert into v_ids select 'res-notes', public.reserve_equipment((select id from v_ids where name = 'notes-only'), 1);
reset role;

-- The coordinator changes the requests (as update_event_as_coordinator would).
select set_config('request.jwt.claims', '{"sub":"ec000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
update public.event_equipment_requirements set quantity = 3 where id = (select id from v_ids where name = 'worked');

select is(
  (select row(status, note, updated_by) from public.equipment_arrangement_updates
   where requirement_id = (select id from v_ids where name = 'worked') order by id desc limit 1),
  row('issue'::text, 'The coordinator changed this request. Re-check it.'::text, 'ec000000-0000-0000-0000-000000000003'::uuid),
  'an Arranged item is reset to Issue when the coordinator changes the quantity'
);
select is(
  (select count(*)::int from public.equipment_arrangement_updates where requirement_id = (select id from v_ids where name = 'worked')),
  2,
  'the earlier entry (Arranged by the reservation) stays in the history (SPM-28 AC03)'
);
select is(
  (select row(needs_recheck, recheck_reason) from public.equipment_reservations where id = (select id from v_ids where name = 'res-worked')),
  row(true, 'The requested quantity changed from 2 to 3'::text),
  'its reservation is flagged for re-check'
);
select is(
  (select status::text from public.equipment_reservations where id = (select id from v_ids where name = 'res-worked')),
  'approved',
  'the reservation is not cancelled or released'
);

update public.event_equipment_requirements set notes = 'Needs a stand' where id = (select id from v_ids where name = 'notes-only');
select is(
  (select row(needs_recheck, recheck_reason) from public.equipment_reservations where id = (select id from v_ids where name = 'res-notes')),
  row(true, 'The technical requirements changed'::text),
  'a change to the technical requirements alone flags the reservation'
);
select is(
  (select status from public.equipment_arrangement_updates
   where requirement_id = (select id from v_ids where name = 'notes-only') order by id desc limit 1),
  'issue',
  'and resets the arrangement to Issue'
);

update public.event_equipment_requirements set quantity = 2 where id = (select id from v_ids where name = 'untouched');
select is(
  (select count(*)::int from public.equipment_arrangement_updates where requirement_id = (select id from v_ids where name = 'untouched')),
  0,
  'a request staff had not started on gets no Issue entry'
);

update public.event_equipment_requirements set quantity = quantity where id = (select id from v_ids where name = 'worked');
select is(
  (select count(*)::int from public.equipment_arrangement_updates where requirement_id = (select id from v_ids where name = 'worked')),
  2,
  'saving a request unchanged adds nothing'
);

set local role authenticated;
select throws_ok(
  $$insert into public.equipment_arrangement_updates (requirement_id, event_id, status, note, updated_by)
    values ((select id from v_ids where name = 'worked'), 'ec000000-0000-0000-0000-0000000000e1', 'arranged', null,
            'ec000000-0000-0000-0000-000000000003')$$,
  '42501', null,
  'the coordinator still cannot set an arrangement status themselves (SPM-28 AC04)'
);

select * from finish();
rollback;
