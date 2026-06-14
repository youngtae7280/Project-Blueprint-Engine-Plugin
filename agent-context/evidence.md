# Evidence Context

Use when:

- Execution, review, accept, traceability, or evidence freshness is involved.
- A test passed but proof quality is uncertain.
- Evidence is stale, missing, weak, or not linked.

Do:

- Verify that evidence proves the linked Test and acceptance criteria.
- Keep evidence newer than the linked Product, Work, and Test nodes.
- Use command output for CLI checks.
- Use screenshots or manual result notes for UI behavior and visual state.
- Use document excerpts or rendered previews for document deliverables.
- Record paths and node links clearly.

Do not:

- Treat "checked", "no issue", or "test passed" alone as strong evidence.
- Use stale, superseded, invalidated, obsolete, or rejected evidence as current proof.
- Substitute build/open smoke for visual parity or product behavior proof.
- Attach evidence without linking it to Test/AC/Product/Work nodes.

Escalate / read full docs when:

- Evidence freshness or proof quality is disputed.
- Review or accept is blocked by stale evidence.
- Hardware, UI, visual, or document output requires special proof.

Full references:

- [docs/evidence-quality-rubric.md](../docs/evidence-quality-rubric.md)
