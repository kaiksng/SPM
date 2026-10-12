begin;
select plan(19);

insert into auth.users (id, email, raw_user_meta_data) values
  ('f8600000-0000-0000-0000-000000000001', 'spm86-staff@example.test', '{"full_name":"SPM86 Staff","role":"venue_staff"}'::jsonb),
  ('f8600000-0000-0000-0000-000000000002', 'spm86-coord@example.test', '{"full_name":"SPM86 Coordinator","role":"event_coordinator"}'::jsonb),
  ('f8600000-0000-0000-0000-000000000003', 'spm86-org@example.test', '{"full_name":"SPM86 Organiser","role":"event_organiser"}'::jsonb);

-- Calls update_venue and returns the validation detail (which names the
-- offending fields) instead of raising, so the test can assert on it.
create function pg_temp.update_venue_detail(p_venue_id uuid, p_venue jsonb)
returns text
language plpgsql
as $$
begin
  perform public.update_venue(p_venue_id, p_venue);
  return 'saved';
exception when others then
  declare
    v_detail text;
  begin
    get stacked diagnostics v_detail = pg_exception_detail;
    return coalesce(v_detail, sqlerrm);
  end;
end;
$$;

create temporary table spm86_venue (id uuid);
grant all on spm86_venue to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8600000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- AC01: both values default to 0 when staff do not enter them.
select lives_ok($$insert into spm86_venue
  select (public.create_venue('{"name":"SPM86 Hall","location":"Block 86","area_tags":["Central Area"],"capacity":80,"operating_hours":[{"days":["mon","tue","wed","thu","fri"],"opensAt":"08:00","closesAt":"18:00"}],"facilities":[],"layouts":["Theatre"]}'::jsonb) ->> 'venueId')::uuid$$,
  'Venue Staff create a venue without entering setup or turnaround time');
select is((select setup_time_minutes || '/' || turnaround_time_minutes from public.venues where id = (select id from spm86_venue)),
  '0/0', 'AC01: setup and turnaround default to 0');

-- AC04: a change records the staff member, previous value, new value and time.
select lives_ok(format($$select public.update_venue(%L::uuid, '{"name":"SPM86 Hall","location":"Block 86","area_tags":["Central Area"],"capacity":80,"operating_hours":[{"days":["mon","tue","wed","thu","fri"],"opensAt":"08:00","closesAt":"18:00"}],"facilities":[],"layouts":["Theatre"],"setup_time_minutes":15,"turnaround_time_minutes":0}'::jsonb)$$,
  (select id from spm86_venue)), 'Venue Staff set the setup time to 15');
select is((select count(*)::int from public.venue_buffer_time_changes where venue_id = (select id from spm86_venue)), 1,
  'AC04: one history row for the one field that changed');
select is((select field_name || ':' || previous_value || '>' || new_value from public.venue_buffer_time_changes where venue_id = (select id from spm86_venue)),
  'setup_time_minutes:0>15', 'AC04: history stores the field, previous value and new value');
select ok((select changed_by = 'f8600000-0000-0000-0000-000000000001' and changed_at is not null
  from public.venue_buffer_time_changes where venue_id = (select id from spm86_venue)),
  'AC04: history stores the staff member and a timestamp');

select lives_ok(format($$select public.update_venue(%L::uuid, '{"name":"SPM86 Hall","location":"Block 86","area_tags":["Central Area"],"capacity":80,"operating_hours":[{"days":["mon","tue","wed","thu","fri"],"opensAt":"08:00","closesAt":"18:00"}],"facilities":[],"layouts":["Theatre"],"setup_time_minutes":15,"turnaround_time_minutes":20}'::jsonb)$$,
  (select id from spm86_venue)), 'Venue Staff then set the turnaround time to 20');
select is((select count(*)::int from public.venue_buffer_time_changes where venue_id = (select id from spm86_venue)), 2,
  'AC04: the second change adds one more history row');
select is((select count(*)::int from public.venue_buffer_time_changes
  where venue_id = (select id from spm86_venue) and field_name = 'setup_time_minutes'), 1,
  'AC04: an unchanged value is not logged again');

-- AC02: invalid values are rejected and the affected field is identified.
select ok(pg_temp.update_venue_detail((select id from spm86_venue),
  '{"name":"SPM86 Hall","location":"Block 86","area_tags":["Central Area"],"capacity":80,"operating_hours":[{"days":["mon"],"opensAt":"08:00","closesAt":"18:00"}],"facilities":[],"layouts":["Theatre"],"setup_time_minutes":-5,"turnaround_time_minutes":20}'::jsonb)
  like '%"setupTimeMinutes"%', 'AC02: a negative setup time is rejected and names setupTimeMinutes');
select ok(pg_temp.update_venue_detail((select id from spm86_venue),
  '{"name":"SPM86 Hall","location":"Block 86","area_tags":["Central Area"],"capacity":80,"operating_hours":[{"days":["mon"],"opensAt":"08:00","closesAt":"18:00"}],"facilities":[],"layouts":["Theatre"],"setup_time_minutes":15,"turnaround_time_minutes":"abc"}'::jsonb)
  like '%"turnaroundTimeMinutes"%', 'AC02: a non-numeric turnaround time is rejected and names turnaroundTimeMinutes');
select ok(pg_temp.update_venue_detail((select id from spm86_venue),
  '{"name":"SPM86 Hall","location":"Block 86","area_tags":["Central Area"],"capacity":80,"operating_hours":[{"days":["mon"],"opensAt":"08:00","closesAt":"18:00"}],"facilities":[],"layouts":["Theatre"],"setup_time_minutes":1.5,"turnaround_time_minutes":20}'::jsonb)
  like '%"setupTimeMinutes"%', 'AC02: a fractional (non-whole-minute) value is rejected');
select is((select setup_time_minutes || '/' || turnaround_time_minutes from public.venues where id = (select id from spm86_venue)),
  '15/20', 'AC02: rejected saves leave the stored values unchanged');
select is((select count(*)::int from public.venue_buffer_time_changes where venue_id = (select id from spm86_venue)), 2,
  'AC02: rejected saves add no history rows');

-- AC05: only Venue Staff can change the values.
select set_config('request.jwt.claims', '{"sub":"f8600000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$select public.update_venue(%L::uuid, '{"name":"SPM86 Hall","location":"Block 86","area_tags":["Central Area"],"capacity":80,"operating_hours":[{"days":["mon"],"opensAt":"08:00","closesAt":"18:00"}],"facilities":[],"layouts":["Theatre"],"setup_time_minutes":99,"turnaround_time_minutes":99}'::jsonb)$$,
  (select id from spm86_venue)), '42501', 'Only Venue Staff can update venues', 'AC05: a coordinator cannot change the values');
select is((select count(*)::int from public.venue_buffer_time_changes), 0,
  'AC05: a coordinator cannot read the change history');
select throws_ok(format($$insert into public.venue_buffer_time_changes (venue_id, field_name, previous_value, new_value, changed_by)
  values (%L::uuid, 'setup_time_minutes', 0, 99, 'f8600000-0000-0000-0000-000000000002')$$, (select id from spm86_venue)),
  '42501', null, 'AC05: history cannot be written directly, only through update_venue');

select set_config('request.jwt.claims', '{"sub":"f8600000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(format($$select public.update_venue(%L::uuid, '{"name":"SPM86 Hall","location":"Block 86","area_tags":["Central Area"],"capacity":80,"operating_hours":[{"days":["mon"],"opensAt":"08:00","closesAt":"18:00"}],"facilities":[],"layouts":["Theatre"],"setup_time_minutes":99,"turnaround_time_minutes":99}'::jsonb)$$,
  (select id from spm86_venue)), '42501', 'Only Venue Staff can update venues', 'AC05: an organiser cannot change the values');

select * from finish();
rollback;
