-- Three notification types for the tentative-hold flow: an immediate
-- "placed" notice, a 24-hours-before nudge, and an at-expiry notice.
-- Postgres won't let a newly added enum value be referenced in the same
-- transaction that adds it, so the schema/RPC changes that actually use
-- these are a separate migration that runs after this one commits (same
-- pattern as 202610060009).
alter type public.notification_type add value if not exists 'venue_hold_expiring_soon';
alter type public.notification_type add value if not exists 'venue_hold_expired';
alter type public.notification_type add value if not exists 'venue_hold_placed';
