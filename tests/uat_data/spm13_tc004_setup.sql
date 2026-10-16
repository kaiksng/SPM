-- SPM-13 TC-004: Reject a email that does not exist
-- Acceptance criterion: AC2 / Scenario 2
-- Login: none (the case starts signed out)
-- Inputs entered during the test (not inserted): email jass@gmail.com and a wrong password
-- Source: User is not signed in.
-- Records restored: none
-- Must-not-exist conditions enforced: Auth account jass@gmail.com (checked only; the file stops if it exists)
-- Defaults added: none
-- Safe to re-run: restores this case's records only; all other data is left untouched.
-- Not a migration: run it by hand (Supabase SQL editor on testDB, or psql) right before the test.

BEGIN;

-- Allows this file to reset a test event's assigned coordinator (blocked by a trigger otherwise).
SET LOCAL app.coordinator_reassignment = 'on';

-- Must not exist: Auth account jass@gmail.com. Auth is never written; the file stops if it exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'jass@gmail.com') THEN
    RAISE EXCEPTION 'Account jass@gmail.com exists in Supabase Auth, so this case cannot run; ask the team to remove it';
  END IF;
END $$;

COMMIT;

SELECT 'spm13_tc004_setup.sql: setup complete' AS result;
