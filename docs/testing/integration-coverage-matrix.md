# Integration coverage matrix

Source: `SPM List - Jira (6).csv`, read 2026-10-31. SHA-256: `384255afb34a03ec2dac08f28242f15e7e702af5414f117c3336b5fc421926ae`.

57 non-retired stories; 336 ACs and 21 separately labelled source scenarios. Explicit Jira AC numbers are retained; unnumbered criteria use source order. Nested bullets stay with their parent. Retired SPM-5, SPM-34, SPM-66 and SPM-67 are excluded.

## Evidence and status

Existing links identify inspected test entry points, not a claim that every AC is covered or that the files passed. Unit/component and mocked route tests isolate code; pgTAP already integrates real database functions, tables, triggers and RLS. APP means the missing real application-to-local-Supabase boundary. APP coverage is implemented for SPM-2, SPM-13, SPM-14, SPM-86, SPM-87, SPM-20, SPM-21, SPM-88 and SPM-19; execution results are recorded in integration-testing.md. The remaining 48 stories are planned.

Before each later story, audit the named tests against the exact ACs, settle contradictions and obtain the next-story instruction. For each APP criterion, assert observable output and independent stored state, actor permissions, relevant history/notifications, failure invariants and cleanup. Keep presentation, navigation, highlighting and confirmation assertions in UI/E2E tests.

## Requirements decisions

- **SPM-19:** Source export still says reject an overlapping block; SPM-83 AC2 and the application save it and flag affected bookings. The user confirmed Jira was updated to align with the current behaviour; the supplied export predates that update.
- **SPM-12:** REOPEN: exactly eight Jira statuses conflicts with the shared enum retaining legacy statuses. Resolve expected compatibility before writing an assertion.
- **SPM-24:** REOPEN: verify revised occupancy states and interaction with additional bookings before implementation.
- **SPM-85:** DECISION REQUIRED: export has 14 ACs, including required-room cascading, but booking records have no required-room flag. Resolve AC5 exactly-one-main versus AC13 loss of main, and the earlier recorded 12-AC agreement.
- **SPM-83:** AC3 unchanged event status has an explicit Pending Safety Check exception in AC13; test both contexts.

SPM-38 AC2 cites direct edits under SPM-10 although that story describes coordinator Planning edits. Confirm the intended organiser edit path before using that reference as an oracle.

Concurrency increments: SPM-81 simultaneous assignment; SPM-26 overlapping bookings; SPM-78 competing holds; SPM-32 shared stock; SPM-41 last-place registration; SPM-42 queue promotion. Use independent clients and assert invariant totals without choosing the winner.

## 1. Authentication and event intake

### SPM-2 — Create and Save a Draft Event Request (Done)

**Real boundary to exercise:** Draft service → shared serializer → Auth/PostgREST/RPC → requirements and RLS.

**Existing evidence locations:** [event-request-form.test.tsx](../../apps/frontend/src/features/event-requests/components/event-request-form.test.tsx); [event-drafts.test.ts](../../apps/frontend/src/features/event-requests/services/event-drafts.test.ts); [BrowseEventsPage.test.tsx](../../apps/frontend/src/routes/BrowseEventsPage.test.tsx); [EventRequestEditorPage.test.tsx](../../apps/frontend/src/routes/EventRequestEditorPage.test.tsx); [EventsPage.test.tsx](../../apps/frontend/src/routes/EventsPage.test.tsx); [event-request.test.ts](../../packages/shared/src/schemas/event-request.test.ts); [pb02_event_drafts.test.sql](../../supabase/tests/database/pb02_event_drafts.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | An authenticated Event Organiser can save an event request as a Draft with only the event name completed. Fields required for submission may remain incomplete. | APP pilot: name-only persistence. |
| AC02 | The owning organiser can reopen and edit a Draft repeatedly, and all the latest successfully saved values are displayed when it is reopened. | APP pilot: rich round-trip, replacement and failed-save preservation; UI checks reopening. |
| AC03 | A saved request retains the status Draft, is clearly identified by a Draft label, and does not enter the coordinator assignment, review or downstream planning workflow. | APP pilot: Draft and no downstream work; UI checks label. |
| AC04 | The owning organiser can delete a Draft only after confirming the deletion, after which the Draft and its associated Draft information are no longer available. | APP pilot: deletion/cascade; UI checks confirmation. |
| AC05 | Cancelling the deletion confirmation keeps the Draft unchanged and available. | UI only: existing EventsPage cancellation and Escape tests; no write should occur. |
| AC06 | An unauthenticated user or a user who does not own the Draft cannot view, edit or delete it, and no protected Draft information is displayed. | APP pilot: real second-user and anonymous denial; UI checks protected rendering. |

### SPM-13 — Authenticate via Sign-In (Done)

**Real boundary to exercise:** Login action → local Auth → stored profile and real session; apiFetch → Express/Auth → protected RPC. Screen navigation stays UI.

**Application integration:** [SPM-13 sign-in suite](../../tests/integration/spm13-login.integration.test.ts).

**Existing evidence locations:** [auth.test.ts](../../apps/backend/src/middleware/auth.test.ts); [login.test.ts](../../apps/frontend/src/features/auth/actions/login.test.ts); [login-form.test.tsx](../../apps/frontend/src/features/auth/components/login-form.test.tsx); [auth.spec.ts](../../tests/e2e/auth.spec.ts).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | A user with valid credentials can sign in and is routed to a role-appropriate view. | APP implemented: real login/session/profile and expected destination for all seven roles. Actual screen navigation stays UI. |
| AC02 | Invalid credentials are rejected with a generic error message that does not reveal which credential (username or password) was incorrect. | APP implemented: wrong-password and unknown-email cases return the same generic message and no session. Message rendering stays UI. |
| AC03 | An unauthenticated user cannot access any protected information or action. | APP implemented: signed-out protected read/action denial and invalid bearer rejection, with a valid-session control and unchanged stored draft. Page redirects stay UI; resource-specific permission coverage belongs to later stories. |
| Scenario S01 | Given a user enters valid credentials When they submit the sign-in form Then they are authenticated and directed to a view appropriate to their role. | Mapped to AC01; integration and UI responsibilities as above. |
| Scenario S02 | Given a user enters invalid credentials When they submit the sign-in form Then the sign-in is rejected with a generic error that does not indicate whether the username or password was incorrect. | Mapped to AC02; integration and UI responsibilities as above. |
| Scenario S03 | Given a user is not authenticated, when they attempt to access protected information Then access is denied and they are redirected to sign in | Mapped to AC03; integration and UI responsibilities as above. |


### SPM-14 — Organiser Access Restricted to Own Events (Done)

**Real boundary to exercise:** Organiser list/detail/history services → real RLS; API authentication → submission RPC; real cancellation RPC and direct ownership update protection.

**Application integration:** [SPM-14 organiser access suite](../../tests/integration/spm14-organiser-access.integration.test.ts); existing SPM-2 cross-organiser draft save/delete denial.

**Existing evidence locations:** [event-drafts.test.ts](../../apps/frontend/src/features/event-requests/services/event-drafts.test.ts); [EventDetailPage.test.tsx](../../apps/frontend/src/routes/EventDetailPage.test.tsx).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | An Organiser can view events they are authorised on. | APP implemented: nonempty own lists and owner detail/requirements/history reads in eight current business states. UI rendering stays separate. |
| AC02 | An Organiser can only act on events they are authorised on | APP implemented: owner/non-owner submission, Requested-event cancellation, actor spoofing and raw takeover checks; successful owner controls and terminal-edit denial. Other organiser actions remain with their feature stories. |
| AC03 | An Organiser attempting to access an event they are not authorised on is denied. | APP implemented: spoofed list filter, direct-id detail/child/history denial and unchanged stored snapshots. Screen error rendering stays UI. |


### SPM-15 — Coordinator Access to All Events Assigned (Done)

**Real boundary to exercise:** Assigned-event loader → current assignments and RLS.

**Existing evidence locations:** [assigned-events.test.ts](../../apps/frontend/src/features/event-requests/services/assigned-events.test.ts); [EventDetailPage.test.tsx](../../apps/frontend/src/routes/EventDetailPage.test.tsx); [EventsPage.test.tsx](../../apps/frontend/src/routes/EventsPage.test.tsx).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | A logged-in Event Coordinator can view a list of the events assigned to them. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | The list shows only events assigned to that Coordinator and events assigned to other Coordinators are not shown. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | A Coordinator can open an event from their list to view its details. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-16 — Role-Scoped Access for Venue Staff (Done)

**Real boundary to exercise:** Venue services → role/resource permissions.

**Existing evidence locations:** [RoleGate.test.tsx](../../apps/frontend/src/routes/RoleGate.test.tsx); [navigation.test.ts](../../packages/shared/src/domain/navigation.test.ts); [permissions.test.ts](../../packages/shared/src/domain/permissions.test.ts).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Venue Staff can access only the information and actions permitted for their role | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | If Venue Staff attempts to access something outside their permitted scope, access is denied. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Denied access attempts are handled gracefully with clear message | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-17 — Block Unauthorised Access Attempts (Done)

**Real boundary to exercise:** Protected services/routes → JWT and RLS; redirects stay UI.

**Existing evidence locations:** [RoleGate.test.tsx](../../apps/frontend/src/routes/RoleGate.test.tsx).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Authenticated users with valid role-based access are directed to their authorised page view. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Any authenticated users without the required role-based access is blocked from viewing the protected resource and shown “You don’t have access to this page”. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Any denied attempt to a protected page or resource, such as Event Details, is blocked from viewing the content | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| Scenario S01 | Given an authenticated user with a valid role based access control, they will be directed to the their respective authorised page view. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |
| Scenario S02 | Given an authenticated user with invalid role based access, they will be blocked and redirected to a page to show “You don’t have access to this page”. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |

### SPM-48 — Role-Scoped Access for Technical Support Staff (Done)

**Real boundary to exercise:** Equipment services → Technical Support permissions.

**Existing evidence locations:** [EquipmentPage.test.tsx](../../apps/frontend/src/routes/EquipmentPage.test.tsx); [RoleGate.test.tsx](../../apps/frontend/src/routes/RoleGate.test.tsx); [navigation.test.ts](../../packages/shared/src/domain/navigation.test.ts); [permissions.test.ts](../../packages/shared/src/domain/permissions.test.ts).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Technical Support Staff can access only the information and actions permitted for their role | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | If Technical Support Staff attempts to access something outside their permitted scope, access is denied. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Denied access attempts are handled gracefully with clear message. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-49 — Role-Scoped Access for Attendees (Done)

**Real boundary to exercise:** Attendee queries → published fields; deny internal planning data.

**Existing evidence locations:** [BrowseEventsPage.test.tsx](../../apps/frontend/src/routes/BrowseEventsPage.test.tsx); [EventDetailPage.test.tsx](../../apps/frontend/src/routes/EventDetailPage.test.tsx); [RoleGate.test.tsx](../../apps/frontend/src/routes/RoleGate.test.tsx); [navigation.test.ts](../../packages/shared/src/domain/navigation.test.ts); [permissions.test.ts](../../packages/shared/src/domain/permissions.test.ts).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | A authenticated Attendee can view the attendee-facing information. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Attendees cannot view event’s internal planning information. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Any attempt by an Attendee to access unauthorised internal planning information directly is denied. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-77 — Role-Scoped Access for Event Coordinator Lead and Safety Officer (Done)

**Real boundary to exercise:** Lead/Safety services → role-specific queries/actions.

**Existing evidence locations:** [login.test.ts](../../apps/frontend/src/features/auth/actions/login.test.ts); [EventDetailPage.test.tsx](../../apps/frontend/src/routes/EventDetailPage.test.tsx); [EventsPage.test.tsx](../../apps/frontend/src/routes/EventsPage.test.tsx); [RoleGate.test.tsx](../../apps/frontend/src/routes/RoleGate.test.tsx); [SafetyChecksPage.test.tsx](../../apps/frontend/src/routes/SafetyChecksPage.test.tsx); [navigation.test.ts](../../packages/shared/src/domain/navigation.test.ts); [role-destination.test.ts](../../packages/shared/src/domain/role-destination.test.ts).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | On sign-in, each role is routed to that role’s own designated landing page, not a shared default page | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | A Lead can access and view all information permitted for their role such as relevant events and assignments and anything outside their permitted scope is denied. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | A Safety Officer can access and view all information permitted for their role and anything outside their permitted scope is denied. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Denied access attempts are handled gracefully with clear message. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-3 — Submit an Event Request (Done)

**Real boundary to exercise:** Submission service → real draft save → apiFetch → Express/Auth → submit RPC.

**Existing evidence locations:** [event-submissions.route.test.ts](../../apps/backend/src/routes/event-submissions.route.test.ts); [event-submissions.test.ts](../../apps/frontend/src/features/event-requests/services/event-submissions.test.ts); [pb03_submit_event_request.test.sql](../../supabase/tests/database/pb03_submit_event_request.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | The organiser can enter the event name, purpose, description, expected attendance, and proposed start and end date and time. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Expected attendance must be a positive whole number, the proposed start date and time must be in the future, and the proposed end date and time must be later than the start. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | At least one venue requirement must be provided through the preferred location, room-layout preference, or accessibility needs. Required facilities may also be recorded where relevant. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | The organiser can indicate whether attendee registration is required | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | After submission, the organiser can view the submission date, time, and request status. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| Scenario S01 | Given the mandatory fields are valid, when the organiser submits the request, then it is accepted, its status becomes Requested, and it becomes available for coordinator assignment and review. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |
| Scenario S02 | Given a mandatory field is missing or invalid, when submission is attempted, then submission is blocked and every affected field is identified. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |
| Scenario S03 | Given a Requested event has not been approved, when its organiser edits permitted information, then the changes and actor are recorded for review. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |

### SPM-80 — View Unassigned Event Queue and Coordinator Oversight (Done)

**Real boundary to exercise:** Lead queue service → unassigned Requested rows and oversight counts.

**Existing evidence locations:** [all-events.test.ts](../../apps/frontend/src/features/event-requests/services/all-events.test.ts); [EventDetailPage.test.tsx](../../apps/frontend/src/routes/EventDetailPage.test.tsx); [EventsPage.test.tsx](../../apps/frontend/src/routes/EventsPage.test.tsx).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | The unassigned queue lists every Requested event with no assigned coordinator, oldest submission first. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Each queue entry shows event name, organiser, proposed date and time, expected attendance, and submission time. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | An event disappears from the queue once it has a coordinator. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | The oversight view lists all active events (Requested, Planning, Pending Safety Check, Confirmed) grouped by assigned coordinator, with status and a count per coordinator. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Event Coordinators and other roles cannot open the queue or oversight view. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | An empty queue shows "No unassigned events". | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | Unassigned requests do not appear in any Event Coordinator's list and cannot be reviewed, clarified, approved or rejected; the organiser sees that the request is awaiting coordinator assignment. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | The Lead can filter the oversight view by coordinator and by status, open any event's details and change history read-only, and start a reassignment from this view. Completed, Cancelled and Rejected events can be shown with a filter. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-81 — Assign an Event Coordinator (Done)

**Real boundary to exercise:** Assignment service → assignment RPC, lists, history and notifications.

**Existing evidence locations:** [pb04_coordinator_assignment.test.sql](../../supabase/tests/database/pb04_coordinator_assignment.test.sql); [spm81_assign_event_coordinator.test.sql](../../supabase/tests/database/spm81_assign_event_coordinator.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | The Lead can assign exactly one Event Coordinator to an unassigned Requested event from the event page. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Only users with the Event Coordinator role can be selected. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Assignment records the coordinator, the Lead, and the timestamp in the assignment history. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | After assignment, the event appears in that coordinator's assigned list and no longer in the unassigned queue. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Notification records are created for the assigned coordinator and the organiser. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Assigning an event that already has a coordinator is refused and the user is directed to reassignment. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | Draft, Rejected, Cancelled, and Completed events cannot be assigned. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | Each coordinator option shows that coordinator's current number of active events. If two Leads assign the same request at once, only the first assignment succeeds. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-84 — Reassign an Event Coordinator (Done)

**Real boundary to exercise:** Reassignment service → history, old/new JWT access and notifications.

**Existing evidence locations:** [spm81_assign_event_coordinator.test.sql](../../supabase/tests/database/spm81_assign_event_coordinator.test.sql); [spm84_reassign_event_coordinator.test.sql](../../supabase/tests/database/spm84_reassign_event_coordinator.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | The Lead can reassign a Requested, Planning, Pending Safety Check, or Confirmed event to a different Event Coordinator, with an optional reason. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Reassigning to the current coordinator is refused. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | The previous assignment is closed (ended_at recorded) and the new one recorded; full assignment history is viewable. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Immediately after reassignment, the previous coordinator can no longer view or act on the event; the new coordinator can. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Open clarifications, venue bookings, and equipment arrangements remain attached to the event unchanged. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Notification records are created for the previous coordinator, the new coordinator, and the organiser. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | A coordinator can perform management actions (clarification, approve or reject, planning updates, venue and equipment arrangements, change review, safety submission, cancel, complete) only on events currently assigned to them. An attempt on an unassigned event or another coordinator's event is denied on the server. The restriction applies immediately after a reassignment. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | Reassignment is not allowed for Completed, Cancelled or Rejected events. Only the Event Coordinator Lead can reassign. Open clarifications, pending booking requests and pending change requests become the new coordinator's responsibility. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-6 — Request and Resolve Event Clarification (Done)

**Real boundary to exercise:** Clarification services → Express/Auth → RPC, locks, rounds and notifications.

**Existing evidence locations:** [clarifications.test.ts](../../apps/frontend/src/features/event-requests/services/clarifications.test.ts); [event_clarifications.test.sql](../../supabase/tests/database/event_clarifications.test.sql); [spm6_reopen_clarification_after_answer.test.sql](../../supabase/tests/database/spm6_reopen_clarification_after_answer.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | A clarification request captures the required information, the requesting coordinator, and the request timestamp. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | While a clarification request is open, the event's review state shows Awaiting Organiser, and its lifecycle status remains Requested. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | The organiser can respond to, or update, only the fields designated as permitted; other fields remain locked while clarification is open. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Submitting a response records the response content, timestamp, and actor. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Approval or rejection of the event is disabled while any clarification request is unresolved. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | A coordinator can explicitly close/resolve a clarification request, after which approval or rejection becomes available again. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | All clarification rounds (requests, responses, actors, timestamps) are viewable in sequence in the event's history. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | Only an authorised coordinator can initiate a clarification request | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| Scenario S01 | Given a Requested event is unclear or incomplete, when the coordinator requests clarification, then the required information and request time are recorded. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |
| Scenario S02 | Given clarification is open, when the event is reviewed, then its review state is Awaiting Organiser while its lifecycle status remains Requested. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |
| Scenario S03 | Given the organiser responds or updates permitted information, when the response is submitted, then the response and changes are recorded and the coordinator is notified. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |
| Scenario S04 | Given clarification remains unresolved, when an approval or rejection decision is attempted, then the decision is blocked unless the coordinator explicitly closes the clarification. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |
| Scenario S05 | Given several clarification rounds occur, when the history is viewed, then each request, response, actor, and timestamp appears in sequence. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |

### SPM-7 — Approve or Reject an Event Request (Done)

**Real boundary to exercise:** Decision service → Express/Auth → status, history and notifications.

**Existing evidence locations:** [event-decisions.route.test.ts](../../apps/backend/src/routes/event-decisions.route.test.ts); [spm40_registration_capacity_in_planning.test.sql](../../supabase/tests/database/spm40_registration_capacity_in_planning.test.sql); [spm6_reopen_clarification_after_answer.test.sql](../../supabase/tests/database/spm6_reopen_clarification_after_answer.test.sql); [spm7_approve_reject_event_request.test.sql](../../supabase/tests/database/spm7_approve_reject_event_request.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | An event can only be approved if it is in Requested status, has sufficient information, and has no unresolved clarification requests. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Approving an event changes its status to Planning. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Rejecting an event requires a rejection reason to be entered before the decision can be submitted. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Rejecting an event changes its status to Rejected. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Every approval or rejection decision records the deciding coordinator, the outcome, and the timestamp; rejections additionally record the reason. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | The organiser is notified automatically when a decision (approval or rejection) is recorded. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| Scenario S01 | Given a Requested event has sufficient information and no unresolved clarification, when the coordinator approves it, then its status becomes Planning. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |
| Scenario S02 | Given the coordinator rejects a request, when the decision is submitted, then a rejection reason is required and the status becomes Rejected. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |
| Scenario S03 | Given approval or rejection succeeds, when the decision is recorded, then the coordinator, outcome, timestamp, and reason where applicable are retained and the organiser is notified. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |
| Scenario S04 | Given an event is Rejected, when venue or equipment planning is attempted, then the action is blocked. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |

## 2. Venue planning

### SPM-18 — Maintain a Venue Catalogue Entry (Done)

**Real boundary to exercise:** Venue service → real catalogue writes and history.

**Existing evidence locations:** [venue-management.route.test.ts](../../apps/backend/src/routes/venue-management.route.test.ts); [venue-card.test.tsx](../../apps/frontend/src/features/venues/components/venue-card.test.tsx); [venues.test.ts](../../apps/frontend/src/features/venues/services/venues.test.ts); [VenueDetailPage.test.tsx](../../apps/frontend/src/routes/VenueDetailPage.test.tsx).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Venue Staff can create a new venue catalogue entry | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Venue Staff can update an existing venue catalogue entry | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Each entry requires a venue name, location, capacity, room layout, operating days and operating hours, while facilities are optional and one or more can be selected | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Capacity must be a positive whole number | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | A venue must have exactly one room layout, selected from Theatre, Classroom, Boardroom, Banquet, Open Floor, Auditorium or Exhibition, or a custom layout name entered by Venue Staff. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Missing or invalid mandatory information prevents saving and identifies the affected field. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | Submitting a venue name and location that matches an existing name and location is rejected and identified as a duplicate | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | Each saved update records the venue staff member, date and time of the changes made | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC09 | Opening hours cannot be after closing hours for operating hours | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-21 — Manual Search of Venue for Booking Request (Done)

**Local evidence:** [SPM-21 integration tests](../../tests/integration/spm21-venue-search.integration.test.ts) passed. A backend test previously had an intermittent socket error; its mitigation and the remaining uncertainty are recorded in the execution record.

**Real boundary to exercise:** Search service → time/filter conversion → search RPC.

**Existing evidence locations:** [suggested-venues-panel.test.tsx](../../apps/frontend/src/features/event-requests/components/suggested-venues-panel.test.tsx); [manual-venue-search.test.tsx](../../apps/frontend/src/features/venues/components/manual-venue-search.test.tsx); [venue-search.test.ts](../../apps/frontend/src/features/venues/services/venue-search.test.ts); [VenueDetailPage.test.tsx](../../apps/frontend/src/routes/VenueDetailPage.test.tsx); [venue-search.test.ts](../../packages/shared/src/schemas/venue-search.test.ts); [event-choices.test.ts](../../packages/shared/src/types/event-choices.test.ts).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | An Event Coordinator can open manual search for a Planning event alongside automatic suggestions, including when the event already has an active venue request. Search inputs start from the event’s requirements and can be adjusted without changing the event. | APP: real search service and local database; existing UI/component tests cover screen behaviour. |
| AC02 | A valid start/end period and a positive capacity are required. The initial capacity is the greater of expected attendance and the event’s saved minimum capacity. | APP: real search service and local database; existing UI/component tests cover screen behaviour. |
| AC03 | When specified, location, room layout, every required facility, and accessibility needs must all match; unspecified optional filters do not restrict results. | APP: real search service and local database; existing UI/component tests cover screen behaviour. |
| AC04 | Results include only venues open throughout the searched period and free of overlapping Pending or Confirmed bookings and active blocks. | APP: real search service and local database; existing UI/component tests cover screen behaviour. |
| AC05 | Each result shows the venue details relevant to suitability checking and its availability for the searched period. | APP: real search service and local database; existing UI/component tests cover screen behaviour. |
| AC06 | Changing search dates does not change the event schedule. A venue found for different dates can be reviewed, but cannot be requested for that event through this search result. | APP: real search service and local database; existing UI/component tests cover screen behaviour. |

### SPM-72 — Automatically Suggest Suitable Venues for a Planning Event (Done)

**Real boundary to exercise:** Suggestion service → Express/Auth → matching RPC and availability.

**Existing evidence locations:** [venue-suggestions.route.test.ts](../../apps/backend/src/routes/venue-suggestions.route.test.ts); [find_matching_venues_availability_status.test.sql](../../supabase/tests/database/find_matching_venues_availability_status.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Given an approved event in Planning stage, the system automatically generates a list of venues that meet every mandatory requirement, without the coordinator entering any filters. Event schedule (date/time) and expected attendance are always mandatory. Preferred location, room layout, required facilities and accessibility are mandatory only when specified on the event. This is the same mandatory/optional logic as manual search. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Each suggested venue shows its name, location, capacity, room layouts, facilities, and availability. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Given no venues matches the event’s requirements, the message indicate “No matching venues” is shown | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-20 — View Venue Availability (Done)

**Real boundary exercised:** availability service → local Auth/PostgREST → bookings and blocks. [Integration tests](../../tests/integration/spm20-venue-availability.integration.test.ts).

**Existing evidence locations:** [venue-availability.test.ts](../../apps/frontend/src/features/venues/services/venue-availability.test.ts); [VenueAvailabilityPage.test.tsx](../../apps/frontend/src/routes/VenueAvailabilityPage.test.tsx).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | An authorised internal user can view venue availability for a selected venue, date, and time range. | APP: real staff/coordinator reads and occupied-period data; UI tests cover selected date, time range, statuses and visual rendering. |
| AC02 | The venue availability calendar clearly distinguishes between statuses. (E.g Available, Booked and Blocked periods) | APP: real staff/coordinator reads and occupied-period data; UI tests cover selected date, time range, statuses and visual rendering. |
| AC03 | Each unavailable period shows its start and end time and whether it is a booking or operational block. | APP: real staff/coordinator reads and occupied-period data; UI tests cover selected date, time range, statuses and visual rendering. |
| AC04 | A venue with no bookings or blocks displays as fully Available across the selected range. | APP: empty unavailable periods; UI test covers available-all-day presentation within operating hours. |

### SPM-86 — Configure Venue Setup and Turnaround Time (Done)

**Real boundary exercised:** Venue service → Supabase and real Express backend → buffer configuration/history. Integration test: [SPM-86](../../tests/integration/spm86-venue-buffers.integration.test.ts).

**Existing evidence locations:** [venue-card.test.tsx](../../apps/frontend/src/features/venues/components/venue-card.test.tsx); [venue-form.test.tsx](../../apps/frontend/src/features/venues/components/venue-form.test.tsx); [venues.test.ts](../../apps/frontend/src/features/venues/services/venues.test.ts); [VenueDetailPage.test.tsx](../../apps/frontend/src/routes/VenueDetailPage.test.tsx); [venue.test.ts](../../packages/shared/src/schemas/venue.test.ts); [spm86_venue_setup_turnaround.test.sql](../../supabase/tests/database/spm86_venue_setup_turnaround.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Venue Staff can enter setup time and turnaround time in whole minutes for each venue; both default to 0. | APP: exercised through real application services, backend and local database; UI checks retain responsibility for visible controls/text. |
| AC02 | Negative or non-numeric values are rejected and the affected field is identified. | APP: exercised through real application services, backend and local database; UI checks retain responsibility for visible controls/text. |
| AC03 | Saved values are shown on the venue details page and venue catalogue. | APP: exercised through real application services, backend and local database; UI checks retain responsibility for visible controls/text. |
| AC04 | Each change records the staff member, previous value, new value, and timestamp. | APP: exercised through real application services, backend and local database; UI checks retain responsibility for visible controls/text. |
| AC05 | Only Venue Staff can change these values. | APP: exercised through real application services, backend and local database; UI checks retain responsibility for visible controls/text. |

### SPM-87 — Apply Setup and Turnaround to Availability and Conflict Checks (Done)

**Real boundary exercised:** availability service → PostgREST → effective-window functions. [Integration tests](../../tests/integration/spm87-venue-availability.integration.test.ts); search and booking operations retain separate story coverage.

**Existing evidence locations:** [VenueAvailabilityPage.test.tsx](../../apps/frontend/src/routes/VenueAvailabilityPage.test.tsx); [VenueDetailPage.test.tsx](../../apps/frontend/src/routes/VenueDetailPage.test.tsx); [check_venue_booking_availability.test.sql](../../supabase/tests/database/check_venue_booking_availability.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | A booking’s effective occupancy window runs from (event start time minus the venue’s setup time) to (event end time plus the venue’s turnaround time), based on the venue’s current setup/turnaround settings. | APP: real service and database verify this outcome; UI tests cover visible controls and text. |
| AC02 | Two bookings are in conflict only if their effective occupancy windows overlap. Windows that merely touch with one ending at the exact moment the other begins are not a conflict. | APP: real service and database verify this outcome; UI tests cover visible controls and text. |
| AC03 | A venue is only available for a period if its entire effective window with setup and turnaround included falls within that venue’s operating days and hours. | APP: real service and database verify this outcome; UI tests cover visible controls and text. |
| AC04 | On the availability calendar, setup and turnaround periods are shown visually distinct from the event time itself | UI: existing VenueAvailabilityPage tests verify distinct calendar styling. |

### SPM-78 — Place a Tentative Venue Hold with Expiry (Done)

**Real boundary to exercise:** Hold service → Express/Auth → hold state and expiry.

**Existing evidence locations:** [venue-booking-hold.route.test.ts](../../apps/backend/src/routes/venue-booking-hold.route.test.ts); [venue_booking_hold.test.sql](../../supabase/tests/database/venue_booking_hold.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Venue Staff can place pending venue request to be on hold for an event in Planning phase. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | An active hold records the event name, venue name, requested period, hold expiry date and time. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | The expiry must be in the future and before the start of the event period. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | An active hold appears on the availability calendar as “On hold” | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-75 — Confirm a venue hold before it expires (Done)

**Real boundary to exercise:** Hold confirmation service → Express/Auth → booking state.

**Existing evidence locations:** [venue-booking-hold.route.test.ts](../../apps/backend/src/routes/venue-booking-hold.route.test.ts); [venue_booking_hold.test.sql](../../supabase/tests/database/venue_booking_hold.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Given that my venue booking request is “On Hold”, when I view the request, I should see the confirmation date and time, and a “Confirm Request” option. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Given my request is On hold, when I click Confirm before the expiry date and time, then the request returns to Pending for Venue Staff to approve or reject. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | An expired holds for that venue period will be release and is available to be booked by other events. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | An expired holds remain visible in the event’s change history. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Given my request is On Hold, when less than 24 hours remain before expiry, then I receive a “Venue Hold expiry soon” notification. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-24 — Submit a Venue Booking Request (Reopen)

**Real boundary to exercise:** Booking service → Express/Auth → booking RPC and occupancy.

**Existing evidence locations:** [venue-booking-submissions.route.test.ts](../../apps/backend/src/routes/venue-booking-submissions.route.test.ts); [venue-availability.test.ts](../../apps/frontend/src/features/venues/services/venue-availability.test.ts); [venue-bookings.test.ts](../../apps/frontend/src/features/venues/services/venue-bookings.test.ts); [venues.test.ts](../../apps/frontend/src/features/venues/services/venues.test.ts); [EventVenuePage.test.tsx](../../apps/frontend/src/routes/EventVenuePage.test.tsx); [VenueDetailPage.test.tsx](../../apps/frontend/src/routes/VenueDetailPage.test.tsx); [VenueRequestsPage.test.tsx](../../apps/frontend/src/routes/VenueRequestsPage.test.tsx); [spm24_venue_booking_submission.test.sql](../../supabase/tests/database/spm24_venue_booking_submission.test.sql); [spm26_prevent_venue_booking_conflicts.test.sql](../../supabase/tests/database/spm26_prevent_venue_booking_conflicts.test.sql).

**Constraint:** REOPEN: verify revised occupancy states and interaction with additional bookings before implementation.

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Given the required information is complete and the venue is available, when the coordinator submits the request, then its status becomes Pending and the period appears as Pending Booking. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Given a venue has an overlapping active block or Pending, On Hold or Approved booking, the coordinator is not able to submit a booking request, no Pending hold is created. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Given a coordinator withdraws a Pending request before it is confirmed, when the withdrawal is submitted, then the request is withdrawn and the venue period is released back to Available. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | A venue booking request has no separate data-entry step: its event, venue and period are fixed by the specific venue the coordinator has already reviewed on the details page before confirming | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | A booking request references a specific Planning event, venue, requested period, expected attendance, and the venue requirements Venue Staff need to assess it. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | The booking's effective window (the requested period plus the venue's setup time before it and turnaround time after it, as in SPM-87) must fall within the venue's operating days and hours. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | A venue period is always in exactly one of these states: Available, Pending Booking, Confirmed, Blocked or On Hold. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-25 — Approve or Reject a Venue Booking Request (Done)

**Real boundary to exercise:** Decision service → Express/Auth → booking decision and notifications.

**Existing evidence locations:** [venue-booking-decisions.route.test.ts](../../apps/backend/src/routes/venue-booking-decisions.route.test.ts); [venue-booking-decision-dialog.test.tsx](../../apps/frontend/src/features/venues/components/venue-booking-decision-dialog.test.tsx); [spm25_approve_reject_venue_booking_request.test.sql](../../supabase/tests/database/spm25_approve_reject_venue_booking_request.test.sql); [spm82_replacement_venue.test.sql](../../supabase/tests/database/spm82_replacement_venue.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Pending → Approved → period becomes Confirmed Booking | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Rejection requires a reason; period is released | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Staff member, outcome, reason, timestamp retained | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| Scenario S01 | Given a Pending venue booking request, when Venue Staff approve it, then the request becomes Approved and the venue period becomes Confirmed Booking. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |
| Scenario S02 | Given Venue Staff reject a request, when the decision is submitted, then a reason is required and the period is released. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |
| Scenario S03 | Given approval or rejection succeeds, when the decision is recorded, then the staff member, outcome, reason where applicable, and timestamp are retained and the coordinator is notified. | Additional source scenario: map to AC/APP/UI outcomes before implementation. |

### SPM-26 — Prevent Venue Booking Conflicts (Done)

**Real boundary to exercise:** Booking/approval paths → competing transactions and constraints.

**Existing evidence locations:** [check_venue_booking_availability.test.sql](../../supabase/tests/database/check_venue_booking_availability.test.sql); [spm26_prevent_venue_booking_conflicts.test.sql](../../supabase/tests/database/spm26_prevent_venue_booking_conflicts.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Given an existing Pending or Approved booking on a venue, when a coordinator submits a new request whose period overlaps it, then the submission is refused before any new request record is created, and the coordinator is told the venue already has a Pending or Approved booking for part of the requested period. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Given an active operational block on a venue, when a coordinator submits a new request whose period overlaps it, then the submission is refused before any new request record is created, and the coordinator is told the venue is unavailable for part of the requested period. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Given one booking's period ends at the exact moment another begins on the same venue, when the new request is checked for overlap against the venue's existing commitments and blocks, then the two periods are not treated as overlapping, and the new request may proceed. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Given a request would conflict with an existing commitment or block, when the coordinator submits it, then no request record is ever created for it. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-88 — Identify Bookings That Conflict Under the Buffer Rule (Done)

**Real boundary exercised:** real buffer update and recheck services → Express/Auth/RPC → conflict flags, listing and staff notifications. [Integration tests](../../tests/integration/spm88-venue-conflicts.integration.test.ts).

**Existing evidence locations:** [notification-bell.test.tsx](../../apps/frontend/src/features/notifications/components/notification-bell.test.tsx); [VenueDetailPage.test.tsx](../../apps/frontend/src/routes/VenueDetailPage.test.tsx); [spm88_venue_conflict_recheck.test.sql](../../supabase/tests/database/spm88_venue_conflict_recheck.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Venue Staff can trigger a conflict re-check for a single venue or all venues | APP: real services, backend and database; existing UI and pgTAP tests provide additional evidence. |
| AC02 | Saving a change to a venue setup and turnaround time will automatically trigger a conflict check for that venue | APP: real services, backend and database; existing UI and pgTAP tests provide additional evidence. |
| AC03 | A flagged booking is never deleted or cancelled, and its status is not changed. | APP: real services, backend and database; existing UI and pgTAP tests provide additional evidence. |
| AC04 | Given two or more Pending or Approved bookings now overlap in their effective windows, when a check runs, then every affected booking is flagged “Conflict – Needs Review”. | APP: real services, backend and database; existing UI and pgTAP tests provide additional evidence. |
| AC05 | Given a booking is flagged, when I view the flagged bookings list, then I see its event, venue, period, and the conflicting booking or block. | APP: real services, backend and database; existing UI and pgTAP tests provide additional evidence. |
| AC06 | Given a flagged booking no longer overlaps, when a check runs, then its flag is cleared and it no longer appears on the flagged bookings list. | APP: real services, backend and database; existing UI and pgTAP tests provide additional evidence. |

### SPM-19 — Manage Venue Operational Blocks (Done)

**Real boundary exercised:** real block service → shared validation/time conversion → local Auth/PostgREST and database. [Integration tests](../../tests/integration/spm19-venue-blocks.integration.test.ts).

**Existing evidence locations:** [venue-blocks.test.ts](../../apps/frontend/src/features/venues/services/venue-blocks.test.ts); [VenueBlocksPage.test.tsx](../../apps/frontend/src/routes/VenueBlocksPage.test.tsx); [spm19_spm21_venue_blocks_search.test.sql](../../supabase/tests/database/spm19_spm21_venue_blocks_search.test.sql).

**Source discrepancy:** The supplied export still says reject overlap. The user confirmed Jira was updated; tests cover the current SPM-83 save-and-flag behaviour. The supplied export predates that update.

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Venue Staff can create a block with venue, reason, start time, and end time. | APP: real service and local database exercise this criterion without overlapping bookings; UI tests cover visible controls/text. |
| AC02 | Venue Staff can remove a block when it no longer applies. | APP: real service and local database exercise this criterion without overlapping bookings; UI tests cover visible controls/text. |
| AC03 | Current and past blocks remain visible in the venue's block history. | APP: real service and local database exercise this criterion without overlapping bookings; UI tests cover visible controls/text. |
| AC04 | Missing or invalid mandatory fields (venue, reason, start/end time) prevent saving and identify the affected field | APP: real service and local database exercise this criterion without overlapping bookings; UI tests cover visible controls/text. |
| AC05 | An end time earlier than or equal to the start time is rejected with a validation message | APP: real service and local database exercise this criterion without overlapping bookings; UI tests cover visible controls/text. |
| Scenario S01 | Given a proposed block overlaps a Pending or Confirmed booking, when Venue Staff attempt to save it, then the block is rejected and the conflict is identified. | Source wording conflicts with SPM-83: integration verifies the user-requested current save-and-flag behaviour; The user confirmed the Jira amendment; the supplied export predates it. |

### SPM-83 — Mark a Venue Unavailable When Bookings Exist (Done)

**Real boundary to exercise:** Block services → affected bookings, flags, readiness and notifications.

**Existing evidence locations:** [notification-bell.test.tsx](../../apps/frontend/src/features/notifications/components/notification-bell.test.tsx); [affected-venue-bookings.test.tsx](../../apps/frontend/src/features/venues/components/affected-venue-bookings.test.tsx); [venue-blocks.test.ts](../../apps/frontend/src/features/venues/services/venue-blocks.test.ts); [venue-disruptions.test.ts](../../apps/frontend/src/features/venues/services/venue-disruptions.test.ts); [EventHistoryPage.test.tsx](../../apps/frontend/src/routes/EventHistoryPage.test.tsx); [EventsPage.test.tsx](../../apps/frontend/src/routes/EventsPage.test.tsx); [VenueBlocksPage.test.tsx](../../apps/frontend/src/routes/VenueBlocksPage.test.tsx); [venue-disruption.test.ts](../../packages/shared/src/domain/venue-disruption.test.ts); [venue-block.test.ts](../../packages/shared/src/schemas/venue-block.test.ts); [spm19_spm21_venue_blocks_search.test.sql](../../supabase/tests/database/spm19_spm21_venue_blocks_search.test.sql); [spm82_replacement_venue.test.sql](../../supabase/tests/database/spm82_replacement_venue.test.sql); [spm83_venue_block_disruptions.test.sql](../../supabase/tests/database/spm83_venue_block_disruptions.test.sql); [spm85_multi_venue_bookings.test.sql](../../supabase/tests/database/spm85_multi_venue_bookings.test.sql).

**Constraint:** AC3 unchanged event status has an explicit Pending Safety Check exception in AC13; test both contexts.

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Venue Staff can record unavailability with venue, reason category (maintenance, equipment failure, renovation, safety, other), description, start time, and end time. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | The unavailability is saved even if it overlaps Pending or Approved bookings. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Each overlapping Pending booking, Approved booking, and active tentative hold is flagged Disrupted - Alternative Required; nothing is cancelled and event status is unchanged. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | An end date/time is required and must be after the start. Venue Staff can shorten or remove an unavailability period; any booking that no longer overlaps has its Disrupted flag cleared, and its coordinator is told the issue is cleared if no replacement has been approved. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | A disrupted booking makes its event Not Ready for the safety check (enforced in SPM-33). | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Venue Staff see a list of affected bookings when saving. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | A notification record is created for the assigned coordinator of each affected event. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | New booking requests for the unavailable period are refused (existing rule). | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC09 | Before saving an unavailability that overlaps bookings, Venue Staff are shown the affected bookings (event, coordinator, period) and must confirm. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC10 | Overlap is determined using each booking's occupied window including its venue's setup and turnaround time. Booking, event and approval history are left unchanged. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC11 | The coordinator notification states the event, the venue, the affected period, the block reason and period, that alternative arrangements are required, and that the event has not been cancelled. It goes to the currently assigned coordinator; a coordinator with several affected events gets one per event. When the block is removed before a replacement is approved, the coordinator is told the issue is cleared. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC12 | Coordinators can see a list of their events with affected venue bookings, each showing Replacement Required, Replacement Requested or Resolved. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC13 | If a booking becomes Disrupted while its event is Pending Safety Check, the event returns to Planning and the Safety Officer is notified. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-82 — Request a Replacement Venue for a Disrupted Booking (Done)

**Real boundary to exercise:** Replacement service → Express/Auth → linked booking decisions/history.

**Existing evidence locations:** [venue-booking-decisions.route.test.ts](../../apps/backend/src/routes/venue-booking-decisions.route.test.ts); [venue-booking-submissions.route.test.ts](../../apps/backend/src/routes/venue-booking-submissions.route.test.ts); [suggested-venues-panel.test.tsx](../../apps/frontend/src/features/event-requests/components/suggested-venues-panel.test.tsx); [notification-bell.test.tsx](../../apps/frontend/src/features/notifications/components/notification-bell.test.tsx); [affected-venue-bookings.test.tsx](../../apps/frontend/src/features/venues/components/affected-venue-bookings.test.tsx); [manual-venue-search.test.tsx](../../apps/frontend/src/features/venues/components/manual-venue-search.test.tsx); [venue-bookings.test.ts](../../apps/frontend/src/features/venues/services/venue-bookings.test.ts); [venue-disruptions.test.ts](../../apps/frontend/src/features/venues/services/venue-disruptions.test.ts); [booking-activity.test.ts](../../apps/frontend/src/features/venues/utils/booking-activity.test.ts); [group-venue-requests.test.ts](../../apps/frontend/src/features/venues/utils/group-venue-requests.test.ts); [EventHistoryPage.test.tsx](../../apps/frontend/src/routes/EventHistoryPage.test.tsx); [EventVenuePage.test.tsx](../../apps/frontend/src/routes/EventVenuePage.test.tsx); [VenueDetailPage.test.tsx](../../apps/frontend/src/routes/VenueDetailPage.test.tsx); [VenueRequestsPage.test.tsx](../../apps/frontend/src/routes/VenueRequestsPage.test.tsx); [spm82_replacement_venue.test.sql](../../supabase/tests/database/spm82_replacement_venue.test.sql); [spm85_multi_venue_bookings.test.sql](../../supabase/tests/database/spm85_multi_venue_bookings.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | From a disrupted booking, the assigned coordinator can open venue search pre-filled with the original booking's period and the event's requirements. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Search results exclude the disrupted venue for the unavailable period. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | A replacement can be requested only for a booking currently flagged Disrupted - Alternative Required, by the event's assigned coordinator, and a booking can have only one pending replacement at a time. This is the "limited to the affected booking" rule. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Submitting a replacement creates a new Pending booking linked to the original. It keeps the original's period, the event's expected attendance and the main-venue flag. It must pass the same suitability, availability and conflict checks as a new request, including setup and turnaround time. Date or time changes go through a change request. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | The original booking and its disruption reason stay visible until the replacement is approved. On approval, the original is cancelled automatically and linked, and the event's other bookings are not affected. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | If the replacement is rejected, the original remains Disrupted and the coordinator may try again. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | The coordinator can withdraw a Pending replacement; the original remains Disrupted. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | The original and the replacement are linked and visible in the event history. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-85 — Book Additional Venues for the Same Event (Done)

**Real boundary to exercise:** Multi-booking services → independent requirements, decisions, main and history.

**Existing evidence locations:** [venue-booking-submissions.route.test.ts](../../apps/backend/src/routes/venue-booking-submissions.route.test.ts); [booking-activity-list.test.tsx](../../apps/frontend/src/features/venues/components/booking-activity-list.test.tsx); [event-venue-bookings.test.tsx](../../apps/frontend/src/features/venues/components/event-venue-bookings.test.tsx); [manual-venue-search.test.tsx](../../apps/frontend/src/features/venues/components/manual-venue-search.test.tsx); [venue-bookings.test.ts](../../apps/frontend/src/features/venues/services/venue-bookings.test.ts); [booking-activity.test.ts](../../apps/frontend/src/features/venues/utils/booking-activity.test.ts); [EventHistoryPage.test.tsx](../../apps/frontend/src/routes/EventHistoryPage.test.tsx); [EventVenuePage.test.tsx](../../apps/frontend/src/routes/EventVenuePage.test.tsx); [VenueDetailPage.test.tsx](../../apps/frontend/src/routes/VenueDetailPage.test.tsx); [VenueRequestsPage.test.tsx](../../apps/frontend/src/routes/VenueRequestsPage.test.tsx); [venue.test.ts](../../packages/shared/src/types/venue.test.ts); [spm24_venue_booking_submission.test.sql](../../supabase/tests/database/spm24_venue_booking_submission.test.sql); [spm82_replacement_venue.test.sql](../../supabase/tests/database/spm82_replacement_venue.test.sql); [spm85_multi_venue_bookings.test.sql](../../supabase/tests/database/spm85_multi_venue_bookings.test.sql).

**Constraint:** DECISION REQUIRED: export has 14 ACs, including required-room cascading, but booking records have no required-room flag. Resolve AC5 exactly-one-main versus AC13 loss of main, and the earlier recorded 12-AC agreement.

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | A coordinator can submit a booking request for another venue on a Planning event that already has Pending or Approved bookings. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Each venue request is checked independently for suitability, availability, and conflicts. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Each booking has its own period (e.g. breakout sessions), which must fall within the event's start and end time. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Each booking records an expected headcount for that venue; the venue is suitable only if its capacity is at least that headcount. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Exactly one active booking per event is marked as the main venue; the first booking is main by default and the coordinator can change which booking is main. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Requesting a venue that the same event already has an active booking or hold for is refused. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | The event page lists all of the event's venue bookings with venue, period, and status. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | Venue Staff approve or reject each request individually; one outcome does not change the other bookings. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC09 | Each venue booking has its own label (e.g. Main Programme, Breakout 1), attendance, room layout, facilities and accessibility needs. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC10 | Manual search and automatic suggestions for an additional booking start from that booking's own requirements rather than the event's total attendance. A second booking for the same venue with an overlapping period on the same event is refused. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC11 | A coordinator can withdraw a Pending booking or cancel an Approved booking (reason required) for rooms which are not specified as ‘required’. Only that booking is released; the other bookings keep their states. Venue Staff are notified. (SPM-45). [Absorbs NEW-10] | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC12 | If a venue is specified as ‘required’, any changes which happen to that room will also affect the other room bookings. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC13 | If the Main booking is withdrawn, cancelled or lost, the coordinator must designate another booking as Main before the event can be Ready. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC14 | Every change to a booking is recorded in the event history with the booking's label. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-74 — Search and Filter for Venues, events, equipment. (Done)

**Real boundary to exercise:** Catalogue loaders → real data; filtering/chips/URL/back navigation stay UI where implemented client-side.

**Existing evidence locations:** [BrowseEventsPage.test.tsx](../../apps/frontend/src/routes/BrowseEventsPage.test.tsx); [EquipmentPage.test.tsx](../../apps/frontend/src/routes/EquipmentPage.test.tsx); [EventEquipmentPage.test.tsx](../../apps/frontend/src/routes/EventEquipmentPage.test.tsx); [EventsPage.test.tsx](../../apps/frontend/src/routes/EventsPage.test.tsx); [VenuesPage.test.tsx](../../apps/frontend/src/routes/VenuesPage.test.tsx).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | An always-visible filter section below the search box offers:  Venues: Area, Minimum capacity, Facilities (multi-select), Room layout.  Events (organiser and coordinator views only, not the Coordinator Lead’s): Status, date range (From/To).  Equipment (Technical Support Staff inventory and the read-only catalogue for coordinators/organisers): Category, “Show retired” toggle. | UI/component for client-side filters, chips, URL and navigation; APP only for underlying data/query boundaries. |
| AC02 | Selected filters and the search term combine with AND, so a result must match the search term and every selected filter. With nothing selected, the full list is shown (subject only to the search term). | UI/component for client-side filters, chips, URL and navigation; APP only for underlying data/query boundaries. |
| AC03 | Each active filter appears as its own removable chip below the filter section. Removing a chip clears only that filter. | UI/component for client-side filters, chips, URL and navigation; APP only for underlying data/query boundaries. |
| AC04 | A “Clear filters” action is shown whenever at least one filter is active. It clears all filters at once and leaves the search term untouched. | UI/component for client-side filters, chips, URL and navigation; APP only for underlying data/query boundaries. |
| AC05 | The search term and filter selections are kept in the page URL. | UI/component for client-side filters, chips, URL and navigation; APP only for underlying data/query boundaries. |
| AC06 | When no item matches the active search/filters, a “no matching [venues/events/equipment]” state is shown, distinct from the “no [venues/events/equipment] yet” state for an empty catalogue. Its “Clear filters” action restores the full list (respecting any active search term). | UI/component for client-side filters, chips, URL and navigation; APP only for underlying data/query boundaries. |
| AC07 | When the user opens an item’s detail page and returns via the page’s “back” action, the list is shown with the same search and filters as left, not reset. | UI/component for client-side filters, chips, URL and navigation; APP only for underlying data/query boundaries. |

## 3. Equipment

### SPM-27 — Record Equipment Requirements (Done)

**Real boundary to exercise:** Requirement service → catalogue validation, writes and history.

**Existing evidence locations:** [event-request-form.test.tsx](../../apps/frontend/src/features/event-requests/components/event-request-form.test.tsx); [equipment.test.ts](../../apps/frontend/src/features/event-requests/services/equipment.test.ts); [EventHistoryPage.test.tsx](../../apps/frontend/src/routes/EventHistoryPage.test.tsx); [event-request.test.ts](../../packages/shared/src/schemas/event-request.test.ts); [record_event_equipment_requirements.test.sql](../../supabase/tests/database/record_event_equipment_requirements.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | An equipment requirement records the associated event, the equipment item, the quantity, the required period (start and end), and any technical requirements. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | The equipment item is chosen from a dropdown of catalogue items grouped by category (e.g. Audio). Free-text equipment is not accepted from organisers or coordinators. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Equipment item, quantity, period start and period end are mandatory. Technical requirements are optional. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Quantity must be a positive whole number. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | The required period's end must be after its start. The period covers setup through cleanup, so it may start before the event starts and end after the event ends. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | If mandatory information is missing or invalid, nothing is saved and each affected field is identified. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | Adding, changing or removing an equipment requirement creates a history entry showing who did it, when, and what changed. Earlier history entries are kept. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | Only Technical Support Staff can maintain the equipment catalogue. Organisers and coordinators can only select from it. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC09 | Given I am the assigned coordinator and the event is in Planning, when I save valid equipment requirements, then they are saved and a history entry is recorded. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC10 | Given I am not the assigned coordinator for the event, when I try to save its equipment requirements, then the save is refused and nothing changes. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-30 — Manage Equipment Unavailability (Done)

**Real boundary to exercise:** Unavailability service → stock windows and affected reservations.

**Existing evidence locations:** [equipment-unavailability.test.ts](../../apps/frontend/src/features/equipment/services/equipment-unavailability.test.ts); [EquipmentPage.test.tsx](../../apps/frontend/src/routes/EquipmentPage.test.tsx); [equipment-unavailability.test.ts](../../packages/shared/src/domain/equipment-unavailability.test.ts); [spm30_equipment_unavailability.test.sql](../../supabase/tests/database/spm30_equipment_unavailability.test.sql); [spm31_equipment_availability.test.sql](../../supabase/tests/database/spm31_equipment_availability.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Technical Support Staff can record equipment type, positive whole-number quantity, unavailable start and end time, and reason. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | The end time must be later than the start time. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Overlapping unavailability records and reservations are visible before saving. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Active unavailable quantities reduce the quantity shown by SPM-31. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Technical Support Staff can end or remove an unavailability record when the equipment returns to service. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Current and past unavailability records retain the actor, reason, and time. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-31 — Check Equipment Availability (Done)

**Real boundary to exercise:** Availability service → stock/reservations/unavailability.

**Existing evidence locations:** [equipment-availability.test.ts](../../apps/frontend/src/features/equipment/services/equipment-availability.test.ts); [EquipmentPage.test.tsx](../../apps/frontend/src/routes/EquipmentPage.test.tsx); [equipment-availability.test.ts](../../packages/shared/src/domain/equipment-availability.test.ts); [spm30_equipment_unavailability.test.sql](../../supabase/tests/database/spm30_equipment_unavailability.test.sql); [spm31_equipment_availability.test.sql](../../supabase/tests/database/spm31_equipment_availability.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Availability is calculated for each requirement sent to Technical Support Staff, quantity and period, and the required characteristics are shown with the result so staff can judge suitability. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Confirmed overlapping reservations reduce the available quantity. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Quantities recorded as unavailable under SPM-30 for an overlapping period are not counted as freely available. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | The result shows Available, Partially Available, or Unavailable and states the available quantity. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Unknown equipment types are identified instead of being treated as available. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-32 — Reserve Equipment for an Event (Done)

**Real boundary to exercise:** Reservation service → atomic quantity allocation and release.

**Existing evidence locations:** [equipment-availability.test.ts](../../apps/frontend/src/features/equipment/services/equipment-availability.test.ts); [EquipmentPage.test.tsx](../../apps/frontend/src/routes/EquipmentPage.test.tsx); [EventEquipmentPage.test.tsx](../../apps/frontend/src/routes/EventEquipmentPage.test.tsx); [reserve_equipment.test.sql](../../supabase/tests/database/reserve_equipment.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Given sufficient equipment is available for the required period, when Technical Support Staff reserve it, then the event, equipment type, quantity, period, staff member, and timestamp are recorded and visible in the event's arrangements. Equipment can only be reserved for an item that has been requested. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Given the requested quantity exceeds availability, when reservation is attempted, then the reservation is rejected and the available quantity is shown. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Given a reservation succeeds, when another overlapping availability check occurs, then the reserved quantity is no longer counted as available. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Given an event's date or time, or its equipment requirement, changes after equipment is reserved, when the affected arrangements are reviewed, then the existing reservation is marked for re-checking rather than silently left unchanged. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Given a reservation is released or changed, when the update succeeds, then the quantity returns to the available pool where applicable and the action is recorded. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-28 — Track Equipment Arrangement Status (Done)

**Real boundary to exercise:** Arrangement service → status derivation, notes, issues and history.

**Existing evidence locations:** [equipment-availability.test.ts](../../apps/frontend/src/features/equipment/services/equipment-availability.test.ts); [equipment-arrangements.test.ts](../../apps/frontend/src/features/event-requests/services/equipment-arrangements.test.ts); [EquipmentPage.test.tsx](../../apps/frontend/src/routes/EquipmentPage.test.tsx); [EventEquipmentPage.test.tsx](../../apps/frontend/src/routes/EventEquipmentPage.test.tsx); [arranged_requires_reservation.test.sql](../../supabase/tests/database/arranged_requires_reservation.test.sql); [equipment_change_needs_recheck.test.sql](../../supabase/tests/database/equipment_change_needs_recheck.test.sql); [record_arrangement_on_reservation.test.sql](../../supabase/tests/database/record_arrangement_on_reservation.test.sql); [spm28_equipment_arrangement_status.test.sql](../../supabase/tests/database/spm28_equipment_arrangement_status.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Each equipment requirement has an arrangement status from a fixed list: Not started, In progress, Arranged, Issue. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | The status follows the requirement's reservation: Not started when nothing is reserved, In progress when part of the quantity is reserved, and Arranged only when the full quantity is reserved with no re-check outstanding. It shows Issue when the equipment can't be reserved in full (short, unavailable, retired or not in the catalogue) or its reservation needs re-checking. An item not yet requested shows Not requested. Once requested, it shows Not started until staff update it | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Technical Support Staff can report an issue on a requirement (a description is required) and add notes. A reported issue stays until staff resolve it, saying how; the status then returns to what the reservation shows. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Every update, including those made by reserving, re-checking or releasing, records who made it, when, and the status and note. Earlier entries are kept and can be viewed in order. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Notes and issues can be updated any number of times while the event is in Planning or Confirmed. While the event awaits its safety check, updates are refused. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Given I am not Technical Support Staff, when I try to update a requirement's arrangement status or note, then the update is refused and nothing changes. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | Given I am the event's assigned coordinator, when I view the event's equipment, then I can see each requirement's arrangement status, note and history, but cannot change them. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

## 4. Lifecycle, readiness and safety

### SPM-12 — Track Event Lifecycle Status (Reopen)

**Real boundary to exercise:** Lifecycle callers → authoritative transitions and status history.

**Existing evidence locations:** [status-badges.test.tsx](../../apps/frontend/src/features/event-requests/components/status-badges.test.tsx); [event-lifecycle.test.ts](../../apps/frontend/src/features/event-requests/services/event-lifecycle.test.ts); [EventDetailPage.test.tsx](../../apps/frontend/src/routes/EventDetailPage.test.tsx); [EventHistoryPage.test.tsx](../../apps/frontend/src/routes/EventHistoryPage.test.tsx); [event-status.test.ts](../../packages/shared/src/domain/event-status.test.ts); [lifecycle_status_management.test.sql](../../supabase/tests/database/lifecycle_status_management.test.sql).

**Constraint:** REOPEN: exactly eight Jira statuses conflicts with the shared enum retaining legacy statuses. Resolve expected compatibility before writing an assertion.

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | The system supports exactly these statuses: Draft, Requested, Planning, Confirmed, Pending Safety Check, Cancelled, Completed, and Rejected. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | The event's current status is visible to whoever can already view the event (organiser, assigned coordinator, Lead Coordinator). | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Given a status change succeeds, when it is applied, then the previous status, new status, the actor or system action that caused it, and the timestamp are recorded. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Given an event is in a lifecycle stage, when an invalid status transition is attempted, then the transition is rejected and the current status remains unchanged. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-79 — Enforce Revised Event Lifecycle Transitions (Done)

**Real boundary to exercise:** Lifecycle action services → transition functions.

**Existing evidence locations:** [status-timeline.test.tsx](../../apps/frontend/src/features/event-requests/components/status-timeline.test.tsx); [event-status.test.ts](../../packages/shared/src/domain/event-status.test.ts); [lifecycle_status_management.test.sql](../../supabase/tests/database/lifecycle_status_management.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Supported statuses: Draft, Requested, Planning, Pending Safety Check, Confirmed, Completed, Rejected, Cancelled. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Allowed transitions: Draft->Requested; Requested->Planning/Rejected/Cancelled; Planning->Pending Safety Check/Cancelled; Pending Safety Check->Confirmed/Planning/Cancelled; Confirmed->Planning (re-review)/Completed/Cancelled. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Any other transition is refused and the current status is unchanged. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Every successful transition records previous status, new status, actor or system action, and timestamp (as SPM-12). | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | The lifecycle timeline on the event page shows the new statuses. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-9 — View Event Details and Change History (Done)

**Real boundary to exercise:** Detail/history loaders → relational records and actor visibility.

**Existing evidence locations:** [clarifications.test.ts](../../apps/frontend/src/features/event-requests/services/clarifications.test.ts); [event-details.test.ts](../../apps/frontend/src/features/event-requests/services/event-details.test.ts); [event-lifecycle.test.ts](../../apps/frontend/src/features/event-requests/services/event-lifecycle.test.ts); [field-history.test.ts](../../apps/frontend/src/features/event-requests/services/field-history.test.ts); [EventDetailPage.test.tsx](../../apps/frontend/src/routes/EventDetailPage.test.tsx); [EventHistoryPage.test.tsx](../../apps/frontend/src/routes/EventHistoryPage.test.tsx); [event-field-history.test.ts](../../packages/shared/src/domain/event-field-history.test.ts); [event_documents.test.sql](../../supabase/tests/database/event_documents.test.sql); [spm09_planning_event_history_access.test.sql](../../supabase/tests/database/spm09_planning_event_history_access.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Given the coordinator assigned to an event opens its details, when they view it, then the current (latest) requirements are displayed, regardless of the event's lifecycle status. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Given a coordinator who is not assigned to the event attempts to view its details or its change history, when they do so, then access is denied, regardless of the event's lifecycle status. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Given an event has had no field edits since it was approved, when its change history is viewed, then the Planning section shows an explicit message stating no changes have been made since approval, rather than appearing empty. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | The organiser of the event exempt from AC02's denial: both can view an event's details and change history regardless of coordinator assignment. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | The change history page groups entries into three sections — Lifecycle, Pre-Approved, and Planning — each listing its own entries in chronological order, with every status change and field change showing its previous value, new value, actor and timestamp | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-10 — Coordinator Updates Event Information with Audit Logging (Done)

**Real boundary to exercise:** Coordinator edit service → field locks and per-field audit.

**Existing evidence locations:** [coordinator-event-edit.test.ts](../../apps/frontend/src/features/event-requests/services/coordinator-event-edit.test.ts); [CoordinatorEventEditPage.test.tsx](../../apps/frontend/src/routes/CoordinatorEventEditPage.test.tsx); [EventHistoryPage.test.tsx](../../apps/frontend/src/routes/EventHistoryPage.test.tsx); [event-field-history.test.ts](../../packages/shared/src/domain/event-field-history.test.ts); [coordinator_update_planning_event.test.sql](../../supabase/tests/database/coordinator_update_planning_event.test.sql); [submit_event_change_request.test.sql](../../supabase/tests/database/submit_event_change_request.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | While an event is in Planning, the following fields are locked for the coordinator: event name, purpose, description, event category, expected attendance, start time, end time, and every registration field (required, opens at, closes at, capacity, waitlist enabled). | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | An update that changes the value of any locked field is rejected in full — none of the submitted changes are saved, including changes to unlocked fields submitted in the same request. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Venue requirements and equipment requirements remain editable by the coordinator while the event is in Planning. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Given a coordinator updates an unlocked field on a Planning event, when the update is saved, then the previous value, new value, actor, and timestamp are recorded. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Given a coordinator updates multiple unlocked fields in one save, when the update is submitted, then each changed field is logged as a separate audit entry. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Given a coordinator attempts to save with no actual changes, when submitted, then no audit log entry is created. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-11 — Block Direct Edits once event is finalized (Confirmed, Completed, Rejected or Cancelled) (Done)

**Real boundary to exercise:** Edit services/raw authenticated update → terminal-state protections.

**Existing evidence locations:** [EventDetailPage.test.tsx](../../apps/frontend/src/routes/EventDetailPage.test.tsx); [EventsPage.test.tsx](../../apps/frontend/src/routes/EventsPage.test.tsx); [event-status.test.ts](../../packages/shared/src/domain/event-status.test.ts); [block_direct_edits_on_finalized_events.test.sql](../../supabase/tests/database/block_direct_edits_on_finalized_events.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Given an event is in Confirmed, Completed, Rejected, or Cancelled status, when the organiser or the coordinator attempts to edit it directly — including a raw table update, not only through the app's edit forms — then the edit is blocked and no change is applied. "Edit directly" means any change other than applying an approved change request (SPM-39), which is the change-request process this story refers to. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Given a direct edit attempt on such an event is blocked, when the user views the event, then they see a message directing them to submit a change request instead. Static messaging satisfies this AC; no working change-request submission flow is required by this story. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Given a direct edit attempt on such an event is blocked, when the attempt occurs, then no field-change audit entry is created for it. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-33 — View Event Readiness and Pending Arrangements (Done)

**Real boundary to exercise:** Readiness and submission → real readiness, snapshot, locks and notifications.

**Existing evidence locations:** [outstanding-items-list.test.tsx](../../apps/frontend/src/features/safety-check/components/outstanding-items-list.test.tsx); [readiness-checklist.test.tsx](../../apps/frontend/src/features/safety-check/components/readiness-checklist.test.tsx); [safety_check_readiness.test.sql](../../supabase/tests/database/safety_check_readiness.test.sql); [submit_event_for_safety_check.test.sql](../../supabase/tests/database/submit_event_for_safety_check.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Every venue booking and equipment requirement of the event is shown as Complete, Pending, Not Required, or Needs Review. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Any booking flagged Disrupted or Conflict - Needs Review, any active hold, and any equipment requirement flagged Needs Review count as Needs Review. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | The event is Ready only when it has an Approved, unflagged main venue booking, every other venue booking is Approved and unflagged (or cancelled), and all required equipment is reserved. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Readiness is derived from records and cannot be marked manually. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | When Ready, the assigned coordinator can submit the event; its status becomes Pending Safety Check and notification records are created for Safety Officers. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Submission is blocked with the outstanding items listed when the event is not Ready. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | The readiness view shows the status of each venue booking and the overall venue arrangement status. Tentative and expired holds never count as a completed venue arrangement. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | Each submission records the coordinator, timestamp and a snapshot of the venues, period, attendance and equipment. While the event is Pending Safety Check the coordinator cannot change venue or technical arrangements. Each resubmission starts a new review round. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC09 | If a booking becomes Disrupted while its event is Pending Safety Check, the event returns to Planning and the Safety Officer is notified. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC10 | An item not yet requested blocks readiness, shown as "X has not been requested from Technical Support Staff". | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-90 — Review Operational Safety and Approve an Event (Verify)

**Real boundary to exercise:** Review loaders and decision service → Express/Auth → status/history/notifications.

**Existing evidence locations:** [event-safety-check.route.test.ts](../../apps/backend/src/routes/event-safety-check.route.test.ts); [safety-check-decision-dialog.test.tsx](../../apps/frontend/src/features/safety-check/components/safety-check-decision-dialog.test.tsx); [safety-review-panel.test.tsx](../../apps/frontend/src/features/safety-check/components/safety-review-panel.test.tsx); [event-readiness.test.ts](../../apps/frontend/src/features/safety-check/services/event-readiness.test.ts); [safety-check-decisions.test.ts](../../apps/frontend/src/features/safety-check/services/safety-check-decisions.test.ts); [SafetyCheckReviewPage.test.tsx](../../apps/frontend/src/routes/SafetyCheckReviewPage.test.tsx); [SafetyChecksPage.test.tsx](../../apps/frontend/src/routes/SafetyChecksPage.test.tsx); [approve_event_safety_check.test.sql](../../supabase/tests/database/approve_event_safety_check.test.sql); [safety_check_review_details.test.sql](../../supabase/tests/database/safety_check_review_details.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | The Safety Officer sees a list of events in Pending Safety Check, oldest submission first. An empty queue shows a clear message. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | The review page shows, for each booked venue, the expected attendance against its capacity, the room layouts, the venue's accessibility information, and the venue description (which carries any emergency access information and known restrictions). It also shows the event's accessibility needs and its equipment with placement notes. Where nothing is recorded, the page says so. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | The review page highlights any venue whose capacity is lower than the attendance expected for it. Event information is read-only for the Safety Officer. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Approving, with an optional note, records the reviewer, note and time, and moves the event to Confirmed. Confirmed means ready for preparation; there is no separate preparation status. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Notification records are created for the coordinator and the organiser. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | An event not in Pending Safety Check cannot be approved. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-89 — Request Changes or Reject an Event's Safety Arrangement (Done)

**Real boundary to exercise:** Safety decision service → Express/Auth → review round and flags.

**Existing evidence locations:** [event-safety-check.route.test.ts](../../apps/backend/src/routes/event-safety-check.route.test.ts); [safety-check-decision-dialog.test.tsx](../../apps/frontend/src/features/safety-check/components/safety-check-decision-dialog.test.tsx); [approve_event_safety_check.test.sql](../../supabase/tests/database/approve_event_safety_check.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | The Safety Officer can choose Request Changes or Reject with a field to input the reason. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | For Request Changes, the Safety Officer selects which venue bookings and equipment arrangements are flagged as Needs Review, and the event returns to planning. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | For Reject, every venue booking and equipment arrangement of the event is flagged Needs Review and the event returns to planning. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Each review round is kept in the history with outcome, reason, reviewer, and time. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Notification records are created for any request changes or rejection. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-35 — View Confirmed Event Arrangements (Done)

**Real boundary to exercise:** Confirmed-arrangement loader → multi-venue/equipment records.

**Existing evidence locations:** [confirmed-arrangements-section.test.tsx](../../apps/frontend/src/features/event-requests/components/confirmed-arrangements-section.test.tsx); [confirmed-arrangements.test.ts](../../apps/frontend/src/features/event-requests/services/confirmed-arrangements.test.ts).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | The organiser can view the latest confirmed venue, date and time, equipment, and technical-support arrangements for their own Confirmed event. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | An arrangement that is not required is shown as Not Required rather than missing. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Pending or Needs Review arrangements are clearly separated from confirmed arrangements. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | An organiser cannot view arrangements for an event they do not own. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | All venue bookings for the event are listed, each with its own period. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-38 — Submit an Event Change Request (Done)

**Real boundary to exercise:** Change request service → Express/Auth → request state and notifications.

**Existing evidence locations:** [event-change-requests.route.test.ts](../../apps/backend/src/routes/event-change-requests.route.test.ts); [change-request-panel.test.tsx](../../apps/frontend/src/features/event-requests/components/change-request-panel.test.tsx); [change-requests.test.ts](../../apps/frontend/src/features/event-requests/services/change-requests.test.ts); [EventsPage.test.tsx](../../apps/frontend/src/routes/EventsPage.test.tsx); [spm46_complete_event.test.sql](../../supabase/tests/database/spm46_complete_event.test.sql); [submit_event_change_request.test.sql](../../supabase/tests/database/submit_event_change_request.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | The organiser can submit a change request for their event while it is Requested, Planning, Confirmed, or Pending Safety Check. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Before approval, ordinary permitted edits may instead be made directly under SPM-10. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | The request describes the desired change and includes a reason or supporting explanation. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | The current agreed arrangements remain active while the request is Pending Review. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Given the event already has an assigned coordinator, when the request is submitted, then it is recorded as Pending Review and the assigned coordinator is notified. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Given the event has no assigned coordinator (Requested only — AC01's other statuses always have one), when the request is submitted, then it is recorded as Pending Review and the Coordinator Lead is notified instead. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | The organiser can view the request status, outcome, and resulting adjustments. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | The organiser can withdraw a Pending Review request before a decision is made. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-39 — Review and Apply an Event Change (Done)

**Real boundary to exercise:** Review/apply service → flags, rechecks, lifecycle and notifications.

**Existing evidence locations:** [event-change-requests.route.test.ts](../../apps/backend/src/routes/event-change-requests.route.test.ts); [change-request-panel.test.tsx](../../apps/frontend/src/features/event-requests/components/change-request-panel.test.tsx); [change-requests.test.ts](../../apps/frontend/src/features/event-requests/services/change-requests.test.ts); [coordinator-event-edit.test.ts](../../apps/frontend/src/features/event-requests/services/coordinator-event-edit.test.ts); [notification-bell.test.tsx](../../apps/frontend/src/features/notifications/components/notification-bell.test.tsx); [ChangeRequestApplyPage.test.tsx](../../apps/frontend/src/routes/ChangeRequestApplyPage.test.tsx); [EventSafetyCheckPage.test.tsx](../../apps/frontend/src/routes/EventSafetyCheckPage.test.tsx); [spm39_apply_event_change_request.test.sql](../../supabase/tests/database/spm39_apply_event_change_request.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | When an approved change is applied, the affected arrangements are marked Needs Review:  date, time or duration changes flag all active venue bookings and equipment reservations;  expected attendance and venue requirement changes, including room layout, flag all active venue bookings;  equipment or technical requirement changes flag the affected equipment requirements;  registration setting changes can be applied only while the event is in Planning, and flag nothing. From Pending Safety Check onward, registration settings can't be changed through a change request | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | When arrangements are flagged, the relevant staff are notified. Venue staff are notified for flagged venue bookings, technical support staff for flagged equipment, and safety officers when the event returns to safety review. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Given a Pending Review change request on an event with no assigned coordinator, a Coordinator Lead can approve or reject it but cannot apply it. When the Lead later assigns a coordinator, that coordinator is notified of the waiting request. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Given a Pending Review change request, only the assigned coordinator, or a Coordinator Lead while the event is unassigned, can approve or reject it. Anyone else is refused. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Given a Pending Review change request, when it is approved, implementation notes are required. The decision, reviewer, time and notes are recorded, and the organiser is notified. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Given a Pending Review change request, when it is rejected, a reason is required. The organiser is notified with the reason, and the event and its arrangements are unchanged. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | Given an Approved change request, when the assigned coordinator applies it by entering the new event details, the details are saved even if they are normally locked in Planning. The request becomes Implemented and cannot be applied again. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | Given an applied change to date or time, each venue booking's effective window (including setup and turnaround) is re-checked, and any conflict is marked Conflict – Needs Review. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC09 | Given an arrangement in Needs Review, the event is not Ready to Confirm until that arrangement is resolved. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC10 | Given a Confirmed or Pending Safety Check event, when an applied change affects expected attendance, date/time, venue, room layout or equipment, the event returns to Planning and requires a new safety review. Changes to anything else leave the status unchanged. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC11 | Given an applied change, existing venue bookings and equipment reservations are never cancelled, released or replaced automatically. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-45 — Cancel an Event (Done)

**Real boundary to exercise:** Cancel service → Express/Auth → releases, history and notifications.

**Existing evidence locations:** [event-cancellation.route.test.ts](../../apps/backend/src/routes/event-cancellation.route.test.ts); [cancel-event-dialog.test.tsx](../../apps/frontend/src/features/event-requests/components/cancel-event-dialog.test.tsx); [event-cancellation.test.ts](../../apps/frontend/src/features/event-requests/services/event-cancellation.test.ts); [EventDetailPage.test.tsx](../../apps/frontend/src/routes/EventDetailPage.test.tsx); [event-cancellation.test.ts](../../packages/shared/src/schemas/event-cancellation.test.ts); [spm45_cancel_event.test.sql](../../supabase/tests/database/spm45_cancel_event.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Only the Event Coordinator assigned to the event can cancel it. An unassigned event or another coordinator's event is denied with a clear message, enforced on the server. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | An event can be cancelled when it is Requested, Planning, Pending Safety Check, or Confirmed. Completed, Cancelled, and Rejected events cannot be cancelled. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | A cancellation reason is required. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | When cancellation succeeds, the event status becomes Cancelled, and the actor, reason, and time are recorded. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | On cancellation, all of the event's venue bookings, active tentative holds, and equipment reservations are released and retained in event history, including who released them and when. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Cancelling the whole event is the only action that releases all of an event's venue bookings at once. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | On cancellation, notifications are created for the organiser, the assigned coordinator, the affected Venue Staff and Technical Support Staff, and the Registered attendees. If the event was Pending Safety Check, the Safety Officer is also notified. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | Once an event is Cancelled, new planning, booking, hold, reservation, and registration actions are blocked. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC09 | A Cancelled event's prior requests, arrangements, registrations, and decisions remain available to authorised users for internal audit. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-46 — Complete an Event (Done)

**Real boundary to exercise:** Completion service → timing, releases, retained records and guards.

**Existing evidence locations:** [change-request-panel.test.tsx](../../apps/frontend/src/features/event-requests/components/change-request-panel.test.tsx); [confirmed-arrangements-section.test.tsx](../../apps/frontend/src/features/event-requests/components/confirmed-arrangements-section.test.tsx); [equipment-arrangements.test.ts](../../apps/frontend/src/features/event-requests/services/equipment-arrangements.test.ts); [event-lifecycle.test.ts](../../apps/frontend/src/features/event-requests/services/event-lifecycle.test.ts); [EventDetailPage.test.tsx](../../apps/frontend/src/routes/EventDetailPage.test.tsx); [EventEquipmentPage.test.tsx](../../apps/frontend/src/routes/EventEquipmentPage.test.tsx); [EventSafetyCheckPage.test.tsx](../../apps/frontend/src/routes/EventSafetyCheckPage.test.tsx); [EventVenuePage.test.tsx](../../apps/frontend/src/routes/EventVenuePage.test.tsx); [EventsPage.test.tsx](../../apps/frontend/src/routes/EventsPage.test.tsx); [block_direct_edits_on_finalized_events.test.sql](../../supabase/tests/database/block_direct_edits_on_finalized_events.test.sql); [lifecycle_status_management.test.sql](../../supabase/tests/database/lifecycle_status_management.test.sql); [release_reservations_when_event_ends.test.sql](../../supabase/tests/database/release_reservations_when_event_ends.test.sql); [spm28_equipment_arrangement_status.test.sql](../../supabase/tests/database/spm28_equipment_arrangement_status.test.sql); [spm46_complete_event.test.sql](../../supabase/tests/database/spm46_complete_event.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Given a Confirmed event whose scheduled end time plus its venue turnaround time has passed, when its assigned coordinator marks it completed, then its status becomes Completed and the coordinator and time are recorded in the event's status history. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Given a Confirmed event whose scheduled end time plus its venue turnaround time has not been reached, when completion is attempted, then it is blocked, the status stays Confirmed, and the coordinator is told the earliest time it can be completed. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Given a Confirmed event, when anyone other than its assigned coordinator attempts to complete it, then it is blocked. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Given an event that is not Confirmed, when completion is attempted, then it is blocked. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Given a Completed event, when a user who could view it while it was Confirmed views it, then its venue bookings, equipment reservations, decisions, status history and registration records remain visible. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Given a Completed event whose equipment reservations were released on completion, when it is viewed, then each reservation still shows its details, labelled as released because the event was completed, not as Cancelled. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | Given a Completed event, when any planning or change action is attempted, then it is blocked and nothing is changed or recorded: edits, venue booking actions, equipment requirements or reservations, clarifications, change requests, safety check actions, coordinator assignment, cancellation, and new registrations. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-76 — Notification Centre (Done)

**Real boundary to exercise:** Notification service → recipient-scoped rows, read state and destinations.

**Existing evidence locations:** [notification-bell.test.tsx](../../apps/frontend/src/features/notifications/components/notification-bell.test.tsx); [notifications.test.ts](../../apps/frontend/src/features/notifications/services/notifications.test.ts).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | The notification centre lists only the signed-in user's notifications, newest first, each showing message, related event link, and time. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | An unread count badge is shown in the navigation and updates when notifications are read. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | A user can mark one notification, or all notifications, as read. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Selecting a notification opens the related event, subject to the user's normal access rights. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | A user cannot view another user's notifications. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

## 5. Registration and documents

### SPM-40 — Configure Event Registration (Done)

**Real boundary to exercise:** Settings service → lifecycle, capacity and readiness checks.

**Existing evidence locations:** [event-request-form.test.tsx](../../apps/frontend/src/features/event-requests/components/event-request-form.test.tsx); [coordinator-event-edit.test.ts](../../apps/frontend/src/features/event-requests/services/coordinator-event-edit.test.ts); [registration-settings-section.test.tsx](../../apps/frontend/src/features/registrations/components/registration-settings-section.test.tsx); [registration-settings.test.ts](../../apps/frontend/src/features/registrations/services/registration-settings.test.ts); [ChangeRequestApplyPage.test.tsx](../../apps/frontend/src/routes/ChangeRequestApplyPage.test.tsx); [EventDetailPage.test.tsx](../../apps/frontend/src/routes/EventDetailPage.test.tsx); [event-request.test.ts](../../packages/shared/src/schemas/event-request.test.ts); [registration-settings.test.ts](../../packages/shared/src/schemas/registration-settings.test.ts); [configure_event_registration.test.sql](../../supabase/tests/database/configure_event_registration.test.sql); [spm39_apply_event_change_request.test.sql](../../supabase/tests/database/spm39_apply_event_change_request.test.sql); [spm40_registration_capacity_in_planning.test.sql](../../supabase/tests/database/spm40_registration_capacity_in_planning.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | While creating or editing an event request (Draft, Requested or Clarification Requested), the organiser only chooses whether registration is required. No other registration settings are asked for at this stage. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Once the organiser's own event reaches Planning, they can turn registration on or off. When it's on, they set the registration settings. This includes a Confirmed event that has been sent back to Planning. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | When registration is on, the organiser must set all five settings:  an opening time  a closing time  a capacity, which must be a positive whole number  whether a waiting list is enabled  whether withdrawal is permitted | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | The opening time must be earlier than the closing time. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | If any setting is invalid, nothing is saved and the organiser is told which setting to fix. When registration is off, no settings are needed and attendees can't register. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | While the event is in Planning, the organiser can change only the registration settings. All other event details stay locked. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC07 | From Pending Safety Check onward (Pending Safety Check, Confirmed, Completed, Cancelled or Rejected), the registration settings can't be changed. An event that requires registration can't be submitted for safety check until its settings are complete and within the main venue's capacity. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC08 | Once the event's main venue booking is approved, capacity can't be more than that venue's capacity. Before then, capacity isn't limited by any venue. If a smaller main venue is approved after capacity was set, the event is flagged to the organiser rather than changed automatically. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC09 | Attendees can't register until the event is Confirmed, even if the opening time has passed. Once it's Confirmed, they can register between the opening and closing times. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-41 — Register for a Confirmed Event (Done)

**Real boundary to exercise:** Registration service → Express/Auth → atomic places and visibility.

**Existing evidence locations:** [event-registrations.route.test.ts](../../apps/backend/src/routes/event-registrations.route.test.ts); [EventRegistrationPage.test.tsx](../../apps/frontend/src/routes/EventRegistrationPage.test.tsx); [attendee_registration_rules.test.sql](../../supabase/tests/database/attendee_registration_rules.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | Before registering, the attendee sees the event's confirmed details, remaining places and registration period. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Given registration is open and places remain, when the attendee registers, then they see a confirmation, the registered count rises by one, and their status shows as Registered on the event page and in My Registrations. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Given registration has not opened or has closed, when the attendee tries to register, then they cannot, and the count is unchanged. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Given the event capacity has been reached, when the attendee tries to register, then they cannot, and the count is unchanged. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Given the attendee is already Registered, when they register again, then no duplicate is created and the count is unchanged. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-42 — Join a Waiting List for a Full Event (Done)

**Real boundary to exercise:** Waiting-list service → order, automatic promotion and withdrawal.

**Existing evidence locations:** [EventRegistrationPage.test.tsx](../../apps/frontend/src/routes/EventRegistrationPage.test.tsx); [attendee_registration_rules.test.sql](../../supabase/tests/database/attendee_registration_rules.test.sql); [event_waitlist.test.sql](../../supabase/tests/database/event_waitlist.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | The waiting-list option appears only when the event is full, registration is open and the waiting list is enabled. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | An attendee who is already Registered or already on the waiting list cannot join it. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Given the event is full and registration is open, when the attendee joins the waiting list, then they're added at the end and see their Waiting list status and position. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Given the attendee is first on the waiting list, when a Registered attendee withdraws, then they're registered automatically without taking any action, and everyone still waiting moves up one place. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Given the attendee is on the waiting list, when they choose to leave, then they're removed and everyone behind them moves up one place | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-43 — Withdraw an Event Registration (Done)

**Real boundary to exercise:** Withdrawal service → released capacity and re-registration.

**Existing evidence locations:** [event-registrations.route.test.ts](../../apps/backend/src/routes/event-registrations.route.test.ts); [withdraw-registration-dialog.test.tsx](../../apps/frontend/src/features/registrations/components/withdraw-registration-dialog.test.tsx); [registrations.test.ts](../../apps/frontend/src/features/registrations/services/registrations.test.ts); [EventRegistrationPage.test.tsx](../../apps/frontend/src/routes/EventRegistrationPage.test.tsx); [MyRegistrationsPage.test.tsx](../../apps/frontend/src/routes/MyRegistrationsPage.test.tsx); [attendee_registration_rules.test.sql](../../supabase/tests/database/attendee_registration_rules.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | A withdrawn registration has the status Withdrawn and may include an optional withdrawal reason. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Successful withdrawal provides confirmation and releases the place. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | When a previously withdrawn attendee registers for an event again, the request is evaluated as a new registration | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-44 — View Event Registration Information (Done)

**Real boundary to exercise:** Registration loaders → counts, attendee fields and RLS.

**Existing evidence locations:** [attendee-event.test.ts](../../apps/frontend/src/features/registrations/services/attendee-event.test.ts); [browse-events.test.ts](../../apps/frontend/src/features/registrations/services/browse-events.test.ts); [registrations.test.ts](../../apps/frontend/src/features/registrations/services/registrations.test.ts); [EventRegistrationPage.test.tsx](../../apps/frontend/src/routes/EventRegistrationPage.test.tsx); [EventRegistrationsPage.test.tsx](../../apps/frontend/src/routes/EventRegistrationsPage.test.tsx); [navigation.test.ts](../../packages/shared/src/domain/navigation.test.ts); [spm44_registration_visibility.test.sql](../../supabase/tests/database/spm44_registration_visibility.test.sql); [view_registration_attendee_profiles.test.sql](../../supabase/tests/database/view_registration_attendee_profiles.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | The organiser can view registration information only for their own events. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Event Coordinators see only their assigned events and the Event Coordinator Lead sees all events. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | The view shows registration capacity and counts for Registered, Withdrawn, and Waitlisted attendees. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | Authorised users can view attendee name, registration status, registration time, and waiting-list position where applicable. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Internal venue and equipment details are not exposed to the attendee-facing registration view. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |

### SPM-37 — Upload Supporting Event Documents (Verify)

**Real boundary to exercise:** Document service → local Storage, metadata RPCs, signed download and RLS.

**Existing evidence locations:** [event-documents-section.test.tsx](../../apps/frontend/src/features/event-documents/components/event-documents-section.test.tsx); [event-documents.test.ts](../../apps/frontend/src/features/event-documents/services/event-documents.test.ts); [EventDetailPage.test.tsx](../../apps/frontend/src/routes/EventDetailPage.test.tsx); [event-document.test.ts](../../packages/shared/src/domain/event-document.test.ts); [event_documents.test.sql](../../supabase/tests/database/event_documents.test.sql).

| Criterion | Source requirement | Responsible layer / missing evidence |
| --- | --- | --- |
| AC01 | An authorised organiser can upload PDF, PNG, and DOCX files within the team-defined size limit. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC02 | Unsupported or oversized files are rejected with a reason. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC03 | Authorised users can view a list of attached documents showing the file name, uploader, and upload date and can download each document. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC04 | An organiser can remove a document they uploaded; the removal and actor are recorded. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC05 | Unauthorised users cannot access event attachments. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
| AC06 | Documents cannot be added or removed once the event is Completed, Cancelled or Rejected; existing documents remain viewable to authorised users. | APP planned: verify this outcome through the boundary above. UI checks retain responsibility for visible controls/text. |
