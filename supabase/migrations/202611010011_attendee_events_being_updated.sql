-- A Confirmed event that goes back to Planning (a replacement venue approved,
-- a change request applied) or on to Pending Safety Check again is being
-- updated, not cancelled. Attendees should still see it, marked "Venue to be
-- confirmed", instead of it disappearing:
--
--   * event_is_being_updated: Planning or Pending Safety Check, and Confirmed
--     at some point before (event_status_history).
--   * attendee_events_being_updated: those events' attendee-safe fields only
--     (title, schedule, location, banner, description, registration needed),
--     for Browse events and the event's page. A purpose-built read: RLS on
--     events is unchanged, so attendees still can't read any planning detail
--     of an event under review (SPM-49).
--   * list_public_events (last 202611010001) also lists them, flagged
--     being_updated.
--   * Registered and waitlisted attendees are notified when the event leaves
--     Confirmed for Planning.
-- New registrations are already refused while an event isn't Confirmed
-- (register_for_event, join_event_waitlist); withdrawing and leaving the
-- waiting list still work.

create or replace function public.event_is_being_updated(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.status in ('planning', 'pending_safety_check')
      and exists (
        select 1 from public.event_status_history h
        where h.event_id = e.id and h.to_status = 'confirmed'
      )
  );
$$;

revoke all on function public.event_is_being_updated(uuid) from public, anon;
grant execute on function public.event_is_being_updated(uuid) to authenticated;

-- One event (p_event_id) or all of them, for a signed-in attendee.
create or replace function public.attendee_events_being_updated(p_event_id uuid default null)
returns table (
  id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  banner_path text,
  registration_required boolean,
  withdrawal_permitted boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    e.id,
    e.title,
    e.description,
    e.starts_at,
    e.ends_at,
    vr.preferred_location,
    e.banner_path,
    coalesce(rr.registration_required, false),
    coalesce(rr.withdrawal_permitted, false)
  from public.events e
  left join public.event_registration_requirements rr on rr.event_id = e.id
  left join public.event_venue_requirements vr on vr.event_id = e.id
  where auth.uid() is not null
    and (p_event_id is null or e.id = p_event_id)
    and (e.ends_at is null or e.ends_at > now())
    and public.event_is_being_updated(e.id)
  order by e.starts_at nulls last, e.title;
$$;

revoke all on function public.attendee_events_being_updated(uuid) from public, anon;
grant execute on function public.attendee_events_being_updated(uuid) to authenticated;

-- Public main page: also the events being updated, flagged so.
drop function public.list_public_events(integer);

create function public.list_public_events(p_limit integer default 6)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  banner_path text,
  registration_required boolean,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  is_full boolean,
  being_updated boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    e.id,
    e.title,
    e.starts_at,
    e.ends_at,
    vr.preferred_location,
    e.banner_path,
    coalesce(rr.registration_required, false),
    case when rr.registration_required then rr.registration_opens_at end,
    case when rr.registration_required then rr.registration_closes_at end,
    coalesce(rr.registration_required, false)
      and rr.attendee_capacity is not null
      and (
        select count(*) from public.event_registrations r
        where r.event_id = e.id and r.status = 'registered'
      ) >= rr.attendee_capacity,
    e.status <> 'confirmed'
  from public.events e
  left join public.event_registration_requirements rr on rr.event_id = e.id
  left join public.event_venue_requirements vr on vr.event_id = e.id
  where (e.status = 'confirmed' or public.event_is_being_updated(e.id))
    and (e.ends_at is null or e.ends_at > now())
  order by e.starts_at nulls last, e.title
  limit greatest(least(coalesce(p_limit, 6), 50), 1);
$$;

revoke all on function public.list_public_events(integer) from public;
grant execute on function public.list_public_events(integer) to anon, authenticated;

-- Registered and waitlisted attendees hear when a Confirmed event is being
-- updated. Their registration is kept.
create or replace function public.notify_attendees_arrangements_updating()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, event_id, type, title, message)
  select
    r.attendee_id,
    new.id,
    'event_arrangements_updating'::public.notification_type,
    'Event arrangements being updated',
    'The arrangements for "' || new.title || '" are being updated, for example its venue. '
      || 'Your ' || case when r.status = 'waitlisted' then 'place on the waiting list' else 'registration' end
      || ' is kept; the confirmed details will show once they are settled.'
  from public.event_registrations r
  where r.event_id = new.id and r.status in ('registered', 'waitlisted');
  return new;
end;
$$;

revoke all on function public.notify_attendees_arrangements_updating() from public, anon, authenticated;

create trigger events_notify_attendees_arrangements_updating
after update of status on public.events
for each row
when (old.status = 'confirmed' and new.status = 'planning')
execute function public.notify_attendees_arrangements_updating();
