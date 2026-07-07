# Maintainability Graph Read-Model Parity Check

Status: Node/Edge/Tag parity check

This parity check evaluates whether the Todo Search manual read-model artifact now satisfies the Graph-first
Node/Edge/Tag policy for limited pilot review.

It is not Graph-source promotion, not source authority change, not limited pilot approval, and not a generated graph
builder implementation.

## Source References

- `maintainability-graph-read-model.json`
- `maintainability-graph-read-model.md`
- `view-instance-manifest.json`
- `view-instance-manifest.md`
- `product-tree.json`
- `project-tree.json`
- `work-tree.json`
- `test-tree.json`
- `evidence-tree.json`
- `acceptance-tree.json`
- `change-tree.json`
- `impact-tree.json`
- `cycle-contract.md`
- `node-execution-contracts/wt-search-001.md`
- `approval-brief.md`
- `evidence-exceptions.md`
- `examples/internal-legacy/adoption/compatibility-mismatch-slice/compatibility-control-node.md`
- `docs/concept/graph-node-edge-tag-policy.md`
- `docs/concept/view-tree-pack.md`

## Parity Questions

| Question                                                                                | Result | Evidence / reason                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can tree-native selected-slice artifacts be interpreted under the Node/Edge/Tag policy? | yes    | JSON nodes use `nodeKind`, edges use `edgeType`, view membership uses `includedInViewIds` / `viewRoles`, and view-local roles use `viewScopedTags`.      |
| Are durable semantic relationships represented as Edges rather than Tags?               | yes    | `implements`, `verifies`, `evidences`, `invalidates`, `preserves`, and `approves` appear only as `edgeType`.                                             |
| Are view-local roles represented as Tags only?                                          | yes    | Tags are limited to `target`, `context`, `candidate`, `guard`, `required`, `stale`, `blocked`, and `output`.                                             |
| Are Core View ids separated from view-scoped tags?                                      | yes    | Core View ids are stored in `includedInViewIds`, `viewRoles`, `coreViewCoverage.viewId`, and the View Instance Manifest, not as `viewScopedTags` values. |
| Does the explicit invalid tag check pass?                                               | yes    | `invalidTags: []` and `missingCore: []`; no Core View id appears as a flattened `viewScopedTags` value.                                                  |
| Are node-kind-specific tags avoided?                                                    | yes    | The artifact does not use tags such as `code.target`, `check.required`, `implements`, `verifies`, or `evidences`.                                        |
| Are confidence and freshness/status separated?                                          | yes    | Nodes and edges use separate `confidence` and `freshnessStatus` fields; `stale` is never a confidence value.                                             |
| Are all 7 Core Views represented?                                                       | yes    | `coreViewCoverage` and `view-instance-manifest.json` cover Intent, Behavior, Structure, Scope/Execution, Impact, Verification, and Evidence/Acceptance.  |
| Does Scope / Execution View expose Cycle/Node Contract boundaries?                      | yes    | `CYCLE-TODO-SEARCH`, `NEC-WT-SEARCH-001`, required Evidence, and non-scope guard behavior are included.                                                  |
| Are missing/partial/deferred warnings retained?                                         | yes    | Partial UI Evidence, bounded fixture warning, generated-builder absence, and ACEP cleanup deferral remain visible.                                       |
| Does the artifact avoid source authority change?                                        | yes    | Metadata states tree-native artifacts remain source and no promotion/generator/schema/runtime is implemented.                                            |
| Has limited pilot approval been recorded after refresh?                                 | yes    | The user approved the bounded Todo Search limited pilot option; `limited-pilot-transition-record.md` records it without source authority change.         |
| Is full promotion ready?                                                                | no     | Full promotion still has generated-builder/repeatability, broader parity, and cleanup judgment questions.                                                |

## Node / Edge / Tag Parity Judgment

```text
demonstrated for limited pilot review with retained warnings
```

Reason:

- durable targets are represented as `nodeKind`
- durable semantic relationships are represented as `edgeType`
- view membership is represented as `includedInViewIds` and `viewRoles`
- view-scoped temporary roles are represented as allowed `viewScopedTags`
- 7 Core Views are explicitly covered
- warnings and source-authority boundaries remain visible

## Limited Pilot Package Judgment

Prior blocker before this refresh:

```text
Graph-first baseline refresh was required before limited pilot user decision
```

Updated state after this refresh:

```text
Graph-first baseline refresh completed for limited pilot review
Bounded limited pilot option approved for Todo Search transition record
No source authority change
```

The package led to an explicit user-approved bounded transition record. It is not full Graph-source promotion.

## Full Promotion / Repeatability Judgment

```text
not ready without generated builder / broader parity decision
```

Remaining limitation:

- This artifact is manual.
- No generated graph builder, CLI-backed read-model output, schema, runtime model, or validator exists.
- Public-doc cleanup remains deferred.
- UI screenshot/manual visual Evidence remains partial.
- Full product/runtime parity is not demonstrated by the bounded fixture.

## Retained Warnings

| Item                                 | Status      | Treatment                                                                  |
| ------------------------------------ | ----------- | -------------------------------------------------------------------------- |
| Full Todo app runtime implementation | partial     | Acceptable warning for limited pilot; full promotion may require more.     |
| UI screenshot/manual visual evidence | partial     | Acceptable warning unless full UI/product parity is in scope.              |
| Generated graph builder / CLI output | missing     | Later implementation requirement for repeatability or full promotion.      |
| ACEP task-card public-doc cleanup    | deferred    | Deferred cleanup; user must accept or require cleanup before promotion.    |
| Limited pilot transition execution   | not started | Approval is recorded, but actual scoped execution remains a separate task. |

## Non-Promotion Statement

This parity check does not promote Maintainability Graph, does not change source authority, does not mark tree-native
artifacts as projections, and does not close any future promotion decision.
