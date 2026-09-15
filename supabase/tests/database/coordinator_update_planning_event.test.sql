begin;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '80000000-0000-0000-0000-000000000001',
    'planning-organiser@example.test',
    '{"full_name":"Planning Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    'planning-coordinator-a@example.test',
    '{"full_name":"Planning Coordinator A","role":"event_coordinator"}'::jsonb
  );

create temporary table pcp_event_ids (id uuid);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into pcp_event_ids
    select public.save_event_draft(
      '{
        "title":"Original Title",
        "purpose":"Original purpose",
        "description":"A test event for coordinator planning updates.",
        "expectedAttendance":"80",
        "startsAt":"2099-04-01T10:00:00+08:00",
        "endsAt":"2099-04-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save a complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pcp_event_ids)),
  'the event can be submitted'
);

-- A second coordinator, added after assignment, so they are never
-- accountable for this event and are not "the assigned coordinator" for it.
insert into auth.users (id, email, raw_user_meta_data)
values (
  '80000000-0000-0000-0000-000000000003',
  'planning-coordinator-b@example.test',
  '{"full_name":"Planning Coordinator B","role":"event_coordinator"}'::jsonb
);

select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- The write path only opens once the event is Planning, not while Requested.
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Too Early","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"80","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Main Hall","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  '23514',
  'Only a Planning event can be updated this way',
  'a Requested event cannot be updated through this path'
);

select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks ready.')$$,
    (select id from pcp_event_ids)
  ),
  'the assigned coordinator can approve the complete request'
);
select is(
  (select status::text from public.events where id = (select id from pcp_event_ids)),
  'planning',
  'the event has moved to Planning'
);

-- AC01: one field changed in one save records previous value, new value,
-- actor and timestamp.
select lives_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Updated Title","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"80","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Main Hall","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  'the assigned coordinator can update a Planning event'
);
select is(
  (
    select row(field_name, previous_value, new_value, changed_by)
    from public.event_field_changes
    where event_id = (select id from pcp_event_ids)
  ),
  row('title', 'Original Title', 'Updated Title', '80000000-0000-0000-0000-000000000002'::uuid),
  'AC01: the change records the previous value, new value and actor'
);

-- AC02: multiple fields changed in one save are logged as separate entries.
select lives_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Updated Title","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"150","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Auditorium","facilities":[]},"equipment":[],"registration":{"required":true,"capacity":"100","waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  'the coordinator can change several fields in one save'
);
select results_eq(
  format(
    $$select field_name from public.event_field_changes
      where event_id = %L::uuid and field_name <> 'title'
      order by changed_at asc, id asc$$,
    (select id from pcp_event_ids)
  ),
  array['expectedAttendance', 'venue.preferredLocation', 'registration.required', 'registration.capacity'],
  'AC02: each changed field is logged as its own entry'
);

-- AC03: resubmitting with no actual changes creates no new entries.
select is(
  (
    select count(*)::integer from public.event_field_changes
    where event_id = (select id from pcp_event_ids)
  ),
  5,
  'sanity check: five entries recorded so far (1 + 4)'
);
select lives_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Updated Title","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"150","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Auditorium","facilities":[]},"equipment":[],"registration":{"required":true,"capacity":"100","waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  'saving unchanged values succeeds'
);
select is(
  (
    select count(*)::integer from public.event_field_changes
    where event_id = (select id from pcp_event_ids)
  ),
  5,
  'AC03: no new entries are created when nothing actually changed'
);

-- Authorisation: a coordinator not assigned to this event cannot update it.
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Hijacked","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"150","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Auditorium","facilities":[]},"equipment":[],"registration":{"required":true,"capacity":"100","waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  '42501',
  'Only the assigned coordinator can update this event',
  'a coordinator not assigned to the event cannot update it'
);

-- Authorisation: the organiser cannot use this coordinator-only write path,
-- even for their own event.
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Organiser Edit","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"150","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Auditorium","facilities":[]},"equipment":[],"registration":{"required":true,"capacity":"100","waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  '42501',
  'Only the assigned coordinator can update this event',
  'the organiser cannot use the coordinator-only update path'
);

select * from finish();
rollback;
