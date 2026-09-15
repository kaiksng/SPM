-- PB-07: View Requirements and Change History for a Planning Event.
--
-- "As an Event Coordinator, I want to view the latest requirements and change
-- history for a Planning event, so that I can confirm all internal teams are
-- working from the current agreed information."
--
-- AC01 An authorised coordinator can view the latest requirements for any
--      event in Planning status. (The "latest requirements" half already
--      exists — loadEventDetail/EventDetailPage read the live events and
--      requirement rows directly. This migration adds the other half.)
-- AC02 The change history displays each prior update with previous value,
--      new value, actor, and timestamp, in sequence.
-- AC03/AC04 Only an authorised coordinator can access this view.
--
-- This is the field-level previous/new value history explicitly deferred to
-- PB-07 by 202609130003 (organiser edits to a Requested event) and
-- 202609140003 (clarification responses, which themselves go through
-- save_event_draft's own edit path rather than this one). It captures every
-- scalar edit made across the draft/clarification/requested lifecycle, not
-- just edits made while the event happens to be Planning — the coordinator
-- opening a Planning event needs to see how the agreed information got to
-- where it is, not only what changed after approval.
--
-- Scope call: event_required_facilities and event_equipment_requirements are
-- deliberately excluded. save_event_draft rewrites both by deleting every row
-- for the event and re-inserting the submitted list on every save (see
-- 202609120001), so a generic insert/delete trigger would log a spurious
-- "removed X / added X" pair on every save even when nothing actually
-- changed — noise, not history. Diffing those meaningfully needs a
-- set-comparison this story doesn't ask for; left to whichever future story
-- needs it.
--
-- "Authorised coordinator" is resolved the same way sibling coordinator
-- actions already resolve it (decide_event_request, request_event_clarification):
-- the assigned coordinator specifically (or an administrator), not
-- can_view_event's broader "any event_coordinator-role user" — this is the
-- recurring "authorised" definition gap the story calls out, settled here
-- the same way those two cards settled it.

create table public.event_field_changes (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  field_name text not null check (field_name in (
    'title', 'purpose', 'description', 'eventType', 'expectedAttendance', 'startsAt', 'endsAt',
    'venue.preferredLocation', 'venue.minimumCapacity', 'venue.accessibilityNotes', 'venue.layoutNotes',
    'registration.required', 'registration.opensAt', 'registration.closesAt',
    'registration.capacity', 'registration.waitlistEnabled'
  )),
  previous_value text,
  new_value text,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);

create index event_field_changes_event_idx on public.event_field_changes (event_id, changed_at asc);

alter table public.event_field_changes enable row level security;

-- AC03/AC04. No insert/update/delete policy for authenticated users — the
-- trigger functions below are security definer, the same way
-- record_event_status_change writes to event_status_history despite that
-- table also having no write policy of its own.
create policy "assigned coordinator views field change history" on public.event_field_changes
for select to authenticated using (
  exists (
    select 1 from public.events e
    where e.id = event_field_changes.event_id
      and (
        e.assigned_coordinator_id = auth.uid()
        or public.current_user_role() = 'administrator'::public.user_role
      )
  )
);

create or replace function public.record_event_field_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.title is distinct from old.title then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (new.id, 'title', old.title, new.title, auth.uid());
  end if;

  if new.purpose is distinct from old.purpose then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (new.id, 'purpose', old.purpose, new.purpose, auth.uid());
  end if;

  if new.description is distinct from old.description then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (new.id, 'description', old.description, new.description, auth.uid());
  end if;

  if new.event_type is distinct from old.event_type then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (new.id, 'eventType', old.event_type, new.event_type, auth.uid());
  end if;

  if new.expected_attendance is distinct from old.expected_attendance then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (new.id, 'expectedAttendance', old.expected_attendance::text, new.expected_attendance::text, auth.uid());
  end if;

  if new.starts_at is distinct from old.starts_at then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (
      new.id,
      'startsAt',
      to_char(old.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      to_char(new.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      auth.uid()
    );
  end if;

  if new.ends_at is distinct from old.ends_at then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (
      new.id,
      'endsAt',
      to_char(old.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      to_char(new.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      auth.uid()
    );
  end if;

  return new;
end;
$$;

-- AFTER UPDATE only (not INSERT): a freshly created draft has no "previous"
-- state worth recording — history starts at the first real edit.
create trigger events_record_field_changes
after update of title, purpose, description, event_type, expected_attendance, starts_at, ends_at
on public.events
for each row execute function public.record_event_field_change();

create or replace function public.record_event_venue_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.preferred_location is distinct from old.preferred_location then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (new.event_id, 'venue.preferredLocation', old.preferred_location, new.preferred_location, auth.uid());
  end if;

  if new.minimum_capacity is distinct from old.minimum_capacity then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (new.event_id, 'venue.minimumCapacity', old.minimum_capacity::text, new.minimum_capacity::text, auth.uid());
  end if;

  if new.accessibility_notes is distinct from old.accessibility_notes then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (new.event_id, 'venue.accessibilityNotes', old.accessibility_notes, new.accessibility_notes, auth.uid());
  end if;

  if new.layout_notes is distinct from old.layout_notes then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (new.event_id, 'venue.layoutNotes', old.layout_notes, new.layout_notes, auth.uid());
  end if;

  return new;
end;
$$;

-- save_event_draft writes this row via `insert ... on conflict (event_id) do
-- update`, which Postgres executes as a genuine row UPDATE once the row
-- exists (the common case) — this AFTER UPDATE trigger sees it correctly.
-- The very first insert (no prior row) fires no UPDATE trigger, which is
-- correct: there is no "previous" venue requirement to diff against yet.
create trigger venue_requirements_record_changes
after update on public.event_venue_requirements
for each row execute function public.record_event_venue_change();

create or replace function public.record_event_registration_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.registration_required is distinct from old.registration_required then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (new.event_id, 'registration.required', old.registration_required::text, new.registration_required::text, auth.uid());
  end if;

  if new.registration_opens_at is distinct from old.registration_opens_at then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (
      new.event_id,
      'registration.opensAt',
      to_char(old.registration_opens_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      to_char(new.registration_opens_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      auth.uid()
    );
  end if;

  if new.registration_closes_at is distinct from old.registration_closes_at then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (
      new.event_id,
      'registration.closesAt',
      to_char(old.registration_closes_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      to_char(new.registration_closes_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      auth.uid()
    );
  end if;

  if new.attendee_capacity is distinct from old.attendee_capacity then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (new.event_id, 'registration.capacity', old.attendee_capacity::text, new.attendee_capacity::text, auth.uid());
  end if;

  if new.waitlist_enabled is distinct from old.waitlist_enabled then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (new.event_id, 'registration.waitlistEnabled', old.waitlist_enabled::text, new.waitlist_enabled::text, auth.uid());
  end if;

  return new;
end;
$$;

create trigger registration_requirements_record_changes
after update on public.event_registration_requirements
for each row execute function public.record_event_registration_change();
