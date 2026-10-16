# UAT setup data

SQL scripts that prepare testDB for user acceptance testing (UAT). Each script belongs to one test
case and puts the data that case needs into its starting state, so the case gives the same result
every time it is run, no matter what earlier testers did.

These scripts are **not migrations or seed data**. Supabase only applies `supabase/migrations/`, and
seeding is turned off in `supabase/config.toml`, so `supabase db push`, `supabase db reset` and CI never
run them. A script only runs when a person runs it.

## Quick start

1. Find the script for your test case (see [Finding the right script](#finding-the-right-script)).
2. Run it on testDB (see [Running a script](#running-a-script)).
3. Check the last line says `<script name>: setup complete`.
4. Log in with the test account the case uses and carry out the test.

Run the script **right before** each test, even if you ran it earlier. Other testers may have changed
the same data since.

## Finding the right script

Scripts are named after the Jira story and test case number:

```
spm<story>_tc<case number, 3 digits>_setup.sql
```

| Test case | Script |
|---|---|
| SPM-88 TC-001 | `spm88_tc001_setup.sql` |
| SPM-18 TC-012 | `spm18_tc012_setup.sql` |

The top of every script describes it in plain text:

- the test case and what it checks,
- which account to log in with,
- what the tester enters during the test (this is *not* inserted by the script),
- which records the script sets up, and what it may remove.

## Running a script

**Supabase SQL editor (easiest)**

1. Open the test project in the Supabase dashboard.
2. Go to **SQL Editor** and start a new query.
3. Paste the whole script and click **Run**.
4. The result should show `<script name>: setup complete`.

**psql**

```bash
psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 -f tests/uat_data/spm88_tc001_setup.sql
```

Each script runs as one transaction: if anything fails, nothing is changed.

## Test accounts

The scripts use these existing test accounts. They never create or delete accounts; they only look
them up by email and set the account's role back to the one below. The password is the team's shared
UAT password, which is kept with the team and not in this repo.

| Email | Role |
|---|---|
| jasmine@gmail.com, kenneth@gmail.com | Event Organiser |
| joyce@gmail.com, jonathan@gmail.com | Event Coordinator |
| daryl@gmail.com, keith@gmail.com | Venue Staff |
| andy@gmail.com, benny@gmail.com | Technical Support Staff |
| tom@gmail.com | Event Coordinator Lead |
| sally@gmail.com | Safety Officer |
| joseph@gmail.com, daniel@gmail.com | Attendee |

## What a script changes

Only the records its own test case depends on. It finds each one by a fixed id or by its name and
location:

| What it finds | What it does |
|---|---|
| The record is already correct | Leaves it alone. Running a script twice changes nothing |
| The record exists but a value changed (status, capacity, setup time, role…) | Resets the value |
| The record is missing | Inserts it |
| A record the test case needs to be absent (e.g. a venue the test is about to create) | Removes only that record |
| Anything else in the database | Never touched |

**Events that can't be moved back.** An event that a tester cancelled or rejected cannot return to an
earlier status. In that case the script deletes that one test event (by its fixed id) and inserts it
again. Its own bookings, conflict flags and history are removed with it.

## What a script may remove

Every script lists its removals in its header. The kinds of removal used are:

- **Records a test creates.** For a "create" test, a record with the same name and location as the
  one the tester will enter (for example a venue left behind by an earlier run of the same test).
- **Conflict flags on the test's own bookings,** when the test needs them to start unflagged.
- **Other active bookings for a test event** (for example a venue a tester requested). These are
  cancelled, not deleted.
- **Venue blocks on a test venue** during the test's own booking times. These are marked removed.
- **Notifications** a test checks for, when the test needs them not to exist yet. Only notifications
  about the test's own events, for the named test accounts, are removed.

A venue that has bookings or is linked to an event is never removed. The script stops and says so.

## When a script stops with an error

Some starting states depend on data the scripts will not delete because it may belong to someone
else. The script stops, changes nothing, and the error message says what is in the way:

| Message mentions | What to do |
|---|---|
| A test account is missing from Supabase Auth | Ask the team to create the account |
| An account exists that the test needs to be absent | Ask the team whether it can be removed |
| A venue has bookings or linked events | Remove or move that venue by hand, or ask its owner |
| Venues "would be suggested" | A real venue matches the test's search; ask the team before changing it |
| Another booking already occupies a test venue | Cancel that booking, or ask its owner |

Fix the named data, then run the script again.

## Test data in the database

All test records have recognisable fixed ids, so they are easy to find and never clash with real data:

```
00000000-0000-4000-80<story>-<number>     e.g. 00000000-0000-4000-8088-000000000101
```

The `80<story>` part is the Jira story number (`8088` = SPM-88). Within a story, venues use numbers
in the 100s, events the 200s and venue bookings the 300s. The same record (for example the venue
"Auditorium") has the same id in every script for that story, so each script just resets it to the
state its own test needs.

## Adding a script for a new test case

1. Name it after the test case (see [Finding the right script](#finding-the-right-script)).
2. Copy the header of an existing script and fill it in: test case, login, inputs, records set up,
   removals.
3. Wrap everything in `BEGIN; … COMMIT;` and end with
   `SELECT '<script name>: setup complete' AS result;`.
4. Set up each record so it can be run again safely: find it by a fixed id or a unique name, insert it
   if missing, otherwise update only the values that differ.
5. Only remove records that exactly match what the test needs to be absent, and list them in the
   header.
6. Never write to `auth` or other Supabase-managed schemas, never use `TRUNCATE` or `DROP`, and never
   put a password in a script.
7. Try it on a local Supabase first (`pnpm exec supabase start`), running it twice and after changing
   its data by hand, before anyone runs it on testDB.
