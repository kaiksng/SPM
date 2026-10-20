begin;

select plan(6);

-- 202610200008: a Safety Officer can read the organiser/coordinator of an
-- event they can currently view (can_view_event), and the reviewer
-- (decided_by) on a safety check decision for such an event — fixing
-- "Organiser: Unknown" on the queue and "Reviewed by Unknown" on history.

insert into auth.users (id, email, raw_user_meta_data) values
  ('fe000000-0000-0000-0000-000000000001', 'sovrp-organiser@example.test', '{"full_name":"SOVRP Organiser","role":"event_organiser"}'::jsonb),
  ('fe000000-0000-0000-0000-000000000002', 'sovrp-coordinator@example.test', '{"full_name":"SOVRP Coordinator","role":"event_coordinator"}'::jsonb),
  ('fe000000-0000-0000-0000-000000000003', 'sovrp-safety-a@example.test', '{"full_name":"SOVRP Safety A","role":"safety_officer"}'::jsonb),
  ('fe000000-0000-0000-0000-000000000004', 'sovrp-safety-b@example.test', '{"full_name":"SOVRP Safety B","role":"safety_officer"}'::jsonb),
  ('fe000000-0000-0000-0000-000000000005', 'sovrp-other-organiser@example.test', '{"full_name":"SOVRP Other Organiser","role":"event_organiser"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('fe000000-0000-0000-0000-000000000010', 'SOVRP Hall', 'Block 9', 100);

-- The event under review: Ready, so it can be submitted for the safety check.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged)
values ('fe000000-0000-0000-0000-0000000000e1', 'fe000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000002', 'SOVRP Reviewed Event', 'planning', '2099-11-01T10:00:00+08:00', '2099-11-01T12:00:00+08:00', true);
insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue)
values ('fe000000-0000-0000-0000-0000000000b1', 'fe000000-0000-0000-0000-0000000000e1', 'fe000000-0000-0000-0000-000000000010', 'fe000000-0000-0000-0000-000000000002', '2099-11-01T10:00:00+08:00', '2099-11-01T12:00:00+08:00', 'approved', true);

-- An unrelated event, never submitted for a safety check — the negative
-- control: a Safety Officer has no relationship to it at all.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged)
values ('fe000000-0000-0000-0000-0000000000e2', 'fe000000-0000-0000-0000-000000000005', 'fe000000-0000-0000-0000-000000000002', 'SOVRP Unrelated Event', 'planning', '2099-11-02T10:00:00+08:00', '2099-11-02T12:00:00+08:00', true);

set local role authenticated;

-- Round 1: coordinator submits, Safety Officer A rejects it.
select set_config('request.jwt.claims', '{"sub":"fe000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.submit_event_for_safety_check('fe000000-0000-0000-0000-0000000000e1');

select set_config('request.jwt.claims', '{"sub":"fe000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select public.decide_event_safety_check(
  'fe000000-0000-0000-0000-0000000000e1'::uuid, 'rejected'::public.event_safety_check_decision_type,
  'Crowd movement plan is incomplete.'
);

-- Round 2: coordinator resubmits, so the event is pending_safety_check
-- again — this is when Safety Officer B, reviewing round 2, would want to
-- see who reviewed round 1 and what the organiser/coordinator are called.
select set_config('request.jwt.claims', '{"sub":"fe000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.submit_event_for_safety_check('fe000000-0000-0000-0000-0000000000e1');

-- Safety Officer B (who did not decide round 1) reviews round 2.
select set_config('request.jwt.claims', '{"sub":"fe000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select is(
  (select full_name from public.profiles where id = 'fe000000-0000-0000-0000-000000000001'::uuid),
  'SOVRP Organiser',
  'a Safety Officer reviewing the event can see the organiser''s name'
);
select is(
  (select full_name from public.profiles where id = 'fe000000-0000-0000-0000-000000000002'::uuid),
  'SOVRP Coordinator',
  'a Safety Officer reviewing the event can see the assigned coordinator''s name'
);
select is(
  (select full_name from public.profiles where id = 'fe000000-0000-0000-0000-000000000003'::uuid),
  'SOVRP Safety A',
  'a different Safety Officer can see round 1''s reviewer name'
);

-- Regression: the policy only opens profiles tied to an event the Safety
-- Officer can currently view — an event never submitted to them stays
-- invisible, so the organiser's name is still "Unknown" there, by design.
select is(
  (select full_name from public.profiles where id = 'fe000000-0000-0000-0000-000000000005'::uuid),
  null::text,
  'a Safety Officer cannot see the organiser of an event never submitted for review'
);

-- Regression: this policy is scoped to Safety Officer only.
select set_config('request.jwt.claims', '{"sub":"fe000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is(
  (select full_name from public.profiles where id = 'fe000000-0000-0000-0000-000000000003'::uuid),
  null::text,
  'an unrelated organiser cannot see the Safety Officer''s profile'
);

reset role;
select is(
  (select status::text from public.events where id = 'fe000000-0000-0000-0000-0000000000e1'),
  'pending_safety_check',
  'sanity check: the event is on round 2, pending safety check, for the assertions above'
);

select * from finish();
rollback;
