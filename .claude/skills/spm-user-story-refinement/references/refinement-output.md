# User-story refinement output and UAT handoff

Read this reference when presenting the final refinement package or handing an approved story to UAT design.

## Output shape

Use only the sections that add value, but preserve this order:

1. `PB ID`
2. `Title`
3. `Refinement Status`
4. `Format Decision`
5. `Refined User Story`
6. `Acceptance Criteria`
7. `Scope Boundaries and Dependencies`
8. `Questions, Assumptions, or Suggested Additions`
9. `UAT Handoff Status`

Do not add empty sections.

## Acceptance-criteria presentation

- Number criteria continuously as `AC01`, `AC02`, and so on.
- For checklist-only output, present one acceptance-criteria list.
- For scenario-only output, present the numbered Given-When-Then criteria directly.
- For mixed output, use `Checklist Criteria` and `Scenario-Based Criteria` subheadings.
- Do not force a minimum or maximum number of criteria.
- Keep each criterion mapped to one principal rule or outcome. Closely related outcomes from one action may remain together when separating them would make the specification less clear.

## Status meanings

| Status | Meaning |
|---|---|
| Needs Product-Owner Clarification | At least one unresolved question materially changes scope or expected behaviour. |
| Ready for User Confirmation | The proposed package is coherent, but it contains a material rewrite, assumption, addition, removal, split, or scope recommendation that the user has not approved. |
| Ready for UAT Design | The user explicitly confirmed the package, or the supplied package was already approved and required no material change. |

## Handoff contract for UAT

The approved handoff should contain:

- stable PB/story ID and title;
- final user-story statement;
- stable acceptance-criterion IDs and wording;
- confirmed scenarios, if used;
- explicit in-scope and out-of-scope boundaries when relevant;
- confirmed assumptions and dependencies;
- `Ready for UAT Design` status.

The UAT skill maps those IDs to test cases. It must not silently rewrite the approved package. If later UAT design exposes a material gap, return the gap for product-owner clarification instead of converting it into an unstated expected result.

## Full-workflow behaviour

When the user requests refinement and UAT together:

1. Refine the story and choose the AC format.
2. Present material changes and obtain user confirmation.
3. Mark the confirmed package `Ready for UAT Design`.
4. Run the UAT coverage checkpoint.
5. Generate test cases only after resolving any new material ambiguity.

Do not require this refinement skill when the user directly supplies a clear, approved story. The UAT skill should remain usable on its own.
