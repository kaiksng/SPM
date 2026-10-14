-- SPM-82: a replacement venue booking is linked to the disrupted booking it
-- replaces. Both are active at the same time until Venue Staff approve the
-- replacement, so the one-active-booking-per-event rule must not count a
-- replacement; a unique index below keeps it to one active replacement per
-- disrupted booking instead.
alter table public.venue_bookings
  add column replaces_booking_id uuid references public.venue_bookings (id),
  -- Which of an event's venues is its main one (the auditorium, not a
  -- breakout room). Every booking is the main venue until multiple venues per
  -- event exist (SPM-85); a replacement keeps the original's flag.
  add column is_main_venue boolean not null default true;

comment on column public.venue_bookings.replaces_booking_id is
  'SPM-82: the disrupted booking this booking was requested to replace.';

alter table public.venue_bookings
  drop constraint venue_bookings_one_active_per_event;

alter table public.venue_bookings
  add constraint venue_bookings_one_active_per_event
  exclude using gist (
    event_id with =
  ) where (
    status = any (array['pending', 'approved', 'on_hold']::public.request_status[])
    and replaces_booking_id is null
  );

create unique index venue_bookings_one_active_replacement_idx
  on public.venue_bookings (replaces_booking_id)
  where replaces_booking_id is not null
    and status in ('pending', 'approved', 'on_hold');

create index venue_bookings_replaces_booking_idx
  on public.venue_bookings (replaces_booking_id)
  where replaces_booking_id is not null;
