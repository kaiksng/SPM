begin;

select plan(12);

-- resolve_arrangement_flag (202610200010): the assigned coordinator clears
-- a Needs Review flag on a venue booking or equipment requirement, the only
-- way one can ever be cleared in this codebase.

insert into auth.users (id, email, raw_user_meta_data) values
  ('fd100000-0000-0000-0000-000000000001', 'raf-organiser@example.test', '{"full_name":"RAF Organiser","role":"event_organiser"}'::jsonb),
  ('fd100000-0000-0000-0000-000000000002', 'raf-coordinator@example.test', '{"full_name":"RAF Coordinator","role":"event_coordinator"}'::jsonb),
  ('fd100000-0000-0000-0000-000000000003', 'raf-other-coordinator@example.test', '{"full_name":"RAF Other Coordinator","role":"event_coordinator"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('fd100000-0000-0000-0000-000000000010', 'RAF Hall', 'Block 2', 100);

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged)
values
  ('fd100000-0000-0000-0000-0000000000e1', 'fd100000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000002', 'RAF Event', 'planning', '2099-12-01T10:00:00+08:00', '2099-12-01T12:00:00+08:00', true),
  ('fd100000-0000-0000-0000-0000000000e2', 'fd100000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000002', 'RAF Pending Review Event', 'pending_safety_check', '2099-12-02T10:00:00+08:00', '2099-12-02T12:00:00+08:00', true);

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue, needs_review, needs_review_reason)
values
  ('fd100000-0000-0000-0000-0000000000b1', 'fd100000-0000-0000-0000-0000000000e1', 'fd100000-0000-0000-0000-000000000010', 'fd100000-0000-0000-0000-000000000002', '2099-12-01T10:00:00+08:00', '2099-12-01T12:00:00+08:00', 'approved', true, true, 'Capacity reduced.'),
  ('fd100000-0000-0000-0000-0000000000b2', 'fd100000-0000-0000-0000-0000000000e1', 'fd100000-0000-0000-0000-000000000010', 'fd100000-0000-0000-0000-000000000002', '2099-12-01T13:00:00+08:00', '2099-12-01T14:00:00+08:00', 'approved', false, false, null),
  ('fd100000-0000-0000-0000-0000000000b3', 'fd100000-0000-0000-0000-0000000000e2', 'fd100000-0000-0000-0000-000000000010', 'fd100000-0000-0000-0000-000000000002', '2099-12-02T10:00:00+08:00', '2099-12-02T12:00:00+08:00', 'approved', true, true, 'Flagged during review.');

insert into public.event_equipment_requirements (id, event_id, equipment_item_id, equipment_name, quantity, required_from, required_until, needs_review, needs_review_reason)
values
  (
    'fd100000-0000-0000-0000-0000000000f1', 'fd100000-0000-0000-0000-0000000000e1',
    (select id from public.equipment_items where code = 'mic'), 'Wireless microphone', 2,
    '2099-12-01T10:00:00+08:00', '2099-12-01T12:00:00+08:00', true, 'Placement blocks the exit.'
  );

set local role authenticated;

-- AC: only the assigned coordinator can resolve.
select set_config('request.jwt.claims', '{"sub":"fd100000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.resolve_arrangement_flag('fd100000-0000-0000-0000-0000000000e1'::uuid, 'fd100000-0000-0000-0000-0000000000b1'::uuid)$$,
  '42501', 'Only the assigned coordinator can resolve this flag',
  'a coordinator not assigned to the event cannot resolve its flags'
);

select set_config('request.jwt.claims', '{"sub":"fd100000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- Exactly one of booking/requirement must be given.
select throws_ok(
  $$select public.resolve_arrangement_flag('fd100000-0000-0000-0000-0000000000e1'::uuid)$$,
  '23514', 'Resolve exactly one venue booking or equipment requirement at a time',
  'neither id given is rejected'
);
select throws_ok(
  $$select public.resolve_arrangement_flag('fd100000-0000-0000-0000-0000000000e1'::uuid, 'fd100000-0000-0000-0000-0000000000b1'::uuid, 'fd100000-0000-0000-0000-0000000000f1'::uuid)$$,
  '23514', 'Resolve exactly one venue booking or equipment requirement at a time',
  'both ids given is rejected'
);

-- An item that is not flagged cannot be "resolved".
select throws_ok(
  $$select public.resolve_arrangement_flag('fd100000-0000-0000-0000-0000000000e1'::uuid, 'fd100000-0000-0000-0000-0000000000b2'::uuid)$$,
  '23514', 'This venue booking is not flagged for this event',
  'an unflagged booking cannot be resolved'
);

-- Only while the event is Planning.
select throws_ok(
  $$select public.resolve_arrangement_flag('fd100000-0000-0000-0000-0000000000e2'::uuid, 'fd100000-0000-0000-0000-0000000000b3'::uuid)$$,
  '23514', 'A flag can only be resolved while the event is in Planning',
  'a flag cannot be resolved while the event is Pending Safety Check'
);

-- The happy path: resolving the venue booking's flag.
select lives_ok(
  $$select public.resolve_arrangement_flag('fd100000-0000-0000-0000-0000000000e1'::uuid, 'fd100000-0000-0000-0000-0000000000b1'::uuid)$$,
  'the assigned coordinator resolves the flagged venue booking'
);
select is(
  (select row(needs_review, needs_review_reason) from public.venue_bookings where id = 'fd100000-0000-0000-0000-0000000000b1'),
  row(false, null::text),
  'the venue booking''s flag and reason are cleared'
);

-- Resolving again fails — it is no longer flagged.
select throws_ok(
  $$select public.resolve_arrangement_flag('fd100000-0000-0000-0000-0000000000e1'::uuid, 'fd100000-0000-0000-0000-0000000000b1'::uuid)$$,
  '23514', 'This venue booking is not flagged for this event',
  'the same booking cannot be resolved twice'
);

-- The happy path: resolving the equipment requirement's flag.
select lives_ok(
  $$select public.resolve_arrangement_flag('fd100000-0000-0000-0000-0000000000e1'::uuid, null, 'fd100000-0000-0000-0000-0000000000f1'::uuid)$$,
  'the assigned coordinator resolves the flagged equipment requirement'
);
select is(
  (select row(needs_review, needs_review_reason) from public.event_equipment_requirements where id = 'fd100000-0000-0000-0000-0000000000f1'),
  row(false, null::text),
  'the equipment requirement''s flag and reason are cleared'
);

-- Neither arrangement rolls up to Needs Review once its flag is resolved
-- (equipment stays Pending here — it was never reserved, a separate, still
-- correct reason unrelated to this RPC).
select is(
  (select public.event_readiness('fd100000-0000-0000-0000-0000000000e1') ->> 'venueArrangementStatus'),
  'complete',
  'the venue arrangement no longer rolls up to Needs Review'
);
select is(
  (select public.event_readiness('fd100000-0000-0000-0000-0000000000e1') ->> 'equipmentArrangementStatus'),
  'pending',
  'the equipment arrangement no longer rolls up to Needs Review'
);

select * from finish();
rollback;
