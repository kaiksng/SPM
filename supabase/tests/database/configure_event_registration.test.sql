begin;

select plan(42);

-- SPM-40: Configure Event Registration (202610240001).

insert into auth.users (id, email, raw_user_meta_data) values
  ('c5000000-0000-0000-0000-000000000001', 'cer-organiser@example.test', '{"full_name":"CER Organiser","role":"event_organiser"}'::jsonb),
  ('c5000000-0000-0000-0000-000000000002', 'cer-coordinator@example.test', '{"full_name":"CER Coordinator","role":"event_coordinator"}'::jsonb),
  ('c5000000-0000-0000-0000-000000000003', 'cer-other-organiser@example.test', '{"full_name":"CER Other Organiser","role":"event_organiser"}'::jsonb),
  ('c5000000-0000-0000-0000-000000000004', 'cer-attendee@example.test', '{"full_name":"CER Attendee","role":"attendee"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('c5000000-0000-0000-0000-000000000010', 'CER Hall', 'Block 5', 100);

-- e1: Planning, approved main venue (capacity 100), registration required but
--     not yet set up (what submission leaves behind).
-- e2: Planning, no venue yet.   e3: Pending Safety Check.   e4: Requested.
-- e5: Draft.   e6: Confirmed (later sent back to Planning).
-- e7/e8/e9: Completed, Cancelled, Rejected.
-- r1-r5: attendee registration (AC05/AC09), set up directly below.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, expected_attendance, requirements_acknowledged) values
  ('c5000000-0000-0000-0000-0000000000e1', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER Planning Event', 'planning', '2099-12-01T10:00:00+08:00', '2099-12-01T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000e2', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER No Venue Event', 'planning', '2099-12-02T10:00:00+08:00', '2099-12-02T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000e3', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER Safety Event', 'pending_safety_check', '2099-12-03T10:00:00+08:00', '2099-12-03T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000e4', 'c5000000-0000-0000-0000-000000000001', null, 'CER Requested Event', 'requested', '2099-12-04T10:00:00+08:00', '2099-12-04T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000e5', 'c5000000-0000-0000-0000-000000000001', null, 'CER Draft Event', 'draft', '2099-12-05T10:00:00+08:00', '2099-12-05T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000e6', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER Confirmed Event', 'confirmed', '2099-12-06T10:00:00+08:00', '2099-12-06T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000e7', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER Completed Event', 'completed', '2099-12-07T10:00:00+08:00', '2099-12-07T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000e8', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER Cancelled Event', 'cancelled', '2099-12-08T10:00:00+08:00', '2099-12-08T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000e9', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER Rejected Event', 'rejected', '2099-12-09T10:00:00+08:00', '2099-12-09T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER Open Confirmed Event', 'confirmed', '2099-12-10T10:00:00+08:00', '2099-12-10T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000a2', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER Planning Open Window Event', 'planning', '2099-12-11T10:00:00+08:00', '2099-12-11T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000a3', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER Not Yet Open Event', 'confirmed', '2099-12-12T10:00:00+08:00', '2099-12-12T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000a4', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER Closed Event', 'confirmed', '2099-12-13T10:00:00+08:00', '2099-12-13T12:00:00+08:00', 80, true),
  ('c5000000-0000-0000-0000-0000000000a5', 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'CER No Registration Event', 'confirmed', '2099-12-14T10:00:00+08:00', '2099-12-14T12:00:00+08:00', 80, true);

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue) values
  ('c5000000-0000-0000-0000-0000000000b1', 'c5000000-0000-0000-0000-0000000000e1', 'c5000000-0000-0000-0000-000000000010', 'c5000000-0000-0000-0000-000000000002', '2099-12-01T10:00:00+08:00', '2099-12-01T12:00:00+08:00', 'approved', true);

insert into public.event_registration_requirements (event_id, registration_required, registration_opens_at, registration_closes_at, attendee_capacity) values
  ('c5000000-0000-0000-0000-0000000000e1', true, null, null, 80),
  ('c5000000-0000-0000-0000-0000000000e2', true, null, null, null),
  ('c5000000-0000-0000-0000-0000000000a1', true, now() - interval '1 day', now() + interval '1 day', 50),
  ('c5000000-0000-0000-0000-0000000000a2', true, now() - interval '1 day', now() + interval '1 day', 50),
  ('c5000000-0000-0000-0000-0000000000a3', true, now() + interval '1 day', now() + interval '2 days', 50),
  ('c5000000-0000-0000-0000-0000000000a4', true, now() - interval '2 days', now() - interval '1 day', 50),
  ('c5000000-0000-0000-0000-0000000000a5', false, null, null, null);

create temporary table cer_settings (label text primary key, body jsonb);
grant all on cer_settings to authenticated;
insert into cer_settings values
  ('valid', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"90","waitlistEnabled":true,"withdrawalPermitted":true}'),
  ('no_opening', '{"required":true,"closesAt":"2099-11-30T18:00:00+08:00","capacity":"90","waitlistEnabled":true,"withdrawalPermitted":true}'),
  ('no_closing', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","capacity":"90","waitlistEnabled":true,"withdrawalPermitted":true}'),
  ('no_capacity', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","waitlistEnabled":true,"withdrawalPermitted":true}'),
  ('zero_capacity', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"0","waitlistEnabled":true,"withdrawalPermitted":true}'),
  ('decimal_capacity', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"2.5","waitlistEnabled":true,"withdrawalPermitted":true}'),
  ('no_waitlist', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"90","withdrawalPermitted":true}'),
  ('no_withdrawal', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"90","waitlistEnabled":true}'),
  ('reversed', '{"required":true,"opensAt":"2099-11-30T18:00:00+08:00","closesAt":"2099-11-01T09:00:00+08:00","capacity":"90","waitlistEnabled":true,"withdrawalPermitted":true}'),
  ('equal', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-01T09:00:00+08:00","capacity":"90","waitlistEnabled":true,"withdrawalPermitted":true}'),
  ('at_venue', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"100","waitlistEnabled":false,"withdrawalPermitted":false}'),
  ('over_venue', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"101","waitlistEnabled":false,"withdrawalPermitted":false}'),
  ('large', '{"required":true,"opensAt":"2099-11-01T09:00:00+08:00","closesAt":"2099-11-30T18:00:00+08:00","capacity":"5000","waitlistEnabled":false,"withdrawalPermitted":false}'),
  ('off', '{"required":false}');

-- SPM-90: the coordinator's safety plan, required before the safety check.
update public.events
set crowd_movement_plan = 'Single entrance; ushers at both exits.',
    equipment_placement_notes = 'Stage left; cables taped down.',
    emergency_access_notes = 'Two exits; assembly point at the car park.',
    restrictions_notes = 'None known.',
    emergency_access_checked = true,
    restrictions_checked = true,
    crowd_movement_checked = true
where crowd_movement_plan is null;

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
select set_config('request.jwt.claims', '{"sub":"c5000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.submit_event_for_safety_check('c5000000-0000-0000-0000-0000000000e1')$$,
  '23514', 'This event is not ready for the safety check',
  'AC07: the coordinator cannot submit the event for the safety check while registration is unconfigured'
);

-- AC02: only the event's own organiser — not the coordinator, not another organiser.
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'valid'))$$,
  '42501', 'Only the event''s organiser can configure its registration',
  'AC02: the assigned coordinator cannot configure registration'
);
select set_config('request.jwt.claims', '{"sub":"c5000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'valid'))$$,
  '42501', 'Only the event''s organiser can configure its registration',
  'AC02: another organiser cannot configure the event''s registration'
);
select set_config('request.jwt.claims', '{"sub":"c5000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- AC03: every one of the five settings is required.
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'no_opening'))$$,
  '23514', 'Enter the registration opening time',
  'AC03: the opening time is required'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'no_closing'))$$,
  '23514', 'Enter the registration closing time',
  'AC03: the closing time is required'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'no_capacity'))$$,
  '23514', 'Registration capacity must be a positive whole number',
  'AC03: the capacity is required'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'zero_capacity'))$$,
  '23514', 'Registration capacity must be a positive whole number',
  'AC03: a capacity of 0 is rejected'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'decimal_capacity'))$$,
  '23514', 'Registration capacity must be a positive whole number',
  'AC03: a decimal capacity is rejected'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'no_waitlist'))$$,
  '23514', 'Choose whether the waiting list is enabled',
  'AC03: the waiting-list choice is required'
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
  'AC04: a closing time before the opening time is rejected'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'equal'))$$,
  '23514', 'Registration closing time must be after its opening time',
  'AC04: a closing time equal to the opening time is rejected'
);

-- AC08: capped by the approved main venue, at the limit and just above it.
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'over_venue'))$$,
  '23514', 'Registration capacity cannot exceed the main venue''s capacity of 100',
  'AC08: capacity one above the approved main venue''s capacity is rejected'
);
select lives_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e2', (select body from cer_settings where label = 'large'))$$,
  'AC08: without a confirmed venue, capacity is not limited by any venue'
);

-- AC05: a refused save changed nothing.
select results_eq(
  $$select attendee_capacity, registration_opens_at from public.event_registration_requirements
    where event_id = 'c5000000-0000-0000-0000-0000000000e1'$$,
  $$values (80, null::timestamptz)$$,
  'AC05: an invalid setting saves nothing'
);

-- AC08 boundary + AC02/AC03: capacity exactly at the venue's capacity saves all five settings.
select lives_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'at_venue'))$$,
  'AC08: capacity equal to the main venue''s capacity is accepted'
);
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

-- AC02: and back on again.
select lives_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e2', (select body from cer_settings where label = 'valid'))$$,
  'AC02: the organiser can turn registration back on in Planning'
);

-- AC06: in Planning, nothing but registration can be changed by the organiser.
select throws_ok(
  $$select public.save_event_draft('{"title":"Renamed Planning Event"}'::jsonb, 'c5000000-0000-0000-0000-0000000000e1')$$,
  '42501', 'Draft not found or cannot be edited',
  'AC06: the organiser cannot edit other event details once the event is in Planning'
);
select is(
  (select title from public.events where id = 'c5000000-0000-0000-0000-0000000000e1'),
  'CER Planning Event',
  'AC06: the event''s other details are unchanged'
);

-- AC01: before Planning, registration settings can't be set.
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e5', (select body from cer_settings where label = 'valid'))$$,
  '23514', 'Registration settings can only be changed while the event is in Planning',
  'AC01: a Draft event only records whether registration is required'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e4', (select body from cer_settings where label = 'valid'))$$,
  '23514', 'Registration settings can only be changed while the event is in Planning',
  'AC01: a Requested event only records whether registration is required'
);

-- AC07: from Pending Safety Check onward nothing can change.
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e3', (select body from cer_settings where label = 'valid'))$$,
  '23514', 'Registration settings can only be changed while the event is in Planning',
  'AC07: settings cannot change once the event is Pending Safety Check'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e6', (select body from cer_settings where label = 'valid'))$$,
  '23514', 'Registration settings can only be changed while the event is in Planning',
  'AC07: settings cannot change once the event is Confirmed'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e7', (select body from cer_settings where label = 'valid'))$$,
  '23514', 'Registration settings can only be changed while the event is in Planning',
  'AC07: settings cannot change once the event is Completed'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e8', (select body from cer_settings where label = 'valid'))$$,
  '23514', 'Registration settings can only be changed while the event is in Planning',
  'AC07: settings cannot change once the event is Cancelled'
);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e9', (select body from cer_settings where label = 'valid'))$$,
  '23514', 'Registration settings can only be changed while the event is in Planning',
  'AC07: settings cannot change once the event is Rejected'
);

-- AC02: a Confirmed event sent back to Planning can be configured again.
reset role;
update public.events set status = 'planning' where id = 'c5000000-0000-0000-0000-0000000000e6';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c5000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e6', (select body from cer_settings where label = 'valid'))$$,
  'AC02: a Confirmed event sent back to Planning can have its registration configured'
);

-- AC07: with registration set up, the coordinator can submit for the safety
-- check, and the settings are then locked.
select set_config('request.jwt.claims', '{"sub":"c5000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.submit_event_for_safety_check('c5000000-0000-0000-0000-0000000000e1')$$,
  'AC07: an event with complete registration can be submitted for the safety check'
);
select set_config('request.jwt.claims', '{"sub":"c5000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.configure_event_registration('c5000000-0000-0000-0000-0000000000e1', (select body from cer_settings where label = 'large'))$$,
  '23514', 'Registration settings can only be changed while the event is in Planning',
  'AC07: once submitted for the safety check the settings are locked'
);

-- AC08: a smaller main venue approved later is reported, not corrected.
reset role;
update public.venues set capacity = 50 where id = 'c5000000-0000-0000-0000-000000000010';
set local role authenticated;
select results_eq(
  $$select (r ->> 'ready')::boolean,
      exists (select 1 from jsonb_array_elements(r -> 'outstandingItems') i where i ->> 'code' = 'registration_over_capacity'),
      (select attendee_capacity from public.event_registration_requirements where event_id = 'c5000000-0000-0000-0000-0000000000e1')
    from (select public.event_readiness('c5000000-0000-0000-0000-0000000000e1') as r) x$$,
  $$values (false, true, 90)$$,
  'AC08: capacity above a smaller venue is flagged and left unchanged'
);

-- AC05/AC09: when attendees can register. register_for_event is called by
-- the backend's service client with the attendee as p_actor_id.
reset role;
select throws_ok(
  $$select public.register_for_event('c5000000-0000-0000-0000-0000000000a5', 'c5000000-0000-0000-0000-000000000004')$$,
  '23514', 'This event does not require registration',
  'AC05: attendees cannot register when registration is off'
);
select throws_ok(
  $$select public.register_for_event('c5000000-0000-0000-0000-0000000000a2', 'c5000000-0000-0000-0000-000000000004')$$,
  '23514', 'This event is not open for registration',
  'AC09: attendees cannot register before the event is Confirmed, even with the opening time passed'
);
select throws_ok(
  $$select public.register_for_event('c5000000-0000-0000-0000-0000000000a3', 'c5000000-0000-0000-0000-000000000004')$$,
  '23514', 'Registration has not opened yet',
  'AC09: attendees cannot register on a Confirmed event before the opening time'
);
select throws_ok(
  $$select public.register_for_event('c5000000-0000-0000-0000-0000000000a4', 'c5000000-0000-0000-0000-000000000004')$$,
  '23514', 'Registration is closed',
  'AC09: attendees cannot register on a Confirmed event after the closing time'
);
select lives_ok(
  $$select public.register_for_event('c5000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000004')$$,
  'AC09: attendees can register on a Confirmed event between the opening and closing times'
);
select is(
  (select status from public.event_registrations
   where event_id = 'c5000000-0000-0000-0000-0000000000a1' and attendee_id = 'c5000000-0000-0000-0000-000000000004'),
  'registered',
  'AC09: the attendee is recorded as registered'
);

select * from finish();
rollback;
