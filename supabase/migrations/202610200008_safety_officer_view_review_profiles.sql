-- The Safety Officer's queue (listPendingSafetyCheckEvents) embeds the
-- organiser's and coordinator's profiles, and the event-history "Safety
-- check reviews" section embeds the reviewer's profile
-- (event_safety_check_decisions.decided_by) — both silently return null
-- under RLS today, since "profiles readable by owner and staff"
-- (202609060001) only grants event_coordinator/administrator, and no later
-- migration added a safety_officer case. Both names showed "Unknown".
--
-- Scoped to can_view_event, same as every other table a Safety Officer can
-- already read (202610200005) — deliberately pending_safety_check only, not
-- extended further: the Safety Officer's event-history view only ever opens
-- while reviewing, so it never needs to outlive that window.
create policy "safety officer views profiles tied to a review" on public.profiles
for select to authenticated using (
  public.current_user_role() = 'safety_officer'::public.user_role
  and (
    exists (
      select 1 from public.events e
      where (e.organiser_id = profiles.id or e.assigned_coordinator_id = profiles.id)
        and public.can_view_event(e.id)
    )
    or exists (
      select 1 from public.event_safety_check_decisions d
      where d.decided_by = profiles.id and public.can_view_event(d.event_id)
    )
  )
);
