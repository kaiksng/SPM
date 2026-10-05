---
name: spm-uat-case-generation
description: Generate and review school-style business UAT cases from Jira backlog exports or clear requirements. When requirements change, trace affected existing cases, revise or add coverage, and plan retesting while preserving prior execution history. Use for SPM UAT coverage and the user's UAT Google Sheet; use the separate story-refinement skill for substantial requirement rewriting. Keep engineering tests separate unless requested.
---

# SPM UAT Case Generation

Turn product requirements into business-executable UAT cases that follow the user's IS212 SPM approach and UAT sheet format.

## Core boundaries

- Treat the supplied user story, acceptance criteria, scenarios, and confirmed business rules as the specification. Project documents and designs may clarify them but must not silently expand their scope.
- Confirm the active Jira issue key or other user-story ID before using requirements from nearby stories. Keep Draft, submission, approval, assignment, and other lifecycle stages separate unless the source explicitly connects them.
- Never invent field rules, permissions, error messages, status transitions, audit behaviour, or navigation paths. Mark unresolved facts as assumptions or questions.
- Keep UAT business-facing. Generate unit, component, API, integration, database, security, performance, or automated-test specifications only when the user explicitly asks, and keep them separate.
- Separate test specification from execution evidence. Do not fabricate results, comments, testers, timestamps, or screenshots.
- A previous `Pass` or `Fail` belongs to the case wording and requirement version that was executed. Do not present it as evidence for revised wording.
- Do not modify a backlog, repository, document, or spreadsheet unless the user explicitly asks for that change.
- Do not substantially rewrite user stories or acceptance criteria during UAT design. Use `spm-user-story-refinement` when the requirement itself needs authoring, INVEST review, format selection, splitting, or material scope correction.

## Workflow

Use the steps below for new UAT design. When the user brings a changed requirement or asks which existing cases need updating or rerunning, first read [references/requirement-change-impact.md](references/requirement-change-impact.md) and run its comparison and impact review. Then apply the same requirement-quality, case-design, format, and verification rules to the affected cases.

### 1. Lock the scope

Identify the active Jira issue key or other confirmed story ID, actor, business goal, acceptance criteria, scenarios, and lifecycle state being tested.

The minimum usable input is a user story plus acceptance criteria or scenarios. Useful optional context includes business rules, prototypes, screenshots, field limits, roles, status definitions, and related-story boundaries.

If the user points to a project, inspect only the relevant requirement and design sources. Do not treat observed implementation behaviour as a new requirement.

For a Jira CSV export, use `Issue key` as the story ID and `Summary` as its title. Read the user story, acceptance criteria, and scenarios from `Description`, including Jira-formatted lists and headings; do not assume they have separate CSV columns. Select the requested story or stories rather than generating cases for every exported row. `Issue id` is an internal numeric identifier, and Jira `Status: Done` does not establish UAT-design readiness. Flag a missing or materially incomplete description instead of filling it from neighbouring stories.

Apply a readiness gate without making the refinement skill mandatory:

- If the package is marked `Ready for UAT Design`, preserve its stable story and AC IDs and proceed.
- If the user directly supplies a clear, testable requirement, proceed even without a handoff status.
- If a minor gap can be handled with a stated low-risk assumption, present it in the coverage checkpoint.
- If a material ambiguity changes scope or expected results, ask one focused question or recommend `spm-user-story-refinement`. Do not silently repair and approve the requirement inside the UAT workflow.

### 2. Review requirement quality

Check whether:

- the story clearly states who, what, and why;
- each acceptance criterion is observable and testable;
- scenarios and acceptance criteria agree;
- mandatory and optional inputs are distinguishable;
- valid, invalid, and boundary values are defined;
- role and permission rules are stated where relevant;
- status changes, timestamps, audit records, notifications, and downstream availability are defined where relevant;
- wording such as `permitted information`, `invalid`, `available`, or `recorded for review` needs clarification.

Classify findings:

- **Blocking ambiguity:** ask one focused question before generating cases when different answers would materially change scope or expected results.
- **Non-blocking assumption:** state the assumption clearly and proceed when it is low-risk and reversible.
- **Suggested requirement improvement:** recommend wording separately; do not rewrite the source requirement unless asked.

### 3. Present a coverage checkpoint

For a new or materially ambiguous story, show a concise checkpoint before the full case set:

- Jira issue key or story ID and actor;
- included and excluded lifecycle stages;
- proposed coverage areas;
- acceptance-criterion/scenario mapping;
- assumptions, gaps, and suggested additions.

Pause for confirmation when the checkpoint introduces a material interpretation. Do not ask again if the user has already confirmed the scope or explicitly requested immediate generation.

If a refinement package has not yet been confirmed, stop after identifying the material issue. Continue to UAT only after the user approves the corrected requirement.

### 4. Design the cases

Read [references/coverage-guidelines.md](references/coverage-guidelines.md) before designing coverage.

- Create one row per distinct behaviour, decision rule, permission outcome, status transition, or boundary whose test data or expected result materially differs.
- Keep steps executable by a business user and number them in order.
- Use concrete test data. When real values are unavailable, use descriptive placeholders that state the necessary characteristics.
- Make every expected result visible or otherwise verifiable through the specified business interface.
- Use exact labels and messages only when they appear in a supplied source. Otherwise describe the required outcome without inventing copy.
- Cover happy path, negative, boundary, permission, and regression behaviour only where relevant.
- Use equivalence partitions and representative boundary values rather than enumerating redundant inputs.
- When the requirement says every affected field is identified, include both field-specific validation coverage and a combined-invalid-input case if both behaviours matter.

### 5. Write in the agreed format

Read [references/test-case-format.md](references/test-case-format.md) before producing the final rows.

- Use the Jira issue key exactly when available: `SPM-5-TC-001`, with a three-digit case suffix. Do not add zeroes to the issue number or substitute a legacy PB number.
- Before extending a story's cases in an existing sheet, reconcile its Jira key with existing cases by verified title and requirement scope.
- For a changed requirement, keep an existing case ID when its principal behaviour remains the same and its steps or expected result need revision. Add a new case with the next available Jira-key ID for a distinct new behaviour or outcome. Preserve the tested version before revising an executed row, as described in the change-impact reference.
- Set `Status` to `Not Executed` for newly generated cases.
- Leave `Actual Result / Comments` and `Screenshot / Evidence Link` blank.
- Default to a copy-ready 12-column Markdown table in chat.
- If the user explicitly asks to populate a spreadsheet, use the specified sheet and preserve its actual columns and existing execution records.

### 6. Verify before delivery

Confirm that:

- every acceptance criterion and supplied scenario maps to a new or verified existing case, or is reported as a coverage gap;
- every case maps back to a stated requirement or clearly labelled assumption;
- preconditions, steps, test data, and expected results agree;
- important negative, boundary, permission, workflow, and regression risks were considered;
- cases are atomic without becoming repetitive;
- no unstated product guarantee is presented as fact;
- existing cases for the same story were identified before proposing additions, with no duplicate behaviour or case ID;
- for a changed requirement, affected existing cases, connected-flow risks, and prior execution history were reviewed before recommending a retest;
- execution evidence remains unfilled.

End with a compact coverage summary and list any unresolved assumptions or requirement suggestions separately from the test cases.
