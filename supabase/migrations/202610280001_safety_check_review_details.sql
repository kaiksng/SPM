-- SPM-90: the information a Safety Officer reviews before deciding an
-- event's Operational Safety Check. event_readiness only says whether each
-- booking/requirement is Complete or Needs Review; the Week 7 brief says
-- the review "considers expected attendance, venue capacity and layout,
-- emergency access, accessibility requirements, equipment placement, ...
-- and any known venue restrictions", so this returns the underlying facts.
--
-- Read-only, same access rule as event_readiness (can_view_event, which
-- already grants a Safety Officer the event while it is Pending Safety
-- Check). A booking's headcount is its own expected_headcount (SPM-85),
-- falling back to the event's expected attendance. venues has no
-- emergency-access or restrictions column, so the venue description and
-- accessibility notes are returned for the page to show under those
-- headings.
create or replace function public.safety_check_review_details(
  p_event_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_requirements public.event_venue_requirements;
  v_venues jsonb;
  v_equipment jsonb;
begin
  if not public.can_view_event(p_event_id, coalesce(p_actor_id, auth.uid())) then
    raise exception 'Event not found or you do not have access to it'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_event from public.events where id = p_event_id;
  select * into v_requirements from public.event_venue_requirements where event_id = p_event_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'bookingId', vb.id,
      'venueName', v.name,
      'location', v.location,
      'label', vb.label,
      'isMainVenue', vb.is_main_venue,
      'capacity', v.capacity,
      'headcount', coalesce(vb.expected_headcount, v_event.expected_attendance),
      'underCapacity',
        coalesce(vb.expected_headcount, v_event.expected_attendance) is not null
        and coalesce(vb.expected_headcount, v_event.expected_attendance) > v.capacity,
      'layouts', (
        select coalesce(jsonb_agg(l.layout_name order by l.layout_name), '[]'::jsonb)
        from public.venue_layouts l where l.venue_id = v.id
      ),
      'requestedLayoutNotes', vb.layout_notes,
      'requestedAccessibilityNotes', vb.accessibility_notes,
      'venueAccessibilityNotes', v.accessibility_notes,
      'venueDescription', v.description
    )
    order by vb.is_main_venue desc, vb.requested_at
  ), '[]'::jsonb)
  into v_venues
  from public.venue_bookings vb
  join public.venues v on v.id = vb.venue_id
  where vb.event_id = p_event_id
    and vb.status in ('pending', 'approved', 'on_hold');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'requirementId', r.id,
      'equipmentName', r.equipment_name,
      'quantity', r.quantity,
      'notes', r.notes
    )
    order by r.equipment_name
  ), '[]'::jsonb)
  into v_equipment
  from public.event_equipment_requirements r
  where r.event_id = p_event_id;

  return jsonb_build_object(
    'expectedAttendance', v_event.expected_attendance,
    'accessibilityNeeds', v_requirements.accessibility_notes,
    'layoutPreference', v_requirements.layout_notes,
    'venues', v_venues,
    'equipment', v_equipment
  );
end;
$$;

revoke all on function public.safety_check_review_details(uuid, uuid) from public, anon;
grant execute on function public.safety_check_review_details(uuid, uuid) to authenticated, service_role;
