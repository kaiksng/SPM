begin;

select plan(4);

-- 202610270002: can_view_event's attendee branch used to require
-- status = 'confirmed' with no exception, so an attendee lost read access
-- to an event (and therefore their own registration history for it) the
-- moment it moved past confirmed — e.g. to completed. Fixed to also allow
-- an attendee who holds (or held) a registration row for that event,
-- regardless of its current status.

insert into auth.users (id, email, raw_user_meta_data) values
  ('f9000000-0000-0000-0000-000000000001', 'avrh-organiser@example.test', '{"full_name":"AVRH Organiser","role":"event_organiser"}'::jsonb),
  ('f9000000-0000-0000-0000-000000000002', 'avrh-coordinator@example.test', '{"full_name":"AVRH Coordinator","role":"event_coordinator"}'::jsonb),
  ('f9000000-0000-0000-0000-000000000003', 'avrh-attendee-1@example.test', '{"full_name":"AVRH Attendee One","role":"attendee"}'::jsonb),
  ('f9000000-0000-0000-0000-000000000004', 'avrh-attendee-2@example.test', '{"full_name":"AVRH Attendee Two","role":"attendee"}'::jsonb);

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged)
values ('f9000000-0000-0000-0000-0000000000e1', 'f9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000002', 'AVRH Past Event', 'confirmed', '2020-01-01T10:00:00+08:00', '2020-01-01T12:00:00+08:00', true);

insert into public.event_registrations (event_id, attendee_id, status)
values ('f9000000-0000-0000-0000-0000000000e1', 'f9000000-0000-0000-0000-000000000003', 'registered');

-- Move the event past confirmed, the way completion automation would —
-- done before `authenticated` is set, so RLS doesn't get in the way here.
update public.events set status = 'completed' where id = 'f9000000-0000-0000-0000-0000000000e1';

set local role authenticated;

-- Attendee 1 registered for this event and should still be able to see it
-- now that it's completed.
select set_config('request.jwt.claims', '{"sub":"f9000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select ok(
  public.can_attendee_view_event('f9000000-0000-0000-0000-0000000000e1'),
  'an attendee can still view an event they registered for after it leaves confirmed'
);
-- 202611010012: the events table is no longer readable by attendees; their
-- published view of the event comes from attendee_visible_events.
select is(
  (select count(*) from public.attendee_visible_events(array['f9000000-0000-0000-0000-0000000000e1']::uuid[]))::int,
  1,
  'the event is returned for that attendee by attendee_visible_events'
);

-- Attendee 2 never registered for this event and it is no longer confirmed
-- — negative control: the fix must not open visibility to every attendee.
select set_config('request.jwt.claims', '{"sub":"f9000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select ok(
  not public.can_attendee_view_event('f9000000-0000-0000-0000-0000000000e1'),
  'an attendee with no registration still cannot view a non-confirmed event'
);
select is(
  (select count(*) from public.attendee_visible_events(array['f9000000-0000-0000-0000-0000000000e1']::uuid[]))::int,
  0,
  'the event is not returned for an unrelated attendee'
);

select * from finish();
rollback;
