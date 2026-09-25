-- Extends notification_type for triggers the current four values can't
-- represent: venue booking decisions, event changes, registration updates,
-- and event confirmation/cancellation (all named in "Notification System").
--
-- Own migration file on purpose: Postgres refuses to reference an enum value
-- added earlier in the same transaction, and Supabase runs each migration
-- file in one transaction — same reason 'requested'/'planning'/'completed'
-- each got their own file (202609130001, 202609150001, 202609170001).
alter type public.notification_type add value if not exists 'venue_decision';
alter type public.notification_type add value if not exists 'event_change';
alter type public.notification_type add value if not exists 'registration_update';
alter type public.notification_type add value if not exists 'confirmation';
alter type public.notification_type add value if not exists 'cancellation';
