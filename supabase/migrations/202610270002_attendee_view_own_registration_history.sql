-- can_view_event's attendee branch only granted visibility while an event
-- was exactly 'confirmed' — fine for Browse Events, but it meant an
-- attendee lost read access to an event entirely the moment it moved past
-- confirmed (completed, cancelled, ...), breaking the embedded join in
-- listMyRegistrations and silently dropping that registration from "My
-- Registrations". Fix: an attendee can also see an event they hold (or
-- held) a registration row for, regardless of the event's current status —
-- same shape as the organiser_id/assigned_coordinator_id grants above,
-- which were never status-gated either.

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
        or (
          public.current_user_role() = 'attendee'::public.user_role
          and (
            e.status = 'confirmed'::public.event_status
            or exists (
              select 1 from public.event_registrations er
              where er.event_id = e.id and er.attendee_id = auth.uid()
            )
          )
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
        or (
          exists (
            select 1 from public.profiles p
            where p.id = p_actor_id and p.role = 'attendee'::public.user_role
          )
          and (
            e.status = 'confirmed'::public.event_status
            or exists (
              select 1 from public.event_registrations er
              where er.event_id = e.id and er.attendee_id = p_actor_id
            )
          )
        )
      )
  );
$function$;
