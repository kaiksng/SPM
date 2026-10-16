begin;

select plan(25);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'e0000000-0000-0000-0000-000000000001',
    'cer-organiser-a@example.test',
    '{"full_name":"CER Organiser A","role":"event_organiser"}'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    'cer-organiser-b@example.test',
    '{"full_name":"CER Organiser B","role":"event_organiser"}'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000003',
    'cer-coordinator@example.test',
    '{"full_name":"CER Coordinator","role":"event_coordinator"}'::jsonb
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
  '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table cer_event_ids (label text primary key, id uuid);
create temporary table cer_clarification_ids (label text primary key, id uuid);

-- Event A: happy path — the organiser cancels their own Requested event.
select lives_ok(
  $$insert into cer_event_ids
    select 'event-a', public.save_event_draft(
      '{
        "title":"[CER] Event A",
        "purpose":"Cancel event request test.",
        "description":"A test event.",
        "expectedAttendance":"20",
        "startsAt":"2099-05-01T10:00:00+08:00",
        "endsAt":"2099-05-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event A as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from cer_event_ids where label = 'event-a')),
  'Event A can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from cer_event_ids where label = 'event-a')),
  'the Lead assigns the next available coordinator'
);
select lives_ok(
  format($$select public.cancel_event_request(%L::uuid)$$, (select id from cer_event_ids where label = 'event-a')),
  'AC01/AC02: the organiser can cancel their own Requested event'
);
select is(
  (select status::text from public.events where id = (select id from cer_event_ids where label = 'event-a')),
  'cancelled',
  'AC04: the cancelled event''s status is Cancelled'
);
select throws_ok(
  format($$select public.cancel_event_request(%L::uuid)$$, (select id from cer_event_ids where label = 'event-a')),
  '23514',
  'Only a Requested event can be cancelled before it is decided',
  'a already-cancelled event cannot be cancelled again'
);

-- Event B: only the owning organiser may cancel it.
select lives_ok(
  $$insert into cer_event_ids
    select 'event-b', public.save_event_draft(
      '{
        "title":"[CER] Event B",
        "purpose":"Cancel event request test.",
        "description":"A second test event.",
        "expectedAttendance":"15",
        "startsAt":"2099-05-02T10:00:00+08:00",
        "endsAt":"2099-05-02T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event B as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from cer_event_ids where label = 'event-b')),
  'Event B can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from cer_event_ids where label = 'event-b')),
  'the Lead assigns the next available coordinator'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  format($$select public.cancel_event_request(%L::uuid)$$, (select id from cer_event_ids where label = 'event-b')),
  '42501',
  'Only the organiser who submitted this event can cancel it',
  'AC01: a different organiser cannot cancel someone else''s event'
);

-- Event C: an unresolved clarification blocks cancellation until closed.
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into cer_event_ids
    select 'event-c', public.save_event_draft(
      '{
        "title":"[CER] Event C",
        "purpose":"Cancel event request test.",
        "description":"A third test event.",
        "expectedAttendance":"10",
        "startsAt":"2099-05-03T10:00:00+08:00",
        "endsAt":"2099-05-03T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event C as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from cer_event_ids where label = 'event-c')),
  'Event C can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from cer_event_ids where label = 'event-c')),
  'the Lead assigns the next available coordinator'
);

-- Event C is assigned to the only coordinator in this test's pool.
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$insert into cer_clarification_ids
      select 'round-1', (public.request_event_clarification(
        %L::uuid, 'Can you confirm the headcount?', array[]::text[]
      ) ->> 'id')::uuid$$,
    (select id from cer_event_ids where label = 'event-c')
  ),
  'the assigned coordinator can open a clarification on Event C'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  format($$select public.cancel_event_request(%L::uuid)$$, (select id from cer_event_ids where label = 'event-c')),
  '23514',
  'This event has an unresolved clarification and cannot be cancelled until it is closed',
  'AC03: an open clarification blocks cancellation'
);
select lives_ok(
  format(
    $$select public.respond_event_clarification(%L::uuid, 'Confirmed at 10 attendees.')$$,
    (select id from cer_clarification_ids where label = 'round-1')
  ),
  'the organiser responds to the clarification'
);
select throws_ok(
  format($$select public.cancel_event_request(%L::uuid)$$, (select id from cer_event_ids where label = 'event-c')),
  '23514',
  'This event has an unresolved clarification and cannot be cancelled until it is closed',
  'AC03: an answered-but-not-yet-resolved clarification still blocks cancellation'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.resolve_event_clarification(%L::uuid)$$,
    (select id from cer_clarification_ids where label = 'round-1')
  ),
  'the assigned coordinator resolves the clarification'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  format($$select public.cancel_event_request(%L::uuid)$$, (select id from cer_event_ids where label = 'event-c')),
  'AC03: cancellation succeeds once the clarification is resolved'
);
select is(
  (select status::text from public.events where id = (select id from cer_event_ids where label = 'event-c')),
  'cancelled',
  'Event C''s status is now Cancelled'
);

-- Event D: once the coordinator has decided, cancellation is no longer available.
select lives_ok(
  $$insert into cer_event_ids
    select 'event-d', public.save_event_draft(
      '{
        "title":"[CER] Event D",
        "purpose":"Cancel event request test.",
        "description":"A fourth test event.",
        "expectedAttendance":"25",
        "startsAt":"2099-05-04T10:00:00+08:00",
        "endsAt":"2099-05-04T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event D as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from cer_event_ids where label = 'event-d')),
  'Event D can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from cer_event_ids where label = 'event-d')),
  'the Lead assigns the next available coordinator'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from cer_event_ids where label = 'event-d')
  ),
  'the coordinator approves Event D into Planning'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  format($$select public.cancel_event_request(%L::uuid)$$, (select id from cer_event_ids where label = 'event-d')),
  '23514',
  'Only a Requested event can be cancelled before it is decided',
  'AC02: once the coordinator has decided, the event can no longer be cancelled this way'
);

select * from finish();
rollback;
