-- A newly added enum value cannot be used in the same migration it's added
-- in, so this is its own file (see 202610270005, which uses it).
alter type public.notification_type add value if not exists 'waitlist_promoted';
