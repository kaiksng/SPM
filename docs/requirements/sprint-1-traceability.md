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

## Implementation locations

- Shared contract and validation: `packages/shared/src/schemas/event-request.ts`
- Database and RLS: `supabase/migrations/202609120001_pb02_event_drafts.sql`
- Persistence mapping: `apps/frontend/src/features/event-requests/services/event-drafts.ts`
- Shared form: `apps/frontend/src/features/event-requests/components/event-request-form.tsx`
- List and deletion: `apps/frontend/src/routes/EventsPage.tsx`
- Create, reopen and edit: `apps/frontend/src/routes/EventRequestEditorPage.tsx`

## Evidence rule

Manual evidence must record the exact commit, environment, tester, execution date and evidence link. PB-02 can move to Done only when all approved manual cases have been executed against the shared environment and Shernice has approved the pull request.
