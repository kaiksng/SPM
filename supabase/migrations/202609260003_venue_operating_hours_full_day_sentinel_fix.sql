-- venue_booking_fits_operating_hours (202609260001) checked a fully-spanned
-- middle day of a multi-day booking against a hardcoded '23:59:59' end-of-day
-- sentinel. But operating_hours.closesAt is always minute-precision ("HH:MM"
-- — see venue-form.tsx/venueFormSchema), and this app's own convention for
-- "open all day" is closesAt: "23:59" (both the spm24 and
-- find_matching_venues pgTAP fixtures use it that way). "23:59" as a time is
-- 23:59:00, one minute short of the '23:59:59' sentinel, so a genuinely
-- 24-hours-a-day venue still failed this check for any multi-day booking
-- with an untouched day in the middle — discovered via a multi-day event
-- against find_matching_venues (202609260002). Only the sentinel changes;
-- start-of-day already used '00:00' (matching minute precision) and the
-- first/last day's own boundary already comes from the real event time.
create or replace function public.venue_booking_fits_operating_hours(
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_periods jsonb;
  v_local_start timestamp;
  v_local_end timestamp;
  v_day date;
  v_day_code text;
  v_day_start time;
  v_day_end time;
  v_period jsonb;
  v_day_ok boolean;
begin
  select operating_hours into v_periods from public.venues where id = p_venue_id;

  if v_periods is null or jsonb_array_length(v_periods) = 0 then
    return false;
  end if;

  v_local_start := p_starts_at at time zone 'Asia/Singapore';
  v_local_end := p_ends_at at time zone 'Asia/Singapore';

  for v_day in select generate_series(v_local_start::date, v_local_end::date, interval '1 day')::date
  loop
    v_day_code := (array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])[extract(isodow from v_day)::int];
    v_day_start := case when v_day = v_local_start::date then v_local_start::time else '00:00'::time end;
    v_day_end := case when v_day = v_local_end::date then v_local_end::time else '23:59'::time end;
    v_day_ok := false;

    for v_period in select * from jsonb_array_elements(v_periods)
    loop
      if (v_period -> 'days') ? v_day_code
        and v_day_start >= (v_period ->> 'opensAt')::time
        and v_day_end <= (v_period ->> 'closesAt')::time
      then
        v_day_ok := true;
      end if;
    end loop;

    if not v_day_ok then
      return false;
    end if;
  end loop;

  return true;
end;
$$;
