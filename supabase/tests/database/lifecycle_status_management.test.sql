begin;

select plan(15);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    'lifecycle-organiser@example.test',
    '{"full_name":"Lifecycle Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'lifecycle-coordinator-a@example.test',
    '{"full_name":"Lifecycle Coordinator A","role":"event_coordinator"}'::jsonb
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
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table lsm_event_ids (label text primary key, id uuid);

-- Draft -> Requested -> Planning -> Confirmed -> Completed, the happy path,
-- checking the status history logs each hop.
select lives_ok(
  $$insert into lsm_event_ids
    select 'event-1', public.save_event_draft(
      '{
        "title":"Lifecycle Test Event",
        "purpose":"Original purpose",
        "description":"A test event for lifecycle status management.",
        "expectedAttendance":"80",
        "startsAt":"2099-04-01T10:00:00+08:00",
        "endsAt":"2099-04-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'AC01: the organiser can save a Draft'
);

-- "submitted" is retired as a reachable target, even directly from Draft.
select throws_ok(
  format(
    $$update public.events set status = 'submitted' where id = %L::uuid$$,
    (select id from lsm_event_ids where label = 'event-1')
  ),
  '23514',
  'Invalid event status transition from draft to submitted',
  '"submitted" is retired as a reachable status from Draft'
);

select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from lsm_event_ids where label = 'event-1')),
  'AC01: the event can become Requested'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from lsm_event_ids where label = 'event-1')),
  'the Lead assigns the next available coordinator'
);

-- "under_review" is retired as a reachable target, even directly from
-- Requested.
select throws_ok(
  format(
    $$update public.events set status = 'under_review' where id = %L::uuid$$,
    (select id from lsm_event_ids where label = 'event-1')
  ),
  '23514',
  'Invalid event status transition from requested to under_review',
  '"under_review" is retired as a reachable status from Requested'
);

reset role;
insert into auth.users (id, email, raw_user_meta_data)
values (
  'a0000000-0000-0000-0000-000000000003',
  'lifecycle-coordinator-b@example.test',
  '{"full_name":"Lifecycle Coordinator B","role":"event_coordinator"}'::jsonb
);
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks ready.')$$,
    (select id from lsm_event_ids where label = 'event-1')
  ),
  'AC01: the event can become Planning'
);

-- Scenario: an invalid transition (skipping straight to Completed from
-- Planning) is rejected and the current status is unchanged. As the
-- superuser: coordinators cannot update events directly (202610160002), and
-- this checks the transition trigger itself.
reset role;
select throws_ok(
  format(
    $$update public.events set status = 'completed' where id = %L::uuid$$,
    (select id from lsm_event_ids where label = 'event-1')
  ),
  '23514',
  'Invalid event status transition from planning to completed',
  'Scenario: Planning cannot jump straight to Completed'
);
set local role authenticated;
select is(
  (select status::text from public.events where id = (select id from lsm_event_ids where label = 'event-1')),
  'planning',
  'Scenario: the rejected transition left the status unchanged'
);

-- complete_event refuses anything but a Confirmed event.
select throws_ok(
  format($$select public.complete_event(%L::uuid)$$, (select id from lsm_event_ids where label = 'event-1')),
  '23514',
  'Only a Confirmed event can be marked completed',
  'complete_event refuses a Planning event'
);

-- No feature transitions Planning -> Confirmed yet (venue/equipment
-- confirmation is unbuilt) — set it directly, as test setup, the same way
-- 202609150007's own test seeds a Confirmed event.
reset role;
-- Planning must pass Pending Safety Check before Confirmed (202610100002).
update public.events set status = 'pending_safety_check' where id = (select id from lsm_event_ids where label = 'event-1');
update public.events set status = 'confirmed' where id = (select id from lsm_event_ids where label = 'event-1');
set local role authenticated;

-- Authorisation: a coordinator not assigned to this event cannot complete it.
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format($$select public.complete_event(%L::uuid)$$, (select id from lsm_event_ids where label = 'event-1')),
  '42501',
  'Only the assigned coordinator can mark this event completed',
  'a coordinator not assigned to the event cannot complete it'
);

-- Authorisation: the organiser cannot use this coordinator-only action either.
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  format($$select public.complete_event(%L::uuid)$$, (select id from lsm_event_ids where label = 'event-1')),
  '42501',
  'Only the assigned coordinator can mark this event completed',
  'the organiser cannot mark their own event completed'
);

-- AC01/AC03: the assigned coordinator completes it; the change is recorded
-- with the previous status, new status, actor and timestamp.
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format($$select public.complete_event(%L::uuid)$$, (select id from lsm_event_ids where label = 'event-1')),
  'AC01: the assigned coordinator can mark a Confirmed event completed'
);
select is(
  (select status::text from public.events where id = (select id from lsm_event_ids where label = 'event-1')),
  'completed',
  'the event is now Completed'
);
select is(
  (
    select row(from_status, to_status, changed_by)
    from public.event_status_history
    where event_id = (select id from lsm_event_ids where label = 'event-1') and to_status = 'completed'
  ),
  row('confirmed'::public.event_status, 'completed'::public.event_status, 'a0000000-0000-0000-0000-000000000002'::uuid),
  'AC03: the completion records the previous status, new status and actor'
);

-- Completed is terminal, enforced by enforce_event_status_transition. Probed
-- as postgres (RLS bypassed) so this exercises the transition trigger
-- itself, not 202609190002's now-stricter RLS: as the assigned coordinator,
-- this same update would be silently excluded by RLS before ever reaching
-- the trigger (see block_direct_edits_on_finalized_events.test.sql, which
-- covers that path instead).
reset role;
select throws_ok(
  format(
    $$update public.events set status = 'planning' where id = %L::uuid$$,
    (select id from lsm_event_ids where label = 'event-1')
  ),
  '23514',
  'Invalid event status transition from completed to planning',
  'a Completed event cannot transition anywhere else'
);
set local role authenticated;

select * from finish();
rollback;
