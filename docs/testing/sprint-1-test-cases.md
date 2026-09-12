# Sprint 1 test cases — PB-02

## Test approach

- Unit tests cover boundaries and validation without a network.
- Component tests cover field feedback, failure-state retention, list status and deletion confirmation.
- Database tests cover atomic persistence, constraints, cascade deletion and RLS with multiple identities.
- Playwright covers unauthenticated protected-route access.
- Manual execution uses the shared Supabase project only after its migration is deployed.

Test specifications remain separate from execution results. Never store account passwords in this file, Jira, Git, screenshots or evidence links.

## PB-02 specifications and execution record

| Test ID | AC | Scenario and preconditions | Test steps and data | Expected result | Test layer | Actual Result | Pass/Fail | Executed By | Execution Date | Build/Commit | Evidence Link |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-PB02-01 | AC01, AC04 | Event Organiser is authenticated and has no matching draft. | Open Create Event Request. Enter `[Kai Test] ABC`. Leave every other field blank. Select Save Draft. | One Draft is created, appears in the organiser’s list with a Draft label, and is not assigned for review. | E2E/manual | Draft created in shared Supabase and displayed with Draft status; database automation verified no coordinator assignment. Test record deleted. | Pass | Codex | 2026-09-12 | f059ccd | `pb02-shared.spec.ts`; `pb02_event_drafts.test.sql` |
| TC-PB02-02 | AC03, AC07 | Event Organiser is authenticated. | Enter all event, schedule, venue, facility, equipment and registration values. Save, leave and reopen. | Every accepted value matches what was entered. | Integration/manual | Full event, venue, facility, equipment and registration values matched after reopening in the shared environment. Test record deleted. | Pass | Codex | 2026-09-12 | f059ccd | `pb02-shared.spec.ts`; PB-02 screenshots |
| TC-PB02-03 | AC05 | An owned Draft exists. | Change attendance from `120` to `150`, change the description and add one facility. Save and reopen. | Updated values appear; unchanged values remain; success feedback is shown. | Component/integration | Automated component and database coverage added | Automated pass | Codex | 2026-09-12 | f059ccd | `event-request-form.test.tsx`; `pb02_event_drafts.test.sql` |
| TC-PB02-04 | AC01 | Event Organiser is creating a draft. | Enter a 2-character event name and save. | Save is blocked and the event-name error is shown. | Unit/component | Boundary validation automated | Automated pass | Codex | 2026-09-12 | f059ccd | `event-request.test.ts` |
| TC-PB02-05 | AC01 | Event Organiser is creating a draft. | Enter a 3-character event name and save. | Save succeeds. | Unit/integration | Boundary validation automated | Automated pass | Codex | 2026-09-12 | f059ccd | `event-request.test.ts`; `event-request-form.test.tsx` |
| TC-PB02-06 | AC01 | Event Organiser is creating a draft. | Enter an event name containing exactly 160 characters and save. | Save succeeds without truncating the name. | Unit/integration | Boundary validation automated | Automated pass | Codex | 2026-09-12 | f059ccd | `event-request.test.ts` |
| TC-PB02-07 | AC01 | Event Organiser is creating a draft. | Enter an event name containing 161 characters and save. | Save is blocked and the maximum-length error is shown. | Unit/component | Boundary validation automated | Automated pass | Codex | 2026-09-12 | f059ccd | `event-request.test.ts` |
| TC-PB02-08 | AC02 | Event Organiser is creating or editing a draft. | Test attendance with blank, `0`, `1`, and `1.5`. | Blank and `1` are accepted. `0` and `1.5` are rejected clearly. | Parameterised unit/component | Boundary validation automated | Automated pass | Codex | 2026-09-12 | f059ccd | `event-request.test.ts`; `event-request-form.test.tsx` |
| TC-PB02-09 | AC02 | Start time is `25 Sep 2026 10:00`. | Test end time as blank, `09:59`, `10:00`, and `10:01`. | Blank and `10:01` are accepted. `09:59` and `10:00` are rejected. | Parameterised unit/component | Boundary validation automated | Automated pass | Codex | 2026-09-12 | f059ccd | `event-request.test.ts`; `event-request-form.test.tsx` |
| TC-PB02-10 | AC04 | An owned Draft exists. | View the organiser’s event list and inspect database state. | Draft label is visible, status is `draft`, and no coordinator is assigned. | Component/database | UI and database assertions automated | Automated pass | Codex | 2026-09-12 | f059ccd | `EventsPage.test.tsx`; `pb02_event_drafts.test.sql` |
| TC-PB02-11 | AC06 | An owned Draft with requirement records exists. | Select Delete, then confirm. | Draft disappears and associated requirement records are removed. | Integration/manual | Draft disappeared after shared-environment confirmation; database test verified cascade cleanup. | Pass | Codex | 2026-09-12 | f059ccd | `pb02-shared.spec.ts`; `EventsPage.test.tsx`; `pb02_event_drafts.test.sql` |
| TC-PB02-12 | AC06 | An owned Draft exists. | Select Delete, then cancel confirmation. | Draft remains unchanged and visible. | Component | Cancellation automated | Automated pass | Codex | 2026-09-12 | f059ccd | `EventsPage.test.tsx` |
| TC-PB02-13 | AC08 | No user is authenticated. | Navigate directly to the draft edit URL. | Redirected to sign-in and no draft information is shown. | E2E | Browser redirected to sign-in and did not render draft fields. | Pass | Codex | 2026-09-12 | f059ccd | `tests/e2e/auth.spec.ts` |
| TC-PB02-14 | AC08 | A second organiser or another role is authenticated. | Attempt read, update and delete on Kai’s test draft. | Every operation is denied and no protected values are returned. | Database/RLS and manual | Second organiser received Draft unavailable; database identity tests denied read, update and delete. | Pass | Codex | 2026-09-12 | f059ccd | `pb02-shared.spec.ts`; `pb02_event_drafts.test.sql` |
| TC-PB02-15 | AC03, AC05 | An existing Draft has valid data. | Cause one requirement write to fail during a later save. | Error shown, form retains attempted inputs, and stored draft remains consistent without partial update. | Database/integration | UI retention and transaction rollback automated | Automated pass | Codex | 2026-09-12 | f059ccd | `event-request-form.test.tsx`; `pb02_event_drafts.test.sql` |

## Shared-environment execution rules

1. Use the first Event Organiser account in the planning workbook as Kai’s identity and the second as the unauthorized-organiser identity.
2. Prefix temporary event names with `[Kai Test]`.
3. Do not reset the shared database. Delete only the test records created for this execution.
4. Record commit, environment, tester, date, actual result and evidence link for every manual case.
