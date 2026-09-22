-- profiles.email: profiles previously carried no contact field of its own,
-- relying on auth.users.email (not directly queryable through the app's
-- normal RLS-gated client). handle_new_user is updated to populate it at
-- signup time, same as full_name/role already are.
alter table public.profiles add column email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'attendee'::public.user_role)
  );
  return new;
end;
$$;

-- events.venue_id: direct pointer to the venue once a booking is approved,
-- so reading an event's venue doesn't require joining through venue_bookings
-- and filtering by status. venue_bookings (202609220004) remains the
-- request/decision history, including rejected attempts.
alter table public.events add column venue_id uuid references public.venues (id);

create index events_venue_idx on public.events (venue_id);
