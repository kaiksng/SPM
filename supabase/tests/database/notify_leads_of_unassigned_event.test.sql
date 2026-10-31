begin;
select plan(5);

-- SPM-81: every Event Coordinator Lead is told when a submitted event needs a
-- coordinator (202611010004_notify_leads_of_unassigned_event.sql).
insert into auth.users (id, email, raw_user_meta_data) values
  ('f9300000-0000-0000-0000-000000000001', 'unassigned-lead-a@example.test', '{"full_name":"Lead A","role":"event_coordinator_lead"}'::jsonb),
  ('f9300000-0000-0000-0000-000000000002', 'unassigned-lead-b@example.test', '{"full_name":"Lead B","role":"event_coordinator_lead"}'::jsonb),
  ('f9300000-0000-0000-0000-000000000003', 'unassigned-org@example.test', '{"full_name":"Jasmine Test","role":"event_organiser"}'::jsonb),
  ('f9300000-0000-0000-0000-000000000004', 'unassigned-coord@example.test', '{"full_name":"Coord Test","role":"event_coordinator"}'::jsonb);

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at) values
  ('f9300000-0000-0000-0000-0000000000e1', 'f9300000-0000-0000-0000-000000000003', null,
   'Unassigned Workshop', 'draft', '2099-09-01T10:00:00+08:00', '2099-09-01T12:00:00+08:00'),
  ('f9300000-0000-0000-0000-0000000000e2', 'f9300000-0000-0000-0000-000000000003', 'f9300000-0000-0000-0000-000000000004',
   'Clarified Workshop', 'clarification_requested', '2099-09-02T10:00:00+08:00', '2099-09-02T12:00:00+08:00');

create function pg_temp.lead_notifications(p_event uuid) returns integer language sql as $$
  select count(*)::integer from public.notifications
  where event_id = p_event and type = 'event_awaiting_assignment'
    and recipient_id in ('f9300000-0000-0000-0000-000000000001', 'f9300000-0000-0000-0000-000000000002')
$$;

-- Submitted with no coordinator.
update public.events set status = 'requested' where id = 'f9300000-0000-0000-0000-0000000000e1';

select is(pg_temp.lead_notifications('f9300000-0000-0000-0000-0000000000e1'), 2,
  'every Lead is notified when an event is submitted without a coordinator');
select is(
  (select row(title, message) from public.notifications
   where recipient_id = 'f9300000-0000-0000-0000-000000000001' and event_id = 'f9300000-0000-0000-0000-0000000000e1'),
  row('New event needs a coordinator'::text, '"Unassigned Workshop" was submitted by Jasmine Test and needs an Event Coordinator.'::text),
  'the notification names the event and its organiser'
);
select is(
  (select count(*)::integer from public.notifications
   where event_id = 'f9300000-0000-0000-0000-0000000000e1' and type = 'event_awaiting_assignment'
     and recipient_id not in ('f9300000-0000-0000-0000-000000000001', 'f9300000-0000-0000-0000-000000000002')
     and recipient_id in (select id from public.profiles where role <> 'event_coordinator_lead')),
  0,
  'nobody but the Leads is notified'
);

-- A resubmission after a clarification already has a coordinator.
update public.events set status = 'requested' where id = 'f9300000-0000-0000-0000-0000000000e2';
select is(pg_temp.lead_notifications('f9300000-0000-0000-0000-0000000000e2'), 0,
  'a resubmission after a clarification notifies no Lead');

-- Any later status change on the unassigned event adds nothing.
update public.events set title = 'Unassigned Workshop (renamed)' where id = 'f9300000-0000-0000-0000-0000000000e1';
select is(pg_temp.lead_notifications('f9300000-0000-0000-0000-0000000000e1'), 2,
  'editing the event afterwards sends no more notifications');

select * from finish();
rollback;
