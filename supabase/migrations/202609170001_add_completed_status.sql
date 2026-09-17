-- "As an authorised user, I want to see an event's current lifecycle
-- status" — adds the "completed" status. Own migration file on purpose:
-- Postgres refuses to reference an enum value added earlier in the same
-- transaction, and Supabase runs each migration file in one transaction —
-- same reason 'requested' (202609130001) and 'planning' (202609150001) each
-- got their own file before anything used them.
alter type public.event_status add value if not exists 'completed' after 'confirmed';
