-- 202610300001 added helper functions that, like any new function, can be
-- called by signed-out visitors. They only answer true/false for an event id,
-- but only signed-in users (and the storage service) have any reason to call
-- them, so lock them down the way the other event helpers are.
revoke all on function public.can_access_event_documents(uuid) from public, anon;
grant execute on function public.can_access_event_documents(uuid) to authenticated, service_role;

revoke all on function public.event_documents_open(uuid) from public, anon;
grant execute on function public.event_documents_open(uuid) to authenticated, service_role;
