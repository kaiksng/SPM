-- SPM-39 AC02/AC10: Safety Officers are told when an applied change request
-- returns a Confirmed or Pending Safety Check event to Planning for a new
-- safety review. Used by apply_event_change_request (202610230005).
alter type public.notification_type add value if not exists 'safety_review_reset';
