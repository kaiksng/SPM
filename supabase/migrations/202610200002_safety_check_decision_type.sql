-- Own migration: a newly added enum value (and here, a newly created enum
-- type is fine to use immediately, but the table that uses it is still kept
-- in a separate migration for clarity and to match this codebase's
-- convention of one concept per migration).
--
-- Three-valued now, not two, even though this story (Request Changes /
-- Reject) only ever writes 'changes_requested'/'rejected' — 'approved' is
-- included so the not-yet-built Approve story can write to this same table
-- instead of needing a second one later.
create type public.event_safety_check_decision_type as enum (
  'approved',
  'changes_requested',
  'rejected'
);
