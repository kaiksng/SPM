begin;

select plan(28);

-- Event readiness for the Operational Safety Check
-- (202610190001_event_readiness_function.sql).

insert into auth.users (id, email, raw_user_meta_data) values
  ('fc000000-0000-0000-0000-000000000001', 'rdy-organiser@example.test', '{"full_name":"RDY Organiser","role":"event_organiser"}'::jsonb),
  ('fc000000-0000-0000-0000-000000000002', 'rdy-coordinator@example.test', '{"full_name":"RDY Coordinator","role":"event_coordinator"}'::jsonb),
  ('fc000000-0000-0000-0000-000000000003', 'rdy-other-coordinator@example.test', '{"full_name":"RDY Other Coordinator","role":"event_coordinator"}'::jsonb),
  ('fc000000-0000-0000-0000-000000000004', 'rdy-staff@example.test', '{"full_name":"RDY Venue Staff","role":"venue_staff"}'::jsonb),
  ('fc000000-0000-0000-0000-000000000005', 'rdy-other-organiser@example.test', '{"full_name":"RDY Other Organiser","role":"event_organiser"}'::jsonb),
  ('fc000000-0000-0000-0000-000000000006', 'rdy-attendee@example.test', '{"full_name":"RDY Attendee","role":"attendee"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('fc000000-0000-0000-0000-000000000010', 'RDY Hall', 'Block 1', 200);

create temporary table v_ids (name text primary key, id uuid);
grant all on v_ids to authenticated;
insert into v_ids select 'mic', id from public.equipment_items where code = 'mic';

-- One event per scenario, all assigned to the same coordinator, all Planning.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged)
values
  ('fc000000-0000-0000-0000-0000000000e1', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Ready, no equipment', 'planning', '2099-09-01T10:00:00+08:00', '2099-09-01T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000e2', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Main venue pending', 'planning', '2099-09-02T10:00:00+08:00', '2099-09-02T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000e3', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Main venue flagged', 'planning', '2099-09-03T10:00:00+08:00', '2099-09-03T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000e4', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Main venue disrupted', 'planning', '2099-09-04T10:00:00+08:00', '2099-09-04T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000e5', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Non-main cancelled, still ready', 'planning', '2099-09-05T10:00:00+08:00', '2099-09-05T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000e6', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Non-main pending blocks readiness', 'planning', '2099-09-06T10:00:00+08:00', '2099-09-06T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000e7', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'No venue booking', 'planning', '2099-09-07T10:00:00+08:00', '2099-09-07T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000e8', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Main venue tentative hold', 'planning', '2099-09-08T10:00:00+08:00', '2099-09-08T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000e9', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Main venue expired hold only', 'planning', '2099-09-09T10:00:00+08:00', '2099-09-09T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000ea', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Equipment reserved in full', 'planning', '2099-09-10T10:00:00+08:00', '2099-09-10T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000eb', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Equipment not reserved', 'planning', '2099-09-11T10:00:00+08:00', '2099-09-11T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000ec', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Equipment flagged issue', 'planning', '2099-09-12T10:00:00+08:00', '2099-09-12T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000ed', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Arranged by hand but not reserved', 'planning', '2099-09-13T10:00:00+08:00', '2099-09-13T12:00:00+08:00', true),
  ('fc000000-0000-0000-0000-0000000000ee', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'Main venue has an active conflict', 'planning', '2099-09-14T10:00:00+08:00', '2099-09-14T12:00:00+08:00', true);

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue, needs_review, expires_at)
values
  ('fc000000-0000-0000-0000-0000000000b1', 'fc000000-0000-0000-0000-0000000000e1', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-01T10:00:00+08:00', '2099-09-01T12:00:00+08:00', 'approved', true, false, null),
  ('fc000000-0000-0000-0000-0000000000b2', 'fc000000-0000-0000-0000-0000000000e2', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-02T10:00:00+08:00', '2099-09-02T12:00:00+08:00', 'pending', true, false, null),
  ('fc000000-0000-0000-0000-0000000000b3', 'fc000000-0000-0000-0000-0000000000e3', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-03T10:00:00+08:00', '2099-09-03T12:00:00+08:00', 'approved', true, true, null),
  ('fc000000-0000-0000-0000-0000000000b4', 'fc000000-0000-0000-0000-0000000000e4', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-04T10:00:00+08:00', '2099-09-04T12:00:00+08:00', 'approved', true, false, null),
  ('fc000000-0000-0000-0000-0000000000b5', 'fc000000-0000-0000-0000-0000000000e5', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-05T10:00:00+08:00', '2099-09-05T12:00:00+08:00', 'approved', true, false, null),
  ('fc000000-0000-0000-0000-0000000000c5', 'fc000000-0000-0000-0000-0000000000e5', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-05T13:00:00+08:00', '2099-09-05T14:00:00+08:00', 'cancelled', false, false, null),
  ('fc000000-0000-0000-0000-0000000000b6', 'fc000000-0000-0000-0000-0000000000e6', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-06T10:00:00+08:00', '2099-09-06T12:00:00+08:00', 'approved', true, false, null),
  ('fc000000-0000-0000-0000-0000000000c6', 'fc000000-0000-0000-0000-0000000000e6', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-06T13:00:00+08:00', '2099-09-06T14:00:00+08:00', 'pending', false, false, null),
  ('fc000000-0000-0000-0000-0000000000b8', 'fc000000-0000-0000-0000-0000000000e8', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-08T10:00:00+08:00', '2099-09-08T12:00:00+08:00', 'on_hold', true, false, '2099-01-01T00:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000b9', 'fc000000-0000-0000-0000-0000000000e9', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-09T10:00:00+08:00', '2099-09-09T12:00:00+08:00', 'expired', true, false, '2020-01-01T00:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000ba', 'fc000000-0000-0000-0000-0000000000ea', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-10T10:00:00+08:00', '2099-09-10T12:00:00+08:00', 'approved', true, false, null),
  ('fc000000-0000-0000-0000-0000000000bb', 'fc000000-0000-0000-0000-0000000000eb', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-11T10:00:00+08:00', '2099-09-11T12:00:00+08:00', 'approved', true, false, null),
  ('fc000000-0000-0000-0000-0000000000bc', 'fc000000-0000-0000-0000-0000000000ec', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-12T10:00:00+08:00', '2099-09-12T12:00:00+08:00', 'approved', true, false, null),
  ('fc000000-0000-0000-0000-0000000000bd', 'fc000000-0000-0000-0000-0000000000ed', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-13T10:00:00+08:00', '2099-09-13T12:00:00+08:00', 'approved', true, false, null),
  ('fc000000-0000-0000-0000-0000000000be', 'fc000000-0000-0000-0000-0000000000ee', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000002', '2099-09-14T10:00:00+08:00', '2099-09-14T12:00:00+08:00', 'approved', true, false, null);

-- 202610200009: E3's flagged main venue has a recorded reason.
update public.venue_bookings set needs_review_reason = 'Capacity reduced below the event''s headcount.'
where id = 'fc000000-0000-0000-0000-0000000000b3';

-- Active (unexpired, uncleared) disruption on E4's main booking.
insert into public.venue_unavailability (id, venue_id, reason, starts_at, ends_at) values
  ('fc000000-0000-0000-0000-0000000000d1', 'fc000000-0000-0000-0000-000000000010', 'RDY block', '2099-09-04T09:00:00+08:00', '2099-09-04T13:00:00+08:00');
insert into public.venue_booking_disruptions (booking_id, block_id) values
  ('fc000000-0000-0000-0000-0000000000b4', 'fc000000-0000-0000-0000-0000000000d1');

-- Active (unresolved) conflict on E14's main booking, flagged against the
-- same block as a stand-in "other side" of the conflict.
insert into public.venue_booking_conflicts (booking_id, conflicting_block_id, cause, flagged_by) values
  ('fc000000-0000-0000-0000-0000000000be', 'fc000000-0000-0000-0000-0000000000d1', 'Overlaps a venue block once setup/turnaround time is applied', 'fc000000-0000-0000-0000-000000000004');

-- Equipment: E10 reserved in full, E11 not reserved, E12 flagged Issue,
-- E13 hand-set Arranged with only a partial reservation.
insert into public.event_equipment_requirements (id, event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
values
  ('fc000000-0000-0000-0000-0000000000f1', 'fc000000-0000-0000-0000-0000000000ea', (select id from v_ids where name = 'mic'), 'Mic', 2, '2099-09-10T10:00:00+08:00', '2099-09-10T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000f2', 'fc000000-0000-0000-0000-0000000000eb', (select id from v_ids where name = 'mic'), 'Mic', 2, '2099-09-11T10:00:00+08:00', '2099-09-11T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000f3', 'fc000000-0000-0000-0000-0000000000ec', (select id from v_ids where name = 'mic'), 'Mic', 2, '2099-09-12T10:00:00+08:00', '2099-09-12T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000f4', 'fc000000-0000-0000-0000-0000000000ed', (select id from v_ids where name = 'mic'), 'Mic', 2, '2099-09-13T10:00:00+08:00', '2099-09-13T12:00:00+08:00');

insert into public.equipment_reservations (event_id, equipment_item_id, requirement_id, quantity, starts_at, ends_at, status, requested_by, requested_at, decided_by, decided_at)
values
  ('fc000000-0000-0000-0000-0000000000ea', (select id from v_ids where name = 'mic'), 'fc000000-0000-0000-0000-0000000000f1', 2, '2099-09-10T10:00:00+08:00', '2099-09-10T12:00:00+08:00', 'approved', 'fc000000-0000-0000-0000-000000000004', now(), 'fc000000-0000-0000-0000-000000000004', now()),
  ('fc000000-0000-0000-0000-0000000000ed', (select id from v_ids where name = 'mic'), 'fc000000-0000-0000-0000-0000000000f4', 1, '2099-09-13T10:00:00+08:00', '2099-09-13T12:00:00+08:00', 'approved', 'fc000000-0000-0000-0000-000000000004', now(), 'fc000000-0000-0000-0000-000000000004', now());

insert into public.equipment_arrangement_updates (requirement_id, event_id, status, updated_by)
values
  ('fc000000-0000-0000-0000-0000000000f3', 'fc000000-0000-0000-0000-0000000000ec', 'issue', 'fc000000-0000-0000-0000-000000000004'),
  ('fc000000-0000-0000-0000-0000000000f4', 'fc000000-0000-0000-0000-0000000000ed', 'arranged', 'fc000000-0000-0000-0000-000000000004');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- AC03/AC04: Approved, unflagged main venue, no equipment -> Ready.
select is((select (public.event_readiness('fc000000-0000-0000-0000-0000000000e1') ->> 'ready')::boolean), true, 'AC03/AC04: an approved unflagged main venue with no equipment is Ready');
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000e1') ->> 'venueArrangementStatus'), 'complete', 'the venue arrangement rolls up to Complete');
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000e1') ->> 'equipmentArrangementStatus'), 'not_required', 'AC01: no equipment requested and acknowledged shows Not Required');

-- AC01/AC03: a Pending main venue booking is Pending, not Ready.
select is((select (public.event_readiness('fc000000-0000-0000-0000-0000000000e2') ->> 'ready')::boolean), false, 'a Pending main venue booking is not Ready');
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000e2') -> 'venues' -> 0 ->> 'status'), 'pending', 'the Pending main venue booking shows Pending');

-- AC02: a flagged (Conflict - Needs Review) main venue is Needs Review.
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000e3') ->> 'venueArrangementStatus'), 'needs_review', 'AC02: a needs_review-flagged main venue rolls up to Needs Review');
select is((select (public.event_readiness('fc000000-0000-0000-0000-0000000000e3') ->> 'ready')::boolean), false, 'a Needs Review main venue is not Ready');

-- 202610200009: a Needs Review item carries its reason; a Complete item does not.
select is(
  (select public.event_readiness('fc000000-0000-0000-0000-0000000000e3') -> 'venues' -> 0 ->> 'needsReviewReason'),
  'Capacity reduced below the event''s headcount.',
  'a flagged venue booking carries its needs_review_reason'
);
select is(
  (select public.event_readiness('fc000000-0000-0000-0000-0000000000e1') -> 'venues' -> 0 -> 'needsReviewReason'),
  'null'::jsonb,
  'a Complete venue booking has no reason'
);

-- AC02: a Disrupted main venue is Needs Review.
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000e4') -> 'venues' -> 0 ->> 'status'), 'needs_review', 'AC02: a disrupted main venue booking shows Needs Review');

-- AC03: a cancelled non-main booking never blocks readiness.
select is((select (public.event_readiness('fc000000-0000-0000-0000-0000000000e5') ->> 'ready')::boolean), true, 'AC03: a cancelled non-main booking does not block readiness');

-- AC03: a Pending non-main booking blocks readiness.
select is((select (public.event_readiness('fc000000-0000-0000-0000-0000000000e6') ->> 'ready')::boolean), false, 'AC03: a Pending non-main booking blocks readiness even with an Approved main venue');

-- No venue booking at all: Pending, outstanding names the missing main venue.
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000e7') ->> 'venueArrangementStatus'), 'pending', 'no venue booking at all rolls up to Pending');
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000e7') -> 'outstandingItems' -> 0 ->> 'code'), 'no_main_venue', 'the missing main venue is named in outstandingItems');

-- AC02/AC07 (revised by 202610200012): an active tentative hold never counts
-- as a completed arrangement -- it rolls up to Needs Review, not Pending.
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000e8') -> 'venues' -> 0 ->> 'status'), 'needs_review', 'AC02/AC07: an active tentative hold on the main venue shows Needs Review, never Complete');

-- AC07: an expired hold is excluded, so there is effectively no main venue.
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000e9') ->> 'venueArrangementStatus'), 'pending', 'AC07: an expired hold does not count as a venue booking at all');

-- AC01/AC03: equipment reserved in full is Complete, event is Ready.
select is((select (public.event_readiness('fc000000-0000-0000-0000-0000000000ea') ->> 'ready')::boolean), true, 'AC03: equipment reserved in full makes the event Ready');
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000ea') ->> 'equipmentArrangementStatus'), 'complete', 'the equipment arrangement rolls up to Complete');

-- 202610200009: the item's quantity is returned.
select is(
  (select (public.event_readiness('fc000000-0000-0000-0000-0000000000ea') -> 'equipment' -> 0 ->> 'quantity')::int),
  2,
  'an equipment item carries its requested quantity'
);

-- AC03: requested but not reserved equipment blocks readiness (Pending).
select is((select (public.event_readiness('fc000000-0000-0000-0000-0000000000eb') ->> 'ready')::boolean), false, 'unreserved equipment blocks readiness');
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000eb') ->> 'equipmentArrangementStatus'), 'pending', 'unreserved equipment rolls up to Pending');

-- AC02: equipment flagged Issue is Needs Review.
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000ec') ->> 'equipmentArrangementStatus'), 'needs_review', 'AC02: equipment flagged Issue rolls up to Needs Review');
select is(
  (select public.event_readiness('fc000000-0000-0000-0000-0000000000ec') -> 'equipment' -> 0 ->> 'needsReviewReason'),
  'Wireless microphone is flagged Issue and needs review.',
  'an Issue-flagged equipment item carries a reason even with no needs_review_reason column value'
);

-- A hand-set Arranged status does not by itself mean reserved: only 1 of 2
-- requested units is actually reserved, so this is Pending, not Complete.
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000ed') ->> 'equipmentArrangementStatus'), 'pending', 'a hand-set Arranged status without a full reservation still rolls up to Pending');

-- AC02: an Approved main venue with an active, unresolved
-- venue_booking_conflicts row is Needs Review, not Complete.
select is((select public.event_readiness('fc000000-0000-0000-0000-0000000000ee') -> 'venues' -> 0 ->> 'status'), 'needs_review', 'AC02: an approved main venue with an active conflict shows Needs Review');
select is((select (public.event_readiness('fc000000-0000-0000-0000-0000000000ee') ->> 'ready')::boolean), false, 'an active venue conflict blocks readiness');

-- Access: can_view_event grants every coordinator broad read access (by
-- design, same as the Events list), so another coordinator CAN still read
-- this event's readiness — only someone outside that role set, and not the
-- organiser, is refused.
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$select public.event_readiness('fc000000-0000-0000-0000-0000000000e1')$$,
  'any event coordinator can read an event''s readiness, same as can_view_event elsewhere'
);

select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$select public.event_readiness('fc000000-0000-0000-0000-0000000000e1')$$,
  '42501', 'Event not found or you do not have access to it',
  'an organiser who does not own the event and has no staff role is refused'
);

select * from finish();
rollback;
