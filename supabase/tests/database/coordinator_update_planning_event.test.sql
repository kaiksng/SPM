begin;

-- SPM-10: a coordinator updates a Planning event's editable requirements
-- through update_event_as_coordinator. Overview, schedule and registration
-- are locked (AC01); a request touching a locked field saves nothing (AC02);
-- venue and equipment stay editable (AC03); and each changed field is audited
-- once, with its previous value, new value, actor and time (AC04-AC06).

select plan(45);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '80000000-0000-0000-0000-000000000001',
    'planning-organiser@example.test',
    '{"full_name":"Planning Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    'planning-coordinator-a@example.test',
    '{"full_name":"Planning Coordinator A","role":"event_coordinator"}'::jsonb
  ),
  (
    '80000000-0000-0000-0000-000000000003',
    'planning-coordinator-b@example.test',
    '{"full_name":"Planning Coordinator B","role":"event_coordinator"}'::jsonb
  ),
  (
    '80000000-0000-0000-0000-000000000004',
    'planning-lead@example.test',
    '{"full_name":"Planning Lead","role":"event_coordinator_lead"}'::jsonb
  );

insert into public.equipment_items (name, category, code, total_quantity)
values ('SPM10 Microphone', 'Audio', 'spm10-mic', 5);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table pcp_ids (name text primary key, id uuid);
create temporary table pcp_payloads (name text primary key, payload jsonb);

-- The event as submitted. Every later call starts from this payload and
-- changes only what that check is about.
insert into pcp_payloads (name, payload)
values (
  'base',
  '{
    "title":"Original Title",
    "purpose":"Original purpose",
    "description":"A test event for coordinator planning updates.",
    "eventType":"Workshop",
    "expectedAttendance":"80",
    "startsAt":"2099-04-01T10:00:00+08:00",
    "endsAt":"2099-04-01T12:00:00+08:00",
    "venue":{
      "preferredLocation":"Main Hall",
      "minimumCapacity":"60",
      "accessibilityNotes":"Ramp access",
      "layoutNotes":"Theatre",
      "facilities":["Parking"]
    },
    "equipment":[],
    "registration":{
      "required":true,
      "opensAt":"2099-03-01T09:00:00+08:00",
      "closesAt":"2099-03-20T17:00:00+08:00",
      "capacity":"70",
      "waitlistEnabled":true
    },
    "requirementsAcknowledged":true
  }'::jsonb
);

select lives_ok(
  $$insert into pcp_ids
    select 'event', public.save_event_draft((select payload from pcp_payloads where name = 'base'))$$,
  'the organiser can save a complete draft'
);

-- 202610160003: an event's first save is not a change, so its initial
-- facilities are not logged.
select is(
  (
    select count(*)::integer from public.event_field_changes
    where event_id = (select id from pcp_ids where name = 'event') and field_name = 'venue.facilities'
  ),
  0,
  'SPM-10 AC04: an event''s first save logs no facility entries'
);

-- Deleting a draft removes its facilities too; the facility audit must not
-- get in the way of that.
insert into pcp_ids
select 'draft-to-delete', public.save_event_draft((select payload from pcp_payloads where name = 'base'));
select lives_ok(
  format($$delete from public.events where id = %L::uuid$$, (select id from pcp_ids where name = 'draft-to-delete')),
  'the organiser can still delete a draft that has facilities'
);
select is(
  (select count(*)::integer from public.events where id = (select id from pcp_ids where name = 'draft-to-delete')),
  0,
  'the deleted draft is gone'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pcp_ids where name = 'event')),
  'the event can be submitted'
);

-- Submission no longer assigns a coordinator (202610050003); the Lead does.
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.reassign_event_coordinator(%L::uuid, '80000000-0000-0000-0000-000000000002'::uuid, '')$$,
    (select id from pcp_ids where name = 'event')
  ),
  'the Lead assigns coordinator A'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- The write path only opens once the event is Planning, not while Requested.
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select payload from pcp_payloads where name = 'base')
  ),
  '23514',
  'Only a Planning event can be updated this way',
  'a Requested event cannot be updated through this path'
);

select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks ready.')$$,
    (select id from pcp_ids where name = 'event')
  ),
  'the assigned coordinator can approve the complete request'
);
select is(
  (select status::text from public.events where id = (select id from pcp_ids where name = 'event')),
  'planning',
  'the event has moved to Planning'
);

-- SPM-10 AC01: each locked field, changed on its own, is rejected with a
-- message naming it.
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select payload || '{"title":"Renamed Event"}' from pcp_payloads where name = 'base')
  ),
  '23514',
  'Event name is locked once the event reaches Planning',
  'SPM-10 AC01: the event name is locked'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select payload || '{"purpose":"A different purpose"}' from pcp_payloads where name = 'base')
  ),
  '23514',
  'Purpose is locked once the event reaches Planning',
  'SPM-10 AC01: the purpose is locked'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select payload || '{"description":"A different description."}' from pcp_payloads where name = 'base')
  ),
  '23514',
  'Description is locked once the event reaches Planning',
  'SPM-10 AC01: the description is locked'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select payload || '{"eventType":"Seminar"}' from pcp_payloads where name = 'base')
  ),
  '23514',
  'Event category is locked once the event reaches Planning',
  'SPM-10 AC01: the event category is locked'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select payload || '{"expectedAttendance":"500"}' from pcp_payloads where name = 'base')
  ),
  '23514',
  'Expected attendance is locked once the event reaches Planning',
  'SPM-10 AC01: the expected attendance is locked'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select payload || '{"startsAt":"2099-04-01T11:00:00+08:00"}' from pcp_payloads where name = 'base')
  ),
  '23514',
  'Start time is locked once the event reaches Planning',
  'SPM-10 AC01: the start time is locked'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select payload || '{"endsAt":"2099-04-01T13:00:00+08:00"}' from pcp_payloads where name = 'base')
  ),
  '23514',
  'End time is locked once the event reaches Planning',
  'SPM-10 AC01: the end time is locked'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select jsonb_set(payload, '{registration,required}', 'false') from pcp_payloads where name = 'base')
  ),
  '23514',
  'Registration details are locked once the event reaches Planning',
  'SPM-10 AC01: whether registration is required is locked'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select jsonb_set(payload, '{registration,opensAt}', '"2099-03-02T09:00:00+08:00"') from pcp_payloads where name = 'base')
  ),
  '23514',
  'Registration details are locked once the event reaches Planning',
  'SPM-10 AC01: the registration opening time is locked'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select jsonb_set(payload, '{registration,closesAt}', '"2099-03-21T17:00:00+08:00"') from pcp_payloads where name = 'base')
  ),
  '23514',
  'Registration details are locked once the event reaches Planning',
  'SPM-10 AC01: the registration closing time is locked'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select jsonb_set(payload, '{registration,capacity}', '"90"') from pcp_payloads where name = 'base')
  ),
  '23514',
  'Registration details are locked once the event reaches Planning',
  'SPM-10 AC01: the registration capacity is locked'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select jsonb_set(payload, '{registration,waitlistEnabled}', 'false') from pcp_payloads where name = 'base')
  ),
  '23514',
  'Registration details are locked once the event reaches Planning',
  'SPM-10 AC01: whether the waitlist is enabled is locked'
);

-- The edits SPM-10 AC03 allows: every venue field and the equipment list.
insert into pcp_payloads (name, payload)
select
  'updated',
  payload
    || jsonb_build_object(
      'venue', jsonb_build_object(
        'preferredLocation', 'North',
        'minimumCapacity', '75',
        'accessibilityNotes', 'Step-free entrance',
        'layoutNotes', 'Classroom',
        'facilities', jsonb_build_array('Parking', 'Gym')
      ),
      'equipment', jsonb_build_array(jsonb_build_object(
        'id', null,
        'equipmentItemId', (select id from public.equipment_items where code = 'spm10-mic'),
        'quantity', '2',
        'requiredFrom', '2099-04-01T10:00:00+08:00',
        'requiredUntil', '2099-04-01T12:00:00+08:00',
        'notes', null
      ))
    )
from pcp_payloads
where name = 'base';

-- SPM-10 AC02: the allowed edits above, sent together with one locked
-- change, are rejected in full.
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select payload || '{"title":"Renamed Event"}' from pcp_payloads where name = 'updated')
  ),
  '23514',
  'Event name is locked once the event reaches Planning',
  'SPM-10 AC02: a request that changes a locked field is rejected'
);
select is(
  (
    select row(preferred_location, minimum_capacity, accessibility_notes, layout_notes)
    from public.event_venue_requirements
    where event_id = (select id from pcp_ids where name = 'event')
  ),
  row('Main Hall'::text, 60, 'Ramp access'::text, 'Theatre'::text),
  'SPM-10 AC02: none of the venue changes in the rejected request were saved'
);
select results_eq(
  format(
    $$select facility_name from public.event_required_facilities where event_id = %L::uuid order by facility_name$$,
    (select id from pcp_ids where name = 'event')
  ),
  array['Parking'],
  'SPM-10 AC02: the facility change in the rejected request was not saved'
);
select is(
  (select count(*)::integer from public.event_equipment_requirements where event_id = (select id from pcp_ids where name = 'event')),
  0,
  'SPM-10 AC02: the equipment in the rejected request was not added'
);
select is(
  (select count(*)::integer from public.event_field_changes where event_id = (select id from pcp_ids where name = 'event')),
  0,
  'SPM-10 AC02: a rejected request records no field changes'
);

-- SPM-10 AC03: the same edits, without the locked change, are saved.
select lives_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select payload from pcp_payloads where name = 'updated')
  ),
  'SPM-10 AC03: the coordinator can update venue and equipment while Planning'
);
select is(
  (
    select row(preferred_location, minimum_capacity, accessibility_notes, layout_notes)
    from public.event_venue_requirements
    where event_id = (select id from pcp_ids where name = 'event')
  ),
  row('North'::text, 75, 'Step-free entrance'::text, 'Classroom'::text),
  'SPM-10 AC03: every venue requirement was updated'
);
select results_eq(
  format(
    $$select facility_name from public.event_required_facilities where event_id = %L::uuid order by facility_name$$,
    (select id from pcp_ids where name = 'event')
  ),
  array['Gym', 'Parking'],
  'SPM-10 AC03: the required facilities were updated'
);
select is(
  (
    select row(equipment_name, quantity)
    from public.event_equipment_requirements
    where event_id = (select id from pcp_ids where name = 'event')
  ),
  row('SPM10 Microphone'::text, 2),
  'SPM-10 AC03: the equipment requirement was added'
);
select is(
  (select title from public.events where id = (select id from pcp_ids where name = 'event')),
  'Original Title',
  'SPM-10 AC03: the locked fields keep their values'
);

-- SPM-10 AC04: a changed venue field records its previous value, new value,
-- actor and time (now() is this transaction's time).
select is(
  (
    select row(previous_value, new_value, changed_by, changed_at)
    from public.event_field_changes
    where event_id = (select id from pcp_ids where name = 'event')
      and field_name = 'venue.preferredLocation'
  ),
  row('Main Hall'::text, 'North'::text, '80000000-0000-0000-0000-000000000002'::uuid, now()),
  'SPM-10 AC04: the venue change records previous value, new value, actor and time'
);
-- SPM-10 AC04: an equipment change is recorded the same way.
select is(
  (
    select row(change_type, previous_value, new_value ->> 'quantity', changed_by, changed_at)
    from public.event_equipment_changes
    where event_id = (select id from pcp_ids where name = 'event')
  ),
  row('added'::text, null::jsonb, '2'::text, '80000000-0000-0000-0000-000000000002'::uuid, now()),
  'SPM-10 AC04: the equipment change records new value, actor and time'
);
-- SPM-10 AC04: an added facility is recorded the same way (202610160003).
select is(
  (
    select row(previous_value, new_value, changed_by, changed_at)
    from public.event_field_changes
    where event_id = (select id from pcp_ids where name = 'event')
      and field_name = 'venue.facilities'
  ),
  row(null::text, 'Gym'::text, '80000000-0000-0000-0000-000000000002'::uuid, now()),
  'SPM-10 AC04: the added facility records new value, actor and time'
);

-- SPM-10 AC05: the four venue fields and the added facility changed in that
-- one save are five separate entries, each with its own values.
select set_eq(
  format(
    $$select field_name, previous_value, new_value from public.event_field_changes where event_id = %L::uuid$$,
    (select id from pcp_ids where name = 'event')
  ),
  $$values
    ('venue.preferredLocation', 'Main Hall', 'North'),
    ('venue.minimumCapacity', '60', '75'),
    ('venue.accessibilityNotes', 'Ramp access', 'Step-free entrance'),
    ('venue.layoutNotes', 'Theatre', 'Classroom'),
    ('venue.facilities', null, 'Gym')$$,
  'SPM-10 AC05: each field changed in one save is its own audit entry'
);

-- SPM-10 AC06: saving again with nothing changed (the equipment row is now
-- referenced by its id) records nothing.
update pcp_payloads
set payload = jsonb_set(
  payload,
  '{equipment,0,id}',
  to_jsonb((select id::text from public.event_equipment_requirements where event_id = (select id from pcp_ids where name = 'event')))
)
where name = 'updated';

select lives_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select payload from pcp_payloads where name = 'updated')
  ),
  'saving unchanged values succeeds'
);
select is(
  (select count(*)::integer from public.event_field_changes where event_id = (select id from pcp_ids where name = 'event')),
  5,
  'SPM-10 AC06: no new field entries when nothing actually changed'
);
select is(
  (select count(*)::integer from public.event_equipment_changes where event_id = (select id from pcp_ids where name = 'event')),
  1,
  'SPM-10 AC06: no new equipment entries when nothing actually changed'
);
select is(
  (select count(*)::integer from public.event_equipment_requirements where event_id = (select id from pcp_ids where name = 'event')),
  1,
  'SPM-10 AC06: the unchanged equipment row is kept, not duplicated'
);

-- SPM-10 AC04: removing a facility is recorded too, and only that facility.
select lives_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select jsonb_set(payload, '{venue,facilities}', '["Gym"]') from pcp_payloads where name = 'updated')
  ),
  'the coordinator removes a facility'
);
select set_eq(
  format(
    $$select previous_value, new_value from public.event_field_changes
      where event_id = %L::uuid and field_name = 'venue.facilities'$$,
    (select id from pcp_ids where name = 'event')
  ),
  $$values (null, 'Gym'), ('Parking', null)$$,
  'SPM-10 AC04: the removed facility is recorded; the kept one is not'
);

-- SPM-10 AC01: a direct table update cannot get round the locks either —
-- coordinators have no direct update on events (202610160002).
update public.events set title = 'Bypassed Title'
where id = (select id from pcp_ids where name = 'event');
select is(
  (select title from public.events where id = (select id from pcp_ids where name = 'event')),
  'Original Title',
  'SPM-10 AC01: a direct update cannot change a locked field of a Planning event'
);

-- The same holds once the event moves on to Pending Safety Check.
reset role;
update public.events set status = 'pending_safety_check'
where id = (select id from pcp_ids where name = 'event');
set local role authenticated;
update public.events set title = 'Bypassed Title'
where id = (select id from pcp_ids where name = 'event');
select is(
  (select title from public.events where id = (select id from pcp_ids where name = 'event')),
  'Original Title',
  'a direct update cannot change a Pending Safety Check event either'
);

-- Authorisation: a coordinator not assigned to this event cannot update it.
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select jsonb_set(payload, '{venue,preferredLocation}', '"East"') from pcp_payloads where name = 'updated')
  ),
  '42501',
  'Only the assigned coordinator can update this event',
  'a coordinator not assigned to the event cannot update it'
);

-- Authorisation: the organiser cannot use this coordinator-only write path,
-- even for their own event.
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, %L::jsonb)$$,
    (select id from pcp_ids where name = 'event'),
    (select jsonb_set(payload, '{venue,preferredLocation}', '"East"') from pcp_payloads where name = 'updated')
  ),
  '42501',
  'Only the assigned coordinator can update this event',
  'the organiser cannot use the coordinator-only update path'
);

select * from finish();
rollback;
