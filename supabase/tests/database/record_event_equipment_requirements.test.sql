begin;

select plan(40);

-- Record Equipment Requirements for an Event
-- (202610050004_record_event_equipment_requirements.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'e1000000-0000-0000-0000-000000000001',
    'equipment-organiser@example.test',
    '{"full_name":"Equipment Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    'e1000000-0000-0000-0000-000000000002',
    'equipment-coordinator@example.test',
    '{"full_name":"Equipment Coordinator","role":"event_coordinator"}'::jsonb
  ),
  (
    'e1000000-0000-0000-0000-000000000004',
    'equipment-support@example.test',
    '{"full_name":"Equipment Support","role":"technical_support_staff"}'::jsonb
  ),
  (
    'e1000000-0000-0000-0000-000000000005',
    'equipment-lead@example.test',
    '{"full_name":"Equipment Lead","role":"event_coordinator"}'::jsonb
  );

-- Since 202610050003 a submitted event waits for the Event Coordinator Lead
-- to assign it. Promoted directly so the test does not depend on how signup
-- handles the newer role.
update public.profiles
set role = 'event_coordinator_lead'
where id = 'e1000000-0000-0000-0000-000000000005';

-- Named ids used across the test: the event, catalogue items, requirements.
create temporary table eq_ids (name text primary key, id uuid);
grant all on eq_ids to authenticated;

insert into eq_ids (name, id)
select 'microphone', id from public.equipment_items where name = 'Wireless microphone'
union all
select 'projector', id from public.equipment_items where name = 'Projector';

select is(
  (select count(*)::integer from eq_ids),
  2,
  'the starter catalogue is seeded'
);
select is(
  (select category from public.equipment_items where name = 'Wireless microphone'),
  'Audio',
  'catalogue items carry a category such as Audio (AC02)'
);

-- The parts of a draft that never change in this test. Each call adds its
-- own "equipment" key with ||.
create temporary table eq_base (payload jsonb);
grant all on eq_base to authenticated;
insert into eq_base values ('{
  "title":"Equipment Test Event",
  "purpose":"Equipment purpose",
  "description":"A test event for recording equipment requirements.",
  "expectedAttendance":"80",
  "startsAt":"2099-04-01T10:00:00+08:00",
  "endsAt":"2099-04-01T12:00:00+08:00",
  "venue":{"preferredLocation":"Main Hall","facilities":[]},
  "registration":{"required":false,"waitlistEnabled":false},
  "requirementsAcknowledged":true
}'::jsonb);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- AC01/AC05: the period runs 08:00-14:00 around a 10:00-12:00 event, to
-- cover setup and cleanup.
select lives_ok(
  $$insert into eq_ids (name, id)
    select 'event', public.save_event_draft(
      (select payload from eq_base) || jsonb_build_object('equipment', jsonb_build_array(
        jsonb_build_object(
          'equipmentItemId', (select id from eq_ids where name = 'microphone'),
          'quantity', '2',
          'requiredFrom', '2099-04-01T08:00:00+08:00',
          'requiredUntil', '2099-04-01T14:00:00+08:00',
          'notes', 'XLR to the mixer'
        )
      ))
    )$$,
  'the organiser can record catalogue equipment with a period wider than the event (AC01/AC05)'
);

insert into eq_ids (name, id)
select 'first', id from public.event_equipment_requirements
where event_id = (select id from eq_ids where name = 'event');

select is(
  (
    select row(equipment_item_id, equipment_name, quantity, required_from, required_until, notes)
    from public.event_equipment_requirements
    where id = (select id from eq_ids where name = 'first')
  ),
  row(
    (select id from eq_ids where name = 'microphone'),
    'Wireless microphone'::text,
    2,
    '2099-04-01T08:00:00+08:00'::timestamptz,
    '2099-04-01T14:00:00+08:00'::timestamptz,
    'XLR to the mixer'::text
  ),
  'every recorded field is stored, and the name mirrors the catalogue (AC01)'
);
-- History is read as the table owner here: the organiser cannot see it
-- (AC08, checked separately below).
reset role;
select is(
  (
    select row(change_type, changed_by, new_value ->> 'category', new_value ->> 'quantity')
    from public.event_equipment_changes
    where requirement_id = (select id from eq_ids where name = 'first')
  ),
  row('added'::text, 'e1000000-0000-0000-0000-000000000001'::uuid, 'Audio'::text, '2'::text),
  'adding equipment records the actor and a snapshot (AC07)'
);
set local role authenticated;

-- AC02/AC03/AC04/AC06: invalid equipment saves nothing.
select throws_ok(
  $$select public.save_event_draft(
      (select payload from eq_base) || '{"equipment":[{"equipmentName":"Microphone","quantity":"1"}]}'::jsonb,
      (select id from eq_ids where name = 'event')
    )$$,
  '23514',
  'Choose equipment from the catalogue for equipment item 1',
  'free-text equipment is rejected (AC02)'
);
select throws_ok(
  format(
    $$select public.save_event_draft(
        (select payload from eq_base) || '{"equipment":[{"equipmentItemId":"%s","quantity":"0","requiredFrom":"2099-04-01T08:00:00+08:00","requiredUntil":"2099-04-01T14:00:00+08:00"}]}'::jsonb,
        (select id from eq_ids where name = 'event')
      )$$,
    (select id from eq_ids where name = 'microphone')
  ),
  '23514',
  'Equipment quantity must be a positive whole number',
  'a zero quantity is rejected (AC04)'
);
select throws_ok(
  format(
    $$select public.save_event_draft(
        (select payload from eq_base) || '{"equipment":[{"equipmentItemId":"%s","quantity":"1.5","requiredFrom":"2099-04-01T08:00:00+08:00","requiredUntil":"2099-04-01T14:00:00+08:00"}]}'::jsonb,
        (select id from eq_ids where name = 'event')
      )$$,
    (select id from eq_ids where name = 'microphone')
  ),
  '23514',
  'Equipment quantity must be a positive whole number',
  'a fractional quantity is rejected (AC04)'
);
select throws_ok(
  format(
    $$select public.save_event_draft(
        (select payload from eq_base) || '{"equipment":[{"equipmentItemId":"%s","quantity":"1","requiredFrom":"2099-04-01T08:00:00+08:00"}]}'::jsonb,
        (select id from eq_ids where name = 'event')
      )$$,
    (select id from eq_ids where name = 'microphone')
  ),
  '23514',
  'Enter when equipment item 1 is required from and until',
  'a missing period end is rejected (AC03)'
);
select throws_ok(
  format(
    $$select public.save_event_draft(
        (select payload from eq_base) || '{"equipment":[{"equipmentItemId":"%s","quantity":"1","requiredFrom":"2099-04-01T14:00:00+08:00","requiredUntil":"2099-04-01T14:00:00+08:00"}]}'::jsonb,
        (select id from eq_ids where name = 'event')
      )$$,
    (select id from eq_ids where name = 'microphone')
  ),
  '23514',
  'Equipment item 1 must be required until a time after it is required from',
  'a period that does not end after it starts is rejected (AC05)'
);
select throws_ok(
  $$select public.save_event_draft(
      (select payload from eq_base) || '{"equipment":[{"equipmentItemId":"00000000-0000-0000-0000-00000000dead","quantity":"1","requiredFrom":"2099-04-01T08:00:00+08:00","requiredUntil":"2099-04-01T14:00:00+08:00"}]}'::jsonb,
      (select id from eq_ids where name = 'event')
    )$$,
  '23514',
  'Equipment item 1 is not in the equipment catalogue',
  'an item outside the catalogue is rejected (AC02)'
);
select throws_ok(
  format(
    $$select public.save_event_draft(
        (select payload from eq_base) || '{"equipment":[{"equipmentItemId":"%s","quantity":"1","requiredFrom":"2099-04-01T08:00:00+08:00","requiredUntil":"2099-04-01T14:00:00+08:00","notes":"%s"}]}'::jsonb,
        (select id from eq_ids where name = 'event')
      )$$,
    (select id from eq_ids where name = 'microphone'),
    repeat('a', 1001)
  ),
  '23514',
  'Technical requirements must contain at most 1,000 characters',
  'over-long technical requirements are rejected'
);
reset role;
select is(
  (
    select row(
      (select count(*)::integer from public.event_equipment_requirements
        where event_id = (select id from eq_ids where name = 'event')),
      (select count(*)::integer from public.event_equipment_changes
        where event_id = (select id from eq_ids where name = 'event'))
    )
  ),
  row(1, 1),
  'none of the rejected saves changed the equipment or its history (AC06)'
);
set local role authenticated;

-- The organiser's direct RLS access cannot bypass the catalogue either.
select throws_ok(
  $$insert into public.event_equipment_requirements (event_id, equipment_name, quantity)
    values ((select id from eq_ids where name = 'event'), 'Free text', 1)$$,
  '23514',
  'Choose equipment from the catalogue for each equipment item',
  'a direct table insert without a catalogue item is rejected'
);

-- Resubmitting the saved row unchanged writes nothing and logs nothing —
-- the churn that kept equipment out of PB-07's history is gone.
select lives_ok(
  format(
    $$select public.save_event_draft(
        (select payload from eq_base) || '{"equipment":[{"id":"%s","equipmentItemId":"%s","quantity":"2","requiredFrom":"2099-04-01T08:00:00+08:00","requiredUntil":"2099-04-01T14:00:00+08:00","notes":"XLR to the mixer"}]}'::jsonb,
        (select id from eq_ids where name = 'event')
      )$$,
    (select id from eq_ids where name = 'first'),
    (select id from eq_ids where name = 'microphone')
  ),
  'the organiser can resave unchanged equipment'
);
reset role;
select is(
  (
    select count(*)::integer from public.event_equipment_changes
    where event_id = (select id from eq_ids where name = 'event')
  ),
  1,
  'an unchanged resave records no history'
);
set local role authenticated;

select lives_ok(
  $$select public.submit_event_request((select id from eq_ids where name = 'event'))$$,
  'the event can be submitted'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.reassign_event_coordinator(
      (select id from eq_ids where name = 'event'),
      'e1000000-0000-0000-0000-000000000002'::uuid,
      null
    )$$,
  'the Lead assigns the coordinator'
);

-- A second coordinator, never assigned to this event.
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values (
  'e1000000-0000-0000-0000-000000000003',
  'equipment-coordinator-b@example.test',
  '{"full_name":"Equipment Coordinator B","role":"event_coordinator"}'::jsonb
);
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.decide_event_request(
      (select id from eq_ids where name = 'event'),
      'approved'::public.event_decision_type,
      'Ready for planning.'
    )$$,
  'the assigned coordinator approves the event into Planning'
);

-- AC11 + AC10: the assigned coordinator changes the quantity and adds the
-- same catalogue item a second time, for a different period.
select lives_ok(
  format(
    $$select public.update_event_as_coordinator(
        (select id from eq_ids where name = 'event'),
        (select payload from eq_base) || '{"equipment":[
          {"id":"%1$s","equipmentItemId":"%2$s","quantity":"3","requiredFrom":"2099-04-01T08:00:00+08:00","requiredUntil":"2099-04-01T14:00:00+08:00","notes":"XLR to the mixer"},
          {"equipmentItemId":"%2$s","quantity":"1","requiredFrom":"2099-04-02T08:00:00+08:00","requiredUntil":"2099-04-02T10:00:00+08:00"}
        ]}'::jsonb
      )$$,
    (select id from eq_ids where name = 'first'),
    (select id from eq_ids where name = 'microphone')
  ),
  'the assigned coordinator can update and add equipment while Planning (AC11)'
);
select is(
  (
    select count(*)::integer from public.event_equipment_requirements
    where event_id = (select id from eq_ids where name = 'event')
      and equipment_item_id = (select id from eq_ids where name = 'microphone')
  ),
  2,
  'the same catalogue item can appear twice on one event (AC10)'
);
select is(
  (select quantity from public.event_equipment_requirements where id = (select id from eq_ids where name = 'first')),
  3,
  'the existing row was updated in place, keeping its id'
);
select is(
  (
    select row(previous_value ->> 'quantity', new_value ->> 'quantity', changed_by)
    from public.event_equipment_changes
    where requirement_id = (select id from eq_ids where name = 'first') and change_type = 'changed'
  ),
  row('2'::text, '3'::text, 'e1000000-0000-0000-0000-000000000002'::uuid),
  'the change records previous and new values and the coordinator as actor (AC07)'
);

insert into eq_ids (name, id)
select 'second', id from public.event_equipment_requirements
where event_id = (select id from eq_ids where name = 'event')
  and id <> (select id from eq_ids where name = 'first');

select lives_ok(
  format(
    $$select public.update_event_as_coordinator(
        (select id from eq_ids where name = 'event'),
        (select payload from eq_base) || '{"equipment":[
          {"id":"%s","equipmentItemId":"%s","quantity":"3","requiredFrom":"2099-04-01T08:00:00+08:00","requiredUntil":"2099-04-01T14:00:00+08:00","notes":"XLR to the mixer"}
        ]}'::jsonb
      )$$,
    (select id from eq_ids where name = 'first'),
    (select id from eq_ids where name = 'microphone')
  ),
  'the coordinator can remove a requirement'
);
select results_eq(
  format(
    $$select change_type from public.event_equipment_changes
      where event_id = %L::uuid order by changed_at, id$$,
    (select id from eq_ids where name = 'event')
  ),
  array['added', 'changed', 'added', 'removed'],
  'every addition, change and removal is kept in sequence (AC07)'
);

-- AC12: a coordinator who is not assigned cannot save.
select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.update_event_as_coordinator(
      (select id from eq_ids where name = 'event'),
      (select payload from eq_base) || '{"equipment":[]}'::jsonb
    )$$,
  '42501',
  'Only the assigned coordinator can update this event',
  'an unassigned coordinator cannot save equipment (AC12)'
);

-- AC08: who can read the history.
select is(
  (select count(*)::integer from public.event_equipment_changes),
  0,
  'an unassigned coordinator sees no equipment history (AC08)'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.event_equipment_changes),
  0,
  'the organiser sees no equipment history (AC08)'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer from public.event_equipment_changes
    where event_id = (select id from eq_ids where name = 'event')
  ),
  4,
  'the assigned coordinator sees the full equipment history (AC08)'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer from public.event_equipment_changes
    where event_id = (select id from eq_ids where name = 'event')
  ),
  4,
  'Technical Support Staff see the full equipment history (AC08)'
);
select is(
  (select full_name from public.profiles where id = 'e1000000-0000-0000-0000-000000000002'),
  'Equipment Coordinator',
  'Technical Support Staff can see who made each change'
);
select is(
  (select count(*)::integer from public.profiles where id = 'e1000000-0000-0000-0000-000000000003'),
  0,
  'Technical Support Staff cannot read profiles unrelated to equipment history'
);
select lives_ok(
  $$insert into public.equipment_items (name, category, code, total_quantity) values ('Spotlight', 'Lighting', 'spot', 4)$$,
  'Technical Support Staff maintain the catalogue (AC09)'
);

-- AC13: a legacy free-text row (saved before the catalogue) can be kept
-- unchanged, then replaced with a catalogue item.
reset role;
alter table public.event_equipment_requirements disable trigger event_equipment_requirements_guard;
insert into public.event_equipment_requirements (event_id, equipment_name, quantity, notes)
values ((select id from eq_ids where name = 'event'), 'Old projector', 1, 'VGA only');
alter table public.event_equipment_requirements enable trigger event_equipment_requirements_guard;
insert into eq_ids (name, id)
select 'legacy', id from public.event_equipment_requirements where equipment_name = 'Old projector';
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.update_event_as_coordinator(
        (select id from eq_ids where name = 'event'),
        (select payload from eq_base) || '{"equipment":[
          {"id":"%s","equipmentItemId":"%s","quantity":"3","requiredFrom":"2099-04-01T08:00:00+08:00","requiredUntil":"2099-04-01T14:00:00+08:00","notes":"XLR to the mixer"},
          {"id":"%s"}
        ]}'::jsonb
      )$$,
    (select id from eq_ids where name = 'first'),
    (select id from eq_ids where name = 'microphone'),
    (select id from eq_ids where name = 'legacy')
  ),
  'a legacy entry sent by id alone is kept (AC13)'
);
select is(
  (
    select row(equipment_item_id, equipment_name, notes)
    from public.event_equipment_requirements where id = (select id from eq_ids where name = 'legacy')
  ),
  row(null::uuid, 'Old projector'::text, 'VGA only'::text),
  'the kept legacy entry is unchanged (AC13)'
);
select lives_ok(
  format(
    $$select public.update_event_as_coordinator(
        (select id from eq_ids where name = 'event'),
        (select payload from eq_base) || '{"equipment":[
          {"id":"%s","equipmentItemId":"%s","quantity":"3","requiredFrom":"2099-04-01T08:00:00+08:00","requiredUntil":"2099-04-01T14:00:00+08:00","notes":"XLR to the mixer"},
          {"id":"%s","equipmentItemId":"%s","quantity":"1","requiredFrom":"2099-04-01T09:00:00+08:00","requiredUntil":"2099-04-01T13:00:00+08:00"}
        ]}'::jsonb
      )$$,
    (select id from eq_ids where name = 'first'),
    (select id from eq_ids where name = 'microphone'),
    (select id from eq_ids where name = 'legacy'),
    (select id from eq_ids where name = 'projector')
  ),
  'a legacy entry can be replaced with a catalogue item (AC13)'
);
select is(
  (
    select row(equipment_name, previous_value ->> 'equipmentName', new_value ->> 'equipmentName')
    from public.event_equipment_requirements r
    join public.event_equipment_changes c on c.requirement_id = r.id and c.change_type = 'changed'
    where r.id = (select id from eq_ids where name = 'legacy')
  ),
  row('Projector'::text, 'Old projector'::text, 'Projector'::text),
  'the replacement is recorded as a change from the legacy name (AC13/AC07)'
);

select throws_ok(
  $$insert into public.equipment_items (name, category, code, total_quantity) values ('Fog machine', 'Lighting', 'fog', 1)$$,
  '42501',
  null,
  'a coordinator cannot add to the catalogue (AC09)'
);

-- A discarded draft takes its equipment with it without tripping the
-- history trigger's foreign key.
select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into eq_ids (name, id)
    select 'discarded', public.save_event_draft(
      (select payload from eq_base) || jsonb_build_object('equipment', jsonb_build_array(
        jsonb_build_object(
          'equipmentItemId', (select id from eq_ids where name = 'projector'),
          'quantity', '1',
          'requiredFrom', '2099-05-01T08:00:00+08:00',
          'requiredUntil', '2099-05-01T14:00:00+08:00'
        )
      ))
    )$$,
  'a second draft with equipment can be saved'
);
select lives_ok(
  $$delete from public.events where id = (select id from eq_ids where name = 'discarded')$$,
  'a draft with equipment can still be deleted'
);

select * from finish();
rollback;
