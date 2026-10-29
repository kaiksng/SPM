begin;

select plan(4);

-- Arranged only when the stock is held (202610290004_arranged_requires_reservation.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  ('eb000000-0000-0000-0000-000000000001', 'held-support@example.test', '{"full_name":"Held Support","role":"technical_support_staff"}'::jsonb),
  ('eb000000-0000-0000-0000-000000000002', 'held-organiser@example.test', '{"full_name":"Held Organiser","role":"event_organiser"}'::jsonb),
  ('eb000000-0000-0000-0000-000000000003', 'held-coordinator@example.test', '{"full_name":"Held Coordinator","role":"event_coordinator"}'::jsonb);

create temporary table v_ids (name text primary key, id uuid);
grant all on v_ids to authenticated;
insert into v_ids select 'mic', id from public.equipment_items where code = 'mic';

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values ('eb000000-0000-0000-0000-0000000000e1', 'eb000000-0000-0000-0000-000000000002', 'eb000000-0000-0000-0000-000000000003',
        'Held Expo', 'planning', '2099-12-01T10:00:00+08:00', '2099-12-01T14:00:00+08:00');

insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until, notes)
values
  ('eb000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 4, '2099-12-01T10:00:00+08:00', '2099-12-01T14:00:00+08:00', 'part'),
  ('eb000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 1, '2099-12-01T10:00:00+08:00', '2099-12-01T14:00:00+08:00', 'flagged');
insert into v_ids select notes, id from public.event_equipment_requirements where event_id = 'eb000000-0000-0000-0000-0000000000e1';

-- Equipment saved before the catalogue existed cannot be reserved here.
alter table public.event_equipment_requirements disable trigger event_equipment_requirements_guard;
insert into public.event_equipment_requirements (event_id, equipment_name, quantity)
values ('eb000000-0000-0000-0000-0000000000e1', 'Borrowed smoke machine', 1);
alter table public.event_equipment_requirements enable trigger event_equipment_requirements_guard;
insert into v_ids select 'legacy', id from public.event_equipment_requirements where equipment_name = 'Borrowed smoke machine';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eb000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into v_ids select 'res-part', public.reserve_equipment((select id from v_ids where name = 'part'), 2);
select throws_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'part'), 'arranged', 'Nearly there')$$,
  '23514', 'Reserve the full quantity before marking this equipment Arranged',
  'an item only partly reserved cannot be marked Arranged'
);

insert into v_ids select 'res-flagged', public.reserve_equipment((select id from v_ids where name = 'flagged'), 1);
reset role;
update public.equipment_reservations set needs_recheck = true, recheck_reason = 'The event date or time changed'
where id = (select id from v_ids where name = 'res-flagged');
set local role authenticated;
select throws_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'flagged'), 'arranged', 'Fine')$$,
  '23514', 'Reserve the full quantity before marking this equipment Arranged',
  'a reservation awaiting re-check does not count as held'
);

select isnt(
  public.update_equipment_arrangement((select id from v_ids where name = 'legacy'), 'arranged', 'Borrowed from Block B'),
  null,
  'equipment outside the catalogue can still be marked Arranged by hand'
);

select lives_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'part'), 'in_progress', 'Sourcing 2 more')$$,
  'every other status can still be set (SPM-28 AC04)'
);

select * from finish();
rollback;
