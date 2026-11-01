begin;

select plan(16);

-- 202611010013 (SPM-49 AC2/AC3): an attendee must not read internal planning
-- information, even by querying the tables or calling RPCs directly. The only
-- attendee read path is attendee_visible_events (published fields only).

insert into auth.users (id, email, raw_user_meta_data) values
  ('fa000000-0000-0000-0000-000000000001', 'raae-organiser@example.test', '{"full_name":"RAAE Organiser","role":"event_organiser"}'::jsonb),
  ('fa000000-0000-0000-0000-000000000002', 'raae-coordinator@example.test', '{"full_name":"RAAE Coordinator","role":"event_coordinator"}'::jsonb),
  ('fa000000-0000-0000-0000-000000000003', 'raae-attendee-1@example.test', '{"full_name":"RAAE Attendee One","role":"attendee"}'::jsonb),
  ('fa000000-0000-0000-0000-000000000004', 'raae-attendee-2@example.test', '{"full_name":"RAAE Attendee Two","role":"attendee"}'::jsonb),
  ('fa000000-0000-0000-0000-000000000005', 'raae-venue-staff@example.test', '{"full_name":"RAAE Venue Staff","role":"venue_staff"}'::jsonb);

insert into public.events (id, organiser_id, assigned_coordinator_id, title, description, status, starts_at, ends_at, expected_attendance, requirements_acknowledged) values
  ('fa000000-0000-0000-0000-0000000000e1', 'fa000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000002', 'RAAE Confirmed Event', 'Public blurb', 'confirmed', '2099-01-01T10:00:00+08:00', '2099-01-01T12:00:00+08:00', 120, true),
  ('fa000000-0000-0000-0000-0000000000e2', 'fa000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000002', 'RAAE Planning Event', 'Not published', 'planning', '2099-02-01T10:00:00+08:00', '2099-02-01T12:00:00+08:00', 80, true);

insert into public.event_venue_requirements (event_id, preferred_location) values
  ('fa000000-0000-0000-0000-0000000000e1', 'RAAE Hall'),
  ('fa000000-0000-0000-0000-0000000000e2', 'RAAE Annex');

insert into public.event_registration_requirements (event_id, registration_required, attendee_capacity, waitlist_enabled, withdrawal_permitted) values
  ('fa000000-0000-0000-0000-0000000000e1', true, 50, true, true),
  ('fa000000-0000-0000-0000-0000000000e2', true, 50, true, true);

insert into public.event_registrations (event_id, attendee_id, status) values
  ('fa000000-0000-0000-0000-0000000000e1', 'fa000000-0000-0000-0000-000000000003', 'registered');

set local role authenticated;

-- Attendee 1 (registered for the Confirmed event)
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is((select count(*) from public.events)::int, 0, 'AC2: an attendee cannot select any events row directly');
select is((select count(*) from public.event_venue_requirements)::int, 0, 'AC2: an attendee cannot select venue requirements (venue notes) directly');
select ok(not public.can_view_event('fa000000-0000-0000-0000-0000000000e1'), 'AC2: can_view_event no longer admits an attendee to a Confirmed event');
select ok(public.can_attendee_view_event('fa000000-0000-0000-0000-0000000000e1'), 'can_attendee_view_event admits the attendee to a Confirmed event');
select ok(not public.can_attendee_view_event('fa000000-0000-0000-0000-0000000000e2'), 'can_attendee_view_event refuses a Planning event the attendee has no registration for');
select throws_ok(
  $$select public.safety_check_review_details('fa000000-0000-0000-0000-0000000000e1', null)$$,
  '42501',
  null,
  'AC3: an attendee calling the safety review RPC directly is refused'
);

-- AC1: the attendee-facing information is still available, as published fields only.
select is(
  (select title || '|' || preferred_location || '|' || organiser_name from public.attendee_visible_events(array['fa000000-0000-0000-0000-0000000000e1']::uuid[])),
  'RAAE Confirmed Event|RAAE Hall|RAAE Organiser',
  'AC1: attendee_visible_events returns the Confirmed event with published fields'
);
select is(
  (select count(*) from public.attendee_visible_events(array['fa000000-0000-0000-0000-0000000000e2']::uuid[]))::int,
  0,
  'AC2: attendee_visible_events hides an event that is not Confirmed'
);
select is(
  (select count(*) from public.attendee_visible_events())::int,
  1,
  'AC1: with no filter the attendee sees only the Confirmed event'
);
select is(
  (select count(*) from public.event_registration_requirements)::int,
  1,
  'registration settings stay readable for the Confirmed event only'
);
select is(
  (select registered_count from public.event_registration_counts(array['fa000000-0000-0000-0000-0000000000e1']::uuid[])),
  1,
  'registration counts still work for an attendee'
);

-- Attendee 2 (no registration): registering for the Confirmed event still works.
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.event_registrations (event_id, attendee_id, status)
    values ('fa000000-0000-0000-0000-0000000000e1', 'fa000000-0000-0000-0000-000000000004', 'registered')$$,
  'an attendee can still register themselves for a Confirmed event'
);
select throws_ok(
  $$insert into public.event_registrations (event_id, attendee_id, status)
    values ('fa000000-0000-0000-0000-0000000000e2', 'fa000000-0000-0000-0000-000000000004', 'registered')$$,
  '42501',
  null,
  'an attendee cannot register for an event they cannot see'
);

-- Staff are unchanged.
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.events)::int, 2, 'the organiser still reads their events');
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select ok(public.can_view_event('fa000000-0000-0000-0000-0000000000e1'), 'the assigned coordinator can still view the event');
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select ok(public.can_view_event('fa000000-0000-0000-0000-0000000000e2'), 'venue staff can still view any event');

select * from finish();
rollback;
