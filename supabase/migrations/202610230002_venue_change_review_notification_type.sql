-- SPM-39 AC02: Venue Staff are told when an applied change request flags a
-- venue booking Needs Review. Used by apply_event_change_request (202610230005).
alter type public.notification_type add value if not exists 'venue_change_review';
