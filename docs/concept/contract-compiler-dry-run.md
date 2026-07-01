# Contract Compiler Dry-Run v0

Status: implemented / deterministic candidate compiler / local non-enforcing report

## Purpose

The Contract Fixture Validator answers: "Is this contract-shaped artifact safe?"

The Compiler Input Model answers: "Are the inputs grounded in graph, policy, Evidence, and bounded vocabulary?"

Contract Compiler Dry-Run v0 answers the next narrow question:

"Can PBE deterministically compile one contract candidate from those validated inputs, then send that candidate back
through the Contract Fixture Validator?"

## Current Scope

The current dry-run compiler supports only the committed Todo Search whitespace-normalization `bug_fix` fixture:

- input: `examples/read-model-aggregate/generated/compiler-input-model-dry-run.json`
- output candidate: `examples/read-model-aggregate/generated/execution-contract-dry-run.generated.json`
- validator: `validateExecutionContract`

The local command is:

```powershell
node dist/cli/index.js graph read-model compile-contract --dry-run --json
```

## Deterministic Mapping

The compiler candidate is derived without AI prose:

- `humanRequest.text` becomes `goal`;
- `packSchema.changeType` becomes `changeType`;
- `targetScopeCandidates[]` becomes `allowedScope[]`;
- `graphSnapshot.artifacts[]` becomes `requiredContext[]`;
- `evidenceIndex.entries[]` becomes `requiredEvidence[]`;
- non-enforcement and no-retirement policies become `forbiddenScope[]` and stop conditions;
- fixed local checks cover runtime fixture, validate-all, health report, and E2E smoke.

After compilation, the candidate must pass the existing Contract Fixture Validator. A candidate that does not validate is
blocked and is not treated as executable.

## Boundaries

This is not an executor.

This dry-run does not:

- execute AI;
- perform the requested code change;
- apply graph deltas;
- approve or accept work;
- enable required checks;
- configure branch protection;
- retire tree-native artifacts;
- support arbitrary change types.

It only proves the first closed loop:

```text
Compiler Input Model
→ deterministic contract candidate
→ Contract Fixture Validator
```

## Next Layer

The next layer should either widen supported pack schemas carefully or introduce a real source-authority resolver for
choosing checks, Evidence, risks, and stop conditions from graph/policy inputs. It should not jump directly to AI executor
automation.
