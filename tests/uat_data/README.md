# UAT setup data

SQL scripts that prepare the database for user acceptance testing (UAT). Each script belongs to one
test case and puts the data that case needs into its starting state, so the case gives the same
result every time it is run, no matter what earlier testers did.

There is **one Supabase database**: the project's real database, the same one the app uses. Running
a script writes to it. Run only the script for the case you are about to test.

These scripts are **not migrations or seed data**. Supabase only applies `supabase/migrations/`, and
seeding is turned off in `supabase/config.toml`, so `supabase db push`, `supabase db reset` and CI
never run them. A script only runs when a tester runs it from the terminal.

## Quick start

1. One-time setup: put the database connection string in `.env.local` (see [One-time setup](#one-time-setup)).
2. Find the script for your test case (see [Finding the right script](#finding-the-right-script)).
3. Run `pnpm uat:setup <case>` from the repo root, e.g. `pnpm uat:setup spm88_tc001`
   (see [Running a script](#running-a-script)).
4. Check the last line says `Done: <case> starting state restored`.
5. Check the starting state against the case's Preconditions (see [Reading a case's Preconditions](#reading-a-cases-preconditions)),
   then log in with the account it names and carry out the test steps.

Run the script **right before** each test, even if you ran it earlier. Other testers may have
changed the same data since.

## One-time setup

1. Get the database connection string (**Session pooler**, from Supabase → Project Settings →
   Database) from a team member with dashboard access. It contains the database admin password.
2. Copy `.env.example` at the repo root to `.env.local` (also at the repo root, not in `apps/frontend`
   or `apps/backend`) and fill in the string:

   ```
   SUPABASE_DB_URL=postgresql://...
   ```

   `.env.local` is git-ignored. Never commit it, paste it in chat, or share it outside the scrum team.
3. Run `pnpm install` at the repo root (it installs the `pg` and `dotenv` packages the runner uses).

External testers (customer, product owner, TA) never get the connection string. A team member runs
the setup for them just before they test.

## Finding the right script

Scripts are named after the Jira story and test case number:

```
spm<story>_tc<case number, 3 digits>_setup.sql
```

| Test case | Script |
|---|---|
| SPM-88 TC-001 | `spm88_tc001_setup.sql` |
| SPM-18 TC-012 | `spm18_tc012_setup.sql` |

The first line of the case's Preconditions names the script (`Run spm88_tc001_setup.sql`). The top
of every script also describes, in plain text:

- the test case and what it checks,
- which account to log in with,
- what the tester enters during the test (this is *not* inserted by the script),
- which records the script sets up, and what it may remove.

Read the header before running a script for the first time.

## Setup files: SPM-14, 15, 16, 20, 48, 49, 76, 77 and 87

Each file restores only its own case's test records. "May remove" lists what it can delete, cancel or
mark removed besides restoring its records; the full list is in each file's header.

| File | Run | Case | Test scenario | Login | May remove |
|---|---|---|---|---|---|
| `spm14_tc001_setup.sql` | `pnpm uat:setup spm14_tc001` | SPM-14 TC-001 | View details of an event the Organiser is authorised on | jasmine@gmail.com | none |
| `spm14_tc002_setup.sql` | `pnpm uat:setup spm14_tc002` | SPM-14 TC-002 | View every event when authorised on more than one | jasmine@gmail.com | none |
| `spm14_tc003_setup.sql` | `pnpm uat:setup spm14_tc003` | SPM-14 TC-003 | Perform a permitted action on an authorised event | jasmine@gmail.com | none |
| `spm14_tc004_setup.sql` | `pnpm uat:setup spm14_tc004` | SPM-14 TC-004 | An action on an unauthorised event is denied and changes nothing | jasmine@gmail.com | none |
| `spm14_tc005_setup.sql` | `pnpm uat:setup spm14_tc005` | SPM-14 TC-005 | Direct entry of an unauthorised event's address is denied | jasmine@gmail.com | none |
| `spm15_tc001_setup.sql` | `pnpm uat:setup spm15_tc001` | SPM-15 TC-001 | Coordinator sees a list of assigned events | joyce@gmail.com | none |
| `spm15_tc002_setup.sql` | `pnpm uat:setup spm15_tc002` | SPM-15 TC-002 | Events assigned to other Coordinators are not shown | joyce@gmail.com | none |
| `spm15_tc003_setup.sql` | `pnpm uat:setup spm15_tc003` | SPM-15 TC-003 | Open an event from the list to view its details | joyce@gmail.com | none |
| `spm16_tc001_setup.sql` | `pnpm uat:setup spm16_tc001` | SPM-16 TC-001 | View information permitted for Venue Staff | daryl@gmail.com | none |
| `spm16_tc002_setup.sql` | `pnpm uat:setup spm16_tc002` | SPM-16 TC-002 | Access to information outside scope is denied | daryl@gmail.com | none |
| `spm16_tc003_setup.sql` | `pnpm uat:setup spm16_tc003` | SPM-16 TC-003 | A denied attempt is handled gracefully with a clear message | daryl@gmail.com | none |
| `spm16_tc004_setup.sql` | `pnpm uat:setup spm16_tc004` | SPM-16 TC-004 | Technical Support-only information is not accessible to Venue Staff | daryl@gmail.com | none |
| `spm20_tc001_setup.sql` | `pnpm uat:setup spm20_tc001` | SPM-20 TC-001 | View a venue's calendar showing Available, Booked, and Blocked periods together | daryl@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm20_tc002_setup.sql` | `pnpm uat:setup spm20_tc002` | SPM-20 TC-002 | A Booked period shows its start time, end time, and booking type | daryl@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm20_tc003_setup.sql` | `pnpm uat:setup spm20_tc003` | SPM-20 TC-003 | A Blocked (operational) period shows its start time, end time, and block type | daryl@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm20_tc004_setup.sql` | `pnpm uat:setup spm20_tc004` | SPM-20 TC-004 | A venue with no bookings or blocks shows as fully Available | daryl@gmail.com | removes blocks on its test venues |
| `spm20_tc005_setup.sql` | `pnpm uat:setup spm20_tc005` | SPM-20 TC-005 | The free time before a known booking shows as Available | daryl@gmail.com | cancels other requests of its test events; removes blocks on its test venues; removes the "Aircon servicing" block |
| `spm48_tc001_setup.sql` | `pnpm uat:setup spm48_tc001` | SPM-48 TC-001 | View information permitted for Technical Support | andy@gmail.com | none |
| `spm48_tc002_setup.sql` | `pnpm uat:setup spm48_tc002` | SPM-48 TC-002 | Access to information outside scope is denied | andy@gmail.com | none |
| `spm48_tc003_setup.sql` | `pnpm uat:setup spm48_tc003` | SPM-48 TC-003 | An unauthorised attempt is handled gracefully with a clear message | andy@gmail.com | none |
| `spm48_tc004_setup.sql` | `pnpm uat:setup spm48_tc004` | SPM-48 TC-004 | Venue Staff-only information is not accessible to Technical Support | andy@gmail.com | none |
| `spm49_tc001_setup.sql` | `pnpm uat:setup spm49_tc001` | SPM-49 TC-001 | Attendee views the attendee landing page | joseph@gmail.com | none |
| `spm49_tc002_setup.sql` | `pnpm uat:setup spm49_tc002` | SPM-49 TC-002 | Internal planning information is not displayed to the Attendee | joseph@gmail.com | none |
| `spm49_tc003_setup.sql` | `pnpm uat:setup spm49_tc003` | SPM-49 TC-003 | Direct entry of an internal planning page's URL is denied | joseph@gmail.com | none |
| `spm76_tc001_setup.sql` | `pnpm uat:setup spm76_tc001` | SPM-76 TC-001 | Notification centre lists only the signed-in user's own notifications, newest first, with title/message/time | joyce@gmail.com | other notifications of joyce@gmail.com |
| `spm76_tc002_setup.sql` | `pnpm uat:setup spm76_tc002` | SPM-76 TC-002 | Unread count badge in navigation matches the number of unread notifications | joyce@gmail.com | other notifications of joyce@gmail.com |
| `spm76_tc003_setup.sql` | `pnpm uat:setup spm76_tc003` | SPM-76 TC-003 | Selecting a notification marks it read and decrements the unread badge | joyce@gmail.com | other notifications of joyce@gmail.com |
| `spm76_tc005_setup.sql` | `pnpm uat:setup spm76_tc005` | SPM-76 TC-005 | Selecting a notification opens the related event when the user has access to it | joyce@gmail.com | none |
| `spm76_tc006_setup.sql` | `pnpm uat:setup spm76_tc006` | SPM-76 TC-006 | Notification centre with zero notifications shows an empty state and no badge | joyce@gmail.com | all notifications of joyce@gmail.com |
| `spm76_tc007_setup.sql` | `pnpm uat:setup spm76_tc007` | SPM-76 TC-007 | A user cannot view another user's notifications | jonathan@gmail.com | other notifications of jonathan@gmail.com |
| `spm77_tc001_setup.sql` | `pnpm uat:setup spm77_tc001` | SPM-77 TC-001 | Event Coordinator Lead is routed to the Lead home page on sign-in | tom@gmail.com | none |
| `spm77_tc002_setup.sql` | `pnpm uat:setup spm77_tc002` | SPM-77 TC-002 | Safety Officer is routed to the Safety Checks page on sign-in | sally@gmail.com | none |
| `spm77_tc003_setup.sql` | `pnpm uat:setup spm77_tc003` | SPM-77 TC-003 | Lead can view all events and their assignments | tom@gmail.com | none |
| `spm77_tc004_setup.sql` | `pnpm uat:setup spm77_tc004` | SPM-77 TC-004 | Lead attempting an out-of-scope action is denied with a clear message | tom@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm77_tc005_setup.sql` | `pnpm uat:setup spm77_tc005` | SPM-77 TC-005 | Lead attempting to reach the Safety Officer's page directly is denied | tom@gmail.com | none |
| `spm77_tc006_setup.sql` | `pnpm uat:setup spm77_tc006` | SPM-77 TC-006 | Safety Officer attempting to reach the Lead home page directly is denied | sally@gmail.com | none |
| `spm87_tc001_setup.sql` | `pnpm uat:setup spm87_tc001` | SPM-87 TC-001 | Effective occupancy window is computed as (event start - setup) to (event end + turnaround) | jonathan@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm87_tc002_setup.sql` | `pnpm uat:setup spm87_tc002` | SPM-87 TC-002 | Zero setup and turnaround makes the effective window equal to the raw event time | jonathan@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm87_tc003_setup.sql` | `pnpm uat:setup spm87_tc003` | SPM-87 TC-003 | Two effective windows with a clear gap between them do not conflict | jonathan@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm87_tc004_setup.sql` | `pnpm uat:setup spm87_tc004` | SPM-87 TC-004 | Two effective windows that only touch (one ends exactly when the other begins) do not conflict | jonathan@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm87_tc005_setup.sql` | `pnpm uat:setup spm87_tc005` | SPM-87 TC-005 | Effective windows overlapping by the smallest margin past the touch point are a conflict | jonathan@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm87_tc006_setup.sql` | `pnpm uat:setup spm87_tc006` | SPM-87 TC-006 | Effective windows with a substantial overlap are a conflict | jonathan@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm87_tc007_setup.sql` | `pnpm uat:setup spm87_tc007` | SPM-87 TC-007 | A venue is available when its whole effective window falls within operating hours | jonathan@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm87_tc008_setup.sql` | `pnpm uat:setup spm87_tc008` | SPM-87 TC-008 | A venue is available when its effective window exactly matches the operating-hours boundary | jonathan@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm87_tc009_setup.sql` | `pnpm uat:setup spm87_tc009` | SPM-87 TC-009 | A venue is not available when its effective window extends outside operating hours | jonathan@gmail.com | cancels other requests of its test events; removes blocks on its test venues |
| `spm87_tc010_setup.sql` | `pnpm uat:setup spm87_tc010` | SPM-87 TC-010 | Availability calendar shows setup and turnaround periods visually distinct from the event time | jonathan@gmail.com | cancels other requests of its test events; removes blocks on its test venues |

## Reading a case's Preconditions

Every case's Preconditions has three parts, in this order:

1. **Setup line:** the script to run, e.g. `Run spm88_tc001_setup.sql`.
2. **Account line**, one of:
   - `Logged in as <Role> (<email>)`: log in with this account before step 1;
   - `<Role> (<email>) exists`: start signed out; you sign in with this account during the steps
     (e.g. a sign-in test);
   - `Not signed in`: no account is involved;
   - `No account for <email> exists`: the test needs this email to have no account.
3. **Key record lines:** what the script has set up for you to see, open or select, with the values
   that matter. For example:

   ```
   Run spm88_tc001_setup.sql
   Logged in as Venue Staff (daryl@gmail.com)
   Venue "Auditorium" exists (Central Area, setup 0 min, turnaround 0 min)
   Event "Bigbang Event" exists (Approved booking, Auditorium, 14 Dec 2026 10:00–12:00)
   Event "BTS Event" exists (Pending booking, Auditorium, 14 Dec 2026 13:00–15:00)
   Neither booking is flagged as a conflict
   ```

   A line like `No venue named "Fish tank" exists at North` means the script made sure that record
   is absent, usually because the test is about to create it.

The key record lines use the same names and values as the script. If what you see in the app after
running the script doesn't match them, stop and tell whoever maintains the test cases before testing.

All these accounts use the team's shared UAT password (see [Test accounts](#test-accounts)).

## Running a script

From the repo root, give the case name (the script name without `_setup.sql`):

```bash
pnpm uat:setup spm88_tc001
```

The runner (`scripts/uat-setup.mjs`) reads `SUPABASE_DB_URL` from `.env.local` and:

1. prints the case, what the script restores and removes, and the **database host** it will write to
   (never the password);
2. asks `Continue? (y/N)`. Check the host first: it should be the project's Supabase address. A
   `127.0.0.1` / `localhost` host is a local copy, not the shared database. Anything but `y` stops
   without connecting;
3. runs the script as one transaction and prints `Done: spm88_tc001 starting state restored`.

If anything fails, nothing is changed and the runner prints the reason (see
[When a script stops with an error](#when-a-script-stops-with-an-error)). It only runs files in
`tests/uat_data/` whose name matches a case (`spm<story>_tc<3 digits>`).

## Test accounts

The scripts use these existing test accounts. They never create or delete accounts; they only look
them up by email and set the account's role back to the one below. The password is the team's
shared UAT password, which is kept with the team and not in this repo.

| Email | Role |
|---|---|
| jasmine@gmail.com, kenneth@gmail.com | Event Organiser |
| joyce@gmail.com, jonathan@gmail.com | Event Coordinator |
| daryl@gmail.com, keith@gmail.com | Venue Staff |
| andy@gmail.com, benny@gmail.com | Technical Support Staff |
| tom@gmail.com | Event Coordinator Lead |
| sally@gmail.com | Safety Officer |
| joseph@gmail.com, daniel@gmail.com, bernard@gmail.com | Attendee |

## What a script changes

Only the records its own test case depends on:

| What it finds | What it does |
|---|---|
| The record is already correct | Leaves it alone. Running a script twice changes nothing |
| The record exists but a value changed (status, capacity, setup time, role…) | Resets the value |
| The record is missing | Inserts it |
| A record the test case needs to be absent (e.g. a venue the test is about to create) | Removes only that record, and only if it is test data |
| A real (non-test) record clashes with a test record (e.g. a real venue already called "Auditorium" at Central Area) | **Stops and changes nothing**, naming the record |
| Anything else in the database | Never touched |

A record counts as test data only if it has a reserved test id (see
[Test data in the database](#test-data-in-the-database)), is a test account's profile, or was created
by a test account (for venues: last saved by one; for events: organised by one).

**Events that can't be moved back.** An event that a tester cancelled or rejected cannot return to an
earlier status. In that case the script deletes that one test event (by its fixed id) and inserts it
again. Its own bookings, conflict flags and history are removed with it.

## What a script may remove

Every script lists its removals in its header. The kinds of removal used are:

- **Records a test creates.** For a "create" test, a venue with the same name and location as the
  one the tester will enter (for example one left behind by an earlier run of the same test). It is
  removed only if a test account created it or it has a test id; any other venue with that name stops
  the script.
- **A tester's copy of a test venue,** created in the app with the same name and location, when no
  booking or event uses it.
- **Conflict flags on the test's own bookings,** when the test needs them to start unflagged.
- **Other active bookings for a test event** (for example a venue a tester requested from the
  suggestions). These are cancelled, not deleted. The "Suggested venues" list only shows while an
  event has no active booking, so this keeps the suggestion cases repeatable.
- **Venue blocks on a test venue** during the test's own booking times. These are marked removed.
- **A test account's notifications,** when a case counts them (SPM-76: joyce@gmail.com in TC-001 to
  TC-003 and TC-006, jonathan@gmail.com in TC-007). Only that test account's notifications are removed.
- **A test event a tester cancelled.** A cancelled event can't return to Planning, so the script deletes
  that one test event and inserts it again. Its own bookings, notifications and history go with it, so
  run the other case's script again if it needs them (e.g. SPM-77's Townhall 2026 booking).
- **Test records from older versions of these scripts** (the old `00000000-0000-4000-80…` ids), with
  their own bookings, flags and history.

A venue that has bookings or is linked to an event is never removed. The script stops and says so.

## When a script stops with an error

Some starting states depend on data the scripts will not delete because it may belong to someone
else. The script stops, changes nothing, and the error message says what is in the way:

| Message mentions | What to do |
|---|---|
| `UAT setup stopped: a real venue named … exists` | A real venue uses a test venue's name and location. Tell whoever maintains the test cases (they can rename the test venue); don't edit data by hand |
| `UAT setup stopped: a venue named … exists that was not created by a test account` | Someone else already made the venue a create test will add. Tell whoever maintains the test cases |
| `UAT setup stopped: a real event already has id …` | Tell whoever maintains the test cases |
| `UAT setup stopped: an old test venue is still used by a non-test booking or event` | Tell whoever maintains the test cases |
| `SUPABASE_DB_URL is not set` | Do the [One-time setup](#one-time-setup) |
| A test account is missing from Supabase Auth | Ask the team to create the account |
| An account exists that the test needs to be absent | Ask the team whether it can be removed |
| A venue has bookings or linked events | Tell whoever maintains the test cases; don't edit data by hand |
| Venues "would be suggested" | A real venue matches the test's search; tell whoever maintains the test cases |
| Another booking already occupies a test venue | Tell whoever maintains the test cases, or ask the booking's owner |

## Testing tips

- **Test one story at a time.** Cases in the same story share records (for example "Auditorium"),
  so running another case's script resets them.
- **Before the first UAT session,** someone with dashboard access takes a data backup
  (`supabase db dump --data-only -f <file>`, kept outside the repo).
- **After the UAT period,** change the database password so shared copies of the connection string
  stop working.

## Test data in the database

Test records have recognisable fixed ids, so they are easy to find:

```
00000000-0000-0000-<story, 4 digits>-<number>     e.g. 00000000-0000-0000-0088-000000000101
```

The fourth part is the Jira story number (`0088` = SPM-88). Within a story, venues use numbers
in the 100s, events the 200s, venue bookings the 300s, notifications the 400s, equipment requirements
the 500s and venue blocks the 600s. The same record (for example the venue
"Auditorium") has the same id in every script for that story, so each script just resets it to the
state its own test needs. The SPM-17 TC-005 event keeps the id written in its test case's URL; it
counts as test data because a test account organises it, and its script stops if a real event ever
has that id.

## Adding a script for a new test case

1. Name it after the test case (see [Finding the right script](#finding-the-right-script)).
2. Copy the header of an existing script and fill it in: test case, login, inputs, records set up,
   removals.
3. Wrap everything in `BEGIN; … COMMIT;` and end with
   `SELECT '<script name>: setup complete' AS result;`.
4. Set up each record so it can be run again safely: give it a fixed id in the reserved range,
   insert it if missing, otherwise update only the values that differ.
5. Never change or remove a real (non-test) record. Guard every name a test record uses (e.g. a
   venue's name and location): if a real record has it, stop with an error that names it.
6. Never write to `auth` or other Supabase-managed schemas, never use `TRUNCATE` or `DROP`, and never
   put a password or connection string in a script.
7. Try it on a local Supabase first (`pnpm exec supabase start`), with `SUPABASE_DB_URL` set to the
   local database for that terminal only: run it twice, after changing its data by hand, and with a
   clashing "real" record, before anyone runs it on the real database.
