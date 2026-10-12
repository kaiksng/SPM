begin;
select plan(35);

insert into auth.users (id, email, raw_user_meta_data) values
  ('f8300000-0000-0000-0000-000000000001', 'spm83-staff@example.test', '{"full_name":"SPM83 Staff","role":"venue_staff"}'::jsonb),
  ('f8300000-0000-0000-0000-000000000002', 'spm83-coord-a@example.test', '{"full_name":"SPM83 Coordinator A","role":"event_coordinator"}'::jsonb),
  ('f8300000-0000-0000-0000-000000000003', 'spm83-coord-b@example.test', '{"full_name":"SPM83 Coordinator B","role":"event_coordinator"}'::jsonb),
  ('f8300000-0000-0000-0000-000000000004', 'spm83-safety@example.test', '{"full_name":"SPM83 Safety Officer","role":"safety_officer"}'::jsonb),
  ('f8300000-0000-0000-0000-000000000005', 'spm83-org@example.test', '{"full_name":"SPM83 Organiser","role":"event_organiser"}'::jsonb);

-- Hall: 30 min setup, 45 min turnaround, open all day every day.
-- Annex: no buffers, used for the Pending Safety Check case.
insert into public.venues (id, name, location, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes) values
  ('f8300000-0000-0000-0000-000000000010', 'SPM83 Hall', 'Block 83', 100,
    '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 30, 45),
  ('f8300000-0000-0000-0000-000000000011', 'SPM83 Annex', 'Block 83', 100,
    '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0);

-- Tuesday 6 Apr 2099 (SGT). Block under test: 12:00-14:00 at the Hall.
--   E1 10:00-12:00 Approved  - ends exactly when the block starts, but its
--                              setup/turnaround window (09:30-12:45) overlaps it
--   E2 17:00-18:00 Pending   - well clear of the block
--   E3 12:20-12:40 On hold   - active tentative hold inside the block
--   E5 12:50-13:10 Rejected  - does not occupy the venue
--   E7 13:55-14:15 Planning  - used to prove new requests are still refused
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at) values
  ('f8300000-0000-0000-0000-0000000000e1', 'f8300000-0000-0000-0000-000000000005', 'f8300000-0000-0000-0000-000000000002', 'SPM83 Career Fair', 'planning', '2099-04-06T10:00:00+08:00', '2099-04-06T12:00:00+08:00'),
  ('f8300000-0000-0000-0000-0000000000e2', 'f8300000-0000-0000-0000-000000000005', 'f8300000-0000-0000-0000-000000000003', 'SPM83 Evening Talk', 'planning', '2099-04-06T17:00:00+08:00', '2099-04-06T18:00:00+08:00'),
  ('f8300000-0000-0000-0000-0000000000e3', 'f8300000-0000-0000-0000-000000000005', 'f8300000-0000-0000-0000-000000000003', 'SPM83 Workshop', 'planning', '2099-04-06T12:20:00+08:00', '2099-04-06T12:40:00+08:00'),
  ('f8300000-0000-0000-0000-0000000000e5', 'f8300000-0000-0000-0000-000000000005', 'f8300000-0000-0000-0000-000000000003', 'SPM83 Rejected Event', 'planning', '2099-04-06T12:50:00+08:00', '2099-04-06T13:10:00+08:00'),
  ('f8300000-0000-0000-0000-0000000000e7', 'f8300000-0000-0000-0000-000000000005', 'f8300000-0000-0000-0000-000000000002', 'SPM83 New Request', 'planning', '2099-04-06T13:55:00+08:00', '2099-04-06T14:15:00+08:00'),
  ('f8300000-0000-0000-0000-0000000000e6', 'f8300000-0000-0000-0000-000000000005', 'f8300000-0000-0000-0000-000000000002', 'SPM83 Safety Event', 'pending_safety_check', '2099-04-07T10:00:00+08:00', '2099-04-07T12:00:00+08:00');

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, expires_at) values
  ('f8300000-0000-0000-0000-0000000000b1', 'f8300000-0000-0000-0000-0000000000e1', 'f8300000-0000-0000-0000-000000000010', 'f8300000-0000-0000-0000-000000000002', '2099-04-06T10:00:00+08:00', '2099-04-06T12:00:00+08:00', 'approved', null),
  ('f8300000-0000-0000-0000-0000000000b2', 'f8300000-0000-0000-0000-0000000000e2', 'f8300000-0000-0000-0000-000000000010', 'f8300000-0000-0000-0000-000000000003', '2099-04-06T17:00:00+08:00', '2099-04-06T18:00:00+08:00', 'pending', null),
  ('f8300000-0000-0000-0000-0000000000b3', 'f8300000-0000-0000-0000-0000000000e3', 'f8300000-0000-0000-0000-000000000010', 'f8300000-0000-0000-0000-000000000003', '2099-04-06T12:20:00+08:00', '2099-04-06T12:40:00+08:00', 'on_hold', '2099-04-05T00:00:00+08:00'),
  ('f8300000-0000-0000-0000-0000000000b5', 'f8300000-0000-0000-0000-0000000000e5', 'f8300000-0000-0000-0000-000000000010', 'f8300000-0000-0000-0000-000000000003', '2099-04-06T12:50:00+08:00', '2099-04-06T13:10:00+08:00', 'rejected', null),
  ('f8300000-0000-0000-0000-0000000000b6', 'f8300000-0000-0000-0000-0000000000e6', 'f8300000-0000-0000-0000-000000000011', 'f8300000-0000-0000-0000-000000000002', '2099-04-07T10:00:00+08:00', '2099-04-07T12:00:00+08:00', 'approved', null);

create temporary table spm83_result (label text primary key, body jsonb);
grant all on spm83_result to authenticated;

-- ---------------------------------------------------------------- access
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8300000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok($$select * from public.preview_venue_block_impact('f8300000-0000-0000-0000-000000000010', '2099-04-06T12:00:00+08:00', '2099-04-06T14:00:00+08:00')$$,
  '42501', 'Only Venue Staff can preview a block', 'AC: a coordinator cannot preview a block');
select throws_ok($$select public.create_venue_block('f8300000-0000-0000-0000-000000000010', 'Repair', '2099-04-06T12:00:00+08:00', '2099-04-06T14:00:00+08:00', 'maintenance')$$,
  '42501', 'Only Venue Staff can create blocks', 'AC: a coordinator cannot create a block');

-- ----------------------------------------------------------- preview/save
select set_config('request.jwt.claims', '{"sub":"f8300000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select array_agg(booking_id order by starts_at) from public.preview_venue_block_impact(
  'f8300000-0000-0000-0000-000000000010', '2099-04-06T12:00:00+08:00', '2099-04-06T14:00:00+08:00')),
  array['f8300000-0000-0000-0000-0000000000b1', 'f8300000-0000-0000-0000-0000000000b3']::uuid[],
  'AC: preview lists the Approved booking (via its setup/turnaround window) and the active hold, not the Pending booking outside the block or the Rejected one');
select is((select coordinator_name from public.preview_venue_block_impact(
  'f8300000-0000-0000-0000-000000000010', '2099-04-06T12:00:00+08:00', '2099-04-06T14:00:00+08:00') where event_title = 'SPM83 Career Fair'),
  'SPM83 Coordinator A', 'AC: preview shows the event, coordinator and period');
select is((select count(*)::int from public.preview_venue_block_impact(
  'f8300000-0000-0000-0000-000000000010', '2099-04-06T09:00:00+08:00', '2099-04-06T09:20:00+08:00')), 0,
  'AC: a period that overlaps no booking window previews as no impact');

select throws_ok($$select public.create_venue_block('f8300000-0000-0000-0000-000000000010', '', '2099-04-06T12:00:00+08:00', '2099-04-06T14:00:00+08:00', 'maintenance')$$,
  '23514', 'Enter a reason', 'AC: a block needs a description');
select throws_ok($$select public.create_venue_block('f8300000-0000-0000-0000-000000000010', 'Repair', '2099-04-06T14:00:00+08:00', '2099-04-06T14:00:00+08:00', 'maintenance')$$,
  '23514', 'End time must be after start time', 'AC: end must be after start');
select throws_ok($$select public.create_venue_block('f8300000-0000-0000-0000-000000000010', 'Repair', '2099-04-06T12:00:00+08:00', null, 'maintenance')$$,
  '23514', 'End time must be after start time', 'AC: an end time is required');

select lives_ok($$insert into spm83_result select 'create', public.create_venue_block(
  'f8300000-0000-0000-0000-000000000010', 'Air-conditioning repair', '2099-04-06T12:00:00+08:00', '2099-04-06T14:00:00+08:00', 'maintenance')$$,
  'AC: the block is saved even though it overlaps an Approved booking and a hold');

select is((select jsonb_array_length(body -> 'affected') from spm83_result where label = 'create'), 2,
  'AC: saving returns the list of affected bookings');
select is((select reason_category::text || '/' || reason from public.venue_unavailability where id = (select (body ->> 'blockId')::uuid from spm83_result where label = 'create')),
  'maintenance/Air-conditioning repair', 'AC: the block stores its reason category and description');

-- ------------------------------------------------------------- flagging
reset role;
select is((select array_agg(booking_id order by booking_id) from public.venue_booking_disruptions where cleared_at is null and booking_id::text like 'f8300000%'),
  array['f8300000-0000-0000-0000-0000000000b1', 'f8300000-0000-0000-0000-0000000000b3']::uuid[],
  'AC: the overlapping Approved booking and active hold are flagged; the Pending booking outside the block and the Rejected booking are not');
select is((select string_agg(id::text || ':' || status::text, ',' order by id) from public.venue_bookings where id in
  ('f8300000-0000-0000-0000-0000000000b1', 'f8300000-0000-0000-0000-0000000000b3')),
  'f8300000-0000-0000-0000-0000000000b1:approved,f8300000-0000-0000-0000-0000000000b3:on_hold',
  'AC: nothing is cancelled and booking statuses are unchanged');
select is((select count(*)::int from public.events where id in
  ('f8300000-0000-0000-0000-0000000000e1', 'f8300000-0000-0000-0000-0000000000e3') and status = 'planning'), 2,
  'AC: event statuses are unchanged');
select is((select count(*)::int from public.event_status_history where event_id in
  ('f8300000-0000-0000-0000-0000000000e1', 'f8300000-0000-0000-0000-0000000000e3')), 2,
  'AC: event history is left unchanged (only the two creation rows)');

-- --------------------------------------------------------- notifications
select is((select count(*)::int from public.notifications where type = 'venue_booking_disrupted'
  and event_id in ('f8300000-0000-0000-0000-0000000000e1', 'f8300000-0000-0000-0000-0000000000e3')), 2,
  'AC: one notification per affected event');
select is((select recipient_id from public.notifications where type = 'venue_booking_disrupted'
  and event_id = 'f8300000-0000-0000-0000-0000000000e1'),
  'f8300000-0000-0000-0000-000000000002'::uuid, 'AC: the notification goes to the event''s assigned coordinator');
select ok((select message like '%SPM83 Career Fair%' and message like '%SPM83 Hall%' and message like '%06 Apr 2099 10:00 to 06 Apr 2099 12:00%'
    and message like '%maintenance - Air-conditioning repair%' and message like '%06 Apr 2099 12:00 to 06 Apr 2099 14:00%'
    and message like '%Alternative arrangements are required%' and message like '%has not been cancelled%'
  from public.notifications where type = 'venue_booking_disrupted' and event_id = 'f8300000-0000-0000-0000-0000000000e1'),
  'AC: the notification names the event, venue, affected period, block reason and period, that alternatives are required, and that the event is not cancelled');

-- ------------------------------------------------------------ visibility
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8300000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.venue_booking_disruptions where booking_id::text like 'f8300000%'), 1,
  'AC: a coordinator sees only the disruptions on their own events');
select set_config('request.jwt.claims', '{"sub":"f8300000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.venue_booking_disruptions where booking_id::text like 'f8300000%'), 0,
  'AC: an organiser sees no disruptions');
select set_config('request.jwt.claims', '{"sub":"f8300000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.venue_booking_disruptions where booking_id::text like 'f8300000%'), 2, 'AC: Venue Staff see every disruption');

-- ----------------------------------------- new requests still refused (existing rule)
select set_config('request.jwt.claims', '{"sub":"f8300000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.submit_venue_booking_request('f8300000-0000-0000-0000-0000000000e7', 'f8300000-0000-0000-0000-000000000010')$$,
  '23514', null, 'AC: a new booking request for the blocked period is still refused');

-- ------------------------------------------------------------- shorten
select set_config('request.jwt.claims', '{"sub":"f8300000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(format($$select public.update_venue_block(%L::uuid, '2099-04-06T11:00:00+08:00', '2099-04-06T14:00:00+08:00')$$,
  (select (body ->> 'blockId')::uuid from spm83_result where label = 'create')),
  '23514', 'A block can only be shortened', 'AC: a block cannot be extended');
select throws_ok(format($$select public.update_venue_block(%L::uuid, '2099-04-06T13:00:00+08:00', '2099-04-06T13:00:00+08:00')$$,
  (select (body ->> 'blockId')::uuid from spm83_result where label = 'create')),
  '23514', 'End time must be after start time', 'AC: a shortened block still needs end after start');

select lives_ok(format($$select public.update_venue_block(%L::uuid, '2099-04-06T13:00:00+08:00', '2099-04-06T14:00:00+08:00')$$,
  (select (body ->> 'blockId')::uuid from spm83_result where label = 'create')),
  'AC: Venue Staff can shorten a block');

reset role;
select is((select cleared_at is not null from public.venue_booking_disruptions where booking_id = 'f8300000-0000-0000-0000-0000000000b1'),
  true, 'AC: a booking that no longer overlaps the shortened block has its flag cleared');
select is((select cleared_at is null from public.venue_booking_disruptions where booking_id = 'f8300000-0000-0000-0000-0000000000b3'),
  true, 'AC: a booking that still overlaps stays flagged');
select is((select recipient_id from public.notifications where type = 'venue_disruption_cleared' and event_id::text like 'f8300000%'),
  'f8300000-0000-0000-0000-000000000002'::uuid, 'AC: the coordinator of the cleared booking is told the issue is cleared (and only that one)');

-- -------------------------------------------------------------- remove
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8300000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$select public.remove_venue_block(%L::uuid)$$,
  (select (body ->> 'blockId')::uuid from spm83_result where label = 'create')),
  '42501', 'Only Venue Staff can remove blocks', 'AC: a coordinator cannot remove a block');
select set_config('request.jwt.claims', '{"sub":"f8300000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format($$select public.remove_venue_block(%L::uuid)$$,
  (select (body ->> 'blockId')::uuid from spm83_result where label = 'create')),
  'AC: Venue Staff can remove a block');

reset role;
select is((select count(*)::int from public.venue_booking_disruptions where cleared_at is null and booking_id::text like 'f8300000%'), 0,
  'AC: removing the block clears the remaining flag');
select is((select count(*)::int from public.notifications where type = 'venue_disruption_cleared' and event_id::text like 'f8300000%'), 2,
  'AC: each affected coordinator is told when the issue is cleared');

-- ------------------------------------------- Pending Safety Check path
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8300000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.create_venue_block('f8300000-0000-0000-0000-000000000011', 'Fire safety inspection', '2099-04-07T11:00:00+08:00', '2099-04-07T13:00:00+08:00', 'safety')$$,
  'a block overlapping a booking whose event is Pending Safety Check is saved');

reset role;
select is((select status::text from public.events where id = 'f8300000-0000-0000-0000-0000000000e6'), 'planning',
  'AC: the event returns to Planning when its booking is disrupted during the safety check');
select is((select recipient_id from public.notifications where event_id = 'f8300000-0000-0000-0000-0000000000e6'
  and title = 'Safety check interrupted by a venue disruption'),
  'f8300000-0000-0000-0000-000000000004'::uuid, 'AC: the Safety Officer is notified');

select * from finish();
rollback;
