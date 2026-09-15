begin;

select plan(19);

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

-- Every call below resubmits title/purpose/description/eventType/
-- expectedAttendance/startsAt/endsAt/registration unchanged from this
-- baseline — those are the fields 202609150008 locks once Planning. Only
-- venue and equipment vary between calls.
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

-- 202609150008: overview, schedule and registration are locked once
-- Planning — one representative field from each group.
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Renamed Event","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"80","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Main Hall","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  '23514',
  'Event name is locked once the event reaches Planning',
  'the event name is locked once Planning is reached'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Original Title","purpose":"A different purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"80","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Main Hall","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  '23514',
  'Purpose is locked once the event reaches Planning',
  'purpose is locked once Planning is reached'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Original Title","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"500","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Main Hall","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  '23514',
  'Expected attendance is locked once the event reaches Planning',
  'expected attendance (overview) is locked once Planning is reached'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Original Title","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"80","startsAt":"2099-04-02T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Main Hall","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  '23514',
  'Start time is locked once the event reaches Planning',
  'the schedule (start time) is locked once Planning is reached'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Original Title","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"80","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Main Hall","facilities":[]},"equipment":[],"registration":{"required":true,"capacity":"50","waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  '23514',
  'Registration details are locked once the event reaches Planning',
  'registration is locked once Planning is reached'
);

-- AC01: one field changed in one save (venue, still open to the
-- coordinator) records previous value, new value, actor and timestamp.
select lives_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Original Title","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"80","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Auditorium","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  'the coordinator can still update venue while overview/schedule/registration stay locked'
);
select is(
  (
    select row(field_name, previous_value, new_value, changed_by)
    from public.event_field_changes
    where event_id = (select id from pcp_event_ids)
  ),
  row('venue.preferredLocation', 'Main Hall', 'Auditorium', '80000000-0000-0000-0000-000000000002'::uuid),
  'AC01: the change records the previous value, new value and actor'
);

-- AC02: multiple still-open fields changed in one save are logged as
-- separate entries.
select lives_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Original Title","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"80","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Auditorium","minimumCapacity":"200","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  'the coordinator can change several still-open fields in one save'
);
select results_eq(
  format(
    $$select field_name from public.event_field_changes
      where event_id = %L::uuid and field_name <> 'venue.preferredLocation'
      order by changed_at asc, id asc$$,
    (select id from pcp_event_ids)
  ),
  array['venue.minimumCapacity'],
  'AC02: the newly changed field is logged as its own entry'
);

-- AC03: resubmitting with no actual changes creates no new entries.
select is(
  (
    select count(*)::integer from public.event_field_changes
    where event_id = (select id from pcp_event_ids)
  ),
  2,
  'sanity check: two entries recorded so far'
);
select lives_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Original Title","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"80","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Auditorium","minimumCapacity":"200","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
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
  2,
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
      '{"title":"Original Title","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"80","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Hijacked Hall","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
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
      '{"title":"Original Title","purpose":"Original purpose","description":"A test event for coordinator planning updates.","expectedAttendance":"80","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Organiser Edit","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from pcp_event_ids)
  ),
  '42501',
  'Only the assigned coordinator can update this event',
  'the organiser cannot use the coordinator-only update path'
);

select * from finish();
rollback;
