# Read-Model Invalid `viewScopedTags` Fixture

Status: invalid-read-model-test-fixture / local-focused-test-only / not-generated-evidence

This fixture is a durable negative read-model input used to prove that invalid `viewScopedTags` values block read-model
validation.

It is not generated Evidence, not source authority, not a source promotion record, not CI enforcement, and not user
acceptance. It must not be added to `examples/read-model-aggregate/read-model-slices.json`, `validate --all`, or the
GitHub Actions read-model Evidence workflow unless a later explicit task approves an invalid-fixture test mode.

Expected failure:

- `viewScopedTags` contains `semantic-authority`, which is not one of the allowed role tags:
  `target`, `context`, `candidate`, `guard`, `required`, `stale`, `blocked`, `output`
- validation should return a blocking `view-scoped-tags-allowed` check

The fixture is intentionally stored outside a `generated/` directory so it cannot be mistaken for generated read-model
Evidence.
