begin;

select plan(4);

select is(
  (select array_agg(enumlabel::text order by enumsortorder)
   from pg_enum
   where enumtypid = 'public.user_role'::regtype),
  array[
    'event_organiser',
    'event_coordinator',
    'venue_staff',
    'technical_support_staff',
    'attendee'
  ],
  'user_role has no administrator value'
);

select is(
  (select count(*)::int
   from pg_policies
   where schemaname = 'public'
     and (qual ilike '%administrator%' or with_check ilike '%administrator%')),
  0,
  'no RLS policy references the administrator role'
);

select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ilike '%administrator%'),
  0,
  'no public function references the administrator role'
);

-- handle_new_user casts the signup metadata role straight to user_role, so a
-- direct auth signup asking for it is rejected rather than silently granted.
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values (
      'a1000000-0000-0000-0000-000000000001',
      'no-admin@example.test',
      '{"full_name":"No Admin","role":"administrator"}'::jsonb
    )$$,
  '22P02',
  null,
  'signing up with the administrator role is rejected'
);

select * from finish();

rollback;
