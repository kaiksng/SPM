-- Registered and waitlisted attendees are told when a Confirmed event goes
-- back to Planning to have its arrangements updated (e.g. its venue).
-- Used by notify_attendees_arrangements_updating (202611010011).
alter type public.notification_type add value if not exists 'event_arrangements_updating';
