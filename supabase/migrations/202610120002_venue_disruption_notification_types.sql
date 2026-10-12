-- SPM-83: notification types for a booking disrupted by a venue block and for
-- the disruption later being cleared. A newly added enum value cannot be used
-- in the same transaction, so the functions that use these are a later
-- migration.
alter type public.notification_type add value if not exists 'venue_booking_disrupted';
alter type public.notification_type add value if not exists 'venue_disruption_cleared';
