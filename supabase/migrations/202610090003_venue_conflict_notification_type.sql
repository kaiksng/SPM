-- Two notification types for the conflict re-check flow: a booking newly
-- flagged, and one previously flagged that's now cleared. Postgres won't
-- let a newly added enum value be referenced in the same transaction that
-- adds it, so the table/function that actually use these are a separate
-- migration that runs after this one commits.
alter type public.notification_type add value 'venue_conflict_flagged';
alter type public.notification_type add value 'venue_conflict_resolved';
