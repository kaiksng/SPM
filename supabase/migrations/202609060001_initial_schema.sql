create extension if not exists pgcrypto;

create type public.user_role as enum (
  'event_organiser',
  'event_coordinator',
  'venue_staff',
  'technical_support_staff',
  'attendee',
  'administrator'
);

create type public.event_status as enum (
  'draft',
  'submitted',
  'clarification_requested',
  'under_review',
  'approved',
  'rejected',
  'confirmed',
  'cancelled'
);

create type public.clarification_status as enum ('open', 'answered', 'resolved');
create type public.event_decision_type as enum ('approved', 'rejected');
create type public.notification_type as enum ('assignment', 'clarification', 'decision', 'status_change');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  role public.user_role not null default 'attendee',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.profiles (id),
  assigned_coordinator_id uuid references public.profiles (id),
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text,
  event_type text,
  expected_attendance integer check (expected_attendance is null or expected_attendance > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  status public.event_status not null default 'draft',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_order check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create table public.event_venue_requirements (
  event_id uuid primary key references public.events (id) on delete cascade,
  preferred_location text,
  minimum_capacity integer check (minimum_capacity is null or minimum_capacity > 0),
  accessibility_notes text,
  layout_notes text,
  updated_at timestamptz not null default now()
);

create table public.event_required_facilities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  facility_name text not null check (char_length(trim(facility_name)) > 0),
  notes text,
  unique (event_id, facility_name)
);

create table public.event_equipment_requirements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  equipment_name text not null check (char_length(trim(equipment_name)) > 0),
  quantity integer not null default 1 check (quantity > 0),
  notes text
);

create table public.event_registration_requirements (
  event_id uuid primary key references public.events (id) on delete cascade,
  registration_required boolean not null default false,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  attendee_capacity integer check (attendee_capacity is null or attendee_capacity > 0),
  waitlist_enabled boolean not null default false,
  constraint registration_window_order check (
    registration_opens_at is null
    or registration_closes_at is null
    or registration_closes_at > registration_opens_at
  )
);

create table public.clarifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  question text not null check (char_length(trim(question)) > 0),
  response text,
  status public.clarification_status not null default 'open',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  resolved_at timestamptz
);

create table public.event_decisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  decided_by uuid not null references public.profiles (id),
  decision public.event_decision_type not null,
  rationale text not null check (char_length(trim(rationale)) > 0),
  decided_at timestamptz not null default now()
);

create table public.event_status_history (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  from_status public.event_status,
  to_status public.event_status not null,
  changed_by uuid references public.profiles (id),
  reason text,
  changed_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_organiser_idx on public.events (organiser_id);
create index events_coordinator_idx on public.events (assigned_coordinator_id);
create index events_status_idx on public.events (status);
create index clarifications_event_idx on public.clarifications (event_id);
create index history_event_changed_idx on public.event_status_history (event_id, changed_at desc);
create index notifications_recipient_idx on public.notifications (recipient_id, read_at, created_at desc);
create index audit_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();

create trigger venue_requirements_set_updated_at before update on public.event_venue_requirements
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'attendee'::public.user_role)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.can_view_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and (
        e.organiser_id = auth.uid()
        or e.assigned_coordinator_id = auth.uid()
        or public.current_user_role() in (
          'event_coordinator'::public.user_role,
          'venue_staff'::public.user_role,
          'technical_support_staff'::public.user_role,
          'administrator'::public.user_role
        )
      )
  );
$$;

create or replace function public.record_event_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.event_status_history (event_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'INSERT' then null else old.status end, new.status, auth.uid());
  end if;
  return new;
end;
$$;

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
    when 'draft' then to_status in ('submitted', 'cancelled')
    when 'submitted' then to_status in ('clarification_requested', 'under_review', 'cancelled')
    when 'clarification_requested' then to_status in ('submitted', 'cancelled')
    when 'under_review' then to_status in ('clarification_requested', 'approved', 'rejected', 'cancelled')
    when 'approved' then to_status in ('confirmed', 'cancelled')
    when 'rejected' then false
    when 'confirmed' then to_status = 'cancelled'
    when 'cancelled' then false
  end;
$$;

create or replace function public.enforce_event_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
    and not public.event_status_transition_allowed(old.status, new.status)
  then
    raise exception 'Invalid event status transition from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger events_enforce_status_transition
before update of status on public.events
for each row execute function public.enforce_event_status_transition();

create trigger events_record_initial_status
after insert on public.events
for each row execute function public.record_event_status_change();

create trigger events_record_status_change
after update of status on public.events
for each row execute function public.record_event_status_change();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_venue_requirements enable row level security;
alter table public.event_required_facilities enable row level security;
alter table public.event_equipment_requirements enable row level security;
alter table public.event_registration_requirements enable row level security;
alter table public.clarifications enable row level security;
alter table public.event_decisions enable row level security;
alter table public.event_status_history enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles readable by owner and staff" on public.profiles
for select to authenticated
using (id = auth.uid() or public.current_user_role() in ('event_coordinator', 'administrator'));

create policy "profiles editable by owner" on public.profiles
for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy "events visible to participants" on public.events
for select to authenticated using (public.can_view_event(id));

create policy "organisers create their events" on public.events
for insert to authenticated
with check (organiser_id = auth.uid() and public.current_user_role() = 'event_organiser');

create policy "organisers edit their drafts" on public.events
for update to authenticated
using (organiser_id = auth.uid() and status in ('draft', 'clarification_requested'))
with check (organiser_id = auth.uid());

create policy "coordinators manage assigned events" on public.events
for update to authenticated
using (
  assigned_coordinator_id = auth.uid()
  or public.current_user_role() = 'administrator'
)
with check (
  assigned_coordinator_id = auth.uid()
  or public.current_user_role() = 'administrator'
);

create policy "event details visible to participants" on public.event_venue_requirements
for select to authenticated using (public.can_view_event(event_id));
create policy "event details editable by organiser" on public.event_venue_requirements
for all to authenticated using (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'clarification_requested'))
) with check (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'clarification_requested'))
);

create policy "facilities visible to participants" on public.event_required_facilities
for select to authenticated using (public.can_view_event(event_id));
create policy "facilities editable by organiser" on public.event_required_facilities
for all to authenticated using (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'clarification_requested'))
) with check (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'clarification_requested'))
);

create policy "equipment visible to participants" on public.event_equipment_requirements
for select to authenticated using (public.can_view_event(event_id));
create policy "equipment editable by organiser" on public.event_equipment_requirements
for all to authenticated using (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'clarification_requested'))
) with check (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'clarification_requested'))
);

create policy "registration visible to participants" on public.event_registration_requirements
for select to authenticated using (public.can_view_event(event_id));
create policy "registration editable by organiser" on public.event_registration_requirements
for all to authenticated using (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'clarification_requested'))
) with check (
  exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid() and e.status in ('draft', 'clarification_requested'))
);

create policy "clarifications visible to event participants" on public.clarifications
for select to authenticated using (public.can_view_event(event_id));
create policy "coordinators request clarifications" on public.clarifications
for insert to authenticated with check (
  requested_by = auth.uid()
  and public.current_user_role() in ('event_coordinator', 'administrator')
  and public.can_view_event(event_id)
);
create policy "event participants update clarifications" on public.clarifications
for update to authenticated using (public.can_view_event(event_id))
with check (public.can_view_event(event_id));

create policy "decisions visible to event participants" on public.event_decisions
for select to authenticated using (public.can_view_event(event_id));
create policy "coordinators record decisions" on public.event_decisions
for insert to authenticated with check (
  decided_by = auth.uid()
  and public.current_user_role() in ('event_coordinator', 'administrator')
  and public.can_view_event(event_id)
);

create policy "history visible to event participants" on public.event_status_history
for select to authenticated using (public.can_view_event(event_id));

create policy "users read their notifications" on public.notifications
for select to authenticated using (recipient_id = auth.uid());
create policy "users mark their notifications read" on public.notifications
for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy "administrators read audit logs" on public.audit_logs
for select to authenticated using (public.current_user_role() = 'administrator');

revoke all on function public.current_user_role() from public;
revoke all on function public.can_view_event(uuid) from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.can_view_event(uuid) to authenticated;
