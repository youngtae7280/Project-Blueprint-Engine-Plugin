# Contract Source Authority Gap Preview

Status: v0.2 preview / non-enforcing / remaining-loss triage only

## Purpose

Output Requirement Source Authority now preserves generated `outputRequirements` for the current Todo Search dry-run
fixture. The remaining compiler gap is no longer output reporting; it is the source authority behind the other contract
fields that still differ from the hand-written comparison fixture.

This preview records those remaining differences as source-authority gaps before adding another resolver.

## Artifact

The compiler writes:

```text
examples/read-model-aggregate/generated/contract-source-authority-gap.preview.json
```

The artifact records:

- remaining semantic and policy loss counts;
- field-level gaps for `allowedScope` and `knownRisks`;
- `forbiddenScope` as preserved for the current fixture after policy source authority resolution;
- `stopConditions` as preserved for the current fixture after stop-condition source authority resolution;
- `requiredEvidence` as preserved for the current fixture after Evidence source authority resolution;
- `requiredContext` as preserved for the current fixture after context source authority resolution;
- missing and extra ids from the generated candidate;
- candidate source-authority type for each field;
- whether a resolver is required;
- the next recommended resolver.

## Current Recommendation

The current preview recommends:

```text
risk-source-authority
```

This is selected because `forbiddenScope` is now generated from `policySnapshot.forbiddenScopeRules[]` and
`stopConditions` are now generated from `stopConditionSources[]`, and required Evidence is generated from
`evidenceIndex.entries[]` plus `policySnapshot.evidenceCheckMappings[]`. Required context is now generated from
`graphSnapshot.artifacts[]`. Policy-loss, evidence-chain mismatch, and context semantic-loss are currently zero, while
semantic-loss still remains in risk coverage. Risk source authority is the narrowest next resolver candidate; allowed
scope remains conservative review debt and is not solved by this preview.

## Boundaries

This preview does not:

- execute AI;
- apply graph deltas;
- mutate code;
- make the generated candidate authoritative;
- prove equivalence;
- enable required checks;
- configure branch protection;
- automate user acceptance;
- retire tree-native artifacts;
- widen `changeType` support;
- implement every remaining resolver at once.

`compilerPromotionReadiness` remains `compiler-promotion-not-ready`, and `equivalenceProven` remains `false`.
