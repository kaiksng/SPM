begin;

select plan(11);

-- A Confirmed event sent back for re-review stays visible to attendees,
-- marked as being updated (202611010011_attendee_events_being_updated.sql).

insert into auth.users (id, email, raw_user_meta_data) values
  ('ab000000-0000-0000-0000-000000000001', 'upd-organiser@example.test', '{"full_name":"Upd Organiser","role":"event_organiser"}'::jsonb),
  ('ab000000-0000-0000-0000-000000000002', 'upd-coordinator@example.test', '{"full_name":"Upd Coordinator","role":"event_coordinator"}'::jsonb),
  ('ab000000-0000-0000-0000-000000000003', 'upd-registered@example.test', '{"full_name":"Registered Attendee","role":"attendee"}'::jsonb),
  ('ab000000-0000-0000-0000-000000000004', 'upd-waitlisted@example.test', '{"full_name":"Waitlisted Attendee","role":"attendee"}'::jsonb),
  ('ab000000-0000-0000-0000-000000000005', 'upd-browser@example.test', '{"full_name":"Browsing Attendee","role":"attendee"}'::jsonb);

-- E1 Confirmed (it will go back to Planning). E2 in Planning, never Confirmed.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, description)
values
  ('ab000000-0000-0000-0000-0000000000e1', 'ab000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000002',
   'Updating Gala', 'confirmed', '2099-12-01T10:00:00+08:00', '2099-12-01T14:00:00+08:00', 'An evening gala.'),
  ('ab000000-0000-0000-0000-0000000000e2', 'ab000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000002',
   'Never Confirmed', 'planning', '2099-12-02T10:00:00+08:00', '2099-12-02T14:00:00+08:00', null);

insert into public.event_registration_requirements (event_id, registration_required, attendee_capacity, withdrawal_permitted)
values ('ab000000-0000-0000-0000-0000000000e1', true, 1, true)
on conflict (event_id) do update set
  registration_required = excluded.registration_required,
  attendee_capacity = excluded.attendee_capacity,
  withdrawal_permitted = excluded.withdrawal_permitted;

insert into public.event_registrations (event_id, attendee_id, status)
values
  ('ab000000-0000-0000-0000-0000000000e1', 'ab000000-0000-0000-0000-000000000003', 'registered'),
  ('ab000000-0000-0000-0000-0000000000e1', 'ab000000-0000-0000-0000-000000000004', 'waitlisted');

select is(public.event_is_being_updated('ab000000-0000-0000-0000-0000000000e1'), false, 'a Confirmed event is not being updated');

-- The event goes back to Planning (e.g. a replacement venue was approved).
update public.events set status = 'planning' where id = 'ab000000-0000-0000-0000-0000000000e1';

select is(public.event_is_being_updated('ab000000-0000-0000-0000-0000000000e1'), true, 'a Confirmed event back in Planning is being updated');
select is(public.event_is_being_updated('ab000000-0000-0000-0000-0000000000e2'), false, 'an event that was never Confirmed is not');

select is(
  (select array_agg(recipient_id order by recipient_id) from public.notifications
   where event_id = 'ab000000-0000-0000-0000-0000000000e1' and type = 'event_arrangements_updating'),
  array['ab000000-0000-0000-0000-000000000003', 'ab000000-0000-0000-0000-000000000004']::uuid[],
  'registered and waitlisted attendees are told the arrangements are being updated'
);

-- A signed-in attendee who isn't registered.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ab000000-0000-0000-0000-000000000005","role":"authenticated"}', true);

select is(
  (select array_agg(title) from public.attendee_events_being_updated() where title in ('Updating Gala', 'Never Confirmed')),
  array['Updating Gala'],
  'attendees can see an event being updated, not one that was never Confirmed'
);
select is(
  (select row(description, registration_required, withdrawal_permitted)
   from public.attendee_events_being_updated('ab000000-0000-0000-0000-0000000000e1')),
  row('An evening gala.'::text, true, true),
  'one event''s attendee-safe details can be read'
);
select is(
  (select count(*)::int from public.events where id = 'ab000000-0000-0000-0000-0000000000e1'),
  0,
  'the events table itself stays closed to an attendee who isn''t registered'
);
select throws_ok(
  $$select public.register_for_event('ab000000-0000-0000-0000-0000000000e1')$$,
  null, null,
  'new registrations are refused while it is being updated'
);

-- The registered attendee still reaches their own event.
select set_config('request.jwt.claims', '{"sub":"ab000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.events where id = 'ab000000-0000-0000-0000-0000000000e1'),
  1,
  'a registered attendee can still open the event'
);

-- Signed out: the public main page lists it, flagged.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select being_updated from public.list_public_events(50) where title = 'Updating Gala'),
  true,
  'the public main page lists it, flagged as being updated'
);
select is(
  (select count(*)::int from public.list_public_events(50) where title = 'Never Confirmed'),
  0,
  'but not an event that was never Confirmed'
);

select * from finish();
rollback;
