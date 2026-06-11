# Validator Design

PBE validation is split into small responsibility-focused validators while preserving the historical command:

```text
node scripts/validate-pbe-files.js
npm run validate:pbe
npm run validate
```

## Layers

- `scripts/validate-pbe-files.js`: orchestration entry point and report formatting.
- `scripts/validators/*`: responsibility-focused validators.
- `scripts/validator-utils/*`: shared file, JSON, markdown, and report helpers.
- `scripts/validators/legacy-core.js`: compatibility validator preserved from the previous monolithic implementation.

## Expected Report Shape

The CLI may render pass/fail markers with symbols. The ASCII-safe shape is:

```text
[PBE Validate]

PASS Plugin structure
PASS Skills
PASS Templates
PASS Schemas
PASS PBE layout
PASS Autoflow state
PASS RPD transition guard
PASS WorkGraph
PASS ACEP manifest
PASS Revision
PASS Examples
PASS Compatibility core

Result: PASS
```

Failures should include the validator name, file, error code, message, and a suggested fix.

## RPD Transition Guard

`scripts/validators/rpd-transition.js` prevents downstream execution, review, or deliverable-producing work while RPD is incomplete.

It fails when:

- any requirement Root or leaf remains `pending_interview`, `interviewing`, `ready_to_confirm`, `ready_to_decompose`, or `blocked`
- Product Tree root remains `draft`, `proposed`, `needs_human_decision`, or another non-terminal planning state
- an open `gate` or `blocking` decision remains in `decision-queue.json`
- `pbe-state.deliveryStatus` is `implemented`, `verified`, `submitted_for_review`, `revision_verified`, or `accepted` before RPD completion

Use `draft_created_from_assumptions` or `waiting_root_confirmation` when an assumption-based draft exists but Root confirmation is still pending.
