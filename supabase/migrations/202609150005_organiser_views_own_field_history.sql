-- The clarification history (ClarificationPanel, shown to both the
-- organiser and the assigned coordinator) now names the exact field(s)
-- edited in response to each round, with previous/new values, pulled from
-- PB-07's event_field_changes. That table's only policy so far restricts
-- reads to the assigned coordinator (or an administrator) — deliberately
-- narrower than can_view_event, per 202609150003.
--
-- This adds one more, equally narrow case: an organiser reading the change
-- history of their own event. This is not the same as opening PB-07's
-- general Planning-only "Change history" panel to organisers (that stays
-- coordinator-only, as decided) — it is the organiser seeing a record of
-- edits they themselves just made, in the same clarification round they are
-- looking at. They already have full write access to these fields; this
-- only grants reading back what they wrote.
create policy "organiser views own event's field change history" on public.event_field_changes
for select to authenticated using (
  exists (
    select 1 from public.events e
    where e.id = event_field_changes.event_id
      and e.organiser_id = auth.uid()
  )
);
