begin;

-- SPM-81 "Assign an Event Coordinator". pb04_coordinator_assignment.test.sql
-- already covers reassign_event_coordinator's lead-only authorization, the
-- "no reason needed for a first assignment" path, the event_coordinator
-- role constraint, the new coordinator's own notification, and the
-- unassigned-queue starting state. spm84_reassign_event_coordinator.test.sql
-- already covers the Draft/Rejected/Cancelled/Completed status block (the
-- same guard, exercised there). This file covers what neither of those
-- does for a *first* assignment specifically: the assignment history
-- (AC3) and the organiser's own notification (AC5).
--
-- Not covered here: AC4 ("appears in the coordinator's assigned list / no
-- longer in the unassigned queue") and AC6's "dialog opens in reassign
-- mode" are frontend logic in EventsPage.tsx, which has no test file and
-- is out of scope for this pass. "Only the first of two simultaneous
-- assignments succeeds" needs two real concurrent connections, which a
-- single pgTAP transaction can't express.

select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '81000000-0000-0000-0000-000000000001',
    'spm81-organiser@example.test',
    '{"full_name":"SPM81 Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '81000000-0000-0000-0000-000000000002',
    'spm81-lead@example.test',
    '{"full_name":"SPM81 Lead","role":"event_coordinator_lead"}'::jsonb
  ),
  (
    '81000000-0000-0000-0000-000000000003',
    'spm81-coordinator-a@example.test',
    '{"full_name":"SPM81 Coordinator A","role":"event_coordinator"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table spm81_ids (label text primary key, id uuid);

insert into spm81_ids
select 'event-a', public.save_event_draft(
  '{
    "title":"[SPM81] Event A",
    "purpose":"First-assignment coverage",
    "description":"Assigned for the first time, never reassigned.",
    "expectedAttendance":"30",
    "startsAt":"2099-04-01T10:00:00+08:00",
    "endsAt":"2099-04-01T12:00:00+08:00",
    "venue":{"preferredLocation":"Seminar Room","facilities":[]},
    "equipment":[],
    "registration":{"required":false,"waitlistEnabled":false},
    "requirementsAcknowledged":true
  }'::jsonb
);
select public.submit_event_request((select id from spm81_ids where label = 'event-a'));

-- The Lead assigns Coordinator A, with no reason (setup; pb04 already
-- covers that this succeeds without one).
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select public.reassign_event_coordinator((select id from spm81_ids where label = 'event-a'), '81000000-0000-0000-0000-000000000003'::uuid, null);

-- AC3: the first assignment is recorded as its own history entry --
-- coordinator, Lead, and a still-open interval (nothing has closed it,
-- since there's no subsequent reassignment here). event_coordinator_
-- assignments has RLS enabled with no SELECT policy, so this goes through
-- list_event_coordinator_history, the only sanctioned read path.
select is(
  (select count(*)::integer from public.list_event_coordinator_history((select id from spm81_ids where label = 'event-a'))),
  1,
  'AC3: the first assignment is recorded as exactly one history entry'
);
select is(
  (select row(previous_coordinator_id, new_coordinator_id, changed_by_id, ended_at)
    from public.list_event_coordinator_history((select id from spm81_ids where label = 'event-a'))),
  row(null::uuid, '81000000-0000-0000-0000-000000000003'::uuid, '81000000-0000-0000-0000-000000000002'::uuid, null::timestamptz),
  'AC3: the entry has no previous coordinator, names Coordinator A and the Lead, and is still open'
);

-- AC5: the organiser is notified too, not just the new coordinator (pb04
-- only checks the coordinator's own notification). Checked as superuser:
-- notifications has no SELECT policy letting the Lead read another user's
-- notifications, and that's not what's under test here.
reset role;
select is(
  (select count(*)::integer from public.notifications
    where recipient_id = '81000000-0000-0000-0000-000000000001'::uuid
      and event_id = (select id from spm81_ids where label = 'event-a')
      and title = 'Your event has a new coordinator'),
  1,
  'AC5: the organiser is notified of the assignment'
);
select is(
  (select count(*)::integer from public.notifications
    where recipient_id = '81000000-0000-0000-0000-000000000003'::uuid
      and event_id = (select id from spm81_ids where label = 'event-a')
      and title = 'New event request assigned to you'),
  1,
  'AC5: the coordinator is notified of the assignment (first-assignment wording)'
);

select * from finish();
rollback;
