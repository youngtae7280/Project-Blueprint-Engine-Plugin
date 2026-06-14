# Review Context

Use when:

- Work is submitted for review.
- The user rejects or questions a result.
- A branch has repeated review failures.

Do:

- Separate implemented, verified, submitted for review, and user accepted.
- Classify rejection before revising.
- Record diagnostic context in Change and Impact notes when feedback changes scope, meaning, UX, acceptance, or verification.
- Use Product Patch when feedback changes product meaning.
- Use visual reference realignment for UI/UX taste mismatch.
- Consider scope reduction when the slice is too broad.

Do not:

- Blindly revise after repeated rejection.
- Mark accepted on behalf of the user.
- Treat review submit as acceptance.
- Reopen broad scope when feedback affects only bounded nodes.

Escalate / read full docs when:

- The failure cause is not clear.
- Feedback changes Product Tree meaning or acceptance criteria.
- Multiple rejected attempts suggest the current plan is wrong.

Full references:

- [docs/review-failure-recovery.md](../docs/review-failure-recovery.md)
- [docs/product-patch-proposals.md](../docs/product-patch-proposals.md)
