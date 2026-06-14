# Revision Context

Use when:

- User feedback requires bounded changes after review or acceptance.
- Change and Impact flow has started.
- Existing evidence or acceptance may be invalidated.

Do:

- Run revision only after Change and Impact are recorded.
- Check whether Product Patch is needed before changing Product meaning.
- Invalidate or replace affected Evidence when the proven node changed.
- Mark affected Acceptance as needing re-acceptance without deleting history.
- Work only inside affected selected/foundation scope.
- Return to WPD/VD/ACEP/Execution/Review/Accept closure after revision.

Do not:

- Modify accepted/done branches quietly.
- Skip Impact analysis.
- Use old evidence or old acceptance as current closure after affected revision.
- Let Codex accept the result for the user.

Escalate / read full docs when:

- Affected nodes are unclear.
- Product meaning, acceptance criteria, or verification strategy changes.
- Revision scope may spill outside the Impact Tree.

Full references:

- [docs/product-patch-proposals.md](../docs/product-patch-proposals.md)
- [docs/review-failure-recovery.md](../docs/review-failure-recovery.md)
