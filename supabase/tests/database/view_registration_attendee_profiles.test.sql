begin;

select plan(6);

-- 202610270006: View Event Registration Information. event_registrations'
-- own SELECT policy already delegates to can_view_event, so the registration
-- row itself is already readable by the organiser, the assigned coordinator,
-- and the Event Coordinator Lead — only the attendee's profiles row was not,
-- for the organiser and the Lead (event_coordinator already has a blanket
-- grant via "profiles readable by owner and staff"). This policy closes that
-- gap, scoped to a profile actually tied to a registration on an event the
-- viewer can currently see.

insert into auth.users (id, email, raw_user_meta_data) values
  ('fd000000-0000-0000-0000-000000000001', 'vrap-organiser@example.test', '{"full_name":"VRAP Organiser","role":"event_organiser"}'::jsonb),
  ('fd000000-0000-0000-0000-000000000002', 'vrap-coordinator@example.test', '{"full_name":"VRAP Coordinator","role":"event_coordinator"}'::jsonb),
  ('fd000000-0000-0000-0000-000000000003', 'vrap-lead@example.test', '{"full_name":"VRAP Lead","role":"event_coordinator_lead"}'::jsonb),
  ('fd000000-0000-0000-0000-000000000004', 'vrap-attendee@example.test', '{"full_name":"VRAP Attendee","role":"attendee"}'::jsonb),
  ('fd000000-0000-0000-0000-000000000005', 'vrap-other-organiser@example.test', '{"full_name":"VRAP Other Organiser","role":"event_organiser"}'::jsonb);

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged)
values ('fd000000-0000-0000-0000-0000000000e1', 'fd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000002', 'VRAP Confirmed Event', 'confirmed', '2099-11-01T10:00:00+08:00', '2099-11-01T12:00:00+08:00', true);

-- An unrelated event, so the organiser-above-only-sees-their-own-events AC has a negative control.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged)
values ('fd000000-0000-0000-0000-0000000000e2', 'fd000000-0000-0000-0000-000000000005', 'fd000000-0000-0000-0000-000000000002', 'VRAP Unrelated Event', 'confirmed', '2099-11-02T10:00:00+08:00', '2099-11-02T12:00:00+08:00', true);

insert into public.event_registrations (event_id, attendee_id, status)
values ('fd000000-0000-0000-0000-0000000000e1', 'fd000000-0000-0000-0000-000000000004', 'registered');

set local role authenticated;

-- The organiser of this event can read the attendee's name.
select set_config('request.jwt.claims', '{"sub":"fd000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select full_name from public.profiles where id = 'fd000000-0000-0000-0000-000000000004'::uuid),
  'VRAP Attendee',
  'the organiser can read the attendee''s name for their own event''s registration'
);

-- The Event Coordinator Lead can read it too, for any event.
select set_config('request.jwt.claims', '{"sub":"fd000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (select full_name from public.profiles where id = 'fd000000-0000-0000-0000-000000000004'::uuid),
  'VRAP Attendee',
  'the Event Coordinator Lead can read the attendee''s name for any event''s registration'
);

-- The assigned coordinator's existing blanket grant is untouched (it isn't
-- scoped by registrations at all — this migration doesn't narrow it).
select set_config('request.jwt.claims', '{"sub":"fd000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select full_name from public.profiles where id = 'fd000000-0000-0000-0000-000000000004'::uuid),
  'VRAP Attendee',
  'the assigned coordinator keeps its pre-existing blanket read access to profiles'
);

-- Regression: an unrelated organiser (no registration on their own event tied
-- to this attendee, and not this event's organiser) cannot see the attendee.
select set_config('request.jwt.claims', '{"sub":"fd000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is(
  (select full_name from public.profiles where id = 'fd000000-0000-0000-0000-000000000004'::uuid),
  null::text,
  'an unrelated organiser cannot read the attendee''s name'
);

-- Regression: the attendee's own read of their own profile is untouched
-- (that's the pre-existing "owner" grant, not this policy).
select set_config('request.jwt.claims', '{"sub":"fd000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(
  (select full_name from public.profiles where id = 'fd000000-0000-0000-0000-000000000004'::uuid),
  'VRAP Attendee',
  'the attendee can still read their own profile'
);

reset role;
select is(
  (select status::text from public.events where id = 'fd000000-0000-0000-0000-0000000000e1'),
  'confirmed',
  'sanity check: the event is confirmed, for the assertions above'
);

select * from finish();
rollback;
