-- SPM-28: Update equipment arrangement status and notes (Technical Support
-- Staff).
--
-- "As a Technical Support Staff member, I want to update the arrangement
-- status and add a note on an event's equipment requirement as I work on
-- it, so that other staff can see how far sourcing and arranging has
-- progressed."
--
-- AC01 Each equipment requirement has an arrangement status from a fixed
--      list: Not started, In progress, Arranged, Issue.
-- AC02 A requirement with no update yet shows Not started.
-- AC03 Each update records who made it, when, and the status and note it
--      set. Earlier entries are kept and can be viewed in order.
-- AC04 Technical Support Staff can change the status and/or note, and the
--      new values are shown on the requirement.
-- AC05 Updates can be repeated, including back to an earlier status, and
--      each one is added to the history.
-- AC06 Anyone other than Technical Support Staff is refused.
--
-- Design: an append-only log. The current arrangement is the latest row, no
-- row means Not started, and the rows themselves are the history. It is a
-- separate table rather than columns on event_equipment_requirements
-- because organisers may write that table directly ("equipment editable by
-- organiser"), and its `notes` column already holds the coordinator's
-- technical requirements. The status is set by hand and is independent of
-- equipment reservations.

create table public.equipment_arrangement_updates (
  id bigint generated always as identity primary key,
  -- History belongs to the requirement; removing the requirement removes it
  -- (the removal itself stays in event_equipment_changes).
  requirement_id uuid not null references public.event_equipment_requirements (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  status text not null check (status in ('not_started', 'in_progress', 'arranged', 'issue')),
  note text check (note is null or char_length(note) between 1 and 1000),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create index equipment_arrangement_updates_requirement_idx
  on public.equipment_arrangement_updates (requirement_id, id);
create index equipment_arrangement_updates_event_idx
  on public.equipment_arrangement_updates (event_id);

alter table public.equipment_arrangement_updates enable row level security;

-- No write policy: only update_equipment_arrangement inserts (AC06). Read
-- access matches equipment history (202610050004): Technical Support Staff
-- and the event's assigned coordinator.
create policy "assigned coordinator and technical support view equipment arrangements"
on public.equipment_arrangement_updates
for select to authenticated using (
  public.current_user_role() = 'technical_support_staff'::public.user_role
  or exists (
    select 1 from public.events e
    where e.id = equipment_arrangement_updates.event_id
      and e.assigned_coordinator_id = auth.uid()
  )
);

-- The history names who made each update. Same narrow shape as
-- "technical support staff view profiles tied to equipment changes".
create policy "technical support staff view profiles tied to equipment arrangements"
on public.profiles
for select to authenticated
using (
  public.current_user_role() = 'technical_support_staff'::public.user_role
  and exists (
    select 1 from public.equipment_arrangement_updates a
    where a.updated_by = profiles.id
  )
);

-- Records a new arrangement status and note for one requirement. Returns
-- the new entry's id, or null when nothing changed (no history entry is
-- added, matching equipment history).
create or replace function public.update_equipment_arrangement(
  p_requirement_id uuid,
  p_status text,
  p_note text default null
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_requirement public.event_equipment_requirements;
  v_event_status public.event_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_current_status text := 'not_started';
  v_current_note text;
  v_id bigint;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'technical_support_staff'::public.user_role
  then
    raise exception 'Only Technical Support Staff can update equipment arrangements' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('not_started', 'in_progress', 'arranged', 'issue') then
    raise exception 'Choose an arrangement status' using errcode = '23514';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'Note must contain at most 1000 characters' using errcode = '23514';
  end if;

  -- Locked so two staff saving at once are compared against each other's
  -- result rather than the same stale one.
  select * into v_requirement
  from public.event_equipment_requirements where id = p_requirement_id for update;
  if not found then
    raise exception 'This equipment request no longer exists' using errcode = '23514';
  end if;

  select status into v_event_status from public.events where id = v_requirement.event_id;
  if v_event_status not in ('requested', 'planning', 'pending_safety_check', 'confirmed') then
    raise exception 'Arrangements can only be updated for a Requested, Planning, Pending Safety Check or Confirmed event'
      using errcode = '23514';
  end if;

  select status, note into v_current_status, v_current_note
  from public.equipment_arrangement_updates
  where requirement_id = p_requirement_id
  order by id desc
  limit 1;

  if coalesce(v_current_status, 'not_started') = p_status and v_current_note is not distinct from v_note then
    return null;
  end if;

  insert into public.equipment_arrangement_updates (requirement_id, event_id, status, note, updated_by)
  values (p_requirement_id, v_requirement.event_id, p_status, v_note, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.update_equipment_arrangement(uuid, text, text) from public, anon;
grant execute on function public.update_equipment_arrangement(uuid, text, text) to authenticated;
