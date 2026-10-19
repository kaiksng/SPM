begin;

select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values ('e2000000-0000-0000-0000-000000000001', 'custom-layout-staff@example.test',
  '{"full_name":"Custom Layout Staff","role":"venue_staff"}'::jsonb);

select is((select data_type from information_schema.columns
  where table_schema = 'public' and table_name = 'venue_layouts' and column_name = 'layout_name'),
  'text', 'room layout names are stored as text');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.create_venue(
  '{"name":"Custom Layout Test Venue","location":"Bugis","area_tags":["Bugis"],
    "capacity":30,"operating_hours":[{"days":["mon"],"opensAt":"09:00","closesAt":"18:00"}],
    "facilities":[],"layouts":["U-shape"]}'::jsonb)$$,
  'Venue Staff can create a venue with a single custom layout');

reset role;
select is((select count(*)::integer from public.venue_layouts vl
  join public.venues v on v.id = vl.venue_id
  where v.name = 'Custom Layout Test Venue' and vl.layout_name = 'U-shape'),
  1, 'the custom layout is stored for catalogue matching');

set local role authenticated;
select throws_ok(
  $$select public.create_venue(
    '{"name":"Two Layout Test Venue","location":"Bugis","area_tags":["Bugis"],
      "capacity":30,"operating_hours":[{"days":["mon"],"opensAt":"09:00","closesAt":"18:00"}],
      "facilities":[],"layouts":["Theatre","U-shape"]}'::jsonb)$$,
  '23514',
  'This venue is not ready to save',
  'a venue can no longer be created with more than one layout'
);

select * from finish();
rollback;
