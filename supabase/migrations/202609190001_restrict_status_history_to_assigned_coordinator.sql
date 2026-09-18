-- SPM-09 AC02: a coordinator who isn't assigned to an event must not see its
-- change history. event_status_history's original policy (202609060001) used
-- can_view_event(), which deliberately lets ANY event_coordinator-role user
-- see ANY event (documented at 202609140001/202609140003) — that's the right
-- call for venue/technical staff who have no per-event assignment column to
-- scope by, but it's too broad for this table specifically. This mirrors
-- 202609150005's own reasoning for event_field_changes: a narrower,
-- table-specific policy instead of touching the shared function, since
-- event_status_history has exactly one consumer (the event detail/history
-- pages) and no other feature depends on its current broad visibility.
drop policy "history visible to event participants" on public.event_status_history;

create policy "history visible to organiser and assigned coordinator" on public.event_status_history
for select to authenticated using (
  exists (
    select 1 from public.events e
    where e.id = event_status_history.event_id
      and (
        e.organiser_id = auth.uid()
        or e.assigned_coordinator_id = auth.uid()
        or public.current_user_role() = 'administrator'::public.user_role
      )
  )
);
