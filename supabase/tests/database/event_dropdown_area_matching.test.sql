begin;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data)
values ('e1000000-0000-0000-0000-000000000001', 'dropdown-venue-staff@example.test',
  '{"full_name":"Dropdown Venue Staff","role":"venue_staff"}'::jsonb);

select is((select count(*)::integer from public.venue_area_options), 67,
  'all organiser location choices exist in the database');
select ok(public.venue_matches_area('Bugis', array['Bugis'], '1 Beach Road'),
  'a tagged venue matches its selected area');
select ok(not public.venue_matches_area('Bugis', array['City Hall'], '1 Bugis Street'),
  'tags take priority over a misleading address');
select ok(public.venue_matches_area('Bugis', array[]::text[], '1 Bugis Street'),
  'an untagged venue temporarily matches by address');
select ok(not public.venue_matches_area('Bugis', array[]::text[], '1 Beach Road'),
  'an untagged venue does not match an unrelated area');
select ok(public.venue_matches_area('Old Campus', array[]::text[], 'Old Campus Block A'),
  'saved legacy location text still matches by address');
select ok(public.venue_matches_area('', array[]::text[], 'Anywhere'),
  'a blank preferred location does not restrict search');
select ok(public.venue_matches_area('bugis', array['Bugis'], 'Elsewhere'),
  'area matching is case insensitive');
select ok(not public.venue_matches_area('North', array['South'], 'North Street'),
  'a tagged venue cannot match another region by address');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.create_venue(
  '{"name":"Dropdown Test Venue","location":"1 Bugis Street","area_tags":["Bugis"],
    "capacity":30,"operating_hours":[{"days":["mon"],"opensAt":"09:00","closesAt":"18:00"}],
    "facilities":[],"layouts":["Theatre"]}'::jsonb)$$,
  'Venue Staff can create a tagged venue without amenities');

reset role;
select is((select area_tags from public.venues where name = 'Dropdown Test Venue'),
  array['Bugis'], 'the venue retains its area tag');
select is((select count(*)::integer from public.venue_facilities vf
  join public.venues v on v.id = vf.venue_id where v.name = 'Dropdown Test Venue'),
  0, 'a venue can have zero amenity rows');

select * from finish();
rollback;
