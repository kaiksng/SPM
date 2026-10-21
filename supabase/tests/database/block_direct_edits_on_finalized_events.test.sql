begin;

-- SPM-11: once an event is Confirmed, Completed, Rejected or Cancelled,
-- neither its organiser nor its coordinator can edit it directly — not
-- through the app's write functions and not by writing to the tables
-- (AC01) — and a blocked attempt leaves no audit entry (AC03). AC02 (the
-- change-request message) is covered by the frontend unit tests.

select plan(52);

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
  ),
  (
    '90000000-0000-0000-0000-000000000003',
    'finalized-lead@example.test',
    '{"full_name":"Finalized Lead","role":"event_coordinator_lead"}'::jsonb
  );

insert into public.equipment_items (name, category, code, total_quantity)
values ('SPM11 Projector', 'Visual', 'spm11-projector', 3);

-- Everything that a blocked attempt must leave untouched, read past RLS:
-- the event's own fields, each requirement table, and both audit logs.
create function pg_temp.bde_snapshot(p_event_id uuid)
returns text
language sql
security definer
as $snapshot$
  select concat_ws(
    ' | ',
    e.title,
    e.status,
    v.preferred_location,
    r.attendee_capacity,
    (select string_agg(facility_name, ',' order by facility_name)
       from public.event_required_facilities where event_id = e.id),
    (select count(*) from public.event_equipment_requirements where event_id = e.id),
    (select count(*) from public.event_field_changes where event_id = e.id),
    (select count(*) from public.event_equipment_changes where event_id = e.id)
  )
  from public.events e
  left join public.event_venue_requirements v on v.event_id = e.id
  left join public.event_registration_requirements r on r.event_id = e.id
  where e.id = p_event_id;
$snapshot$;

create function pg_temp.bde_audit_entries(p_event_id uuid)
returns integer
language sql
security definer
as $audit$
  select (
    (select count(*) from public.event_field_changes where event_id = p_event_id)
    + (select count(*) from public.event_equipment_changes where event_id = p_event_id)
  )::integer;
$audit$;

-- Every direct-edit attempt SPM-11 AC01 forbids, made against one finalized
-- event; after each, the snapshot must be unchanged (AC01) — which includes
-- both audit logs (AC03).
create function pg_temp.bde_direct_edits_are_blocked(p_event_id uuid, p_label text)
returns setof text
language plpgsql
as $checks$
declare
  organiser constant text := '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}';
  coordinator constant text := '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}';
  before text := pg_temp.bde_snapshot(p_event_id);
  audit_before integer := pg_temp.bde_audit_entries(p_event_id);
  edit_payload text := (select (payload || '{"title":"Edited Title"}')::text from bde_payloads);
begin
  -- The organiser.
  perform set_config('request.jwt.claims', organiser, true);

  return next throws_ok(
    format($$select public.save_event_draft(%L::jsonb, %L::uuid)$$, edit_payload, p_event_id),
    '42501',
    'Draft not found or cannot be edited',
    format('SPM-11 AC01 (%s): the organiser''s edit form cannot save it', p_label)
  );

  update public.events set title = 'Edited Title' where id = p_event_id;
  return next is(pg_temp.bde_snapshot(p_event_id), before,
    format('SPM-11 AC01 (%s): the organiser''s direct update to the event changes nothing', p_label));

  update public.event_venue_requirements set preferred_location = 'Elsewhere' where event_id = p_event_id;
  return next is(pg_temp.bde_snapshot(p_event_id), before,
    format('SPM-11 AC01 (%s): the organiser''s direct update to the venue requirements changes nothing', p_label));

  update public.event_registration_requirements set attendee_capacity = 999 where event_id = p_event_id;
  return next is(pg_temp.bde_snapshot(p_event_id), before,
    format('SPM-11 AC01 (%s): the organiser''s direct update to registration changes nothing', p_label));

  delete from public.event_required_facilities where event_id = p_event_id;
  return next is(pg_temp.bde_snapshot(p_event_id), before,
    format('SPM-11 AC01 (%s): the organiser''s direct removal of a facility changes nothing', p_label));

  return next throws_ok(
    format(
      $$insert into public.event_required_facilities (event_id, facility_name) values (%L::uuid, 'Gym')$$,
      p_event_id
    ),
    '42501',
    'new row violates row-level security policy for table "event_required_facilities"',
    format('SPM-11 AC01 (%s): the organiser cannot add a facility directly', p_label)
  );

  return next throws_ok(
    format(
      $$insert into public.event_equipment_requirements
          (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
        select %L::uuid, id, name, 1, '2099-04-01T10:00:00+08:00', '2099-04-01T12:00:00+08:00'
        from public.equipment_items where code = 'spm11-projector'$$,
      p_event_id
    ),
    '42501',
    'new row violates row-level security policy for table "event_equipment_requirements"',
    format('SPM-11 AC01 (%s): the organiser cannot add equipment directly', p_label)
  );

  -- The coordinator.
  perform set_config('request.jwt.claims', coordinator, true);

  return next throws_ok(
    format($$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$, p_event_id, edit_payload),
    '23514',
    'Only a Planning event can be updated this way',
    format('SPM-11 AC01 (%s): the coordinator''s edit form cannot save it', p_label)
  );

  update public.events set title = 'Edited Title' where id = p_event_id;
  return next is(pg_temp.bde_snapshot(p_event_id), before,
    format('SPM-11 AC01 (%s): the coordinator''s direct update to the event changes nothing', p_label));

  update public.event_venue_requirements set preferred_location = 'Elsewhere' where event_id = p_event_id;
  return next is(pg_temp.bde_snapshot(p_event_id), before,
    format('SPM-11 AC01 (%s): the coordinator''s direct update to the venue requirements changes nothing', p_label));

  return next is(pg_temp.bde_audit_entries(p_event_id), audit_before,
    format('SPM-11 AC03 (%s): no blocked attempt created an audit entry', p_label));

  perform set_config('request.jwt.claims', organiser, true);
end;
$checks$;

create function pg_temp.bde_lead_assigns(p_event_id uuid)
returns void
language plpgsql
security definer
as $assign$
declare
  saved_claims text := current_setting('request.jwt.claims', true);
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"90000000-0000-0000-0000-000000000003","role":"authenticated"}',
    true
  );
  perform public.reassign_event_coordinator(p_event_id, '90000000-0000-0000-0000-000000000002', '');
  perform set_config('request.jwt.claims', saved_claims, true);
end;
$assign$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table bde_event_ids (label text primary key, id uuid);
create temporary table bde_payloads (payload jsonb);
insert into bde_payloads (payload)
values (
  '{
    "title":"Original Title",
    "purpose":"Original purpose",
    "description":"A test event for the finalized-edit block.",
    "expectedAttendance":"80",
    "startsAt":"2099-04-01T10:00:00+08:00",
    "endsAt":"2099-04-01T12:00:00+08:00",
    "venue":{"preferredLocation":"Main Hall","facilities":["Parking"]},
    "equipment":[],
    "registration":{"required":true,"capacity":"70","waitlistEnabled":false},
    "requirementsAcknowledged":true
  }'::jsonb
);

-- Four events, each submitted and assigned to the coordinator.
select lives_ok(
  $$insert into bde_event_ids (label, id)
    select label, public.save_event_draft((select payload from bde_payloads))
    from unnest(array['confirmed', 'completed', 'rejected', 'cancelled']) as label$$,
  'the organiser saves four complete drafts'
);
select lives_ok(
  $$select public.submit_event_request(id) from bde_event_ids$$,
  'all four are submitted'
);
select lives_ok(
  $$select pg_temp.bde_lead_assigns(id) from bde_event_ids$$,
  'the Lead assigns the coordinator to all four'
);

-- Rejected: the coordinator rejects it.
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'rejected'::public.event_decision_type, 'Not feasible.')$$,
    (select id from bde_event_ids where label = 'rejected')
  ),
  'the coordinator rejects one event'
);

-- Confirmed and Completed: approved into Planning; nothing in the app moves an
-- event on to Confirmed yet, so that step is seeded directly.
select lives_ok(
  $$select public.decide_event_request(id, 'approved'::public.event_decision_type, 'Looks ready.')
    from bde_event_ids where label in ('confirmed', 'completed')$$,
  'the coordinator approves two events into Planning'
);
reset role;
update public.events set status = 'pending_safety_check'
where id in (select id from bde_event_ids where label in ('confirmed', 'completed'));
update public.events set status = 'confirmed'
where id in (select id from bde_event_ids where label in ('confirmed', 'completed'));
-- SPM-46 AC02: an event can only be completed once it has finished.
update public.events
set starts_at = now() - interval '3 hours', ends_at = now() - interval '2 hours'
where id = (select id from bde_event_ids where label = 'completed');
set local role authenticated;
select lives_ok(
  format($$select public.complete_event(%L::uuid)$$, (select id from bde_event_ids where label = 'completed')),
  'the coordinator marks one Confirmed event completed'
);

-- Cancelled: the organiser cancels it.
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  format($$select public.cancel_event_request(%L::uuid)$$, (select id from bde_event_ids where label = 'cancelled')),
  'the organiser cancels one event'
);

select results_eq(
  $$select e.status::text from bde_event_ids i join public.events e on e.id = i.id order by i.label$$,
  array['cancelled', 'completed', 'confirmed', 'rejected'],
  'the four events are Cancelled, Completed, Confirmed and Rejected'
);

-- SPM-11 AC01 + AC03, for each finalized status.
select * from pg_temp.bde_direct_edits_are_blocked((select id from bde_event_ids where label = 'confirmed'), 'Confirmed');
select * from pg_temp.bde_direct_edits_are_blocked((select id from bde_event_ids where label = 'completed'), 'Completed');
select * from pg_temp.bde_direct_edits_are_blocked((select id from bde_event_ids where label = 'rejected'), 'Rejected');
select * from pg_temp.bde_direct_edits_are_blocked((select id from bde_event_ids where label = 'cancelled'), 'Cancelled');

select * from finish();
rollback;
