-- SPM-85 slice 3: the event history shows when a booking became the event's main
-- venue. The first booking is main from the moment it is requested; a later
-- change (set_main_venue_booking) stamps the new main booking.
alter table public.venue_bookings add column main_designated_at timestamptz;

comment on column public.venue_bookings.main_designated_at is
  'SPM-85: when this booking last became the event''s main venue; null while it is not main.';

update public.venue_bookings
set main_designated_at = requested_at
where is_main_venue and replaces_booking_id is null;

create or replace function public.stamp_venue_booking_main_designated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_main_venue then
    if tg_op = 'INSERT' or not old.is_main_venue then
      new.main_designated_at := now();
    end if;
  else
    new.main_designated_at := null;
  end if;
  return new;
end;
$$;

create trigger venue_bookings_stamp_main_designated_at
before insert or update of is_main_venue on public.venue_bookings
for each row execute function public.stamp_venue_booking_main_designated_at();
