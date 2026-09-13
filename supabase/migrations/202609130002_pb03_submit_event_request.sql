-- PB-03 Submit an Event Request.
--
-- AC01 The request records event name, purpose, description, proposed date,
--      valid start and end time, and positive whole-number expected attendance.
-- AC02 Venue, accessibility, equipment, technical and registration needs are
--      recorded, or each optional requirement is marked Not Required.
-- AC04 After submission the organiser can view the submission date and time.
-- AC05 A valid submission becomes Requested and is available for assignment.
-- AC06 An invalid submission is blocked and every affected field is identified.
-- AC07 Pre-approval organiser edits record the change, the actor and the time.

alter table public.events
  add column if not exists submitted_by uuid references public.profiles (id);

-- AC02. The organiser explicitly confirms that every optional requirement is
-- either provided or deliberately not required. Without this flag an empty
-- equipment list is indistinguishable from an unanswered question.
alter table public.events
  add column if not exists requirements_acknowledged boolean not null default false;

comment on column public.events.submitted_by is
  'PB-03 AC07: the organiser who submitted the request.';
comment on column public.events.requirements_acknowledged is
  'PB-03 AC02: organiser confirmed each optional requirement is provided or Not Required.';

-- AC05. Draft may now become Requested. The pre-existing arms are deliberately
-- left in place; retiring 'submitted', 'under_review' and 'approved' is PB-08's
-- scope, and removing them here would break work already in flight.
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
    when 'draft' then to_status in ('requested', 'submitted', 'cancelled')
    when 'requested' then to_status in ('clarification_requested', 'under_review', 'approved', 'rejected', 'cancelled')
    when 'submitted' then to_status in ('clarification_requested', 'under_review', 'cancelled')
    when 'clarification_requested' then to_status in ('requested', 'submitted', 'cancelled')
    when 'under_review' then to_status in ('clarification_requested', 'approved', 'rejected', 'cancelled')
    when 'approved' then to_status in ('confirmed', 'cancelled')
    when 'rejected' then false
    when 'confirmed' then to_status = 'cancelled'
    when 'cancelled' then false
  end;
$$;

-- AC07. A Requested event may still be edited by its organiser before approval.
-- PB-07 decides which individual fields are editable; this policy only widens
-- the status gate.
drop policy if exists "organisers edit their drafts" on public.events;
create policy "organisers edit their drafts" on public.events
for update to authenticated
using (organiser_id = auth.uid() and status in ('draft', 'requested', 'clarification_requested'))
with check (organiser_id = auth.uid());

-- Child requirement tables follow the same rule so that an organiser can still
-- correct venue, facility, equipment and registration details before approval.
drop policy if exists "event details editable by organiser" on public.event_venue_requirements;
create policy "event details editable by organiser" on public.event_venue_requirements
for all to authenticated using (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'requested', 'clarification_requested'))
) with check (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'requested', 'clarification_requested'))
);

drop policy if exists "facilities editable by organiser" on public.event_required_facilities;
create policy "facilities editable by organiser" on public.event_required_facilities
for all to authenticated using (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'requested', 'clarification_requested'))
) with check (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'requested', 'clarification_requested'))
);

drop policy if exists "equipment editable by organiser" on public.event_equipment_requirements;
create policy "equipment editable by organiser" on public.event_equipment_requirements
for all to authenticated using (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'requested', 'clarification_requested'))
) with check (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'requested', 'clarification_requested'))
);

drop policy if exists "registration editable by organiser" on public.event_registration_requirements;
create policy "registration editable by organiser" on public.event_registration_requirements
for all to authenticated using (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'requested', 'clarification_requested'))
) with check (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'requested', 'clarification_requested'))
);

create or replace function public.submit_event_request(
  p_event_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_role public.user_role;
  event_row public.events;
  venue_row public.event_venue_requirements;
  registration_row public.event_registration_requirements;
  issues jsonb := '[]'::jsonb;
begin
  -- Resolve the actor. An authenticated caller is always themselves: the
  -- p_actor_id argument exists for the service-role backend route, and
  -- allowing a signed-in user to pass someone else's id would be an
  -- impersonation hole in a security definer function.
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot submit an event request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to submit an event request'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role is distinct from 'event_organiser'::public.user_role then
    raise exception 'Only Event Organisers can submit event requests'
      using errcode = 'insufficient_privilege';
  end if;

  -- The row lock is what makes a concurrent double submission safe: the second
  -- transaction waits, then finds the status is no longer 'draft'.
  select * into event_row
  from public.events
  where id = p_event_id
    and organiser_id = actor_id
    and status = 'draft'
  for update;

  if not found then
    raise exception 'Event request not found or cannot be submitted'
      using errcode = 'insufficient_privilege';
  end if;

  select * into venue_row
  from public.event_venue_requirements
  where event_id = p_event_id;

  select * into registration_row
  from public.event_registration_requirements
  where event_id = p_event_id;

  -- AC06. Every failure is collected before any is reported, so the organiser
  -- fixes the whole form once instead of discovering one field at a time. The
  -- field names match the zod paths in packages/shared so the frontend can
  -- highlight them with the same FieldErrors map it uses for local validation.
  if char_length(trim(coalesce(event_row.title, ''))) < 3
    or char_length(trim(coalesce(event_row.title, ''))) > 160
  then
    issues := issues || jsonb_build_object(
      'field', 'title',
      'message', 'Event name must contain between 3 and 160 characters');
  end if;

  if coalesce(trim(event_row.purpose), '') = '' then
    issues := issues || jsonb_build_object(
      'field', 'purpose',
      'message', 'Describe the purpose of the event before submitting');
  end if;

  if coalesce(trim(event_row.description), '') = '' then
    issues := issues || jsonb_build_object(
      'field', 'description',
      'message', 'Describe the event before submitting');
  end if;

  if event_row.starts_at is null then
    issues := issues || jsonb_build_object(
      'field', 'startsAt',
      'message', 'Enter the proposed start date and time');
  elsif event_row.starts_at <= now() then
    issues := issues || jsonb_build_object(
      'field', 'startsAt',
      'message', 'The proposed start date and time must be in the future');
  end if;

  if event_row.ends_at is null then
    issues := issues || jsonb_build_object(
      'field', 'endsAt',
      'message', 'Enter the proposed end date and time');
  elsif event_row.starts_at is not null and event_row.ends_at <= event_row.starts_at then
    issues := issues || jsonb_build_object(
      'field', 'endsAt',
      'message', 'End time must be after the start time');
  end if;

  if event_row.expected_attendance is null then
    issues := issues || jsonb_build_object(
      'field', 'expectedAttendance',
      'message', 'Enter the expected attendance');
  elsif event_row.expected_attendance <= 0 then
    issues := issues || jsonb_build_object(
      'field', 'expectedAttendance',
      'message', 'Expected attendance must be a positive whole number');
  end if;

  -- AC02. Venue requirements are mandatory information for the coordinator, so
  -- the row must exist and say something. Equipment and registration are
  -- genuinely optional, which is what requirements_acknowledged covers.
  if venue_row.event_id is null
    or (
      coalesce(trim(venue_row.preferred_location), '') = ''
      and venue_row.minimum_capacity is null
      and coalesce(trim(venue_row.accessibility_notes), '') = ''
      and coalesce(trim(venue_row.layout_notes), '') = ''
    )
  then
    issues := issues || jsonb_build_object(
      'field', 'venue.preferredLocation',
      'message', 'Record at least one venue requirement, or state that none is required');
  end if;

  if registration_row.event_id is not null
    and registration_row.registration_required
    and registration_row.attendee_capacity is null
  then
    issues := issues || jsonb_build_object(
      'field', 'registration.capacity',
      'message', 'Enter a registration capacity when registration is required');
  end if;

  if not event_row.requirements_acknowledged then
    issues := issues || jsonb_build_object(
      'field', 'requirementsAcknowledged',
      'message', 'Confirm that each optional requirement is provided or not required');
  end if;

  if jsonb_array_length(issues) > 0 then
    raise exception 'This event request is not ready to submit'
      using errcode = 'check_violation', detail = issues::text;
  end if;

  -- AC05. The status change fires enforce_event_status_transition and
  -- record_event_status_change, so the transition is validated and historised
  -- without this function writing to event_status_history itself.
  update public.events
  set status = 'requested',
      submitted_at = now(),
      submitted_by = actor_id
  where id = p_event_id;

  -- record_event_status_change stamps changed_by from auth.uid(), which is null
  -- when the backend calls this as the service role. AC07 needs the actor, so
  -- fill in the row the trigger just wrote.
  update public.event_status_history
  set changed_by = actor_id
  where event_id = p_event_id
    and to_status = 'requested'
    and changed_by is null;

  select * into event_row from public.events where id = p_event_id;

  return jsonb_build_object(
    'eventId', event_row.id,
    'status', event_row.status,
    'submittedAt', event_row.submitted_at,
    'assignedCoordinatorId', event_row.assigned_coordinator_id
  );
end;
$$;

revoke all on function public.submit_event_request(uuid, uuid) from public;
revoke all on function public.submit_event_request(uuid, uuid) from anon;
grant execute on function public.submit_event_request(uuid, uuid) to authenticated;
grant execute on function public.submit_event_request(uuid, uuid) to service_role;
