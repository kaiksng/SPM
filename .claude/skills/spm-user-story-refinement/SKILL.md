---
name: spm-user-story-refinement
description: Draft, review, and refine school-style SPM product backlog items, user stories, acceptance criteria, and Given-When-Then scenarios. Use when the user wants clearer story scope, INVEST review, testable acceptance criteria, the right checklist-versus-scenario format, or a requirement package ready for UAT design. Do not generate detailed UAT test cases unless the user separately requests the UAT handoff.
---

# SPM User Story Refinement

Turn a feature idea or existing requirement into a concise, testable SPM user-story package that the user can confirm before development or UAT design.

## Core boundaries

- Treat the user's instructions and confirmed customer or product-owner decisions as authoritative.
- Use project documents, designs, and existing implementation only as supporting evidence. Do not silently convert observed behaviour into a requirement.
- Confirm the active PB or story ID before importing rules from related stories. Keep lifecycle stages and actor goals separate unless the sources explicitly connect them.
- Never invent numerical limits, mandatory fields, permissions, statuses, error messages, timing promises, or technical constraints.
- Suggest scope changes separately and explain why. Do not silently move, split, add, or remove requirements.
- The user story is a conversation starter, not a complete contract. Acceptance criteria define the confirmation boundary.
- Do not generate detailed UAT rows in this skill. Hand an approved requirement package to the UAT case-generation skill.

## Workflow

### 1. Establish the requirement context

Identify, when available:

- PB or story ID and title;
- actor and user need;
- desired outcome;
- current lifecycle stage;
- supplied acceptance criteria and scenarios;
- confirmed business rules, dependencies, designs, and related stories.

If the user points to a project, inspect only the relevant requirement and design sources. State when an important rule comes from a project source rather than the user's supplied text.

### 2. Review the story

Read [references/school-story-method.md](references/school-story-method.md) before refining the requirement.

Check:

- **Who:** a meaningful role rather than a named person;
- **What:** one coherent user action or capability;
- **Why:** a valuable user or business outcome;
- **INVEST:** Independent, Negotiable, Valuable, Estimable, Small, and Testable;
- scope leakage into another actor, lifecycle stage, or backlog item;
- broad verbs such as `manage` or multiple goals joined by `and` that may require splitting.

Do not split a story merely because the sentence contains `and`. Recommend a split only when parts have different actors, goals, lifecycle stages, dependencies, or independent value.

### 3. Choose the acceptance-criteria format

Choose the simplest format that communicates the behaviour clearly. Do not default to using both.

- **Checklist only:** use for simple conditions or rules that must always hold, such as required fields, optional fields, fixed validations, labels, limits, and general business rules.
- **Given-When-Then only:** use when outcomes depend mainly on a starting state, actor, trigger, journey, lifecycle transition, success/failure branch, confirmation, cancellation, or permission condition.
- **Mixed:** use only when the story genuinely contains both invariant rules and conditional behaviour. Put each requirement in the single most suitable format and never repeat it merely for completeness.
- **User-directed:** follow the user's requested format unless it prevents the requirement from being clear and testable; explain the concern when it does.

Checklist acceptance criteria can later produce multiple positive, negative, boundary, or equivalence-partition test cases. Do not turn acceptance criteria into detailed test cases prematurely.

### 4. Handle gaps and conflicts

Classify findings:

- **Blocking question:** different answers would materially change scope or expected behaviour. Ask one focused question and pause.
- **Assumption used:** a low-risk, reversible interpretation used to continue. State it explicitly.
- **Suggested addition:** a potentially valuable rule that requires user or product-owner confirmation.
- **Scope recommendation:** a behaviour that may belong in another story. Identify the likely boundary without moving it silently.

When several gaps share one governing rule, ask about that rule instead of asking many small questions.

### 5. Produce the refinement package

Read [references/refinement-output.md](references/refinement-output.md) before presenting the result.

Provide:

- PB ID and title;
- refinement status;
- a short format decision and rationale;
- refined Who-What-Why user story;
- acceptance criteria with stable IDs such as `AC01`;
- scope boundaries and dependencies when relevant;
- blocking questions, assumptions, or suggested additions;
- UAT handoff status.

Preserve the user's meaning and product terminology. Prefer concise, observable outcomes over implementation details.

### 6. Confirm before UAT handoff

Use these statuses:

- `Needs Product-Owner Clarification` when a blocking question remains.
- `Ready for User Confirmation` after producing a material rewrite or scope recommendation.
- `Ready for UAT Design` only after the user explicitly confirms the requirement package, or when they supplied an already-approved package and no material change was made.

If the user requests the full refinement-to-UAT workflow, stop after the refined package when confirmation is required. After confirmation, pass the stable story and AC IDs to `spm-uat-case-generation`. Do not treat the skill's own rewrite as approved.

## Quality check

Before delivery, confirm that:

- the story contains a clear who, what, and why;
- the acceptance criteria are clear, unambiguous, observable, measurable where necessary, and testable;
- the chosen AC format follows the behaviour rather than a fixed template;
- no requirement appears in both checklist and scenario form without a justified difference;
- all thresholds and product rules are sourced or labelled for confirmation;
- scope recommendations are separate from confirmed requirements;
- stable IDs and handoff status are present.
