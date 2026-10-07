-- Venue Staff currently has no way to know a hold was confirmed (so it's
-- back in their queue to decide) or that a request was withdrawn (so the
-- slot is free again) without manually checking the Requests page.
-- Postgres won't let a newly added enum value be referenced in the same
-- transaction that adds it, so the RPC changes that actually use these are
-- a separate migration that runs after this one commits (same pattern as
-- 202610070001/202610070003).
alter type public.notification_type add value 'venue_hold_confirmed';
alter type public.notification_type add value 'venue_request_withdrawn';
