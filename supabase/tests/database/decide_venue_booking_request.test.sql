begin;

select plan(32);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'd0000000-0000-0000-0000-000000000001',
    'dvbr-organiser@example.test',
    '{"full_name":"DVBR Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    'd0000000-0000-0000-0000-000000000002',
    'dvbr-coordinator-a@example.test',
    '{"full_name":"DVBR Coordinator A","role":"event_coordinator"}'::jsonb
  ),
  (
    'd0000000-0000-0000-0000-000000000003',
    'dvbr-venue-staff@example.test',
    '{"full_name":"DVBR Venue Staff","role":"venue_staff"}'::jsonb
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
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- One venue, open every day, so operating hours never block this scenario.
create temporary table dvbr_venue_ids (label text primary key, id uuid);

reset role;
insert into public.venues (name, location, capacity, operating_hours)
select 'DVBR Test Venue', 'Building 9', 100,
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb
where not exists (select 1 from public.venues where name = 'DVBR Test Venue');

insert into dvbr_venue_ids
  select 'venue-1', id from public.venues where name = 'DVBR Test Venue';

set local role authenticated;

create temporary table dvbr_event_ids (label text primary key, id uuid);

select lives_ok(
  $$insert into dvbr_event_ids
    select 'event-a', public.save_event_draft(
      '{
        "title":"[DVBR] Event A",
        "purpose":"Venue decision test.",
        "description":"A test event.",
        "expectedAttendance":"20",
        "startsAt":"2099-04-06T10:00:00+08:00",
        "endsAt":"2099-04-06T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event A as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from dvbr_event_ids where label = 'event-a')),
  'Event A can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from dvbr_event_ids where label = 'event-a')),
  'the Lead assigns the next available coordinator'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from dvbr_event_ids where label = 'event-a')
  ),
  'Event A is approved into Planning'
);

create temporary table dvbr_booking_ids (label text primary key, id uuid);
select lives_ok(
  format(
    $$insert into dvbr_booking_ids
      select 'booking-a', public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from dvbr_event_ids where label = 'event-a'),
    (select id from dvbr_venue_ids where label = 'venue-1')
  ),
  'Event A submits a Pending request against the venue'
);

-- Permission: only Venue Staff can decide.
select throws_ok(
  format(
    $$select public.decide_venue_booking_request(%L::uuid, 'approved'::public.venue_booking_decision_type, null)$$,
    (select id from dvbr_booking_ids where label = 'booking-a')
  ),
  '42501',
  'Only Venue Staff can decide a venue booking request',
  'a coordinator cannot decide a venue booking request'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

-- AC02: rejection requires a reason.
select throws_ok(
  format(
    $$select public.decide_venue_booking_request(%L::uuid, 'rejected'::public.venue_booking_decision_type, '   ')$$,
    (select id from dvbr_booking_ids where label = 'booking-a')
  ),
  '23514',
  'Explain the reason for rejecting this venue booking request',
  'AC02: rejecting requires a non-blank reason'
);

-- AC01/AC03: approve booking-a.
select lives_ok(
  format(
    $$select public.decide_venue_booking_request(%L::uuid, 'approved'::public.venue_booking_decision_type, null)$$,
    (select id from dvbr_booking_ids where label = 'booking-a')
  ),
  'AC01: Venue Staff can approve a Pending request'
);
select is(
  (select status::text from public.venue_bookings where id = (select id from dvbr_booking_ids where label = 'booking-a')),
  'approved',
  'AC01: the approved booking''s period becomes a Confirmed Booking (status approved)'
);
select is(
  (select decided_by from public.venue_bookings where id = (select id from dvbr_booking_ids where label = 'booking-a')),
  'd0000000-0000-0000-0000-000000000003'::uuid,
  'AC03: the deciding Venue Staff member is recorded'
);
select isnt(
  (select decided_at from public.venue_bookings where id = (select id from dvbr_booking_ids where label = 'booking-a')),
  null,
  'AC03: the decision timestamp is recorded'
);

-- AC04: the coordinator is notified. Notifications are only visible to their
-- own recipient (RLS), so switch to read them.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer from public.notifications
    where recipient_id = 'd0000000-0000-0000-0000-000000000002'
      and event_id = (select id from dvbr_event_ids where label = 'event-a')
      and type = 'venue_decision'
  ),
  1,
  'AC04: the coordinator is notified of the approval'
);

-- An already-decided request cannot be decided again.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.decide_venue_booking_request(%L::uuid, 'rejected'::public.venue_booking_decision_type, 'Changed my mind.')$$,
    (select id from dvbr_booking_ids where label = 'booking-a')
  ),
  '23514',
  'Only a Pending venue booking request can be approved or rejected',
  'an already-decided request cannot be decided again'
);

-- AC02: reject a fresh Pending request with a reason, on its own slot.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into dvbr_event_ids
    select 'event-c', public.save_event_draft(
      '{
        "title":"[DVBR] Event C",
        "purpose":"Venue decision test.",
        "description":"A third test event.",
        "expectedAttendance":"10",
        "startsAt":"2099-04-08T10:00:00+08:00",
        "endsAt":"2099-04-08T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event C as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from dvbr_event_ids where label = 'event-c')),
  'Event C can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from dvbr_event_ids where label = 'event-c')),
  'the Lead assigns the next available coordinator'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from dvbr_event_ids where label = 'event-c')
  ),
  'Event C is approved into Planning'
);
select lives_ok(
  format(
    $$insert into dvbr_booking_ids
      select 'booking-c', public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from dvbr_event_ids where label = 'event-c'),
    (select id from dvbr_venue_ids where label = 'venue-1')
  ),
  'Event C submits a Pending request against the venue'
);

-- AC03 (defence-in-depth, unrelated to this decision): a second, unrelated
-- event cannot get a competing Pending request for the same venue/period —
-- exactly the pre-existing behaviour (venue_bookings_no_overlap /
-- submit_venue_booking_request are untouched by this story) — once a
-- coordinator holds a Pending request, the slot is reserved for them alone
-- until Venue Staff decides it.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into dvbr_event_ids
    select 'event-b', public.save_event_draft(
      '{
        "title":"[DVBR] Event B",
        "purpose":"Venue decision test.",
        "description":"A second test event.",
        "expectedAttendance":"8",
        "startsAt":"2099-04-08T10:00:00+08:00",
        "endsAt":"2099-04-08T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event B as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from dvbr_event_ids where label = 'event-b')),
  'Event B can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from dvbr_event_ids where label = 'event-b')),
  'the Lead assigns the next available coordinator'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from dvbr_event_ids where label = 'event-b')
  ),
  'Event B is approved into Planning'
);
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from dvbr_event_ids where label = 'event-b'),
    (select id from dvbr_venue_ids where label = 'venue-1')
  ),
  '23514',
  'This venue is already occupied from 10:00 AM on 08 Apr to 12:00 PM on 08 Apr (including setup and turnaround), which overlaps your requested period.',
  'a venue/period already held by a Pending request stays blocked to a competing request from another event'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_venue_booking_request(%L::uuid, 'rejected'::public.venue_booking_decision_type, 'Venue needed for maintenance that day.')$$,
    (select id from dvbr_booking_ids where label = 'booking-c')
  ),
  'AC02: Venue Staff can reject a Pending request with a reason'
);
select is(
  (select status::text from public.venue_bookings where id = (select id from dvbr_booking_ids where label = 'booking-c')),
  'rejected',
  'AC02: the rejected request''s status is Rejected'
);
select is(
  (select decision_notes from public.venue_bookings where id = (select id from dvbr_booking_ids where label = 'booking-c')),
  'Venue needed for maintenance that day.',
  'AC03: the rejection reason is recorded'
);

-- AC02: rejection releases the period — a fresh request for the same
-- venue/period now succeeds, which venue_bookings_no_overlap would have
-- blocked had the period stayed held.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into dvbr_event_ids
    select 'event-d', public.save_event_draft(
      '{
        "title":"[DVBR] Event D",
        "purpose":"Venue decision test.",
        "description":"A fourth test event.",
        "expectedAttendance":"12",
        "startsAt":"2099-04-08T10:00:00+08:00",
        "endsAt":"2099-04-08T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event D as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from dvbr_event_ids where label = 'event-d')),
  'Event D can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from dvbr_event_ids where label = 'event-d')),
  'the Lead assigns the next available coordinator'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from dvbr_event_ids where label = 'event-d')
  ),
  'Event D is approved into Planning'
);
select lives_ok(
  format(
    $$insert into dvbr_booking_ids
      select 'booking-d', public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from dvbr_event_ids where label = 'event-d'),
    (select id from dvbr_venue_ids where label = 'venue-1')
  ),
  'AC02: after the rejection, the same venue/period accepts a new request'
);
select is(
  (select status::text from public.venue_bookings where id = (select id from dvbr_booking_ids where label = 'booking-d')),
  'pending',
  'the new request''s status is Pending'
);

select * from finish();
rollback;
