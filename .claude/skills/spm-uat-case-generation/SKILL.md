---
name: spm-uat-case-generation
description: Generate and review school-style business UAT test cases from approved requirement packages or sufficiently clear user stories, acceptance criteria, scenarios, project requirements, or UI designs. Use for SPM UAT coverage, traceability, or preparing cases for the user's UAT Google Sheet. Use the separate SPM user-story refinement skill when the requirement itself needs substantial rewriting. Do not mix in engineering tests unless explicitly requested.
---

# SPM UAT Case Generation

Turn product requirements into business-executable UAT cases that follow the user's IS212 SPM approach and personal Google Sheet format.

## Core boundaries

- Treat the supplied user story, acceptance criteria, scenarios, and confirmed business rules as the specification. Project documents and designs may clarify them but must not silently expand their scope.
- Confirm the active backlog or user-story ID before using requirements from nearby stories. Keep Draft, submission, approval, assignment, and other lifecycle stages separate unless the source explicitly connects them.
- Never invent field rules, permissions, error messages, status transitions, audit behaviour, or navigation paths. Mark unresolved facts as assumptions or questions.
- Keep UAT business-facing. Generate unit, component, API, integration, database, security, performance, or automated-test specifications only when the user explicitly asks, and keep them separate.
- Separate test specification from execution evidence. Do not fabricate results, comments, testers, timestamps, or screenshots.
- Do not modify a backlog, repository, document, or spreadsheet unless the user explicitly asks for that change.
- Do not substantially rewrite user stories or acceptance criteria during UAT design. Use `spm-user-story-refinement` when the requirement itself needs authoring, INVEST review, format selection, splitting, or material scope correction.

## Workflow

### 1. Lock the scope

Identify the active story or PB ID, actor, business goal, acceptance criteria, scenarios, and lifecycle state being tested.

The minimum usable input is a user story plus acceptance criteria or scenarios. Useful optional context includes business rules, prototypes, screenshots, field limits, roles, status definitions, and related-story boundaries.

If the user points to a project, inspect only the relevant requirement and design sources. Do not treat observed implementation behaviour as a new requirement.

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

- story/PB and actor;
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

- Use the exact 12-column schema and stable IDs such as `PB-03-TC-001`.
- Set `Status` to `Not Executed` for newly generated cases.
- Leave `Actual Result / Comments` and `Screenshot / Evidence Link` blank.
- Default to a copy-ready Markdown table in chat.
- If the user explicitly asks to populate a spreadsheet, use the supplied sheet or the personal template identified in the format reference and preserve its structure.

### 6. Verify before delivery

Confirm that:

- every acceptance criterion and supplied scenario maps to at least one case;
- every case maps back to a stated requirement or clearly labelled assumption;
- preconditions, steps, test data, and expected results agree;
- important negative, boundary, permission, workflow, and regression risks were considered;
- cases are atomic without becoming repetitive;
- no unstated product guarantee is presented as fact;
- execution evidence remains unfilled.

End with a compact coverage summary and list any unresolved assumptions or requirement suggestions separately from the test cases.
