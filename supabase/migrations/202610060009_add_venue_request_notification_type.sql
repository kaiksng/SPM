-- Venue staff currently get no notification when a coordinator submits a
-- new venue booking request — only the decision (approve/reject) notifies
-- anyone today. This migration only adds the enum value: Postgres won't let
-- a newly added enum value be referenced in the same transaction that adds
-- it, so the RPC change that actually inserts these notifications is a
-- separate migration that runs after this one commits.
alter type public.notification_type add value 'venue_request';
