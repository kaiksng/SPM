-- Mirrors venue_bookings.needs_review/needs_review_reason (202609220009) —
-- equipment requirements have no equivalent flag today, so a Safety
-- Officer's "Request Changes"/"Reject" decision has nothing to set on the
-- equipment side. Deliberately a new column, not a repurposed status value
-- on equipment_arrangement_updates (that log belongs to Technical Support
-- Staff and has different ownership/semantics — 'issue' already means
-- something else).
alter table public.event_equipment_requirements
  add column needs_review boolean not null default false,
  add column needs_review_reason text;

comment on column public.event_equipment_requirements.needs_review is
  'Set by public.decide_event_safety_check when a Safety Officer requests changes or rejects, flagging this requirement for coordinator rework.';
