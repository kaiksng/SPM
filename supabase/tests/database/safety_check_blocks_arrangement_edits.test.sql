begin;

select plan(4);

-- While Pending Safety Check, the coordinator cannot change venue or
-- technical arrangements (202610190005, 202610190006).

insert into auth.users (id, email, raw_user_meta_data) values
  ('fe000000-0000-0000-0000-000000000001', 'lock-organiser@example.test', '{"full_name":"LOCK Organiser","role":"event_organiser"}'::jsonb),
  ('fe000000-0000-0000-0000-000000000002', 'lock-coordinator@example.test', '{"full_name":"LOCK Coordinator","role":"event_coordinator"}'::jsonb),
  ('fe000000-0000-0000-0000-000000000003', 'lock-support@example.test', '{"full_name":"LOCK Support","role":"technical_support_staff"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('fe000000-0000-0000-0000-000000000010', 'LOCK Hall', 'Block 1', 200);

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values
  ('fe000000-0000-0000-0000-0000000000e1', 'fe000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000002', 'LOCK Safety Check Event', 'pending_safety_check', '2099-11-01T10:00:00+08:00', '2099-11-01T12:00:00+08:00');

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue, expires_at)
values
  ('fe000000-0000-0000-0000-0000000000b1', 'fe000000-0000-0000-0000-0000000000e1', 'fe000000-0000-0000-0000-000000000010', 'fe000000-0000-0000-0000-000000000002', '2099-11-01T10:00:00+08:00', '2099-11-01T12:00:00+08:00', 'approved', true, null),
  ('fe000000-0000-0000-0000-0000000000b2', 'fe000000-0000-0000-0000-0000000000e1', 'fe000000-0000-0000-0000-000000000010', 'fe000000-0000-0000-0000-000000000002', '2099-11-01T14:00:00+08:00', '2099-11-01T16:00:00+08:00', 'on_hold', false, now() + interval '1 day');

insert into public.event_equipment_requirements (id, event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
values (
  'fe000000-0000-0000-0000-0000000000a1', 'fe000000-0000-0000-0000-0000000000e1',
  (select id from public.equipment_items where code = 'mic'), 'Mic', 1,
  '2099-11-01T10:00:00+08:00', '2099-11-01T12:00:00+08:00'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fe000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- AC06: withdrawing/cancelling a venue booking is blocked.
select throws_ok(
  $$select public.withdraw_venue_booking_request('fe000000-0000-0000-0000-0000000000b1', null, 'no longer needed')$$,
  '23514', 'Venue bookings cannot be changed while the event is Pending Safety Check',
  'AC06: an approved booking cannot be cancelled while Pending Safety Check'
);

-- AC06: confirming a tentative hold is blocked too.
select throws_ok(
  $$select public.confirm_venue_booking_hold('fe000000-0000-0000-0000-0000000000b2')$$,
  '23514', 'Venue bookings cannot be changed while the event is Pending Safety Check',
  'AC06: a tentative hold cannot be confirmed while Pending Safety Check'
);

-- AC06: changing the main venue is blocked (regression: already required planning).
select throws_ok(
  $$select public.set_main_venue_booking('fe000000-0000-0000-0000-0000000000b2')$$,
  '23514', 'The main venue can only be changed while the event is in Planning',
  'AC06: the main venue cannot be changed while Pending Safety Check'
);

-- Once back in Planning, the same actions are allowed again.
reset role;
update public.events set status = 'planning' where id = 'fe000000-0000-0000-0000-0000000000e1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fe000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.confirm_venue_booking_hold('fe000000-0000-0000-0000-0000000000b2')$$,
  'venue bookings can be changed again once the event returns to Planning'
);

select * from finish();
rollback;
