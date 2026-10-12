begin;
select plan(18);

insert into auth.users (id, email, raw_user_meta_data) values
  ('f3000000-0000-0000-0000-000000000001', 'spm19-org@example.test', '{"full_name":"Block organiser","role":"event_organiser"}'::jsonb),
  ('f3000000-0000-0000-0000-000000000002', 'spm19-coord@example.test', '{"full_name":"Block coordinator","role":"event_coordinator"}'::jsonb),
  ('f3000000-0000-0000-0000-000000000003', 'spm19-staff@example.test', '{"full_name":"Block staff","role":"venue_staff"}'::jsonb);

insert into public.venues (id, name, location, capacity, operating_hours, accessibility_notes)
values ('f3000000-0000-0000-0000-000000000010', 'SPM19 Test Hall', 'North Wing', 80,
  '[{"days":["mon","tue","wed","thu","fri"],"opensAt":"08:00","closesAt":"18:00"}]'::jsonb,
  'Wheelchair access');
insert into public.venue_facilities (venue_id, facility_name)
values ('f3000000-0000-0000-0000-000000000010', 'Projector');
insert into public.venue_layouts (venue_id, layout_name)
values ('f3000000-0000-0000-0000-000000000010', 'Theatre');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temporary table spm19_event_id (id uuid);
select lives_ok($$insert into spm19_event_id
  select public.save_event_draft('{"title":"[SPM19] Venue event","purpose":"Test blocks.","description":"Test event.","expectedAttendance":"20","startsAt":"2099-04-06T10:00:00+08:00","endsAt":"2099-04-06T12:00:00+08:00","venue":{"preferredLocation":"North Wing","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false},"requirementsAcknowledged":true}'::jsonb)$$,
  'organiser saves the event');
select lives_ok(format($$select public.submit_event_request(%L::uuid)$$, (select id from spm19_event_id)), 'event is submitted');

-- Submitted events now wait in the Lead's unassigned queue, so this setup
-- assigns the coordinator directly before the coordinator decides.
reset role;
update public.events set assigned_coordinator_id = 'f3000000-0000-0000-0000-000000000002'
where id = (select id from spm19_event_id);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(format($$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Ready')$$, (select id from spm19_event_id)), 'event enters Planning');

select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.create_venue_block('f3000000-0000-0000-0000-000000000010', 'Maintenance', '2099-04-06T10:30:00+08:00', '2099-04-06T11:30:00+08:00')$$,
  '42501', 'Only Venue Staff can create blocks', 'organiser cannot create a block');
select throws_ok(format($$select * from public.search_available_venues(%L::uuid,
  '2099-04-06T10:00:00+08:00', '2099-04-06T12:00:00+08:00', 20)$$,
  (select id from spm19_event_id)), '42501', 'Only Event Coordinators can search venues for an event',
  'organiser cannot use coordinator search');

select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.create_venue_block('f3000000-0000-0000-0000-000000000010', '', '2099-04-06T10:30:00+08:00', '2099-04-06T11:30:00+08:00')$$,
  '23514', 'Enter a reason', 'blank reason is rejected');
select throws_ok($$select public.create_venue_block('f3000000-0000-0000-0000-000000000010', 'Maintenance', '2099-04-06T11:30:00+08:00', '2099-04-06T11:30:00+08:00')$$,
  '23514', 'End time must be after start time', 'equal start and end are rejected');
select throws_ok($$insert into public.venue_unavailability (venue_id, reason, starts_at, ends_at)
  values ('f3000000-0000-0000-0000-000000000010', 'Bypass', '2099-04-06T10:30:00+08:00', '2099-04-06T11:30:00+08:00')$$,
  '42501', null, 'staff cannot bypass block history functions');

create temporary table spm19_block_id (id uuid);
select lives_ok($$insert into spm19_block_id select (public.create_venue_block(
  'f3000000-0000-0000-0000-000000000010', 'Maintenance',
  '2099-04-06T10:30:00+08:00', '2099-04-06T11:30:00+08:00') ->> 'blockId')::uuid$$,
  'Venue Staff can create a block');

select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.search_available_venues(
  (select id from spm19_event_id), '2099-04-06T10:00:00+08:00', '2099-04-06T12:00:00+08:00', 20)
  where id = 'f3000000-0000-0000-0000-000000000010'), 0,
  'manual search excludes an overlapping active block');
select throws_ok(format($$select public.submit_venue_booking_request(%L::uuid,
  'f3000000-0000-0000-0000-000000000010'::uuid)$$, (select id from spm19_event_id)),
  '23514', 'This venue is unavailable for part of this event''s schedule, including setup and turnaround time.',
  'booking submission rejects an active block');

select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select lives_ok(format($$select public.remove_venue_block(%L::uuid)$$, (select id from spm19_block_id)), 'staff removes the block');
select ok((select removed_at is not null from public.venue_unavailability where id = (select id from spm19_block_id)), 'removed block remains in history');

select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.search_available_venues(
  (select id from spm19_event_id), '2099-04-06T10:00:00+08:00', '2099-04-06T12:00:00+08:00', 20,
  'North', 'Theatre', array['Projector'], 'Wheelchair')
  where id = 'f3000000-0000-0000-0000-000000000010'), 1,
  'all selected filters match and removed block no longer excludes venue');
select lives_ok(format($$select public.submit_venue_booking_request(%L::uuid, 'f3000000-0000-0000-0000-000000000010')$$,
  (select id from spm19_event_id)), 'coordinator can request the released period');

select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
-- SPM-83 reverses the original SPM-19 rule: a block overlapping an active
-- booking is now saved and the booking flagged, not refused.
select lives_ok($$select public.create_venue_block('f3000000-0000-0000-0000-000000000010', 'Repair', '2099-04-06T11:00:00+08:00', '2099-04-06T12:00:00+08:00')$$,
  'block overlapping a Pending booking is saved (SPM-83)');
select is((select count(*)::int from public.venue_booking_disruptions where cleared_at is null), 1,
  'the overlapped Pending booking is flagged as disrupted');
select lives_ok($$select public.create_venue_block('f3000000-0000-0000-0000-000000000010', 'Repair', '2099-04-06T12:00:00+08:00', '2099-04-06T13:00:00+08:00')$$,
  'block starting at booking end is allowed');

select * from finish();
rollback;
