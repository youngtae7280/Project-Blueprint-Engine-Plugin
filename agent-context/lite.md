# Compact Depth Context

Use when:

- The user requests a small bounded slice in an existing project.
- Existing PBE artifacts or a clear local scope already exist.
- The work is low-risk and does not need full ACEP packaging.

This card remains at `agent-context/lite.md` for compatibility with existing context recommendations. Treat `lite` as a
compatibility profile value for compact workflow depth, not as a separate public PBE mode.

Do:

- Remember that compact depth is not bypass.
- Keep mini acceptance criteria, expected files, minimal Test/Evidence, and user-only acceptance.
- Keep File Change Guard active.
- Keep Product -> Work -> Test/Evidence traceability even when reduced.
- Increase to full planning depth when risk grows.

Do not:

- Treat compact depth as permission to skip acceptance criteria.
- Skip user review or user-only acceptance.
- Expand into broad repo conversion.
- Use compact depth for unclear product meaning, visual redesign, architecture runway, permissions, DB/schema, API,
  hardware, concurrency, or repeated rejection.

Escalate / read full docs when:

- The slice touches multiple modules or shared files.
- The user feedback changes product meaning or acceptance criteria.
- File scope cannot be named confidently.

Full references:

- [docs/lite-mode-policy.md](../docs/lite-mode-policy.md)
- [docs/known-limits.md](../docs/known-limits.md)
