# Actual Representative Runtime Feasibility Demo Result

Status: manual Evidence pack / review result

## 1. Title / Date / Commit

| Field          | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Date           | 2026-06-24                                                            |
| Repo path      | `C:\Users\ytkim\Desktop\kyt_work\Project Blueprint Engine Plugin`     |
| Basis commit   | `8948db79f3acb331c13bed7ecfb78e2a71d4231c`                            |
| Short commit   | `8948db7 Define representative runtime feasibility demo`              |
| Selected slice | `Todo Search Adoption + Product Meaning Feedback`                     |
| Result type    | Manual Evidence pack and review result, not generated artifact design |

This result is not Graph-source promotion. It does not change source authority, promote Maintainability Graph to current
source, retire tree-native artifacts, implement runtime behavior, define schemas, implement validators, or create
migration/rollback mechanics.

Tree-native artifacts remain the current operational source of truth until a later promotion readiness review and
explicit user approval.

## 2. Selected Slice Summary

Selected representative slice:

```text
Todo Search Adoption + Product Meaning Feedback
```

Observed selected scope:

- title-only Todo search
- selected Product node: `PT-SEARCH-001`
- selected Work node: `WT-SEARCH-001`
- selected Tests: `TT-SEARCH-001`, `TT-SEARCH-002`, `TT-SEARCH-003`
- selected Evidence: `EV-SEARCH-TEST`, `EV-SEARCH-REVIEW`
- accepted title-only slice: `AT-ROOT`

Observed deferred / non-scope examples:

- tag filter
- date filter
- fuzzy search
- server-side search
- saved search
- note/description search until Product Patch feedback

Observed product meaning feedback:

```text
Search should include todo note content.
```

Observed stale/reopen pressure:

- `product-patch-tree.json` proposes expanding the search target from title-only to title + note.
- The patch is `proposed`, `requiresUserConfirmation: true`, and `userConfirmed: false`.
- The example docs state that Product Patch apply updates Product meaning only after confirmation and that downstream
  Work/Test/Evidence/Acceptance must be checked again.

## 3. Demo Source Discovery

Source discovery used observable repository files and command output only.

| Observation         | Evidence                                                                                                                                                            | Status  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Current commit      | `git log -1 --oneline` returned `8948db7 Define representative runtime feasibility demo`; `git rev-parse HEAD` returned `8948db79f3acb331c13bed7ecfb78e2a71d4231c`. | present |
| Working tree        | `git status --short --branch` returned `## main...origin/main` before edits.                                                                                        | present |
| Root `.pbe` folder  | `Test-Path .pbe` returned no root `.pbe` directory in this repository checkout.                                                                                     | present |
| Slice artifact list | `examples/adoption/todo-search-slice` contains Product, Work, Test, Evidence, Acceptance, Product Patch, README, and RPD summary snapshots.                         | present |

Because the repo root has no `.pbe` directory, this demo result cannot claim a live project `.pbe` run. It records a
manual feasibility review over public docs and illustrative adoption snapshots.

## 4. Source References Table

| Source                                                             | Observed content / relevant claim                                                                                                           | Demo claim supported                                      | Evidence status |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------- |
| `docs/tree-model.md`                                               | Defines tree-native Product, Project, Work, Test, Cycle, Change, Impact, Evidence, and Acceptance model.                                    | Tree-native artifacts remain current operational model.   | present         |
| `docs/source-of-truth-matrix.md`                                   | Separates artifact ownership and states that artifacts should not decide outside their responsibility.                                      | Source authority separation and scope ownership.          | present         |
| `docs/execution-contracts.md`                                      | Defines Cycle Contract and Node Execution Contract as implementation boundary.                                                              | Contract boundary concept.                                | present         |
| `docs/evidence-and-coverage.md`                                    | Requires evidence or not-runnable explanation before verification is treated as complete.                                                   | Check/Evidence and evidence exception concept.            | present         |
| `docs/result-review.md`                                            | Defines submitted-for-review output and says Codex must not mark `accepted`.                                                                | Approval and review separation.                           | present         |
| `docs/user-acceptance.md`                                          | Separates Codex-owned statuses from user-owned `accepted`.                                                                                  | Acceptance authority.                                     | present         |
| `docs/change-impact-revision.md`                                   | Describes Change/Impact/Product Patch/Revision skeleton and evidence/acceptance invalidation.                                               | Stale/reopen and impact handling concept.                 | present         |
| `docs/revision-flow.md`                                            | Describes bounded revision with affected Product, Work, Test, Evidence, Acceptance, allowed files, forbidden files, and refreshed evidence. | Change lifecycle and scope boundary.                      | present         |
| `docs/product-patch-proposals.md`                                  | Product meaning changes must start from Change node and Product Patch; downstream Work/Test/Evidence/Acceptance are not auto-rewritten.     | Product meaning feedback path and stale downstream proof. | present         |
| `docs/dogfooding-existing-project.md`                              | Walks through Todo title search adoption, acceptance, then note-content feedback through Change/Impact/Product Patch/Revision.              | Selected slice narrative and stale/reopen pressure.       | present         |
| `docs/golden-scenarios.md`                                         | Shows selected/deferred/foundation scope and Review/Accept separation for USB/Ethernet.                                                     | Scope-boundary calibration, not the selected Todo slice.  | partial         |
| `docs/traceability.md`                                             | Requires linked requirement, task, verification, and Evidence IDs when artifacts are present.                                               | Traceability rule for selected slice review.              | present         |
| `docs/concept/runtime-feasibility-demonstration.md`                | Defines minimum claims and feasibility status labels.                                                                                       | Result status basis.                                      | present         |
| `docs/concept/representative-runtime-feasibility-demo.md`          | Selects Todo Search Adoption + Product Meaning Feedback as primary representative slice.                                                    | Slice selection basis.                                    | present         |
| `docs/concept/source-transition-path.md`                           | Keeps tree-native source authority until explicit promotion and user approval.                                                              | Non-promotion boundary.                                   | present         |
| `docs/concept/rollback-compatibility-strategy.md`                  | Defines rollback/compatibility labels as concept labels only.                                                                               | Rollback readiness note.                                  | present         |
| `docs/concept/legacy-compatibility-map.md`                         | Maps ACEP, task-card, `.pbe/blueprint/*`, and graph terms through compatibility policy.                                                     | Compatibility mismatch interpretation.                    | present         |
| `examples/adoption/todo-search-slice/README.md`                    | Names title-only scope, deferred search variants, flow commands, and post-acceptance note-content feedback path.                            | Selected scope, non-scope, change pressure.               | present         |
| `examples/adoption/todo-search-slice/product-tree.json`            | Contains confirmed `PT-SEARCH-001` with acceptance criteria `AC-SEARCH-001..003` and title-only assumption.                                 | Product intent and acceptance criteria.                   | present         |
| `examples/adoption/todo-search-slice/work-tree.json`               | Contains implemented `WT-SEARCH-001`, expected files, forbidden files, done criteria, and validation hint.                                  | Work scope and file boundary.                             | present         |
| `examples/adoption/todo-search-slice/test-tree.json`               | Contains passed tests linked to Product, Work, acceptance criteria, and Evidence nodes.                                                     | Test coverage.                                            | present         |
| `examples/adoption/todo-search-slice/evidence-tree.json`           | Contains current test-output and review-note Evidence linked to Product, Work, Test, and criteria.                                          | Evidence links and Check/Evidence separation.             | present         |
| `examples/adoption/todo-search-slice/acceptance-tree.json`         | Contains user `accepted` title-only slice with Evidence/Test/Product/Work links.                                                            | Durable user acceptance state.                            | present         |
| `examples/adoption/todo-search-slice/product-patch-tree.json`      | Contains proposed, unconfirmed patch expanding search from title to title + note.                                                           | Decision required and stale/reopen pressure.              | present         |
| `examples/adoption/todo-search-slice/rpd-interview-summary.md`     | Records rough request, title-only slice, ambiguity, risks, and non-scope candidates.                                                        | Minimal clarification and risk context.                   | present         |
| `examples/adoption/todo-search-slice/project-tree.json`            | No selected-slice Project Tree snapshot exists in this folder.                                                                              | Product -> Project trace.                                 | missing         |
| `examples/adoption/todo-search-slice/cycle-contract.md`            | No selected-slice Cycle Contract snapshot exists in this folder.                                                                            | Cycle Contract boundary.                                  | missing         |
| `examples/adoption/todo-search-slice/node-execution-contracts/*`   | No selected-slice Node Execution Contract snapshot exists in this folder.                                                                   | Node-level execution boundary.                            | missing         |
| `examples/adoption/todo-search-slice/change-tree.json`             | No selected-slice Change Tree snapshot exists in this folder.                                                                               | Change Control / Change artifact.                         | missing         |
| `examples/adoption/todo-search-slice/impact-tree.json`             | No selected-slice Impact Tree snapshot exists in this folder.                                                                               | Impact classification.                                    | missing         |
| `examples/adoption/todo-search-slice/compatibility-control-node.*` | No selected-slice compatibility mismatch/control record exists in this folder.                                                              | Compatibility mismatch path.                              | missing         |

## 5. Scenario Coverage Matrix

| Scenario                     | Required observation                                                                                                                        | Actual evidence found                                                                                                                                                                                      | Feasibility status     | Gap / next action                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Happy path                   | Selected Product branch traces through Project, Work, Test, Evidence, Approval Brief, and Acceptance.                                       | Product, Work, Test, Evidence, and Acceptance snapshots exist. Project and contract snapshots are absent. Approval Brief is drafted in this result only.                                                   | partially demonstrated | Add or collect selected-slice Project Tree, Cycle Contract, Node Execution Contract, and a reviewable Approval Brief artifact.                                         |
| Stale evidence / reopen path | Post-acceptance feedback causes affected nodes to become stale, invalidated, reopened, or refreshed.                                        | Product Patch proposal and public docs show that title-to-note feedback changes Product meaning and requires downstream recheck. No Change/Impact artifact classifies affected nodes.                      | partially demonstrated | Add or collect Change Tree and Impact Tree evidence for `CH-001` / `PP-001`, including affected Evidence and Acceptance status.                                        |
| Decision required path       | User judgment is required for scope, Product Patch confirmation, risk acceptance, or evidence exception.                                    | `product-patch-tree.json` has `requiresUserConfirmation: true` and `userConfirmed: false`; RPD summary records title-only confirmation need.                                                               | partially demonstrated | Add a Decision Control Node or explicit user decision record if this becomes a real run.                                                                               |
| Evidence exception path      | Missing, stale, partial, or exception Evidence is visible and not treated as proof.                                                         | This result records missing Project/Contract/Change/Impact/Compatibility evidence as gaps. Existing Evidence Tree has current title-only proof but no stale/exception record after Product Patch proposal. | partially demonstrated | Add Evidence Control record or exception record for stale title-only proof after note-search feedback.                                                                 |
| Compatibility mismatch path  | Legacy/canonical mismatch is interpreted through Legacy Compatibility Map and becomes Control Node candidate only when it affects judgment. | Concept docs define the policy. No selected-slice legacy/canonical mismatch artifact was found.                                                                                                            | partially demonstrated | Use a real `.pbe/blueprint/*`, ACEP/task-card, or compatibility wording conflict in a later evidence strengthening pass, or mark the mismatch as explicitly simulated. |
| Scope boundary path          | Out-of-contract discovery or forbidden scope does not silently expand selected work.                                                        | README lists deferred/non-scope search variants; Work Tree forbids `src/tag-filter.ts` and `src/server-search.ts`. No Node Execution Contract exists.                                                      | partially demonstrated | Add Node Execution Contract excerpt showing allowed/forbidden files, deferred search targets, and stop conditions.                                                     |

## 6. Minimum Feasibility Claim Result

| Minimum claim                                                                                                | Evidence found                                                                                                                                                   | Feasibility status     | Notes                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| Tree-native artifacts remain current operational source while Maintainability Graph is read/alignment model. | Concept docs and source-transition policy state this directly; no source authority mutation occurred.                                                            | demonstrated           | The result uses manual graph interpretation only.                                |
| Product intent -> Project/Work/Test/Evidence/Acceptance trace.                                               | Product, Work, Test, Evidence, and Acceptance snapshots are linked. Project snapshot is absent.                                                                  | partially demonstrated | Product -> Project link remains a gap for the selected slice.                    |
| Cycle Contract / Node Execution Contract boundary.                                                           | Public docs define contracts; Work Tree contains expected and forbidden files. No selected-slice contract snapshots exist.                                       | partially demonstrated | Contract boundary is conceptually present but not fully evidenced for the slice. |
| Check/Evidence separation and Evidence status/freshness/exception.                                           | Test Tree and Evidence Tree distinguish tests and proof; this result records missing/partial gaps. No stale Evidence record exists after Product Patch proposal. | partially demonstrated | Freshness and exception records need stronger selected-slice artifacts.          |
| Approval Brief user judgment surface.                                                                        | Approval Brief policy exists and this result includes a draft summary. No generated or durable Approval Brief artifact exists.                                   | partially demonstrated | Draft is review aid only.                                                        |
| Control Node blocker/decision/stale/reopen/compatibility visibility.                                         | Control Node policy exists; Product Patch and gaps create candidates. No concrete Control Node artifact exists.                                                  | partially demonstrated | Candidates are named below.                                                      |
| Legacy Compatibility Map mismatch interpretation.                                                            | Legacy Compatibility Map exists and maps ACEP/task-card/blueprint terms. No actual selected-slice mismatch artifact exists.                                      | partially demonstrated | Compatibility scenario remains a gap.                                            |
| Change Lifecycle affected node stale/invalidated/reopened/closed explanation.                                | Public docs and Product Patch proposal show the intended lifecycle. No selected-slice Change/Impact artifact marks affected nodes.                               | partially demonstrated | Actual impact classification is missing.                                         |

## 7. Maintainability Graph Read / Alignment Interpretation

This is a manual read/alignment interpretation. It does not create a graph artifact and does not change source authority.

### Node Categories Inferred From Existing Docs

| Graph category | Inferred records                                                                                                             | Evidence status |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Product        | `PT-ROOT`, `PT-SEARCH-001`, acceptance criteria `AC-SEARCH-001..003`                                                         | present         |
| Project        | No selected-slice Project Tree node found                                                                                    | missing         |
| Work           | `WT-ROOT`, `WT-SEARCH-001`                                                                                                   | present         |
| Test / Check   | `TT-SEARCH-001`, `TT-SEARCH-002`, `TT-SEARCH-003`                                                                            | present         |
| Evidence       | `EV-SEARCH-TEST`, `EV-SEARCH-REVIEW`                                                                                         | present         |
| Acceptance     | `AT-ROOT` accepted by user                                                                                                   | present         |
| Change         | `CH-001` referenced by Product Patch proposal, but no Change Tree node found                                                 | partial         |
| Impact         | No selected-slice Impact node found                                                                                          | missing         |
| Decision       | title-only scope confirmation and unconfirmed Product Patch confirmation are implied, but no Decision Control artifact found | partial         |
| Compatibility  | Compatibility policies exist; no selected-slice mismatch record found                                                        | partial         |
| Scope boundary | deferred search variants, forbidden files, expected files                                                                    | present         |

### Observable Edges / Links

| Link                                                         | Observable source                                                                         | Status  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------- |
| `PT-ROOT -> PT-SEARCH-001`                                   | `product-tree.json` parent/children                                                       | present |
| `PT-SEARCH-001 -> WT-SEARCH-001`                             | `work-tree.json.derivedFromProductNodeIds` and `product-tree.json.derivedTo`              | present |
| `WT-SEARCH-001 -> AC-SEARCH-001..003`                        | `work-tree.json.satisfiesAcceptanceCriteriaIds`                                           | present |
| `PT-SEARCH-001 / WT-SEARCH-001 -> TT-SEARCH-001..003`        | `test-tree.json.coversProductNodeIds`, `coversWorkNodeIds`, `coversAcceptanceCriteriaIds` | present |
| `TT-SEARCH-001..003 -> EV-SEARCH-TEST / EV-SEARCH-REVIEW`    | `test-tree.json.evidenceNodeIds` and `evidence-tree.json.provesTestNodeIds`               | present |
| `EV-SEARCH-* -> AC-SEARCH-*`                                 | `evidence-tree.json.provesAcceptanceCriteriaIds`                                          | present |
| `Acceptance -> Product/Work/Test/Evidence`                   | `acceptance-tree.json` node links                                                         | present |
| `PP-001 -> PT-SEARCH-001`                                    | `product-patch-tree.json.targetProductNodeId` and `affectedProductNodeIds`                | present |
| `CH-001 -> Impact -> affected Work/Test/Evidence/Acceptance` | No Change/Impact artifact found                                                           | missing |
| `Product -> Project`                                         | No Project Tree artifact found                                                            | missing |
| `Cycle/Node Contract -> selected Work/Test/Evidence`         | No contract artifact found                                                                | missing |

### Why This Does Not Change Source Authority

- The interpretation is manual and read-only.
- No source file was rewritten to a graph model.
- No tree-native artifact was marked superseded.
- No projection, graph file, validator, CLI command, or runtime source model was created.
- Missing links are recorded as gaps rather than inferred into `demonstrated` status.

## 8. Check / Evidence Review

| Required Check                                                         | Evidence found                                                                | Evidence status   | Review note                                                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| Behavior check: title query filters visible todos.                     | `TT-SEARCH-001` and `EV-SEARCH-TEST`.                                         | present           | Supports `AC-SEARCH-001` for title-only behavior.                                               |
| Behavior check: empty query restores full list.                        | `TT-SEARCH-002` and `EV-SEARCH-TEST`.                                         | present           | Supports `AC-SEARCH-002`.                                                                       |
| Visual / manual check: no-result empty state.                          | `TT-SEARCH-003` and `EV-SEARCH-REVIEW`.                                       | present           | Human review note exists, but no screenshot artifact.                                           |
| Scope boundary check: tag/date/fuzzy/server/saved search not included. | README deferred list and Work Tree forbidden files.                           | partial           | No Node Execution Contract confirms boundary.                                                   |
| Evidence freshness check after note-content feedback.                  | Product Patch proposal shows meaning shift.                                   | stale / partial   | Existing title-only Evidence may become stale if patch is applied; no Impact Tree marks it yet. |
| Acceptance check for title-only slice.                                 | Acceptance Tree accepted node links Product/Work/Test/Evidence.               | present           | This is prior acceptance for title-only behavior only.                                          |
| Product Patch decision check.                                          | `product-patch-tree.json` requires user confirmation and is not confirmed.    | present           | Demonstrates decision requirement but not resolution.                                           |
| Contract-boundary check.                                               | Public docs define contract concepts; Work Tree has expected/forbidden files. | partial           | Missing selected-slice Cycle/Node Contract artifacts.                                           |
| Compatibility mismatch check.                                          | Legacy Compatibility Map exists.                                              | missing / partial | No selected-slice mismatch record found.                                                        |

AI self-report is not Evidence in this result. Feasibility status is based only on observable source files, command
outputs, linked records, and explicit gap records in this document.

## 9. Approval Brief Draft Summary

This is a draft judgment surface for the demo result only. It is not product acceptance and not source promotion.

### Intent Understood

PBE is reviewing whether the `Todo Search Adoption + Product Meaning Feedback` slice can serve as an actual
evidence-bearing runtime feasibility demonstration before any Graph-source promotion review.

### Result Summary

The selected slice has observable Product, Work, Test, Evidence, Acceptance, Product Patch, and supporting public-doc
references. The selected slice does not have observable Project Tree, Cycle Contract, Node Execution Contract, Change
Tree, Impact Tree, or Compatibility Control artifact snapshots.

### Verification Summary

- Title-only Product -> Work -> Test -> Evidence -> Acceptance trace is present except for Product -> Project.
- Product Patch feedback demonstrates stale/reopen pressure but not full Impact classification.
- Contract boundary is conceptually supported by docs and Work Tree file lists, but contract artifacts are missing.
- Compatibility mismatch is policy-supported but not evidenced by a selected-slice mismatch record.
- Missing/partial/stale evidence is recorded rather than hidden.

### Remaining Judgment

The demo result can be accepted as a partial feasibility evidence pack. It should not be treated as a passed promotion
readiness demonstration. Promotion readiness remains blocked until missing selected-slice Project/Contract/Change/Impact
and compatibility evidence is strengthened or explicitly replaced by a supplemental slice.

### Approval Choice Candidates

- Approve this demo result as a partial evidence pack.
- Request evidence strengthening for missing selected-slice artifacts.
- Defer promotion readiness review until missing evidence is available.
- Select a supplemental or fallback slice if Todo Search cannot produce the missing evidence.

### Draft State Label

```text
Review with warning
```

Reason: the result is useful and reviewable as a demo evidence pack, but it contains material partial/missing evidence.
For Graph-source promotion readiness, the same gaps are blockers and must not be hidden.

## 10. Control Node Review

No Control Node artifact is created by this result. The following are candidates only:

| Candidate                            | Reason                                                                                                                                           | Suggested status             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Decision Control Node candidate      | `PP-001` requires user confirmation before changing Product meaning from title-only to title + note.                                             | Waiting for human            |
| Evidence Control Node candidate      | Selected-slice Project, Cycle Contract, Node Contract, Change/Impact, and compatibility evidence are missing or partial.                         | Active / Review with warning |
| Impact Control Node candidate        | Product Patch feedback may make existing Work/Test/Evidence/Acceptance stale or invalidated, but no Impact Tree classifies affected nodes.       | Active                       |
| Compatibility Control Node candidate | No selected-slice mismatch was found; if ACEP/task-card/blueprint wording affects authority judgment, it should become a candidate.              | Deferred / partial           |
| Acceptance Control Node candidate    | Title-only acceptance exists; if the Product Patch is confirmed, prior acceptance must be reopened, invalidated, or renewed through user review. | Active if patch proceeds     |

## 11. Rollback / Compatibility Readiness Note

Concept labels only:

| Label                      | Scoped meaning for this demo                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rollback-not-needed`      | No source authority was changed during this demo result. No rollback action is needed for this document.                                           |
| `compatibility-maintained` | Legacy/compatibility terms remain mapped through Legacy Compatibility Map; no compatibility artifact was retired.                                  |
| `rollback-blocked`         | Any future promotion/rollback readiness claim would be blocked by missing authority, projection/parity, Change/Impact, and compatibility evidence. |

No rollback, fallback, retirement, migration, or source-authority action was performed.

## 12. Final Feasibility Judgment

Overall demo status:

```text
partially demonstrated
```

Why:

- The selected slice has observable Product, Work, Test, Evidence, Acceptance, Product Patch, and public-doc support.
- The title-only happy path and post-acceptance product meaning feedback are reviewable.
- The manual Maintainability Graph read/alignment interpretation can be written without changing source authority.
- However, selected-slice Project Tree, Cycle Contract, Node Execution Contract, Change Tree, Impact Tree, and
  Compatibility Control evidence are missing.
- Existing title-only Evidence is not refreshed or invalidated by an actual Impact artifact after the note-search Product
  Patch proposal.
- Approval Brief and Control Node records are drafted/candidate-level only, not durable artifacts.

Promotion blocker:

```text
Graph-source promotion readiness review should not proceed as "ready" from this result alone.
```

Next evidence strengthening should either:

1. create or collect missing selected-slice Project/Contract/Change/Impact/Compatibility evidence without promoting
   Graph-source, or
2. select a supplemental slice that already has the missing evidence paths.

## 13. Explicit Non-Promotion Statement

This demo result is not Graph-source promotion.

This demo result does not change source authority.

This demo result does not make Maintainability Graph the current operational source.

This demo result does not supersede Product, Project, Work, Test, Evidence, or Acceptance Trees.

Until a separate promotion readiness review passes and the user explicitly approves promotion, tree-native artifacts
remain the operational source of truth.
