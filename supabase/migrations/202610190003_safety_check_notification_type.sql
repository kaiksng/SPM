-- A notification for Safety Officers when an event is submitted for the
-- Operational Safety Check (AC05). Alone in its own migration: Postgres
-- won't let a newly added enum value be referenced in the same transaction
-- that adds it (same pattern as 202610070001).
alter type public.notification_type add value if not exists 'safety_check_requested';
