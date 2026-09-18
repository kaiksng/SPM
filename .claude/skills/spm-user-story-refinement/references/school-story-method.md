# IS212 SPM user-story method

Read this reference when reviewing or rewriting a story and selecting its acceptance-criteria format.

## User-story card

Use a short Who-What-Why statement:

> As a `<role>`, I want to `<perform an action>`, so that I can `<achieve a goal or outcome>`.

The exact syntax may vary, but the story should identify:

- **Who:** the class of user receiving value;
- **What:** the action or capability needed;
- **Why:** the valuable outcome, without prescribing unnecessary implementation.

The story card is deliberately brief. Conversation supplies context; acceptance criteria provide confirmation of the story's boundaries and completion.

## INVEST review

| Quality | Review question |
|---|---|
| Independent | Can the story be selected, estimated, implemented, and delivered without requiring another story to create its value? |
| Negotiable | Does it state the needed outcome while leaving reasonable implementation choices open? |
| Valuable | Does the outcome create meaningful value for the named role? |
| Estimable | Does the team understand enough of the domain, risk, and likely work to estimate it? |
| Small | Can it fit within a sprint while retaining coherent user value and remaining reviewable? |
| Testable | Can the acceptance criteria objectively show whether it is complete? |

INVEST is a refinement check, not proof that the product idea is correct. Surface weak areas without forcing artificial wording or unnecessary story splits.

## Acceptance-criteria quality

Acceptance criteria define conditions that must hold when the story is complete. They should be:

- clear and unambiguous;
- observable and testable;
- measurable when a threshold matters;
- bounded to the current story;
- specific about business behaviour without dictating unnecessary technical implementation.

Do not add a numerical threshold or technical rule merely to make a criterion look precise. Precision must come from a confirmed customer, product, domain, or quality rule.

## Format selection

| Behaviour | Preferred format |
|---|---|
| Required or optional information | Checklist |
| Fixed validation, limit, label, or business rule | Checklist |
| One simple outcome that must always hold | Checklist |
| Behaviour changes according to a starting state | Given-When-Then |
| Actor or permission changes the outcome | Given-When-Then |
| Success, failure, confirmation, or cancellation branch | Given-When-Then |
| Lifecycle or cross-step journey | Given-When-Then |
| Both invariant rules and conditional behaviour are material | Mixed, without repeating a requirement |

Use one format by default. Mixed is a deliberate result, not a completeness requirement.

## Scenario writing

- **Given** states the relevant starting condition, actor, data, or lifecycle state.
- **When** states one event or user action.
- **Then** states an observable business outcome.

Avoid vague triggers such as `when access is checked` when a clearer user action is known. Avoid combining several mutually exclusive branches into one scenario.

## Common problems

- Repeating a checklist criterion as an equivalent scenario.
- Turning every possible test-data variation into an acceptance criterion.
- Combining several independent goals or lifecycle stages in one story.
- Writing acceptance criteria as technical implementation tasks.
- Using subjective words such as `fast`, `easy`, `secure`, or `user-friendly` without an agreed observable meaning.
- Treating an AI rewrite as customer or product-owner confirmation.
