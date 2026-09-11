# Feature modules

Product code is organised by capability rather than by technical layer. Each feature owns the components and actions needed to deliver that capability.

Create subdirectories only when they contain real code:

```text
feature-name/
  actions/       Auth/write operations calling Supabase or the backend API
  components/    Feature-specific interface components
```

Rules:

- Routes (`src/routes`) compose features; they do not contain database queries or business rules.
- Components use the Supabase browser client only for operations that are safe under Row Level Security.
- Anything privileged (the `service_role` key) or spanning multiple tables/steps belongs in `apps/backend`, called via `src/lib/api-client.ts`.
- Framework-independent business rules (validation, role/permission logic) live in `packages/shared`, not here.
- Shared UI belongs in `src/components`; code specific to one capability stays inside its feature.
