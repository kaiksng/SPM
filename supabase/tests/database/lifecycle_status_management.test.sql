begin;

select plan(26);

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
-- SPM-46 AC02: an event can only be completed once it has finished, so its
-- schedule is moved into the past (also test setup).
update public.events
set starts_at = now() - interval '3 hours', ends_at = now() - interval '2 hours'
where id = (select id from lsm_event_ids where label = 'event-1');
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

-- SPM-12: an event's current lifecycle status.

-- SPM-12 AC01: exactly eight statuses can be reached — the six the story
-- lists plus Pending Safety Check and Cancelled, which later stories added.
-- submitted, clarification_requested, under_review and approved are still
-- enum values but no transition leads to them.
select set_eq(
  $$select 'draft'::text
    union
    select t.s::text
    from unnest(enum_range(null::public.event_status)) as f(s),
         unnest(enum_range(null::public.event_status)) as t(s)
    where public.event_status_transition_allowed(f.s, t.s)$$,
  array['draft', 'requested', 'planning', 'pending_safety_check', 'confirmed', 'completed', 'rejected', 'cancelled'],
  'SPM-12 AC01: exactly the eight lifecycle statuses in use are reachable'
);

-- SPM-12 AC04: between those statuses, the database allows exactly the agreed
-- transitions (mirrored in packages/shared/src/domain/event-status.ts).
select set_eq(
  $$select f.s::text || ' -> ' || t.s::text
    from unnest(enum_range(null::public.event_status)) as f(s),
         unnest(enum_range(null::public.event_status)) as t(s)
    where public.event_status_transition_allowed(f.s, t.s)
      and f.s::text = any (array['draft', 'requested', 'planning', 'pending_safety_check', 'confirmed', 'completed', 'rejected', 'cancelled'])$$,
  array['draft -> requested', 'draft -> cancelled', 'requested -> planning', 'requested -> rejected', 'requested -> cancelled', 'planning -> pending_safety_check', 'planning -> cancelled', 'pending_safety_check -> confirmed', 'pending_safety_check -> planning', 'pending_safety_check -> cancelled', 'confirmed -> planning', 'confirmed -> completed', 'confirmed -> cancelled'],
  'SPM-12 AC04: only the agreed transitions are allowed'
);

-- Three more events: two to decide the way the app does, one left as a Draft.
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into lsm_event_ids (label, id)
    select label, public.save_event_draft(
      '{"title":"Lifecycle Event","purpose":"SPM-12 test.","description":"A test event.","expectedAttendance":"20","startsAt":"2099-06-01T10:00:00+08:00","endsAt":"2099-06-01T12:00:00+08:00","venue":{"preferredLocation":"Main Hall","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false},"requirementsAcknowledged":true}'::jsonb
    )
    from unnest(array['approve-via-app', 'reject-via-app', 'draft-only']) as label$$,
  'the organiser saves three more drafts'
);
select lives_ok(
  $$select public.submit_event_request(id) from lsm_event_ids where label in ('approve-via-app', 'reject-via-app')$$,
  'two of them are submitted'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"eeeeeeee-0000-0000-0000-0000000000ad","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.reassign_event_coordinator(id, 'a0000000-0000-0000-0000-000000000002'::uuid, '')
    from lsm_event_ids where label in ('approve-via-app', 'reject-via-app')$$,
  'the Lead assigns coordinator A to both'
);

-- As the backend calls it: the service role, with the coordinator passed in.
reset role;
grant select on lsm_event_ids to service_role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks ready.', 'a0000000-0000-0000-0000-000000000002'::uuid)$$,
    (select id from lsm_event_ids where label = 'approve-via-app')
  ),
  'the backend approves one event for coordinator A'
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'rejected'::public.event_decision_type, 'Not feasible.', 'a0000000-0000-0000-0000-000000000002'::uuid)$$,
    (select id from lsm_event_ids where label = 'reject-via-app')
  ),
  'the backend rejects the other for coordinator A'
);
reset role;

-- SPM-12 AC03: both decisions record the previous status, new status, the
-- coordinator who made them and the time (202610160006).
select is(
  (
    select row(from_status, to_status, changed_by, changed_at)
    from public.event_status_history
    where event_id = (select id from lsm_event_ids where label = 'approve-via-app') and to_status = 'planning'
  ),
  row('requested'::public.event_status, 'planning'::public.event_status, 'a0000000-0000-0000-0000-000000000002'::uuid, now()),
  'SPM-12 AC03: an approval made in the app records who approved it'
);
select is(
  (
    select row(from_status, to_status, changed_by, changed_at)
    from public.event_status_history
    where event_id = (select id from lsm_event_ids where label = 'reject-via-app') and to_status = 'rejected'
  ),
  row('requested'::public.event_status, 'rejected'::public.event_status, 'a0000000-0000-0000-0000-000000000002'::uuid, now()),
  'SPM-12 AC03: a rejection made in the app records who rejected it'
);

-- SPM-12 AC04: an invalid transition is rejected and the status is unchanged.
select throws_ok(
  format(
    $$update public.events set status = 'planning' where id = %L::uuid$$,
    (select id from lsm_event_ids where label = 'draft-only')
  ),
  '23514',
  'Invalid event status transition from draft to planning',
  'SPM-12 AC04: a Draft cannot skip straight to Planning'
);
select is(
  (select status::text from public.events where id = (select id from lsm_event_ids where label = 'draft-only')),
  'draft',
  'SPM-12 AC04: the rejected transition left the Draft unchanged'
);

select * from finish();
rollback;
