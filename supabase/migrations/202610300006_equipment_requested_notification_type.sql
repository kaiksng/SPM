-- Technical Support Staff are told when an event's coordinator requests its
-- equipment. Used by request_event_equipment (202610300007).
alter type public.notification_type add value if not exists 'equipment_requested';
