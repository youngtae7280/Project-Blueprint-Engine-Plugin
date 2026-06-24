# Check And Evidence Policy

Status: outline only

## 1. Document Purpose

Check And Evidence Policy will define how PBE distinguishes validation commands, manual checks, evidence quality, and
coverage closure.

## 2. Scope This Document Will Cover

This future document should cover:

- what counts as evidence for different work types
- how checks link to Test Tree nodes and acceptance criteria
- when not-runnable explanations are valid
- how stale or invalidated evidence is handled
- how visual/manual evidence differs from build or smoke checks

## 3. Currently Confirmed Decisions

- Evidence must prove Product, Work, Test, criteria, or review requirements as applicable.
- Build success alone is not product evidence unless the Test Tree says it verifies the requirement.
- Visual UI work requires screenshot or manual visual evidence unless waived, not required, deferred, or out of scope.
- Submitted-for-review and accepted closure require fresh required evidence.
- Approval Brief consumes Check and Evidence status in its Verification summary, but this document remains the detailed
  policy source in the next phase.

## 4. Still Undefined

- Detailed evidence quality thresholds.
- A formal policy for command output capture.
- Minimum manual evidence format.
- How concept-level checks differ from execution evidence.

## 5. Next Phase Content

The next phase may define:

- evidence type matrix
- quality thresholds
- stale evidence replacement rules
- examples for docs-only, code, UI, visual, hardware, and revision work

## 6. Related Gate

Gate 4-6 outline gate only. This file does not define validators, schemas, or detailed check execution behavior.
