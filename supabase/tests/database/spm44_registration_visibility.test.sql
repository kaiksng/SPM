begin;

select plan(14);

-- SPM-44 (202610300003): registration rows are visible only to the attendee
-- themselves, the event's organiser, its assigned coordinator and the Event
-- Coordinator Lead. Attendee pages get places taken and their own
-- waiting-list position from event_registration_counts instead.

insert into auth.users (id, email, raw_user_meta_data) values
  ('f4400000-0000-0000-0000-000000000001', 'spm44-organiser@example.test', '{"full_name":"SPM44 Organiser","role":"event_organiser"}'::jsonb),
  ('f4400000-0000-0000-0000-000000000002', 'spm44-other-organiser@example.test', '{"full_name":"SPM44 Other Organiser","role":"event_organiser"}'::jsonb),
  ('f4400000-0000-0000-0000-000000000003', 'spm44-coordinator@example.test', '{"full_name":"SPM44 Coordinator","role":"event_coordinator"}'::jsonb),
  ('f4400000-0000-0000-0000-000000000004', 'spm44-other-coordinator@example.test', '{"full_name":"SPM44 Other Coordinator","role":"event_coordinator"}'::jsonb),
  ('f4400000-0000-0000-0000-000000000005', 'spm44-lead@example.test', '{"full_name":"SPM44 Lead","role":"event_coordinator_lead"}'::jsonb),
  ('f4400000-0000-0000-0000-000000000006', 'spm44-venue-staff@example.test', '{"full_name":"SPM44 Venue Staff","role":"venue_staff"}'::jsonb),
  ('f4400000-0000-0000-0000-000000000007', 'spm44-tech-support@example.test', '{"full_name":"SPM44 Tech Support","role":"technical_support_staff"}'::jsonb),
  ('f4400000-0000-0000-0000-000000000011', 'spm44-attendee-1@example.test', '{"full_name":"SPM44 Attendee One","role":"attendee"}'::jsonb),
  ('f4400000-0000-0000-0000-000000000012', 'spm44-attendee-2@example.test', '{"full_name":"SPM44 Attendee Two","role":"attendee"}'::jsonb),
  ('f4400000-0000-0000-0000-000000000013', 'spm44-attendee-3@example.test', '{"full_name":"SPM44 Attendee Three","role":"attendee"}'::jsonb);

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged)
values ('f4400000-0000-0000-0000-0000000000e1', 'f4400000-0000-0000-0000-000000000001', 'f4400000-0000-0000-0000-000000000003', 'SPM44 Confirmed Event', 'confirmed', '2099-12-10T10:00:00+08:00', '2099-12-10T12:00:00+08:00', true);

-- One registered attendee and two on the waiting list, oldest first.
insert into public.event_registrations (event_id, attendee_id, status, registered_at) values
  ('f4400000-0000-0000-0000-0000000000e1', 'f4400000-0000-0000-0000-000000000011', 'registered', '2099-11-01T00:00:00+08:00'),
  ('f4400000-0000-0000-0000-0000000000e1', 'f4400000-0000-0000-0000-000000000012', 'waitlisted', '2099-11-02T00:00:00+08:00'),
  ('f4400000-0000-0000-0000-0000000000e1', 'f4400000-0000-0000-0000-000000000013', 'waitlisted', '2099-11-03T00:00:00+08:00');

create temporary table spm44_visible (who text, visible integer) on commit drop;
grant all on spm44_visible to authenticated;

set local role authenticated;

-- Records how many of the event's registration rows each user can read.
do $$
declare
  viewer record;
begin
  for viewer in
    select * from (values
      ('attendee 1', 'f4400000-0000-0000-0000-000000000011'),
      ('organiser', 'f4400000-0000-0000-0000-000000000001'),
      ('other organiser', 'f4400000-0000-0000-0000-000000000002'),
      ('assigned coordinator', 'f4400000-0000-0000-0000-000000000003'),
      ('other coordinator', 'f4400000-0000-0000-0000-000000000004'),
      ('lead', 'f4400000-0000-0000-0000-000000000005'),
      ('venue staff', 'f4400000-0000-0000-0000-000000000006'),
      ('tech support', 'f4400000-0000-0000-0000-000000000007')
    ) as v(who, id)
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', viewer.id, 'role', 'authenticated')::text, true);
    insert into spm44_visible
    select viewer.who, count(*)::integer
    from public.event_registrations
    where event_id = 'f4400000-0000-0000-0000-0000000000e1';
  end loop;
end;
$$;

-- AC: an attendee sees only their own row, not other attendees'.
select is((select visible from spm44_visible where who = 'attendee 1'), 1,
  'an attendee reads only their own registration row');
-- AC01: the organiser sees their own event's registrations, no one else's.
select is((select visible from spm44_visible where who = 'organiser'), 3,
  'AC01: the organiser reads every registration on their own event');
select is((select visible from spm44_visible where who = 'other organiser'), 0,
  'AC01: another organiser reads none of them');
-- AC02: only the assigned coordinator; the Lead sees all events.
select is((select visible from spm44_visible where who = 'assigned coordinator'), 3,
  'AC02: the assigned coordinator reads every registration');
select is((select visible from spm44_visible where who = 'other coordinator'), 0,
  'AC02: a coordinator who is not assigned reads none');
select is((select visible from spm44_visible where who = 'lead'), 3,
  'AC02: the Event Coordinator Lead reads every registration');
-- Roles outside the story see none.
select is((select visible from spm44_visible where who = 'venue staff'), 0,
  'venue staff read no registrations');
select is((select visible from spm44_visible where who = 'tech support'), 0,
  'technical support staff read no registrations');

-- Attendee pages: numbers only, from event_registration_counts.
select set_config('request.jwt.claims', '{"sub":"f4400000-0000-0000-0000-000000000013","role":"authenticated"}', true);
select is(
  (select registered_count from public.event_registration_counts(array['f4400000-0000-0000-0000-0000000000e1'::uuid])),
  1,
  'an attendee still gets the number of places taken'
);
select is(
  (select own_waitlist_position from public.event_registration_counts(array['f4400000-0000-0000-0000-0000000000e1'::uuid])),
  2,
  'an attendee gets their own waiting-list position, oldest first'
);
select is(
  (select count(*)::integer from public.event_registrations where event_id = 'f4400000-0000-0000-0000-0000000000e1'),
  1,
  'getting the counts does not open other attendees'' rows'
);

select set_config('request.jwt.claims', '{"sub":"f4400000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select is(
  (select own_waitlist_position from public.event_registration_counts(array['f4400000-0000-0000-0000-0000000000e1'::uuid])),
  null,
  'a registered attendee has no waiting-list position'
);

select set_config('request.jwt.claims', '{"sub":"f4400000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.event_registration_counts(array['f4400000-0000-0000-0000-0000000000e1'::uuid])),
  0,
  'the counts are not given for an event the caller cannot see'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.event_registration_counts(uuid[])', 'execute'),
  'signed-out visitors cannot call event_registration_counts'
);

select * from finish();
rollback;
