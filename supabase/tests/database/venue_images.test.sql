begin;

select plan(8);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e3000000-0000-0000-0000-000000000001', 'venue-image-staff@example.test',
    '{"full_name":"Venue Image Staff","role":"venue_staff"}'::jsonb),
  ('e3000000-0000-0000-0000-000000000002', 'venue-image-organiser@example.test',
    '{"full_name":"Venue Image Organiser","role":"event_organiser"}'::jsonb);

select ok(
  (select public from storage.buckets where id = 'venue-images'),
  'the venue-images bucket is public'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e3000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok($$select public.create_venue(
  '{"name":"Venue Image Test Venue","location":"Bugis","area_tags":["Bugis"],
    "capacity":30,"operating_hours":[{"days":["mon"],"opensAt":"09:00","closesAt":"18:00"}],
    "facilities":[],"layouts":["Theatre"],
    "image_url":"https://example.test/venue-images/photo.jpg"}'::jsonb)$$,
  'Venue Staff can create a venue with a photo'
);

reset role;
select is(
  (select image_url from public.venues where name = 'Venue Image Test Venue'),
  'https://example.test/venue-images/photo.jpg',
  'the photo url is stored on creation'
);

set local role authenticated;
select lives_ok(
  format(
    $$select public.update_venue(%L::uuid,
      '{"name":"Venue Image Test Venue","location":"Bugis","area_tags":["Bugis"],
        "capacity":30,"operating_hours":[{"days":["mon"],"opensAt":"09:00","closesAt":"18:00"}],
        "facilities":[],"layouts":["Theatre"],"image_url":""}'::jsonb)$$,
    (select id from public.venues where name = 'Venue Image Test Venue')
  ),
  'Venue Staff can clear a venue''s photo'
);

reset role;
select is(
  (select image_url from public.venues where name = 'Venue Image Test Venue'),
  null,
  'the photo url is cleared when the venue is saved with none'
);

-- Storage RLS: only Venue Staff can upload to the venue-images bucket; an
-- organiser cannot, even though reads are public.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e3000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('venue-images', 'not-allowed.jpg')$$,
  '42501',
  null,
  'an organiser cannot upload to the venue-images bucket'
);

select set_config('request.jwt.claims',
  '{"sub":"e3000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('venue-images', 'allowed.jpg')$$,
  'Venue Staff can upload to the venue-images bucket'
);

reset role;
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'venue-images' and name = 'allowed.jpg'),
  1,
  'the uploaded object is stored'
);

select * from finish();
rollback;
