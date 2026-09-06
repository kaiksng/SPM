# Sprint 1 test strategy

## Test layers

- Unit tests cover validation, calculations, status transitions, and authorization decisions without a network.
- Component tests cover forms, validation messages, role-specific controls, and loading, error, and empty states.
- Database tests cover schema constraints, triggers, and RLS using different authenticated identities.
- Integration tests cover server operations against an isolated test database, never the team's shared data.
- Playwright tests cover only the sprint's highest-value end-to-end journeys.

## Required Sprint 1 journeys

Populate this section directly from the locked stories and acceptance criteria. At minimum, test the happy path, validation failure, unauthorized role, and relevant empty or error state for each journey.

## Test data rule

Tests create uniquely named records and clean them up. Database reset tests run only in CI's temporary database, never against the team's shared hosted project. Tests must not depend on execution order or another teammate's data.
