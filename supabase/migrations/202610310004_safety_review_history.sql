-- SPM-89 AC04 / SPM-90 AC04: retain a readable safety-review record after
-- the event leaves Pending Safety Check. This purpose-built read does not
-- broaden can_view_event or any table's RLS access.
create function public.safety_check_review_history(
  p_decision_id bigint default null,
  p_event_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 100
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'safety_officer'::public.user_role then
    raise exception 'Only Safety Officers can view safety review history' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Enter a valid history page' using errcode = '23514';
  end if;
  return (
    select coalesce(jsonb_agg(page.record order by page.decided_at desc, page.id desc), '[]'::jsonb)
    from (
      select d.id, d.decided_at, jsonb_build_object(
        'decisionId', d.id, 'eventId', e.id, 'title', e.title,
        'currentStatus', e.status,
        'currentRound', (select max(s2.round) from public.event_safety_check_submissions s2 where s2.event_id = e.id),
        'round', s.round, 'submittedAt', s.submitted_at,
        'coordinatorName', coordinator.full_name,
        'outcome', d.outcome, 'reason', d.reason,
        'reviewerName', reviewer.full_name, 'decidedAt', d.decided_at,
        'flaggedBookingIds', d.flagged_booking_ids,
        'flaggedRequirementIds', d.flagged_requirement_ids,
        'venuesSnapshot', s.venues_snapshot, 'equipmentSnapshot', s.equipment_snapshot,
        'periodSnapshot', s.period_snapshot, 'attendanceSnapshot', s.attendance_snapshot
      ) as record
      from public.event_safety_check_decisions d
      join public.event_safety_check_submissions s on s.id = d.submission_id and s.event_id = d.event_id
      join public.events e on e.id = d.event_id
      left join public.profiles reviewer on reviewer.id = d.decided_by
      left join public.profiles coordinator on coordinator.id = s.coordinator_id
      where (p_decision_id is null or d.id = p_decision_id)
        and (p_event_id is null or d.event_id = p_event_id)
      order by d.decided_at desc, d.id desc
      offset p_offset limit p_limit
    ) page
  );
end;
$$;
revoke all on function public.safety_check_review_history(bigint, uuid, integer, integer) from public, anon;
grant execute on function public.safety_check_review_history(bigint, uuid, integer, integer) to authenticated;
