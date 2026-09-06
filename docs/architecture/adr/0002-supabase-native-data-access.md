# ADR 0002: Use Supabase-native data access

- Status: Accepted
- Date: 2026-09-06

## Decision

Use Supabase migrations, generated database types, and `@supabase/supabase-js`. Do not add Prisma.

## Why

Supabase is the chosen platform and its client integrates Auth identity with Row Level Security. A second ORM would duplicate schema and migration ownership, add connection-management concerns for serverless deployment, and make authorization behaviour less obvious.

## Consequences

Database changes begin as SQL migrations. The team regenerates `database.types.ts` after each schema change. Complex business rules should live in tested feature services or PostgreSQL functions, not scattered query code.
