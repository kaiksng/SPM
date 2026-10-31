begin;

select plan(29);

-- The coordinator requests an event's equipment from Technical Support Staff
-- (202610300007_coordinator_requests_equipment.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  ('eb000000-0000-0000-0000-000000000001', 'request-support@example.test', '{"full_name":"Request Support","role":"technical_support_staff"}'::jsonb),
  ('eb000000-0000-0000-0000-000000000002', 'request-organiser@example.test', '{"full_name":"Request Organiser","role":"event_organiser"}'::jsonb),
  ('eb000000-0000-0000-0000-000000000003', 'request-coordinator@example.test', '{"full_name":"Request Coordinator","role":"event_coordinator"}'::jsonb),
  ('eb000000-0000-0000-0000-000000000004', 'request-other@example.test', '{"full_name":"Other Coordinator","role":"event_coordinator"}'::jsonb);

create temporary table v_ids (name text primary key, id uuid);
grant all on v_ids to authenticated;
insert into v_ids select 'mic', id from public.equipment_items where code = 'mic';

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values
  ('eb000000-0000-0000-0000-0000000000e1', 'eb000000-0000-0000-0000-000000000002', 'eb000000-0000-0000-0000-000000000003',
   'Request Expo', 'planning', '2099-11-01T10:00:00+08:00', '2099-11-01T14:00:00+08:00'),
  ('eb000000-0000-0000-0000-0000000000e2', 'eb000000-0000-0000-0000-000000000002', 'eb000000-0000-0000-0000-000000000003',
   'Confirmed Expo', 'confirmed', '2099-11-02T10:00:00+08:00', '2099-11-02T14:00:00+08:00');

-- The organiser's list, carried into Planning. A requested time supplied
-- directly is ignored: only request_event_equipment sets it.
insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until, notes, requested_at)
values
  ('eb000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 1, '2099-11-01T10:00:00+08:00', '2099-11-01T14:00:00+08:00', 'first', now()),
  ('eb000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 1, '2099-11-01T10:00:00+08:00', '2099-11-01T14:00:00+08:00', 'second', null);
insert into v_ids select notes, id from public.event_equipment_requirements where event_id = 'eb000000-0000-0000-0000-0000000000e1';

select is(
  (select count(*)::int from public.event_equipment_requirements
   where event_id = 'eb000000-0000-0000-0000-0000000000e1' and requested_at is null),
  2,
  'equipment on a Planning event starts unrequested, even with a requested time supplied'
);

update public.event_equipment_requirements set requested_at = now() where id = (select id from v_ids where name = 'first');
select is(
  (select requested_at from public.event_equipment_requirements where id = (select id from v_ids where name = 'first')),
  null,
  'the requested time cannot be set by a direct update'
);

-- Technical Support Staff cannot see or work on unrequested equipment.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eb000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.check_event_equipment_availability(array['eb000000-0000-0000-0000-0000000000e1'::uuid])),
  0,
  'the availability check lists no unrequested equipment'
);
select throws_ok(
  $$select public.reserve_equipment((select id from v_ids where name = 'first'), 1)$$,
  '23514', 'The coordinator has not requested this equipment yet',
  'unrequested equipment cannot be reserved'
);

-- Readiness: unrequested equipment is outstanding.
select set_config('request.jwt.claims', '{"sub":"eb000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (select item ->> 'status' from jsonb_array_elements(
    public.event_readiness('eb000000-0000-0000-0000-0000000000e1') -> 'equipment') item
   where item ->> 'requirementId' = (select id::text from v_ids where name = 'first')),
  'pending',
  'an unrequested item is Pending in the readiness check'
);
select is(
  (select count(*)::int from jsonb_array_elements(
    public.event_readiness('eb000000-0000-0000-0000-0000000000e1') -> 'outstandingItems') item
   where item ->> 'code' = 'equipment_not_requested'),
  2,
  'each unrequested item is listed as outstanding'
);

-- Only the assigned coordinator, only in Planning.
select set_config('request.jwt.claims', '{"sub":"eb000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.request_event_equipment('eb000000-0000-0000-0000-0000000000e1')$$,
  '42501', 'Only the event''s assigned coordinator can request its equipment',
  'another coordinator cannot request the equipment'
);
select set_config('request.jwt.claims', '{"sub":"eb000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.request_event_equipment('eb000000-0000-0000-0000-0000000000e1')$$,
  '42501', 'Only the event''s assigned coordinator can request its equipment',
  'the organiser cannot request the equipment'
);
select set_config('request.jwt.claims', '{"sub":"eb000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.request_event_equipment('eb000000-0000-0000-0000-0000000000e2')$$,
  '23514', 'Equipment can only be requested while the event is in Planning',
  'equipment cannot be requested for an event not in Planning'
);

-- The assigned coordinator requests everything at once.
select is(
  public.request_event_equipment('eb000000-0000-0000-0000-0000000000e1'),
  2,
  'the assigned coordinator requests every unrequested item at once'
);
reset role;

select is(
  (select count(*)::int from public.event_equipment_requirements
   where event_id = 'eb000000-0000-0000-0000-0000000000e1'
     and requested_at is not null and requested_by = 'eb000000-0000-0000-0000-000000000003'),
  2,
  'each item records when and by whom it was requested'
);
select is(
  (select row(title, message) from public.notifications
   where recipient_id = 'eb000000-0000-0000-0000-000000000001' and type = 'equipment_requested'),
  row('Equipment requested'::text, '"Request Expo" requested 2 equipment items. Check and arrange them.'::text),
  'Technical Support Staff are notified'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eb000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  public.request_event_equipment('eb000000-0000-0000-0000-0000000000e1'),
  0,
  'requesting again with nothing new sends nothing'
);
reset role;
select is(
  (select count(*)::int from public.notifications
   where recipient_id = 'eb000000-0000-0000-0000-000000000001' and type = 'equipment_requested'),
  1,
  'and notifies no one again'
);

-- Requested equipment is Technical Support Staff's to work on.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eb000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.check_event_equipment_availability(array['eb000000-0000-0000-0000-0000000000e1'::uuid])),
  2,
  'requested equipment is in the availability check'
);
select lives_ok(
  $$select public.reserve_equipment((select id from v_ids where name = 'first'), 1)$$,
  'requested equipment can be reserved'
);
reset role;

-- A change keeps it requested (it goes back to staff to re-check instead).
update public.event_equipment_requirements set quantity = 2 where id = (select id from v_ids where name = 'first');
select isnt(
  (select requested_at from public.event_equipment_requirements where id = (select id from v_ids where name = 'first')),
  null,
  'changing a requested item keeps it requested'
);

-- An item added later waits for the next request.
insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until, notes)
values ('eb000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 1, '2099-11-01T10:00:00+08:00', '2099-11-01T14:00:00+08:00', 'added');
select is(
  (select requested_at from public.event_equipment_requirements where event_id = 'eb000000-0000-0000-0000-0000000000e1' and notes = 'added'),
  null,
  'an item added after the request is unrequested until the next one'
);
select is(
  (select count(*)::int from public.event_equipment_requirements
   where event_id = 'eb000000-0000-0000-0000-0000000000e1' and requested_at is not null),
  2,
  'the items already requested stay requested'
);

-- An approved change request adding equipment to a Confirmed event: applying
-- it was the coordinator's decision, so it is requested at once.
insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
values ('eb000000-0000-0000-0000-0000000000e2', (select id from v_ids where name = 'mic'), 'x', 1, '2099-11-02T10:00:00+08:00', '2099-11-02T14:00:00+08:00');
select isnt(
  (select requested_at from public.event_equipment_requirements where event_id = 'eb000000-0000-0000-0000-0000000000e2'),
  null,
  'equipment added to a Confirmed event is requested at once'
);

-- The coordinator chooses which items to send (202610300008).
insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until, notes)
values ('eb000000-0000-0000-0000-0000000000e1', (select id from v_ids where name = 'mic'), 'x', 1, '2099-11-01T10:00:00+08:00', '2099-11-01T14:00:00+08:00', 'later');
insert into v_ids select notes, id from public.event_equipment_requirements
where event_id = 'eb000000-0000-0000-0000-0000000000e1' and notes in ('added', 'later');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eb000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.request_event_equipment('eb000000-0000-0000-0000-0000000000e1', array[]::uuid[])$$,
  '23514', 'Choose the equipment to request',
  'an empty choice is refused'
);
select throws_ok(
  $$select public.request_event_equipment('eb000000-0000-0000-0000-0000000000e1', array['eb000000-0000-0000-0000-00000000dead'::uuid])$$,
  '23514', 'Some of the chosen equipment is no longer part of this event',
  'an item from outside the event is refused'
);
select is(
  public.request_event_equipment('eb000000-0000-0000-0000-0000000000e1',
    array[(select id from v_ids where name = 'added'), (select id from v_ids where name = 'second')]),
  1,
  'only the chosen unrequested item is sent; one already requested and not flagged is left as it is'
);
reset role;
select is(
  (select requested_at from public.event_equipment_requirements where id = (select id from v_ids where name = 'later')),
  null,
  'an item not chosen stays unrequested'
);

-- Requesting again after an Issue is recorded (202610300009). Only the system
-- records one now (e.g. a changed request, 202610290002), never staff by hand.
insert into public.equipment_arrangement_updates (requirement_id, event_id, status, note, updated_by)
values ((select id from v_ids where name = 'second'), 'eb000000-0000-0000-0000-0000000000e1', 'issue', 'Request changed',
        'eb000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eb000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  public.request_event_equipment('eb000000-0000-0000-0000-0000000000e1', array[(select id from v_ids where name = 'second')]),
  1,
  'an item flagged as an Issue can be requested again'
);
reset role;
select is(
  (select row(status, note, updated_by) from public.equipment_arrangement_updates
   where requirement_id = (select id from v_ids where name = 'second') order by id desc limit 1),
  row('not_started'::text, 'Requested again by the coordinator'::text, 'eb000000-0000-0000-0000-000000000003'::uuid),
  'requesting it again puts it back to Not started'
);
select is(
  (select count(*)::int from public.equipment_arrangement_updates where requirement_id = (select id from v_ids where name = 'second')),
  2,
  'the Issue stays in the history'
);
select is(
  (select message from public.notifications
   where recipient_id = 'eb000000-0000-0000-0000-000000000001' and type = 'equipment_requested'
     and message like '%again%'),
  '"Request Expo" requested 1 equipment item (1 again after an issue). Check and arrange them.',
  'Technical Support Staff are told it was requested again'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eb000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  public.request_event_equipment('eb000000-0000-0000-0000-0000000000e1', array[(select id from v_ids where name = 'second')]),
  0,
  'an item no longer flagged is not requested again'
);
reset role;

select * from finish();
rollback;
