begin;

select plan(18);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '30000000-0000-0000-0000-000000000001',
    'pb03-owner@example.test',
    '{"full_name":"PB03 Owner","role":"event_organiser"}'::jsonb
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    'pb03-other@example.test',
    '{"full_name":"PB03 Other","role":"event_organiser"}'::jsonb
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    'pb03-attendee@example.test',
    '{"full_name":"PB03 Attendee","role":"attendee"}'::jsonb
  ),
  (
    -- No longer assigned by submission itself (Week 7 change #5); left in
    -- place as an unused fixture rather than renumbering the ids below.
    '30000000-0000-0000-0000-000000000004',
    'pb03-coordinator@example.test',
    '{"full_name":"PB03 Coordinator","role":"event_coordinator"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table pb03_event_ids (id uuid primary key);

-- An incomplete draft: only the mandatory-at-draft title is set.
select lives_ok(
  $$insert into pb03_event_ids
    select public.save_event_draft(
      '{
        "title":"[Shernice Test] Incomplete",
        "venue":{"facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false}
      }'::jsonb
    )$$,
  'an Event Organiser can save an incomplete draft'
);

-- AC06: submitting an incomplete request is blocked.
select throws_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb03_event_ids)),
  '23514',
  'This event request is not ready to submit',
  'an incomplete request cannot be submitted'
);

-- AC06: every affected field is identified in one pass, not one at a time.
-- A plain DO block's `perform ok(...)` discards its return value (that's
-- what PERFORM does), so the TAP line never reaches the test runner — the
-- assertion silently vanishes instead of failing. Route the check through a
-- function instead, called from a top-level `select ok(...)` so its result
-- is actually emitted.
create or replace function pg_temp.pb03_incomplete_submission_issues()
returns jsonb
language plpgsql
as $$
declare
  detail_text text;
begin
  begin
    perform public.submit_event_request((select id from pb03_event_ids));
    raise exception 'expected submit_event_request to fail';
  exception when check_violation then
    get stacked diagnostics detail_text = pg_exception_detail;
    return detail_text::jsonb;
  end;
end;
$$;

select ok(
  (
    select bool_and(elem ? 'field' and elem ? 'message')
    from jsonb_array_elements(pg_temp.pb03_incomplete_submission_issues()) as elem
  ),
  'every issue names a field and a message'
);
select ok(
  (
    'purpose' = any(array(
      select value ->> 'field' from jsonb_array_elements(pg_temp.pb03_incomplete_submission_issues()) as value
    ))
    and 'requirementsAcknowledged' = any(array(
      select value ->> 'field' from jsonb_array_elements(pg_temp.pb03_incomplete_submission_issues()) as value
    ))
  ),
  'both purpose and the requirements acknowledgement are reported together'
);

-- Complete the draft so it can be submitted.
select lives_ok(
  format(
    $$select public.save_event_draft(
      '{
        "title":"[Shernice Test] Submission",
        "purpose":"Welcome new students",
        "description":"A briefing for the incoming cohort.",
        "expectedAttendance":"120",
        "startsAt":"2099-01-01T10:00:00+08:00",
        "endsAt":"2099-01-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Seminar Room","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from pb03_event_ids)
  ),
  'the draft can be completed before submission'
);

select throws_ok(
  format(
    $$select public.submit_event_request(%L::uuid, '30000000-0000-0000-0000-000000000002'::uuid)$$,
    (select id from pb03_event_ids)
  ),
  '42501',
  'You cannot submit an event request on behalf of another user',
  'an authenticated caller cannot submit on behalf of someone else'
);

-- AC05: a complete request becomes Requested and records when.
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb03_event_ids)),
  'a complete Draft can be submitted'
);
select is(
  (select status::text from public.events where id = (select id from pb03_event_ids)),
  'requested',
  'the event becomes Requested'
);
select isnt(
  (select submitted_at from public.events where id = (select id from pb03_event_ids)),
  null,
  'the submission time is recorded'
);
select is(
  (select submitted_by from public.events where id = (select id from pb03_event_ids)),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'the submitting organiser is recorded'
);

-- Week 7 change #5 supersedes PB-04 AC01: submission no longer assigns a
-- coordinator. The event waits in the Event Coordinator Lead's unassigned
-- queue; assignment is asserted in pb04_coordinator_assignment.test.sql.
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pb03_event_ids)),
  null::uuid,
  'submission leaves the event unassigned'
);

-- The status change is historised with the submitting actor.
select is(
  (
    select changed_by from public.event_status_history
    where event_id = (select id from pb03_event_ids) and to_status = 'requested'
  ),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'the submission is recorded in the status history with its actor'
);

-- A second submission is rejected: the row is no longer a draft.
select throws_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb03_event_ids)),
  '42501',
  'Event request not found or cannot be submitted',
  'a Requested event cannot be submitted again'
);

-- AC07: the organiser can still correct a Requested event before approval.
select lives_ok(
  format(
    $$select public.save_event_draft(
      '{
        "title":"[Shernice Test] Submission (updated)",
        "purpose":"Welcome new students",
        "description":"A briefing for the incoming cohort.",
        "expectedAttendance":"130",
        "startsAt":"2099-01-01T10:00:00+08:00",
        "endsAt":"2099-01-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Seminar Room","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from pb03_event_ids)
  ),
  'the organiser can edit a Requested event before approval'
);
select is(
  (select expected_attendance from public.events where id = (select id from pb03_event_ids)),
  130,
  'the edit to a Requested event is applied'
);
select is(
  (select status::text from public.events where id = (select id from pb03_event_ids)),
  'requested',
  'editing a Requested event does not change its status'
);

-- Another organiser cannot submit or edit this request.
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.save_event_draft('{"title":"Unauthorised edit","venue":{"facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb, %L::uuid)$$,
    (select id from pb03_event_ids)
  ),
  '42501',
  'Draft not found or cannot be edited',
  'another organiser cannot edit this request'
);

-- A different role cannot submit at all.
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb03_event_ids)),
  '42501',
  'Only Event Organisers can submit event requests',
  'an Attendee cannot submit an event request'
);

select * from finish();
rollback;
