-- Own migration: Postgres won't let a newly added enum value be referenced
-- in the same transaction that adds it — same reasoning as
-- 202610190003_safety_check_notification_type.sql.
alter type public.notification_type add value if not exists 'safety_check_decision';
