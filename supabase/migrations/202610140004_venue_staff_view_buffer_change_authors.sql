-- SPM-86: a venue's setup/turnaround change history names the staff member who
-- made each change, but profiles are only readable by their owner (and a few
-- role-specific exceptions). Venue Staff could see a colleague's name only if
-- that colleague had also requested, decided or held a booking, so a change
-- made by a staff member who had not shown as "Unknown". This lets Venue Staff
-- read the profile of anyone who appears as the author of a buffer-time change,
-- the same way the existing policies expose the people tied to bookings.
create policy "venue staff view profiles tied to buffer time changes"
on public.profiles
for select to authenticated
using (
  public.current_user_role() = 'venue_staff'::public.user_role
  and exists (
    select 1
    from public.venue_buffer_time_changes c
    where c.changed_by = profiles.id
  )
);
