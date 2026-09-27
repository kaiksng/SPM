begin;

select plan(8);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'f0000000-0000-0000-0000-000000000001',
    'vsvrp-organiser@example.test',
    '{"full_name":"VSVRP Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    'f0000000-0000-0000-0000-000000000002',
    'vsvrp-coordinator@example.test',
    '{"full_name":"VSVRP Coordinator","role":"event_coordinator"}'::jsonb
  ),
  (
    'f0000000-0000-0000-0000-000000000003',
    'vsvrp-venue-staff-a@example.test',
    '{"full_name":"VSVRP Venue Staff A","role":"venue_staff"}'::jsonb
  ),
  (
    'f0000000-0000-0000-0000-000000000004',
    'vsvrp-venue-staff-b@example.test',
    '{"full_name":"VSVRP Venue Staff B","role":"venue_staff"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table vsvrp_venue_ids (label text primary key, id uuid);

reset role;
insert into public.venues (name, location, capacity, operating_hours)
select 'VSVRP Test Venue', 'Building 7', 50,
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb
where not exists (select 1 from public.venues where name = 'VSVRP Test Venue');

insert into vsvrp_venue_ids
  select 'venue-1', id from public.venues where name = 'VSVRP Test Venue';

set local role authenticated;

create temporary table vsvrp_event_ids (label text primary key, id uuid);
create temporary table vsvrp_booking_ids (label text primary key, id uuid);

select lives_ok(
  $$insert into vsvrp_event_ids
    select 'event-a', public.save_event_draft(
      '{
        "title":"[VSVRP] Event A",
        "purpose":"Venue staff profile visibility test.",
        "description":"A test event.",
        "expectedAttendance":"20",
        "startsAt":"2099-06-01T10:00:00+08:00",
        "endsAt":"2099-06-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event A as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from vsvrp_event_ids where label = 'event-a')),
  'Event A can be submitted'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from vsvrp_event_ids where label = 'event-a')
  ),
  'Event A is approved into Planning'
);
select lives_ok(
  format(
    $$insert into vsvrp_booking_ids
      select 'booking-a', public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from vsvrp_event_ids where label = 'event-a'),
    (select id from vsvrp_venue_ids where label = 'venue-1')
  ),
  'Event A submits a Pending request against the venue'
);

-- Venue Staff A decides the request.
select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_venue_booking_request(%L::uuid, 'approved'::public.venue_booking_decision_type, null)$$,
    (select id from vsvrp_booking_ids where label = 'booking-a')
  ),
  'Venue Staff A approves the request'
);

-- A *different* Venue Staff member (B, who neither requested nor decided
-- this booking) should still be able to read the requesting coordinator's
-- and deciding staff member's names — this is exactly what the "Requests"
-- list's embedded profiles!venue_bookings_requested_by_fkey /
-- ...decided_by_fkey selects rely on, and what silently returned null
-- ("Unknown coordinator") before the new RLS policy.
select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select is(
  (select full_name from public.profiles where id = 'f0000000-0000-0000-0000-000000000002'::uuid),
  'VSVRP Coordinator',
  'a different Venue Staff member can see the requesting coordinator''s name'
);
select is(
  (select full_name from public.profiles where id = 'f0000000-0000-0000-0000-000000000003'::uuid),
  'VSVRP Venue Staff A',
  'a different Venue Staff member can see the deciding Venue Staff member''s name'
);

-- Regression: this policy is scoped to Venue Staff only — the organiser has
-- no relationship to Venue Staff B's profile (not its owner, not a
-- coordinator, and not Venue Staff themselves), so it stays invisible to
-- them.
select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select full_name from public.profiles where id = 'f0000000-0000-0000-0000-000000000004'::uuid),
  null::text,
  'the organiser cannot see an unrelated Venue Staff member''s profile'
);

select * from finish();
rollback;
