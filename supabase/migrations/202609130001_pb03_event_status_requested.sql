-- PB-03 Submit an Event Request (AC05).
--
-- This migration contains nothing but the enum value on purpose. PostgreSQL
-- refuses to use an enum value that was added in the same transaction, and
-- Supabase runs each migration file in one transaction, so the function in
-- 202609130002 cannot be created alongside this statement.
--
-- The refined Product Backlog (PB-08 AC01) names the Release 1 statuses as
-- Draft, Requested, Planning, Confirmed, Completed, Rejected and Cancelled.
-- PB-03 only needs Requested. The remaining alignment (retiring 'submitted',
-- 'under_review' and 'approved' in favour of 'planning' and 'completed')
-- belongs to PB-08 so that this story stays reviewable on its own.

alter type public.event_status add value if not exists 'requested' after 'draft';
