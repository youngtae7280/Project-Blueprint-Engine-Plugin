# DevView Preflight Session Chain

Status: devview-preflight-session-chain-report-generated
Terminal stage: instruction-pack-preview-generated-no-codex-execution
Candidate: examples/valid/todo-app-devview-run/generated/request-ir-candidate.add-todo-runtime-evidence-only.preview.json
Output directory: .tmp/devview-preflight/add-todo-runtime-evidence-only

## Stages

| Stage                             | Artifact                                                                               | Status                                | Generated |
| --------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------- | --------- |
| Schema-only Request IR validation | .tmp/devview-preflight/add-todo-runtime-evidence-only/request-ir-validation.json       | schema-valid-graph-validation-not-run | yes       |
| Graph-aware Request IR validation | .tmp/devview-preflight/add-todo-runtime-evidence-only/request-ir-graph-validation.json | graph-aware-valid                     | yes       |
| Graph traversal plan              | .tmp/devview-preflight/add-todo-runtime-evidence-only/graph-traversal-plan.json        | ready                                 | yes       |
| Selected graph slice              | .tmp/devview-preflight/add-todo-runtime-evidence-only/selected-graph-slice.json        | generated                             | yes       |
| Contract Compiler Input           | .tmp/devview-preflight/add-todo-runtime-evidence-only/contract-compiler-input.json     | contract-compiler-input-generated     | yes       |
| Instruction Pack                  | .tmp/devview-preflight/add-todo-runtime-evidence-only/instruction-pack.json            | instruction-pack-generated            | yes       |

## Boundaries

- Instruction Pack generation is a preview artifact only; Codex execution was not triggered.
- Graph-source mutation, graph delta apply, approval automation, Evidence acceptance, runtime Evidence satisfaction, equivalence proof, scope enforcement, strict/guided blocking, and CI enforcement remain disabled.
- Human review remains required before any future execution or authority-bearing action.

## Findings

- warning: REQUEST_IR_CANDIDATE_UNRESOLVED_AMBIGUITY - One or more candidate ambiguities remain unresolved; human review remains required.
- warning: CONTRACT_INPUT_FORBIDDEN_SCOPE_PATH_UNRESOLVED - Production source changes are forbidden by request intent, but no production source file path was derived from the selected graph slice.
- warning: CONTRACT_INPUT_FORBIDDEN_SCOPE_PATH_UNRESOLVED - Production source changes are forbidden by request intent, but no production source file path was derived from the selected graph slice.
