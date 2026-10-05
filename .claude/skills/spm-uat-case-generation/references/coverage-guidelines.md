# SPM UAT coverage guidelines

Read this reference when reviewing the requirements and deciding which UAT cases to create.

## Traceability model

Maintain this chain:

`User need -> Jira issue key or user story -> Acceptance criterion or scenario -> Test case -> Execution evidence`

One acceptance criterion may require several cases. One case may cover closely related parts of more than one criterion only when the setup, action, and observable result are genuinely the same.

## Coverage dimensions

Consider each dimension and include it only when supported by the requirement or a clearly labelled assumption:

| Dimension | Questions to ask |
|---|---|
| Workflow | What starting state, user action, state transition, and final business checkpoint must be proven? |
| Happy path | Does valid input produce the intended business outcome? |
| Required inputs | Is each mandatory field blocked when missing? Are all affected fields identified when several are invalid? |
| Optional inputs | Can optional fields be omitted without blocking the main outcome? Are supplied optional values preserved? |
| Equivalence partitions | Which representative valid and invalid classes avoid redundant cases? |
| Boundaries | What happens immediately below, at, and above stated limits for dates, times, counts, lengths, or quantities? |
| Cross-field rules | Do related fields remain consistent, such as end time later than start time? |
| Permissions | Can the correct actor perform the action, and are unauthorised actors blocked when this is in scope? |
| Lifecycle | Are allowed actions and statuses correct before and after submission, approval, rejection, or cancellation? |
| Auditability | When required, are the actor, change, date, and time recorded and available through the stated review mechanism? |
| Downstream availability | Does the record become visible or actionable to the next role only at the stated lifecycle point? |
| Regression | Does a changed rule risk breaking an existing in-scope workflow that still needs to work? |

## Case-selection rules

- Start with the main successful business journey.
- Add one case for each distinct validation rule and observable failure outcome.
- For a stated numeric or temporal limit, prefer boundary cases at the limit and just outside it. Do not invent a minimum or maximum.
- Treat missing, malformed, out-of-range, and inconsistent cross-field values as different partitions only when their outcomes or rules differ.
- Create separate permission cases for materially different actors or lifecycle states.
- Add a regression case only when a changed behaviour could affect an existing in-scope path; name that path explicitly.
- Avoid UI styling checks unless the acceptance criterion makes the presentation itself part of acceptance.
- Avoid technical implementation assertions such as database rows, API codes, internal events, or atomic rollback unless the user explicitly requests technical tests.

## Handling requirement gaps

Do not convert recommendations into requirements.

Use one of these labels:

- `Blocking question:` the answer changes whether a case is valid or changes its expected result.
- `Assumption used:` a low-risk working interpretation used to continue.
- `Suggested addition:` a possible improvement for the product owner to accept or reject.
- `[TBC]`: an exact label, path, limit, or business rule that must be confirmed before execution.

Examples of material ambiguities:

- `The organiser may edit permitted information` without listing the permitted fields.
- `Invalid preferred date` without defining whether past dates or same-day dates are allowed.
- `Changes are recorded for review` without saying what is recorded or who can view it.
- `Available for assignment` without identifying the role or page where availability is observed.

Ask one focused question when a gap blocks correct case design. When several gaps are related, ask for the governing rule instead of asking many field-by-field questions.

## Completeness review

Before delivery, build an internal mapping of every acceptance criterion and scenario to its case IDs. Check for:

- an uncovered requirement;
- existing sheet cases that already cover the same requirement, including cases filed under a verified legacy story ID;
- a case with no source anchor;
- contradictory expected results;
- duplicated cases with the same setup, action, data class, and outcome;
- an untested negative or boundary explicitly implied by the requirement;
- invented navigation, messages, limits, permissions, or lifecycle behaviour;
- execution fields accidentally filled with predicted results.

Report the mapping compactly after the case table so the user can review coverage without reading every row again.
