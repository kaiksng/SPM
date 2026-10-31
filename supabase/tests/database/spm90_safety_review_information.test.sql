begin;

select plan(30);

-- SPM-90: the coordinator's safety checks for the Operational Safety Check
-- (202610310005-202610310007). On the Venue step: emergency access, known
-- restrictions and crowd movement, each ticked with optional details. On the
-- Equipment step: equipment placement as text.

insert into auth.users (id, email, raw_user_meta_data) values
  ('fe900000-0000-0000-0000-000000000001', 'srev-organiser@example.test', '{"full_name":"SREV Organiser","role":"event_organiser"}'::jsonb),
  ('fe900000-0000-0000-0000-000000000002', 'srev-coordinator@example.test', '{"full_name":"SREV Coordinator","role":"event_coordinator"}'::jsonb),
  ('fe900000-0000-0000-0000-000000000003', 'srev-safety@example.test', '{"full_name":"SREV Safety","role":"safety_officer"}'::jsonb),
  ('fe900000-0000-0000-0000-000000000004', 'srev-other@example.test', '{"full_name":"SREV Other","role":"event_coordinator"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('fe900000-0000-0000-0000-000000000010', 'SREV Hall', 'Block 9', 200);

-- E1: Planning with equipment. E2: Planning, no equipment. E3: Pending Safety Check.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, expected_attendance, requirements_acknowledged)
values
  ('fe900000-0000-0000-0000-0000000000e1', 'fe900000-0000-0000-0000-000000000001', 'fe900000-0000-0000-0000-000000000002', 'SREV Event 1', 'planning', '2099-12-20T10:00:00+08:00', '2099-12-20T12:00:00+08:00', 80, true),
  ('fe900000-0000-0000-0000-0000000000e2', 'fe900000-0000-0000-0000-000000000001', 'fe900000-0000-0000-0000-000000000002', 'SREV Event 2', 'planning', '2099-12-21T10:00:00+08:00', '2099-12-21T12:00:00+08:00', 80, true),
  ('fe900000-0000-0000-0000-0000000000e3', 'fe900000-0000-0000-0000-000000000001', 'fe900000-0000-0000-0000-000000000002', 'SREV Event 3', 'pending_safety_check', '2099-12-22T10:00:00+08:00', '2099-12-22T12:00:00+08:00', 80, true);

insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
values ('fe900000-0000-0000-0000-0000000000e1', (select id from public.equipment_items where code = 'mic'), 'x', 1, '2099-12-20T10:00:00+08:00', '2099-12-20T12:00:00+08:00');

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue)
values ('fe900000-0000-0000-0000-0000000000b3', 'fe900000-0000-0000-0000-0000000000e3', 'fe900000-0000-0000-0000-000000000010', 'fe900000-0000-0000-0000-000000000002', '2099-12-22T10:00:00+08:00', '2099-12-22T12:00:00+08:00', 'approved', true);

update public.events
set emergency_access_checked = true,
    emergency_access_notes = 'Four exits; assembly point at the car park.',
    restrictions_checked = true,
    restrictions_notes = null,
    crowd_movement_checked = true,
    crowd_movement_plan = 'One-way flow: enter at the front, leave by the side doors.',
    equipment_placement_notes = 'Speakers either side of the stage, cables under mats.'
where id = 'fe900000-0000-0000-0000-0000000000e3';

select hasnt_function('public', 'set_event_safety_plan', 'the single safety plan save is replaced by one per step');

set local role authenticated;

-- Readiness: each venue check is outstanding until ticked; placement until written.
select set_config('request.jwt.claims', '{"sub":"fe900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
create temporary table v_codes as
select item ->> 'code' as code
from jsonb_array_elements(public.event_readiness('fe900000-0000-0000-0000-0000000000e1') -> 'outstandingItems') item;

select ok(exists (select 1 from v_codes where code = 'emergency_access_not_checked'), 'an unticked emergency access check is outstanding');
select ok(exists (select 1 from v_codes where code = 'restrictions_not_checked'), 'an unticked known restrictions check is outstanding');
select ok(exists (select 1 from v_codes where code = 'crowd_movement_not_checked'), 'an unticked crowd movement check is outstanding');
select ok(
  exists (select 1 from v_codes where code = 'equipment_placement_missing'),
  'missing equipment placement is outstanding when the event has equipment'
);
select ok(
  not (public.event_readiness('fe900000-0000-0000-0000-0000000000e2') -> 'outstandingItems' @> '[{"code":"equipment_placement_missing"}]'),
  'equipment placement is not needed when the event has no equipment'
);

-- Only the assigned coordinator, only in Planning.
select set_config('request.jwt.claims', '{"sub":"fe900000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.set_event_venue_safety_checks('fe900000-0000-0000-0000-0000000000e1', true, null, true, null, true, null)$$,
  '42501', 'Only the event''s assigned coordinator can update its safety checks',
  'another coordinator cannot tick the venue safety checks'
);
select set_config('request.jwt.claims', '{"sub":"fe900000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.set_event_equipment_placement('fe900000-0000-0000-0000-0000000000e1', 'Stage left')$$,
  '42501', 'Only the event''s assigned coordinator can update its safety checks',
  'the organiser cannot record equipment placement'
);
select set_config('request.jwt.claims', '{"sub":"fe900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.set_event_venue_safety_checks('fe900000-0000-0000-0000-0000000000e3', true, null, true, null, true, null)$$,
  '23514', 'Safety checks can only be changed while the event is in Planning',
  'the checks are locked once the event is with the Safety Officer'
);
select throws_ok(
  $$select public.set_event_venue_safety_checks('fe900000-0000-0000-0000-0000000000e1', true, repeat('x', 2001), true, null, true, null)$$,
  '23514', 'Emergency access must contain at most 2,000 characters',
  'over-long emergency access details are refused'
);

-- Ticking is enough; details are optional.
select lives_ok(
  $$select public.set_event_venue_safety_checks(
    'fe900000-0000-0000-0000-0000000000e1',
    true, '  Exits at gates B and C.  ',
    true, null,
    true, ''
  )$$,
  'the assigned coordinator ticks the venue checks, with details only where needed'
);
select lives_ok(
  $$select public.set_event_equipment_placement('fe900000-0000-0000-0000-0000000000e1', 'Projector at the back, cables taped.')$$,
  'the assigned coordinator records the equipment placement'
);
reset role;
select is(
  (select row(emergency_access_checked, emergency_access_notes, restrictions_checked, restrictions_notes,
              crowd_movement_checked, crowd_movement_plan, equipment_placement_notes)
   from public.events where id = 'fe900000-0000-0000-0000-0000000000e1'),
  row(true, 'Exits at gates B and C.'::text, true, null::text, true, null::text, 'Projector at the back, cables taped.'::text),
  'the ticks and details are saved, trimmed, blanks cleared'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fe900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select ok(
  not exists (
    select 1 from jsonb_array_elements(public.event_readiness('fe900000-0000-0000-0000-0000000000e1') -> 'outstandingItems') item
    where item ->> 'code' in ('emergency_access_not_checked', 'restrictions_not_checked', 'crowd_movement_not_checked', 'equipment_placement_missing')
  ),
  'once ticked and placed, no safety check is outstanding'
);

select lives_ok(
  $$select public.set_event_venue_safety_checks('fe900000-0000-0000-0000-0000000000e1', false, null, true, null, true, null)$$,
  'a check can be unticked'
);
select ok(
  public.event_readiness('fe900000-0000-0000-0000-0000000000e1') -> 'outstandingItems' @> '[{"code":"emergency_access_not_checked"}]',
  'an unticked check is outstanding again'
);

-- The Safety Officer sees the ticks and the details.
select set_config('request.jwt.claims', '{"sub":"fe900000-0000-0000-0000-000000000003","role":"authenticated"}', true);
create temporary table v_details as
select public.safety_check_review_details('fe900000-0000-0000-0000-0000000000e3') as body;

select is(
  (select row((body ->> 'emergencyAccessChecked')::boolean, (body ->> 'restrictionsChecked')::boolean, (body ->> 'crowdMovementChecked')::boolean) from v_details),
  row(true, true, true),
  'the review shows each venue check was ticked'
);
select is(
  (select row(body ->> 'emergencyAccess', body ->> 'restrictions') from v_details),
  row('Four exits; assembly point at the car park.'::text, null::text),
  'the review shows the details recorded, and none where there are none'
);
select is(
  (select row(body ->> 'crowdMovementPlan', body ->> 'equipmentPlacement') from v_details),
  row('One-way flow: enter at the front, leave by the side doors.'::text, 'Speakers either side of the stage, cables under mats.'::text),
  'the review shows the crowd movement details and equipment placement'
);

-- Request Changes can flag the safety checks themselves (202610310008).
reset role;
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, expected_attendance, requirements_acknowledged,
  emergency_access_checked, emergency_access_notes, restrictions_checked, crowd_movement_checked, equipment_placement_notes)
values ('fe900000-0000-0000-0000-0000000000e4', 'fe900000-0000-0000-0000-000000000001', 'fe900000-0000-0000-0000-000000000002', 'SREV Event 4', 'pending_safety_check',
  '2099-12-23T10:00:00+08:00', '2099-12-23T12:00:00+08:00', 80, true, true, 'Two exits.', true, true, 'Stage left.');
insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
values ('fe900000-0000-0000-0000-0000000000e4', (select id from public.equipment_items where code = 'mic'), 'x', 1, '2099-12-23T10:00:00+08:00', '2099-12-23T12:00:00+08:00');
insert into public.event_safety_check_submissions (event_id, coordinator_id, round, venues_snapshot, period_snapshot, attendance_snapshot, equipment_snapshot)
values
  ('fe900000-0000-0000-0000-0000000000e4', 'fe900000-0000-0000-0000-000000000002', 1, '[]', '{}', 80, '[]'),
  ('fe900000-0000-0000-0000-0000000000e3', 'fe900000-0000-0000-0000-000000000002', 1, '[]', '{}', 80, '[]');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fe900000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.decide_event_safety_check('fe900000-0000-0000-0000-0000000000e4', 'changes_requested', 'Fix it', '{}', '{}', null, array['fire_drill'])$$,
  '23514', 'One or more selected safety checks are not recognised',
  'an unknown safety check cannot be flagged'
);
select throws_ok(
  $$select public.decide_event_safety_check('fe900000-0000-0000-0000-0000000000e3', 'changes_requested', 'Fix it', '{}', '{}', null, array['equipment_placement'])$$,
  '23514', 'This event has no equipment, so equipment placement cannot be flagged',
  'equipment placement cannot be flagged on an event without equipment'
);
select lives_ok(
  $$select public.decide_event_safety_check('fe900000-0000-0000-0000-0000000000e4', 'changes_requested', 'The rear exit is blocked by the stage.', '{}', '{}', null, array['emergency_access', 'equipment_placement'])$$,
  'the Safety Officer can request changes to safety checks alone'
);
reset role;
select is(
  (select row(status::text, emergency_access_checked, emergency_access_notes, restrictions_checked, equipment_placement_notes)
   from public.events where id = 'fe900000-0000-0000-0000-0000000000e4'),
  row('planning'::text, false, 'Two exits.'::text, true, 'Stage left.'::text),
  'a flagged check is unticked with its details kept; others are untouched'
);
select is(
  (select row(safety_check_flags, safety_check_flag_reason) from public.events where id = 'fe900000-0000-0000-0000-0000000000e4'),
  row(array['emergency_access', 'equipment_placement']::text[], 'The rear exit is blocked by the stage.'::text),
  'the event records which checks were flagged and why'
);
select is(
  (select flagged_safety_checks from public.event_safety_check_decisions where event_id = 'fe900000-0000-0000-0000-0000000000e4'),
  array['emergency_access', 'equipment_placement']::text[],
  'the decision records the flagged safety checks'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fe900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select ok(
  public.event_readiness('fe900000-0000-0000-0000-0000000000e4') -> 'outstandingItems'
    @> '[{"code":"emergency_access_not_checked","message":"The Safety Officer asked for the emergency access to be revised (Venue step, Safety checks)."}]',
  'the coordinator is told the Safety Officer flagged the emergency access'
);
select ok(
  public.event_readiness('fe900000-0000-0000-0000-0000000000e4') -> 'outstandingItems' @> '[{"code":"equipment_placement_flagged"}]',
  'flagged equipment placement is outstanding even though its text is still there'
);

select public.set_event_venue_safety_checks('fe900000-0000-0000-0000-0000000000e4', true, 'Rear exit cleared; stage moved forward.', true, null, true, null);
select public.set_event_equipment_placement('fe900000-0000-0000-0000-0000000000e4', 'Stage moved forward, clear of the rear exit.');
reset role;
select is(
  (select safety_check_flags from public.events where id = 'fe900000-0000-0000-0000-0000000000e4'),
  '{}'::text[],
  're-ticking the check and saving the placement clears the flags'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fe900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select ok(
  not exists (
    select 1 from jsonb_array_elements(public.event_readiness('fe900000-0000-0000-0000-0000000000e4') -> 'outstandingItems') item
    where item ->> 'code' in ('emergency_access_not_checked', 'equipment_placement_flagged')
  ),
  'once revised, the flagged checks are no longer outstanding'
);

select set_config('request.jwt.claims', '{"sub":"fe900000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (select item -> 'flaggedSafetyChecks'
   from jsonb_array_elements(public.safety_check_review_history(null, 'fe900000-0000-0000-0000-0000000000e4')) item),
  '["emergency_access", "equipment_placement"]'::jsonb,
  'the review history shows the flagged safety checks'
);

select * from finish();
rollback;
