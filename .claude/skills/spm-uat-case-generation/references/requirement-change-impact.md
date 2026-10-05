# Requirement changes: UAT impact and retesting

Read this reference when a requirement changes, an existing UAT case may need revision, or the user asks what to rerun. Use the case format and coverage references for any drafted rows.

## Establish the change

1. Identify the Jira issue key and the old and new approved wording, revision, or explicit change decision. A current CSV or sheet alone does not prove when a change happened.
2. Compare the actor, business rule, input, boundary, permission, lifecycle state, action, and expected outcome. Name each changed acceptance criterion or scenario. If Jira has no numbered ACs, cite a short faithful excerpt instead of inventing an AC number.
3. If Jira, the refined backlog, and the UAT sheet disagree, distinguish a confirmed change from an unresolved source conflict. Ask which requirement is authoritative when the answer changes the expected result. For example, the team workbook's `PB-04 AC05` excludes reassignment from Release 1, while Jira `SPM-5` includes it; do not silently choose one.

## Trace affected cases and flows

- Match the changed criterion to existing case IDs using the Jira key, verified legacy story aliases, criterion wording, test scenario, steps, data, and expected result. Do not assume equal PB and Jira numbers refer to the same story.
- Check connected cases only where the changed rule affects their setup, shared state, transition, or downstream outcome. The workbook's `Release 1 Traceability` tab can point to related backlog areas, but a broad mapping alone does not make every case require retesting.
- Include cases already marked `Pass`, `Fail`, `Blocked`, or `Not Executed`. Record their current status accurately; an old `Pass` is evidence only for the version tested.
- Mark uncertain mappings or missing prior wording rather than presenting them as confirmed impact.

## Decide the action for each case

| Action | Use when |
|---|---|
| Retest as written | The case still expresses the current rule, but the changed flow may affect its outcome. |
| Revise and retest | The case still tests the same principal behaviour, but its setup, steps, data, or expected result must change. Keep its case ID. |
| Add a case | The requirement introduces a distinct behaviour, branch, validation outcome, actor, or boundary that merits its own result. Use the next available Jira-key ID. |
| Review for retirement | The old behaviour is no longer required and no longer belongs in the active suite. Preserve its history; do not use `Blocked` or another execution status to mean retired. |
| No retest | Inspection shows the case does not depend on the change. State why when the connection might otherwise appear plausible. |

Prefer revising an existing case to duplicating its principal behaviour. A changed successful path and a newly required failure path normally need separate cases because they have different outcomes.

## Deliver an impact report

Before drafting or editing rows, show a compact table with: changed criterion or rule; existing case ID and current status; action; reason; and any proposed new case ID. Then provide the revised or new case rows and a list of unresolved source decisions. Do not imply a retest has passed before execution.

For example, if an **approved hypothetical change** makes a proposed date mandatory for saving a Draft, the team's existing `PB-02-TC-001` (currently `Pass` for saving with only an event name) would be revised and retested under the same ID. A distinct missing-date failure case would get the next available `SPM-2-TC-...` ID after checking the live sheet. Other Draft cases would be inspected for affected setup rather than automatically rerun. This example does not establish that the requirement actually changed.

## Preserve history when writing to a sheet

- Edit a spreadsheet only when the user asks. Read the live case rows, statuses, evidence, metadata, and destination structure before writing.
- Before changing an executed case in place, preserve its exact prior specification, requirement source/version if known, status, actual result, evidence link, and existing metadata in a durable, reviewable history record. The team workbook has an `Updates/Changes Log`, but confirm whether it is suitable for the complete prior record. If no suitable history exists, present the proposed row and resolve where to preserve the old record before overwriting it. Do not treat the sheet's `Last Updated` timestamp alone as case-version history.
- After the old version is preserved, keep the case ID for a revision of the same principal behaviour. Set the active revised case to `Not Executed`; leave its new `Actual Result / Comments` and `Screenshot / Evidence Link` blank until it is rerun. Do not fabricate tester or update metadata.
- Add separate new rows only for distinct coverage. Follow the existing 15-column team sheet or the user's specified destination. Never silently renumber legacy cases or change unrelated execution results.
- Read back the changed case, its history record, and any new rows. Confirm every changed criterion maps to a current case or an explicit unresolved gap, and every required retest appears in the impact report.
