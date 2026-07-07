# Retrofit Confirmation Protocol v0

Status: protocol draft / no implementation change

Purpose:

This protocol defines how retrofit DevView moves from read-only observation to a
confirmed implementation slice without pretending that inferred legacy intent is
already known.

## Fixed Principle

Retrofit DevView must not produce implementation instructions from code inference
alone.

It may:

- observe code, docs, tests, release notes, and existing outputs
- infer candidate graph nodes and edges
- attach anchors and confidence
- ask focused user questions
- store user answers as confirmation evidence

It may not:

- treat inferred intent as source authority
- choose domain behavior when the user has not confirmed it
- start behavior changes when key scope questions are still open

## Step Flow

```text
1. Observe
   Read existing project files and collect anchored facts.

2. Infer
   Build candidate graph nodes/edges with confidence and anchors.

3. Ask
   Generate the smallest user question that can disambiguate the next step.

4. Confirm
   Store the user's answer as a confirmed decision with timestamp/context.

5. Plan
   Convert confirmed decisions into expected files, forbidden files,
   non-goals, tests, evidence, and hardware boundaries.

6. Execute
   Only after confirmed planning, make a bounded change.

7. Verify
   Run tests/checks and attach evidence.

8. Update
   Feed the result back into the graph as verified or reopened.
```

## Decision Points That Must Ask The User

The agent must stop and ask the user when any of these are unknown:

| Decision                        | Why it must be confirmed                                                         |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Product behavior intent         | Retrofit code structure does not prove desired business behavior.                |
| Module ownership                | Similar labels may exist across printer, laminator, flipper, and hopper modules. |
| Permission/persona              | User, dealer, and factory builds can expose different settings.                  |
| Hardware read/write scope       | UI-only changes and device-write changes have different risk.                    |
| Config save/load inclusion      | Persisted config behavior can affect exported/imported device state.             |
| Hardware validation requirement | Build/test success does not prove real device behavior.                          |
| Retirement/deprecation          | Removing or downgrading fallback/reference paths requires explicit approval.     |
| Enforcement/required check      | CI observation is not the same as required enforcement.                          |

## Standard Question Format

When a decision is required, ask in this structure:

```text
Decision needed:
<what must be decided>

Known from graph/code:
<facts with anchors>

Still unknown:
<the missing domain decision>

Why this blocks the next step:
<risk if guessed>

Please answer like:
<short template or examples>
```

## Confirmation Record Shape

A user answer should be stored as a graph confirmation record before planning:

```json
{
  "state": "user-confirmed",
  "decisionId": "confirm-example",
  "questionId": "question-example",
  "answer": "User-provided answer",
  "scopeImpact": ["expected-files", "tests", "hardware-boundary"],
  "confirmedBy": "user",
  "notes": "Any uncertainty or follow-up."
}
```

This is intentionally lightweight. It keeps retrofit work simple while
preserving the difference between observed code, inferred intent, and confirmed
product decisions.

## When Planning Is Allowed

Planning is allowed only when the slice has:

- a confirmed product/change intent
- expected files
- forbidden files or boundaries
- relevant tests or evidence
- hardware validation status
- non-goals

If any of those are missing, DevView should keep the slice in
`blocked-before-user-confirmation`.
