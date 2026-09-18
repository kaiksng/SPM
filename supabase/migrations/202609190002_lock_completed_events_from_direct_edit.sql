-- Close the same direct-table-update gap 202609150007 closed for
-- Confirmed/Rejected/Cancelled, now that Completed exists.
--
-- 202609170001 added the 'completed' status and 202609170002 added
-- complete_event as its only write path (confirmed -> completed, assigned
-- coordinator or admin only), but neither migration revisited
-- "coordinators manage assigned events" — that policy's exclusion list still
-- reads `status not in ('confirmed', 'rejected', 'cancelled')`, so a raw
-- `update events ...` issued directly against PostgREST still succeeds
-- against a Completed event today, the exact bypass 202609150007 exists to
-- prevent. update_event_as_coordinator itself is unaffected (it already
-- refuses anything but status = 'planning'); this is the same RLS-only gap.
drop policy if exists "coordinators manage assigned events" on public.events;

create policy "coordinators manage assigned events" on public.events
for update to authenticated
using (
  (assigned_coordinator_id = auth.uid() or public.current_user_role() = 'administrator'::public.user_role)
  and status not in ('confirmed', 'rejected', 'cancelled', 'completed')
)
with check (
  assigned_coordinator_id = auth.uid()
  or public.current_user_role() = 'administrator'::public.user_role
);
