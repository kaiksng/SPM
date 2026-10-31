begin;

select plan(10);

-- Optional event banner (202610300010_event_banners.sql).

insert into auth.users (id, email, raw_user_meta_data)
values
  ('ba000000-0000-0000-0000-000000000001', 'banner-organiser@example.test', '{"full_name":"Banner Organiser","role":"event_organiser"}'::jsonb),
  ('ba000000-0000-0000-0000-000000000002', 'banner-other@example.test', '{"full_name":"Other Organiser","role":"event_organiser"}'::jsonb),
  ('ba000000-0000-0000-0000-000000000003', 'banner-coordinator@example.test', '{"full_name":"Banner Coordinator","role":"event_coordinator"}'::jsonb);

-- Confirmed: the banner can change at any stage.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values ('ba000000-0000-0000-0000-0000000000e1', 'ba000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000003',
        'Banner Expo', 'confirmed', '2099-12-01T10:00:00+08:00', '2099-12-01T14:00:00+08:00');

-- Uploaded files (as the storage API would record them).
insert into storage.objects (bucket_id, name)
values
  ('event-banners', 'ba000000-0000-0000-0000-000000000001/expo.png'),
  ('event-banners', 'ba000000-0000-0000-0000-000000000002/theirs.png');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ba000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  public.set_event_banner('ba000000-0000-0000-0000-0000000000e1', 'ba000000-0000-0000-0000-000000000001/expo.png'),
  'ba000000-0000-0000-0000-000000000001/expo.png',
  'the organiser sets a banner they uploaded, even on a Confirmed event'
);
select is(
  (select banner_path from public.events where id = 'ba000000-0000-0000-0000-0000000000e1'),
  'ba000000-0000-0000-0000-000000000001/expo.png',
  'the event records it'
);
select throws_ok(
  $$select public.set_event_banner('ba000000-0000-0000-0000-0000000000e1', 'ba000000-0000-0000-0000-000000000002/theirs.png')$$,
  '23514', 'Upload the banner image first',
  'another organiser''s upload cannot be used'
);
select throws_ok(
  $$select public.set_event_banner('ba000000-0000-0000-0000-0000000000e1', 'ba000000-0000-0000-0000-000000000001/missing.png')$$,
  '23514', 'Upload the banner image first',
  'a file that was never uploaded cannot be used'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-banners', 'ba000000-0000-0000-0000-000000000002/sneaky.png')$$,
  '42501', null,
  'an organiser cannot upload into another organiser''s folder'
);

select set_config('request.jwt.claims', '{"sub":"ba000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.set_event_banner('ba000000-0000-0000-0000-0000000000e1', null)$$,
  '42501', 'Only the event''s organiser can change its banner',
  'another organiser cannot change the banner'
);

select set_config('request.jwt.claims', '{"sub":"ba000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.set_event_banner('ba000000-0000-0000-0000-0000000000e1', null)$$,
  '42501', 'Only the event''s organiser can change its banner',
  'the coordinator cannot change the banner'
);

select set_config('request.jwt.claims', '{"sub":"ba000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  public.set_event_banner('ba000000-0000-0000-0000-0000000000e1', null),
  null,
  'the organiser can remove the banner'
);
reset role;
select is(
  (select banner_path from public.events where id = 'ba000000-0000-0000-0000-0000000000e1'),
  null,
  'the event no longer has one'
);

select is(
  (select count(*)::int from public.event_field_changes where event_id = 'ba000000-0000-0000-0000-0000000000e1'),
  0,
  'setting and removing a banner is not part of the event''s change history'
);

select * from finish();
rollback;
