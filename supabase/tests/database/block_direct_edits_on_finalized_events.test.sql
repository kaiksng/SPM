begin;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '90000000-0000-0000-0000-000000000001',
    'finalized-organiser@example.test',
    '{"full_name":"Finalized Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '90000000-0000-0000-0000-000000000002',
    'finalized-coordinator@example.test',
    '{"full_name":"Finalized Coordinator","role":"event_coordinator"}'::jsonb
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
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table bde_event_ids (id uuid);

select lives_ok(
  $$insert into bde_event_ids
    select public.save_event_draft(
      '{
        "title":"Original Title",
        "purpose":"Original purpose",
        "description":"A test event for the finalized-edit block.",
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
  format($$select public.submit_event_request(%L::uuid)$$, (select id from bde_event_ids)),
  'the event can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from bde_event_ids)),
  'the Lead assigns the next available coordinator'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks ready.')$$,
    (select id from bde_event_ids)
  ),
  'the assigned coordinator can approve the complete request'
);

-- No feature transitions an event to Confirmed yet (venue/equipment
-- confirmation is unbuilt) — set it directly, as test setup, the same way
-- other tests seed state that has no RPC of its own yet.
reset role;
-- Planning must pass Pending Safety Check before Confirmed (202610100002).
update public.events set status = 'pending_safety_check' where id = (select id from bde_event_ids);
update public.events set status = 'confirmed' where id = (select id from bde_event_ids);
set local role authenticated;

-- AC01/AC03 (coordinator): update_event_as_coordinator's own status check
-- already refuses this — confirming it still does now that the event is
-- genuinely Confirmed, not just any non-Planning status.
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(
      %L::uuid,
      '{"title":"Coordinator Edit","purpose":"Original purpose","description":"A test event for the finalized-edit block.","expectedAttendance":"80","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Main Hall","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
    )$$,
    (select id from bde_event_ids)
  ),
  '23514',
  'Only a Planning event can be updated this way',
  'the coordinator-only RPC refuses to edit a Confirmed event'
);

-- AC01/AC03 (coordinator, direct table access): closes the gap this
-- migration exists for. RLS filters the row via its USING clause rather
-- than raising, so this is a silent no-op, not an exception — assert it
-- both runs without error and actually changes nothing.
select lives_ok(
  format(
    $$update public.events set title = 'Bypassed via direct update' where id = %L::uuid$$,
    (select id from bde_event_ids)
  ),
  'a direct table update against a Confirmed event is accepted as a statement...'
);
select is(
  (select title from public.events where id = (select id from bde_event_ids)),
  'Original Title',
  '...but RLS silently excludes the row, so nothing is actually changed (AC01/AC03)'
);

-- AC01/AC03 (organiser): save_event_draft's own status gate already covers
-- this (draft/requested only) — confirming it holds for Confirmed too.
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.save_event_draft(
      '{"title":"Organiser Edit","purpose":"Original purpose","description":"A test event for the finalized-edit block.","expectedAttendance":"80","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Main Hall","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false},"requirementsAcknowledged":true}'::jsonb,
      %L::uuid
    )$$,
    (select id from bde_event_ids)
  ),
  '42501',
  'Draft not found or cannot be edited',
  'the organiser cannot edit a Confirmed event through save_event_draft'
);

-- 202609190002: the same RLS gap, now for Completed. Move the event on from
-- Confirmed via its own write path (complete_event), then repeat the direct
-- table update probe against it.
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format($$select public.complete_event(%L::uuid)$$, (select id from bde_event_ids)),
  'the assigned coordinator can mark the Confirmed event completed'
);

-- AC01/AC03 (coordinator, direct table access): a raw update against a
-- Completed event must be silently excluded by RLS, the same way it already
-- is for Confirmed.
select lives_ok(
  format(
    $$update public.events set title = 'Bypassed via direct update on Completed' where id = %L::uuid$$,
    (select id from bde_event_ids)
  ),
  'a direct table update against a Completed event is accepted as a statement...'
);
select is(
  (select title from public.events where id = (select id from bde_event_ids)),
  'Original Title',
  '...but RLS silently excludes the row, so nothing is actually changed (AC01/AC03, Completed)'
);

-- AC03, overall: none of the blocked attempts above produced an audit entry.
select is(
  (
    select count(*)::integer from public.event_field_changes
    where event_id = (select id from bde_event_ids)
  ),
  0,
  'AC03: no blocked attempt was logged as an accepted change'
);

select * from finish();
rollback;
