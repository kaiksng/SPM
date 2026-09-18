# SPM UAT test-case format

Read this reference when preparing the final test-case rows or writing them into the user's spreadsheet.

## Preferred Google Sheet

Personal template: https://docs.google.com/spreadsheets/d/1rE38uFExcmOlgq6pnx_RiOdd6awTPSw5LNizs2Hei_4/edit

Use this sheet only when the user explicitly asks to populate it. Otherwise return the cases in chat.

## Column schema

Use these columns in this exact order:

| Column | Purpose | Writing rule |
|---|---|---|
| Test Case ID | Stable identifier | Use `<story-id>-TC-<three digits>`, for example `PB-03-TC-001`. If no story ID exists, use `US-TC-001` and state the assumption. |
| User Story / PB | Traceability to the story | Use the confirmed story ID and a short name where useful. |
| Acceptance Criterion / Scenario | Direct source mapping | Reference the supplied number or a short faithful label, such as `Scenario 2 / AC: mandatory validation`. Do not invent a new criterion. |
| Test Scenario | Behaviour being validated | Start with an action-oriented, specific title. Keep one principal behaviour per row. |
| Preconditions | Required starting state | State actor, account/permission, lifecycle state, prepared records, configuration, and reused data only when needed. |
| Test Steps | Executable sequence | Use numbered steps. Include the real entry point when known; use `[TBC]` instead of inventing navigation. |
| Test Data | Values needed to execute | Give concrete values or descriptive placeholders with required characteristics. |
| Expected Result | Observable acceptance outcome | Match the steps and state visible messages, saved data, status, audit record, access result, or downstream availability supported by the requirement. |
| Case Type | Coverage classification | Choose one: `Happy Path`, `Negative`, `Boundary`, `Permission`, or `Regression`. |
| Status | Execution state | For new cases use `Not Executed`. Allowed values are `Not Executed`, `Pass`, `Fail`, and `Blocked`. |
| Actual Result / Comments | Execution notes | Leave blank during case design. Testers complete it during execution. |
| Screenshot / Evidence Link | Execution evidence | Leave blank during case design. Testers add a Drive or other evidence link during execution. |

## Row-writing conventions

- Keep test steps and expected results readable inside one spreadsheet row.
- Use line breaks or numbered statements rather than long prose paragraphs.
- Do not place several materially different test-data conditions in one row.
- A single case may verify several closely related visible results from one action, but split it when different setup, roles, branches, or outcomes are required.
- Do not include a Priority column.
- Do not add execution metadata columns unless the user changes the template.

## Chat delivery

Return the same 12 columns in a Markdown table. If the table is too wide to read comfortably, divide it into consecutive sections without changing the schema or IDs. Keep `Actual Result / Comments` and `Screenshot / Evidence Link` present but empty.

After the table, include:

- the number of cases by Case Type;
- which acceptance criteria and scenarios are covered;
- unresolved assumptions or suggested requirement improvements.
