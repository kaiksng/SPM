-- Venue Catalogue: create/update a venue entry.
--
-- AC02 Each entry includes a unique venue name, location, positive
--      whole-number capacity, facilities, operating days and hours.
-- AC08 Submitting a venue name that already exists is rejected and
--      identified as a duplicate.
-- AC09 Each update records the staff member and time.
--
-- venues has never been written to by any real UI yet (VenuesPage was a
-- browse-only placeholder — see routes/VenuesPage.tsx before this story), so
-- tightening these columns now is safe: there is no existing data that could
-- violate them.
alter table public.venues
  alter column location set not null,
  alter column operating_hours set not null,
  alter column capacity set not null;

alter table public.venues
  add constraint venues_name_unique unique (name);

alter table public.venues
  add column updated_by uuid references public.profiles (id);

comment on column public.venues.updated_by is
  'AC09: the staff member who made the most recent update.';

-- Venue Booking Capacity Review: a later capacity reduction can leave an
-- already-approved (or still pending) booking over the venue's new capacity.
-- Distinct from venue_bookings.status, which is that booking's own
-- approval workflow — this is a separate flag raised after the fact by
-- public.update_venue (202609220010). Clearing it is out of scope for this
-- story; a human resolving the conflict is a natural follow-up.
alter table public.venue_bookings
  add column needs_review boolean not null default false,
  add column needs_review_reason text;

comment on column public.venue_bookings.needs_review is
  'AC06/AC07: set by public.update_venue when a capacity reduction leaves this booking''s event over the venue''s new capacity.';
