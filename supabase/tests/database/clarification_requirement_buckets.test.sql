begin;

select plan(10);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '70000000-0000-0000-0000-000000000001',
    'buckets-organiser@example.test',
    '{"full_name":"Buckets Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    'buckets-coordinator@example.test',
    '{"full_name":"Buckets Coordinator","role":"event_coordinator"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table pbb_event_ids (id uuid);

select lives_ok(
  $$insert into pbb_event_ids
    select public.save_event_draft(
      '{
        "title":"Buckets Test Event",
        "purpose":"Original purpose",
        "description":"A test event for clarification bucket splitting.",
        "expectedAttendance":"80",
        "startsAt":"2099-04-01T10:00:00+08:00",
        "endsAt":"2099-04-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[{"equipmentName":"Projector","quantity":"1","notes":null}],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save a complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pbb_event_ids)),
  'the event can be submitted'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- Requesting the retired combined bucket is no longer accepted for a new
-- clarification round, even though old rows that already have it stay valid.
select throws_ok(
  format(
    $$select public.request_event_clarification(%L::uuid, 'why no need registration', array['requirements']::text[])$$,
    (select id from pbb_event_ids)
  ),
  '23514',
  'One or more permitted fields are not recognised',
  'the legacy combined "requirements" bucket can no longer be requested'
);

-- The coordinator only needs the registration answer fixed.
select lives_ok(
  format(
    $$select public.request_event_clarification(%L::uuid, 'why no need registration', array['registration']::text[])$$,
    (select id from pbb_event_ids)
  ),
  'a coordinator can request clarification on the registration bucket alone'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- Equipment and venue must stay locked: only "registration" was granted.
select throws_ok(
  format(
    $$select public.save_event_draft(
      '{
        "title":"Buckets Test Event",
        "purpose":"Original purpose",
        "description":"A test event for clarification bucket splitting.",
        "expectedAttendance":"80",
        "startsAt":"2099-04-01T10:00:00+08:00",
        "endsAt":"2099-04-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[{"equipmentName":"Projector","quantity":"2","notes":null}],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from pbb_event_ids)
  ),
  '23514',
  'Equipment and technical needs is locked while a clarification is open',
  'equipment stays locked when only registration was granted'
);
select throws_ok(
  format(
    $$select public.save_event_draft(
      '{
        "title":"Buckets Test Event",
        "purpose":"Original purpose",
        "description":"A test event for clarification bucket splitting.",
        "expectedAttendance":"80",
        "startsAt":"2099-04-01T10:00:00+08:00",
        "endsAt":"2099-04-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Auditorium","facilities":[]},
        "equipment":[{"equipmentName":"Projector","quantity":"1","notes":null}],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from pbb_event_ids)
  ),
  '23514',
  'Venue requirements is locked while a clarification is open',
  'venue stays locked when only registration was granted'
);

-- Registration, the granted bucket, can be edited.
select lives_ok(
  format(
    $$select public.save_event_draft(
      '{
        "title":"Buckets Test Event",
        "purpose":"Original purpose",
        "description":"A test event for clarification bucket splitting.",
        "expectedAttendance":"80",
        "startsAt":"2099-04-01T10:00:00+08:00",
        "endsAt":"2099-04-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[{"equipmentName":"Projector","quantity":"1","notes":null}],
        "registration":{"required":true,"capacity":"50","waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from pbb_event_ids)
  ),
  'registration, the granted bucket, can be edited'
);
select is(
  (select registration_required from public.event_registration_requirements where event_id = (select id from pbb_event_ids)),
  true,
  'the registration edit was actually applied'
);

-- Legacy compatibility: an already-open round created before the split
-- (permitted_fields = ['requirements']) still unlocks all three sections.
-- Simulate this directly since request_event_clarification can no longer
-- create one.
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
-- Resolve the open registration-only round first (only one open/answered
-- round is allowed at a time), then simulate a legacy combined-bucket round.
-- Both writes go directly to the table, which has no INSERT/UPDATE policy of
-- its own (only request_event_clarification/respond_event_clarification, as
-- security definer functions, can write it normally) — bypass RLS the same
-- way pb02/pb04's tests seed state directly, via reset role.
reset role;
update public.clarifications
set status = 'resolved', resolved_at = now(), resolved_by = '70000000-0000-0000-0000-000000000002'
where event_id = (select id from pbb_event_ids) and status = 'open';

insert into public.clarifications (event_id, requested_by, question, permitted_fields, status, requested_at)
values (
  (select id from pbb_event_ids),
  '70000000-0000-0000-0000-000000000002',
  'legacy round predating the split',
  array['requirements'],
  'open',
  now()
);
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.save_event_draft(
      '{
        "title":"Buckets Test Event",
        "purpose":"Original purpose",
        "description":"A test event for clarification bucket splitting.",
        "expectedAttendance":"80",
        "startsAt":"2099-04-01T10:00:00+08:00",
        "endsAt":"2099-04-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Auditorium","facilities":[]},
        "equipment":[{"equipmentName":"Projector","quantity":"3","notes":null}],
        "registration":{"required":true,"capacity":"50","waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from pbb_event_ids)
  ),
  'a legacy "requirements" grant still unlocks venue and equipment together'
);
select is(
  (select preferred_location from public.event_venue_requirements where event_id = (select id from pbb_event_ids)),
  'Auditorium',
  'the venue edit under the legacy bucket was actually applied'
);

select * from finish();
rollback;
