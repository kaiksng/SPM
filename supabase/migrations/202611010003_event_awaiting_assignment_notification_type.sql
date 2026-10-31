-- Event Coordinator Leads are told when a newly submitted event needs a
-- coordinator. Used by notify_leads_of_unassigned_event (202611010004).
alter type public.notification_type add value if not exists 'event_awaiting_assignment';
