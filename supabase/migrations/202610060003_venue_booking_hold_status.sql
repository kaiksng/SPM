-- New request_status values for placing a tentative hold on an already-
-- submitted venue booking request (not a standalone reservation — see
-- 202610060004 for the actual hold logic).
--
-- This has to be its own migration: Postgres refuses to use a newly added
-- enum value inside the same transaction that added it ("unsafe use of new
-- value of enum type"), and each migration file runs in one transaction.
alter type public.request_status add value 'on_hold';
alter type public.request_status add value 'expired';
