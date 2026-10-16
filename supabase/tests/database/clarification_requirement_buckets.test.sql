begin;

select plan(11);

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

-- 202610050003: submitting no longer assigns a coordinator; the Event
-- Coordinator Lead does. This helper has the Lead assign the coordinator the
-- old automatic assignment would have picked (least active requests, then
-- lowest id), so the checks below keep their original meaning.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'eeeeeeee-0000-0000-0000-0000000000ad',
  'pgtap-lead@example.test',
  '{"full_name":"pgTAP Lead","role":"event_coordinator_lead"}'::jsonb
);

create function pg_temp.lead_assigns_coordinator(p_event_id uuid)
returns uuid
language plpgsql
security definer
as $helper$
declare
  saved_claims text := current_setting('request.jwt.claims', true);
  coordinator_id uuid;
begin
  select p.id into coordinator_id
  from public.profiles p
  where p.role = 'event_coordinator'::public.user_role
  order by (
    select count(*) from public.events e
    where e.assigned_coordinator_id = p.id
      and e.status in ('requested', 'submitted', 'clarification_requested', 'under_review', 'approved')
  ) asc, p.id asc
  limit 1;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"eeeeeeee-0000-0000-0000-0000000000ad","role":"authenticated"}',
    true
  );
  perform public.reassign_event_coordinator(p_event_id, coordinator_id, '');
  perform set_config('request.jwt.claims', saved_claims, true);
  return coordinator_id;
end;
$helper$;


set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table pbb_event_ids (id uuid);

select lives_ok(
  format(
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
        "equipment":[{"equipmentItemId":"%s","quantity":"1","requiredFrom":"2099-04-01T09:00:00+08:00","requiredUntil":"2099-04-01T13:00:00+08:00","notes":null}],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
    (select id from public.equipment_items where name = 'Projector')
  ),
  'the organiser can save a complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pbb_event_ids)),
  'the event can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from pbb_event_ids)),
  'the Lead assigns the next available coordinator'
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
        "equipment":[{"id":"%s","equipmentItemId":"%s","quantity":"2","requiredFrom":"2099-04-01T09:00:00+08:00","requiredUntil":"2099-04-01T13:00:00+08:00","notes":null}],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from public.event_equipment_requirements where event_id = (select id from pbb_event_ids)),
    (select id from public.equipment_items where name = 'Projector'),
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
        "equipment":[{"id":"%s","equipmentItemId":"%s","quantity":"1","requiredFrom":"2099-04-01T09:00:00+08:00","requiredUntil":"2099-04-01T13:00:00+08:00","notes":null}],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from public.event_equipment_requirements where event_id = (select id from pbb_event_ids)),
    (select id from public.equipment_items where name = 'Projector'),
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
        "equipment":[{"id":"%s","equipmentItemId":"%s","quantity":"1","requiredFrom":"2099-04-01T09:00:00+08:00","requiredUntil":"2099-04-01T13:00:00+08:00","notes":null}],
        "registration":{"required":true,"capacity":"50","waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from public.event_equipment_requirements where event_id = (select id from pbb_event_ids)),
    (select id from public.equipment_items where name = 'Projector'),
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
        "equipment":[{"id":"%s","equipmentItemId":"%s","quantity":"3","requiredFrom":"2099-04-01T09:00:00+08:00","requiredUntil":"2099-04-01T13:00:00+08:00","notes":null}],
        "registration":{"required":true,"capacity":"50","waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from public.event_equipment_requirements where event_id = (select id from pbb_event_ids)),
    (select id from public.equipment_items where name = 'Projector'),
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
