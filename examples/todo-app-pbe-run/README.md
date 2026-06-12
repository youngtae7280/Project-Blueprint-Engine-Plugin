# Todo App PBE Run Example

This example shows a small end-to-end PBE run for a Todo app. It is intentionally simple so the traceability is visible.

## Scenario

Initial request:

- Add a todo.
- Complete a todo.
- Delete a todo.
- Keep todos after refresh.

Revision request:

- Completed todos should move to a Completed section instead of disappearing.

## Reading Order

1. [00-before.md](00-before.md)
2. [01-user-request.md](01-user-request.md)
3. [02-project-brief.md](02-project-brief.md)
4. [03-product-tree.md](03-product-tree.md)
5. [04-project-tree.md](04-project-tree.md)
6. [05-work-tree.md](05-work-tree.md)
7. [06-test-tree.md](06-test-tree.md)
8. [07-human-gate-uiux.md](07-human-gate-uiux.md)
9. [08-workgraph.md](08-workgraph.md)
10. [09-verification-design.md](09-verification-design.md)
11. [10-acep-manifest.md](10-acep-manifest.md)
12. [11-review-result.md](11-review-result.md)
13. [12-revision-request.md](12-revision-request.md)
14. [13-revision-pack.md](13-revision-pack.md)
15. [14-final-state.md](14-final-state.md)

## Linkage Summary

```text
Product P-TODO-ADD       -> Work W-TODO-ADD       -> Test T-TODO-ADD       -> Evidence E-TODO-ADD
Product P-TODO-COMPLETE  -> Work W-TODO-COMPLETE  -> Test T-TODO-COMPLETE  -> Evidence E-TODO-COMPLETE
Product P-TODO-DELETE    -> Work W-TODO-DELETE    -> Test T-TODO-DELETE    -> Evidence E-TODO-DELETE
Product P-TODO-PERSIST   -> Work W-TODO-PERSIST   -> Test T-TODO-PERSIST   -> Evidence E-TODO-PERSIST
Change C-COMPLETED-LIST  -> Impact I-COMPLETED-LIST -> Revision R-COMPLETED-LIST
```
