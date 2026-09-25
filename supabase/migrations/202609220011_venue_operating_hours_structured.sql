-- Venue Catalogue: replace free-text operating hours with structured
-- day-range periods.
--
-- operating_hours used to be a single free-text column (e.g. "Mon-Fri,
-- 9am-6pm", or unvalidatable garbage like "play"). That defeated AC03's
-- "invalid mandatory information prevents saving" for this field, and forced
-- VenueAvailabilityPage.tsx's parseOperatingHours to regex-guess a venue's
-- open/close hours out of the text, silently falling back to a default
-- window when it couldn't confidently read one.
--
-- There is no reliable way to auto-convert existing free-text values (real
-- rows already exist: "NDB Hall 3", "SMU", "Concourse Hall", etc.) into the
-- new structured shape, so this does not attempt to. The old column is kept
-- (renamed, not dropped) for manual reference/rollback safety; every
-- existing venue reads as having no structured operating hours set until
-- venue staff re-enters them through the form.
alter table public.venues
  rename column operating_hours to operating_hours_legacy_text;

-- Nothing populates this column going forward (public.create_venue/
-- public.update_venue no longer accept it), so it can no longer be
-- guaranteed not-null.
alter table public.venues
  alter column operating_hours_legacy_text drop not null;

comment on column public.venues.operating_hours_legacy_text is
  'Historical free-text operating hours, kept for manual reference only. Superseded by operating_hours (jsonb); not read by any UI.';

-- New structured column: an array of OperatingHoursPeriod
-- ({ days: DayCode[], opensAt: "HH:MM", closesAt: "HH:MM" }). A day not
-- covered by any period is closed that day. Shape is validated in
-- public.create_venue/public.update_venue below, matching this codebase's
-- existing convention of validating jsonb payload shape in the write
-- function rather than with a table-level CHECK constraint (see
-- event_change_requests.requested_changes / save_event_draft's draft jsonb).
alter table public.venues
  add column operating_hours jsonb not null default '[]'::jsonb;

comment on column public.venues.operating_hours is
  'Structured operating hours: OperatingHoursPeriod[] ({ days, opensAt, closesAt }). A day absent from every period is closed that day.';
