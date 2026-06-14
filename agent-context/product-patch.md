# Product Patch Context

Use when:

- Feedback changes Product Tree meaning.
- Acceptance criteria, user-visible behavior, selected scope, or verification basis changes.
- A proposed revision would directly edit Product nodes.

Do:

- Use Change -> Impact -> Product Patch Proposal -> user confirmation -> apply.
- Keep the original Product Tree history traceable.
- Require user confirmation before applying Product Patch proposals.
- Link affected Product, Work, Test, Evidence, and Acceptance nodes.

Do not:

- Directly edit product-tree meaning for accepted or reviewed work.
- Apply a Product Patch without a confirmed proposal.
- Hide scope or acceptance changes inside implementation work.
- Treat wording-only changes as safe when they alter behavior or verification.

Escalate / read full docs when:

- It is unclear whether feedback changes meaning or implementation only.
- Acceptance criteria need to be rewritten.
- Migration compatibility or existing accepted work is affected.

Full references:

- [docs/product-patch-proposals.md](../docs/product-patch-proposals.md)
- [docs/migration-policy.md](../docs/migration-policy.md)
