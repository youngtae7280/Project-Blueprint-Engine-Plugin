# PBE Baseline Reconstruction

Existing project analysis is not a separate mode. It is a baseline-reconstruction Graph Operation.

Baseline reconstruction does not start from Product truth. Existing projects may have no reliable requirements docs,
history, tests, or acceptance records. Documents can help, but documents are not automatically truth.

Observed Behavior is not Product Requirement.

## Key Distinctions

Observed Behavior:

- found in code, runtime, tests, logs, or UI behavior
- may be intentional, accidental, obsolete, or harmful
- should be recorded as observed

Product Candidate:

- inferred possible product intent from observed behavior
- not confirmed
- must be promoted by human confirmation before it becomes Confirmed Product

Confirmed Product:

- user-confirmed Product truth with acceptance criteria or an explicit non-executable reason

## Baseline Flow

```text
Existing Code / Runtime
-> Entry Node
-> Observed Flow Node
-> Work Responsibility Node
-> Observed Behavior
-> Product Candidate
-> Characterization Test Suggestion
-> Unknown / Risk
-> Human Confirmation
-> PBE Graph Baseline
```

## Characterization Tests

A Characterization Test captures current observed behavior so future changes can be intentional. It does not prove the
behavior is desired Product truth. It proves only that the behavior exists and can be detected.

## Unknown And Risk

Baseline reconstruction must not hide uncertainty.

Unknown nodes record missing facts:

- unclear owner
- missing runtime path
- unverified branch
- behavior with no tests
- external dependency not available locally

Risk nodes record harm boundaries:

- destructive data changes
- security or permission changes
- hardware dependency
- undocumented migration
- behavior that appears accidental but user-visible

## Principle

```text
Observed Behavior != Product Requirement
```

Existing project analysis is not report generation. It ingests code and runtime flow into the PBE Graph as observed,
inferred, candidate, unknown, and risk nodes. Human confirmation decides which candidates become Product truth.
