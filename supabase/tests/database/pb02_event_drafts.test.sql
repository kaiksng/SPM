begin;

select plan(20);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'pb02-owner@example.test',
    '{"full_name":"PB02 Owner","role":"event_organiser"}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'pb02-other@example.test',
    '{"full_name":"PB02 Other","role":"event_organiser"}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'pb02-attendee@example.test',
    '{"full_name":"PB02 Attendee","role":"attendee"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table pb02_saved_ids (id uuid primary key);

select lives_ok(
  format(
    $$insert into pb02_saved_ids
    select public.save_event_draft(
      '{
        "title":"[Kai Test] ABC",
        "purpose":"Welcome new students",
        "description":"A persisted PB-02 draft",
        "eventType":"Briefing",
        "expectedAttendance":"120",
        "startsAt":"2026-09-25T10:00:00+08:00",
        "endsAt":"2026-09-25T12:00:00+08:00",
        "venue":{
          "preferredLocation":"Seminar Room",
          "minimumCapacity":"120",
          "accessibilityNotes":"Step-free access",
          "layoutNotes":"Classroom",
          "facilities":["Projector","Microphone"]
        },
        "equipment":[
          {
            "equipmentItemId":"%s",
            "quantity":"2",
            "requiredFrom":"2026-09-25T09:00:00+08:00",
            "requiredUntil":"2026-09-25T13:00:00+08:00",
            "notes":"HDMI capable"
          }
        ],
        "registration":{
          "required":true,
          "opensAt":"2026-09-14T09:00:00+08:00",
          "closesAt":"2026-09-24T18:00:00+08:00",
          "capacity":"120",
          "waitlistEnabled":true
        }
      }'::jsonb
    )$$,
    (select id from public.equipment_items where name = 'Laptop')
  ),
  'an Event Organiser can save a complete draft atomically'
);

select is(
  (select title from public.events where id = (select id from pb02_saved_ids)),
  '[Kai Test] ABC',
  'the event values are retained'
);
select is(
  (select purpose from public.events where id = (select id from pb02_saved_ids)),
  'Welcome new students',
  'the purpose is retained'
);
select is(
  (select status::text from public.events where id = (select id from pb02_saved_ids)),
  'draft',
  'the saved event remains a Draft'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pb02_saved_ids)),
  null::uuid,
  'saving a draft does not assign a coordinator'
);
select is(
  (select count(*)::integer from public.event_required_facilities where event_id = (select id from pb02_saved_ids)),
  2,
  'all facility requirements are retained'
);
select is(
  (select quantity from public.event_equipment_requirements where event_id = (select id from pb02_saved_ids)),
  2,
  'equipment quantity is retained'
);
select is(
  (select waitlist_enabled from public.event_registration_requirements where event_id = (select id from pb02_saved_ids)),
  true,
  'registration settings are retained'
);

select lives_ok(
  format(
    $$select public.save_event_draft(
      '{"title":"[Kai Test] Updated","expectedAttendance":"150","venue":{"facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb,
      %L::uuid
    )$$,
    (select id from pb02_saved_ids)
  ),
  'the owning organiser can edit a Draft'
);
select is(
  (select expected_attendance from public.events where id = (select id from pb02_saved_ids)),
  150,
  'editing replaces the accepted value'
);

select throws_ok(
  format(
    $$select public.save_event_draft(
      '{"title":"[Kai Test] Partial write","venue":{"facilities":["Projector"]},"equipment":[{"equipmentItemId":"","quantity":"0"}],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb,
      %L::uuid
    )$$,
    (select id from pb02_saved_ids)
  ),
  '23514',
  'Choose equipment from the catalogue for equipment item 1',
  'a failed requirement write rejects the save'
);
select is(
  (select title from public.events where id = (select id from pb02_saved_ids)),
  '[Kai Test] Updated',
  'a failed save rolls back the parent update'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.events where id = (select id from pb02_saved_ids)),
  0,
  'another organiser cannot read the Draft'
);
select throws_ok(
  format(
    $$select public.save_event_draft(
      '{"title":"Unauthorised update","venue":{"facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb,
      %L::uuid
    )$$,
    (select id from pb02_saved_ids)
  ),
  '42501',
  'Draft not found or cannot be edited',
  'another organiser cannot update the Draft'
);
select lives_ok(
  $$delete from public.events where id = (select id from pb02_saved_ids)$$,
  'an unauthorised delete is handled safely'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.save_event_draft(
    '{"title":"Role denied","venue":{"facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
  )$$,
  '42501',
  'Only Event Organisers can save event drafts',
  'a different role cannot create a Draft'
);

reset role;
select is(
  (select count(*)::integer from public.events where id = (select id from pb02_saved_ids)),
  1,
  'another organiser did not delete the Draft'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$delete from public.events where id = (select id from pb02_saved_ids)$$,
  'the owning organiser can delete a Draft'
);

reset role;
select is(
  (select count(*)::integer from public.events where id = (select id from pb02_saved_ids)),
  0,
  'the confirmed deletion removes the Draft'
);
select is(
  (select count(*)::integer from public.event_registration_requirements where event_id = (select id from pb02_saved_ids)),
  0,
  'deleting a Draft cascades to requirement records'
);

select * from finish();
rollback;
