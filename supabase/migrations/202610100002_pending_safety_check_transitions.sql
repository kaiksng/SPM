-- Enforce Revised Event Lifecycle Transitions (continued from 202610100001:
-- a newly added enum value can't be referenced in the same transaction it
-- was added in, so the transition map update is a separate migration).
--
-- Supported statuses: Draft, Requested, Planning, Pending Safety Check,
-- Confirmed, Completed, Rejected, Cancelled.
create or replace function public.event_status_transition_allowed(
  from_status public.event_status,
  to_status public.event_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case from_status
    when 'draft' then to_status in ('requested', 'cancelled')
    when 'requested' then to_status in ('planning', 'rejected', 'cancelled')
    when 'submitted' then false
    when 'clarification_requested' then to_status in ('requested', 'cancelled')
    when 'under_review' then false
    when 'planning' then to_status in ('pending_safety_check', 'cancelled')
    when 'approved' then to_status in ('confirmed', 'cancelled')
    when 'pending_safety_check' then to_status in ('confirmed', 'planning', 'cancelled')
    when 'rejected' then false
    when 'confirmed' then to_status in ('planning', 'completed', 'cancelled')
    when 'completed' then false
    when 'cancelled' then false
  end;
$$;
