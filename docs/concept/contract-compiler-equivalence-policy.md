# Contract Compiler Equivalence Policy

Status: v0.2 review policy / non-enforcing / no execution authority

## Purpose

Contract Compiler Dry-Run v0.2 can now reconstruct the current Todo Search `bug_fix` fixture's major execution contract
fields from source authority inputs. This policy separates that result from stronger claims:

- source-authority preservation;
- review-only diff classification;
- equivalence candidate status;
- equivalence proof;
- compiler promotion readiness.

The policy exists because a generated contract can preserve the major source-authority fields and still differ from the
hand-written comparison fixture in review-only fields such as provenance, additive validation checks, or boundary
wording.

## Current Status

Current dry-run status:

```text
sourceAuthorityPreservationStatus: source-authority-preserved
semanticDiffPolicyStatus: semantic-diff-clean
reviewOnlyDiffStatus: review-only-diff-detected
blockingSemanticLossCount: 0
reviewOnlyDiffCount: 3
unknownDiffCount: 0
equivalenceCandidate: true
equivalenceProven: false
compilerPromotionReadiness: compiler-promotion-review-required
```

This means the current compiler candidate is a reviewable equivalence candidate for the narrow fixture, not an
equivalence proof and not an execution source.

## Policy Rules

- `source-authority-preserved` means the major field resolvers have no remaining source-authority gap for the current
  diff set.
- `semantic-diff-clean` means there is no `semantic-loss`, `policy-loss`, `evidence-chain-mismatch`,
  `output-requirement-loss`, or unclassified semantic diff.
- `review-only-diff-detected` means differences remain, but they are classified as metadata, wording, or safe additive
  review items.
- `equivalenceCandidate: true` can be reported when source authority is preserved, semantic diff policy is clean,
  unknown diff count is zero, and promotion readiness is not `compiler-promotion-not-ready`.
- `equivalenceProven` remains `false` until a later approved equivalence policy and human review explicitly promote it.
- `compilerPromotionReadiness: compiler-promotion-review-required` remains review metadata only.

If semantic loss, policy loss, output requirement loss, Evidence-chain mismatch, source-authority gaps, high-severity
diffs, or unknown diffs reappear, the candidate is not an equivalence candidate.

## Boundaries

This policy does not:

- execute AI;
- run or apply a contract;
- apply graph deltas;
- accept work;
- enable required checks;
- configure branch protection;
- retire tree-native artifacts;
- widen supported `changeType` values;
- make the generated contract authoritative.

The hand-written contract remains a comparison fixture. It is not a compiler source.
