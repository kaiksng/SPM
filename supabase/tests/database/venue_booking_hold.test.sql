begin;
select plan(26);

-- Venue hold: an Event Coordinator confirms their venue booking request
-- while it is On Hold, before the hold expires.
insert into auth.users (id, email, raw_user_meta_data) values
  ('f4000000-0000-0000-0000-000000000001', 'hold-staff@example.test', '{"full_name":"Hold Staff","role":"venue_staff"}'::jsonb),
  ('f4000000-0000-0000-0000-000000000002', 'hold-coord-a@example.test', '{"full_name":"Hold Coordinator A","role":"event_coordinator"}'::jsonb),
  ('f4000000-0000-0000-0000-000000000003', 'hold-coord-b@example.test', '{"full_name":"Hold Coordinator B","role":"event_coordinator"}'::jsonb),
  ('f4000000-0000-0000-0000-000000000004', 'hold-org@example.test', '{"full_name":"Hold Organiser","role":"event_organiser"}'::jsonb);

insert into public.venues (id, name, location, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes) values
  ('f4000000-0000-0000-0000-000000000010', 'Hold Test Hall', 'Hold Test Block', 200,
   '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0);

-- Two events in Planning want the same venue for the same period (Wed 12 May 2099, 10:00-12:00 SGT).
insert into public.events (id, organiser_id, assigned_coordinator_id, title, expected_attendance, status, starts_at, ends_at) values
  ('f4000000-0000-0000-0000-0000000000e1', 'f4000000-0000-0000-0000-000000000004', 'f4000000-0000-0000-0000-000000000002',
   'Hold Event A', 50, 'planning', '2099-05-12T10:00:00+08:00', '2099-05-12T12:00:00+08:00'),
  ('f4000000-0000-0000-0000-0000000000e2', 'f4000000-0000-0000-0000-000000000004', 'f4000000-0000-0000-0000-000000000003',
   'Hold Event B', 50, 'planning', '2099-05-12T10:00:00+08:00', '2099-05-12T12:00:00+08:00');

create temporary table hold_ids (label text primary key, id uuid);
grant all on hold_ids to authenticated;

-- Coordinator A requests the venue; Venue Staff put the request on hold for 3 days.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$insert into hold_ids select 'a', public.submit_venue_booking_request(
  'f4000000-0000-0000-0000-0000000000e1', 'f4000000-0000-0000-0000-000000000010')$$,
  'Coordinator A requests the venue');

select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format($$select public.place_venue_booking_hold(%L::uuid, now() + interval '3 days')$$,
  (select id from hold_ids where label = 'a')), 'Venue Staff put the request on hold');

reset role;
-- AC01: the request is On Hold with its confirmation deadline recorded.
select is((select status::text from public.venue_bookings where id = (select id from hold_ids where label = 'a')),
  'on_hold', 'AC01: the request is On Hold');
select is((select expires_at from public.venue_bookings where id = (select id from hold_ids where label = 'a')),
  now() + interval '3 days', 'AC01: the hold records the date and time it must be confirmed by');

-- AC05: placing the hold schedules the "expires soon" reminder 24 hours before expiry.
select is((select scheduled_for from public.notifications
  where booking_id = (select id from hold_ids where label = 'a') and type = 'venue_hold_expiring_soon'
    and recipient_id = 'f4000000-0000-0000-0000-000000000002'),
  now() + interval '2 days', 'AC05: the coordinator''s expiry reminder is scheduled 24 hours before the hold expires');
select is((select title from public.notifications
  where booking_id = (select id from hold_ids where label = 'a') and type = 'venue_hold_expiring_soon'),
  'Venue hold expires soon', 'AC05: the reminder is titled "Venue hold expires soon"');
select is((select message from public.notifications
  where booking_id = (select id from hold_ids where label = 'a') and type = 'venue_hold_expiring_soon'),
  'Your tentative hold on Hold Test Hall for "Hold Event A" expires at '
    || to_char((now() + interval '3 days') at time zone 'Asia/Singapore', 'FMHH12:MI AM "on" DD Mon')
    || '. Confirm it to keep your place in the queue.',
  'AC05: the reminder names the hold''s actual deadline');

-- AC03 (before expiry): the hold still occupies the venue, so another event cannot take that period.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.submit_venue_booking_request(
  'f4000000-0000-0000-0000-0000000000e2', 'f4000000-0000-0000-0000-000000000010')$$,
  '23514', 'This venue is already occupied from 10:00 AM on 12 May to 12:00 PM on 12 May (including setup and turnaround), which overlaps your requested period.',
  'AC03: while the hold is running, another event cannot book the same venue period');

-- AC02: only the coordinator who made the request can confirm it.
select throws_ok(format($$select public.confirm_venue_booking_hold(%L::uuid)$$, (select id from hold_ids where label = 'a')),
  '42501', 'Only the coordinator who submitted this request can confirm its hold',
  'AC02: another coordinator cannot confirm the hold');

-- AC02: confirming before the expiry returns the request to Pending for Venue Staff.
select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(format($$select public.confirm_venue_booking_hold(%L::uuid)$$, (select id from hold_ids where label = 'a')),
  'AC02: the coordinator confirms the hold before it expires');
reset role;
select is((select status::text || '|' || (expires_at is not null)::text from public.venue_bookings
  where id = (select id from hold_ids where label = 'a')),
  'pending|true', 'AC02: the request is back to Pending');
select is((select count(*)::int from public.notifications
  where booking_id = (select id from hold_ids where label = 'a') and type = 'venue_hold_confirmed'
    and recipient_id = 'f4000000-0000-0000-0000-000000000001'),
  1, 'AC02: Venue Staff are told the hold was confirmed and awaits their decision');
select is((select count(*)::int from public.notifications
  where booking_id = (select id from hold_ids where label = 'a')
    and type in ('venue_hold_expiring_soon', 'venue_hold_expired')),
  0, 'AC05: once confirmed, the coordinator gets no expiry reminder or expiry notice');
select is((select count(*)::int from public.notifications
  where booking_id = (select id from hold_ids where label = 'a') and type = 'venue_hold_placed'),
  1, 'the "on hold" notification already delivered stays in the coordinator''s list');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$select public.confirm_venue_booking_hold(%L::uuid)$$, (select id from hold_ids where label = 'a')),
  '23514', 'Only a request On Hold can be confirmed', 'AC02: a request that is no longer On Hold cannot be confirmed again');

-- Venue Staff put the request on hold again; this time the coordinator lets it run out.
select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format($$select public.place_venue_booking_hold(%L::uuid, now() + interval '3 days')$$,
  (select id from hold_ids where label = 'a')), 'Venue Staff put the request on hold again');

-- Test setup: the hold's deadline passes (a transaction's clock cannot move forward).
reset role;
update public.venue_bookings set expires_at = now() - interval '1 minute'
where id = (select id from hold_ids where label = 'a');

-- AC02: after the deadline the hold can no longer be confirmed.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$select public.confirm_venue_booking_hold(%L::uuid)$$, (select id from hold_ids where label = 'a')),
  '23514', 'This hold has expired. Submit a new venue booking request.',
  'AC02: an expired hold cannot be confirmed');

-- AC03: the expired hold is released and another event can book the same venue period.
select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select lives_ok($$insert into hold_ids select 'b', public.submit_venue_booking_request(
  'f4000000-0000-0000-0000-0000000000e2', 'f4000000-0000-0000-0000-000000000010')$$,
  'AC03: another event books the venue period the expired hold had');
reset role;
select is((select status::text from public.venue_bookings where id = (select id from hold_ids where label = 'a')),
  'expired', 'AC03: the expired hold is released (status Expired)');
select is((select status::text from public.venue_bookings where id = (select id from hold_ids where label = 'b')),
  'pending', 'AC03: the other event''s request for that period is Pending');

-- AC04: the expired hold is kept, so the event's change history can still show it.
select is((select count(*)::int from public.venue_bookings
  where event_id = 'f4000000-0000-0000-0000-0000000000e1' and status = 'expired'),
  1, 'AC04: the expired hold stays on the event''s record, not deleted');
select ok((select expires_at is not null and requested_at is not null from public.venue_bookings
  where id = (select id from hold_ids where label = 'a')),
  'AC04: the expired hold keeps when it was requested and when it expired');

-- AC03: an expired hold no longer blocks the venue for its own event either.
select is((select count(*)::int from public.venue_bookings
  where venue_id = 'f4000000-0000-0000-0000-000000000010' and status in ('pending', 'approved', 'on_hold')),
  1, 'AC03: only the new request occupies the venue period');

-- AC05: a hold placed with less than 24 hours left warns the coordinator straight away.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format($$select public.place_venue_booking_hold(%L::uuid, now() + interval '5 hours')$$,
  (select id from hold_ids where label = 'b')), 'Venue Staff put the other event''s request on hold for 5 hours');
reset role;
select is((select count(*)::int from public.notifications
  where booking_id = (select id from hold_ids where label = 'b') and type = 'venue_hold_expiring_soon'
    and recipient_id = 'f4000000-0000-0000-0000-000000000003' and scheduled_for is null),
  1, 'AC05: with under 24 hours left, the "expires soon" notification is sent immediately');
select is((select message from public.notifications
  where booking_id = (select id from hold_ids where label = 'b') and type = 'venue_hold_expiring_soon'),
  'Your tentative hold on Hold Test Hall for "Hold Event B" expires at '
    || to_char((now() + interval '5 hours') at time zone 'Asia/Singapore', 'FMHH12:MI AM "on" DD Mon')
    || '. Confirm it to keep your place in the queue.',
  'AC05: the immediate notification names the deadline, not "in 24 hours"');

select * from finish();
rollback;
