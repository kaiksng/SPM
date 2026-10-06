begin;

select plan(28);

-- Equipment units and catalogue management
-- (202610061000_equipment_units_and_catalogue_management.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'e4000000-0000-0000-0000-000000000001',
    'units-support@example.test',
    '{"full_name":"Units Support","role":"technical_support_staff"}'::jsonb
  ),
  (
    'e4000000-0000-0000-0000-000000000002',
    'units-coordinator@example.test',
    '{"full_name":"Units Coordinator","role":"event_coordinator"}'::jsonb
  ),
  (
    'e4000000-0000-0000-0000-000000000003',
    'units-organiser@example.test',
    '{"full_name":"Units Organiser","role":"event_organiser"}'::jsonb
  );

create temporary table k_ids (name text primary key, id uuid);
grant all on k_ids to authenticated;
insert into k_ids select 'mic', id from public.equipment_items where code = 'mic';

-- Backfill and seeding.
select is(
  (select name from public.equipment_items where code = 'mic'),
  'Wireless microphone',
  'existing items get a short code'
);
select is(
  (select count(*)::integer from public.equipment_items where total_quantity <> 100),
  0,
  'every item starts with 100 units'
);
select is(
  (select max(unit_number) from public.equipment_units where equipment_item_id = (select id from k_ids where name = 'mic')),
  100,
  'units are numbered 1 to 100 (mic-1 ... mic-100)'
);

set local role authenticated;

-- Only Technical Support Staff manage the catalogue.
select set_config('request.jwt.claims', '{"sub":"e4000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.create_equipment_item('Fog machine', 'Lighting', 'fog', 2)$$,
  '42501', 'Only Technical Support Staff can manage equipment',
  'a coordinator cannot add items'
);
select is(
  (select count(*)::integer from public.equipment_units),
  0,
  'a coordinator cannot read units'
);

select set_config('request.jwt.claims', '{"sub":"e4000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- Total stock follows the units; it cannot be set by hand.
select lives_ok(
  $$update public.equipment_items set total_quantity = 5 where code = 'mic'$$,
  'a direct stock update runs'
);
select is(
  (select total_quantity from public.equipment_items where code = 'mic'),
  100,
  'but stock stays equal to the in-service units'
);

-- Creating items.
select lives_ok(
  $$insert into k_ids select 'fog', public.create_equipment_item('  Fog machine ', 'Lighting', 'FOG', 5)$$,
  'Technical Support Staff can add an item with units'
);
select is(
  (select row(name, code, category, total_quantity) from public.equipment_items where id = (select id from k_ids where name = 'fog')),
  row('Fog machine'::text, 'fog'::text, 'Lighting'::text, 5),
  'the item is stored trimmed, with a lowercase code and 5 units'
);
select throws_ok(
  $$select public.create_equipment_item('Smoke machine', 'Lighting', 'mic', 1)$$,
  '23514', 'Another item already uses the code mic',
  'codes are unique'
);
select throws_ok(
  $$select public.create_equipment_item('fog machine', 'Lighting', 'fog2', 1)$$,
  '23514', 'An item with this name already exists',
  'names are unique, ignoring case'
);
select throws_ok(
  $$select public.create_equipment_item('Haze machine', 'Lighting', 'haze machine', 1)$$,
  '23514', 'Code must be 1-20 lowercase letters, numbers or single hyphens (e.g. mic)',
  'codes cannot contain spaces'
);
select throws_ok(
  $$select public.create_equipment_item('Haze machine', '', 'haze', 1)$$,
  '23514', 'Enter a category',
  'a category is required'
);

-- Adding units continues the numbering.
select is(
  public.add_equipment_units((select id from k_ids where name = 'fog'), 3),
  8,
  'adding 3 units makes 8'
);
select results_eq(
  format($$select unit_number from public.equipment_units where equipment_item_id = %L order by unit_number$$, (select id from k_ids where name = 'fog')),
  array[1, 2, 3, 4, 5, 6, 7, 8],
  'new units are numbered after the existing ones'
);

-- Retiring and restoring a unit.
insert into k_ids
select 'fog-2', id from public.equipment_units
where equipment_item_id = (select id from k_ids where name = 'fog') and unit_number = 2;

select lives_ok(
  format($$select public.set_equipment_unit_retired(%L, true)$$, (select id from k_ids where name = 'fog-2')),
  'a unit can be retired'
);
select is(
  (select total_quantity from public.equipment_items where id = (select id from k_ids where name = 'fog')),
  7,
  'a retired unit no longer counts as stock'
);
select lives_ok(
  format($$select public.set_equipment_unit_retired(%L, false)$$, (select id from k_ids where name = 'fog-2')),
  'a retired unit can be restored'
);

-- Editing.
select lives_ok(
  $$select public.update_equipment_item((select id from k_ids where name = 'fog'), 'Fog machine (large)', 'Effects', 'fog-l')$$,
  'an item can be renamed, recategorised and recoded'
);
select is(
  (select row(name, category, code) from public.equipment_items where id = (select id from k_ids where name = 'fog')),
  row('Fog machine (large)'::text, 'Effects'::text, 'fog-l'::text),
  'the edit is stored'
);

-- Unavailability naming specific units.
insert into k_ids
select 'mic-' || unit_number, id from public.equipment_units
where equipment_item_id = (select id from k_ids where name = 'mic') and unit_number in (3, 7);

select lives_ok(
  $$insert into k_ids select 'outage', public.record_equipment_unavailability(
      (select id from k_ids where name = 'mic'), 99, 'Battery fault',
      now() + interval '1 day', now() + interval '2 days',
      array[(select id from k_ids where name = 'mic-3'), (select id from k_ids where name = 'mic-7')])$$,
  'an outage can name specific units'
);
select is(
  (select quantity from public.equipment_unavailability where id = (select id from k_ids where name = 'outage')),
  2,
  'the quantity is the number of units named'
);
select throws_ok(
  $$select public.record_equipment_unavailability(
      (select id from k_ids where name = 'mic'), 1, 'Overlap',
      now() + interval '36 hours', now() + interval '3 days',
      array[(select id from k_ids where name = 'mic-3')])$$,
  '23514', 'Already unavailable for part of this period: mic-3',
  'a unit cannot be out twice for an overlapping period'
);
select throws_ok(
  $$select public.record_equipment_unavailability(
      (select id from k_ids where name = 'fog'), 1, 'Wrong item',
      now() + interval '1 day', now() + interval '2 days',
      array[(select id from k_ids where name = 'mic-3')])$$,
  '23514', 'Choose in-service units of this equipment',
  'units must belong to the chosen item'
);

-- Retiring an item.
select lives_ok(
  $$select public.set_equipment_item_retired((select id from k_ids where name = 'fog'), true)$$,
  'an item can be retired'
);

select set_config('request.jwt.claims', '{"sub":"e4000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  format(
    $$select public.save_event_draft(
        '{"title":"Retired item test","equipment":[{"equipmentItemId":"%s","quantity":"1","requiredFrom":"2099-04-01T08:00:00+08:00","requiredUntil":"2099-04-01T14:00:00+08:00"}],"venue":{"facilities":[]},"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
      )$$,
    (select id from k_ids where name = 'fog')
  ),
  '23514', 'Fog machine (large) is no longer offered — choose other equipment',
  'a retired item cannot be chosen for an event'
);
select lives_ok(
  format(
    $$select public.save_event_draft(
        '{"title":"Active item test","equipment":[{"equipmentItemId":"%s","quantity":"1","requiredFrom":"2099-04-01T08:00:00+08:00","requiredUntil":"2099-04-01T14:00:00+08:00"}],"venue":{"facilities":[]},"registration":{"required":false,"waitlistEnabled":false}}'::jsonb
      )$$,
    (select id from k_ids where name = 'mic')
  ),
  'an item in service can still be chosen'
);
select is(
  (select count(*)::integer from public.equipment_items where id = (select id from k_ids where name = 'fog') and retired_at is not null),
  1,
  'organisers can still read a retired item, so existing events show it'
);

select * from finish();
rollback;
