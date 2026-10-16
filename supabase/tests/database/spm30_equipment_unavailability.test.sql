begin;

select plan(24);

-- SPM-30: Record equipment as unavailable for a period
-- (202610060001_spm30_equipment_unavailability.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'e3000000-0000-0000-0000-000000000001',
    'spm30-support-a@example.test',
    '{"full_name":"Support A","role":"technical_support_staff"}'::jsonb
  ),
  (
    'e3000000-0000-0000-0000-000000000002',
    'spm30-support-b@example.test',
    '{"full_name":"Support B","role":"technical_support_staff"}'::jsonb
  ),
  (
    'e3000000-0000-0000-0000-000000000003',
    'spm30-coordinator@example.test',
    '{"full_name":"SPM30 Coordinator","role":"event_coordinator"}'::jsonb
  );

create temporary table u_ids (name text primary key, id uuid);
grant all on u_ids to authenticated;
insert into u_ids select 'projector', id from public.equipment_items where name = 'Projector';

set local role authenticated;

-- Only Technical Support Staff may record.
select set_config(
  'request.jwt.claims',
  '{"sub":"e3000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.record_equipment_unavailability(
      (select id from u_ids where name = 'projector'), 1, 'Lamp replacement',
      now() + interval '1 day', now() + interval '2 days')$$,
  '42501',
  'Only Technical Support Staff can record equipment as unavailable',
  'a coordinator cannot record unavailability'
);
select is(
  (select count(*)::integer from public.equipment_unavailability),
  0,
  'a coordinator cannot read unavailability records'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e3000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- SPM-30 AC01/AC02 validation.
select throws_ok(
  $$select public.record_equipment_unavailability(
      '00000000-0000-0000-0000-00000000dead', 1, 'Lamp replacement',
      now() + interval '1 day', now() + interval '2 days')$$,
  '23514', 'Choose equipment from the catalogue',
  'equipment must come from the catalogue (SPM-30 AC01)'
);
select throws_ok(
  $$select public.record_equipment_unavailability(
      (select id from u_ids where name = 'projector'), 0, 'Lamp replacement',
      now() + interval '1 day', now() + interval '2 days')$$,
  '23514', 'Quantity must be a positive whole number',
  'quantity must be positive (SPM-30 AC01)'
);
select throws_ok(
  $$select public.record_equipment_unavailability(
      (select id from u_ids where name = 'projector'), 1, '   ',
      now() + interval '1 day', now() + interval '2 days')$$,
  '23514', 'Enter a reason',
  'a reason is required (SPM-30 AC01)'
);
select throws_ok(
  $$select public.record_equipment_unavailability(
      (select id from u_ids where name = 'projector'), 1, 'Lamp replacement',
      now() + interval '2 days', now() + interval '2 days')$$,
  '23514', 'End time must be after start time',
  'the end time must be later than the start time (SPM-30 AC02)'
);

-- A future record, an in-progress record and a past record.
select lives_ok(
  $$insert into u_ids select 'future', public.record_equipment_unavailability(
      (select id from u_ids where name = 'projector'), 2, '  Lamp replacement  ',
      now() + interval '1 day', now() + interval '2 days')$$,
  'Technical Support Staff can record a future outage (SPM-30 AC01)'
);
select lives_ok(
  $$insert into u_ids select 'current', public.record_equipment_unavailability(
      (select id from u_ids where name = 'projector'), 1, 'Sent for repair',
      now() - interval '1 hour', now() + interval '3 days')$$,
  'Technical Support Staff can record an outage already in progress'
);
select lives_ok(
  $$insert into u_ids select 'past', public.record_equipment_unavailability(
      (select id from u_ids where name = 'projector'), 1, 'Old outage',
      now() - interval '3 days', now() - interval '2 days')$$,
  'Technical Support Staff can record a past outage for the record'
);

select is(
  (
    select row(quantity, reason, recorded_by)
    from public.equipment_unavailability where id = (select id from u_ids where name = 'future')
  ),
  row(2, 'Lamp replacement'::text, 'e3000000-0000-0000-0000-000000000001'::uuid),
  'the quantity, trimmed reason and recording actor are stored (SPM-30 AC01/AC06)'
);
select ok(
  (select recorded_at is not null from public.equipment_unavailability where id = (select id from u_ids where name = 'future')),
  'the recording time is stored (SPM-30 AC06)'
);

-- Direct writes are not possible; history cannot be edited or deleted.
select throws_ok(
  $$insert into public.equipment_unavailability (equipment_item_id, quantity, reason, starts_at, ends_at, recorded_by)
    values ((select id from u_ids where name = 'projector'), 1, 'Direct', now(), now() + interval '1 day',
      'e3000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  'records cannot be inserted directly'
);
select lives_ok(
  $$delete from public.equipment_unavailability$$,
  'a direct delete runs without error'
);
select is(
  (select count(*)::integer from public.equipment_unavailability),
  3,
  'but deletes nothing — history is retained (SPM-30 AC06)'
);

-- SPM-30 AC05: ending early.
select throws_ok(
  format($$select public.end_equipment_unavailability(%L)$$, (select id from u_ids where name = 'future')),
  '23514', 'This record has not started yet — remove it instead',
  'a record that has not started cannot be ended'
);
select throws_ok(
  format($$select public.end_equipment_unavailability(%L)$$, (select id from u_ids where name = 'past')),
  '23514', 'This record has already ended',
  'a past record cannot be ended'
);

-- A second staff member ends the in-progress record.
select set_config(
  'request.jwt.claims',
  '{"sub":"e3000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format($$select public.end_equipment_unavailability(%L)$$, (select id from u_ids where name = 'current')),
  'an in-progress record can be ended when the equipment returns (SPM-30 AC05)'
);
select is(
  (
    select row(ended_by, ended_at is not null, removed_at is null, reason)
    from public.equipment_unavailability where id = (select id from u_ids where name = 'current')
  ),
  row('e3000000-0000-0000-0000-000000000002'::uuid, true, true, 'Sent for repair'::text),
  'ending records who and when, and keeps the original reason (SPM-30 AC06)'
);

-- SPM-30 AC05: removing.
select throws_ok(
  format($$select public.remove_equipment_unavailability(%L)$$, (select id from u_ids where name = 'past')),
  '23514', 'Past records cannot be removed',
  'a past record cannot be removed'
);
select lives_ok(
  format($$select public.remove_equipment_unavailability(%L)$$, (select id from u_ids where name = 'future')),
  'a future record can be removed (SPM-30 AC05)'
);
select is(
  (
    select row(removed_by, removed_at is not null)
    from public.equipment_unavailability where id = (select id from u_ids where name = 'future')
  ),
  row('e3000000-0000-0000-0000-000000000002'::uuid, true),
  'removing records who and when, and keeps the record (SPM-30 AC06)'
);
select throws_ok(
  format($$select public.remove_equipment_unavailability(%L)$$, (select id from u_ids where name = 'future')),
  '23514', 'This record has already been removed',
  'a record cannot be removed twice'
);

-- SPM-30 AC06: staff can see who recorded, ended and removed records.
select is(
  (select full_name from public.profiles where id = 'e3000000-0000-0000-0000-000000000001'),
  'Support A',
  'staff can see the name of whoever recorded a record'
);

-- Stock is maintained by Technical Support Staff (used by SPM-31).
select lives_ok(
  $$update public.equipment_items set total_quantity = 6 where id = (select id from u_ids where name = 'projector')$$,
  'Technical Support Staff can set an item''s total stock'
);

select * from finish();
rollback;
