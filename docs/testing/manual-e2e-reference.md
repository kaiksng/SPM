# ConnectSphere manual E2E technical reference

> Background reference only. For the current five journeys and user-facing instructions, use the [follow-along testing guide](manual-e2e-journeys.md). The broader journey catalogue below is preserved for traceability, not a requirement to execute all ten journeys. The guide runs on the shared staging site with run-tagged records; this reference's local-only setup advice applies if you choose an isolated environment instead.

Start with E2E-01, then E2E-02 through E2E-06: failures here can expose another user's information, double-commit resources, lose arrangements, or allow an unsafe event to proceed. E2E-07 through E2E-09 cover the next most useful extensions. E2E-00 is a quick signed-out smoke check.

Prepared 31 October 2026 from `staging-kk`, HEAD `624da4c5c5f59483bbfb1b5a64ce9fcf1264b70a`, **including the working-tree safety-history changes**. This is an inspection-based specification, not an execution report. No application, tests, setup scripts, accounts or database operations were run. No existing UAT records were changed. Main was not fetched/merged and dependencies were not installed because this request explicitly limits work to inspection/documentation. Deployment parity with this checkout is unverified.

## Requirements and evidence

The user confirmed `/Users/kaiks/Downloads/SPM List - Jira (6).csv` as the latest export. Its SHA-256 is `384255afb34a03ec2dac08f28242f15e7e702af5414f117c3336b5fc421926ae`. Read `Issue key`, `Summary` and the complete `Description`, rather than inferring requirements from Jira status. Explicit AC IDs below retain the source numbering. For unnumbered criteria, `AC: ...` identifies the requirement by wording; it does **not** introduce new AC numbers.

The Week 7 customer PDF at `/Users/kaiks/Library/CloudStorage/OneDrive-SingaporeManagementUniversity/Y3/Y3S1/IS212 Software Project Management/Project/Week 7 Customer Changes IS212.pdf` independently requires buffers, disruption recovery, multiple venues, expiring holds, lead assignment and safety review (pages 1–2). The original customer briefing gives the connected business process; it is broader than Release 1 and is not used to add unrequested features. Local `.claude/project-knowledge.md` supplies pointers only; current Jira, migrations and source were inspected separately.

Repository evidence to revisit if labels or behaviour change:

| Area | Execution path and supporting evidence, all inspected statically |
| --- | --- |
| Routes and role navigation | [App.tsx](../../apps/frontend/src/App.tsx), [navigation.ts](../../packages/shared/src/domain/navigation.ts), [RoleGate.tsx](../../apps/frontend/src/routes/RoleGate.tsx) |
| Intake, assignment and review | [EventsPage.tsx](../../apps/frontend/src/routes/EventsPage.tsx), [EventRequestEditorPage.tsx](../../apps/frontend/src/routes/EventRequestEditorPage.tsx), [clarification-panel.tsx](../../apps/frontend/src/features/event-requests/components/clarification-panel.tsx), [assign-coordinator-dialog.tsx](../../apps/frontend/src/features/event-requests/components/assign-coordinator-dialog.tsx); migrations `202610050003`, `202610050005`, `202610300012`; pgTAP `spm81_assign_event_coordinator`, `spm84_reassign_event_coordinator`, `spm7_approve_reject_event_request` |
| Venue selection and decisions | [EventVenuePage.tsx](../../apps/frontend/src/routes/EventVenuePage.tsx), [VenueDetailPage.tsx](../../apps/frontend/src/routes/VenueDetailPage.tsx), [VenueRequestsPage.tsx](../../apps/frontend/src/routes/VenueRequestsPage.tsx), [venue-bookings.ts](../../apps/frontend/src/features/venues/services/venue-bookings.ts); backend `venue-booking-submissions.route.ts`, `venue-booking-decisions.route.ts`, `venue-booking-hold.route.ts`; migrations `202610100003`–`202610100006`, `202610170002`, `202610170004`, `202610310003`; pgTAP `spm26_prevent_venue_booking_conflicts`, `spm85_multi_venue_bookings`, `venue_booking_hold` |
| Disruption and replacement | [VenueBlocksPage.tsx](../../apps/frontend/src/routes/VenueBlocksPage.tsx), [suggested-venues-panel.tsx](../../apps/frontend/src/features/event-requests/components/suggested-venues-panel.tsx); migrations `202610120004`, `202610140002`, `202610140003`, `202610190006`; pgTAP `spm83_venue_block_disruptions`, `spm82_replacement_venue` |
| Equipment to safety | [EventEquipmentPage.tsx](../../apps/frontend/src/routes/EventEquipmentPage.tsx), [event-equipment-availability.tsx](../../apps/frontend/src/features/equipment/components/event-equipment-availability.tsx), [EventSafetyCheckPage.tsx](../../apps/frontend/src/routes/EventSafetyCheckPage.tsx), [SafetyCheckReviewPage.tsx](../../apps/frontend/src/routes/SafetyCheckReviewPage.tsx); backend `event-safety-check.route.ts`; migrations `202610300007`–`202610300009`, `202610190004`, `202610200010`, `202610250002`; pgTAP `coordinator_requests_equipment`, `reserve_equipment`, `submit_event_for_safety_check`, `approve_event_safety_check` |
| Registration, changes, cancellation | [EventRegistrationPage.tsx](../../apps/frontend/src/routes/EventRegistrationPage.tsx), [registration-settings-section.tsx](../../apps/frontend/src/features/registrations/components/registration-settings-section.tsx), [change-request-panel.tsx](../../apps/frontend/src/features/event-requests/components/change-request-panel.tsx), [ChangeRequestApplyPage.tsx](../../apps/frontend/src/routes/ChangeRequestApplyPage.tsx); backend `event-registrations.route.ts`, `event-change-requests.route.ts`, `event-cancellation.route.ts`; migrations `202610200011`, `202610230005`, `202610240002`, `202610270005`, `202610300004`, `202610300005`; pgTAP `event_waitlist`, `spm39_apply_event_change_request`, `spm45_cancel_event` |
| Safety history, local changes | [SafetyChecksPage.tsx](../../apps/frontend/src/routes/SafetyChecksPage.tsx), [SafetyCheckHistoryPage.tsx](../../apps/frontend/src/routes/SafetyCheckHistoryPage.tsx), [202610310004_safety_review_history.sql](../../supabase/migrations/202610310004_safety_review_history.sql), [safety_review_history.test.sql](../../supabase/tests/database/safety_review_history.test.sql) |

Migration identifiers above are filename prefixes in [supabase/migrations](../../supabase/migrations); database-test names identify `.test.sql` files in [supabase/tests/database](../../supabase/tests/database). Frontend component and mocked backend tests support the controls/error paths, but do not prove the real multi-role journey. See also the [integration coverage matrix](integration-coverage-matrix.md), whose recorded results were not rerun for this task.

## Readiness and decisions

**No authenticated journey is verified ready for execution today.** Accounts, passwords, data, running URLs and applied migrations were deliberately not checked against a database. The specifications are concrete after the manifest below is completed. Missing prerequisites mean **Blocked**, not Fail. All journeys remain **Not Executed** until a tester starts them.

| Journey | Priority | Design readiness / execution blocker |
| --- | --- | --- |
| E2E-00 | P1 | Ready as a read-only smoke design; requires a running approved local frontend URL only |
| E2E-01 | P0 | Core path specified; requires all seven roles and dedicated venue/equipment; historical assignment/confirmation conflicts D1–D2 explained below |
| E2E-02 | P0 | Specified; requires a second organiser and coordinator; optional-reason discrepancy D4 remains separate |
| E2E-03 | P0 | Specified; requires exclusive buffered venue and two fresh Planning events |
| E2E-04 | P0 | Specified; requires a fresh Confirmed event with registrations and resources |
| E2E-05 | P0 | Main-venue replacement specified; D3 remains a contradictory older scenario; breakout replacement is blocked by D5 |
| E2E-06 | P0 | Change and safety re-review specified; safety-history portion additionally requires local migration `202610310004` |
| E2E-07 | P1 | Specified; requires two distinct attendees and capacity-one event |
| E2E-08 | P1 | Independent-room subset specified; required-room cascade/full-history acceptance blocked by D5 |
| E2E-09 | P1 | Specified; requires two fresh holds and controlled real expiry time; latest expiry availability migration required |

Requirements conflicts must remain visible; code is not the acceptance oracle:

| ID | Conflict and recommendation |
| --- | --- |
| D1 | SPM-5 still says automatic coordinator assignment; Week 7 page 2 and SPM-80/81 explicitly require an unassigned queue and Lead assignment. The existing matrix treats SPM-5/66/67 as retired. These journeys follow the explicit customer revision and SPM-80/81; reconcile the old Jira row rather than expecting automatic assignment. |
| D2 | SPM-34 still describes coordinator confirmation; Week 7 and SPM-79/90 require Safety Officer approval before preparation. Follow SPM-90's approval → Confirmed transition, as the later requirement. No coordinator bypass is accepted. |
| D3 | SPM-19's scenario rejects an overlapping block, whereas Week 7 page 1 and SPM-83 require saving it and flagging disruption. The matrix records a prior user decision to align Jira, but `(6).csv` still contains the old text. E2E-05 uses the explicit revised requirement. Reconcile SPM-19; do not test both contradictory outcomes as valid. SPM-83's usual unchanged-status rule has an explicit Pending Safety Check → Planning exception in its last criterion. |
| D4 | SPM-84 says reassignment reason is optional; both `assign-coordinator-dialog.tsx` and migration `202610050005` require it. E2E-02 uses a reason so the handoff can be tested. Optional-reason acceptance remains a requirement/code conflict, not a passed AC. Recommendation: support omission or formally revise Jira. |
| D5 | SPM-85 still has 14 criteria, including required-room cascading, but the booking model has no required-room flag. Exactly-one-main also needs interpretation while main is lost. Do not claim that full story passes from E2E-08. In addition, SPM-85's per-room period/headcount conflicts with SPM-82 AC04's event-wide attendance and the replacement flow's event-wide defaults/schedule restriction. Use a main booking matching the whole event in E2E-05; do not substitute a breakout and silently change its requirements. Agree a per-room replacement contract first. |
| D6 | SPM-6 says unresolved clarification blocks decision until explicitly resolved. The UI enables decision after an answer and decision code can close the round. E2E-01 explicitly closes the open round before approval, satisfying the conservative requirement. Answer-then-decide without a separate close needs agreement; it is not claimed covered. |
| D7 | SPM-38's direct-edit reference to SPM-10 conflicts with SPM-10's coordinator-only Planning scope. Use the explicit change-request path in E2E-06. Do not infer extra organiser edit rights. SPM-12's eight supported lifecycle states also coexist with legacy database enum values; this pack checks observable current transitions, not removal of legacy enum values. |

## Environment and setup manifest — user to prepare separately

Use an isolated **local** environment. Do not use the shared hosted project `qqyvnlznjgupmxfqutff` for these write journeys. The README's sample URLs and normal app env files can point at hosted Supabase. Before execution, the environment owner must confirm frontend `VITE_SUPABASE_URL`, backend `SUPABASE_URL` and backend credentials all belong to the same local instance; `VITE_BACKEND_URL`, backend `PORT` and `FRONTEND_ORIGIN` must match the chosen app URLs. Keep secret values out of this document/evidence. Use a separate frontend/backend instance when the normal instance targets hosted data. No setup commands are executed or supplied as a runner here.

The environment owner must separately review/apply the checkout's migrations locally, including `202610310003_expired_venue_holds_availability.sql` and, for history, `202610310004_safety_review_history.sql`. A migration file or generated type does not prove installation. Never repair hosted migration history as part of this exercise.

Fill these fields before a write journey. Aliases are **role slots**, not invented users or a claim any account exists. Obtain passwords privately through the team's approved channel. Do not use emails from synthetic unit/pgTAP fixtures as real logins.

| Alias | Required role | Verified login email / display name / local profile ID |
| --- | --- | --- |
| O1 | Event Organiser, owns the journey event | |
| O2 | Different Event Organiser, no relationship to O1's event | |
| L | Event Coordinator Lead | |
| C1 | Event Coordinator | |
| C2 | Different Event Coordinator | |
| V | Venue Staff | |
| T | Technical Support Staff | |
| S | Safety Officer | |
| A1 | Attendee | |
| A2 | Different Attendee | |

- Frontend base URL `BASE`: __________; backend URL: __________; local Supabase URL: __________.
- Tested commit/working-tree version and installed migration confirmation: __________.
- Session mapping: one browser **profile/context per account**, labelled with its alias. Two tabs in the same profile share authentication; two incognito windows may also share it. Use different browsers/profiles or separately isolated contexts. Keep a separate signed-out context U. Confirm the user menu's identity before every write.
- Run tag `R`: __________ (unique tester/date/time suffix). All proposed new names below use `Manual-E2E-R-<journey>-<suffix>`. These names describe records to create, **not existing fixtures**.
- Record exact event, booking, block, change-request and registration IDs/URLs in a run ledger as created. Never clean up by title substring alone.
- Choose a future local date `D` at least 14 days after execution starts; enter it as `YYYY-MM-DD`: __________. All times are **Singapore time (UTC+08)**. Each journey gets an independent free date/venue allocation; record the actual date if it differs from D. Do not share state from a previous journey.

Resource slots must be selected from verified local records or prepared separately by the owner:

| Slot | Exact setup contract; record actual name and ID before starting |
| --- | --- |
| VA | Dedicated venue, capacity 40, supported layout Classroom, area North, step-free accessibility recorded, operating on the chosen date 08:00–18:00; setup 30 min and turnaround 45 min. No bookings, holds, blocks or review flags in the journey's occupied windows except records explicitly created by that journey. Name/ID: __________ |
| VB | Second dedicated venue, capacity 40, same layout/area/accessibility/hours/buffers as VA; free for replacement. Name/ID: __________ |
| VC | Additional-room venue, capacity 10, same area/layout/hours/accessibility, setup 30 min/turnaround 45 min; free 10:30–12:15. Name/ID: __________ |
| EQ | Active catalogue item selectable by organiser/coordinator, 4 in-service units, no overlapping reservations or unavailability for 09:30–12:45 on the journey date. Record category/name/ID: __________ |

If actual resources have different characteristics, revise the data plan **before** execution; do not silently loosen expected outcomes. Provisioning users, catalogue resources and clean local data is setup for the owner, not part of this documentation task. Avoid changing a venue's buffers or stock that other journeys use.

### Independent event preparation recipes

These are explicit prerequisites for later journeys, not a dependency on having passed E2E-01. Either perform the recipe anew for that journey, recording all steps as setup, or have the owner supply a fresh local fixture with the same contract. If setup cannot reach the required state, mark that journey Blocked and link the upstream defect. Do not directly change statuses to bypass the workflow.

**P — fresh Planning event:** O1 opens `BASE/events/new`; enters name `Manual-E2E-R-<journey>`, Purpose `Meeting`, Description `Manual journey <journey>`, Expected attendance `20`, Starts `D 10:00`, Ends `D 12:00`, Preferred location `North`, Room layout `Classroom`, Accessibility needs `Step-free access`; leaves facilities empty, equipment empty and registration unchecked unless the journey specifies otherwise. Select **Submit request**. L opens **Events → Unassigned queue**, finds that exact title, selects **Assign coordinator**, chooses C1's verified display name in **Coordinator**, then **Assign coordinator**. C1 opens the event from **Events**, selects **Approve**, then **Approve event**. Required state: Planning, owned by O1, assigned only to C1, no clarifications or downstream arrangements. Record its ID as E.

**V — approved main venue:** starting from a fresh P, C1 opens `BASE/events/E/venue` (lifecycle **Venue**), chooses VA's **View details** in **Suggested venues**; if necessary uses **Search venues** with the unchanged event period and requirements. Verify venue/period/headcount, then **Request venue**. V opens **Requests** (`/venue-requests`), selects the exact event/VA request, **Approve → Approve request**. Required result: approved main booking BVA, event still Planning. Record booking ID and venue ID. The calendar's confirmed-booking label is distinct from the event's Confirmed lifecycle state.

**F — fresh Confirmed event:** start with independent P + V. For equipment, C1 opens `BASE/events/E/equipment`, **Add equipment**, selects EQ, Quantity `2`, Technical requirements `Place beside the presentation area without blocking access`, saves with **Add equipment**; then **Request equipment**, selects EQ and **Request 1 item**. T opens **Event requests** (`/equipment`), searches the exact title and reserves quantity `2` using **Reserve → Reserve**. If registration is required, O1 opens the event's **Registration → Edit**, sets required on, opens at execution time minus 1 hour, closes at D 09:00, capacity as specified by the journey (default `20`), **Waiting list: Yes**, **Attendees may withdraw: Yes**, then **Save**. Record the exact opening/closing times. C1 opens **Safety Check** (`/events/E/safety-check`), verifies Ready and **Submit for Safety Check**. S opens **Safety Checks → Awaiting review**, selects the title/**Review event**, verifies the arrangements, **Approve → Confirm approval**. Required state: Confirmed, approved unflagged main venue, EQ 2 reserved, no outstanding changes. Registration, when enabled, is open and has zero registrations/waiters. Record E/BVA/EQ requirement/reservation IDs. A fixture without equipment can be used only where a journey explicitly says so.

In any recipe, a missing button, different label or failed write is evidence to capture, not permission to invent a workaround. Setup is not evidence that the journey under test passed.

### Common evidence, results and cleanup contract

For every journey capture the exact title/ID, actor alias, Singapore timestamp, starting state, decisive before/after state, each relevant role's view, refresh/sign-in persistence, and visible error/notification. Use the bell labelled **Notifications** (possibly with unread count) to inspect relevant records. Match by event and timestamp, not global unread count. Do not require an email or push message: requirements here call for in-app notification records. Redact passwords, tokens and unrelated users' data.

After verification, sign out through the user menu's **Sign out** in each used context. App cleanup can release commitments but often retains audit history; it is **not physical deletion**. Submitted/Rejected/Completed events have no general delete UI. For full removal, the local environment owner needs a separately reviewed, ID-scoped cleanup procedure covering only this run's event children, notifications/audit and any storage objects. None is executed or invented here. If that procedure is unavailable, record **Cleanup pending** and keep the exact ID ledger; do not delete users, shared resources or reset a database that contains others' work. A local reset is appropriate only if the owner verifies the entire instance is exclusively disposable for this run.

Each journey includes blank fields. Set Status to exactly one of `Pass`, `Fail`, `Blocked`, `Not Executed` during execution. Empty means no execution recorded. Expected results below are not actual results.

## E2E-01 — Request to safe, confirmed, registerable event

**Priority/purpose:** P0. Prove the complete handoff through Organiser → Lead → Coordinator → Venue Staff/Technical Support → Safety Officer → Attendee.

**Traceability:** SPM-2 AC1–3; SPM-3 AC: valid submission, venue requirements, submission time/status; SPM-80 AC: unassigned queue and awaiting assignment; SPM-81 AC: single assignment/history/notifications; SPM-6 AC: request, permitted fields and unresolved decision lock; SPM-7 AC: approval → Planning and decision notification; SPM-24/25 AC: request and venue decision; SPM-27 AC01–05/09; SPM-32 AC: requested-item reservation; SPM-33 AC: readiness, submission and freeze; SPM-90 AC1–6; SPM-40 AC01–03/07–09; SPM-41 AC1–2/5. D1, D2 and D6 apply; this does not claim every AC of these stories.

**Preconditions:** BASE/local migrations, O1/L/C1/V/T/S/A1 separate sessions, VA/EQ verified. Fresh name `Manual-E2E-R-01`, D 10:00–12:00; no record with that run ID. Registration period as F, capacity 20. Environment/setup blocked until manifest complete.

| Step | Account and manual action | Expected observable result |
| --- | --- | --- |
| 1 | O1: `/events/new`, enter only Event name; **Save draft**. Refresh Events; **Continue editing** on that card. | Draft persists with the name and incomplete fields. L's queue and C1's assigned list do not include it. |
| 2 | O1: fill the P fields, add EQ quantity 2 with Required from D 09:30, Required until D 12:45 and placement note from F; check **Attendee registration is required**; **Save draft**. Reopen once. | Latest values persist as Draft. Registration needs are recorded without demanding the Planning registration settings yet. |
| 3 | O1: use the draft card's **Submit request** and the editor's **Submit request**. | Requested and submission timestamp appear; organiser sees **Awaiting coordinator assignment**. No automatic coordinator appears. |
| 4 | L: Events → **Unassigned queue**, find title; inspect organiser, schedule, attendance and submission; **Assign coordinator**, choose C1, **Assign coordinator**. | Event leaves queue and appears under C1 in **Oversight** and C1's list. O1 sees C1; O1/C1 receive assignment notifications. |
| 5 | C1: open event, **Request clarification**; enter `Confirm that the accessible entrance is needed`; allow only **Venue requirements**; **Send request**. O1 opens **Respond** without submitting a response. | Clarification is visible, lifecycle remains Requested; Approve/Reject disabled while open. Venue requirements are editable for O1; unpermitted sections are locked. Permission is granted by section, not an individual accessibility field. |
| 6 | C1: **Close clarification** (explicitly resolves this round), then **Approve → Approve event**. | Event becomes Planning; O1 sees decision notification. Change history retains question, actor/time and closed round. No automatic venue approval or event confirmation. |
| 7 | O1: event **Registration → Edit**, set F's open period, capacity 20, Waiting list Yes, Attendees may withdraw Yes; **Save**. Refresh. | Settings persist, other event details remain locked for O1 in Planning. Attendees still cannot register before Confirmed. |
| 8 | C1/V: perform recipe V for this event. | Exact VA booking is Pending then approved; VA availability reflects occupied 09:30–12:45. C1 sees venue decision/notification; event remains Planning. |
| 9 | C1: **Equipment → Request equipment**, select the saved EQ row; **Request 1 item**. T: **Event requests**, locate title, **Reserve**, Quantity to reserve 2, **Reserve**. | T can see the explicitly requested item and required period; 2 units reserved, arrangement becomes Arranged. C1 sees full quantity and history. Saving requirements alone is insufficient. |
| 10 | C1: **Safety Check**, inspect all arrangements and **Submit for Safety Check**. | Ready only after approved unflagged main venue, full equipment and valid registration settings. Status becomes Pending Safety Check; S notified. C1 cannot change venue/equipment while pending. |
| 11 | S: Safety Checks → Awaiting review → event. Read capacity/headcount, layout, accessibility/restrictions and equipment notes; **Approve**, optional note `Reviewed for manual journey 01`, **Confirm approval**. | Read-only facts; decision records reviewer/note/time; event becomes Confirmed, O1/C1 notified. No extra coordinator confirmation is needed. |
| 12 | A1: **Browse Event** (`/browse-events`), find exact title and open it; compare confirmed schedule/venue and remaining places; **Register**. Open **My Registrations**. | Registered confirmation on event and My Registrations; registered count increases once, places fall from 20 to 19. No second Register action creates another place. |
| 13 | O1/C1/L: open `/events/E/registrations`. O1/C1 refresh event; A1 signs out and back in, opens My Registrations. S uses **Review history → View decision**. | Authorised roles see A1 once; confirmed arrangements persist; A1 stays Registered. S sees saved decision/snapshot after approval when history migration is installed. |

**Final outcome/evidence:** one accountable coordinator, one approved main venue, 2 EQ reserved, safety approval and Confirmed event, one registration; retain Draft/Requested/Planning/Pending Safety Check/Confirmed screenshots and cross-role notifications. If history migration is absent, mark that step Blocked separately, not a full Pass.

**Cleanup:** A1 **Withdraw registration → Withdraw** first; C1 **Cancel event**, reason `Manual journey 01 complete`, **Confirm cancellation** to release this event's resources. Owner removes only ledger IDs under the common contract; do not remove VA/EQ/accounts.

Actual result: __________\
Status (Pass / Fail / Blocked / Not Executed): __________\
Defect reference: __________\
Evidence links / run ledger / cleanup result: __________

## E2E-02 — Reassignment transfers responsibility and revokes old access

**Priority/purpose:** P0. Prevent leaked event data and conflicting management after a handoff.

**Traceability:** SPM-84 AC: new/closed assignment, immediate access transfer, preserved arrangements, notifications; SPM-15 AC: assigned events only; SPM-9 AC01/02/04; SPM-14 AC: own events only; SPM-49 AC: no attendee planning access; SPM-17 AC: graceful denial. Optional reason remains D4.

**Preconditions:** independent P + V event `...-02`, fresh EQ requirement requested to T but not reserved, no other pending decisions. O1/O2/L/C1/C2/V/T/A1 sessions. Save E, BVA, requirement ID and C1's event/venue/equipment/history URLs. O2 and C2 have no authorisation initially.

| Step | Account and manual action | Expected observable result |
| --- | --- | --- |
| 1 | O1/C1: open event and history; record approved main booking and pending equipment. C2/O2: paste `/events/E` and `/events/E/history`. | O1/C1 can read. C2/O2 cannot read protected event facts or history; no record appears in their Events lists. Same-role denial may say Event unavailable rather than RoleGate's message. |
| 2 | A1: paste `/events/E/venue`; T: paste `/events/E/history`; V: paste `/events/E/equipment`. | Wrong-role routes display **You don't have access to this page** with no planning details. |
| 3 | L: Events → Oversight, find title → **Reassign**; choose C2, Reason `Manual handoff 02`, **Reassign event**. | Exactly C2 becomes accountable. C1's assignment closes; history retains both coordinators, Lead and timestamp. O1/C1/C2 receive relevant notifications. |
| 4 | C1: refresh previously open event and each saved child/history URL; try to return through Events. | Event disappears from C1's assigned list; protected event/arrangement/history data cannot be reloaded. Capture any stale action that remains and the server's refusal if clicked; hidden UI alone does not prove all API authorisation. |
| 5 | C2: open event/venue/equipment/history; T refreshes Event requests. | Same E/BVA/requirement IDs and values remain, no recreated bookings; equipment responsibility remains with T. C2 can manage; O1 sees C2. |
| 6 | C2: request the pending EQ if not already sent; T reserves 2. C2 refreshes Safety Check; L views oversight/history read-only. | New coordinator's workflow advances; old coordinator cannot participate. Lead can supervise without acquiring coordinator planning controls. |
| 7 | C1/C2/O1: sign out/back in and repeat their event URLs. | Revocation/new access/owner visibility persist across sessions. |

**Final outcome/evidence:** complete handoff without changing resource IDs. Capture denied deep links, before/after assignment history and three notification recipients. This is a browser permission journey, not exhaustive direct API/RLS testing.

**Cleanup:** C2 cancels this event with reason `Manual journey 02 complete`; owner removes only E and ledger children. Do not reassign unrelated events or delete either coordinator.

Actual result: __________\
Status (Pass / Fail / Blocked / Not Executed): __________\
Defect reference: __________\
Evidence links / run ledger / cleanup result: __________

## E2E-03 — Buffered venue conflict blocks a second commitment

**Priority/purpose:** P0. Detect overlapping occupied time even when advertised event times do not overlap.

**Traceability:** SPM-86 AC: configurable setup/turnaround; SPM-87 AC: effective windows in search/conflict; SPM-20 AC: availability; SPM-24 AC01/02/03/06; SPM-26 AC: prevent overlapping active bookings. Only already-configured buffers are exercised here, not buffer editing/history.

**Preconditions:** O1/L/C1/V, VA exact 30/45 buffers; independent P events `...-03-first` (D 10:00–12:00) and `...-03-second` (D 12:30–14:00), both registration/equipment off. VA initially free 09:30–14:45. VA is suitable for both. Record E1/E2 separately; inspect E2's request-mode URL `BASE/venues/VA-ID?forEvent=E2` before E1 books, without submitting.

| Step | Account and manual action | Expected observable result |
| --- | --- | --- |
| 1 | C1: on E1 Venue, **View details → Request venue** for VA. Leave Pending. | One pending request occupies 09:30–12:45; V sees it in Requests. |
| 2 | C1: E2 Venue → Search venues for unchanged 12:30–14:00; inspect suggestions too. Reload the saved VA request-mode URL. | VA cannot be requested: E2 occupies 12:00–14:45, overlapping E1. Search excludes it or suggestions identify its unavailable state; Request venue is blocked with a reason. No E2 Pending request/notification appears. |
| 3 | V: approve E1 via **Approve → Approve request**. C1 repeat E2 check. | Conflict remains after approval; changing Pending to approved does not release occupancy or confirm the event. |
| 4 | C1: E1 Venue → VA **Cancel booking**, enter Reason `Release conflict fixture 03`, **Confirm cancellation**. | Only BVA of E1 is released; cancellation reason/history retained. |
| 5 | C1: E2 Venue, search again unchanged, VA View details → **Request venue**. V approves it. | E2 now obtains one approved booking; E1 remains Planning with cancelled venue history. |
| 6 | V: `/venues/VA-ID/availability`; C1 reloads both event Venue pages and signs in again. | E1 no longer occupies time, E2 occupies 12:00–14:45; histories persist and no duplicate E2 request was created by the denied attempt. |

**Final outcome/evidence:** before/after calendar, buffer settings, exact times, disabled/refused E2 request, one surviving approved booking. Sequential stale-page checking does not prove simultaneous-transaction safety; that is a gap below.

**Cleanup:** C1 cancels E1 and E2 (whole event) separately with journey-specific reason. Owner removes only the two events and their ledger children, retaining VA.

Actual result: __________\
Status (Pass / Fail / Blocked / Not Executed): __________\
Defect reference: __________\
Evidence links / run ledger / cleanup result: __________

## E2E-04 — Cancel a confirmed event and release commitments

**Priority/purpose:** P0. Stop a cancelled event occupying resources or accepting attendees while preserving accountability.

**Traceability:** SPM-45 AC: assigned coordinator only, mandatory reason, Cancelled/history, all resources released, recipient notifications, future actions blocked, retained audit; SPM-11 AC01–03; SPM-41/43 AC: registration visibility/withdrawal. Pending-safety cancellation and active-hold release are additional gaps, not assumed covered by this confirmed-event case.

**Preconditions:** independent F event `...-04`, registration capacity 20; A1 already Registered through Register; EQ 2 reserved, VA approved. O1/L/C1/V/T/S/A1. Capture baseline availability and exact registrations/resources. No attendee withdrawal before cancellation.

| Step | Account and manual action | Expected observable result |
| --- | --- | --- |
| 1 | O1/C1/V/T/A1: inspect this event's confirmed details, booking, reserved quantity and A1 registration. | All views agree on E, D 10:00–12:00 and arrangement IDs. |
| 2 | C1: event **Cancel event**, enter Reason for cancelling `Operational cancellation for manual journey 04`, **Confirm cancellation**. | Event becomes Cancelled; actor/reason/time recorded. |
| 3 | V: inspect Requests/history and VA availability. T: Event requests, inspect retained reservation/history and available stock for 09:30–12:45. | VA no longer occupied by E; 2 units returned to available pool (4 if no other activity). Original resource records retained as released/cancelled history, not silently deleted. |
| 4 | O1/C1/V/T/A1: Notifications, find this cancellation. A1: My Registrations → event. | Required affected roles have cancellation records. Attendee sees cancelled event information; do not assume registration status becomes Withdrawn, as Jira does not require that. |
| 5 | C1: reopen venue/equipment/safety pages; A1 reload `/browse-events/E`; O1 inspect change controls. | No new booking/reservation/planning/registration action succeeds; event/history remain readable to authorised roles. |
| 6 | O1/C1/A1 sign out/back in; L open event/history; V/T recheck release. | Cancelled status, reason, retained arrangements and released resource availability persist; Lead retains permitted audit visibility. |

**Final outcome/evidence:** same event/resources before and after; cancellation notifications for specified affected accounts, released capacity and blocked actions. Do not infer S receives a cancellation notification for a Confirmed event; S notification is explicitly required for Pending Safety Check cancellation.

**Cleanup:** no further event mutation needed; owner removes only E and ledger children via the reviewed local procedure. Never delete attendee profiles or resource catalogue records.

Actual result: __________\
Status (Pass / Fail / Blocked / Not Executed): __________\
Defect reference: __________\
Evidence links / run ledger / cleanup result: __________

## E2E-05 — Disrupt an approved venue and replace it without losing the event

**Priority/purpose:** P0. Keep an event viable after operational unavailability and avoid releasing its original booking before a replacement is accepted.

**Traceability:** SPM-83 AC: overlap save/preview/confirmation, buffered disruption, coordinator notification, Not Ready, new requests refused; SPM-82 AC01–06/08; SPM-25 AC: rejection reason and decision notification. Week 7 page 1 resolves the intended revised behaviour; D3/D5 still require backlog reconciliation.

**Preconditions:** independent P + V event `...-05` with main VA covering the **whole event** and headcount 20; no EQ/registration. VB free/suitable. O1/C1/V; record E/BVA and event details. Do not use a breakout booking for this journey. D 10:00–12:00, buffers 30/45.

| Step | Account and manual action | Expected observable result |
| --- | --- | --- |
| 1 | V: VA details → **Manage blocks** (`/venues/VA-ID/blocks`); Reason category **Maintenance**, Reason `Manual-E2E-R-05 disruption`, Start D 12:15, End D 13:00; **Save block**. | **This block affects existing bookings** lists E, C1 and period even though raw event ended 12:00: turnaround overlaps. No block saved before confirmation. |
| 2 | V: **Save block anyway**. | Block saved; BVA flagged Disrupted - Alternative Required; original approval/history retained; E remains Planning and is not Cancelled. |
| 3 | C1: Notifications → E, then Venue and Safety Check. O1 refresh event. | Notification identifies event/venue/affected period/reason and alternatives needed. Original event details retained; readiness blocked by disruption. |
| 4 | C1: disrupted booking's venue selection → **Search venues**; verify original period/requirements and absence of VA; VB **View details → Request replacement**. | New linked Pending replacement; original remains approved and Disrupted with reason visible; no premature release of original. |
| 5 | V: Requests, select linked replacement → **Reject**, Reason for rejecting `Manual replacement rejection 05`, **Reject request**. | Only replacement rejected. C1 sees reason/notification; original remains Disrupted and can be replaced again. |
| 6 | C1: repeat VB replacement request (VB is free again). V: **Approve → Approve request**. | New replacement approved; original automatically cancelled and linked; disruption resolved. E preserved; no unrelated bookings removed. |
| 7 | C1/O1: refresh event, Venue and Change history; V inspect VA/VB calendars and request activity. C1 signs out/back in. | Original/rejected/approved replacement chain persists; event schedule remains D 10:00–12:00, VB now approved main. VA's operational block still applies; do not mistake old booking release for removal of the block. |

**Final outcome/evidence:** overlap preview, saved block, original record before approval, rejection recovery, linked replacement/history and C1 notification. This does not cover the Pending Safety Check disruption exception, block shortening, or withdrawal of a pending replacement.

**Cleanup:** C1 cancels only E. V opens this journey's exact block → **Remove block → Remove block**; verify removed history and released window. Owner physically removes only E, replacement children and this block ID if required; keep VA/VB and other blocks untouched.

Actual result: __________\
Status (Pass / Fail / Blocked / Not Executed): __________\
Defect reference: __________\
Evidence links / run ledger / cleanup result: __________

## E2E-06 — Apply a significant change, rework safety and reconfirm

**Priority/purpose:** P0. Ensure an approved change cannot bypass arrangement review or preserve an obsolete safety approval.

**Traceability:** SPM-38 AC: request/reason/Pending Review/current arrangements retained; SPM-39 AC01/02/04/05/07/09–11; SPM-33 AC: derived readiness and new submission round; SPM-89 AC1–5; SPM-90 AC4–6. No registration-setting changes are requested.

**Preconditions:** independent F `...-06` with registration **off**, no attendees; VA capacity 40, attendance 20, EQ 2 reserved. O1/C1/V/T/S separate sessions. Installed safety-history migration required for S's retained-history assertions. Record approved baseline and original safety round/decision IDs.

| Step | Account and manual action | Expected observable result |
| --- | --- | --- |
| 1 | O1: event **Request a change**. What change are you requesting? `Increase expected attendance from 20 to 30; retain schedule and resources`. Reason `Additional participants for manual journey 06`; **Send request**. | Pending Review visible; C1 notified. Event remains Confirmed, attendance stays 20, same venue/equipment commitments. |
| 2 | C1: open E → **Change history** to read the request, then return to `/events/E`; in **Change requests** select **Approve**; Implementation notes `Set attendance to 30 and recheck venue safety`; **Approve request**. | Approved request awaiting application; attendance still 20. O1 notified. Approval alone changes no arrangement. |
| 3 | C1: **Apply change**, change only Expected attendance to 30, **Apply change**. | Request becomes Implemented; attendance 30; event returns to Planning; venue flagged Needs Review and relevant staff/Safety notified. EQ unchanged because this change affects attendance only. No reservation/booking silently cancelled. |
| 4 | C1: Safety Check; V verifies VA still seats 30 and its layout/access information is suitable. C1: venue item **Mark resolved** after that review, **Submit for Safety Check**. | Before resolving: Not Ready and submission blocked. After resolving: new submission round with attendance 30; Pending Safety Check. Original approved round retained. |
| 5 | S: Awaiting review → E → **Request changes**; select **only VA's venue booking**, Reason `Reconfirm emergency access for the larger group`, **Send change request**. | Event returns to Planning; selected booking Needs Review; EQ unflagged. Decision has reason/reviewer/time and C1 notification. This is not a rejected or cancelled event. |
| 6 | C1/V: verify access information and arrange the stated correction outside the system if needed; C1 **Mark resolved** on that booking, **Submit for Safety Check**. S: next review → **Reject safety arrangement**, Reason `Recheck all arrangements for manual journey 06`, **Confirm rejection**. | Another round recorded. All active venue/equipment arrangements flagged Needs Review, event returns to Planning. Prior approvals/changes remain in history; resources are not released by this rejection. |
| 7 | C1/V/T: check the flagged arrangements; C1 marks the venue and equipment flags resolved on Safety Check only after correction/review. Submit again. S: **Approve → Confirm approval**. | Readiness requires all outstanding flags resolved, not manual override of Ready. Event Confirmed; latest approval recorded, O1/C1 notified. |
| 8 | S: Review history, filter/search exact event and open each **View decision**. O1/C1 inspect Change history; refresh and sign in again. | Original approval, changes-requested, rejection and final approval each retain round/outcome/reviewer/time. Saved snapshots distinguish earlier attendance 20 from later 30. Implementation recorded once; no second Apply action succeeds. |

**Final outcome/evidence:** pending versus applied values, Implemented request, return to Planning, selected versus all flags, blocked readiness, resubmission rounds, final Confirmed state. Capture missing history as Blocked if migration is absent. Historical layout/accessibility/placement facts are not all saved in current snapshots; do not substitute live facts as historical evidence.

**Cleanup:** C1 cancels only E with reason `Manual journey 06 complete`; owner removes its change requests, decisions, snapshots, notifications and other ledger children by exact IDs. Preserve resource/catalogue/account records.

Actual result: __________\
Status (Pass / Fail / Blocked / Not Executed): __________\
Defect reference: __________\
Evidence links / run ledger / cleanup result: __________

## E2E-07 — Full event, waiting list and automatic promotion

**Priority/purpose:** P1. Ensure a released attendee place reaches the next waiting attendee exactly once.

**Traceability:** SPM-40 AC03/07–09; SPM-41 AC1/2/4/5; SPM-42 AC1–4; SPM-43 AC: withdrawal/released place/new-registration evaluation; SPM-44 AC: authorised registration visibility.

**Preconditions:** independent F `...-07`, capacity **1**, Waiting list Yes, Attendees may withdraw Yes, open registration period through D 09:00, zero registered/waiting. A1/A2 must be different attendee IDs in isolated sessions; O1/C1/L available. VA capacity 40 does not require registration capacity to equal 40.

| Step | Account and manual action | Expected observable result |
| --- | --- | --- |
| 1 | A1: Browse Event → exact event → **Register**. | Registered; registered count 1, remaining places 0; My Registrations agrees. |
| 2 | A2: reload event → **Join waiting list**. | Waiting list position 1; no extra Registered place, count stays 1. No duplicate Join action while already waiting. |
| 3 | O1/C1/L: `/events/E/registrations`; compare A1/A2 statuses. | Authorised roles see one Registered and one waiting, distinct users. |
| 4 | A1: event → **Withdraw registration**, optional reason `Manual promotion journey 07`, **Withdraw**. | A1 Withdrawn with confirmation; released place triggers automatic promotion. |
| 5 | A2: reload event and My Registrations without selecting Register. Inspect Notifications. | A2 automatically Registered, no waiting position, promotion notification; count remains 1. |
| 6 | A1: reload event; O1/C1 refresh registrations; A2 sign out/back in. | A1 remains Withdrawn; A2 Registered once. A1 cannot take another Registered place while full; may join the waiting list as a newly evaluated request if choosing to do so (do not do so in this base journey). |

**Final outcome/evidence:** both identities before/after, position 1, withdrawal confirmation, automatic promotion notification and stable count. Queue ordering among 3+ people and leaving a waiting list are gaps, not claimed covered.

**Cleanup:** A2 withdraws; A1 already withdrawn. Verify no waiter remains, then C1 cancels E. Owner removes only this event's ledger records; do not remove attendee accounts.

Actual result: __________\
Status (Pass / Fail / Blocked / Not Executed): __________\
Defect reference: __________\
Evidence links / run ledger / cleanup result: __________

## E2E-08 — Multiple rooms receive independent decisions and release

**Priority/purpose:** P1. Prevent one room's rejection/cancellation from losing the event's other rooms.

**Traceability:** SPM-85 source criteria: additional request, independent checks, per-room period/headcount/needs, listing, independent decisions, selective release; SPM-25 AC: approval/rejection. D5 blocks full acceptance of required-room cascading and complete booking-change history. This journey intentionally covers ordinary independent rooms only; a Pass cannot close SPM-85 in full.

**Preconditions:** independent P + V `...-08`, approved main VA 10:00–12:00/headcount20; VC free/suitable for 10 people 11:00–11:30 (occupied 10:30–12:15), layout Classroom, area North. C1/V/O1; no required-room designation assumed or fabricated.

| Step | Account and manual action | Expected observable result |
| --- | --- | --- |
| 1 | C1: Venue → **Add another venue**. Booking label `Breakout 1`, Start D 11:00, End D 11:30, Number of people 10, Location North, Room layout Classroom; no facilities; Accessibility keywords matching VC; **Search venues**. | VC is assessed using this room's 10-person need, despite event attendance 20; period remains inside whole event. |
| 2 | C1: VC **View details → Request additional venue**. V: Requests, select Breakout 1, **Reject**, reason `Manual room rejection 08`, **Reject request**. | Only Breakout 1 rejected; main VA remains approved/main; event remains Planning. |
| 3 | C1: repeat additional-room search/request with label `Breakout 1 retry` and same period/needs. V: **Approve → Approve request**. | Two approved active rooms: VA main and VC additional, with distinct periods/headcounts/labels. |
| 4 | C1: on VC's exact approved row **Cancel booking**, Reason `Breakout no longer needed 08`, **Confirm cancellation**. | VC released and reason retained; VA remains approved/main. Staff notified; no whole-event cancellation. |
| 5 | O1/C1: refresh Venue/Change history; V inspect both calendars and request activity. C1 sign in again. | Main room retained; rejected and cancelled additional bookings remain traceable. Report missing label/action history against D5 rather than treating current derived activity as complete audit. |

**Final outcome/evidence:** per-room needs/search, independent decision outcomes, VC release and unchanged VA. Changing main repeatedly, cancelling the only main, required rooms and breakout replacement are deliberately excluded pending decisions.

**Cleanup:** C1 cancels E (releasing VA only; VC already released). Owner removes only E and its room-booking ledger children, keeping VA/VC intact.

Actual result: __________\
Status (Pass / Fail / Blocked / Not Executed): __________\
Defect reference: __________\
Evidence links / run ledger / cleanup result: __________

## E2E-09 — Confirm a tentative hold and let a separate hold expire

**Priority/purpose:** P1. Prove a hold is temporary and confirmation returns it to venue decision rather than confirming the event.

**Traceability:** SPM-78 AC1–4; SPM-75 AC1–5; SPM-33 AC: holds never complete readiness. Two independent fresh events are required for the mutually exclusive confirmation/expiry outcomes.

**Preconditions:** P events `...-09-confirm` and `...-09-expire`, with free **different** venue/date allocations satisfying VA's contract. C1/V; both requests Pending. Record expiry H at least 5 minutes after placing each hold, still before the event's occupied period. For expiry leg, allow real time to pass; no changing database or operating-system clock. Record exact H/timezone. Latest `202610310003` must be installed. This is setup blocked until safe hold timing is allocated.

| Step | Account and manual action | Expected observable result |
| --- | --- | --- |
| 1 | V: Requests, confirm-leg request → **Place on hold**; fill expiry H → **Place on hold**. | On Hold with event, venue, period, deadline; calendar marks On hold. C1 gets applicable hold/expiry-soon notification (less than 24 hours remain). |
| 2 | C1: event Venue before H → **Confirm request**. | Booking returns to Pending for V, not approved. Event remains Planning; readiness still incomplete. |
| 3 | V: approve this request through **Approve → Approve request**. | Approved booking, hold no longer active; event still requires remaining readiness/safety steps. |
| 4 | V: expiry-leg Pending request → Place on hold with its recorded H. C1 view it, but do not confirm. | Same On Hold/deadline/notification visibility; calendar occupied until expiry. |
| 5 | After actual time passes H, C1/V refresh Venue and availability pages; inspect Notifications and Change history. | Hold shown expired, no Confirm request action can restore the old hold; window becomes available; expired history retained. Reads may derive effective expiry before a later write updates stored status: require observable release, not an immediate raw-row change. |
| 6 | C1: on expiry event choose the same venue again from refreshed search, **Request venue**. V inspect Requests. | New Pending booking permitted when no other conflict; old expired request retained. No expired hold is an approved booking or completed readiness item. |
| 7 | C1/V sign out/back in, reopen both event Venue pages. | Confirmation leg approved; expiry leg has expired original plus one new Pending request; no phantom hold reappears. |

**Final outcome/evidence:** deadlines, actual observation time, On Hold/Pending/approved/expired states, relevant notification and release/re-request. No promise of email delivery, exact background-job latency or stored-state sweep timing is inferred.

**Cleanup:** C1 cancels both own events with reason `Manual journey 09 complete`, releasing approved/new pending bookings. Owner removes only the two event ledgers and children, not venue records.

Actual result: __________\
Status (Pass / Fail / Blocked / Not Executed): __________\
Defect reference: __________\
Evidence links / run ledger / cleanup result: __________

## E2E-00 — Signed-out access boundary smoke check

**Priority/purpose:** P1, quick preflight. Ensure an unauthenticated visitor cannot enter the protected workspace. This is supplemental to the connected journeys, not a complete auth/security test.

**Traceability:** SPM-13 AC: unauthenticated protected access denied. No account/data fixture needed. BASE must be running; use U, a fresh isolated context without an existing session.

| Step | Manual action | Expected observable result |
| --- | --- | --- |
| 1 | U: open `BASE/`. | Public page renders; public event information is allowed. No internal planning UI appears. |
| 2 | Open `BASE/events`, then `BASE/venue-requests`, then `BASE/equipment/inventory`. | Each protected route redirects to `/login` showing **Sign in**, Email and Password; protected content is absent. |
| 3 | Refresh and reopen `BASE/events`. | Still signed out; no protected data appears after refresh. |

**Final outcome/evidence:** public page and login redirects with visible URL. Authenticated role destinations are exercised by the account sessions in other journeys, not claimed proven here.

**Cleanup:** close U. No records created or removed.

Actual result: __________\
Status (Pass / Fail / Blocked / Not Executed): __________\
Defect reference: __________\
Evidence links / run ledger / cleanup result: __________

## Short execution checklist

- [ ] Confirm latest requirements/version and review D1–D7; record any approved resolution without silently changing this oracle.
- [ ] Environment owner confirms local frontend/backend/database alignment, applied migrations and reviewed cleanup mechanism. Do not use normal hosted-targeting instances.
- [ ] Fill account/resource/date manifest; confirm roles privately, separate auth contexts and exclusive fixture ownership. No passwords in evidence.
- [ ] Prepare a fresh event set per journey using the recipes; record setup failure as Blocked. Do not reuse a cancelled/rejected fixture or prior run's status.
- [ ] Run E2E-00 preflight, then P0 journeys in order; run P1 extensions when their prerequisites are ready. Capture actual results separately from predictions.
- [ ] Refresh relevant pages at handoffs; complete sign-out/sign-in persistence steps and other-role visibility checks before marking Pass.
- [ ] Record defect links and the first failing step; preserve evidence before cleanup. Distinguish data/setup failure from a product defect and a requirement decision.
- [ ] Release only this run's commitments, review ledger-scoped removal with the local owner, record any cleanup pending and close sessions.

## Coverage and meaningful gaps

| Business flow / roles | Journeys | Coverage limit |
| --- | --- | --- |
| Draft → Requested → Lead assignment → approval; O/L/C | 01 | Explicit clarification close covered; organiser response/edit rounds, draft deletion and initial event rejection not executed here |
| Venue and equipment → safety → Confirmed → attendee; O/L/C/V/T/S/A | 01 | Full resource handoff and one registration; no exhaustive validation assertions |
| Ownership and reassignment; O1/O2/L/C1/C2/V/T/A | 02 | Browser deep links and persisted access transfer; no fabricated API attack or proof of all server-side denials |
| Buffered availability/conflict and release; C/V | 03 | Pending and approved occupancy; not simultaneous submission or buffer-edit rechecks |
| Cancellation and resource release; O/L/C/V/T/A | 04 | Confirmed event with main/equipment/Registered attendee; no active-hold or pending-safety cancellation fixture |
| Disruption → rejected replacement → approved replacement; O/C/V | 05 | Whole-event main booking; excludes breakout replacement, block shortening/removal recovery before approval and pending-safety disruption exception |
| Approved change → readiness flags → safety changes/reject/resubmit; O/C/V/T/S | 06 | Attendance change; does not establish date/time conflict rechecks, equipment change re-reservation, registration change locking, rejected/withdrawn change requests |
| Full event → waiting list → withdrawal → promotion; O/L/C/A1/A2 | 07 | One waiter; no three-person queue reordering or simultaneous last-place race |
| Additional room → rejection → retry → selective cancellation; O/C/V | 08 | Ordinary rooms only; D5 blocks required-room behaviour/full story acceptance |
| Tentative hold → confirm or expire → new request; C/V | 09 | Observable expiry and notifications; not simultaneous hold contention or delivery timing guarantees |
| Signed-out workspace boundary; unauthenticated | 00 | Does not validate invalid-password messaging, sign-up or all role permissions |

Further deliberate gaps: completion after event end **plus turnaround** (SPM-46) needs a separately allocated elapsed-event fixture or a real-time scheduled run; no clock/status manipulation should be invented. Supporting document upload/removal (SPM-37), banners/images and storage cleanup need a dedicated file/storage fixture; none is created here. Equipment shortages/unavailability and partial top-up (SPM-30/31/32), retired equipment and change re-checks deserve a later resource-recovery journey. True concurrent assignment, venue booking, stock reservation and last-place registration need independent simultaneous clients and invariant checks; these sequential manual journeys do not prove race safety. Mobile usability, performance, export/reporting and exhaustive field boundaries are outside this manageable set.

### Existing browser tests: useful pointers, not completion evidence

- [auth.spec.ts](../../tests/e2e/auth.spec.ts) and [home.spec.ts](../../tests/e2e/home.spec.ts) cover form/public/redirect/health smoke checks, not the connected planning process.
- [pb02-shared.spec.ts](../../tests/e2e/pb02-shared.spec.ts) is credential-gated, uses free-text Equipment/Technical notes assumptions that differ from today's catalogue/period fields, and has a hard-coded 2026-10-25 date. Drafts may permit past dates, so the date alone is not proof of failure; it is unsuitable as a future submission fixture. Its cleanup attempts confirmed Draft deletion only.
- [pb03-shared.spec.ts](../../tests/e2e/pb03-shared.spec.ts) is credential-gated and asserts automatic assignment plus an optional-requirements acknowledgement control removed from the current form. Its comment that no coordinator-facing page exists is stale. Its `finally` only warns about a remaining Requested event; it does not remove it. Do not run it as a cleanup-safe shared test or adopt those expectations.
- [playwright.config.ts](../../playwright.config.ts) reuses local servers outside CI and does not itself guarantee an isolated database. Credential-gated skipping, test presence, historical green results and Jira Done never establish a successful manual run. No test was run or skip state observed in this task.

No business outcome above is reported as verified execution. The blank results and independently prepared local fixtures are the starting point for the tester's evidence.
