-- Read path for auto_reassign_event_coordinator's audit trail (PB-04-adjacent
-- self-service reassignment, see 202610010001). audit_logs has RLS enabled
-- with no policies at all, so this security definer function is the only way
-- to read the rows it wrote — same shape as can_view_event itself and the
-- read functions the parallel feature/coordinator-reassignment branch uses
-- for its own event_coordinator_assignments table.
create or replace function public.list_auto_event_coordinator_reassignments(p_event_id uuid)
returns table (
  id bigint,
  previous_coordinator_id uuid,
  previous_coordinator_name text,
  new_coordinator_id uuid,
  new_coordinator_name text,
  reason text,
  changed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    (a.details->>'previousCoordinatorId')::uuid,
    prev_p.full_name,
    (a.details->>'newCoordinatorId')::uuid,
    new_p.full_name,
    a.details->>'reason',
    a.created_at
  from public.audit_logs a
  left join public.profiles prev_p on prev_p.id = (a.details->>'previousCoordinatorId')::uuid
  left join public.profiles new_p on new_p.id = (a.details->>'newCoordinatorId')::uuid
  where a.entity_type = 'event'
    and a.entity_id = p_event_id
    and a.action = 'event_coordinator_reassigned'
    and public.can_view_event(p_event_id)
  order by a.created_at asc;
$$;

revoke all on function public.list_auto_event_coordinator_reassignments(uuid) from public;
grant execute on function public.list_auto_event_coordinator_reassignments(uuid) to authenticated;
