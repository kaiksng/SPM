-- SPM-39 AC02: Technical Support Staff are told when an applied change
-- request flags equipment Needs Review. Used by apply_event_change_request
-- (202610230005).
alter type public.notification_type add value if not exists 'equipment_change_review';
