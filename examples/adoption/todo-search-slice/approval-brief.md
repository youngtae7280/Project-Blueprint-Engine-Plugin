# Todo Search Demo-Support Approval Brief

Status: demo-support evidence snapshot

This Approval Brief is a review surface for the representative demo evidence pack after PP-001 confirmation and refreshed
runtime fixture Evidence. It is not user acceptance, not renewed Acceptance closure, and not Graph-source promotion.

## Source References

- `examples/adoption/todo-search-slice/product-tree.json`
- `examples/adoption/todo-search-slice/project-tree.json`
- `examples/adoption/todo-search-slice/work-tree.json`
- `examples/adoption/todo-search-slice/test-tree.json`
- `examples/adoption/todo-search-slice/evidence-tree.json`
- `examples/adoption/todo-search-slice/acceptance-tree.json`
- `examples/adoption/todo-search-slice/product-patch-tree.json`
- `examples/adoption/todo-search-slice/change-tree.json`
- `examples/adoption/todo-search-slice/impact-tree.json`
- `examples/adoption/todo-search-slice/evidence-exceptions.md`
- `examples/adoption/compatibility-mismatch-slice/approval-brief.md`
- `docs/concept/approval-brief.md`
- `docs/concept/check-evidence-policy.md`

## Intent Understood

PBE is reviewing whether the `Todo Search Adoption + Product Meaning Feedback` slice has enough observable
selected-slice support artifacts to show what happens after the user confirms Product Patch `PP-001`.

## Result Summary

The parent orchestration chat approved `PP-001` on 2026-06-24. The selected Product meaning now includes title +
note/content search.

Updated demo-support evidence snapshots show:

- Product -> Project -> Work trace
- Cycle Contract boundary
- Node Execution Contract boundary
- Change Tree record for note-content search feedback
- Impact Tree classification for stale/reopened/requires-refresh nodes
- Compatibility review
- Evidence exceptions
- Bounded runtime fixture Evidence

These artifacts are evidence snapshots only. They do not implement a full Todo app, renew Acceptance, or promote
Maintainability Graph.

## Verification Summary

| Check                                  | Evidence status   | Summary                                                                                                                                           |
| -------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| PP-001 user confirmation               | present           | `product-patch-tree.json` records parent orchestration chat approval on 2026-06-24.                                                               |
| Product -> Project -> Work trace       | present           | Product/Project/Work snapshots now reflect title + note/content revision scope.                                                                   |
| Cycle/Node Contract boundary           | present           | `cycle-contract.md` and `node-execution-contracts/wt-search-001.md` bound the expanded scope to title + note/content.                             |
| Change/Impact visibility               | present           | `change-tree.json` and `impact-tree.json` classify decision resolved, runtime fixture Evidence refreshed, and Acceptance waiting for user review. |
| Evidence freshness after note feedback | present / warning | `EV-SEARCH-NOTE-TEST` is present/fresh from the bounded Vitest fixture; UI screenshot/generated graph exceptions remain visible.                  |
| Compatibility mismatch                 | present           | Supplemental compatibility slice demonstrates a real ACEP task-card-only mismatch; selected Todo slice remains not-applicable.                    |
| AI self-report exclusion               | present           | All strengthened evidence points to files and explicit exceptions, not AI self-report.                                                            |

## Remaining Judgment

- Product Patch `PP-001` is confirmed, so the product-meaning decision is resolved.
- Refreshed runtime fixture Evidence for note/content search is present.
- Renewed Acceptance must remain open until the user reviews the refreshed Evidence and remaining warnings.
- Compatibility path is demonstrated by the supplemental mismatch slice, but public-doc cleanup remains deferred.

## Approval Choice

This demo-support evidence pack can be reviewed as strengthened evidence.

Available choices:

- approve the PP-001 confirmation trace as recorded
- approve renewed Acceptance for the representative title + note/content demo-support slice
- request additional UI screenshot/manual review or generated graph/read-model evidence
- keep renewed Acceptance open with warnings
- defer promotion readiness review

## State Label

```text
Review with warning
```

The PP-001 decision is resolved and `EV-SEARCH-NOTE-TEST` is present/fresh from a bounded runtime fixture. Renewed
Acceptance is ready for user review with visible warnings for UI screenshot/manual visual evidence, generated graph
output, and deferred public-doc cleanup.

## Non-Promotion Statement

This Approval Brief does not accept product results, does not close renewed Acceptance, and does not promote
Maintainability Graph.
