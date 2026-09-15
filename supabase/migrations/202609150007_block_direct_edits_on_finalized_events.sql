-- Block Direct Edits on Finalized (Confirmed/Rejected/Cancelled) Events.
--
-- "As an Event Coordinator, I want direct edits to Confirmed events blocked,
-- so that changes to finalized events go through a controlled change-request
-- process instead."
--
-- AC01 Any direct edit attempt on a Confirmed event is blocked, regardless
--      of who initiates it (organiser or coordinator).
-- AC02 The user is shown a message pointing them to the change-request flow.
-- AC03 The blocked attempt is not logged as an accepted change.
--
-- AC01/AC03 for the organiser were already fully enforced before this
-- migration: save_event_draft's own status gate and every requirement
-- table's RLS policy only ever allowed 'draft'/'requested'/
-- 'clarification_requested' — 'confirmed' was never in that list.
--
-- The coordinator side had a real gap: "coordinators manage assigned
-- events" (202609060001) grants UPDATE on the whole `events` row with no
-- status condition at all. update_event_as_coordinator
-- (202609150006) is SECURITY DEFINER and enforces its own "status =
-- planning" check regardless of RLS, so the RPC itself was never the
-- problem — but this policy independently let the assigned coordinator (or
-- an administrator) issue a raw `update events ...` directly against
-- PostgREST, bypassing that RPC and its check entirely. Narrowing this
-- policy closes that path; AC03 then follows for free, the same way it
-- already does elsewhere in this codebase: a write RLS denies (or a
-- SECURITY DEFINER function's own check rejects) never reaches the table,
-- so the PB-07 trigger that would log a change never fires.
--
-- 'rejected' and 'cancelled' are included alongside 'confirmed' for the
-- same reason: both are equally terminal states with nothing further to
-- plan, and the story's own reasoning ("finalized events go through a
-- controlled change-request process instead") applies just as much to them.
-- Reassignment-prevention (PB-04's events_prevent_coordinator_reassignment
-- trigger, tested against a 'requested' event) is unaffected — 'requested'
-- remains permitted here.
drop policy if exists "coordinators manage assigned events" on public.events;

create policy "coordinators manage assigned events" on public.events
for update to authenticated
using (
  (assigned_coordinator_id = auth.uid() or public.current_user_role() = 'administrator'::public.user_role)
  and status not in ('confirmed', 'rejected', 'cancelled')
)
with check (
  assigned_coordinator_id = auth.uid()
  or public.current_user_role() = 'administrator'::public.user_role
);
