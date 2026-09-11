# Backend

This app exists for privileged operations (using the Supabase `service_role` key, which must never reach the frontend) and business logic that shouldn't run client-side — not for routine CRUD, which the frontend does directly against Supabase under Row Level Security.

```text
routes/       HTTP routes for privileged/business-logic operations
middleware/   Auth verification (Supabase JWT), error handling
lib/          Supabase service-role client
errors/       Application error types
```

Rules:

- Routes validate input, verify the caller via `middleware/auth.ts`, and rely on RLS/`lib/supabase-service-client.ts` as appropriate for the operation.
- Framework-independent business rules and validation shared with the frontend belong in `packages/shared`, not here.
- Only import `lib/supabase-service-client.ts` from code that has already authorized the caller.
