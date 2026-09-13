# Sprint 1 traceability

This is the living link between Jira, acceptance criteria, implementation, and test evidence. PB-02 remains a 5-point parent story; its subtasks do not receive story points.

| Jira ID | Acceptance criteria | Implementation | Test cases and automated evidence | Status |
| --- | --- | --- | --- | --- |
| PB-02 | AC01, AC02 | `event-request.ts`; `event-request-form.tsx`; `save_event_draft` migration function | TC-PB02-01, 04–09; shared schema, form and database tests | Automated tests passing locally |
| PB-02 | AC03, AC07 | `save_event_draft`; `event-drafts.ts`; `EventRequestEditorPage.tsx` | TC-PB02-02, 03, 15; database atomicity tests | Automated tests passing locally; shared-environment execution pending |
| PB-02 | AC04 | `EventsPage.tsx`; database Draft defaults and transaction | TC-PB02-01, 10; events page and database tests | Automated tests passing locally |
| PB-02 | AC05 | `EventRequestForm`; editor create/edit routes; draft service | TC-PB02-03, 15; failure-retention and rollback tests | Automated tests passing locally |
| PB-02 | AC06 | Draft-only delete control, confirmation dialog, delete RLS policy and cascade relationships | TC-PB02-11, 12; events page and database tests | Automated tests passing locally; shared-environment execution pending |
| PB-02 | AC08 | Protected routes, caller-scoped Supabase access, event and child-table RLS | TC-PB02-13, 14; Playwright redirect and database identity tests | Automated tests passing locally; shared-environment execution pending |
| PB-03 | AC01, AC03 | `eventSubmissionSchema` in `event-request.ts`; `submit_event_request` completeness checks | TC-PB03-01, 02, 03; shared schema and database tests | Automated tests passing locally |
| PB-03 | AC02 | `requirementsAcknowledged` field, checkbox and column; venue-requirement and registration-capacity checks in `submit_event_request` | TC-PB03-03, 04; shared schema and database tests | Automated tests passing locally |
| PB-03 | AC04 | `submitted_at`/`submitted_by` columns; `EventsPage.tsx` submission timestamp | TC-PB03-03, 05; component and database tests | Automated tests passing locally |
| PB-03 | AC05 | `submit_event_request`; `event_status_transition_allowed`; `event-submissions.route.ts`; `EventRequestEditorPage.tsx` submit mode | TC-PB03-03, 06, 09, 10; database and route tests | Automated tests passing locally; shared-environment execution pending |
| PB-03 | AC06 | Shared cross-field `superRefine`; `submit_event_request` issue accumulation; route SQLSTATE mapping; `EventRequestForm` field-error merge | TC-PB03-01, 02, 08, 09; unit, component, route and database tests | Automated tests passing locally |
| PB-03 | AC07 | Widened `"organisers edit their drafts"` policy family; `save_event_draft` status gate; `EventsPage.tsx` Edit request action | TC-PB03-07; database and component tests | Automated tests passing locally |
| PB-04 | AC01, AC03 | `assign_event_coordinator`; `events_assignment_after_submission` constraint; `events_prevent_coordinator_reassignment` trigger; called from `submit_event_request` | TC-PB04-01, 02, 05, 06; database tests | Automated tests passing locally |
| PB-04 | AC02 | `assigned_coordinator` profile join in `event-drafts.ts`; `EventsPage.tsx` coordinator display | TC-PB04-07; component test | Automated tests passing locally |
| PB-04 | AC04 | `notifications` insert in `assign_event_coordinator` | TC-PB04-03; database test | Automated tests passing locally |
| PB-04 | AC05 | `events_prevent_coordinator_reassignment` trigger | TC-PB04-04; database test | Automated tests passing locally |

## Implementation locations

- Shared contract and validation: `packages/shared/src/schemas/event-request.ts`; `packages/shared/src/domain/event-status.ts`; `packages/shared/src/errors/event-submission-error.ts`
- Database and RLS: `supabase/migrations/202609120001_pb02_event_drafts.sql`; `supabase/migrations/202609130001_pb03_event_status_requested.sql`; `202609130002_pb03_submit_event_request.sql`; `202609130003_pb03_edit_requested_event.sql`
- Backend route: `apps/backend/src/routes/event-submissions.route.ts`
- Persistence mapping: `apps/frontend/src/features/event-requests/services/event-drafts.ts`; `event-submissions.ts`
- Shared form: `apps/frontend/src/features/event-requests/components/event-request-form.tsx`
- List, submission and deletion: `apps/frontend/src/routes/EventsPage.tsx`
- Create, reopen, edit and submit: `apps/frontend/src/routes/EventRequestEditorPage.tsx`
- Coordinator assignment: `supabase/migrations/202609140001_pb04_coordinator_assignment.sql`; `packages/shared/src/domain/coordinator-assignment.ts`
- Decision record: `docs/architecture/adr/0003-submission-through-backend.md`

## Evidence rule

Manual evidence must record the exact commit, environment, tester, execution date and evidence link. PB-02 can move to Done only when all approved manual cases have been executed against the shared environment and Shernice has approved the pull request. PB-03 can move to Done only when TC-PB03-10 has been executed against the shared environment (organiser `jasmine@gmail.com`, coordinator `joyce@gmail.com`) and its reviewer, Guang Hao, has approved the pull request. PB-04 can move to Done only when TC-PB04-08 has been executed against the shared environment and its reviewer, Kai Kin, has approved the pull request.
