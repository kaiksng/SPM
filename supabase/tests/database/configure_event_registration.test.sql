begin;

select plan(17);

-- Configure Event Registration (202610240001).

insert into auth.users (id, email, raw_user_meta_data) values
  ('c5000000-0000-0000-0000-000000000001', 'cer-organiser@example.test', '{"full_name":"CER Organiser","role":"event_organiser"}'::jsonb),
  ('c5000000-0000-0000-0000-000000000002', 'cer-coordinator@example.test', '{"full_name":"CER Coordinator","role":"event_coordinator"}'::jsonb),
  ('c5000000-0000-0000-0000-000000000003', 'cer-other-organiser@example.test', '{"full_name":"CER Other Organiser","role":"event_organiser"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('c5000000-0000-0000-0000-000000000010', 'CER Hall', 'Block 5', 100);

-- eP: Planning, approved main venue (capacity 100), registration required but
--     not yet set up (what submission leaves behind).
-- eN: Planning, no venue yet.   eS: Pending Safety Check.   eR: Requested.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, expected_attendance, requirements_acknowledged) values
  ('c5000000-0000-0000-0000-0000000000e1', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER Planning Event', 'planning', '2099-12-01T10:00:00+08:00', '2099-12-01T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000e2', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER No Venue Event', 'planning', '2099-12-02T10:00:00+08:00', '2099-12-02T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000e3', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER Safety Event', 'pending_safety_check', '2099-12-03T10:00:00+08:00', '2099-12-03T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000e4', 'c5000000-0000-0000-0000-000000000001', null, 'CER Requested Event', 'requested', '2099-12-04T10:00:00+08:00', '2099-12-04T12:00:00+08:00', 80, true);

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue) values
  ('c5000000-0000-0000-0000-0000000000b1', 'c5000000-0000-0000-0000-0000000000e1', 'c5000000-0000-0000-0000-000000000010', 'c5000000-0000-0000-0000-000000000002', '2099-12-01T10:00:00+08:00', '2099-12-01T12:00:00+08:00', 'approved', true);

insert into public.event_registration_requirements (event_id, registration_required, attendee_capacity) values
  ('c5000000-0000-0000-0000-0000000000e1', true, 80),
  ('c5000000-0000-0000-0000-0000000000e2', true, null);

create temporary table cer_settings (label text primary key, body jsonb);
grant all on cer_settings to authenticated;
insert into cer_settings values
  ('valid', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"90","waitlistEnabled":true,"withdrawalPermitted":true}'),
  ('no_opening', '{"required":true,"closesAt":"2099-11-30T18:00:00+08:00","capacity":"90","waitlistEnabled":true,"withdrawalPermitted":true}'),
  ('zero_capacity', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"0","waitlistEnabled":true,"withdrawalPermitted":true}'),
  ('reversed', '{"required":true,"opensAt":"2099-11-30T18:00:00+08:00","closesAt":"2099-11-01T09:00:00+08:00","capacity":"90","waitlistEnabled":true,"withdrawalPermitted":true}'),
  ('no_withdrawal', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"90","waitlistEnabled":true}'),
  ('over_venue', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"101","waitlistEnabled":false,"withdrawalPermitted":false}'),
  ('large', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"5000","waitlistEnabled":false,"withdrawalPermitted":false}'),
  ('off', '{"required":false}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c5000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- AC07: required but unconfigured registration blocks the safety check.
select results_eq(
  $$select (r ->> 'ready')::boolean,
      exists (select 1 from jsonb_array_elements(r -> 'outstandingItems') i where i ->> 'code' = 'registration_incomplete')
    from (select public.event_readiness('c5000000-0000-0000-0000-0000000000e1') as r) x$$,
  $$values (false, true)$$,
  'AC07: an event with unconfigured required registration is not ready for the safety check'
);

-- AC03
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'no_opening'))$$,
  '23514', 'Enter the registration opening time',
  'AC03: the opening time is required'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'zero_capacity'))$$,
  '23514', 'Registration capacity must be a positive whole number',
  'AC03: capacity must be a positive whole number'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'no_withdrawal'))$$,
  '23514', 'Choose whether attendees may withdraw',
  'AC03: the withdrawal choice is required'
);

-- AC04
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'reversed'))$$,
  '23514', 'Registration closing time must be after its opening time',
  'AC04: the opening time must be earlier than the closing time'
);

-- AC08
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'over_venue'))$$,
  '23514', 'Registration capacity cannot exceed the main venue''s capacity of 100',
  'AC08: capacity cannot exceed the approved main venue''s capacity'
);
select lives_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e2', (select body from cer_settings where label = 'large'))$$,
  'AC08: without a confirmed venue, capacity is not limited by any venue'
);

-- AC05: a refused save changed nothing.
select is(
  (select attendee_capacity from public.event_registration_requirements where event_id = 'c5000000-0000-0000-0000-0000000000e1'),
  80,
  'AC05: an invalid setting saves nothing'
);

-- AC02/AC03: the organiser saves all five settings in Planning.
select lives_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'valid'))$$,
  'AC02: the organiser configures registration on their Planning event'
);
select results_eq(
  $$select registration_required, registration_opens_at, registration_closes_at, attendee_capacity, waitlist_enabled, withdrawal_permitted
    from public.event_registration_requirements where event_id = 'c5000000-0000-0000-0000-0000000000e1'$$,
  $$values (true, '2099-11-01T09:00:00+08:00'::timestamptz, '2099-11-30T18:00:00+08:00'::timestamptz, 90, true, true)$$,
  'AC03: all five settings are saved'
);

-- AC07: complete, within capacity -> ready.
select is(
  (public.event_readiness('c5000000-0000-0000-0000-0000000000e1') ->> 'ready')::boolean,
  true,
  'AC07: configured registration no longer blocks the safety check'
);

-- AC05: turning registration off needs nothing else and clears the rules.
select lives_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e2', (select body from cer_settings where label = 'off'))$$,
  'AC05: registration can be turned off without other settings'
);
select results_eq(
  $$select registration_required, attendee_capacity, registration_opens_at
    from public.event_registration_requirements where event_id = 'c5000000-0000-0000-0000-0000000000e2'$$,
  $$values (false, null::integer, null::timestamptz)$$,
  'AC05: turning registration off clears its settings'
);

-- AC07 / AC01: Planning only.
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e3', (select body from cer_settings where label = 'valid'))$$,
  '23514', 'Registration settings can only be changed while the event is in Planning',
  'AC07: settings cannot change once the event is Pending Safety Check'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e4', (select body from cer_settings where label = 'valid'))$$,
  '23514', 'Registration settings can only be changed while the event is in Planning',
  'AC01: a Requested event only records whether registration is required'
);

-- AC02: only the event's own organiser.
select set_config('request.jwt.claims', '{"sub":"c5000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'valid'))$$,
  '42501', 'Only the event''s organiser can configure its registration',
  'AC02: another organiser cannot configure the event''s registration'
);

-- AC08: a smaller main venue approved later is reported, not corrected.
reset role;
update public.venues set capacity = 50 where id = 'c5000000-0000-0000-0000-000000000010';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c5000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select (r ->> 'ready')::boolean,
      exists (select 1 from jsonb_array_elements(r -> 'outstandingItems') i where i ->> 'code' = 'registration_over_capacity'),
      (select attendee_capacity from public.event_registration_requirements where event_id = 'c5000000-0000-0000-0000-0000000000e1')
    from (select public.event_readiness('c5000000-0000-0000-0000-0000000000e1') as r) x$$,
  $$values (false, true, 90)$$,
  'AC08: capacity above a smaller venue blocks the safety check and is left unchanged'
);

select * from finish();
rollback;
