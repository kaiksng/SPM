# Feature modules

Product code is organised by capability rather than by technical layer. Each feature owns the frontend and server-side code needed to deliver that capability.

Create subdirectories only when they contain real code:

```text
feature-name/
  actions/       Authenticated write operations
  components/    Feature-specific interface components
  domain/        Framework-independent business rules
  queries/       Read operations
  schemas/       Runtime input validation
  types/         Feature-specific TypeScript types
```

Rules:

- Pages compose features; they do not contain database queries or business rules.
- Components use the browser client only for operations that are safe under Row Level Security.
- Actions validate input, establish the authenticated user, and rely on RLS as the final authorization boundary.
- Domain code does not import React, Next.js, or Supabase.
- Shared UI belongs in `src/components`; code specific to one capability stays inside its feature.
