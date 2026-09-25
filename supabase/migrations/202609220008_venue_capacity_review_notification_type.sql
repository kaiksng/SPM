-- Venue Catalogue AC06: notifies the assigned coordinator when a venue
-- capacity reduction leaves one of their bookings over-capacity.
--
-- Own migration file on purpose: Postgres refuses to reference an enum value
-- added earlier in the same transaction, and Supabase runs each migration
-- file in one transaction — same reason 202609220001 gave for its five
-- additions, and 'requested'/'planning'/'completed' before that.
alter type public.notification_type add value if not exists 'venue_capacity_review';
