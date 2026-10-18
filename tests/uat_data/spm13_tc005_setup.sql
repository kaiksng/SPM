-- SPM-13 TC-005: Block unauthenticated access to protected event information
-- Acceptance criterion: AC3 / Scenario 3
-- Login: none (the case starts signed out)
-- Inputs entered during the test (not inserted): URL "/events"
-- Source: User is not signed in
-- Records restored: none
-- Must-not-exist conditions enforced: none
-- Defaults added: none
-- Safe to re-run: changes this case's test records only; stops without changes if real data would be affected.
-- Run with: pnpm uat:setup spm13_tc005   (from the repo root; see tests/uat_data/README.md)

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

-- Nothing to restore: this case needs no data, only a signed-out browser.

COMMIT;

SELECT 'spm13_tc005_setup.sql: setup complete' AS result;
