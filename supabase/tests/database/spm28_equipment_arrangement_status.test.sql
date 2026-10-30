begin;

select plan(30);

-- SPM: update_equipment_arrangement no longer permits edits while an event
-- is Pending Safety Check (202610190005) — the coordinator's technical
-- arrangements are frozen for the review.

-- SPM-28: equipment arrangement status and notes
-- (202610150001_spm28_equipment_arrangement_status.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e8000000-0000-0000-0000-000000000001', 'arrange-support@example.test', '{"full_name":"Arrange Support","role":"technical_support_staff"}'::jsonb),
  ('e8000000-0000-0000-0000-000000000002', 'arrange-organiser@example.test', '{"full_name":"Arrange Organiser","role":"event_organiser"}'::jsonb),
  ('e8000000-0000-0000-0000-000000000003', 'arrange-coordinator@example.test', '{"full_name":"Arrange Coordinator","role":"event_coordinator"}'::jsonb),
  ('e8000000-0000-0000-0000-000000000004', 'arrange-other-coordinator@example.test', '{"full_name":"Other Coordinator","role":"event_coordinator"}'::jsonb),
  ('e8000000-0000-0000-0000-000000000005', 'arrange-support-two@example.test', '{"full_name":"Second Support","role":"technical_support_staff"}'::jsonb);

create temporary table v_ids (name text primary key, id uuid);
grant all on v_ids to authenticated;
insert into v_ids select 'mic', id from public.equipment_items where code = 'mic';

-- One event per status the rule cares about, each with one microphone request.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values
  ('e8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000003',
   'Arrangement Planning', 'planning', '2099-08-01T10:00:00+08:00', '2099-08-01T14:00:00+08:00'),
  ('e8000000-0000-0000-0000-0000000000e2', 'e8000000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000003',
   'Arrangement Safety Check', 'pending_safety_check', '2099-08-02T10:00:00+08:00', '2099-08-02T14:00:00+08:00'),
  ('e8000000-0000-0000-0000-0000000000e3', 'e8000000-0000-0000-0000-000000000002', null,
   'Arrangement Draft', 'draft', '2099-08-03T10:00:00+08:00', '2099-08-03T14:00:00+08:00'),
  ('e8000000-0000-0000-0000-0000000000e4', 'e8000000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000003',
   'Arrangement Completed', 'confirmed', '2099-08-04T10:00:00+08:00', '2099-08-04T14:00:00+08:00'),
  ('e8000000-0000-0000-0000-0000000000e5', 'e8000000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000003',
   'Arrangement Requested', 'requested', '2099-08-05T10:00:00+08:00', '2099-08-05T14:00:00+08:00');

insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
select e.id, (select id from v_ids where name = 'mic'), 'x', 2, e.starts_at, e.ends_at
from public.events e
where e.id in (
  'e8000000-0000-0000-0000-0000000000e1', 'e8000000-0000-0000-0000-0000000000e2',
  'e8000000-0000-0000-0000-0000000000e3', 'e8000000-0000-0000-0000-0000000000e4',
  'e8000000-0000-0000-0000-0000000000e5'
);
insert into v_ids select 'req-requested', id from public.event_equipment_requirements where event_id = 'e8000000-0000-0000-0000-0000000000e5';
insert into v_ids select 'req-planning', id from public.event_equipment_requirements where event_id = 'e8000000-0000-0000-0000-0000000000e1';
insert into v_ids select 'req-safety', id from public.event_equipment_requirements where event_id = 'e8000000-0000-0000-0000-0000000000e2';
insert into v_ids select 'req-draft', id from public.event_equipment_requirements where event_id = 'e8000000-0000-0000-0000-0000000000e3';
insert into v_ids select 'req-completed', id from public.event_equipment_requirements where event_id = 'e8000000-0000-0000-0000-0000000000e4';
-- Completed only after its request exists: nothing can be added to a
-- Completed event's arrangements (SPM-46 AC07).
update public.events set status = 'completed' where id = 'e8000000-0000-0000-0000-0000000000e4';

-- The coordinator has requested this equipment (202610300007).
select set_config('app.requesting_equipment', 'on', true);
update public.event_equipment_requirements r set requested_at = now()
where r.requested_at is null
  and exists (select 1 from public.events e where e.id = r.event_id and e.status <> 'completed');
select set_config('app.requesting_equipment', 'off', true);

set local role authenticated;

-- AC06: only Technical Support Staff update.
select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'arranged', 'Done')$$,
  '42501', 'Only Technical Support Staff can update equipment arrangements',
  'the assigned coordinator cannot update an arrangement (SPM-28 AC06)'
);
select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'arranged', 'Done')$$,
  '42501', 'Only Technical Support Staff can update equipment arrangements',
  'the organiser cannot update an arrangement (SPM-28 AC06)'
);

select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.equipment_arrangement_updates (requirement_id, event_id, status, updated_by)
    values ((select id from v_ids where name = 'req-planning'), 'e8000000-0000-0000-0000-0000000000e1', 'arranged', auth.uid())$$,
  '42501', null,
  'not even Technical Support Staff can write the table directly (SPM-28 AC06)'
);

-- AC02: no update yet means no entry (shown as Not started).
select is(
  (select count(*)::integer from public.equipment_arrangement_updates where requirement_id = (select id from v_ids where name = 'req-planning')),
  0,
  'a requirement starts with no arrangement entries (SPM-28 AC02)'
);
select is(
  public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'not_started', '  '),
  null,
  'saving Not started with no note on a fresh requirement changes nothing (SPM-28 AC02)'
);

-- AC03/AC04: an update records status, note, who and when.
select isnt(
  public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'in_progress', '  Borrowing 2 from Block B  '),
  null,
  'staff update the status and note (SPM-28 AC04)'
);
select is(
  (
    select row(status, note, updated_by, updated_at is not null, event_id)
    from public.equipment_arrangement_updates
    where requirement_id = (select id from v_ids where name = 'req-planning')
  ),
  row('in_progress'::text, 'Borrowing 2 from Block B'::text, 'e8000000-0000-0000-0000-000000000001'::uuid, true,
      'e8000000-0000-0000-0000-0000000000e1'::uuid),
  'the status, trimmed note, actor, time and event are recorded (SPM-28 AC03)'
);

-- Nothing changed: no new entry.
select is(
  public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'in_progress', 'Borrowing 2 from Block B'),
  null,
  'saving the same status and note adds nothing'
);

-- AC04: the note alone can change.
select isnt(
  public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'in_progress', 'Block B said yes'),
  null,
  'a note-only change is saved (SPM-28 AC04)'
);

-- Arranged means the stock is held (202610290004): refused until the full
-- quantity is reserved. Reserving records Arranged itself (202610290003).
select throws_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'arranged', 'Delivered')$$,
  '23514', 'Reserve the full quantity before marking this equipment Arranged',
  'Arranged is refused while nothing is reserved'
);
insert into v_ids select 'res-planning', public.reserve_equipment((select id from v_ids where name = 'req-planning'), 2);

-- AC05: repeated updates, including back to an earlier status, and clearing the note.
select isnt(
  public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'arranged', 'Delivered'),
  null,
  'the status moves on to Arranged once the stock is held (SPM-28 AC05)'
);
select isnt(
  public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'issue', 'One mic is faulty'),
  null,
  'the status moves to Issue (SPM-28 AC05)'
);
select isnt(
  public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'in_progress', null),
  null,
  'the status can go back to an earlier value, with the note cleared (SPM-28 AC05)'
);
select results_eq(
  $$select status, coalesce(note, '(none)') from public.equipment_arrangement_updates
    where requirement_id = (select id from v_ids where name = 'req-planning') order by id$$,
  $$values ('in_progress'::text, 'Borrowing 2 from Block B'::text), ('in_progress', 'Block B said yes'),
           ('arranged', 'Reserved 2 of 2'), ('arranged', 'Delivered'), ('issue', 'One mic is faulty'),
           ('in_progress', '(none)')$$,
  'every update is kept, in order (SPM-28 AC03, AC05)'
);

-- AC01: only the fixed statuses; note limit.
select throws_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'reserved', null)$$,
  '23514', 'Choose an arrangement status',
  'a status outside the list is refused (SPM-28 AC01)'
);
select throws_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), null, null)$$,
  '23514', 'Choose an arrangement status',
  'a missing status is refused (SPM-28 AC01)'
);
select throws_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'arranged', repeat('a', 1001))$$,
  '23514', 'Note must contain at most 1000 characters',
  'a note over 1000 characters is refused'
);
select isnt(
  public.update_equipment_arrangement((select id from v_ids where name = 'req-planning'), 'arranged', repeat('a', 1000)),
  null,
  'a note of exactly 1000 characters is saved'
);

-- Which events.
select throws_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'req-safety'), 'arranged', null)$$,
  '23514', 'Arrangements can only be updated for a Planning or Confirmed event',
  'a Pending Safety Check event cannot be updated (safety check submitted)'
);
select throws_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'req-draft'), 'arranged', null)$$,
  '23514', 'Arrangements can only be updated for a Planning or Confirmed event',
  'a draft event cannot be updated'
);
select throws_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'req-requested'), 'arranged', null)$$,
  '23514', 'Arrangements can only be updated for a Planning or Confirmed event',
  'a Requested event cannot be updated until it is in Planning'
);
select throws_ok(
  $$select public.update_equipment_arrangement((select id from v_ids where name = 'req-completed'), 'arranged', null)$$,
  '23514', 'Arrangements can only be updated for a Planning or Confirmed event',
  'a completed event cannot be updated'
);
select throws_ok(
  $$select public.update_equipment_arrangement('00000000-0000-0000-0000-000000000000', 'arranged', null)$$,
  '23514', 'This equipment request no longer exists',
  'an unknown requirement is refused'
);

-- Who can read it.
select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.equipment_arrangement_updates where event_id = 'e8000000-0000-0000-0000-0000000000e1'),
  7,
  'other Technical Support Staff see the history'
);
select is(
  (select p.full_name from public.profiles p where p.id = 'e8000000-0000-0000-0000-000000000001'),
  'Arrange Support',
  'other Technical Support Staff can see who made an update'
);

select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.equipment_arrangement_updates where event_id = 'e8000000-0000-0000-0000-0000000000e1'),
  7,
  'the assigned coordinator sees the history'
);
select is(
  (
    select p.full_name from public.equipment_arrangement_updates a
    join public.profiles p on p.id = a.updated_by
    where a.event_id = 'e8000000-0000-0000-0000-0000000000e1' order by a.id limit 1
  ),
  'Arrange Support',
  'the assigned coordinator can see who made an update'
);

select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.equipment_arrangement_updates),
  0,
  'a coordinator not assigned to the event sees nothing'
);

select set_config('request.jwt.claims', '{"sub":"e8000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.equipment_arrangement_updates),
  0,
  'the organiser sees nothing'
);

-- Removing the requirement removes its arrangement history.
reset role;
delete from public.event_equipment_requirements where id = (select id from v_ids where name = 'req-planning');
select is(
  (select count(*)::integer from public.equipment_arrangement_updates where event_id = 'e8000000-0000-0000-0000-0000000000e1'),
  0,
  'a removed requirement takes its arrangement history with it'
);

select * from finish();
rollback;
