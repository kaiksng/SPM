# SPM UAT test-case format

Read this reference when preparing the final test-case rows or writing them into the user's spreadsheet.

## Google Sheets

Current team UAT sheet: https://docs.google.com/spreadsheets/d/1wNRGs3QvzDks7n83fTtdbHQccw9Gz3ITNZLQUzzMsf4/edit?gid=1099097973#gid=1099097973

Personal template: https://docs.google.com/spreadsheets/d/1rE38uFExcmOlgq6pnx_RiOdd6awTPSw5LNizs2Hei_4/edit

Use a sheet only when the user explicitly asks to populate it. Use the sheet they specify or the one clearly established by the conversation; clarify only if the target remains ambiguous. Read the live headers and existing cases before writing because the sheet may have changed.

The team sheet's `UAT Test Cases` tab currently has the 12 core columns below, followed by `Created By`, `Last Updated By`, and `Last Updated`. Preserve all 15 columns when writing there. Do not fabricate the three metadata values; follow the sheet's existing mechanism or obtain the information needed to populate them. Do not overwrite existing statuses, actual results, evidence, or metadata.

## Column schema

Use these columns in this exact order:

| Column | Purpose | Writing rule |
|---|---|---|
| Test Case ID | Stable identifier | Use `<Jira issue key>-TC-<three digits>`, for example `SPM-5-TC-001`. Copy the issue key exactly, without padding its number. For non-Jira requirements with no confirmed ID, use `US-TC-001` provisionally in chat and state the assumption; resolve the ID before adding cases to a sheet. |
| User Story / PB | Traceability to the story | Keep this existing header for sheet compatibility. Enter the confirmed Jira issue key and short title, such as `SPM-5: Automatically Assign an Event Coordinator`. |
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
- Do not introduce new execution metadata columns beyond those already present in the destination sheet.

## Extending existing UAT cases

- Find existing cases for the Jira story before drafting additions. The team sheet contains legacy `PB-...-TC-...` IDs, `SPM-... TC-...` IDs with a space and sometimes a padded issue number, and canonical `SPM-...-TC-...` IDs. Match a legacy group to a Jira issue by verified title and requirement scope, not by number alone. For example, the sheet's `PB-04` assignment cases correspond to Jira `SPM-5`, not `SPM-4`.
- Review existing scenarios and outcomes so a covered behaviour is not generated again. If an old case conflicts with the current Jira requirement, report the mismatch rather than treating it as covered. For a confirmed requirement change, read [requirement-change-impact.md](requirement-change-impact.md) before revising an executed case or recommending retests.
- Keep an existing case ID when revising the same principal behaviour, including a legacy `PB` ID. Preserve its earlier execution record before changing a tested row. Renaming or migrating old IDs is a separate user-requested task.
- For genuinely new, distinct cases, take the highest case suffix among all verified cases for that story, including legacy aliases, and continue with the next unused suffix under the exact Jira key. For example, after `PB-04-TC-005` for Jira `SPM-5`, the next new ID would be `SPM-5-TC-006` if a distinct uncovered case is needed. Check the proposed IDs against the entire destination sheet for collisions.
- If a legacy-to-Jira mapping or existing numbering is uncertain, label the proposed IDs provisional and resolve the uncertainty before writing to a sheet.

## Chat delivery

Return the same 12 columns in a Markdown table. If the table is too wide to read comfortably, divide it into consecutive sections without changing the schema or IDs. Keep `Actual Result / Comments` and `Screenshot / Evidence Link` present but empty.

After the table, include:

- the number of cases by Case Type;
- which acceptance criteria and scenarios are covered;
- unresolved assumptions or suggested requirement improvements.
