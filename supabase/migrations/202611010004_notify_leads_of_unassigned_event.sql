-- SPM-81: the Event Coordinator Lead is told when a new event needs a
-- coordinator.
--
-- Since the Lead took over assignment (202610050003), a submitted event
-- waits in the Lead's Unassigned queue with no coordinator, and nobody was
-- notified: the notification the auto-assigned coordinator used to get was
-- removed with the auto-assignment. Now every Lead is notified when an
-- organiser submits an event (Draft -> Requested) that has no coordinator.
-- A resubmission after a clarification is not a new event and already has
-- a coordinator, so it notifies no one.
--
-- A trigger rather than a change to submit_event_request, so every way an
-- event is submitted is covered. Security definer: notifications have no
-- insert policy, and the organiser's own role can't read the Leads.
create or replace function public.notify_leads_of_unassigned_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'requested'
    and old.status = 'draft'
    and new.assigned_coordinator_id is null
  then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      new.id,
      'event_awaiting_assignment'::public.notification_type,
      'New event needs a coordinator',
      '"' || new.title || '" was submitted by '
        || coalesce((select full_name from public.profiles where id = new.organiser_id), 'an organiser')
        || ' and needs an Event Coordinator.'
    from public.profiles p
    where p.role = 'event_coordinator_lead'::public.user_role;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_leads_of_unassigned_event() from public, anon, authenticated;

create trigger events_notify_leads_of_unassigned_event
after update of status on public.events
for each row
execute function public.notify_leads_of_unassigned_event();
