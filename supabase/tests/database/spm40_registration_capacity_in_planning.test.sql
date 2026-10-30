begin;

select plan(6);

-- SPM-40 AC01 / SPM-07: the request only records whether registration is
-- required. An event that requires registration but has no capacity yet can
-- still be submitted and approved; capacity is set once it is in Planning.
insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '40400000-0000-0000-0000-000000000001',
    'spm40-capacity-organiser@example.test',
    '{"full_name":"SPM-40 Capacity Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '40400000-0000-0000-0000-000000000002',
    'spm40-capacity-coordinator@example.test',
    '{"full_name":"SPM-40 Capacity Coordinator","role":"event_coordinator"}'::jsonb
  ),
  (
    '40400000-0000-0000-0000-000000000003',
    'spm40-capacity-lead@example.test',
    '{"full_name":"SPM-40 Capacity Lead","role":"event_coordinator_lead"}'::jsonb
  );

create temporary table spm40_event (id uuid);
grant all on spm40_event to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40400000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

insert into spm40_event
select public.save_event_draft(
  '{
    "title":"[SPM-40 Test] Registration Later",
    "purpose":"Check registration capacity is set in Planning",
    "description":"An event that requires registration.",
    "expectedAttendance":"80",
    "startsAt":"2099-06-01T10:00:00+08:00",
    "endsAt":"2099-06-01T12:00:00+08:00",
    "venue":{"preferredLocation":"Main Hall","facilities":[]},
    "equipment":[],
    "registration":{"required":true,"waitlistEnabled":false},
    "requirementsAcknowledged":true
  }'::jsonb
);

-- AC01: submitting does not ask for a capacity.
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from spm40_event)),
  'an event that requires registration can be submitted without a capacity'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"40400000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.reassign_event_coordinator(%L::uuid, '40400000-0000-0000-0000-000000000002'::uuid, '')$$,
    (select id from spm40_event)
  ),
  'the Lead assigns a coordinator'
);

-- SPM-07: approving does not ask for a capacity either.
select set_config(
  'request.jwt.claims',
  '{"sub":"40400000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, '')$$,
    (select id from spm40_event)
  ),
  'an event that requires registration can be approved without a capacity'
);

reset role;

select is(
  (select status::text from public.events where id = (select id from spm40_event)),
  'planning',
  'the approved event is in Planning'
);

select ok(
  (select registration_required from public.event_registration_requirements
   where event_id = (select id from spm40_event)),
  'the event still requires registration'
);

-- AC02: capacity is left for the organiser to set in Planning.
select is(
  (select attendee_capacity from public.event_registration_requirements
   where event_id = (select id from spm40_event)),
  null::integer,
  'no capacity is set before Planning'
);

select * from finish();
rollback;
