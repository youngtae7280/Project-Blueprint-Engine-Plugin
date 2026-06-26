# Read-Model Missing Core View Fixture

Status: invalid-read-model-test-fixture / local-focused-test-only / not-generated-evidence

This fixture is a durable negative read-model input used to prove that missing required Core View coverage blocks
read-model validation.

It is not generated Evidence, not source authority, not a source promotion record, not CI enforcement, and not user
acceptance. It must not be added to `examples/read-model-aggregate/read-model-slices.json`, `validate --all`, or the
GitHub Actions read-model Evidence workflow unless a later explicit task approves an invalid-fixture test mode.

Expected failure:

- the required Core View `Evidence / Acceptance View` is intentionally omitted from `coreViewCoverage`
- every `viewScopedTags` value remains one of the allowed role tags so the failure isolates Core View coverage
- validation should return a blocking `core-view-coverage-present` check

The fixture is intentionally stored outside a `generated/` directory so it cannot be mistaken for generated read-model
Evidence.
