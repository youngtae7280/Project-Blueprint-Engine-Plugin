# Output Requirement Source Authority

Status: v0.2 preview / non-enforcing / source-authority design and artifact only

## Purpose

Contract Compiler Dry-Run v0.1 proved that PBE can compile a deterministic candidate, validate it, compare it with the
hand-written contract, classify every current semantic diff, and keep `equivalenceProven: false` when losses remain.

The largest remaining compiler loss is `output-requirement-loss`: the generated candidate replaces execution-result
reporting obligations with compiler self-reporting. This document defines the next source-authority surface so output
requirements can come from machine-readable graph, policy, Evidence, check, and diff bindings instead of compiler guess
work.

## Current Preview Surface

The v0.2 preview adds `outputRequirementSources[]` to the Compiler Input Model dry-run fixture and writes:

```text
examples/read-model-aggregate/generated/output-requirement-source-authority.preview.json
```

The preview records:

- source authority entries
- derived output requirement candidates
- mappings to the hand-written output requirements
- generated output requirement preservation status
- unresolved generated obligations
- compiler self-report obligations that do not replace execution-result outputs

The current Todo Search dry-run fixture has source authority for:

- `changed-files-report`
- `command-output-evidence-status`
- `validation-result-summary`
- `non-execution-boundary-statement`

The preview maps the three hand-written output requirements, but still reports
`generated-output-requirements-not-preserved` because the generated candidate does not yet produce the changed-file,
command-output Evidence, or validation-result output obligations.

## What This Proves

The preview proves:

- output requirement sources can be represented as machine-readable input facts;
- hand-written output requirements can be linked back to source authority entries;
- the existing `output-requirement-loss` can be explained as `source-authority-present-but-compiler-output-mapping-not-applied`;
- source authority can be observed without changing execution, acceptance, enforcement, or generated contract
  authority.

## What This Does Not Prove

The preview does not prove:

- generated/hand-written contract equivalence;
- execution readiness;
- output requirement preservation;
- arbitrary `changeType` support;
- user acceptance;
- source-authority expansion;
- tree-native retirement readiness.

## Non-Goals

v0.2 preview does not:

- execute AI;
- apply graph deltas;
- mutate target code;
- enable required checks;
- configure branch protection;
- create CI enforcement;
- automate user acceptance;
- retire tree-native artifacts;
- widen pack schemas beyond the current Todo Search `bug_fix` fixture;
- hide or downgrade `output-requirement-loss`.

## Next Step

The next compiler step should use the preview to drive generated output requirements from source authority entries.
Only after the generated candidate preserves changed-file reporting, command-output Evidence reporting, validation
summary reporting, and boundary reporting should equivalence be reconsidered.
