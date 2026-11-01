-- SPM-49 AC2/AC3: an attendee must not read an event's internal planning
-- information, even by calling the API directly.
--
-- can_view_event had an attendee branch (any Confirmed event, or any event
-- the attendee holds a registration for). Eleven table policies and several
-- RPCs delegate to it, so an attendee could read the full events row
-- (expected attendance, safety plan, notes), venue bookings, decisions,
-- equipment and facility requirements, venue notes, clarifications, change
-- requests, equipment reservations and the safety review details.
--
-- Fix, in three parts:
--   1. can_view_event (both overloads) no longer admits attendees, which
--      closes every internal policy and RPC at once.
--   2. can_attendee_view_event keeps the old attendee rule, and is used only
--      where an attendee legitimately needs access: registering, the
--      registration settings and the registration counts.
--   3. attendee_visible_events returns just the attendee-facing fields, so
--      the attendee screens no longer read the events table.

create or replace function public.can_view_event(target_event_id uuid)
returns boolean
language sql
stable security definer
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
          'event_coordinator_lead'::public.user_role
        )
        or (
          public.current_user_role() = 'safety_officer'::public.user_role
          and e.status = 'pending_safety_check'::public.event_status
        )
      )
  );
$$;

create or replace function public.can_view_event(target_event_id uuid, p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and (
        e.organiser_id = p_actor_id
        or e.assigned_coordinator_id = p_actor_id
        or exists (
          select 1 from public.profiles p
          where p.id = p_actor_id
            and p.role in (
              'event_coordinator'::public.user_role,
              'venue_staff'::public.user_role,
              'technical_support_staff'::public.user_role,
              'event_coordinator_lead'::public.user_role
            )
        )
        or (
          exists (
            select 1 from public.profiles p
            where p.id = p_actor_id and p.role = 'safety_officer'::public.user_role
          )
          and e.status = 'pending_safety_check'::public.event_status
        )
      )
  );
$function$;

-- The attendee rule that used to live inside can_view_event: a Confirmed
-- event, or any event the attendee holds (or held) a registration for.
create or replace function public.can_attendee_view_event(target_event_id uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select public.current_user_role() = 'attendee'::public.user_role
    and exists (
      select 1
      from public.events e
      where e.id = target_event_id
        and (
          e.status = 'confirmed'::public.event_status
          or exists (
            select 1 from public.event_registrations er
            where er.event_id = e.id and er.attendee_id = auth.uid()
          )
        )
    );
$$;

revoke all on function public.can_attendee_view_event(uuid) from public, anon;
grant execute on function public.can_attendee_view_event(uuid) to authenticated, service_role;

-- Registration settings are attendee-facing information.
drop policy if exists "registration visible to participants" on public.event_registration_requirements;
create policy "registration visible to participants" on public.event_registration_requirements
for select to authenticated
using (public.can_view_event(event_id) or public.can_attendee_view_event(event_id));

-- Registering needs the attendee rule, and the event must not be cancelled.
-- The status check lives in a security-definer helper because an attendee can
-- no longer read the events table, so an inline subquery would see no row.
create or replace function public.can_attendee_register_for_event(target_event_id uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select public.can_attendee_view_event(target_event_id)
    and exists (
      select 1 from public.events e
      where e.id = target_event_id
        and e.status <> 'cancelled'::public.event_status
    );
$$;

revoke all on function public.can_attendee_register_for_event(uuid) from public, anon;
grant execute on function public.can_attendee_register_for_event(uuid) to authenticated, service_role;

drop policy if exists "attendees register themselves" on public.event_registrations;
create policy "attendees register themselves" on public.event_registrations
for insert to authenticated
with check (
  attendee_id = auth.uid()
  and public.current_user_role() = 'attendee'::public.user_role
  and public.can_attendee_register_for_event(event_id)
);

create or replace function public.event_registration_counts(p_event_ids uuid[])
returns table (event_id uuid, registered_count integer, own_waitlist_position integer)
language sql
stable security definer
set search_path = ''
as $$
  select
    e.id,
    (
      select count(*)::integer
      from public.event_registrations r
      where r.event_id = e.id and r.status = 'registered'
    ),
    (
      select w.position::integer
      from (
        select r.attendee_id, row_number() over (order by r.registered_at, r.id) as position
        from public.event_registrations r
        where r.event_id = e.id and r.status = 'waitlisted'
      ) w
      where w.attendee_id = auth.uid()
    )
  from public.events e
  where e.id = any (p_event_ids)
    and (public.can_view_event(e.id) or public.can_attendee_view_event(e.id));
$$;

-- The only way an attendee reads event information: published fields only,
-- for events they may see (Confirmed, or one they registered for). Staff who
-- may view the event internally also get these same fields.
create or replace function public.attendee_visible_events(p_event_ids uuid[] default null)
returns table (
  id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.event_status,
  banner_path text,
  organiser_name text,
  preferred_location text,
  registration_required boolean,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  attendee_capacity integer,
  waitlist_enabled boolean,
  withdrawal_permitted boolean
)
language sql
stable security definer
set search_path = ''
as $$
  select
    e.id,
    e.title,
    e.description,
    e.starts_at,
    e.ends_at,
    e.status,
    e.banner_path,
    p.full_name,
    vr.preferred_location,
    rr.registration_required,
    rr.registration_opens_at,
    rr.registration_closes_at,
    rr.attendee_capacity,
    rr.waitlist_enabled,
    rr.withdrawal_permitted
  from public.events e
  left join public.profiles p on p.id = e.organiser_id
  left join public.event_venue_requirements vr on vr.event_id = e.id
  left join public.event_registration_requirements rr on rr.event_id = e.id
  where (p_event_ids is null or e.id = any (p_event_ids))
    and (public.can_attendee_view_event(e.id) or public.can_view_event(e.id))
  order by e.starts_at nulls last, e.title;
$$;

revoke all on function public.attendee_visible_events(uuid[]) from public, anon;
grant execute on function public.attendee_visible_events(uuid[]) to authenticated, service_role;
