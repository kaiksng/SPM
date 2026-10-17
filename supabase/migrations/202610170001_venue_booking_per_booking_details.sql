-- SPM-85: an event can have several venue bookings (a main hall plus breakout
-- rooms). Each booking carries its own label, headcount and requirements, so a
-- room is checked against what that booking needs rather than the event's total
-- attendance. Its period already lives on the booking (starts_at / ends_at).
alter table public.venue_bookings
  add column label text not null default 'Main Programme',
  add column expected_headcount integer,
  add column layout_notes text,
  add column accessibility_notes text,
  add column required_facilities text[] not null default '{}';

alter table public.venue_bookings
  add constraint venue_bookings_headcount_positive
  check (expected_headcount is null or expected_headcount > 0),
  add constraint venue_bookings_label_not_blank
  check (length(trim(label)) > 0);

comment on column public.venue_bookings.label is
  'SPM-85: the booking''s own name, e.g. Main Programme or Breakout 1.';
comment on column public.venue_bookings.expected_headcount is
  'SPM-85: how many people this venue must hold. A venue is suitable only if its capacity is at least this.';

-- Existing bookings were all the event's single (main) venue, so they take the
-- event's own attendance and requirements.
update public.venue_bookings vb
set expected_headcount = e.expected_attendance,
    layout_notes = r.layout_notes,
    accessibility_notes = r.accessibility_notes,
    required_facilities = coalesce(
      (select array_agg(erf.facility_name order by erf.facility_name)
       from public.event_required_facilities erf where erf.event_id = vb.event_id),
      '{}')
from public.events e
left join public.event_venue_requirements r on r.event_id = e.id
where e.id = vb.event_id;

-- An event may now hold several active bookings, so the one-active-booking
-- rule goes. What must stay true is that exactly one of the active, non-
-- replacement bookings is the event's main venue (a replacement carries its
-- original's flag while both exist, so it is excluded).
alter table public.venue_bookings
  drop constraint venue_bookings_one_active_per_event;

create unique index venue_bookings_one_main_per_event_idx
  on public.venue_bookings (event_id)
  where is_main_venue
    and replaces_booking_id is null
    and status in ('pending', 'approved', 'on_hold');
